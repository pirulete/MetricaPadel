import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { archiveTournament, getTournamentById } from "@/lib/db/queries/torneos";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/torneos/[id]/archive — soft archive (§6.7).
 *
 * 404 torneo ajeno/inexistente (anti-IDOR) · 409 si ya está archivado (EC-13) ·
 * 200 `{ archived: true }`. Nunca DELETE: la instancia y los slots históricos
 * siguen consultables. Auditoría `auditUpdate('tournament', …)`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const ownerId = session!.user.id as string;

    const tournament = await getTournamentById(id, ownerId);
    if (!tournament) {
      return NextResponse.json(
        { error: "Torneo no encontrado" },
        { status: 404 },
      );
    }

    const archived = await archiveTournament(id, ownerId);
    if (!archived.ok) {
      return NextResponse.json(
        {
          error: "El torneo ya está archivado",
          code: "already_archived",
        },
        { status: 409 },
      );
    }

    await auditUpdate(
      "tournament",
      id,
      { status: tournament.status },
      { status: "archived" },
      { userId: ownerId, ...extractRequestContext(request) },
    );

    return NextResponse.json({ archived: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos/[id]/archive] Error en POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
