import { db } from "@/lib/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  rubrics,
  rubricLevels,
  rubricCriteria,
  rubricDescriptors,
  academyMemberships,
  rubricCategoryEnum,
  rubricStatusEnum,
  rubricScopeEnum,
} from "@/lib/db/schema";

export type RubricStatus = (typeof rubricStatusEnum.enumValues)[number];
export type RubricCategory = (typeof rubricCategoryEnum.enumValues)[number];
export type RubricScope = (typeof rubricScopeEnum.enumValues)[number];

/** Resultado de mutación con acceso extendido (institucional): distingue 403
 *  (COACH con membresía) de 404 (sin membresía o rúbrica inexistente). */
export type RubricMutationResult =
  | { ok: true; rubric: typeof rubrics.$inferSelect }
  | { ok: false; reason: "not_found" | "forbidden" };

export type RubricWithDetails = {
  rubric: typeof rubrics.$inferSelect;
  levels: Array<typeof rubricLevels.$inferSelect>;
  criteria: Array<typeof rubricCriteria.$inferSelect>;
  descriptors: Array<typeof rubricDescriptors.$inferSelect>;
};

export type CreateRubricInput = {
  ownerId: string;
  title: string;
  category: RubricCategory;
  /** Mínimo 1 criterio; cada uno con exactamente 4 descriptores (niveles fijos). */
  criteria: Array<{ name: string; descriptors: string[] }>;
  /** Rúbrica institucional (SPEC-EPIC-01): academyId + scope=institutional. */
  academyId?: string | null;
  scope?: RubricScope;
};

export type UpdateRubricInput = {
  title?: string;
  category?: RubricCategory;
  status?: "draft" | "active" | "archived";
  /** Reemplazo completo de criteria/descriptors (se borran y recrean). */
  criteria?: Array<{ name: string; descriptors: string[] }>;
};

// Escala fija de Etapa 1 (D8): Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1.
export const DEFAULT_RUBRIC_LEVELS = [
  { name: "Excelente", score: 4, sortOrder: 0 },
  { name: "Bueno", score: 3, sortOrder: 1 },
  { name: "Aceptable", score: 2, sortOrder: 2 },
  { name: "En desarrollo", score: 1, sortOrder: 3 },
] as const;

/**
 * Crea rúbrica + niveles fijos (4) + criteria + descriptors en una transacción.
 * Ownership: ownerId = coach (ADMIN). Si academyId/scope vienen, crea rúbrica
 * institucional (SPEC-EPIC-01).
 */
export async function createRubric(data: CreateRubricInput): Promise<RubricWithDetails> {
  return await db.transaction(async (tx) => {
    const [rubric] = await tx.insert(rubrics).values({
      ownerId: data.ownerId,
      title: data.title,
      category: data.category,
      status: 'draft',
      academyId: data.academyId ?? null,
      scope: data.scope ?? 'personal',
    }).returning();

    const levels = await tx.insert(rubricLevels)
      .values(DEFAULT_RUBRIC_LEVELS.map((l) => ({ rubricId: rubric.id, ...l })))
      .returning();

    const criteria: Array<typeof rubricCriteria.$inferSelect> = [];
    const descriptors: Array<typeof rubricDescriptors.$inferSelect> = [];

    for (let i = 0; i < data.criteria.length; i++) {
      const [criterion] = await tx.insert(rubricCriteria).values({
        rubricId: rubric.id,
        name: data.criteria[i].name,
        sortOrder: i,
      }).returning();
      criteria.push(criterion);

      for (let j = 0; j < levels.length; j++) {
        const [descriptor] = await tx.insert(rubricDescriptors).values({
          criteriaId: criterion.id,
          levelId: levels[j].id,
          text: data.criteria[i].descriptors[j],
        }).returning();
        descriptors.push(descriptor);
      }
    }

    return { rubric, levels, criteria, descriptors };
  });
}

/**
 * Acceso de LECTURA a una rúbrica: personal → ownerId; institucional → membresía
 * activa (COACH+) en la academia. Retorna false → 404 (anti-IDOR).
 */
async function canAccessRubric(
  userId: string,
  rubric: { scope: RubricScope; academyId: string | null; ownerId: string }
): Promise<boolean> {
  if (rubric.scope === 'institutional' && rubric.academyId) {
    const membership = await db.query.academyMemberships.findFirst({
      where: and(
        eq(academyMemberships.academyId, rubric.academyId),
        eq(academyMemberships.userId, userId),
        eq(academyMemberships.status, 'active'),
      ),
    });
    return Boolean(membership);
  }
  return rubric.ownerId === userId;
}

/**
 * Acceso de MUTACIÓN a una rúbrica: personal → ownerId (404 si ajeno);
 * institucional → OWNER/ADMIN de la academia (403 para COACH, 404 sin membresía).
 */
async function canMutateRubric(
  userId: string,
  rubric: { scope: RubricScope; academyId: string | null; ownerId: string }
): Promise<"ok" | "not_found" | "forbidden"> {
  if (rubric.scope === 'institutional' && rubric.academyId) {
    const membership = await db.query.academyMemberships.findFirst({
      where: and(
        eq(academyMemberships.academyId, rubric.academyId),
        eq(academyMemberships.userId, userId),
        eq(academyMemberships.status, 'active'),
      ),
    });
    if (!membership) return 'not_found';
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') return 'forbidden';
    return 'ok';
  }
  if (rubric.ownerId !== userId) return 'not_found';
  return 'ok';
}

/**
 * Detalle completo de una rúbrica (rubric + levels + criteria + descriptors).
 * Acceso: personal → owner; institucional → miembro activo (COACH+). Retorna
 * null si no existe o no tiene acceso (404, no 403).
 */
export async function getRubricById(userId: string, id: string): Promise<RubricWithDetails | null> {
  const rubric = await db.query.rubrics.findFirst({
    where: eq(rubrics.id, id),
  });
  if (!rubric) return null;
  if (!(await canAccessRubric(userId, rubric))) return null;

  const criteria = await db.query.rubricCriteria.findMany({
    where: eq(rubricCriteria.rubricId, id),
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });
  const criteriaIds = criteria.map((c) => c.id);

  const [levels, descriptors] = await Promise.all([
    db.query.rubricLevels.findMany({
      where: eq(rubricLevels.rubricId, id),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    }),
    criteriaIds.length > 0
      ? db.query.rubricDescriptors.findMany({
          where: inArray(rubricDescriptors.criteriaId, criteriaIds),
        })
      : Promise.resolve([]),
  ]);

  return { rubric, levels, criteria, descriptors };
}

/**
 * Lista rúbricas del owner con counts de criteria/levels (para P02 biblioteca).
 * status opcional: 'active' | 'archived' | 'draft'.
 */
export async function listRubrics(ownerId: string, status?: RubricStatus) {
  const conditions = [eq(rubrics.ownerId, ownerId)];
  if (status) conditions.push(eq(rubrics.status, status));

  return await db
    .select({
      id: rubrics.id,
      title: rubrics.title,
      category: rubrics.category,
      status: rubrics.status,
      createdAt: rubrics.createdAt,
      updatedAt: rubrics.updatedAt,
      criteriaCount: sql<number>`count(distinct ${rubricCriteria.id})::int`,
      levelCount: sql<number>`count(distinct ${rubricLevels.id})::int`,
    })
    .from(rubrics)
    .leftJoin(rubricCriteria, eq(rubricCriteria.rubricId, rubrics.id))
    .leftJoin(rubricLevels, eq(rubricLevels.rubricId, rubrics.id))
    .where(and(...conditions))
    .groupBy(rubrics.id)
    .orderBy(desc(rubrics.createdAt));
}

/**
 * Actualiza rúbrica (title/category) y, si viene criteria, reemplaza el set
 * completo de criteria/descriptors (delete + reinsert en transacción).
 * Acceso: personal → owner (404); institucional → OWNER/ADMIN (403 COACH).
 */
export async function updateRubric(userId: string, id: string, data: UpdateRubricInput): Promise<RubricMutationResult> {
  const rubric = await db.query.rubrics.findFirst({ where: eq(rubrics.id, id) });
  if (!rubric) return { ok: false, reason: 'not_found' };
  const access = await canMutateRubric(userId, rubric);
  if (access !== 'ok') return { ok: false, reason: access };

  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(rubrics)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(rubrics.id, id))
      .returning();

    if (data.criteria) {
      // Delete criteria (cascade borra descriptors) y recrea el set completo.
      await tx.delete(rubricCriteria).where(eq(rubricCriteria.rubricId, id));

      const levels = await tx.select().from(rubricLevels)
        .where(eq(rubricLevels.rubricId, id))
        .orderBy(asc(rubricLevels.sortOrder));

      for (let i = 0; i < data.criteria.length; i++) {
        const [criterion] = await tx.insert(rubricCriteria).values({
          rubricId: id,
          name: data.criteria[i].name,
          sortOrder: i,
        }).returning();

        for (let j = 0; j < levels.length; j++) {
          await tx.insert(rubricDescriptors).values({
            criteriaId: criterion.id,
            levelId: levels[j].id,
            text: data.criteria[i].descriptors[j],
          });
        }
      }
    }

    return { ok: true, rubric: updated };
  });
}

/**
 * Archiva rúbrica (soft, status=archived). Nunca hard delete: las evaluaciones
 * la referencian. Acceso: personal → owner (404); institucional → OWNER/ADMIN
 * (403 COACH).
 */
export async function archiveRubric(userId: string, id: string): Promise<RubricMutationResult> {
  const rubric = await db.query.rubrics.findFirst({ where: eq(rubrics.id, id) });
  if (!rubric) return { ok: false, reason: 'not_found' };
  const access = await canMutateRubric(userId, rubric);
  if (access !== 'ok') return { ok: false, reason: access };

  const [row] = await db.update(rubrics)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(rubrics.id, id))
    .returning();
  return { ok: true, rubric: row };
}