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

  it("R0: basta con que UNA pareja bloquee todos los bloques (lado A)", () => {
    // Sólo A bloquea: el `&&` mutante descarta su Set y el partido pasaría.
    const payload = miniExchange();
    payload.parejas["1ra-G1-A"].no_disponible = [0, 1, 2];
    expect(errorsOf(payload)).toContainEqual(
      expect.objectContaining({
        code: "match_without_allowed_block",
        path: "partidos[1ra-G1-P1]",
      }),
    );
  });

  it("R0: basta con que UNA pareja bloquee todos los bloques (lado B)", () => {
    const payload = miniExchange();
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

// ---------------------------------------------------------------------------
// Mutation hardening 3c: bordes de schema (mensajes y límites exactos)
// ---------------------------------------------------------------------------

/** Primer `invalid_schema` con `path` exacto (falla con el listado si no existe). */
function issueAt(payload: unknown, path: string) {
  const result = parseTournamentInput(payload);
  if (result.ok) throw new Error(`se esperaba un payload inválido (sin error en ${path})`);
  const issue = result.errors.find((error) => error.path === path);
  if (!issue) {
    throw new Error(`sin error en ${path}: ${result.errors.map((error) => error.path).join(" | ")}`);
  }
  return issue;
}

function expectInvalid(payload: unknown) {
  expect(parseTournamentInput(payload).ok).toBe(false);
}

describe("parseTournamentInput — bordes de schema", () => {
  it("rechaza startDate/endDate con formato distinto de YYYY-MM-DD", () => {
    const invalidos = [
      "2026-11-5",
      "abcd-11-05",
      "2026-1-05",
      "2026-aa-05",
      "2026-11-0a",
      "x2026-11-05",
      "2026-11-05x",
    ];
    for (const value of invalidos) {
      const start = miniExchange();
      start.meta.startDate = value;
      expect(issueAt(start, "meta.startDate")).toMatchObject({
        code: "invalid_schema",
        message: "formato esperado YYYY-MM-DD",
      });

      const end = miniExchange();
      end.meta.endDate = value;
      expect(issueAt(end, "meta.endDate")).toMatchObject({
        code: "invalid_schema",
        message: "formato esperado YYYY-MM-DD",
      });
    }
  });

  it("rechaza inicio con formato distinto de HH:mm", () => {
    const invalidos = ["24:00", "0a:00", "x08:00", "08:00x", "88:00", "08:60", "7:30"];
    for (const value of invalidos) {
      const payload = miniExchange();
      payload.calendario[0].inicio = value;
      expect(issueAt(payload, "calendario.0.inicio")).toMatchObject({
        code: "invalid_schema",
        message: "formato esperado HH:mm",
      });
    }
  });

  it("acota dia a 1..3 caracteres", () => {
    const vacio = miniExchange();
    vacio.calendario[0].dia = "";
    expect(issueAt(vacio, "calendario.0.dia")).toMatchObject({
      message: "dia es requerido",
    });

    const largo = miniExchange();
    largo.calendario[0].dia = "Sabad";
    expect(issueAt(largo, "calendario.0.dia")).toMatchObject({
      message: "dia admite hasta 3 caracteres",
    });
  });

  it("acota bloques a entero 1..24", () => {
    for (const bloques of [0, 25]) {
      const payload = miniExchange();
      payload.calendario[0].bloques = bloques;
      expect(issueAt(payload, "calendario.0.bloques").code).toBe("invalid_schema");
    }

    const noEntero = miniExchange();
    noEntero.calendario[0].bloques = 1.5;
    expect(issueAt(noEntero, "calendario.0.bloques").message).toBe("bloques debe ser un entero");
  });

  it("acota meta.name a 1..200 caracteres", () => {
    const vacio = miniExchange();
    vacio.meta.name = "";
    expect(issueAt(vacio, "meta.name").message).toBe("name es requerido");

    const largo = miniExchange();
    largo.meta.name = "x".repeat(201);
    expect(issueAt(largo, "meta.name").code).toBe("invalid_schema");
  });

  it("acota meta.courts a entero 1..24", () => {
    for (const courts of [0, 25]) {
      const payload = miniExchange();
      payload.meta.courts = courts;
      expect(issueAt(payload, "meta.courts").code).toBe("invalid_schema");
    }

    const noEntero = miniExchange();
    noEntero.meta.courts = 1.5;
    expect(issueAt(noEntero, "meta.courts").message).toBe("courts debe ser un entero");
  });

  it("acota blockMinutes a entero 30..120", () => {
    for (const blockMinutes of [29, 121, 1.5]) {
      const payload = miniExchange();
      payload.meta.blockMinutes = blockMinutes;
      expectInvalid(payload);
    }
  });

  it("acota personas (tuple de 2 strings de 1..50)", () => {
    const una = miniExchange();
    una.parejas["1ra-G1-A"].personas = ["P1"] as unknown as [string, string];
    expect(issueAt(una, "parejas.1ra-G1-A.personas").code).toBe("invalid_schema");

    const tres = miniExchange();
    tres.parejas["1ra-G1-A"].personas = ["P1", "P2", "P3"] as unknown as [string, string];
    expect(issueAt(tres, "parejas.1ra-G1-A.personas").code).toBe("invalid_schema");

    const vacia = miniExchange();
    vacia.parejas["1ra-G1-A"].personas = ["", "P2"];
    expect(issueAt(vacia, "parejas.1ra-G1-A.personas.0").message).toBe("persona requerida");

    const largo = miniExchange();
    largo.parejas["1ra-G1-A"].personas = ["P1", "x".repeat(51)];
    expectInvalid(largo);
  });

  it("acota sexo (H|M) y nivel (1..10)", () => {
    const invalido = miniExchange();
    invalido.categorias["2da"] = {
      sexo: "X" as unknown as "H",
      nivel: 2,
      grupos: { G1: ["1ra-G1-A", "1ra-G1-D", "1ra-G1-E"] },
    };
    expect(issueAt(invalido, "categorias.2da.sexo").code).toBe("invalid_schema");

    for (const nivel of [0, 11]) {
      const payload = miniExchange();
      payload.categorias["1ra"].nivel = nivel;
      expect(issueAt(payload, "categorias.1ra.nivel").code).toBe("invalid_schema");
    }
  });

  it("acepta sexo H y M, y nivel omitido como null", () => {
    const payload = miniExchange();
    payload.categorias["2da"] = {
      sexo: "M",
      grupos: { G1: ["2da-G1-A", "2da-G1-B", "2da-G1-C"] },
    };
    addPairs(payload, [
      ["2da-G1-A", ["P11", "P12"]],
      ["2da-G1-B", ["P13", "P14"]],
      ["2da-G1-C", ["P15", "P16"]],
    ]);
    const result = parseTournamentInput(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories.map((categoria) => categoria.sex).sort()).toEqual(["H", "M"]);
    expect(result.data.categories.find((categoria) => categoria.code === "2da")?.level).toBeNull();
  });

  it("acota las claves de grupos y parejas (varchar)", () => {
    const grupoLargo = miniExchange();
    grupoLargo.categorias["1ra"].grupos["G1234567"] = ["1ra-G1-A", "1ra-G1-B", "1ra-G1-C"];
    expectInvalid(grupoLargo);

    const grupoValorLargo = miniExchange();
    grupoValorLargo.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-B", "x".repeat(21)];
    expectInvalid(grupoValorLargo);

    const categoriaLarga = miniExchange();
    categoriaLarga.categorias["12345678901"] = { sexo: "H", grupos: {} };
    expectInvalid(categoriaLarga);

    const parejaLarga = miniExchange();
    parejaLarga.parejas["x".repeat(21)] = { personas: ["P20", "P21"], no_disponible: [] };
    expectInvalid(parejaLarga);
  });

  it("exige al menos 1 tramo de calendario", () => {
    const payload = miniExchange();
    payload.calendario = [];
    expect(issueAt(payload, "calendario").message).toBe("calendario requiere al menos 1 tramo");
  });

  it("valida capacidad_especial (clave índice y valor 0..24)", () => {
    for (const capacidad of [{ abc: 2 }, { "0": 25 }, { "0": -1 }, { "0": 1.5 }]) {
      const payload = miniExchange();
      payload.capacidad_especial = capacidad as unknown as Record<string, number>;
      expectInvalid(payload);
    }
  });

  it("aplica capacidad_especial a los bloques derivados", () => {
    const payload = referenceExchange();
    payload.capacidad_especial = { "7": 1 };
    const result = parseTournamentInput(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.blocks[7].capacity).toBe(1);
    expect(result.data.blocks[6].capacity).toBe(8);
  });

  it("rechaza códigos de grupo que superan varchar(10)", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos = { G1234567: ["1ra-G1-A", "1ra-G1-B", "1ra-G1-C"] };
    expect(errorsOf(payload)).toContainEqual({
      code: "invalid_schema",
      path: "categorias[1ra].grupos[G1234567]",
      message: "El código de grupo 1ra-G1234567 supera varchar(10).",
    });
  });

  it("acepta un código de grupo de exactamente 10 caracteres (límite `>`, no `>=`)", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos = {
      G12345: ["1ra-G12345-A", "1ra-G12345-B", "1ra-G12345-C"],
    };
    payload.parejas = {
      "1ra-G12345-A": { personas: ["P1", "P2"], no_disponible: [] },
      "1ra-G12345-B": { personas: ["P3", "P4"], no_disponible: [] },
      "1ra-G12345-C": { personas: ["P5", "P6"], no_disponible: [] },
    };
    expect(parseTournamentInput(payload).ok).toBe(true);
  });

  it("código de categoría de 10 caracteres: supera solo el grupo, no la categoría", () => {
    // `> 10` (no `>= 10`): la categoría de 10 chars es válida; el grupo derivado
    // (13 chars) es el que rompe. Un `>=` añadiría el error de categoría.
    const payload = miniExchange();
    payload.categorias = {
      ABCDEFGHIJ: {
        sexo: "H",
        nivel: 1,
        grupos: { G1: ["ABCDEFGHIJ-G1-A", "ABCDEFGHIJ-G1-B", "ABCDEFGHIJ-G1-C"] },
      },
    };
    payload.parejas = {
      "ABCDEFGHIJ-G1-A": { personas: ["P1", "P2"], no_disponible: [] },
      "ABCDEFGHIJ-G1-B": { personas: ["P3", "P4"], no_disponible: [] },
      "ABCDEFGHIJ-G1-C": { personas: ["P5", "P6"], no_disponible: [] },
    };
    const paths = errorsOf(payload).map((error) => error.path);
    expect(paths).toContain("categorias[ABCDEFGHIJ].grupos[G1]");
    expect(paths).not.toContain("categorias[ABCDEFGHIJ]");
  });

  it("acumula el path anidado de los issues de schema", () => {
    expect(issueAt({ meta: {} }, "meta.name").path).toBe("meta.name");
    const sinInicio = miniExchange();
    sinInicio.calendario[0].inicio = "25:00";
    expect(issueAt(sinInicio, "calendario.0.inicio").path).toBe("calendario.0.inicio");
  });
});

describe("parseTournamentInput — mensajes exactos de las reglas", () => {
  it("R5: mensaje del tamaño de grupo", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-B"];
    expect(errorsOf(payload)).toContainEqual({
      code: "group_invalid_size",
      path: "categorias[1ra].grupos[G1]",
      message: "El grupo 1ra-G1 tiene 2 parejas (se esperan 3 o 4).",
    });
  });

  it("R1: mensaje de pareja no definida (huérfana en el grupo)", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-B", "1ra-G1-GHOST"];
    expect(errorsOf(payload)).toContainEqual({
      code: "orphan_team",
      path: "categorias[1ra].grupos[G1][2]",
      message: "La pareja 1ra-G1-GHOST no está definida en parejas.",
    });
  });

  it("R1: mensaje de pareja repetida en la misma categoría", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G1 = ["1ra-G1-A", "1ra-G1-A", "1ra-G1-B"];
    expect(errorsOf(payload)).toContainEqual({
      code: "duplicate_team",
      path: "categorias[1ra].grupos[G1][1]",
      message: "La pareja 1ra-G1-A aparece más de una vez en la categoría 1ra.",
    });
  });

  it("R1: mensaje de pareja en dos categorías (lista las previas)", () => {
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
    expect(errorsOf(payload)).toContainEqual({
      code: "team_in_two_categories",
      path: "categorias[2da].grupos[G1][0]",
      message: "La pareja 1ra-G1-A está en las categorías 1ra y 2da.",
    });
  });

  it("R1: tres categorías se listan separadas por coma", () => {
    const payload = miniExchange();
    payload.categorias["2da"] = {
      sexo: "H",
      nivel: 2,
      grupos: { G1: ["1ra-G1-A", "1ra-G1-D", "1ra-G1-E"] },
    };
    payload.categorias["3ra"] = {
      sexo: "H",
      nivel: 3,
      grupos: { G1: ["1ra-G1-A", "1ra-G1-F", "1ra-G1-G"] },
    };
    addPairs(payload, [
      ["1ra-G1-D", ["P7", "P8"]],
      ["1ra-G1-E", ["P9", "P10"]],
      ["1ra-G1-F", ["P11", "P12"]],
      ["1ra-G1-G", ["P13", "P14"]],
    ]);
    expect(errorsOf(payload)).toContainEqual({
      code: "team_in_two_categories",
      path: "categorias[3ra].grupos[G1][0]",
      message: "La pareja 1ra-G1-A está en las categorías 1ra, 2da y 3ra.",
    });
  });

  it("R1: mensaje de pareja sin ningún grupo", () => {
    const payload = miniExchange();
    addPairs(payload, [["1ra-G1-D", ["P7", "P8"]]]);
    expect(errorsOf(payload)).toContainEqual({
      code: "orphan_team",
      path: "parejas[1ra-G1-D]",
      message: "La pareja 1ra-G1-D no está en ningún grupo.",
    });
  });

  it("R2: mensaje de persona en dos parejas de la misma categoría", () => {
    const payload = miniExchange();
    payload.categorias["1ra"].grupos.G2 = ["1ra-G1-D", "1ra-G1-E", "1ra-G1-F"];
    addPairs(payload, [
      ["1ra-G1-D", ["P1", "P7"]],
      ["1ra-G1-E", ["P8", "P9"]],
      ["1ra-G1-F", ["P10", "P11"]],
    ]);
    expect(errorsOf(payload)).toContainEqual({
      code: "person_two_teams_same_category",
      path: "parejas[1ra-G1-D].personas[0]",
      message: "La persona P1 está en más de una pareja de la categoría 1ra.",
    });
  });

  it("R3: mensaje de bloque inexistente fuera de la previa", () => {
    const payload = miniExchange();
    payload.parejas["1ra-G1-A"].no_disponible = [3];
    expect(errorsOf(payload)).toContainEqual({
      code: "availability_invalid_block",
      path: "parejas[1ra-G1-A].no_disponible[0]",
      message: "El bloque 3 no existe o no es de fase previa.",
    });
  });

  it("R4: mensaje de exceso de bloques bloqueados", () => {
    const payload = referenceExchange();
    payload.parejas["2da-G1-A"].no_disponible = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(errorsOf(payload)).toContainEqual({
      code: "availability_too_many",
      path: "parejas[2da-G1-A].no_disponible",
      message: "La pareja 2da-G1-A bloquea 9 bloques (máximo 8).",
    });
  });

  it("R4: 8 bloques bloqueados es el límite permitido", () => {
    const payload = referenceExchange();
    payload.parejas["2da-G1-A"].no_disponible = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(parseTournamentInput(payload).ok).toBe(true);
  });

  it("R0: mensaje del partido sin bloque compatible", () => {
    const payload = miniExchange();
    payload.parejas["1ra-G1-A"].no_disponible = [0, 1, 2];
    payload.parejas["1ra-G1-B"].no_disponible = [0, 1, 2];
    expect(errorsOf(payload)).toContainEqual({
      code: "match_without_allowed_block",
      path: "partidos[1ra-G1-P1]",
      message:
        "El partido 1ra-G1-P1 no tiene ningún bloque de previa compatible con la disponibilidad de ambas parejas.",
    });
  });

  it("R0: sin bloques de previa sólo reporta los partidos de previa", () => {
    const payload = miniExchange();
    payload.calendario = [
      { dia: "Sab", inicio: "08:00", bloques: 2, fase: "final", extension: false },
    ];
    const errors = errorsOf(payload);
    expect(errors.map((error) => [error.code, error.path])).toEqual([
      ["match_without_allowed_block", "partidos[1ra-G1-P1]"],
      ["match_without_allowed_block", "partidos[1ra-G1-P2]"],
      ["match_without_allowed_block", "partidos[1ra-G1-P3]"],
    ]);
  });

  it("blockMinutes distinto de 75 reporta el mensaje de M1", () => {
    const payload = miniExchange();
    payload.meta.blockMinutes = 30;
    expect(errorsOf(payload)).toEqual([
      {
        code: "invalid_schema",
        path: "meta.blockMinutes",
        message: "El motor M1 solo soporta bloques de 75 min (recibido 30).",
      },
    ]);
  });

  it("blockMinutes omitido cae al default de 75", () => {
    const payload = miniExchange();
    delete payload.meta.blockMinutes;
    const result = parseTournamentInput(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.meta.blockMinutes).toBe(75);
  });

  it("normaliza no_disponible (único y ascendente) y expone persons", () => {
    const payload = miniExchange();
    payload.parejas["1ra-G1-A"].no_disponible = [2, 0, 2];
    const result = parseTournamentInput(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const team = result.data.categories[0].groups[0].teams.find((t) => t.code === "1ra-G1-A");
    expect(team).toEqual({ code: "1ra-G1-A", persons: ["P1", "P2"], unavailable: [0, 2] });
  });
});

describe("parseTournamentInput — R6 en el borde exacto", () => {
  /** 25 categorías × (15 previa + 9 cuadro) = 600 partidos; bloques = días × 19 (+10). */
  function bigExchange(extraTeam: boolean, dias = 10, bloquesPorDia = 19): Exchange {
    const categorias: Record<string, ExchangeCategoria> = {};
    const parejas: Record<string, ExchangePareja> = {};
    for (let c = 1; c <= 25; c += 1) {
      const cat = `T${String(c).padStart(2, "0")}`;
      const grupos: Record<string, string[]> = {};
      for (let g = 1; g <= 5; g += 1) {
        const teams = ["A", "B", "C"].map((suffix) => {
          const code = `${cat}-G${g}-${suffix}`;
          parejas[code] = { personas: [`${code}-1`, `${code}-2`], no_disponible: [] };
          return code;
        });
        if (extraTeam && c === 1 && g === 1) {
          const code = `${cat}-G${g}-D`;
          parejas[code] = { personas: [`${code}-1`, `${code}-2`], no_disponible: [] };
          teams.push(code);
        }
        grupos[`G${g}`] = teams;
      }
      categorias[cat] = { sexo: "H", nivel: 1, grupos };
    }

    const calendario: ExchangeTramo[] = [];
    for (let dia = 1; dia <= dias; dia += 1) {
      calendario.push({
        dia: `D${String(dia).padStart(2, "0")}`,
        inicio: "00:00",
        bloques: bloquesPorDia,
        fase: dia <= 5 ? "previa" : "final",
        extension: false,
      });
    }
    calendario.push({
      dia: `D${String(dias + 1).padStart(2, "0")}`,
      inicio: "00:00",
      bloques: 10,
      fase: "final",
      extension: false,
    });

    return {
      meta: { name: "Grande", startDate: "2026-11-05", endDate: "2026-11-06", courts: 8 },
      calendario,
      capacidad_especial: {},
      categorias,
      parejas,
    };
  }

  it("acepta exactamente 600 partidos × 200 bloques (120000 casillas)", () => {
    const result = parseTournamentInput(bigExchange(false));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches).toHaveLength(600);
    expect(result.data.blocks).toHaveLength(200);
  });

  it("rechaza 601 partidos con el mensaje del límite", () => {
    expect(errorsOf(bigExchange(true))).toEqual([
      {
        code: "instance_too_large",
        path: "torneo",
        message:
          "601 partidos × 200 bloques supera el límite (600 partidos, 120000 casillas).",
      },
    ]);
  });

  it("rechaza >120000 casillas aunque no se superen los 600 partidos", () => {
    // 600 partidos × 298 bloques = 178800 casillas: el límite de partidos no
    // dispara, sólo el producto (mata el `if` a `false` y el `*` a `/`).
    expect(errorsOf(bigExchange(false, 12, 24))).toEqual([
      {
        code: "instance_too_large",
        path: "torneo",
        message:
          "600 partidos × 298 bloques supera el límite (600 partidos, 120000 casillas).",
      },
    ]);
  });
});
