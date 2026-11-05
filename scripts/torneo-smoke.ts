/**
 * Smoke local del motor de torneos (F1b). **No** es un test de CI.
 *
 *   npx tsx scripts/torneo-smoke.ts [--time <segundos>] [--gap <mip_rel_gap>]
 *
 * 1. Carga `tests/fixtures/torneo/instance.json` y reconstruye la `Instancia`.
 * 2. Construye el MILP y compara `nVars`/`nConstraints`/`nNonZeros` contra
 *    `tests/fixtures/torneo/model-stats.json` (golden L3). Si difieren, sale 1.
 * 3. Resuelve con HiGHS WASM e imprime status/objetivo/gap/tiempo/RSS.
 * 4. Asigna canchas (`courts.ts`) y verifica reglas duras (`verify.ts`): imprime
 *    `verify errores: N`. Con la agenda de referencia debe ser `0` (GATE F1).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assignCourts } from "../lib/motor-torneo/courts";
import { buildModel } from "../lib/motor-torneo/model";
import { DEFAULT_PARAMS } from "../lib/motor-torneo/objective";
import { solveMilp } from "../lib/motor-torneo/solver";
import { verify } from "../lib/motor-torneo/verify";
import type {
  Bloque,
  Categoria,
  Grupo,
  Instancia,
  MatchRound,
  Pareja,
  Partido,
  Persona,
  TournamentParams,
  TournamentPhase,
} from "../lib/motor-torneo/types";

const FIXTURES = resolve(process.cwd(), "tests/fixtures/torneo");

interface ExchangeJson {
  meta?: { seed?: number };
  bloques: Bloque[];
  nCanchas: number;
  categorias: Record<string, Categoria>;
  grupos: Record<string, Grupo>;
  parejas: Record<string, Pareja & { bloqueados: number[] }>;
  personas: Record<string, Persona>;
  partidos: Array<Partido & { grupoTam?: number | null }>;
}

function argValue(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const raw = Number(process.argv[index + 1]);
  return Number.isFinite(raw) ? raw : fallback;
}

function loadInstance(): Instancia {
  const raw = JSON.parse(
    readFileSync(resolve(FIXTURES, "instance.json"), "utf8"),
  ) as ExchangeJson;

  const partidos: Record<string, Partido> = {};
  for (const partido of raw.partidos) {
    partidos[partido.id] = {
      id: partido.id,
      categoria: partido.categoria,
      phase: partido.phase as TournamentPhase,
      ronda: partido.ronda as MatchRound,
      grupo: partido.grupo,
      parejas: partido.parejas,
      gruposOrigen: partido.gruposOrigen,
      alimentadores: partido.alimentadores,
    };
  }

  const parejas: Record<string, Pareja> = {};
  for (const [id, pareja] of Object.entries(raw.parejas)) {
    parejas[id] = { ...pareja, bloqueados: new Set(pareja.bloqueados) };
  }

  return {
    bloques: raw.bloques,
    nCanchas: raw.nCanchas,
    categorias: raw.categorias,
    grupos: raw.grupos,
    parejas,
    personas: raw.personas,
    partidos,
    seed: raw.meta?.seed,
  };
}

interface SnakeParams {
  frontera_sabado?: boolean;
  descanso_final?: number;
  max_seguidos?: number;
  bloque_final_objetivo?: number;
  disponibilidad_dura?: boolean;
  doble_dura_en?: MatchRound[];
  W_EXTENSION?: number;
  W_DISPONIBILIDAD?: number;
  W_DOBLE_BLANDO?: number;
  W_DIAS?: number;
  W_FINAL_TEMPRANA?: number;
  W_COMPACTO?: number;
  W_SEGUIDOS?: number;
  W_TEMPRANO?: number;
  tiempo_max?: number;
  gap?: number;
}

function paramsFromSnake(raw: SnakeParams): TournamentParams {
  return {
    fronteraSabado: raw.frontera_sabado ?? DEFAULT_PARAMS.fronteraSabado,
    descansoFinal: raw.descanso_final ?? DEFAULT_PARAMS.descansoFinal,
    maxSeguidos: raw.max_seguidos ?? DEFAULT_PARAMS.maxSeguidos,
    bloqueFinalObjetivo:
      raw.bloque_final_objetivo ?? DEFAULT_PARAMS.bloqueFinalObjetivo,
    disponibilidadDura: raw.disponibilidad_dura ?? DEFAULT_PARAMS.disponibilidadDura,
    dobleDuraEn: raw.doble_dura_en ?? DEFAULT_PARAMS.dobleDuraEn,
    W_EXTENSION: raw.W_EXTENSION ?? DEFAULT_PARAMS.W_EXTENSION,
    W_DISPONIBILIDAD: raw.W_DISPONIBILIDAD ?? DEFAULT_PARAMS.W_DISPONIBILIDAD,
    W_DOBLE_BLANDO: raw.W_DOBLE_BLANDO ?? DEFAULT_PARAMS.W_DOBLE_BLANDO,
    W_DIAS: raw.W_DIAS ?? DEFAULT_PARAMS.W_DIAS,
    W_FINAL_TEMPRANA: raw.W_FINAL_TEMPRANA ?? DEFAULT_PARAMS.W_FINAL_TEMPRANA,
    W_COMPACTO: raw.W_COMPACTO ?? DEFAULT_PARAMS.W_COMPACTO,
    W_SEGUIDOS: raw.W_SEGUIDOS ?? DEFAULT_PARAMS.W_SEGUIDOS,
    W_TEMPRANO: raw.W_TEMPRANO ?? DEFAULT_PARAMS.W_TEMPRANO,
    tiempoMax: raw.tiempo_max ?? DEFAULT_PARAMS.tiempoMax,
    gap: raw.gap ?? DEFAULT_PARAMS.gap,
  };
}

function familyCounts(rowNames: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of rowNames) {
    const family = name.slice(0, name.indexOf("[")) || "sin_nombre";
    counts[family] = (counts[family] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<number> {
  const timeSeconds = argValue("--time", 240);
  const gap = argValue("--gap", DEFAULT_PARAMS.gap);
  const modelStats = JSON.parse(
    readFileSync(resolve(FIXTURES, "model-stats.json"), "utf8"),
  ) as {
    params: SnakeParams;
    nVars: number;
    nConstraints: number;
    nNonZeros: number;
    familias: Record<string, number>;
  };

  const inst = loadInstance();
  const params = paramsFromSnake(modelStats.params);
  const identicalParams =
    JSON.stringify(params) === JSON.stringify(DEFAULT_PARAMS);
  console.log(
    `fixture: ${Object.keys(inst.partidos).length} partidos · ${inst.bloques.length} bloques · ${inst.nCanchas} canchas · seed=${inst.seed}`,
  );
  console.log(
    `params: ${identicalParams ? "== DEFAULT_PARAMS" : "DIFEREN DE DEFAULT_PARAMS"}`,
  );

  const wallStart = Date.now();
  const model = buildModel(inst, params);
  const buildMs = Date.now() - wallStart;

  const { nVars, nConstraints, nNonZeros } = model.stats;
  console.log(
    `modelo: nVars=${nVars}/${modelStats.nVars} nConstraints=${nConstraints}/${modelStats.nConstraints} nNonZeros=${nNonZeros}/${modelStats.nNonZeros} (build ${buildMs} ms)`,
  );
  console.log(
    `familias: ${JSON.stringify(familyCounts(model.rowNames))} vs golden ${JSON.stringify(modelStats.familias)}`,
  );

  const statsOk =
    nVars === modelStats.nVars &&
    nConstraints === modelStats.nConstraints &&
    nNonZeros === modelStats.nNonZeros;
  console.log(`L3: ${statsOk ? "MATCH ✅" : "MISMATCH ❌"}`);
  if (!statsOk) return 1;

  console.log(`\nsolve: timeLimit=${timeSeconds}s gap=${gap}`);
  const solveStart = Date.now();
  const result = await solveMilp(model, { timeLimitMs: timeSeconds * 1000, mipRelGap: gap });
  const wallMs = Date.now() - solveStart;
  const rssMb = process.memoryUsage().rss / (1024 * 1024);

  console.log(
    `resultado: status=${result.status} objective=${result.objective ?? "null"} gap=${result.mipGap ?? "null"} solver=${result.timeMs} ms wall=${wallMs} ms rss=${rssMb.toFixed(0)} MB`,
  );
  console.log(`mensaje: ${result.message}`);

  const assigned = Object.keys(result.assignment).length;
  console.log(`partidos asignados: ${assigned}/${Object.keys(inst.partidos).length}`);

  if (result.status === "infeasible" || result.status === "error" || result.status === "unbounded") {
    console.log(`verify: omitido (${result.status}, sin agenda que verificar)`);
    return 1;
  }

  const canchas = assignCourts(inst, result.assignment);
  const errores = verify(inst, result.assignment, canchas, params);
  console.log(`canchas asignadas: ${Object.keys(canchas).length}/${assigned}`);
  console.log(`verify errores: ${errores.length}`);
  for (const error of errores.slice(0, 20)) console.log(`  ! ${error.message}`);

  return errores.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
