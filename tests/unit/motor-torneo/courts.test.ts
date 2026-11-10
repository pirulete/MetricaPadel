/**
 * Unit tests del voraz de canchas (`lib/motor-torneo/courts.ts`, puerto de
 * `asignar_canchas`).
 *
 * Se asertan **preferencias** (repetición de cancha de la previa, cancha
 * heredada por la final desde sus alimentadores) y el **fallback determinista**
 * (orden ascendente de bloque, `sort` de partidos por id, `shift` de la primera
 * cancha libre). No se usa el motor ni WASM: `assignCourts` es puro.
 */
import { assignCourts } from "@/lib/motor-torneo/courts";
import type { Instancia, Partido } from "@/lib/motor-torneo/types";

function partido(
  id: string,
  phase: Partido["phase"],
  grupo: string | null = null,
  alimentadores: string[] = [],
): Partido {
  return {
    id,
    categoria: "X",
    phase,
    ronda: phase === "previa" ? "grupo" : "final",
    grupo,
    parejas: phase === "previa" ? [] : null,
    gruposOrigen: [],
    alimentadores,
  };
}

/** Instancia mínima: `assignCourts` solo lee `nCanchas` y `partidos`. */
function makeInst(partidos: Partido[], nCanchas: number): Instancia {
  const map: Record<string, Partido> = {};
  for (const p of partidos) map[p.id] = p;
  return {
    bloques: [],
    nCanchas,
    categorias: {},
    grupos: {},
    parejas: {},
    personas: {},
    partidos: map,
  };
}

describe("assignCourts", () => {
  it("la previa repite la cancha del bloque anterior del mismo grupo", () => {
    // Bloque 0: a1 (otro grupo) toma cancha 1 ⇒ a2 (grupo G) queda en 2.
    // Bloque 1: a3 (grupo G) debe heredar la cancha 2 de su bloque previo.
    const inst = makeInst(
      [partido("a1", "previa", "GX"), partido("a2", "previa", "G"), partido("a3", "previa", "G")],
      2,
    );
    const cancha = assignCourts(inst, { a1: 0, a2: 0, a3: 1 });

    expect(cancha).toEqual({ a1: 1, a2: 2, a3: 2 });
  });

  it("la final hereda la cancha de su alimentador", () => {
    // a1 queda en cancha 2 (a0 se lleva la 1). La final b1 hereda 2.
    const inst = makeInst(
      [partido("a0", "previa", "GX"), partido("a1", "previa", "GY"), partido("b1", "final", null, ["a1"])],
      2,
    );
    const cancha = assignCourts(inst, { a0: 0, a1: 0, b1: 1 });

    expect(cancha.b1).toBe(2);
  });

  it("ignora un alimentador sin cancha asignada y hereda del siguiente", () => {
    // `zz` no tiene cancha (undefined): se salta y la final hereda la 2 de a1.
    const inst = makeInst(
      [partido("a0", "previa", "GX"), partido("a1", "previa", "GY"), partido("c1", "final", null, ["zz", "a1"])],
      2,
    );
    const cancha = assignCourts(inst, { a0: 0, a1: 0, c1: 1 });

    expect(cancha.c1).toBe(2);
  });

  it("procesa bloques en orden ascendente (la preferencia depende del orden)", () => {
    // `bloqueDe` inserta b1 (bloque 1) antes que el bloque 0. La previa a1 se
    // lleva la cancha 1 y a2 (grupo G) la 2; b1 debe esperar al bloque 0 para
    // heredar la 2 de su grupo.
    const inst = makeInst(
      [partido("a1", "previa", "GX"), partido("a2", "previa", "G"), partido("b1", "previa", "G")],
      2,
    );
    const cancha = assignCourts(inst, { b1: 1, a1: 0, a2: 0 });

    expect(cancha).toEqual({ a1: 1, a2: 2, b1: 2 });
  });

  it("fallback determinista por id y sin cancha cuando se agotan", () => {
    // Ids insertados desordenados: el `sort()` interno debe asignar m1→1, m2→2.
    const inst = makeInst(
      [partido("m3", "previa", "Z"), partido("m1", "previa", "X"), partido("m2", "previa", "Y")],
      2,
    );
    const cancha = assignCourts(inst, { m1: 0, m2: 0, m3: 0 });

    expect(cancha).toEqual({ m1: 1, m2: 2 });
    expect("m3" in cancha).toBe(false);
  });

  it("no registra repetición para una previa que quedó sin cancha", () => {
    // 3 previas del mismo grupo en 2 canchas: g3 no recibe cancha y NO debe
    // pisar la cancha recordada (g2 → 2). El bloque 1 hereda la 2, no la 1.
    const inst = makeInst(
      [
        partido("g1", "previa", "G"),
        partido("g2", "previa", "G"),
        partido("g3", "previa", "G"),
        partido("g4", "previa", "G"),
      ],
      2,
    );
    const cancha = assignCourts(inst, { g1: 0, g2: 0, g3: 0, g4: 1 });

    expect(cancha).toEqual({ g1: 1, g2: 2, g4: 2 });
    expect("g3" in cancha).toBe(false);
  });
});
