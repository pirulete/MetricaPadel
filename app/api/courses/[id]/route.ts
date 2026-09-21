import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  archiveCourse,
  getCourseById,
  updateCourse,
} from "@/lib/db/queries/padel";
import { courseUpdateSchema, padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/courses/[id] — detalle de curso (P07): course + students + rubrics.
 * Ownership roto → 404 (anti-IDOR).
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

    return NextResponse.json({ course: detail }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/courses/[id] — actualiza campos parciales (nombre/nivel/horario/días).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = courseUpdateSchema.parse(body);

    const existing = await getCourseById(session!.user.id as string, id);
    if (!existing) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const course = await updateCourse(session!.user.id as string, id, validated);
    if (!course) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    await auditUpdate(
      "course",
      id,
      { name: existing.course.name, level: existing.course.level },
      { name: course.name, level: course.level },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ course }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/courses/[id] — archiva curso (soft, D7). Nunca hard delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const course = await archiveCourse(session!.user.id as string, id);
    if (!course) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    await auditDelete(
      "course",
      id,
      { name: course.name, status: course.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ course: { id: course.id, status: course.status } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}