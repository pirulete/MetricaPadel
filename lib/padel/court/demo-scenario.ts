/**
 * Escenario demo del spike (3 pasos, 4 jugadores) en metros de cancha.
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO de DATA: sólo objetos/strings/números planos, sin imports de
 * `konva`/`react` ni funciones. Es serializable a JSON sin pérdida (AC-07).
 *
 * Homologación PadelChess: eje Y 0..20 (Y=0 norte, Y=20 sur), red en Y=10.
 * Equipo Norte = A, B; equipo Sur = C, D. Los tiros son curvas Bézier
 * (`control`/`to`) con etiqueta en escena; el ORIGEN se deriva del JUGADOR
 * MÁS CERCANO al destino entre las posiciones del paso ANTERIOR
 * (`resolveHitter`) — la pelota siempre despega de los pies de un jugador
 * en t=0. `label` alimenta la región `aria-live` (AC-12).
 */

import type { CourtScenario } from "./types";

/**
 * Escenario demo: C remata desde la red al norte (A acude), luego B responde
 * con un drop al sur (C corre a cubrirla).
 *
 * Verificación de la regla del hitador (resolveHitter sobre posiciones del
 * paso anterior, cubierto por test en court-annotation.test.ts):
 *  - Paso 2 → desde P1: C(4.5,11) es el más cercano a (6,8)  [3.35 vs 4.47 B]
 *  - Paso 3 → desde P2: B(5,9.5) es el más cercano a (4,12)  [2.69 vs 4.03 C]
 */
export const DEMO_SCENARIO: CourtScenario = {
  id: "demo-remate-y-drop",
  title: "Demo: remate desde la red y drop al contrario",
  initialStepIndex: 0,
  steps: [
    {
      id: 1,
      label: "Paso 1: colocación inicial, Norte (A, B) y Sur (C, D)",
      positions: {
        A: { x: 3, y: 4 },
        B: { x: 8, y: 4 },
        C: { x: 4.5, y: 11 },
        D: { x: 3, y: 17 },
      },
      shot: null,
    },
    {
      id: 2,
      label: "Paso 2: C remata desde la red al norte y A corre a cubrir",
      positions: {
        A: { x: 5.5, y: 6.5 },
        B: { x: 5, y: 9.5 },
        C: { x: 4.5, y: 16 },
        D: { x: 8, y: 16 },
      },
      shot: {
        control: { x: 6.3, y: 10 },
        to: { x: 6, y: 8 },
        label: "REMATE",
      },
    },
    {
      id: 3,
      label: "Paso 3: B responde con un drop al sur y C corre a cubrirlo",
      positions: {
        A: { x: 4, y: 5.5 },
        B: { x: 5, y: 9.5 },
        C: { x: 5, y: 13.5 },
        D: { x: 7, y: 15 },
      },
      shot: {
        control: { x: 5.4, y: 11.1 },
        to: { x: 4, y: 12 },
        label: "DROP",
      },
    },
  ],
};
