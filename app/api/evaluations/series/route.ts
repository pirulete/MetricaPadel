import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { listEvaluationSeries } from "@/lib/db/queries/padel";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  studentId: z.string().uuid(),
  rubricId: z.string().uuid(),
});

/**
 * GET /api/evaluations/series
 * Serie de evaluaciones del coach (G6): draft + published de un alumno con una
 * rúbrica, ordenada por version ASC NULLS LAST. Anti-IDOR: la query scopa por
 * teacherId (sesión) → retorna [] si el alumno/rúbrica no pertenece al coach.
 */
export async function GET(request: Request) {
  const session = await auth();
  const guardError = guardAdmin(session);
  if (guardError) return guardError;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    studentId: searchParams.get("studentId"),
    rubricId: searchParams.get("rubricId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const series = await listEvaluationSeries(
    session!.user.id as string,
    parsed.data.studentId,
    parsed.data.rubricId
  );

  return NextResponse.json({ series });
}