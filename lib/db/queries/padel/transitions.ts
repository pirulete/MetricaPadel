import { db } from "@/lib/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { coachTransitions } from "@/lib/db/schema";
import { COURT_DEPTH_M, COURT_WIDTH_M } from "@/lib/padel/court/types";
import type { PaginatedResult, PaginationParams } from "./pagination";
import { resolveLimit } from "./pagination";

export type TransitionPoint = { x: number; y: number };

export type TransitionShot = {
  control: TransitionPoint;
  to: TransitionPoint;
  label: string;
} | null;

export type TransitionStep = {
  id: number;
  label: string;
  positions: Record<"A" | "B" | "C" | "D", TransitionPoint>;
  shot: TransitionShot;
};

export type TransitionScenario = {
  initialStepIndex: number;
  steps: TransitionStep[];
};

/** Fila desnormalizada que consume la API (`scenario` jsonb → campos planos). */
export type TransitionDto = {
  id: string;
  title: string;
  initialStepIndex: number;
  steps: TransitionStep[];
  createdAt: string;
  updatedAt: string;
};

/** Resumen de listado: no parsea `steps` (sólo `stepCount` calculado en SQL, F11). */
export type TransitionSummary = {
  id: string;
  title: string;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateTransitionInput = {
  ownerId: string;
  title: string;
  initialStepIndex: number;
  steps: TransitionStep[];
};

export type UpdateTransitionInput = {
  title: string;
  initialStepIndex: number;
  steps: TransitionStep[];
};

// Lectura defensiva del jsonb (F10/D-15): se declara local para no acoplar la
// capa de queries a la de request (`lib/validations/padel.ts`). Mantener en sync
// con `transitionScenarioSchema` si cambia la forma de `TransitionStep`.
const storedPointSchema = z.object({
  x: z.number().min(0).max(COURT_WIDTH_M),
  y: z.number().min(0).max(COURT_DEPTH_M),
});

const storedShotSchema = z
  .object({
    control: storedPointSchema,
    to: storedPointSchema,
    label: z.string(),
  })
  .nullable();

const storedScenarioSchema = z.object({
  initialStepIndex: z.number().int().min(0),
  steps: z
    .array(
      z.object({
        id: z.number().int().min(1),
        label: z.string(),
        positions: z.object({
          A: storedPointSchema,
          B: storedPointSchema,
          C: storedPointSchema,
          D: storedPointSchema,
        }),
        shot: storedShotSchema,
      }),
    )
    .min(1)
    .max(50),
});

const stepCountExpr = sql<number>`COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)::int`;

function toDto(
  row: typeof coachTransitions.$inferSelect,
  scenario: TransitionScenario,
): TransitionDto {
  return {
    id: row.id,
    title: row.title,
    initialStepIndex: scenario.initialStepIndex,
    steps: scenario.steps,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Biblioteca de transiciones del coach (paginación G15 por `updatedAt` desc).
 * Anti-IDOR: `ownerId` siempre de la sesión; nunca filtra por otro coach.
 */
export async function listTransitions(
  ownerId: string,
  params?: PaginationParams,
): Promise<PaginatedResult<TransitionSummary>> {
  const limit = resolveLimit(params?.limit);
  const conditions = [eq(coachTransitions.ownerId, ownerId)];
  if (params?.cursor) {
    conditions.push(lt(coachTransitions.updatedAt, new Date(params.cursor)));
  }

  const rows = await db
    .select({
      id: coachTransitions.id,
      title: coachTransitions.title,
      stepCount: stepCountExpr,
      createdAt: coachTransitions.createdAt,
      updatedAt: coachTransitions.updatedAt,
    })
    .from(coachTransitions)
    .where(and(...conditions))
    .orderBy(desc(coachTransitions.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    nextCursor: hasMore && last ? last.updatedAt.toISOString() : null,
  };
}

/** Crea una transición del coach autenticado (`scenario` = {initialStepIndex, steps}). */
export async function createTransition(data: CreateTransitionInput): Promise<TransitionDto> {
  const scenario: TransitionScenario = {
    initialStepIndex: data.initialStepIndex,
    steps: data.steps,
  };
  const [row] = await db
    .insert(coachTransitions)
    .values({ ownerId: data.ownerId, title: data.title, scenario })
    .returning();
  return toDto(row, scenario);
}

/**
 * Lectura por owner (anti-IDOR). Fila ajena/inexistente → `null` (→ 404).
 * F10: si el jsonb guardado no valida, también `null` (nunca 500 por datos corruptos).
 */
export async function getTransitionById(
  ownerId: string,
  id: string,
): Promise<TransitionDto | null> {
  const [row] = await db
    .select()
    .from(coachTransitions)
    .where(and(eq(coachTransitions.id, id), eq(coachTransitions.ownerId, ownerId)))
    .limit(1);
  if (!row) return null;

  const parsed = storedScenarioSchema.safeParse(row.scenario);
  if (!parsed.success) return null;

  return toDto(row, parsed.data as TransitionScenario);
}

/** Reemplazo completo (PUT). `.returning()` vacío (ajena/inexistente) → `null` → 404. */
export async function updateTransition(
  ownerId: string,
  id: string,
  data: UpdateTransitionInput,
): Promise<TransitionDto | null> {
  const scenario: TransitionScenario = {
    initialStepIndex: data.initialStepIndex,
    steps: data.steps,
  };
  const [row] = await db
    .update(coachTransitions)
    .set({ title: data.title, scenario, updatedAt: new Date() })
    .where(and(eq(coachTransitions.id, id), eq(coachTransitions.ownerId, ownerId)))
    .returning();
  if (!row) return null;
  return toDto(row, scenario);
}

/**
 * Hard delete por owner. Devuelve la fila borrada (el route handler la usa para
 * `auditDelete`, con `stepCount` derivado por `safeParse`), `null` si no era suya.
 */
export async function deleteTransition(
  ownerId: string,
  id: string,
): Promise<typeof coachTransitions.$inferSelect | null> {
  const [row] = await db
    .delete(coachTransitions)
    .where(and(eq(coachTransitions.id, id), eq(coachTransitions.ownerId, ownerId)))
    .returning();
  return row ?? null;
}
