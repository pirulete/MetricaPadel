import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { getTournamentDetail } from "@/lib/db/queries/torneos";
import {
  getActiveRun,
  getCurrentRun,
  reapStaleRuns,
} from "@/lib/db/queries/torneos/runs";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torneos/[id] — detalle del torneo (counts + bloques + runs).
 *
 * Anti-IDOR: `getTournamentDetail(id, ownerId)` → `null` si el torneo no existe
 * o es de otro coach ⇒ 404 (nunca 403, no se filtra la existencia).
 *
 * Efecto lateral barato: reaper perezoso de runs vencidos (§4.4). El re-despacho
 * de los `redispatched` es responsabilidad de `lib/torneos/dispatch.ts` (F3a).
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
    const ownerId = session!.user.id as string;
    const detail = await getTournamentDetail(id, ownerId);
    if (!detail) {
      return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
    }

    await reapStaleRuns(id);
    // `currentRun` = último `succeeded|invalid` por query directa (O-m6, §a.8):
    // no se deriva de una ventana de N filas. `counts` no incluye `courts`
    // (vive en `tournament.courts`, `technical-design-v2` §a.3).
    const [activeRun, currentRun] = await Promise.all([
      getActiveRun(id),
      getCurrentRun(id),
    ]);

    const { tournament } = detail;
    return NextResponse.json(
      {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
          courts: tournament.courts,
          blockMinutes: tournament.blockMinutes,
          params: tournament.params,
          createdAt: tournament.createdAt,
          updatedAt: tournament.updatedAt,
        },
        counts: detail.counts,
        blocks: detail.blocks.map((block) => ({
          idx: block.idx,
          dayLabel: block.dayLabel,
          startTime: block.startTime,
          phase: block.phase,
          isExtension: block.isExtension,
          capacity: block.capacity,
        })),
        activeRun,
        currentRun,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos/[id]] Error en GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
