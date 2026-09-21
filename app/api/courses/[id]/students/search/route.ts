import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { getCourseById, searchCourseCandidates } from "@/lib/db/queries/padel";
import { courseStudentSearchQuerySchema, padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/courses/[id]/students/search?q= — candidatos a agregar al curso (G12).
 * Usuarios role USER + ACTIVE no inscritos, ILIKE por email/nombre, limit 20.
 * 404 curso ajeno/inexistente (anti-IDOR). Solo lectura, sin auditoría.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const { q } = courseStudentSearchQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const detail = await getCourseById(session!.user.id as string, id);
    if (!detail) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const candidates = await searchCourseCandidates(id, q);
    return NextResponse.json({ candidates }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]/students/search] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}