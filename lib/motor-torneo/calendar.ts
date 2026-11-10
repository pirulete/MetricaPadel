/**
 * Grilla de bloques de 75 minutos (puerto de `construir_bloques`,
 * `motor_torneo/instancia.py:37` + `CALENDARIO`).
 *
 * Fidelidad P-5/EC-17: nada de `Date`. Solo aritmética entera de minutos y
 * strings `HH:mm`.
 */
import type { Bloque, CalendarioTramo, TournamentPhase } from "./types";

/** Duración de un bloque en minutos. */
export const BLOQUE_MIN = 75;

/**
 * Calendario del torneo real: 38 bloques (22 de previa + 16 de final, de los
 * cuales 3 son extensión del domingo). Mismo orden y horarios que el prototipo.
 */
export const CALENDARIO: readonly CalendarioTramo[] = [
  { dayLabel: "Jue", startTime: "14:00", blocks: 7, phase: "previa", isExtension: false },
  { dayLabel: "Vie", startTime: "14:00", blocks: 7, phase: "previa", isExtension: false },
  { dayLabel: "Sab", startTime: "08:00", blocks: 8, phase: "previa", isExtension: false },
  { dayLabel: "Sab", startTime: "18:00", blocks: 4, phase: "final", isExtension: false },
  { dayLabel: "Dom", startTime: "08:00", blocks: 9, phase: "final", isExtension: false },
  { dayLabel: "Dom", startTime: "19:15", blocks: 3, phase: "final", isExtension: true },
];

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `"HH:mm"` → minutos desde medianoche. Lanza si el formato es inválido. */
export function parseHHmm(value: string): number {
  const match = HORA.exec(value);
  if (!match) {
    throw new Error(`Hora inválida "${value}": se espera HH:mm (00:00-23:59)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutos desde medianoche → `"HH:mm"` (mismo formato que Python `f"{h:02d}:{m:02d}"`). */
export function formatHHmm(minutes: number): string {
  const horas = Math.floor(minutes / 60);
  const resto = minutes % 60;
  return `${String(horas).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

/**
 * Valida que los tramos de un mismo día no se solapen (EC-09). La comparación
 * es por día, así que `Jue 14:00` y `Dom 14:00` conviven sin problema.
 */
export function assertNoOverlap(tramos: readonly CalendarioTramo[]): void {
  const porDia = new Map<
    string,
    Array<{ start: number; end: number; startTime: string }>
  >();

  for (const tramo of tramos) {
    if (!Number.isInteger(tramo.blocks) || tramo.blocks < 0) {
      throw new Error(
        `Tramo ${tramo.dayLabel} ${tramo.startTime}: bloques inválidos (${tramo.blocks})`,
      );
    }
    const start = parseHHmm(tramo.startTime);
    const end = start + tramo.blocks * BLOQUE_MIN;
    const previos = porDia.get(tramo.dayLabel) ?? [];

    for (const previo of previos) {
      if (start < previo.end && previo.start < end) {
        throw new Error(
          `Solape en ${tramo.dayLabel}: ${tramo.startTime} (${tramo.blocks} bloques) ` +
            `se cruza con el tramo de ${previo.startTime}`,
        );
      }
    }

    previos.push({ start, end, startTime: tramo.startTime });
    porDia.set(tramo.dayLabel, previos);
  }
}

/**
 * Construye la grilla de bloques. `idx` es 0..N-1 en el orden del calendario y
 * `startTime` avanza `BLOQUE_MIN` por bloque.
 *
 * `capacityOverrides` baja la capacidad en bloques puntuales (cancha reservada,
 * cancha sin luz): `{ 5: 6 }` ⇒ el bloque 5 tiene 6 canchas.
 */
export function buildBlocks(
  tramos: readonly CalendarioTramo[] = CALENDARIO,
  courts = 8,
  capacityOverrides: Readonly<Record<number, number>> = {},
): Bloque[] {
  if (!Number.isInteger(courts) || courts < 0) {
    throw new Error(`Canchas inválidas (${courts}): se espera un entero >= 0`);
  }
  assertNoOverlap(tramos);

  const bloques: Bloque[] = [];
  let idx = 0;

  for (const tramo of tramos) {
    let minutos = parseHHmm(tramo.startTime);
    for (let k = 0; k < tramo.blocks; k++) {
      const override = capacityOverrides[idx];
      const capacity = override === undefined ? courts : override;

      if (!Number.isInteger(capacity) || capacity < 0 || capacity > courts) {
        throw new Error(
          `Bloque ${idx}: capacidad ${capacity} fuera de rango [0, ${courts}]`,
        );
      }

      bloques.push({
        idx,
        dayLabel: tramo.dayLabel,
        startTime: formatHHmm(minutos),
        phase: tramo.phase as TournamentPhase,
        isExtension: tramo.isExtension,
        capacity,
      });

      minutos += BLOQUE_MIN;
      idx += 1;
    }
  }

  return bloques;
}
