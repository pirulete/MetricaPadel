# Change Map — Editor de Transiciones (coach/ADMIN)

> change_id: 2026-11-02-coach-transition-editor
> status: approved-for-implementation
> date: 2026-11-02
> module: padel
> owner: @architect
> **Versioning**: `v1` de la iniciativa. Revisiones → `change-map-v2.md`. No se sobrescribe.
> ⚠️ **SUPERSEDED por `change-map-v2.md`** (2026-11-02, plan C1–C10 → T1–T16). Este v1 se conserva como registro histórico.

Leyenda tipo: `NEW` nuevo · `MOD` modificación aditiva · `GEN` generado (no se edita a mano) · `DEL` borrado · `ART` artifact.

---

## 1. Tabla archivo → agente → tipo

| # | Archivo | Agente | Tipo | Líneas est. | Chunk |
|---|---------|--------|------|------------:|:-----:|
| 1 | `lib/db/schema.ts` | @db-engineer | MOD | +18 | C1 |
| 2 | `lib/db/queries/padel/transitions.ts` | @db-engineer | NEW | 170 | C1 |
| 3 | `lib/db/queries/padel/index.ts` | @db-engineer | MOD | +1 | C1 |
| 4 | `drizzle/0012_*.sql` + `drizzle/meta/*` | @db-engineer | GEN | ~25 | C1 |
| 5 | `tests/unit/db/transitions-queries.test.ts` | @db-engineer | NEW | 130 | C1 |
| 6 | `lib/auth/protected-routes.ts` | @auth-security | MOD | +45 | C2 |
| 7 | `tests/api/padel/transitions-guard.spec.ts` | @auth-security | NEW | 140 | C2 |
| 8 | `lib/padel/court/geometry.ts` | @app-engineer | MOD | +25 | C3 |
| 9 | `lib/padel/court/history.ts` | @app-engineer | NEW | 70 | C3 |
| 10 | `lib/padel/court/editor.ts` | @app-engineer | NEW | 150 | C3 |
| 11 | `lib/padel/court/transition.ts` | @app-engineer | NEW | 50 | C3 |
| 12 | `lib/validations/padel.ts` | @app-engineer | MOD | +55 | C3 |
| 13 | `app/api/transitions/route.ts` | @app-engineer | NEW | 110 | C4 |
| 14 | `app/api/transitions/[id]/route.ts` | @app-engineer | NEW | 150 | C4 |
| 15 | `lib/api-docs/paths/transitions.ts` | @app-engineer | NEW | 150 | C4 |
| 16 | `lib/api-docs/schemas/transitions.ts` | @app-engineer | NEW | 130 | C4 |
| 17 | `lib/api-docs/spec.ts` | @app-engineer | MOD | +6 | C4 |
| 18 | `components/court/EditorStage.tsx` | @app-engineer | NEW | 260 | C5 |
| 19 | `components/court/ScenarioPreview.tsx` | @app-engineer | NEW | 110 | C5 |
| 20 | `components/padel/transition-editor/scenario-canvas.tsx` | @app-engineer | NEW | 120 | C5 |
| 21 | `components/padel/transition-editor/editor-screen.tsx` | @app-engineer | NEW | 190 | C6 |
| 22 | `components/padel/transition-editor/context-bar.tsx` | @app-engineer | NEW | 90 | C6 |
| 23 | `components/padel/transition-editor/step-filmstrip.tsx` | @app-engineer | NEW | 120 | C6 |
| 24 | `components/padel/transition-editor/transition-library.tsx` | @app-engineer | NEW | 130 | C6 |
| 25 | `hooks/use-transitions.ts` | @app-engineer | NEW | 120 | C6 |
| 26 | `app/(app)/transiciones/page.tsx` | @app-engineer | NEW | 20 | C7 |
| 27 | `app/(app)/transiciones/nueva/page.tsx` | @app-engineer | NEW | 25 | C7 |
| 28 | `app/(app)/transiciones/[id]/page.tsx` | @app-engineer | NEW | 35 | C7 |
| 29 | `app/preview/coach-transition-editor/page.tsx` | @app-engineer | NEW (efímero) | 6 | C7 |
| 30 | `tests/unit/padel/transition-schemas.test.ts` | @app-engineer | NEW | 110 | C8 |
| 31 | `tests/unit/padel/transition-history.test.ts` | @app-engineer | NEW | 90 | C8 |
| 32 | `tests/unit/padel/transition-editor.test.ts` | @app-engineer | NEW | 150 | C8 |
| 33 | `tests/unit/padel/transition-serialization.test.ts` | @app-engineer | NEW | 70 | C8 |
| 34 | `tests/unit/padel/court-geometry.test.ts` | @app-engineer | MOD | +40 | C8 |
| 35 | `tests/api/padel/transitions-happy.spec.ts` | @app-engineer | NEW | 140 | C9 |
| 36 | `tests/e2e/transition-editor.spec.ts` | @app-engineer | NEW | 120 | C9 |
| 37 | `components/preview/coach-transition-editor.tsx` | @app-engineer | **DEL** (cleanup) | — | C10 |
| 38 | `app/preview/coach-transition-editor/page.tsx` | @app-engineer | **DEL** (cleanup) | — | C10 |
| 39 | `ARCHITECTURE.md` | @architect | MOD | +20 | — |
| 40 | `FEATURES.md` | @qa-release / @pm | MOD | +40 | — |
| 41 | `production_artifacts/<slug>/auth-impact.md`, `security-checklist.md` | @auth-security | ART | — | — |
| 42 | `production_artifacts/<slug>/{app-notes,db-plan,migration-notes,ponytail-review-report,release-report,test-matrix,acceptance-criteria,evidence-manifest.json}` | respectivos | ART | — | — |

**Tamaño de archivos**: ninguno supera 300 líneas estimadas (máx. `EditorStage` 260) → **no se requiere split intra-archivo**. El split exigido es **por agente** (§2).

---

## 2. Chunking (regla AGENTS.md: ≤5 archivos / ≤400 líneas por sub-task)

| Chunk | Agente | Archivos | Objetivo | Gate de salida |
|-------|--------|----------|----------|----------------|
| **C1** | @db-engineer | #1–#4 | Tabla + índice + migración generada + verificación `information_schema` | `db:migrate` OK, `_journal.json` idx 12, columnas verificadas |
| **C1b** | @db-engineer | #5 | Queries con ownership + unit test | Jest verde |
| **C2** | @auth-security | #6–#7 | Entradas `guardAdmin` + guard spec (401/403/404 IDOR) | API guard verde |
| **C3** | @app-engineer | #8–#12 | Lógica pura (geometría inversa, historial, operaciones) + Zod | Unit de `lib/padel/court` verde, `tsc` 0 |
| **C4** | @app-engineer | #13–#17 | Route handlers + api-docs | 201/200/400/404 verificados, `--api-docs` OK |
| **C5** | @app-engineer | #18–#20 | `EditorStage` + `ScenarioPreview` + canvas wrapper | revisión de imports (Konva sólo aquí, dynamic) |
| **C6** | @app-engineer | #21–#25 | Editor UI + barra contextual + filmstrip + lista + hook | estados del mockup presentes |
| **C7** | @app-engineer | #26–#29 | Páginas (guard `validateAdmin`) + preview efímera | rutas navegables |
| **C8** | @app-engineer | #30–#34 | 5 unit tests de lógica pura | Jest verde |
| **C9** | @app-engineer | #35–#36 | API happy-path (SQL real) + E2E spec | specs escritos (los ejecuta @qa-release) |
| **C10** | @app-engineer | #37–#38 | Cleanup: borrar mockup + ruta preview | ambos archivos eliminados |

Orden global: **C1 → C1b → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10** (@db-engineer → @auth-security → @app-engineer), con @ponytail-reviewer y @qa-release al final.

---

## 3. Cross-Agent Review

El change-map supera **5 archivos** (41 entradas, 36 de código/test) y añade **contratos API nuevos** → se **activa Cross-Agent Review en el paso 5** de `/ship-feature`:

1. @app-engineer valida viabilidad del diseño (props de `EditorStage`, contrato PUT de reemplazo).
2. Si hay observaciones → `design-review.md`.
3. @architect revisa y, si aplica, publica `technical-design-v2.md` / `change-map-v2.md`.
4. Re-implementación de los chunks afectados (sin repetir C1/C2 si no cambian contratos de DB/auth).

---

## 4. Anti-loop / límites

- @app-engineer y @admin-engineer **no** ejecutan `next build`, `playwright test`, `db:migrate` ni servidores.
- `EditorStage`/`ScenarioPreview` entran **sólo** por `dynamic({ ssr: false })` (D-T4).
- `CourtStage.tsx`, `PuzzleDemo.tsx`, `CourtLayers.ts`, `CourtParts.tsx`: **no se tocan** (AC-03).
- Ninguna dependencia nueva en `package.json`.
- Si un chunk falla 2 veces → retry una vez re-dividiendo; si persiste → escalar.

---

## 5. Resumen de impacto

| Capa | Archivos nuevos | Archivos modificados | Eliminados |
|------|----------------:|---------------------:|-----------:|
| DB | 1 query + 1 migración | 2 (`schema.ts`, `index.ts`) | 0 |
| Auth | 0 | 1 | 0 |
| API | 2 handlers + 2 docs | 1 (`spec.ts`) | 0 |
| UI | 7 componentes + 1 hook + 4 páginas | 0 | 2 (cleanup) |
| Lógica pura | 3 (`history`, `editor`, `transition`) | 1 (`geometry.ts`) | 0 |
| Validaciones | 0 | 1 (`padel.ts`) | 0 |
| Tests | 8 | 1 (`court-geometry.test.ts`) | 0 |
| Docs | 2 artifacts | 2 (`ARCHITECTURE.md`, `FEATURES.md`) | 0 |
