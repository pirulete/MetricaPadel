/**
 * Escenario demo del spike (3 pasos, 4 jugadores) en metros de cancha.
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO de DATA: sólo objetos/strings/números planos, sin imports de
 * `konva`/`react` ni funciones. Es serializable a JSON sin pérdida (AC-07), de
 * modo que mañana podría cargarse desde backend sin tocar la escena.
 *
 * Orientación NORTE→SUR (FIP): eje Y 0..20 (Y=0 norte, Y=20 sur), red en
 * Y=10, ancho X 0..10. Equipo Norte = A, B; equipo Sur = C, D. Las flechas de
 * MOVIMIENTO de jugadores (negras) se derivan de `positions` entre pasos; el
 * campo `shot` sólo describe el tiro de la pelota (flecha verde — la pelota en
 * sí no se dibuja). `label` alimenta la región `aria-live` (AC-12).
 */

import type { CourtScenario } from "./types";

/** Escenario demo: globo al noreste, cobertura y cruzado al fondo suroeste. */
export const DEMO_SCENARIO: CourtScenario = {
  id: "demo-globo-y-cruzado",
  title: "Demo: globo al noreste y cruzado al fondo",
  initialStepIndex: 0,
  steps: [
    {
      id: 1,
      label: "Paso 1: equipos colocados, Norte (A, B) y Sur (C, D)",
      positions: {
        A: { x: 3, y: 5 },
        B: { x: 7, y: 5 },
        C: { x: 3, y: 15 },
        D: { x: 7, y: 15 },
      },
      shot: null,
    },
    {
      id: 2,
      label: "Paso 2: C lanza un globo al noreste; A corre a cubrir y D ajusta",
      positions: {
        A: { x: 7.5, y: 2.5 },
        B: { x: 7, y: 5 },
        C: { x: 3, y: 15 },
        D: { x: 6, y: 13 },
      },
      shot: {
        from: { x: 3, y: 15 },
        to: { x: 8.5, y: 2 },
      },
    },
    {
      id: 3,
      label: "Paso 3: B cruza el tiro al fondo suroeste; C y D corren a defender",
      positions: {
        A: { x: 7.5, y: 2.5 },
        B: { x: 5, y: 8.5 },
        C: { x: 2, y: 17.5 },
        D: { x: 4, y: 15.5 },
      },
      shot: {
        from: { x: 5, y: 8.5 },
        to: { x: 1.5, y: 18 },
      },
    },
  ],
};
