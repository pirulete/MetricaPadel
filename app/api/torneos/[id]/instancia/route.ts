import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { buildInstance } from "@/lib/db/queries/torneos/instance";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torneos/[id]/instancia — espejo canónico de la instancia (AC-04).
 *
 * Reconstruye desde DB el mismo objeto que consume el motor (bloques con
 * `capacity`, parejas con `bloqueados`, personas con sus parejas y partidos con
 * `gruposOrigen`/`alimentadores`) para que el coach audite el import y pueda
 * exportar-corregir-reimportar.
 *
 * Anti-IDOR: `buildInstance` filtra por `ownerId` ⇒ ajeno/inexistente = 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const instancia = await buildInstance(id, session!.user.id as string);
    if (!instancia) {
      return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ instancia }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos/[id]/instancia] Error en GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
