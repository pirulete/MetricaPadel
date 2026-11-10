import { db } from "@/lib/db";
import {
  tournamentBlocks,
  tournamentCategories,
  tournamentGroups,
  tournamentMatches,
  tournamentPersons,
  tournamentTeamAvailability,
  tournamentTeamMembers,
  tournamentTeams,
} from "@/lib/db/schema";
import type { TournamentMatchRound, TournamentPhase } from "@/lib/db/schema";
import { MAX_UNAVAILABLE_BLOCKS } from "@/lib/motor-torneo/loader";
import { createTournament } from "./tournaments";

/**
 * Import transaccional del JSON canónico (§6) ya normalizado por la capa pura
 * (`lib/motor-torneo/loader.ts`). Esta capa NO deriva bloques ni cuadro: solo
 * valida invariantes de persistencia y escribe. AC-02: cualquier fallo deja 0
 * filas (rollback total).
 */

export type ImportMeta = {
  name: string;
  /** `YYYY-MM-DD` — columna `date` en modo string (nunca `Date`). */
  startDate: string;
  endDate: string;
  courts: number;
  blockMinutes?: number;
  /** `{ fronteraSabado, descansoFinal, maxSeguidos, ... }` (technical-design §4.2). */
  params?: Record<string, unknown>;
};

/** Bloque aritado por `calendar.ts` (idx 0..N-1, `startTime` `HH:mm`). */
export type ImportBlock = {
  idx: number;
  dayLabel: string;
  startTime: string;
  phase: TournamentPhase;
  isExtension?: boolean;
  capacity: number;
};

export type ImportTeam = {
  code: string;
  /** `documentId` de las personas de la pareja (identidad única por torneo). */
  persons: string[];
  /** Índices de bloque de fase previa en los que la pareja no puede jugar. */
  unavailable?: number[];
};

export type ImportGroup = { code: string; teams: ImportTeam[] };

export type ImportCategory = {
  code: string;
  sex: string;
  level?: number | null;
  groups: ImportGroup[];
};

/** Partido materializado por `bracket.ts` (Q2). `sourceGroups`/`feeders` = códigos. */
export type ImportMatch = {
  code: string;
  categoryCode: string;
  phase: TournamentPhase;
  round: TournamentMatchRound;
  groupCode?: string | null;
  teamACode?: string | null;
  teamBCode?: string | null;
  sourceGroups?: string[];
  feeders?: string[];
};

export type TournamentImportInput = {
  meta: ImportMeta;
  blocks: ImportBlock[];
  categories: ImportCategory[];
  matches: ImportMatch[];
};

export const IMPORT_ERROR_CODES = [
  "duplicate_team",
  "team_in_two_categories",
  "person_two_teams_same_category",
  "availability_invalid_block",
  "availability_too_many",
  "match_reference_invalid",
] as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

export type ImportError = {
  code: ImportErrorCode;
  /** Ruta legible del campo culpable, ej. `parejas[p101].no_disponible[2]`. */
  path: string;
  message: string;
};

export type ImportCounts = {
  blocks: number;
  categories: number;
  groups: number;
  teams: number;
  persons: number;
  matchesPrevia: number;
  matchesFinal: number;
  matches: number;
};

export type ImportResult =
  | { ok: true; tournamentId: string; counts: ImportCounts }
  | { ok: false; errors: ImportError[] };

/**
 * Invariantes de persistencia (defensa en profundidad: el cargador puro es la
 * autoridad, esto evita escribir filas incoherentes si alguien llama a la query
 * directamente). Acumula TODOS los errores (no corta en el primero) para que la
 * UI liste los campos culpables de una vez. Sin efectos secundarios.
 */
function validateImport(input: TournamentImportInput): ImportError[] {
  const errors: ImportError[] = [];
  const fail = (code: ImportErrorCode, path: string, message: string) =>
    errors.push({ code, path, message });
  const previaBlocks = new Set(
    input.blocks.filter((block) => block.phase === "previa").map((block) => block.idx),
  );
  const categoryCodes = new Set(input.categories.map((category) => category.code));
  const groupKeys = new Set<string>();
  const teamCategory = new Map<string, string>();
  const personCategories = new Map<string, Set<string>>();

  for (const category of input.categories) {
    for (const group of category.groups) {
      groupKeys.add(`${category.code}/${group.code}`);

      for (const team of group.teams) {
        const teamPath = `parejas[${team.code}]`;
        const previousCategory = teamCategory.get(team.code);
        if (previousCategory === undefined) {
          teamCategory.set(team.code, category.code);
        } else if (previousCategory === category.code) {
          fail("duplicate_team", teamPath, `La pareja ${team.code} aparece más de una vez en la categoría ${category.code}.`);
        } else {
          fail("team_in_two_categories", teamPath, `La pareja ${team.code} está en las categorías ${previousCategory} y ${category.code}.`);
        }

        team.persons.forEach((documentId, index) => {
          const seen = personCategories.get(documentId) ?? new Set<string>();
          if (seen.has(category.code)) {
            fail("person_two_teams_same_category", `${teamPath}.personas[${index}]`, `La persona ${documentId} está en más de una pareja de la categoría ${category.code}.`);
          }
          seen.add(category.code);
          personCategories.set(documentId, seen);
        });

        const unavailable = team.unavailable ?? [];
        const uniqueUnavailable = new Set(unavailable);
        if (uniqueUnavailable.size > MAX_UNAVAILABLE_BLOCKS) {
          fail("availability_too_many", `${teamPath}.no_disponible`, `La pareja ${team.code} bloquea ${uniqueUnavailable.size} bloques (máximo ${MAX_UNAVAILABLE_BLOCKS}).`);
        }
        unavailable.forEach((blockIdx, index) => {
          if (!previaBlocks.has(blockIdx)) {
            fail("availability_invalid_block", `${teamPath}.no_disponible[${index}]`, `El bloque ${blockIdx} no existe o no es de fase previa.`);
          }
        });
      }
    }
  }

  // Integridad referencial de los partidos: sin esto el fallo saldría como
  // 23503 dentro de la transacción (500) en vez de un 400 con `path`.
  input.matches.forEach((match, index) => {
    const path = `partidos[${index}]`;
    if (!categoryCodes.has(match.categoryCode)) {
      fail("match_reference_invalid", `${path}.categoria`, `La categoría ${match.categoryCode} no existe en el import.`);
    } else if (match.groupCode && !groupKeys.has(`${match.categoryCode}/${match.groupCode}`)) {
      fail("match_reference_invalid", `${path}.grupo`, `El grupo ${match.groupCode} no existe en la categoría ${match.categoryCode}.`);
    }
    for (const teamCode of [match.teamACode, match.teamBCode]) {
      if (teamCode && !teamCategory.has(teamCode)) {
        fail("match_reference_invalid", path, `El partido ${match.code} referencia la pareja inexistente ${teamCode}.`);
      }
    }
  });

  return errors;
}

/**
 * Import atómico (AC-02): 1 sola `db.transaction` que inserta torneo (draft),
 * bloques, categorías, grupos, personas, parejas, miembros, disponibilidad y
 * partidos. Cualquier error ⇒ rollback total (0 filas). `sortOrder` se toma del
 * orden del array (mismo orden de inserción del JSON canónico) para que el
 * cuadro sea reproducible (P-3).
 */
export async function importTournament(
  ownerId: string,
  input: TournamentImportInput,
): Promise<ImportResult> {
  const errors = validateImport(input);
  if (errors.length > 0) return { ok: false, errors };

  const counts = await db.transaction(async (tx) => {
    const tournament = await createTournament({ ownerId, ...input.meta }, tx);
    const tournamentId = tournament.id;

    if (input.blocks.length > 0) {
      await tx.insert(tournamentBlocks).values(
        input.blocks.map((block) => ({
          tournamentId,
          idx: block.idx,
          dayLabel: block.dayLabel,
          startTime: block.startTime,
          phase: block.phase,
          isExtension: block.isExtension ?? false,
          capacity: block.capacity,
        })),
      );
    }

    const categoryRows = input.categories.length > 0
      ? await tx
          .insert(tournamentCategories)
          .values(
            input.categories.map((category, index) => ({
              tournamentId,
              code: category.code,
              sex: category.sex,
              level: category.level ?? null,
              sortOrder: index,
            })),
          )
          .returning({ id: tournamentCategories.id, code: tournamentCategories.code })
      : [];
    const categoryIdByCode = new Map(categoryRows.map((row) => [row.code, row.id]));

    const groupValues = input.categories.flatMap((category) =>
      category.groups.map((group, index) => ({
        tournamentId,
        categoryId: categoryIdByCode.get(category.code)!,
        code: group.code,
        size: group.teams.length,
        sortOrder: index,
      })),
    );
    const groupRows = groupValues.length > 0
      ? await tx
          .insert(tournamentGroups)
          .values(groupValues)
          .returning({
            id: tournamentGroups.id,
            code: tournamentGroups.code,
            categoryId: tournamentGroups.categoryId,
          })
      : [];
    const groupIdByKey = new Map(
      groupRows.map((row) => [`${row.categoryId}/${row.code}`, row.id]),
    );

    // Personas: 1 fila por documento (UNIQUE tournamentId+documentId). El sexo
    // se hereda de la categoría de la primera pareja donde aparece.
    const personsByDocument = new Map<string, string>();
    for (const category of input.categories) {
      for (const group of category.groups) {
        for (const team of group.teams) {
          for (const documentId of team.persons) {
            if (!personsByDocument.has(documentId)) {
              personsByDocument.set(documentId, category.sex);
            }
          }
        }
      }
    }
    const personRows = personsByDocument.size > 0
      ? await tx
          .insert(tournamentPersons)
          .values(
            [...personsByDocument].map(([documentId, sex]) => ({
              tournamentId,
              documentId,
              sex,
              displayName: null,
            })),
          )
          .returning({ id: tournamentPersons.id, documentId: tournamentPersons.documentId })
      : [];
    const personIdByDocument = new Map(
      personRows.map((row) => [row.documentId, row.id]),
    );

    // Parejas: sortOrder por categoría, siguiendo el orden grupos → parejas.
    const teamValues: Array<{
      tournamentId: string;
      categoryId: string;
      groupId: string;
      code: string;
      sortOrder: number;
    }> = [];
    for (const category of input.categories) {
      const categoryId = categoryIdByCode.get(category.code)!;
      let sortOrder = 0;
      for (const group of category.groups) {
        const groupId = groupIdByKey.get(`${categoryId}/${group.code}`)!;
        for (const team of group.teams) {
          teamValues.push({
            tournamentId,
            categoryId,
            groupId,
            code: team.code,
            sortOrder: sortOrder++,
          });
        }
      }
    }
    const teamRows = teamValues.length > 0
      ? await tx
          .insert(tournamentTeams)
          .values(teamValues)
          .returning({ id: tournamentTeams.id, code: tournamentTeams.code })
      : [];
    const teamIdByCode = new Map(teamRows.map((row) => [row.code, row.id]));

    const memberValues: Array<{ teamId: string; personId: string }> = [];
    const availabilityValues: Array<{ teamId: string; blockIdx: number }> = [];
    for (const category of input.categories) {
      for (const group of category.groups) {
        for (const team of group.teams) {
          const teamId = teamIdByCode.get(team.code)!;
          for (const documentId of team.persons) {
            memberValues.push({ teamId, personId: personIdByDocument.get(documentId)! });
          }
          for (const blockIdx of new Set(team.unavailable ?? [])) {
            availabilityValues.push({ teamId, blockIdx });
          }
        }
      }
    }
    if (memberValues.length > 0) {
      await tx.insert(tournamentTeamMembers).values(memberValues);
    }
    if (availabilityValues.length > 0) {
      await tx.insert(tournamentTeamAvailability).values(availabilityValues);
    }

    if (input.matches.length > 0) {
      await tx.insert(tournamentMatches).values(
        input.matches.map((match) => {
          const categoryId = categoryIdByCode.get(match.categoryCode)!;
          return {
            tournamentId,
            categoryId,
            phase: match.phase,
            round: match.round,
            groupId: match.groupCode
              ? groupIdByKey.get(`${categoryId}/${match.groupCode}`) ?? null
              : null,
            teamAId: match.teamACode ? teamIdByCode.get(match.teamACode) ?? null : null,
            teamBId: match.teamBCode ? teamIdByCode.get(match.teamBCode) ?? null : null,
            sourceGroups: match.sourceGroups ?? [],
            feeders: match.feeders ?? [],
            code: match.code,
          };
        }),
      );
    }

    const matchesPrevia = input.matches.filter((match) => match.phase === "previa").length;

    return {
      tournamentId,
      counts: {
        blocks: input.blocks.length,
        categories: categoryRows.length,
        groups: groupRows.length,
        teams: teamRows.length,
        persons: personRows.length,
        matchesPrevia,
        matchesFinal: input.matches.length - matchesPrevia,
        matches: input.matches.length,
      },
    };
  });

  return { ok: true, ...counts };
}
