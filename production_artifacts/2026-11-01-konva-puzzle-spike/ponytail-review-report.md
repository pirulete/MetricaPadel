# Ponytail Review — Spike Konva + transición de puzzle

> change_id: 2026-11-01-konva-puzzle-spike
> reviewer: @ponytail-reviewer
> fecha: 2026-11-01
> veredicto: **APROBADO SIN REFACTOR (net zero)**

## Cambios revisados

| Archivo | Líneas | Veredicto |
|---------|--------|-----------|
| `components/court/CourtStage.tsx` | 182 | Mínimo. Animación por refs + tween, una pasada por paso |
| `components/court/CourtLayers.ts` | 175 | Mínimo. Prop-builders puros, sin estado ni clases |
| `components/court/PuzzleDemo.tsx` | 75 | Mínimo. `useMemo` del viewport es necesario (identidad de objeto → evita re-efectos) |
| `components/court/useCourtConfig.ts` | 85 | Mínimo para su contrato documentado |
| `lib/padel/court/types.ts` | 53 | Solo tipos/constantes, cero lógica |
| `lib/padel/court/geometry.ts` | 77 | Funciones puras de 1–4 líneas efectivas |
| `lib/padel/court/steps.ts` | 70 | Idem |
| `lib/padel/court/annotation.ts` | 74 | Idem |
| `lib/padel/court/demo-scenario.ts` | 63 | Data plana serializable (AC-07), sin funciones |
| `app/(app)/puzzle-demo/page.tsx` | 32 | Server Component + guard, sin duplicar lógica de auth |
| `tests/e2e/puzzle-demo.spec.ts` | 86 | Flujo único happy path + 401 (AC-09/AC-12) |
| `tests/unit/padel/court-*.test.ts` | 370 | Solo lógica pura (D8), sin jsdom/Konva |
| `next.config.mjs` | +6 | Wrapper opt-in `ANALYZE=true`, no-op por defecto (AC-05) |
| `package.json` | +3 | Solo las 3 deps justificadas por el spec (konva, react-konva, bundle-analyzer) |
| `.env.example` | +2 | Comentario de `ANALYZE`, sin var nueva real |

## Abstracciones eliminadas o simplificadas

Ninguna. No se encontró sobreingeniería que borrar sin romper contrato documentado o AC:

- Sin fábricas, providers, clase base, adapters ni capa de "strategy". El árbol es hook → prop-builders puros → Stage.
- Sin dependencias añadidas por el reviewer (las 3 del spec son las del diseño aprobado).
- Sin duplicación de lógica de negocio: la conversión cancha→px vive en `geometry.ts` y nadie la reimplementa; `CourtLayers` solo compone props.
- Sin render-por-frame con estado React (AC-04): un solo `setState` por paso.
- `Konva` se importa en exactamente 1 archivo (`CourtStage.tsx`), como exige D-T4.

### Candidatos evaluados y NO tocados (con motivo)

| Candidato | Motivo de no tocar |
|-----------|--------------------|
| `applyDpr` (`geometry.ts`) — sin consumidor en producción (el DPR real se aplica con `layer.getCanvas().setPixelRatio`) | Documentado en technical-design (tabla de archivos) y en el plan de tests ("`applyDpr` no deforma", AC-02). Borrarlo obliga a editar design + app-notes y deja AC-02 sin su test de cálculo proporcional. Es 4 líneas puras, no un wrapper. |
| `resolveStepTransition` / `isSameStep` (`steps.ts`) — solo usados por unit tests | AC-08 exige explícitamente la "máquina determinista de pasos N→M" con test unitario. El helper es el objeto del AC, no código prescindible. |
| `scale`/`offsetX`/`offsetY`/`courtToPx` devueltos por `useCourtConfig` y no consumidos por `PuzzleDemo` | Es la API declarada en technical-design (fila 5) y en release-scope; forma parte del entregable "patrón reutilizable" del spike. Recortarla desincroniza los artifacts sin ganancia real (14 líneas). |
| `CourtScale = number` (`geometry.ts`) | Alias trivial, pero documenta la unidad (px/m) en la firma. Coste cero. |
| Doble guard `isReady` (PuzzleDemo y CourtStage) | `CourtStage` es un componente exportado e importado por `dynamic()`: su guard E5 debe ser autónomo. |
| `buildArrow` calculado en render y en el `useLayoutEffect` | El efecto necesita el `length` con el viewport vigente antes de animar; cachearlo añadiría estado/ref extra (más código, no menos). |

## Líneas eliminadas vs agregadas

| Concepto | Líneas |
|----------|--------|
| Eliminadas | 0 |
| Agregadas | 0 |
| **Net** | **0** |

## Beneficio

Spike desechable por diseño: el coste de mantenibilidad es cero después del go/no-go (todos los archivos están marcados "SPIKE NO PRODUCTIVO — borrable"). El código ya cumple la escalera Ponytail: YAGNI (solo lo que piden los AC), plataforma nativa (`react-konva`, `ResizeObserver`, `window.devicePixelRatio`, `next/dynamic` — sin utilidades propias para nada de eso), deps existentes (`@/components/ui` para los controles, `validateUser` para el guard) y Regla de la Línea Única (las funciones puras efectivas son de 1–4 líneas).

## Excepciones

No se eliminó código porque no había código prescindible: cualquier borrado habría violado el contrato del technical-design o un AC (AC-02, AC-08) sin reducir complejidad real. Net zero es el resultado correcto para un spike que solo valida un camino técnico.

## Git status posterior

Sin cambios de código. Único archivo nuevo: este reporte.
