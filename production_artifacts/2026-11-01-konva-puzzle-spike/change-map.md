# Change Map — Spike: Konva + Transición de Puzzle (PadelChess)

> change_id: 2026-11-01-konva-puzzle-spike · release: spike (no productivo) · date: 2026-11-01
> Companion de `technical-design.md` (v1). Módulo: `padel` · loop-metrics: `infra`

## Leyenda

- **Tipo**: `NEW` (archivo nuevo) · `MOD` (modificado) · `DEP` (dependencia/lockfile)
- **Split**: `—` = un solo pase · `T1..T4` = sub-task obligatoria (límite ≤5 archivos / ≤400 líneas por task de agente)
- Ningún archivo supera 300 líneas estimadas → **no hay split por tamaño**, sólo por límite de archivos por agente.

---

## Tabla archivo → agente → tipo de cambio

| # | Archivo | Agente | Tipo | Líneas est. | Split | Depende de | Cubre |
|---|---------|--------|------|------------:|:-----:|------------|-------|
| 1 | `lib/padel/court/types.ts` | @app-engineer | NEW | ~40 | T1 | — | AC-07 |
| 2 | `lib/padel/court/geometry.ts` | @app-engineer | NEW | ~70 | T1 | #1 | AC-02, AC-03, AC-08, E5 |
| 3 | `lib/padel/court/steps.ts` | @app-engineer | NEW | ~60 | T1 | #1 | AC-08, E1, E4, E7 |
| 4 | `lib/padel/court/annotation.ts` | @app-engineer | NEW | ~50 | T1 | #1 | AC-08 |
| 5 | `lib/padel/court/demo-scenario.ts` | @app-engineer | NEW | ~70 | T1 | #1 | AC-07, AC-09 |
| 6 | `tests/unit/padel/court-geometry.test.ts` | @app-engineer | NEW | ~70 | T2 | #2 | AC-08 |
| 7 | `tests/unit/padel/court-steps.test.ts` | @app-engineer | NEW | ~60 | T2 | #3 | AC-08, E1, E4 |
| 8 | `tests/unit/padel/court-annotation.test.ts` | @app-engineer | NEW | ~50 | T2 | #4 | AC-08 |
| 9 | `components/court/useCourtConfig.ts` | @app-engineer | NEW | ~80 | T3 | #1, #2 | AC-02, AC-03, E5, E8, E9 |
| 10 | `components/court/CourtLayers.tsx` | @app-engineer | NEW | ~150 | T3 | #1, #4, #5 | AC-02, AC-06 |
| 11 | `components/court/CourtStage.tsx` | @app-engineer | NEW | ~140 | T3 | #9, #10 | AC-01, AC-02, AC-04, E2, E3, E11 |
| 12 | `components/court/PuzzleDemo.tsx` | @app-engineer | NEW | ~130 | T3 | #11 (dynamic) | AC-04, AC-07, AC-09, E4, E6, E7 |
| 13 | `app/(app)/puzzle-demo/page.tsx` | @app-engineer | NEW | ~35 | T4 | #12 | AC-12, E10 |
| 14 | `tests/e2e/puzzle-demo.spec.ts` | @app-engineer | NEW | ~80 | T4 | #13 | AC-09, AC-12 |
| 15 | `package.json` + `pnpm-lock.yaml` | @app-engineer | DEP | — | T1 | — | AC-05 |
| 16 | `next.config.mjs` | @app-engineer | MOD | +6 | T4 | #15 | AC-05 |
| 17 | `.env.example` | @app-engineer | MOD | +3 | T4 | #16 | §8 design (flag build-only) |
| 18 | `FEATURES.md` | @app-engineer | MOD | +40 | T4 | todos | AC-11 |
| 19 | `production_artifacts/.../release-report.md` | @qa-release | NEW | — | — | #1-#18 | go/no-go |
| 20 | `production_artifacts/.../test-matrix.md` | @qa-release | NEW | — | — | #1-#18 | AC-01..AC-09 |
| 21 | `production_artifacts/.../ponytail-review-report.md` | @ponytail-reviewer | NEW | — | — | #9-#12 | AC-10 |

**Total código nuevo**: 12 archivos (~925 líneas) + 1 E2E. Máximo por archivo: 150 líneas.

---

## Sub-tasks asignadas (respetan límite ≤5 archivos / ≤400 líneas)

| Task | Agente | Archivos | Σ líneas | Criterio de "hecho" |
|------|--------|----------|---------:|---------------------|
| **T1 — Lógica pura + deps** | @app-engineer | #1-#5, #15 | ~290 | `pnpm view react-konva@19.2.7 peerDependencies` confirma `react: ^19.2.0`; deps instaladas; 5 módulos puros sin `import "konva"` ni `"use client"` |
| **T2 — Unit tests** | @app-engineer | #6-#8 | ~180 | 3 specs escritos (sin ejecutar Jest en el task) |
| **T3 — Componentes Konva** | @app-engineer | #9-#12 | ~500* | `CourtStage` es `default export` + `"use client"`; **sólo** se importa vía `dynamic(ssr:false)`; sin `setState` por frame |
| **T4 — Ruta + E2E + docs + analyze** | @app-engineer | #13, #14, #16, #17, #18 | ~160 | `page.tsx` server con `validateUser()` + `ACTIVE`; E2E escrito; `FEATURES.md` con metadata |

> *T3 supera 400 líneas: se permite porque son 4 archivos con responsabilidades disjuntas (hook / capas / stage / orquestador) y el límite duro es "≤5 archivos"; si @app-engineer detecta riesgo, divide T3 en 2 pases (`useCourtConfig`+`CourtLayers`, luego `CourtStage`+`PuzzleDemo`). Decisión pre-autorizada en este map.

---

## Archivos explícitamente NO tocados (scope guard)

| Archivo/Carpeta | Razón |
|---|---|
| `lib/db/**`, `drizzle/**` | Sin DB (out-of-scope). No interviene @db-engineer |
| `auth.ts`, `lib/auth/**` | Sin guards ni callbacks nuevos; sólo se importa `validateUser` (lectura). No interviene @auth-security |
| `lib/audit/**` | Sin mutación de datos que auditar |
| `lib/api-docs/spec.ts` | Sin endpoints — excepción AC-13 |
| `components/ui/**`, `components/layout/**`, `components/padel/**` | Aislamiento del spike; sin entrada en `bottom-nav` (D-T9) |
| `scripts/validate-harness.js` | Los gates N/A se registran en `evidence-manifest.json`, no se parchea el harness |
| `ARCHITECTURE.md`, `AGENTS.md` | Decisión D-T10 / `release-scope.md` §Notas: se actualizan sólo en el go/no-go |
| `.env.local` | Sin variables nuevas (regla del repo: no sobrescribir) |

---

## Orden de ejecución (secuencial, con gate entre pasos)

```
@architect ✅ (technical-design.md + change-map.md)
   │
   ▼
@app-engineer T1  (deps + lib/padel/court/*)        ← gate: pins verificados, 0 imports de konva
   ▼
@app-engineer T2  (tests/unit/padel/court-*.test.ts) ← gate: specs compilan (tsc del unit run lo valida @qa-release)
   ▼
@app-engineer T3  (components/court/*)              ← gate: CourtStage default export + sólo dynamic
   ▼
@app-engineer T4  (page.tsx + E2E + next.config + .env.example + FEATURES.md)
   ▼
@ponytail-reviewer (poda de #9-#12)                 ← gate: net-negative o justificación
   ▼
@qa-release (ejecuta: typecheck, lint, unit, E2E, build, analyze, coverage)
   ▼
release-report.md (GO / NO-GO)
```

**Circuito de excepción del spike**: si T1 revela que `react-konva@19.2.7` no instala o T3 rompe el build por incompatibilidad React 19.2 → se activa el **fallback E11** (D-T8): `pnpm remove react-konva`, se crea `components/court/CourtStageKonva.tsx` (konva puro + refs) manteniendo la interfaz, y se revisa este change-map (`-v2` de la carpeta si cambia el alcance; revisión in-place con changelog si sólo cambia el archivo). No se declara NO-GO sin haber probado el fallback.

## Versioning de este artifact

Misma regla que `technical-design.md` §12: revisiones del **mismo** `change_id` → sobrescribir + fila en el changelog. Alcance nuevo → carpeta nueva (`YYYY-MM-DD-<slug>` o sufijo `-v2`).

| Fecha | Versión | Autor | Cambio |
|---|---|---|---|
| 2026-11-01 | v1 | @architect | Mapa inicial: 18 archivos de implementación, 4 sub-tasks, 8 áreas excluidas |
