import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { listStudentEvolution } from "@/lib/db/queries/padel";
import { computeTrend, groupByCategory } from "@/lib/padel/evolution";

export const runtime = "nodejs";

/**
 * GET /api/student/evolution
 * Evolución del alumno (G7): evaluaciones publicadas agrupadas por categoría
 * con tendencia (up/down/stable) entre la última y la anterior. Scoped al
 * studentId de la sesión (anti-IDOR). Solo USER + ACTIVE.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (session!.user.role !== "USER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const items = await listStudentEvolution(session!.user.id as string);
    const groups = groupByCategory(items);

    const evolution = Object.entries(groups).map(([category, evaluations]) => ({
      category,
      trend: computeTrend(evaluations.map((e) => e.totalScore ?? 0)),
      items: evaluations,
    }));

    return NextResponse.json({ evolution }, { status: 200 });
  } catch (error) {
    console.error("[student/evolution] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}