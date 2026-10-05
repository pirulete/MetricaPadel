import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { listActiveAcademies } from "@/lib/db/queries/padel/super-admin";

export const runtime = "nodejs";

/**
 * GET /api/academy-requests/available-academies
 * Lista academias ACTIVAS {id, name, slug} para el selector del modal de
 * solicitud join (guardAdmin = coach global). Sin auditoría (lectura).
 */
export async function GET() {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const academies = await listActiveAcademies();
    return NextResponse.json({ academies }, { status: 200 });
  } catch (error) {
    console.error("[academy-requests/available-academies] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}