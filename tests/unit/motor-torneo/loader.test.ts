/**
 * Cargador del JSON de intercambio (`loader.ts`): R0–R6, `invalid_schema` y
 * `calendar_invalid` con `path` exacto + acumulación de errores + happy-path
 * del caso de referencia (247 partidos derivados de `instance.json`).
 */
import instanceJson from "../../fixtures/torneo/instance.json";
import { CALENDARIO } from "@/lib/motor-torneo/calendar";
import { parseTournamentInput } from "@/lib/motor-torneo/loader";

interface ExchangePareja {
  personas: [string, string];
  no_disponible: number[];
}

interface ExchangeCategoria {
  sexo: "H" | "M";
  nivel?: number;
  grupos: Record<string, string[]>;
}

interface ExchangeTramo {
  dia: string;
  inicio: string;
  bloques: number;
  fase: "previa" | "final";
  extension: boolean;
}

interface Exchange {
  meta: {
    name: string;
    startDate: string;
    endDate: string;
    courts: number;
    blockMinutes?: number;
  };
  calendario: ExchangeTramo[];
  capacidad_especial?: Record<string, number>;
  categorias: Record<string, ExchangeCategoria>;
  parejas: Record<string, ExchangePareja>;
}

/** Payload mínimo válido: 1 categoría, 1 grupo de 3 parejas (Sab previa, Dom final). */
function miniExchange(): Exchange {
  return {
    meta: {
      name: "Mini",
      startDate: "2026-11-05",
      endDate: "2026-11-06",
      courts: 2,
      blockMinutes: 75,
    },
    calendario: [
      { dia: "Sab", inicio: "08:00", bloques: 3, fase: "previa", extension: false },
      { dia: "Dom", inicio: "08:00", bloques: 2, fase: "final", extension: false },
    ],
    capacidad_especial: {},
    categorias: {
      "1ra": {
        sexo: "H",
        nivel: 1,
        grupos: { G1: ["1ra-G1-A", "1ra-G1-B", "1ra-G1-C"] },
      },
    },
    parejas: {
      "1ra-G1-A": { personas: ["P1", "P2"], no_disponible: [] },
      "1ra-G1-B": { personas: ["P3", "P4"], no_disponible: [] },
      "1ra-G1-C": { personas: ["P5", "P6"], no_disponible: [] },
    },
  };
}

interface ReferenceFixture {
  categorias: Record<string, { sex: "H" | "M"; level: number | null; grupos: string[] }>;
  grupos: Record<string, { parejas: string[] }>;
  parejas: Record<string, { personas: string[]; bloqueados: number[] }>;
}

/** Reconstruye el JSON de intercambio equivalente a `instance.json` (seed 7). */
function referenceExchange(): Exchange {
  const raw = instanceJson as unknown as ReferenceFixture;
  const categorias: Record<string, ExchangeCategoria> = {};
  for (const [code, categoria] of Object.entries(raw.categorias)) {
    const grupos: Record<string, string[]> = {};
    for (const groupCode of categoria.grupos) {
      grupos[groupCode.slice(code.length + 1)] = raw.grupos[groupCode].parejas;
    }
    categorias[code] = {
      sexo: categoria.sex,
      nivel: categoria.level ?? undefined,
      grupos,
    };
  }

  return {
    meta: {
      name: "Referencia seed 7",
      startDate: "2026-11-05",
      endDate: "2026-11-08",
      courts: 8,
      blockMinutes: 75,
    },
    calendario: CALENDARIO.map((tramo) => ({
      dia: tramo.dayLabel,
      inicio: tramo.startTime,
      bloques: tramo.blocks,
      fase: tramo.phase,
      extension: tramo.isExtension,
    })),
    capacidad_especial: {},
    categorias,
    parejas: Object.fromEntries(
      Object.entries(raw.parejas).map(([code, p]) => [
        code,
        { personas: [p.personas[0], p.personas[1]] as [string, string], no_disponible: p.bloqueados },
      ]),
    ),
  };
}

function errorsOf(payload: unknown) {
  const result = parseTournamentInput(payload);
  if (result.ok) throw new Error("se esperaba un payload inválido");
  return result.errors;
}

function addPairs(payload: Exchange, codes: Array<[string, [string, string]]>) {
  for (const [code, personas] of codes) {
    payload.parejas[code] = { personas, no_disponible: [] };
  }
}

describe("parseTournamentInput — happy-path (caso de referencia)", () => {
  it("deriva los 247 partidos y 38 bloques de instance.json", () => {
    const result = parseTournamentInput(referenceExchange());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.blocks).toHaveLength(38);
    expect(result.data.matches).toHaveLength(247);
    expect(result.data.matches.filter((m) => m.phase === "previa")).toHaveLength(155);
    expect(result.data.matches.filter((m) => m.phase === "final")).toHaveLength(92);
    expect(result.data.categories).toHaveLength(8);
  });

  it("acepta el payload mini", () => {
    const result = parseTournamentInput(miniExchange());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches).toHaveLength(4);
    expect(result.data.meta.blockMinutes).toBe(75);
  });
});

describe("parseTournamentInput — invalid_schema", () => {
  it("rechaza un body sin meta", () => {
    const errors = errorsOf({});
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "invalid_schema", path: "meta" }),
    );
  });

  it("rechaza blockMinutes distinto de 75 (M1)", () => {
    const payload = miniExchange();
    payload.meta.blockMinutes = 30;
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({ code: "invalid_schema", path: "meta.blockMinutes" }),
    );
  });
});

describe("parseTournamentInput — calendar_invalid", () => {
  it("detecta tramos solapados del mismo día", () => {
    const payload = miniExchange();
    payload.calendario = [
      { dia: "Sab", inicio: "08:00", bloques: 2, fase: "previa", extension: false },
      { dia: "Sab", inicio: "09:00", bloques: 1, fase: "previa", extension: false },
      { dia: "Dom", inicio: "08:00", bloques: 2, fase: "final", extension: false },
    ];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({ code: "calendar_invalid", path: "calendario" }),
    );
  });
});

describe("parseTournamentInput — R1/R2/R5 (inscripción)", () => {
  it("R5: grupo de 2 parejas", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-B"];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "group_invalid_size",
        path: "categorias[1ra].grupos[G1]",
      }),
    );
  });

  it("R1: pareja repetida en dos grupos de la misma categoría", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G2 = ["1ra-G1-A", "1ra-G1-D", "1ra-G1-E"];
    addPairs(payload, [
      ["1ra-G1-D", ["P7", "P8"]],
      ["1ra-G1-E", ["P9", "P10"]],
    ]);
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "duplicate_team",
        path: "categorias[1ra].grupos[G2][0]",
      }),
    );
  });

  it("R1: pareja en el grupo pero no definida en parejas", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-B", "1ra-G1-GHOST"];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "orphan_team",
        path: "categorias[1ra].grupos[G1][2]",
      }),
    );
  });

  it("R1: pareja sin grupo (huérfana en parejas)", () => {
    const payload = miniExchange();
    addPairs(payload, [["1ra-G1-D", ["P7", "P8"]]]);
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({ code: "orphan_team", path: "parejas[1ra-G1-D]" }),
    );
  });

  it("R1: pareja en dos categorías distintas", () => {
    const payload = miniExchange();
    payload.categorias["2da"] = {
      sexo: "H",
      nivel: 2,
      grupos: { G1: ["1ra-G1-A", "1ra-G1-D", "1ra-G1-E"] },
    };
    addPairs(payload, [
      ["1ra-G1-D", ["P7", "P8"]],
      ["1ra-G1-E", ["P9", "P10"]],
    ]);
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "team_in_two_categories",
        path: "categorias[2da].grupos[G1][0]",
      }),
    );
  });

  it("R2: persona en dos parejas de la misma categoría", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G2 = ["1ra-G1-D", "1ra-G1-E", "1ra-G1-F"];
    addPairs(payload, [
      ["1ra-G1-D", ["P1", "P7"]],
      ["1ra-G1-E", ["P8", "P9"]],
      ["1ra-G1-F", ["P10", "P11"]],
    ]);
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "person_two_teams_same_category",
        path: "parejas[1ra-G1-D].personas[0]",
      }),
    );
  });
});

describe("parseTournamentInput — R3/R4 (disponibilidad)", () => {
  it("R3: bloque no disponible que no pertenece a la previa", () => {
    const payload = miniExchange();
    payload.parejas["1ra-G1-A"].no_disponible = [3];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "availability_invalid_block",
        path: "parejas[1ra-G1-A].no_disponible[0]",
      }),
    );
  });

  it("R4: más de 8 bloques bloqueados por pareja", () => {
    const payload = referenceExchange();
    payload.parejas["2da-G1-A"].no_disponible = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "availability_too_many",
        path: "parejas[2da-G1-A].no_disponible",
      }),
    );
  });
});

describe("parseTournamentInput — R0/R6 (viabilidad y tamaño)", () => {
  it("R0: un partido de previa sin ningún bloque compatible", () => {
    const payload = miniExchange();
    payload.parejas["1ra-G1-A"].no_disponible = [0, 1, 2];
    payload.parejas["1ra-G1-B"].no_disponible = [0, 1, 2];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "match_without_allowed_block",
        path: "partidos[1ra-G1-P1]",
      }),
    );
  });

  it("R6: más de 600 partidos", () => {
    const categorias: Record<string, ExchangeCategoria> = {};
    const parejas: Record<string, ExchangePareja> = {};
    for (let c = 1; c <= 41; c += 1) {
      const cat = `T${String(c).padStart(2, "0")}`;
      const grupos: Record<string, string[]> = {};
      for (let g = 1; g <= 5; g += 1) {
        grupos[`G${g}`] = ["A", "B", "C"].map((suffix) => {
          const code = `${cat}-G${g}-${suffix}`;
          parejas[code] = { personas: [`${code}-P1`, `${code}-P2`], no_disponible: [] };
          return code;
        });
      }
      categorias[cat] = { sexo: "H", nivel: 1, grupos };
    }
    const payload: Exchange = {
      meta: {
        name: "Grande",
        startDate: "2026-11-05",
        endDate: "2026-11-06",
        courts: 2,
      },
      calendario: [
        { dia: "Sab", inicio: "08:00", bloques: 3, fase: "previa", extension: false },
        { dia: "Dom", inicio: "08:00", bloques: 2, fase: "final", extension: false },
      ],
      capacidad_especial: {},
      categorias,
      parejas,
    };
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({ code: "instance_too_large", path: "torneo" }),
    );
  });
});

describe("parseTournamentInput — acumulación", () => {
  it("devuelve todos los errores, no solo el primero", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-B", "GHOST"];
    payload.categorias["1ra"].grupos.G2 = ["1ra-G1-A", "1ra-G1-C", "1ra-G1-D"];
    addPairs(payload, [["1ra-G1-D", ["P7", "P8"]]]);
    const codes = errorsOf(payload).map((error) => error.code);
    expect(codes.length).toBeGreaterThanOrEqual(2);
    expect(codes).toEqual(expect.arrayContaining(["orphan_team", "duplicate_team"]));
  });
});
