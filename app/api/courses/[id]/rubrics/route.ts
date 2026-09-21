import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import {
  assignRubricToCourse,
  getCourseById,
  getRubricById,
  listCourseRubrics,
} from "@/lib/db/queries/padel";
import { courseRubricAssignSchema, padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/courses/[id]/rubrics — rúbricas asignadas al curso (P07 tab).
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
    const detail = await getCourseById(session!.user.id as string, id);
    if (!detail) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const rubrics = await listCourseRubrics(id);
    return NextResponse.json({ rubrics }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]/rubrics] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/courses/[id]/rubrics — asigna rúbrica activa del coach al curso (P08).
 * 400 rúbrica ajena/no active; 404 curso no encontrado; 409 ya asignada (D2).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = courseRubricAssignSchema.parse(body);

    const detail = await getCourseById(session!.user.id as string, id);
    if (!detail) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const rubric = await getRubricById(session!.user.id as string, validated.rubricId);
    if (!rubric || rubric.rubric.status !== 'active') {
      return NextResponse.json({ error: "Rúbrica no encontrada o no activa" }, { status: 400 });
    }

    // D2: re-asignar la misma rúbrica → 409 (pre-check antes del insert; el
    // UNIQUE(courseId, rubricId) en DB respalda como red de seguridad).
    const existing = await listCourseRubrics(id);
    if (existing.some((r) => r.rubricId === validated.rubricId)) {
      return NextResponse.json({ error: "La rúbrica ya está asignada a este curso" }, { status: 409 });
    }

    try {
      const assignment = await assignRubricToCourse(id, validated.rubricId, session!.user.id as string);
      await auditCreate(
        "course_rubric",
        assignment.id,
        { courseId: id, rubricId: validated.rubricId },
        { userId: session!.user.id, ...extractRequestContext(request) }
      );
      return NextResponse.json({ assignment }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: "La rúbrica ya está asignada a este curso" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]/rubrics] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}