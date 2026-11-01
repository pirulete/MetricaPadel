/**
 * Escenario demo del spike (3 pasos, 4 jugadores) en metros de cancha.
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO de DATA: sólo objetos/strings/números planos, sin imports de
 * `konva`/`react` ni funciones. Es serializable a JSON sin pérdida (AC-07), de
 * modo que mañana podría cargarse desde backend sin tocar la escena.
 *
 * Cancha de referencia 20×10 m (X 0..20 de pared a pared, Y 0..10 de fondo a
 * fondo). `label` alimenta la región `aria-live` del paso activo (AC-12).
 */

import type { CourtScenario } from "./types";

/** Escenario demo: tapar la pared, subir a la red y cerrar con un cruzado. */
export const DEMO_SCENARIO: CourtScenario = {
  id: "demo-tapar-pared",
  title: "Demo: tapar la pared y subir a la red",
  initialStepIndex: 0,
  steps: [
    {
      id: 1,
      label: "Paso 1: el jugador A tapa la pared derecha y C espera el globo",
      positions: {
        A: { x: 16.5, y: 8.5 },
        B: { x: 7, y: 8 },
        C: { x: 4.5, y: 2.5 },
        D: { x: 15, y: 2 },
      },
      trajectory: null,
    },
    {
      id: 2,
      label: "Paso 2: A sube a la red por la banda derecha y B cubre el centro",
      positions: {
        A: { x: 15.5, y: 4.2 },
        B: { x: 9.5, y: 6.2 },
        C: { x: 8.5, y: 2.2 },
        D: { x: 14.2, y: 1.8 },
      },
      trajectory: {
        player: "A",
        from: { x: 16.5, y: 8.5 },
        to: { x: 15.5, y: 4.2 },
      },
    },
    {
      id: 3,
      label: "Paso 3: B cruza el tiro a la esquina izquierda y C queda fuera de posición",
      positions: {
        A: { x: 15.5, y: 4.2 },
        B: { x: 10.5, y: 5.2 },
        C: { x: 3, y: 3.4 },
        D: { x: 13, y: 1.6 },
      },
      trajectory: {
        player: "B",
        from: { x: 10.5, y: 5.2 },
        to: { x: 3, y: 3.4 },
      },
    },
  ],
};
