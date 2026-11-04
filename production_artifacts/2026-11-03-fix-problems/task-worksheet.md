# Task Worksheet — fix-problems 2026-11-03 (entry FAB + onboarding editor)

> change_id: 2026-11-03-fix-problems · Tier L · perfil: @app-engineer (chunks A–D)
> Diseño aprobado en fase A: FAB A3 + onboarding O1 (ver `design-approved.md`)

## Estado

| Chunk | Alcance | Estado |
|-------|---------|--------|
| A — G1 FAB + copy CTA | `app-layout-client.tsx`, `navigation.ts` (+`canShowTransitionFab`), `teacher-dashboard.tsx` copy, test unit FAB, test E2E FAB | ✅ resuelto |
| B — G2 onboarding strip | `flow-strip.tsx` (nuevo, `<ol>` sin `role="tab"`), `lib/padel/court/flow.ts` (`deriveFlowStep` puro), montaje en `editor-screen`, test unit flow | ✅ resuelto |
| C — G3 affordances + copy + E2E | `context-bar.tsx` (Badge + `aria-describedby` Probar/Guardar), `step-filmstrip.tsx` (labels), `scenario-canvas.tsx` (hint `role="status"`), `EditorStage.tsx` (anillo selección, sin tocar hit-testing), update `transition-editor.spec.ts` en UNA pasada | ✅ resuelto |
| D — ruta preview (efímera) | `app/preview/coach-transition-editor/page.tsx` (4 L, patrón etapa3) — para ver el mockup navegable | ✅ resuelto |

## Reglas duras (del triage/repair-plan)
- **NO** usar `role="tab"` ni renombrar "Paso N"/"Probar"/"Guardar"/"Añadir paso" (rompe `transition-editor.spec.ts`).
- NO tocar `*_NAV_ITEMS`, `CourtStage`, `ScenarioPreview`, motor de animación, DB, auth.
- FAB: sólo ADMIN, oculto en `/transiciones*`, `/settings`, `/admin`, modo foco; dot de novedad lee `localStorage` en `useEffect`.
- Validad por chunk: `tsc --noEmit` + `eslint` del área. Final: build + E2E completos.

## Hecho
- (fase A) `ui-kit-audit.md`, `design-exploration.md`, `mockup-spec.md`, `design-approved.md`, mockup `components/preview/coach-transition-editor.tsx`
- (step 1) `problems-triage.md`, `test-matrix.md`
- (step 2) `repair-plan.md`

## Pendiente
- Chunks A→B→C→D, auto-fix, ponytail, qa-release, FEATURES (ajuste formato), qa-validator + evidence, harness, pattern detection, commit gate.

## Cierre
- ✅ chunks A–D, bug S1 fixeado, auto-fix, ponytail (−3 L), qa-release APROBADO (v0.10)
- ⬜ qa-validator JSONs → evidence-manifest → harness --all → commit gate
- ⬜ decisión usuario: mantener o borrar mockup/ruta preview (design-approved §4)
