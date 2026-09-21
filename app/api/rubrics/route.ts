import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createRubric, listRubrics } from "@/lib/db/queries/padel";
import { rubricCreateSchema, rubricListQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/rubrics
 * Lista rúbricas del coach (ownerId = sesión). Query: ?status=draft|active|archived.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const query = rubricListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const rubrics = await listRubrics(session!.user.id as string, query.status);
    return NextResponse.json({ rubrics }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[rubrics] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/rubrics
 * Crea rúbrica con 4 niveles fijos + criteria + descriptors (transacción).
 * Audita CREATE.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = rubricCreateSchema.parse(body);

    const result = await createRubric({
      ownerId: session!.user.id as string,
      title: validated.title,
      category: validated.category,
      criteria: validated.criteria,
    });

    await auditCreate(
      "rubric",
      result.rubric.id,
      { title: validated.title, category: validated.category, criteriaCount: validated.criteria.length },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ rubric: result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[rubrics] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}