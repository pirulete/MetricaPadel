/**
 * `buildInstance` — instancia canónica que consume el motor de agenda (AC-04).
 *
 * UBICACIÓN OBLIGATORIA: vive aquí y **no** en `lib/motor-torneo/` porque AC-05
 * prohíbe que el módulo puro importe `lib/db` (technical-design §1.1).
 *
 * Contrato: `Instancia` de `lib/motor-torneo/types.ts`. Los nombres de campo
 * son camelCase (puerto de `instancia.py`; P-5: los bloques son
 * `dayLabel`/`startTime` strings, sin `Date`).
 *
 * Anti-IDOR: torneo ajeno o inexistente ⇒ `null` (el handler responde 404).
 */
import { db } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import type { Instancia, Partido } from "@/lib/motor-torneo/types";
import {
  tournamentBlocks,
  tournamentCategories,
  tournamentGroups,
  tournamentMatches,
  tournamentPersons,
  tournamentTeamAvailability,
  tournamentTeamMembers,
  tournamentTeams,
  tournaments,
} from "@/lib/db/schema";

/** `jsonb` sin `$type<>` llega como `unknown`: normaliza a `string[]`. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Lee el torneo del owner y arma el objeto puro. Orden determinista por
 * construcción (`sortOrder` / `idx` / `code`), nunca `Object.keys` (P-3).
 */
export async function buildInstance(
  tournamentId: string,
  ownerId: string,
): Promise<Instancia | null> {
  const [tournament] = await db
    .select({ id: tournaments.id, courts: tournaments.courts })
    .from(tournaments)
    .where(
      and(eq(tournaments.id, tournamentId), eq(tournaments.ownerId, ownerId)),
    )
    .limit(1);
  if (!tournament) return null;

  // 8 lecturas independientes en paralelo (el orden del array es el orden de
  // consumo; cada una ya viene ordenada por su clave determinista).
  const [
    blockRows,
    categoryRows,
    groupRows,
    teamRows,
    personRows,
    memberRows,
    availabilityRows,
    matchRows,
  ] = await Promise.all([
    db
      .select()
      .from(tournamentBlocks)
      .where(eq(tournamentBlocks.tournamentId, tournamentId))
      .orderBy(asc(tournamentBlocks.idx)),
    db
      .select()
      .from(tournamentCategories)
      .where(eq(tournamentCategories.tournamentId, tournamentId))
      .orderBy(asc(tournamentCategories.sortOrder)),
    db
      .select()
      .from(tournamentGroups)
      .where(eq(tournamentGroups.tournamentId, tournamentId))
      .orderBy(asc(tournamentGroups.sortOrder)),
    db
      .select()
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .orderBy(asc(tournamentTeams.sortOrder)),
    db
      .select()
      .from(tournamentPersons)
      .where(eq(tournamentPersons.tournamentId, tournamentId))
      .orderBy(asc(tournamentPersons.documentId)),
    db
      .select({
        teamId: tournamentTeamMembers.teamId,
        documentId: tournamentPersons.documentId,
      })
      .from(tournamentTeamMembers)
      .innerJoin(
        tournamentPersons,
        eq(tournamentTeamMembers.personId, tournamentPersons.id),
      )
      .where(eq(tournamentPersons.tournamentId, tournamentId)),
    db
      .select({
        teamId: tournamentTeamAvailability.teamId,
        blockIdx: tournamentTeamAvailability.blockIdx,
      })
      .from(tournamentTeamAvailability)
      .innerJoin(
        tournamentTeams,
        eq(tournamentTeamAvailability.teamId, tournamentTeams.id),
      )
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .orderBy(asc(tournamentTeamAvailability.blockIdx)),
    db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, tournamentId))
      .orderBy(asc(tournamentMatches.code)),
  ]);

  const categoryCodeById = new Map(categoryRows.map((row) => [row.id, row.code]));
  const groupCodeById = new Map(groupRows.map((row) => [row.id, row.code]));
  const teamCodeById = new Map(teamRows.map((row) => [row.id, row.code]));

  // Categorías → códigos de grupo (orden de inserción = sortOrder del grupo).
  const groupCodesByCategory = new Map<string, string[]>();
  for (const group of groupRows) {
    const categoryCode = categoryCodeById.get(group.categoryId);
    if (!categoryCode) continue;
    groupCodesByCategory.set(categoryCode, [
      ...(groupCodesByCategory.get(categoryCode) ?? []),
      group.code,
    ]);
  }

  const categorias: Record<
    string,
    { sex: string; level: number | null; grupos: string[] }
  > = {};
  for (const category of categoryRows) {
    categorias[category.code] = {
      sex: category.sex,
      level: category.level,
      grupos: groupCodesByCategory.get(category.code) ?? [],
    };
  }

  // Grupos → códigos de pareja (orden de inserción = sortOrder de la pareja).
  const teamCodesByGroup = new Map<string, string[]>();
  for (const team of teamRows) {
    teamCodesByGroup.set(team.groupId, [
      ...(teamCodesByGroup.get(team.groupId) ?? []),
      team.code,
    ]);
  }

  const grupos: Record<
    string,
    { categoria: string; parejas: string[]; tam: number }
  > = {};
  for (const group of groupRows) {
    grupos[group.code] = {
      categoria: categoryCodeById.get(group.categoryId) ?? "",
      parejas: teamCodesByGroup.get(group.id) ?? [],
      tam: group.size,
    };
  }

  // Parejas → documentos de sus miembros (orden alfabético: la DB no garantiza
  // el orden de `team_members` y la instancia debe ser reproducible).
  const documentosByTeam = new Map<string, string[]>();
  for (const member of memberRows) {
    const teamCode = teamCodeById.get(member.teamId);
    if (!teamCode) continue;
    documentosByTeam.set(teamCode, [
      ...(documentosByTeam.get(teamCode) ?? []),
      member.documentId,
    ]);
  }

  const bloqueadosByTeam = new Map<string, Set<number>>();
  for (const row of availabilityRows) {
    const teamCode = teamCodeById.get(row.teamId);
    if (!teamCode) continue;
    const blocked = bloqueadosByTeam.get(teamCode) ?? new Set<number>();
    blocked.add(row.blockIdx);
    bloqueadosByTeam.set(teamCode, blocked);
  }

  const parejas: Record<
    string,
    {
      id: string;
      categoria: string;
      grupo: string;
      personas: string[];
      bloqueados: Set<number>;
    }
  > = {};
  for (const team of teamRows) {
    parejas[team.code] = {
      id: team.code,
      categoria: categoryCodeById.get(team.categoryId) ?? "",
      grupo: groupCodeById.get(team.groupId) ?? "",
      personas: (documentosByTeam.get(team.code) ?? []).sort(),
      bloqueados: bloqueadosByTeam.get(team.code) ?? new Set<number>(),
    };
  }

  const personas: Record<string, { sexo: string | null; parejas: string[] }> = {};
  for (const person of personRows) {
    personas[person.documentId] = { sexo: person.sex, parejas: [] };
  }
  for (const team of teamRows) {
    for (const documentId of documentosByTeam.get(team.code) ?? []) {
      personas[documentId]?.parejas.push(team.code);
    }
  }

  const partidos: Record<string, Partido> = {};
  for (const match of matchRows) {
    const teamA = match.teamAId ? teamCodeById.get(match.teamAId) ?? null : null;
    const teamB = match.teamBId ? teamCodeById.get(match.teamBId) ?? null : null;
    partidos[match.code] = {
      id: match.code,
      categoria: categoryCodeById.get(match.categoryId) ?? "",
      phase: match.phase,
      ronda: match.round,
      grupo: match.groupId ? groupCodeById.get(match.groupId) ?? null : null,
      // En finales las parejas aún no se conocen (resuelven los alimentadores).
      parejas: teamA && teamB ? [teamA, teamB] : null,
      gruposOrigen: toStringArray(match.sourceGroups).sort(),
      alimentadores: toStringArray(match.feeders),
    };
  }

  return {
    bloques: blockRows.map((block) => ({
      idx: block.idx,
      dayLabel: block.dayLabel,
      startTime: block.startTime,
      phase: block.phase,
      isExtension: block.isExtension,
      capacity: block.capacity,
    })),
    nCanchas: tournament.courts,
    categorias,
    grupos,
    parejas,
    personas,
    partidos,
  };
}
