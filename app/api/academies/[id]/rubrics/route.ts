import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAcademyAdmin, guardAcademyCoach } from "@/lib/auth/academy-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import {
  createInstitutionalRubric,
  listInstitutionalRubrics,
} from "@/lib/db/queries/padel/academies";
import { academyRubricCreateSchema } from "@/lib/validations/academy";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/academies/[id]/rubrics
 * Lista rúbricas institucionales de la academia (guardAcademyCoach).
 * Solo scope=institutional de esa academia.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyCoach(session, id);
    if (guardError) return guardError;

    const rubrics = await listInstitutionalRubrics(id);
    return NextResponse.json({ rubrics }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/rubrics] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/academies/[id]/rubrics
 * Crea rúbrica institucional (guardAcademyAdmin). El handler fuerza
 * scope=institutional y academyId=ruta. Audita CREATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyAdmin(session, id);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = academyRubricCreateSchema.parse(body);

    const result = await createInstitutionalRubric(id, session!.user.id as string, {
      title: validated.title,
      category: validated.category,
      criteria: validated.criteria,
    });

    await auditCreate(
      "rubric",
      result.rubric.id,
      {
        title: validated.title,
        category: validated.category,
        scope: "institutional",
        academyId: id,
        criteriaCount: validated.criteria.length,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ rubric: result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/rubrics] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}