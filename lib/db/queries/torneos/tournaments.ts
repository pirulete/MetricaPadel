import { db } from "@/lib/db";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  tournamentBlocks,
  tournamentCategories,
  tournamentGroups,
  tournamentMatches,
  tournamentTeams,
  tournaments,
} from "@/lib/db/schema";
import type { TournamentPhase, TournamentStatus } from "@/lib/db/schema";
import type { PaginatedResult, PaginationParams } from "../padel/pagination";
import { resolveLimit } from "../padel/pagination";

/**
 * Torneos (M1). Ownership anti-IDOR: TODA query de lectura/escritura recibe
 * `ownerId` en el WHERE; un recurso ajeno retorna `null` ⇒ el route handler
 * responde 404 (nunca 403, no se filtra la existencia del torneo).
 */

export type Tournament = typeof tournaments.$inferSelect;
export type TournamentBlock = typeof tournamentBlocks.$inferSelect;

/** Ejecutor de query: permite reutilizar builders dentro de `db.transaction`. */
type QueryExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreateTournamentInput = {
  ownerId: string;
  name: string;
  /** `YYYY-MM-DD` (columna `date` en modo string: nunca `Date`). */
  startDate: string;
  endDate: string;
  courts: number;
  /** Default 75 (valor del prototipo). */
  blockMinutes?: number;
  params?: Record<string, unknown>;
};

export type TournamentSummary = {
  id: string;
  name: string;
  status: TournamentStatus;
  startDate: string;
  endDate: string;
  courts: number;
  blockMinutes: number;
  updatedAt: Date;
  counts: { categories: number; teams: number; matches: number };
};

export type TournamentCounts = {
  blocks: number;
  categories: number;
  groups: number;
  teams: number;
  matches: number;
  matchesPrevia: number;
  matchesFinal: number;
};

export type TournamentDetail = {
  tournament: Tournament;
  counts: TournamentCounts;
  blocks: TournamentBlock[];
};

/**
 * Conteo correlacionado por `tournament_id` con un `id` ya conocido: 1 sola
 * query de agregados en lugar de N count(*) (evita el producto cartesiano de
 * left joins múltiples).
 */
function countOf(table: PgTable, fk: AnyPgColumn, tournamentId: string) {
  return sql<number>`(select count(*)::int from ${table} where ${fk} = ${tournamentId})`;
}

function countOfPhase(tournamentId: string, phase: TournamentPhase) {
  return sql<number>`(select count(*)::int from ${tournamentMatches} where ${tournamentMatches.tournamentId} = ${tournamentId} and ${tournamentMatches.phase} = ${phase})`;
}

/**
 * Inserta la fila del torneo en estado `draft`. Acepta un `executor` para
 * usarse dentro de la transacción de import (F0b import.ts); por defecto usa
 * el `db` global.
 */
export async function createTournament(
  data: CreateTournamentInput,
  executor: QueryExecutor = db,
) {
  const [row] = await executor
    .insert(tournaments)
    .values({
      ownerId: data.ownerId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      courts: data.courts,
      blockMinutes: data.blockMinutes ?? 75,
      params: data.params ?? {},
      status: "draft",
    })
    .returning();
  return row;
}

/**
 * Lista torneos del coach con counts resumidos (cards de `/torneos`).
 * Cursor G15 sobre `updatedAt` (mismo campo del `orderBy`), `limit + 1` para
 * `hasMore`, `nextCursor` = ISO del último item.
 */
export async function listTournaments(
  ownerId: string,
  params?: PaginationParams,
): Promise<PaginatedResult<TournamentSummary>> {
  const limit = resolveLimit(params?.limit);
  const conditions = [eq(tournaments.ownerId, ownerId)];
  if (params?.cursor) {
    conditions.push(lt(tournaments.updatedAt, new Date(params.cursor)));
  }

  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      startDate: tournaments.startDate,
      endDate: tournaments.endDate,
      courts: tournaments.courts,
      blockMinutes: tournaments.blockMinutes,
      updatedAt: tournaments.updatedAt,
    })
    .from(tournaments)
    .where(and(...conditions))
    .orderBy(desc(tournaments.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await attachCounts(page);
  const nextCursor = hasMore && page.length > 0
    ? page[page.length - 1].updatedAt.toISOString()
    : null;

  return { items, nextCursor };
}

/** Counts en 3 queries agrupadas (no N+1, no producto cartesiano de joins). */
async function attachCounts(
  rows: Array<Omit<TournamentSummary, "counts">>,
): Promise<TournamentSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [categories, teams, matches] = await Promise.all([
    db
      .select({
        tournamentId: tournamentCategories.tournamentId,
        n: sql<number>`count(*)::int`,
      })
      .from(tournamentCategories)
      .where(inArray(tournamentCategories.tournamentId, ids))
      .groupBy(tournamentCategories.tournamentId),
    db
      .select({
        tournamentId: tournamentTeams.tournamentId,
        n: sql<number>`count(*)::int`,
      })
      .from(tournamentTeams)
      .where(inArray(tournamentTeams.tournamentId, ids))
      .groupBy(tournamentTeams.tournamentId),
    db
      .select({
        tournamentId: tournamentMatches.tournamentId,
        n: sql<number>`count(*)::int`,
      })
      .from(tournamentMatches)
      .where(inArray(tournamentMatches.tournamentId, ids))
      .groupBy(tournamentMatches.tournamentId),
  ]);

  const toMap = (list: Array<{ tournamentId: string; n: number }>) =>
    new Map(list.map((row) => [row.tournamentId, row.n]));
  const categoryMap = toMap(categories);
  const teamMap = toMap(teams);
  const matchMap = toMap(matches);

  return rows.map((row) => ({
    ...row,
    counts: {
      categories: categoryMap.get(row.id) ?? 0,
      teams: teamMap.get(row.id) ?? 0,
      matches: matchMap.get(row.id) ?? 0,
    },
  }));
}

/**
 * Fila del torneo scoped al owner, sin joins. Retorna `null` si no existe o
 * pertenece a otro coach ⇒ 404 anti-IDOR.
 */
export async function getTournamentById(
  id: string,
  ownerId: string,
): Promise<Tournament | null> {
  const [row] = await db
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, id), eq(tournaments.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/**
 * Detalle (`GET /api/torneos/[id]`): torneo + counts agregados + bloques
 * ordenados por `idx`. `null` ⇒ 404 anti-IDOR.
 */
export async function getTournamentDetail(
  id: string,
  ownerId: string,
): Promise<TournamentDetail | null> {
  const tournament = await getTournamentById(id, ownerId);
  if (!tournament) return null;

  const [countsRow] = await db
    .select({
      blocks: countOf(tournamentBlocks, tournamentBlocks.tournamentId, id),
      categories: countOf(tournamentCategories, tournamentCategories.tournamentId, id),
      groups: countOf(tournamentGroups, tournamentGroups.tournamentId, id),
      teams: countOf(tournamentTeams, tournamentTeams.tournamentId, id),
      matches: countOf(tournamentMatches, tournamentMatches.tournamentId, id),
      matchesPrevia: countOfPhase(id, "previa"),
      matchesFinal: countOfPhase(id, "final"),
    })
    .from(tournaments)
    .where(eq(tournaments.id, id));

  const blocks = await db
    .select()
    .from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id))
    .orderBy(asc(tournamentBlocks.idx));

  return {
    tournament,
    counts: countsRow ?? {
      blocks: 0,
      categories: 0,
      groups: 0,
      teams: 0,
      matches: 0,
      matchesPrevia: 0,
      matchesFinal: 0,
    },
    blocks,
  };
}

export type ArchiveTournamentResult =
  | { ok: true; tournament: Tournament }
  | { ok: false; reason: "not_found" | "already_archived" };

/**
 * Soft archive (nunca DELETE en M1). `already_archived` ⇒ el handler responde
 * 409 (EC-13); `not_found` ⇒ 404 anti-IDOR.
 */
export async function archiveTournament(
  id: string,
  ownerId: string,
): Promise<ArchiveTournamentResult> {
  const [row] = await db
    .update(tournaments)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(tournaments.id, id),
        eq(tournaments.ownerId, ownerId),
        ne(tournaments.status, "archived"),
      ),
    )
    .returning();
  if (row) return { ok: true, tournament: row };

  const existing = await getTournamentById(id, ownerId);
  return { ok: false, reason: existing ? "already_archived" : "not_found" };
}
