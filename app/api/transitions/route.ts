import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createTransition, listTransitions } from "@/lib/db/queries/padel";
import { transitionCreateSchema, transitionListQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/transitions
 * Biblioteca de transiciones del coach (ownerId = sesión). Query:
 * ?limit=1..50&cursor=<ISO> (paginación por cursor G15 sobre `updatedAt`).
 * Retorna { items: TransitionSummary[], nextCursor }.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const query = transitionListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const result = await listTransitions(session!.user.id as string, {
      limit: query.limit,
      cursor: query.cursor,
    });

    return NextResponse.json({ items: result.items, nextCursor: result.nextCursor }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[transitions] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/transitions
 * Crea una transición del coach autenticado (scenario = { initialStepIndex, steps }).
 * Audita CREATE.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = transitionCreateSchema.parse(body);

    const transition = await createTransition({
      ownerId: session!.user.id as string,
      title: validated.title,
      initialStepIndex: validated.initialStepIndex,
      steps: validated.steps,
    });

    await auditCreate(
      "coach_transition",
      transition.id,
      { title: transition.title, stepCount: transition.steps.length },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ transition }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[transitions] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
