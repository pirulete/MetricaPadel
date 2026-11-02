# Release Report — Editor de Transiciones (coach)

> change_id: `2026-11-02-coach-transition-editor`
> module: `padel`
> date: 2026-11-02
> owner: @qa-release
> branch objetivo: `rama-preview`
> entorno: dev server `http://localhost:3000`, DB local `localhost:5434` (SQL real, no mocks)
> spec referencia: `feature-spec.md` (AC-01..AC-06)

**Veredicto: 🔴 NO-GO (condicionado).** 1 bug real de UI (AC-01) + 1 defecto del spec E2E (login helper). Fix estimado: 2 líneas de UI + 1 línea de test. Todo lo demás (unit, API SQL real, guards, persistencia, preview, docs) verde.

> Nota: la feature-spec define **AC-01..AC-06**; el `AC-07` mencionado en el pedido pertenece al spike `2026-11-01-konva-puzzle-spike` (compatibilidad `CourtScenario`), que aquí se cubre vía AC-02.

---

## 1. Resultado por Acceptance Criteria

| AC | Criterio | Estado | Evidencia |
|----|----------|--------|-----------|
| AC-01 | Mobile-first 375×667 sin scroll horizontal, targets ≥44 px, canvas/toolbar/filmstrip visibles | ❌ **FAIL** | `/transiciones` OK (`scrollWidth=375`). **Editor `/transiciones/nueva`: `documentElement.scrollWidth=383`** → overflow 8.4 px. Culpable medido en runtime: `button "Guardar"` del context bar (`right=383.4`, `width=102`, `left=281.4`). Extra: toast Sonner `"Transición guardada"` en 375 px mide 375 de ancho con `left=16` → `right=391` (overflow transitorio). Targets ≥44 px: **manual** (no automatizado). |
| AC-02 | Escenario serializable a `CourtScenario` sin transformaciones ad hoc + round-trip | ✅ PASS | `lib/padel/court/transition.ts` (`toCourtScenario`) es el único adaptador DB-row → `CourtScenario`; `ScenarioPreview` lo consume. `tests/unit/padel/transition-serialization.test.ts` (13 tests) round-trip JSON↔scenario, incluido `shot: null`. |
| AC-03 | Preview reutiliza el motor existente (cero animación nueva) | ✅ PASS | `components/court/ScenarioPreview.tsx` importa `CourtStage` vía `dynamic({ssr:false})` + `clampStepIndex`/`toCourtScenario`; `grep requestAnimationFrame\|setInterval` en `app/(app)/transiciones`, `components/court/{EditorStage,ScenarioPreview}.tsx`, `components/padel/transition-editor/`, `hooks/use-transitions.ts` → **0 resultados**. E2E reprodujo "Reproduciendo paso N de M" y el auto-return al canvas editable. Regresión motor: `tests/e2e/puzzle-demo.spec.ts` **2/2 pass**. |
| AC-04 | Guard ADMIN en ruta y endpoints; USER/TEMPORARY 403; LOCKED nunca | ✅ PASS | `app/(app)/transiciones/{,nueva,[id]}` usan `validateAdmin()`; los 5 endpoints usan `guardAdmin(session)`. `lib/auth/protected-routes.ts` declara las 5 rutas con `allowedStatuses:['ACTIVE']`. `transitions-guard.spec.ts` **9/9**: 401×5, USER 403 en los 5, ADMIN+TEMPORARY 403, IDOR cross-coach, UUID inexistente → 404. E2E: USER en `/transiciones` → `/dashboard` + API `403`. |
| AC-05 | Persistencia DB + CRUD + auditoría + happy-path SQL + api-docs | ✅ PASS | Tabla `coach_transitions` (`lib/db/schema.ts:639`, migración `drizzle/0012_young_betty_ross.sql`, índice `owner_id,updated_at`). `transitions-happy.spec.ts` (SQL real): POST 201 → GET → list → PUT → DELETE + filas en `audit_logs` (`entity_name='coach_transition'`) + IDOR 404. `lib/api-docs/paths/transitions.ts` registra `GET/POST /api/transitions` y `GET/PUT/DELETE /api/transitions/{id}` (**5 operaciones**) y `spec.ts:329/332` los monta. |
| AC-06 | Gates del repo verdes (unit, API, E2E, tsc, eslint, build, cobertura, FEATURES.md) | ❌ **FAIL (parcial)** | unit **849/849 pass**; API **10/10**; `tsc --noEmit` **0 errores**; E2E **1/2** (falla por AC-01 + helper de login). eslint/build: no ejecutados en esta pasada (delegados al harness). Cobertura módulo afectado: `lib/padel` **96.51 %** lines, `lib/padel/court` **99.04 %**, `lib/db/queries/padel/transitions.ts` **97.67 %** (sin regresión). `FEATURES.md`: entry existente con metadata correcta pero **texto obsoleto** ("spec — pendiente de implementación", "Archivos Modificados (previstos): Ninguno aún") → corregido en esta pasada. |

---

## 2. Gates ejecutados (resultados reales)

| Gate | Comando | Resultado | Estado |
|------|---------|-----------|--------|
| unit | `npx jest` (DATABASE_URL→5434) | 65 suites / **849 tests** pass, 7.0 s | ✅ |
| api (SQL real + guards) | `npx playwright test tests/api/padel/transitions-happy.spec.ts tests/api/padel/transitions-guard.spec.ts` | **10/10** pass, 7.9 s | ✅ |
| e2e editor | `npx playwright test tests/e2e/transition-editor.spec.ts` | **1 passed / 1 failed** (44.2 s, 2 reintentos) | ❌ |
| e2e regresión motor Konva | `npx playwright test tests/e2e/puzzle-demo.spec.ts` | **2/2** pass | ✅ |
| typecheck | `npx tsc --noEmit` | exit 0, 0 errores | ✅ |
| api-docs | lectura de `lib/api-docs/{spec.ts,paths/transitions.ts,schemas/transitions.ts}` | 5 operaciones registradas + schemas montados | ✅ |
| coverage (módulo) | `jest --coverage` | `lib/padel` 96.51 / `lib/padel/court` 99.04 / `transitions.ts` 97.67 (lines) | ✅ |
| coverage (global `lib`) | `jest --coverage` vs `.validation/coverage-baseline.json` (88.6 lines) | **83.42 % lines (−5.18 pp)** | ⚠️ ver hallazgo H-3 |
| lint / build | `pnpm run lint` / `npx next build` | no ejecutados por @qa-release (dev server ocupando el puerto) | ⏭️ manual/harness |

---

## 3. Hallazgos

### H-1 — BUG REAL (UI, severidad **Media**): overflow horizontal de 8.4 px en el editor a 375 px — bloquea AC-01

- **Dónde**: `app/(app)/transiciones/nueva` (y por composición `[id]`), context bar con botones Probar/Guardar.
- **Medición**: `document.documentElement.scrollWidth = 383` con `innerWidth = 375`; elemento que excede el viewport: `button` con texto `"Guardar"`, `getBoundingClientRect() = {left:281.4, right:383.4, width:102}`.
- **Repro**:
  1. Seed ADMIN ACTIVE, login en `http://localhost:3000/login`.
  2. Ir a `/transiciones` → click "Nueva" (`/transiciones/nueva`).
  3. Viewport 375×667 → `document.documentElement.scrollWidth` = **383** (>375).
- **Impacto**: scroll horizontal en el editor móvil, criterio explícito de AC-01. No rompe funcionalidad (el flujo crear→probar→guardar→reabrir **funciona**, verificado).
- **Extensión del hallazgo**: el toast Sonner de éxito (`"Transición guardada"`) también excede (`left:16,width:375 → right:391`), añadiendo overflow transitorio.
- **Fix esperado (≤2 líneas CSS)**: `min-w-0`/`shrink` en el grupo de acciones del context bar o `pr` que compense, y `max-w-[calc(100vw-2rem)]` en el toaster. **No aplicado** (ownership: @app-engineer).

### H-2 — DEFECTO DE TEST (E2E, severidad **Baja**, clasificación: **test desactualizado**): helper `login` espera `**/dashboard` para un ADMIN

- **Dónde**: `tests/e2e/transition-editor.spec.ts:82`.
- **Error**: `TimeoutError: page.waitForURL: Timeout 15000ms exceeded — waiting for navigation to "**/dashboard"; navigated to "http://localhost:3000/admin"`.
- **Causa raíz**: `app/(public)/login/page.tsx:31` redirige `ADMIN`/`SUPER_ADMIN` a `/admin` (comportamiento preexistente y correcto). El helper asume `USER`.
- **Verificación**: sustituyendo sólo ese `waitForURL` por `/\/(dashboard|admin)$/` en una copia temporal, el test avanzó hasta la assertion de AC-01 (H-1) y, desactivando esa assertion, el flujo completo **pasó** (crear → añadir paso → Probar → Guardar → recarga persiste título y 2 pasos). Copia temporal eliminada.
- **Conclusión**: no es bug de producto; el spec debe aceptar el destino ADMIN. **No modificado** (ownership: @app-engineer).

### H-3 — OBSERVACIÓN (cobertura): `lib` global 83.42 % vs baseline 88.6 %

La caída **no proviene del módulo afectado** (`lib/padel` 96.51, `lib/padel/court` 99.04, `transitions.ts` 97.67). Los archivos que arrastran el agregado son preexistentes y ajenos al change (`lib/db/queries/padel/courses.ts` 61.9 %, `super-admin.ts` 40.74 %, `lib/neon/branching.ts` 73.19 %). El gate `--coverage` documentado en AGENTS.md **no está implementado** en `scripts/validate-harness.js` (sólo aparece en el header de ayuda); se midió manualmente. Requiere decisión del orquestador: aceptar como riesgo (módulo sin regresión) o refrescar baseline.

### H-4 — OBSERVACIÓN (tests): `hooks/use-transitions.ts` sin unit test directo

153 líneas de wiring fetch (list/create/update) sin test propio; la lógica de negocio que importa vive en `lib/padel/court/*` y `lib/db/queries/padel/transitions.ts`, ambas cubiertas. Aceptable, pero el repo sí testea otros hooks (`use-notifications`, `use-push-subscription`): deuda menor.

### H-5 — OBSERVACIÓN (manual pendiente): targets ≥44 px y usabilidad táctil real

AC-01 exige ≥44×44 px en todos los targets táctiles y "drag no secuestra el scroll" (EC-04). Ninguno de los dos se verifica por automatización en esta pasada (el E2E no mide `getBoundingClientRect` de los controles ni simula touch-drag). Ver checklist en `acceptance-criteria.md`.

---

## 4. Cobertura de criterios vs automatización

| Criterio | Automatizado | Manual |
|----------|--------------|--------|
| AC-01 sin scroll horizontal | ✅ (falla) | targets ≥44 px, drag vs scroll (EC-04) |
| AC-02 round-trip modelo | ✅ | — |
| AC-03 reutilización del motor | ✅ (imports + E2E + regresión puzzle-demo) | — |
| AC-04 guards USER/TEMPORARY/401/IDOR | ✅ | LOCKED (no hay e2e dedicado; guard rechaza por `allowedStatuses`) |
| AC-05 CRUD SQL real + auditoría + api-docs | ✅ | — |
| AC-06 gates | ✅ unit/API/tsc/coverage | eslint/build (delegados al harness) |
| EC-11 confirmación al abandonar con cambios | ❌ | manual |

---

## 5. Veredicto

**NO-GO para `rama-preview` en este estado.** Bloqueantes:

1. **H-1** — AC-01 incumplido (overflow 383 > 375 en el editor). Fix UI ≤2 líneas.
2. **H-2** — el E2E del feature queda rojo en CI por el helper de login (fix 1 línea en el spec).

Tras aplicar ambos (y correr `lint`/`build`), el release pasa a **GO**: el resto de AC (02, 03, 04, 05) está verificado con SQL real y el motor Konva no muestra regresión (`puzzle-demo` 2/2, dominio unit 849/849).

---

## 6. Apéndice — Fix post-qa-release (@app-engineer, 2026-11-02)

### H-1 (AC-01) — overflow móvil del editor

- `components/padel/transition-editor/context-bar.tsx`
  - Fila de acciones (`px-2 pb-2`): `Probar` y `Guardar` pasan de `h-11 px-3` a `h-11 px-2` → −16 px de ancho (8 px por lado y botón). El botón conserva `h-11` y sigue >44 px de ancho (icono 16 + `gap-2` + label + 16 de padding).
  - span de estado: `flex-1` → `min-w-0 flex-1 truncate` → deja de imponer `min-width:auto` (min-content de "sin guardar") y puede ceder el espacio restante (hasta ~54 px) con elipsis.
  - Box model: la fila necesitaba ~8,4 px; los dos cambios liberan ≈70 px, así que `documentElement.scrollWidth ≤ 375` con margen. No se tocaron filas de nudges/tiro (siguen `size-11` = 44 px), ni el layout C de la barra fija (`sticky bottom-0`).
- `app/layout.tsx` — overflow transitorio del toast Sonner (`"Transición guardada"` medía 375 px con `left:16` → `right:391`): `Toaster` recibe `toastOptions={{ className: "max-w-[calc(100vw-2rem)]" }}`. Benigno para el resto de toasts.

### H-2 (E2E) — helper de login

- `tests/e2e/transition-editor.spec.ts:82`: `waitForURL("**/dashboard")` → `waitForURL(/\/admin|\/dashboard/, { timeout: 15000 })`, replicando el patrón real de `tests/e2e/academy-super-admin.spec.ts:77` (el login de ADMIN/SUPER_ADMIN aterriza en `/admin`). El caso USER (`:144`) sigue esperando `**/dashboard`, que es su destino correcto.

### Validación local

- `npx tsc --noEmit` → 0 errores.
- `npx eslint` sobre los 3 archivos tocados → 0 errores/warnings.
- E2E **no ejecutado** por @app-engineer (ownership: orquestador/@qa-release) — pendiente re-run de `tests/e2e/transition-editor.spec.ts` y `tests/e2e/puzzle-demo.spec.ts` (regresión motor).
