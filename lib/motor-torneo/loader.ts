/**
 * Cargador del JSON de intercambio (OPERACION.md §6) → input normalizado para
 * `importTournament` (`lib/db/queries/torneos/import.ts`).
 *
 * Es el **único** archivo del módulo puro que importa `zod` (technical-design
 * §3). No importa `lib/db`: replica el shape `TournamentImportInput` de forma
 * estructural, así el glue server lo consume sin conversión.
 *
 * Reglas del cargador (technical-design §5), todas acumulativas (no corta en el
 * primer error) para que la UI liste todos los campos culpables de una vez:
 *
 * | # | Regla | Código | HTTP |
 * |---|---|---|---|
 * | R5 | grupo de 3 o 4 parejas | `group_invalid_size` | 400 |
 * | R1 | cada pareja en exactamente 1 grupo de 1 categoría | `duplicate_team` / `orphan_team` / `team_in_two_categories` | 400 |
 * | R2 | persona en >1 pareja solo si son de categorías distintas | `person_two_teams_same_category` | 400 |
 * | R3 | `no_disponible` ⊆ bloques de previa | `availability_invalid_block` | 400 |
 * | R4 | ≤ 8 bloques bloqueados por pareja | `availability_too_many` | 400 |
 * | R0 | cada partido de previa tiene ≥ 1 bloque compatible | `match_without_allowed_block` | 422 |
 * | R6 | `partidos ≤ 600` y `partidos × bloques ≤ 120_000` | `instance_too_large` | 422 |
 */
import { z } from "zod";
import { buildBlocks } from "./calendar";
import { deriveStructure } from "./bracket";
import type {
  Bloque,
  CalendarioTramo,
  Categoria,
  Grupo,
  MatchRound,
  Pareja,
  TournamentPhase,
} from "./types";

/** Tope de bloques bloqueados por pareja (R4/EC-05, `MAX_UNAVAILABLE_BLOCKS`). */
export const MAX_UNAVAILABLE_BLOCKS = 8;
/** Tope de partidos de la instancia (R6/EC-14). */
export const MAX_MATCHES = 600;
/** Tope de casillas `partidos × bloques` (R6/EC-14). */
export const MAX_MATCH_BLOCK_PAIRS = 120_000;
/** Duración de bloque soportada por M1 (`calendar.ts` fija `BLOQUE_MIN`). */
export const BLOCK_MINUTES = 75;

export type LoaderErrorCode =
  | "invalid_schema"
  | "calendar_invalid"
  | "duplicate_team"
  | "orphan_team"
  | "team_in_two_categories"
  | "person_two_teams_same_category"
  | "availability_invalid_block"
  | "availability_too_many"
  | "group_invalid_size"
  | "match_without_allowed_block"
  | "instance_too_large";

export interface LoaderError {
  code: LoaderErrorCode;
  /** Ruta legible del campo culpable, ej. `parejas[p101].no_disponible[2]`. */
  path: string;
  message: string;
}

/** Bloque aritado (`calendar.ts`): espejo de `ImportBlock`. */
export type LoaderBlock = Bloque;

export interface LoaderTeam {
  code: string;
  /** `documentId` de las 2 personas. */
  persons: string[];
  /** Índices de bloque de previa prohibidos (único + ascendente). */
  unavailable: number[];
}

export interface LoaderGroup {
  code: string;
  teams: LoaderTeam[];
}

export interface LoaderCategory {
  code: string;
  sex: string;
  level: number | null;
  groups: LoaderGroup[];
}

/** Partido materializado: previa (`teamACode`/`teamBCode`) o cuadro (`sourceGroups`/`feeders`). */
export interface LoaderMatch {
  code: string;
  categoryCode: string;
  phase: TournamentPhase;
  round: MatchRound;
  groupCode: string | null;
  teamACode: string | null;
  teamBCode: string | null;
  sourceGroups: string[];
  feeders: string[];
}

export interface LoaderMeta {
  name: string;
  startDate: string;
  endDate: string;
  courts: number;
  blockMinutes: number;
}

export interface TournamentInput {
  meta: LoaderMeta;
  blocks: LoaderBlock[];
  categories: LoaderCategory[];
  matches: LoaderMatch[];
}

export type LoaderResult =
  | { ok: true; data: TournamentInput }
  | { ok: false; errors: LoaderError[] };

// ---------------------------------------------------------------------------
// Schemas del JSON de intercambio (OPERACION.md §6 / technical-design §6.1)
// ---------------------------------------------------------------------------

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD");
const hourSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "formato esperado HH:mm");

const tramoSchema = z.object({
  /** `varchar(3)` en `tournament_blocks.dayLabel`. */
  dia: z.string().trim().min(1, "dia es requerido").max(3, "dia admite hasta 3 caracteres"),
  inicio: hourSchema,
  bloques: z.number().int("bloques debe ser un entero").min(1).max(24),
  fase: z.enum(["previa", "final"]),
  extension: z.boolean(),
});

const metaSchema = z.object({
  name: z.string().trim().min(1, "name es requerido").max(200),
  startDate: dateSchema,
  endDate: dateSchema,
  courts: z.number().int("courts debe ser un entero").min(1).max(24),
  blockMinutes: z.number().int().min(30).max(120).optional(),
});

const parejaSchema = z.object({
  personas: z.tuple([
    z.string().trim().min(1, "persona requerida").max(50),
    z.string().trim().min(1, "persona requerida").max(50),
  ]),
  no_disponible: z.array(z.number().int().min(0)).default([]),
});

const categoriaSchema = z.object({
  sexo: z.enum(["H", "M"]),
  nivel: z.number().int().min(1).max(10).optional(),
  grupos: z.record(
    z.string().trim().min(1).max(8),
    z.array(z.string().trim().min(1).max(20)),
  ),
});

/** Contrato del JSON de intercambio (`POST /api/torneos`). */
export const tournamentExchangeSchema = z.object({
  meta: metaSchema,
  calendario: z.array(tramoSchema).min(1, "calendario requiere al menos 1 tramo"),
  capacidad_especial: z
    .record(z.string().regex(/^\d+$/, "las claves son índices de bloque"), z.number().int().min(0).max(24))
    .optional(),
  categorias: z.record(z.string().trim().min(1).max(10), categoriaSchema),
  parejas: z.record(z.string().trim().min(1).max(20), parejaSchema),
});

export type TournamentExchangeJson = z.infer<typeof tournamentExchangeSchema>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Valida y deriva la instancia completa: bloques (`calendar.ts`), partidos de
 * previa y de cuadro (`bracket.ts`) + las reglas R0–R6.
 */
export function parseTournamentInput(raw: unknown): LoaderResult {
  const parsed = tournamentExchangeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "invalid_schema",
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    };
  }

  const json = parsed.data;
  const errors: LoaderError[] = [];
  const fail = (code: LoaderErrorCode, path: string, message: string) =>
    errors.push({ code, path, message });

  if (json.meta.blockMinutes !== undefined && json.meta.blockMinutes !== BLOCK_MINUTES) {
    fail(
      "invalid_schema",
      "meta.blockMinutes",
      `El motor M1 solo soporta bloques de ${BLOCK_MINUTES} min (recibido ${json.meta.blockMinutes}).`,
    );
    return { ok: false, errors };
  }

  // --- bloques (calendar.ts valida solapes y capacidad) --------------------
  const tramos: CalendarioTramo[] = json.calendario.map((tramo) => ({
    dayLabel: tramo.dia,
    startTime: tramo.inicio,
    blocks: tramo.bloques,
    phase: tramo.fase,
    isExtension: tramo.extension,
  }));
  const overrides: Record<number, number> = {};
  for (const [key, capacity] of Object.entries(json.capacidad_especial ?? {})) {
    overrides[Number(key)] = capacity;
  }

  let blocks: Bloque[];
  try {
    blocks = buildBlocks(tramos, json.meta.courts, overrides);
  } catch (error) {
    return {
      ok: false,
      errors: [{ code: "calendar_invalid", path: "calendario", message: errorMessage(error) }],
    };
  }
  const previaBlocks = blocks.filter((bloque) => bloque.phase === "previa");
  const previaBlockIdx = new Set(previaBlocks.map((bloque) => bloque.idx));

  // --- R1/R5: grupos → categorías, grupos y parejas ------------------------
  const categorias: Record<string, Categoria> = {};
  const grupos: Record<string, Grupo> = {};
  const categoriesOutput: LoaderCategory[] = [];
  /** pareja → categoría y grupo donde está inscrita (para R1/R2). */
  const teamCategory = new Map<string, string>();
  const teamCategories = new Map<string, Set<string>>();
  const teamGroup = new Map<string, string>();

  for (const [catCode, categoria] of Object.entries(json.categorias)) {
    if (catCode.length > 10) {
      fail("invalid_schema", `categorias[${catCode}]`, `El código de categoría ${catCode} supera varchar(10).`);
    }

    const groupCodes: string[] = [];
    const groupOutputs: LoaderGroup[] = [];

    for (const [groupKey, ids] of Object.entries(categoria.grupos)) {
      const groupCode = `${catCode}-${groupKey}`;
      const groupPath = `categorias[${catCode}].grupos[${groupKey}]`;
      if (groupCode.length > 10) {
        fail("invalid_schema", groupPath, `El código de grupo ${groupCode} supera varchar(10).`);
      }
      groupCodes.push(groupCode);

      // R5
      if (ids.length !== 3 && ids.length !== 4) {
        fail(
          "group_invalid_size",
          groupPath,
          `El grupo ${groupCode} tiene ${ids.length} parejas (se esperan 3 o 4).`,
        );
      }

      // R1: exactamente un grupo de una sola categoría
      ids.forEach((parejaId, index) => {
        const path = `${groupPath}[${index}]`;
        if (!json.parejas[parejaId]) {
          fail("orphan_team", path, `La pareja ${parejaId} no está definida en parejas.`);
          return;
        }
        const seen = teamCategories.get(parejaId) ?? new Set<string>();
        if (seen.has(catCode)) {
          fail("duplicate_team", path, `La pareja ${parejaId} aparece más de una vez en la categoría ${catCode}.`);
        } else if (seen.size > 0) {
          fail(
            "team_in_two_categories",
            path,
            `La pareja ${parejaId} está en las categorías ${[...seen].join(", ")} y ${catCode}.`,
          );
        }
        seen.add(catCode);
        teamCategories.set(parejaId, seen);
        if (!teamCategory.has(parejaId)) {
          teamCategory.set(parejaId, catCode);
          teamGroup.set(parejaId, groupCode);
        }
      });

      grupos[groupCode] = { categoria: catCode, parejas: [...ids], tam: ids.length };
      groupOutputs.push({
        code: groupCode,
        teams: ids.map((parejaId) => ({
          code: parejaId,
          persons: json.parejas[parejaId]?.personas ?? [],
          unavailable: [...new Set(json.parejas[parejaId]?.no_disponible ?? [])].sort((a, b) => a - b),
        })),
      });
    }

    categorias[catCode] = {
      sex: categoria.sexo,
      level: categoria.nivel ?? null,
      grupos: groupCodes,
    };
    categoriesOutput.push({
      code: catCode,
      sex: categoria.sexo,
      level: categoria.nivel ?? null,
      groups: groupOutputs,
    });
  }

  // --- R1/R2/R3/R4 por pareja ---------------------------------------------
  const parejas: Record<string, Pareja> = {};
  const personCategories = new Map<string, Set<string>>();

  for (const [parejaId, definicion] of Object.entries(json.parejas)) {
    const path = `parejas[${parejaId}]`;
    const categoria = teamCategory.get(parejaId);

    if (categoria === undefined) {
      fail("orphan_team", path, `La pareja ${parejaId} no está en ningún grupo.`);
    }

    definicion.personas.forEach((documentId, index) => {
      const seen = personCategories.get(documentId) ?? new Set<string>();
      if (categoria !== undefined && seen.has(categoria)) {
        fail(
          "person_two_teams_same_category",
          `${path}.personas[${index}]`,
          `La persona ${documentId} está en más de una pareja de la categoría ${categoria}.`,
        );
      }
      if (categoria !== undefined) seen.add(categoria);
      personCategories.set(documentId, seen);
    });

    // R4
    const unavailable = [...new Set(definicion.no_disponible)];
    if (unavailable.length > MAX_UNAVAILABLE_BLOCKS) {
      fail(
        "availability_too_many",
        `${path}.no_disponible`,
        `La pareja ${parejaId} bloquea ${unavailable.length} bloques (máximo ${MAX_UNAVAILABLE_BLOCKS}).`,
      );
    }

    // R3
    definicion.no_disponible.forEach((blockIdx, index) => {
      if (!previaBlockIdx.has(blockIdx)) {
        fail(
          "availability_invalid_block",
          `${path}.no_disponible[${index}]`,
          `El bloque ${blockIdx} no existe o no es de fase previa.`,
        );
      }
    });

    parejas[parejaId] = {
      id: parejaId,
      categoria: categoria ?? "",
      grupo: teamGroup.get(parejaId) ?? "",
      personas: [...definicion.personas],
      bloqueados: new Set(unavailable),
    };
  }

  if (errors.length > 0) return { ok: false, errors };

  // --- estructura deportiva (bracket.ts) ----------------------------------
  const structure = deriveStructure(categorias, grupos);
  const matches: LoaderMatch[] = structure.map((partido) => ({
    code: partido.id,
    categoryCode: partido.categoria,
    phase: partido.phase,
    round: partido.ronda,
    groupCode: partido.grupo,
    teamACode: partido.parejas?.[0] ?? null,
    teamBCode: partido.parejas?.[1] ?? null,
    sourceGroups: partido.gruposOrigen,
    feeders: partido.alimentadores,
  }));

  // --- R0: pre-check de viabilidad de la previa ---------------------------
  for (const partido of structure) {
    if (partido.phase !== "previa") continue;
    const [a, b] = partido.parejas ?? [];
    const bloqueados = new Set<number>([
      ...(parejas[a]?.bloqueados ?? []),
      ...(parejas[b]?.bloqueados ?? []),
    ]);
    const allowed = previaBlocks.some((bloque) => !bloqueados.has(bloque.idx));
    if (!allowed) {
      fail(
        "match_without_allowed_block",
        `partidos[${partido.id}]`,
        `El partido ${partido.id} no tiene ningún bloque de previa compatible con la disponibilidad de ambas parejas.`,
      );
    }
  }

  // --- R6: límite de tamaño ----------------------------------------------
  if (
    matches.length > MAX_MATCHES ||
    matches.length * blocks.length > MAX_MATCH_BLOCK_PAIRS
  ) {
    fail(
      "instance_too_large",
      "torneo",
      `${matches.length} partidos × ${blocks.length} bloques supera el límite (${MAX_MATCHES} partidos, ${MAX_MATCH_BLOCK_PAIRS} casillas).`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      meta: {
        name: json.meta.name,
        startDate: json.meta.startDate,
        endDate: json.meta.endDate,
        courts: json.meta.courts,
        blockMinutes: json.meta.blockMinutes ?? BLOCK_MINUTES,
      },
      blocks,
      categories: categoriesOutput,
      matches,
    },
  };
}
