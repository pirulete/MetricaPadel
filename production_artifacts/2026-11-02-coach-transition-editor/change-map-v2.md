# Change Map — Editor de Transiciones (coach/ADMIN) — v2

> change_id: 2026-11-02-coach-transition-editor
> status: approved-for-implementation
> date: 2026-11-02
> module: padel
> owner: @architect
> supersedes: `change-map.md` (v1) — v1 queda como registro histórico, no se modifica
> inputs: `technical-design-v2.md`, `design-review.md` (F1–F15), `app-notes.md` (T1–T16)
> **Versioning**: v2 según la regla declarada en `technical-design.md`. Próximas revisiones → `change-map-v3.md`. No se sobrescribe.

Leyenda tipo: `NEW` nuevo · `MOD` modificación aditiva · `GEN` generado · `DEL` borrado · `ART` artifact · `DONE` ya aplicado.

---

## 1. Tabla archivo → agente → tipo → task

| # | Archivo | Agente | Tipo | Líneas est. | Task |
|---|---------|--------|------|------------:|:----:|
| 1 | `lib/db/schema.ts` | @db-engineer | MOD · **DONE** | +18 | T1 |
| 2 | `drizzle/0012_young_betty_ross.sql` + `drizzle/meta/*`, `_journal.json` | @db-engineer | GEN · **DONE** | ~25 | T1 |
| 3 | `lib/db/queries/padel/transitions.ts` | @db-engineer | NEW | 175 | T2 |
| 4 | `lib/db/queries/padel/index.ts` | @db-engineer | MOD | +1 | T2 |
| 5 | `tests/unit/db/transitions-queries.test.ts` | @db-engineer | NEW | 135 | T2 |
| 6 | `lib/padel/court/geometry.ts` | @app-engineer | MOD (+ header, F15) | +25 | T3 |
| 7 | `lib/padel/court/history.ts` | @app-engineer | NEW | 70 | T3 |
| 8 | `lib/padel/court/editor.ts` | @app-engineer | NEW | 150 | T3 |
| 9 | `lib/padel/court/transition.ts` | @app-engineer | NEW | 50 | T3 |
| 10 | `lib/validations/padel.ts` | @app-engineer | MOD (F1) | +60 | T4 |
| 11 | `app/api/transitions/route.ts` | @app-engineer | NEW | 110 | T5 |
| 12 | `app/api/transitions/[id]/route.ts` | @app-engineer | NEW | 155 | T5 |
| 13 | `lib/api-docs/paths/transitions.ts` | @app-engineer | NEW | 150 | T6 |
| 14 | `lib/api-docs/schemas/transitions.ts` | @app-engineer | NEW | 130 | T6 |
| 15 | `lib/api-docs/spec.ts` | @app-engineer | MOD | +6 | T6 |
| 16 | `components/court/EditorStage.tsx` | @app-engineer | NEW | 270 | T7 |
| 17 | `components/court/ScenarioPreview.tsx` | @app-engineer | NEW | 110 | T7 |
| 18 | `components/padel/transition-editor/scenario-canvas.tsx` | @app-engineer | NEW | 120 | T8 |
| 19 | `hooks/use-transitions.ts` | @app-engineer | NEW | 120 | T8 |
| 20 | `components/padel/transition-editor/context-bar.tsx` | @app-engineer | NEW | 90 | T9 |
| 21 | `components/padel/transition-editor/step-filmstrip.tsx` | @app-engineer | NEW | 120 | T9 |
| 22 | `components/padel/transition-editor/transition-library.tsx` | @app-engineer | NEW | 130 | T9 |
| 23 | `components/padel/transition-editor/editor-screen.tsx` | @app-engineer | NEW | 200 | T10 |
| 24 | `app/(app)/transiciones/page.tsx` | @app-engineer | NEW | 20 | T11 |
| 25 | `app/(app)/transiciones/nueva/page.tsx` | @app-engineer | NEW | 25 | T11 |
| 26 | `app/(app)/transiciones/[id]/page.tsx` | @app-engineer | NEW | 35 | T11 |
| 27 | `tests/unit/padel/transition-schemas.test.ts` | @app-engineer | NEW | 110 | T12a |
| 28 | `tests/unit/padel/transition-editor.test.ts` | @app-engineer | NEW | 150 | T12a |
| 29 | `tests/unit/padel/transition-history.test.ts` | @app-engineer | NEW | 90 | T12a |
| 30 | `tests/unit/padel/transition-serialization.test.ts` | @app-engineer | NEW | 70 | T12b |
| 31 | `tests/unit/padel/court-geometry.test.ts` | @app-engineer | MOD | +40 | T12b |
| 32 | `tests/api/padel/transitions-happy.spec.ts` | @app-engineer | NEW | 150 | T13 |
| 33 | `tests/e2e/transition-editor.spec.ts` | @app-engineer | NEW | 130 | T13 |
| 34 | `lib/auth/protected-routes.ts` | @auth-security | MOD | +45 | T14 |
| 35 | `tests/api/padel/transitions-guard.spec.ts` | @auth-security | NEW | 140 | T14 |
| 36 | `components/padel/teacher-dashboard.tsx` | @app-engineer | MOD (D-14, CTA) | +12 | T16 |
| 37 | `components/layout/app-layout-client.tsx` | @app-engineer | MOD (D-13, foco) | +8 | T16 |
| 38 | `components/preview/coach-transition-editor.tsx` | @app-engineer | **DEL** (cleanup) | — | T15 |
| 39 | `ARCHITECTURE.md` | @architect | MOD | +22 | — |
| 40 | `FEATURES.md` | @qa-release / @pm | MOD | +40 | — |
| 41 | `production_artifacts/<slug>/{auth-impact,security-checklist}.md` | @auth-security | ART | — | — |
| 42 | `production_artifacts/<slug>/{app-notes,db-plan,migration-notes,ponytail-review-report,release-report,test-matrix,acceptance-criteria,evidence-manifest.json}` | respectivos | ART | — | — |

**Cambios respecto de v1**: + `teacher-dashboard.tsx` (MOD, entrada D-14) · + `app-layout-client.tsx` (MOD, modo foco D-13) · − `app/preview/coach-transition-editor/page.tsx` (**rechazado**: no existe, nada lo referencia y el mockup ya está aprobado) · `lib/validations/padel.ts` pasa de +55 a +60 (patrón Zod corregido) · `EditorStage` 260 → 270 y `transitions-happy.spec.ts` 140 → 150 (asserts de `audit_logs`).

**Tamaño de archivos**: máximo `EditorStage.tsx` **270** líneas est. (< 300) → **no hay split intra-archivo**. Todos < 500 líneas (regla dura).

---

## 2. Chunking (AGENTS.md: ≤5 archivos **y** ≤400 líneas por sub-task)

| Task | Agente | Archivos (#) | Líneas est. | Depende de | Gate de salida |
|------|--------|--------------|------------:|------------|----------------|
| **T1** | @db-engineer | #1–#2 **(DONE)** | 25 | — | Migración `0012` aplicada, `_journal idx 12`, columnas/índice verificados. **No regenerar** |
| **T2** | @db-engineer | #3–#5 | 311 | T1 | Jest verde; `safeParse` en `getTransitionById` (F10); `stepCount ::int` (F11); mock con `db.delete` |
| **T3** | @app-engineer | #6–#9 | 295 | — | Unit puros verdes; sin React/Konva; cabecera de `geometry.ts` (F15) |
| **T4** | @app-engineer | #10 | 60 | T3 | Zod F1 compila; `tsc` 0 |
| **T5** | @app-engineer | #11–#12 | 265 | T2, T4 | 201/200/400/404; guard-first; `auditUpdate` 5 args (F4); DELETE `.returning()` |
| **T6** | @app-engineer | #13–#15 | 286 | T5 | `--api-docs` OK; 401/403/404 en `responses` |
| **T7** | @app-engineer | #16–#17 | 380 | T3 | Konva sólo aquí; F5/F6/F7/F8; `CourtStage`/`CourtParts` intactos |
| **T8** | @app-engineer | #18–#19 | 240 | T4, T5, T7 | `dynamic({ssr:false})` única puerta a Konva; hook sin autorización |
| **T9** | @app-engineer | #20–#22 | 340 | T3, T8 | Estados del mockup; targets ≥44 px; filmstrip de chips (no N canvases) |
| **T10** | @app-engineer | #23 | 200 | T7–T9 | Undo/redo, EC-05, EC-11, guardado, Probar |
| **T11** | @app-engineer | #24–#26 | 80 | T9, T10 | `await validateAdmin()` primera sentencia; 404 → `notFound()`; enlace «Volver» |
| **T12a** | @app-engineer | #27–#29 | 350 | T3, T4 | Jest verde; caso F1 explícito |
| **T12b** | @app-engineer | #30–#31 | 110 | T3 | Round-trip AC-02; escenario inválido → fail |
| **T13** | @app-engineer | #32–#33 | 280 | T5, T11 | Specs **escritos** (los ejecuta @qa-release); SQL real + `audit_logs` (F14); E2E viewport + no-scroll (F13) |
| **T14** | @auth-security | #34–#35 | 185 | T5 (para **ejecutar** el spec — F3) | 5 claves; 401/403 (USER, TEMPORARY)/404 IDOR cross-coach |
| **T16** | @app-engineer | #36–#37 | 20 | T11 | CTA visible en `/dashboard`; `BottomNav` oculta en las 2 rutas de editor y visible en `/transiciones` |
| **T15** | @app-engineer | #38 | — | T11 | Mockup eliminado; 0 referencias residuales |

**Orden de ejecución**: `T1(DONE) → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12a → T12b → T13 → T14 → T16 → T15` → @ponytail-reviewer → @qa-release.

Ninguna task excede **5 archivos** ni **400 líneas**. Sin tasks de un solo archivo >300 líneas (T7 = 380 en 2 archivos, aceptable; si `EditorStage` creciera >300 en la práctica, se parte en `use-editor-drag.ts` dentro del mismo task).

---

## 3. Cross-Agent Review — estado

**CERRADO en v2.** `design-review.md` (F1–F15) resuelto en `technical-design-v2.md` §0:

1. **F1 (bloqueante)** — aceptado; §3.3 de v2 con `ZodObject` base + `.extend()` antes de `.superRefine()` compartido.
2. **F2/F3** — aceptados; §2 re-chunkeado a T1–T16, guard spec ejecutado tras T5.
3. **F4–F11, F13–F15** — aceptados; reflejados en §3.2, §5.1, §5.2, §9.
4. **F12** — aceptado con cambio: CTA en `/dashboard` (D-14) **en lugar de** 8.º ítem de nav; modo foco (D-13) con MOD de `app-layout-client.tsx`.
5. **Extra** — rechazada la creación de `app/preview/coach-transition-editor/page.tsx`.

No se requiere v3 salvo bloqueante nuevo en T3/T4 → `technical-design-v3.md` / `change-map-v3.md` (nunca se sobrescribe v2).

---

## 4. Anti-loop / límites

- @app-engineer y @auth-security **no** ejecutan `next build`, `playwright test`, `db:migrate` ni servidores.
- `EditorStage`/`ScenarioPreview` entran **sólo** por `dynamic({ ssr: false })`.
- `CourtStage.tsx`, `PuzzleDemo.tsx`, `CourtLayers.ts`, `CourtParts.tsx`: **no se tocan** (AC-03).
- **Prohibido** `.extend()` después de `.refine()`/`.superRefine()` (Zod 3) — regla vinculante para T4.
- Cualquier task que pase de 400 líneas se re-divide antes de empezar (no a mitad), igual que F2.
- Si una task falla 2 veces → retry una vez re-dividiendo; si persiste → escalar.

---

## 5. Resumen de impacto

| Capa | Nuevos | Modificados | Eliminados |
|------|-------:|------------:|-----------:|
| DB | 1 query + 1 migración | 2 (`schema.ts` **DONE**, `index.ts`) | 0 |
| Auth | 0 | 1 (`protected-routes.ts`) | 0 |
| API | 2 handlers + 2 docs | 1 (`spec.ts`) | 0 |
| UI | 6 componentes + 1 hook + 3 páginas | **2** (`teacher-dashboard.tsx`, `app-layout-client.tsx`) | 1 (mockup) |
| Lógica pura | 3 (`history`, `editor`, `transition`) | 1 (`geometry.ts`) | 0 |
| Validaciones | 0 | 1 (`padel.ts`) | 0 |
| Tests | 8 | 1 (`court-geometry.test.ts`) | 0 |
| Docs | 2 artifacts | 2 (`ARCHITECTURE.md`, `FEATURES.md`) | 0 |

**Total: 36 archivos de código/test** (vs. 36 en v1: −2 por páginas preview, +2 por layout/nav). Sigue activando Cross-Agent Review por >5 archivos → ya completado (v2).
