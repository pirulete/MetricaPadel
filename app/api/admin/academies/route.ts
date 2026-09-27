import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { listAllAcademies } from "@/lib/db/queries/padel";

export const runtime = "nodejs";

/**
 * GET /api/admin/academies
 * Lista TODAS las academias (activas y archivadas) con owner y métricas
 * (memberCount, rubricCount). Visibilidad global de plataforma (D6) — no
 * colisiona con GET /api/academies (guardUser, membresías del usuario).
 * Exclusivo de SUPER_ADMIN. Sin auditoría (lectura).
 */
export async function GET() {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const academies = await listAllAcademies();
    return NextResponse.json({ academies }, { status: 200 });
  } catch (error) {
    console.error("[admin/academies] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}