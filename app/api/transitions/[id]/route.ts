import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { deleteTransition, getTransitionById, updateTransition } from "@/lib/db/queries/padel";
import { padelIdParamsSchema, transitionCreateSchema, transitionScenarioSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/transitions/[id]
 * Detalle completo de una transición del coach (ownerId = sesión).
 * 404 si no existe, es ajena (anti-IDOR) o el `scenario` guardado no valida (F10).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const transition = await getTransitionById(session!.user.id as string, id);
    if (!transition) {
      return NextResponse.json({ error: "Transición no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ transition }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[transitions/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/transitions/[id]
 * Reemplazo completo (title + initialStepIndex + steps, D-06). La autorización
 * vive en el `where(and(id, ownerId)).returning()` de `updateTransition` → 404.
 * La lectura previa es SÓLO para `oldValues` de la auditoría (F4, 5 args).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const ownerId = session!.user.id as string;
    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = transitionCreateSchema.parse(body);

    const previous = await getTransitionById(ownerId, id);
    if (!previous) {
      return NextResponse.json({ error: "Transición no encontrada" }, { status: 404 });
    }

    const transition = await updateTransition(ownerId, id, {
      title: validated.title,
      initialStepIndex: validated.initialStepIndex,
      steps: validated.steps,
    });
    if (!transition) {
      return NextResponse.json({ error: "Transición no encontrada" }, { status: 404 });
    }

    await auditUpdate(
      "coach_transition",
      id,
      { title: previous.title, stepCount: previous.steps.length },
      { title: transition.title, stepCount: transition.steps.length },
      { userId: ownerId, ...extractRequestContext(request) }
    );

    return NextResponse.json({ transition }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[transitions/[id]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/transitions/[id]
 * Hard delete por owner (`.returning()` vacío → 404). El `scenario` se
 * re-valida sólo para derivar `stepCount` en la auditoría (F10: corrupto ⇒ 0).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const ownerId = session!.user.id as string;
    const { id } = padelIdParamsSchema.parse(await params);

    const deleted = await deleteTransition(ownerId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Transición no encontrada" }, { status: 404 });
    }

    const parsed = transitionScenarioSchema.safeParse(deleted.scenario);

    await auditDelete(
      "coach_transition",
      id,
      { title: deleted.title, stepCount: parsed.success ? parsed.data.steps.length : 0 },
      { userId: ownerId, ...extractRequestContext(request) }
    );

    return NextResponse.json({ deleted: true, id }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[transitions/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
