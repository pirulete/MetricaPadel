# Test Matrix — Fix "Editor de Transiciones" (descubribilidad + comprensión)

> change_id: `2026-11-03-fix-problems` · fecha: 2026-11-03 · owner: @qa-fix → **actualizado por @qa-release (2026-11-03, estados reales en §5)**
> Regla del repo: **todo fix de código incluye o actualiza tests** (`AGENTS.md` > Shared Context). Este fix es 100 % presentacional/UI → unit (Jest, lógica pura nueva) + E2E (Playwright, visibilidad y copy).
> Referencias: `problems-triage.md` (G1/G2/G3), `.validation/coverage-baseline.json` (`lib`: 88.6 líneas / 76.6 ramas), `tests/e2e/transition-editor.spec.ts` (152 líneas), `tests/unit/padel/transition-editor.test.ts` (247 líneas).

---

## 1. Inventario — qué cubre hoy el área afectada

| Test existente | Tipo | Ubicación | Qué cubre realmente | Relación con el fix |
|---|---|---|---|---|
| `transition-editor.test.ts` (247 L) | Unit (Jest, `node`) | `tests/unit/padel/transition-editor.test.ts` | Operaciones puras de `lib/padel/court/editor.ts`: `movePlayer`/`nudgePlayer` + clamp (EC-10), `setShot`/`clearShot`/`moveShotTo`/`moveShotControl`, `addStep`/`duplicateStep`/`reorderSteps`, `removeStep` (EC-05) | **No se toca.** El fix no modifica `editor.ts`; sirve de red de seguridad de que el editor sigue íntegro |
| `transition-history.test.ts` | Unit | `tests/unit/padel/transition-history.test.ts` | Undo/redo (`history.ts`), base del estado `dirty` | **No se toca** (regresión: `dirty` sigue derivándose igual) |
| `transition-schemas.test.ts` | Unit | `tests/unit/padel/transition-schemas.test.ts` | Zod de `POST/PUT /api/transitions` | **No se toca** (cero cambios de contrato) |
| `transition-serialization.test.ts` | Unit | `tests/unit/padel/transition-serialization.test.ts` | `toCourtScenario` / serialización | **No se toca** |
| `court-geometry.test.ts`, `court-steps.test.ts` | Unit | `tests/unit/padel/` | Geometría y `clampStepIndex` (usado por `editor-screen`) | **No se tocan** |
| `transition-editor.spec.ts` (152 L) | E2E (Playwright, viewport 375×667) | `tests/e2e/transition-editor.spec.ts` | (a) ADMIN: `/transiciones` → "Nueva" → añadir paso → tab "Paso 2" → "Probar" (status `Reproduciendo paso N de M`) → "Guardar" → URL `/transiciones/<uuid>` → recarga persiste; sin scroll horizontal. (b) USER en `/transiciones` → redirect `/dashboard`. (c) USER contra `/api/transitions` → 403 | **Se actualiza** (chunks B y C) y es la **principal red anti-regresión** de locators |
| `transitions-guard.spec.ts` | API | `tests/api/padel/transitions-guard.spec.ts` | 401 sin sesión; 403/404 con SQL real (anti-IDOR) | **No se toca** (cero cambios de API) |
| `dashboard.spec.ts` | E2E | `tests/e2e/dashboard.spec.ts` | Sólo status HTTP de `/dashboard` (200/302/307) — **no asserta CTA ni FAB** | Deja **hueco** para G1 → se cubre en el test nuevo |
| — | — | — | **No existe** test de `components/layout/app-layout-client.tsx`, ni de visibilidad por rol/ruta, ni de `BottomNav` con 7 items | Hueco total de G1 |
| — | — | — | **No existe** test de ningún elemento del flujo (strip), ni de los hints del canvas, ni de la distinción Probar/Guardar | Hueco de G2/G3 |

**Conclusión de cobertura actual**: el área está bien cubierta en **lógica pura y contrato**, y sólo parcialmente en **UI/flujo**. Los dos problemas reportados caen exactamente en la zona sin cobertura (entry point y affordances) → confirma el triage.

---

## 2. Matriz de tests a AÑADIR / ACTUALIZAR por grupo

### Chunk A — G1 Descubrimiento (FAB)

| ID | Acción | Archivo | Caso | Tipo | Criterio de aceptación |
|---|---|---|---|---|---|
| A1 | **NUEVO** | `tests/unit/padel/transition-fab-visibility.test.ts` | Tabla de `canShowTransitionFab(role, pathname)` (`lib/constants/navigation.ts`): ADMIN + `/dashboard` ✓, `/cursos` ✓, `/cursos/<id>` ✓, `/evaluar` ✓, `/historial` ✓, `/academias` ✓, `/academias/<id>` ✓ | Unit | Verdadero en las 7 rutas de trabajo |
| A2 | **NUEVO** | idem | Negativos: USER en `/dashboard` ✗, ADMIN en `/transiciones` ✗, `/transiciones/nueva` ✗, `/transiciones/<uuid>` ✗, `/settings` ✗, `/admin` ✗, `/admin/platform/academias` ✗ | Unit | Falso en todos (incluye borde `/admin/...` para no matchear `/administracion` inexistente) |
| A3 | **NUEVO** | `tests/e2e/transition-fab.spec.ts` | ADMIN logueado: `getByRole("link", { name: "Crear transición" })` visible en `/dashboard`; click → `waitForURL("**/transiciones/nueva")`; FAB **oculto** en `/transiciones` y dentro del editor (`/transiciones/nueva`) | E2E | 1 toque al editor; sin duplicar entry point |
| A4 | **NUEVO** | idem | USER logueado en `/dashboard`: el locator "Crear transición" **no existe** (`toHaveCount(0)`) — evita ofrecer una acción que dará 403 | E2E | Guard de UI coherente con `validateAdmin` |
| A5 | **NUEVO** | idem | FAB a 375×667: `boundingBox()` con `width/height ≥ 48` y `y + height ≤ viewportHeight - 61` (no tapado por `BottomNav`); `scrollWidth <= 375` | E2E | Target ≥44 px + sin solape ni overflow |

### Chunk B — G2 Onboarding (strip de flujo)

| ID | Acción | Archivo | Caso | Tipo | Criterio de aceptación |
|---|---|---|---|---|---|
| B1 | **NUEVO** | `tests/unit/padel/transition-flow.test.ts` | `deriveFlowStep`: `stepsCount=0` → 1 (Paso); `selected=null` → 2 (Mueve); `selected` + `hasShot=false` → 3 (Tiro); `selected` + `hasShot` y `dirty` → 5 (Guarda); `previewing=true` → 4 (Prueba) con prioridad sobre 2/3 | Unit | Las 5 fases alcanzables y la prioridad documentada |
| B2 | **NUEVO** | idem | Tabla de precedencia explícita: `previewing` gana a todo; `stepsCount=0` gana a `selected`; `dirty` no adelanta a `previewing` | Unit | Sin estados imposibles (cobertura de ramas del nuevo `lib/padel/court/flow.ts`) |
| B3 | **ACTUALIZAR** | `tests/e2e/transition-editor.spec.ts` | En el flujo existente (a): el strip es visible y expone el paso activo — `getByRole("list", { name: /flujo/i })` + `locator('[aria-current="step"]')` con el texto esperado en cada transición de estado | E2E | Strip presente y correcto sin tocar el flujo guardado/probado |
| B4 | **ACTUALIZAR** | idem | **Anti-regresión de locators**: los 4 selectores actuales siguen resolviendo a **1** elemento — `getByRole("tab", { name: /^Paso 1/ })`, `getByRole("tab", { name: /Paso 2/ })`, `getByRole("button", { name: "Probar" })`, `getByRole("button", { name: "Guardar" })` | E2E | Strict mode OK ⇒ el strip **no** usa `role="tab"` ni nombres "Paso N" |
| B5 | **ACTUALIZAR** | idem | 375×667 con strip montado: `scrollWidth <= 375` y el `role="group"` del canvas sigue visible (AC-01: canvas completo) | E2E | Riesgo aceptado (canvas ~50vh) verificado, no asumido |

### Chunk C — G3 Affordances y copy

| ID | Acción | Archivo | Caso | Tipo | Criterio de aceptación |
|---|---|---|---|---|---|
| C1 | **ACTUALIZAR** | `tests/e2e/transition-editor.spec.ts` | Hint del canvas: con `selected === null` → `getByRole("status")` con "Toca un jugador para moverlo" visible; tras seleccionar un jugador desaparece (o cambia a "Arrastra el arco para curvar el tiro" si el paso tiene tiro) | E2E | Gestos implícitos ahora visibles |
| C2 | **ACTUALIZAR** | idem | Distinción Probar/Guardar: `Probar` tiene `aria-describedby` que contiene "en memoria"; `Guardar` contiene "biblioteca"; el nombre accesible **sigue siendo exactamente** "Probar"/"Guardar" | E2E | Copy aclara sin romper locators |
| C3 | **ACTUALIZAR** | idem | Badge de estado: "● Cambios sin guardar" tras editar → "✓ Guardado" tras guardar | E2E | Estado del documento legible de un vistazo |
| C4 | **ACTUALIZAR** | idem | Filmstrip: "Secuencia · N pasos" + "Cada paso es una foto de la jugada"; botones "← Antes" / "Después →"; botón "+ Añadir paso" (el locator `{ name: "Añadir paso", exact: true }` **debe seguir funcionando** ⇒ el label accesible no cambia a "Añadir paso al final" para el chip de cabecera) | E2E | Nombres nuevos sin romper el existente |
| C5 | **ACTUALIZAR** | idem | Post-save: el botón Guardar muestra "Guardado ✓" ≤2 s **manteniendo** el rol/nombre para el locator (usar `aria-label="Guardar"` o texto `sr-only`) | E2E | Feedback de persistencia sin flake |
| C6 | Manual (checklist @qa-release) | — | Manija del arco en `EditorStage`: anillo visible y arrastrable (Konva no es inspeccionable con Playwright de forma fiable) | Manual | Verificación visual 375 px + desktop |

---

## 3. Riesgos de test (y mitigación obligatoria)

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El strip se implementa con `role="tab"` o nombres "Paso N" | Rompe `getByRole("tab", { name: /^Paso N/ })` de `transition-editor.spec.ts` (strict-mode violation) → falso negativo del flujo guardado | `<ol>/<li>` + `aria-current="step"`, copy "Paso/Mueve/Tiro/Prueba/Guarda" sin ordinal numérico |
| Cambiar el heading "Transiciones" de la biblioteca a "Preparar jugada" | Rompe `transition-editor.spec.ts` L102 (`getByRole("heading", { name: "Transiciones" })`) | El cambio de copy aplica **sólo** al CTA del dashboard; `transition-library.tsx` se mantiene |
| Cambiar el nombre accesible de "Probar"/"Guardar"/"Añadir paso" | Rompe 3 locators del E2E principal | Microcopy vía `aria-describedby`/`title`/Badge; nombres accesibles estables |
| `localStorage` para el dot de novedad leído en render | Hydration mismatch → warning/flake | Leer en `useEffect`; fallback "siempre visible" |
| E2E requieren `DATABASE_URL` + servidor en `localhost:3000` | Tests se saltan sin DB (falso verde) | Los 4 E2E usan `test.skip(!process.env.DATABASE_URL)` como hoy; el orquestador ejecuta con `.env.local` |
| Cobertura `lib` (baseline 88.6 líneas / 76.6 ramas) | Nuevos archivos en `lib/` sin test → gate `--coverage` puede fallar (>3 %) | Los 2 helpers puros (`canShowTransitionFab`, `deriveFlowStep`) entran con **cobertura 100 %** en A1/A2/B1/B2 antes de montarlos en UI |

---

## 4. Ejecución y gates

```bash
# Chunk A
npx tsc --noEmit && pnpm run test:unit -- transition-fab-visibility
npx playwright test tests/e2e/transition-fab.spec.ts

# Chunk B
npx tsc --noEmit && pnpm run test:unit -- transition-flow transition-editor
npx playwright test tests/e2e/transition-editor.spec.ts

# Chunk C
npx tsc --noEmit && pnpm run lint
npx playwright test tests/e2e/transition-editor.spec.ts tests/e2e/transition-fab.spec.ts

# Cierre (harness completo)
node scripts/validate-harness.js --all
```

| Gate | Umbral de este fix |
|---|---|
| `typecheck` | 0 errores |
| `lint` | 0 errores (warnings permitidos) |
| `unit_tests` | `transition-editor`/`transition-history`/`transition-schemas`/`transition-serialization` **sin cambios y verdes** + 2 suites nuevas verdes |
| `e2e_tests` | `transition-editor.spec.ts` actualizado verde + `transition-fab.spec.ts` verde |
| `coverage` | Sin regresión >3 % en `lib` (nuevos helpers al 100 %) |
| `api_tests` | Sin cambios (contratos intactos) |
| `build` | `npx next build` OK (montaje del FAB en layout cliente + `dynamic` intacto) |

**Definition of done de tests**: los 4 locators históricos del editor siguen verdes sin reescribirlos, y hay evidencia automatizada de que el ADMIN ve el FAB y el USER no.

---

## 5. Estados REALES tras el fix — ejecución de @qa-release (2026-11-03)

> Entorno: dev server `:3000` ya levantado · Postgres local `:5434` · `DATABASE_URL` inyectado a los E2E · 0 tests skipped (sin falso verde).
> Resultado global: **typecheck 0 errores · lint 0 errores (255 warnings preexistentes) · unit 882/882 (67 suites) · E2E 6/6 · build OK**.

### 5.1 Unit (Jest) — área afectada, conteo por suite

| ID | Archivo | Casos | Estado | Nota |
|---|---|---|---|---|
| A1/A2 | `tests/unit/padel/transition-fab-visibility.test.ts` | **16 / 16** | ✅ PASS | Tabla completa: 7 rutas de trabajo, 6 rutas ocultas, USER, SUPER_ADMIN, prefijos parciales |
| B1/B2 | `tests/unit/padel/transition-flow.test.ts` | **17 / 17** | ✅ PASS | `deriveFlowStep` + precedencia; `flow.ts` 100 % líneas/ramas |
| — | `tests/unit/padel/transition-editor.test.ts` | **28 / 28** | ✅ PASS | Sin cambios (red de seguridad `editor.ts`) |
| — | `tests/unit/padel/transition-history.test.ts` | **10 / 10** | ✅ PASS | Sin cambios (undo/redo, base de `dirty`) |
| — | `tests/unit/padel/transition-schemas.test.ts` | **22 / 22** | ✅ PASS | Sin cambios (contrato Zod intacto) |
| — | `tests/unit/padel/transition-serialization.test.ts` | **13 / 13** | ✅ PASS | Sin cambios (`toCourtScenario`) |
| — | `tests/unit/padel/court-geometry.test.ts` | **22 / 22** | ✅ PASS | Sin cambios |
| — | `tests/unit/padel/court-steps.test.ts` | **12 / 12** | ✅ PASS | Sin cambios |
| — | `tests/unit/db/transitions-queries.test.ts` | **10 / 10** | ✅ PASS | Sin cambios (queries intactas) |
| | **Subtotal área afectada** | **150 / 150** | ✅ | |
| | **Suite completa del repo** | **882 / 882** (67 suites, 5.862 s) | ✅ PASS | Cobertura `lib/padel/court` 99.1 % stmts / 96.96 % ramas |

### 5.2 E2E (Playwright 375×667, SQL real)

| ID | Archivo : línea | Caso | Estado | Duración |
|---|---|---|---|---|
| A3/A5 | `tests/e2e/transition-fab.spec.ts:93` | ADMIN ve el FAB en `/dashboard`, 1 toque → `/transiciones/nueva`, oculto en biblioteca y en el editor; `width/height ≥ 48` y `y+h ≤ 667-61` | ✅ PASS | 5.5 s |
| A4 | `tests/e2e/transition-fab.spec.ts:127` | USER en `/dashboard`: `toHaveCount(0)` | ✅ PASS | 2.4 s |
| B3/B4/B5 + C1..C5 | `tests/e2e/transition-editor.spec.ts:95` | crear → strip `aria-current` ("Tiro"→"Prueba") → hint `role="status"` → `aria-describedby` en Probar/Guardar → "Secuencia · 2 pasos" / "← Antes" → preview → guardar → `✓ Guardado` → recarga persiste → `scrollWidth ≤ 375` | ✅ PASS | 8.7 s |
| — | `tests/e2e/transition-editor.spec.ts:184` | USER en `/transiciones` → `/dashboard`; `GET /api/transitions` → 403 | ✅ PASS | 1.8 s |
| — | `tests/e2e/puzzle-demo.spec.ts:56` | Regresión sin sesión → `/login` | ✅ PASS | 1.1 s |
| — | `tests/e2e/puzzle-demo.spec.ts:62` | Regresión motor Konva (aria-live) tras el cambio de estilo en `EditorStage.tsx` | ✅ PASS | 3.7 s |
| | **Total** | **6 / 6** | ✅ | 11.7 s (3 workers) |

> B4 (anti-regresión de locators) queda probado **de forma implícita y estricta**: el spec conserva `getByRole("tab", { name: /^Paso/ })`, `{ name: "Probar" }`, `{ name: "Guardar" }` y `{ name: "Añadir paso", exact: true }` sin reescribirlos, y Playwright corre en strict mode → si el strip hubiera usado `role="tab"` o hubiera duplicado nombres, el test habría fallado.

### 5.3 Casos que NO son automatizables (manual)

| ID | Caso | Estado | Motivo |
|---|---|---|---|
| C6 | Manija del arco (`EditorStage`, Konva): anillo `strokeWidth` 3 + punto central visible y arrastrable | 👁 **Manual pendiente** | Konva se dibuja en canvas: Playwright no expone la geometría de forma fiable. Mitigación indirecta: `puzzle-demo.spec.ts` + `transition-editor.spec.ts` verdes ⇒ hit-testing/motor sin regresión |
| — | Pill extendida del FAB en `md+` (1280 px) y `md:sticky` del strip | 👁 **Manual pendiente** | Los 3 E2E corren sólo a 375×667 (ver `release-report.md` F-4) |

### 5.4 Bug detectado y cerrado durante la validación

| Bug | Severidad | Test que lo cazó | Estado |
|---|---|---|---|
| FAB renderizado con `position: relative` (el `<Link className="relative">` hijo de `Button asChild` pisaba el `fixed` del padre vía `Slot`; Tailwind emite `.relative` después de `.fixed`) ⇒ `bottom: calc(4.75rem…)` actuaba como offset relativo ⇒ `y ≈ −76`, FAB **fuera del viewport** | S1 (bloqueante) | `transition-fab.spec.ts:104-109` (`boundingBox().y + height ≤ vh − 61`) + A3 (`toBeVisible`) | ✅ **Corregido** (1 línea: se quitó `className="relative"` del `Link`) y revalidado: 6/6 E2E verde |

### 5.5 Gates de test de esta pasada

| Gate | Umbral | Real | Estado |
|---|---|---|---|
| `typecheck` | 0 errores | 0 | ✅ |
| `lint` | 0 errores | 0 errores / 255 warnings preexistentes | ✅ |
| `unit_tests` | 882 esperados | 882 | ✅ |
| `e2e_tests` | 6 esperados | 6 | ✅ |
| `coverage` (módulo) | sin caída >3 % | `lib/padel/court` 99.1/96.96 · `flow.ts` 100 | ✅ |
| `build` | OK | OK (incluye `/preview/coach-transition-editor`) | ✅ |
| `api_tests` | sin cambios | N/A — 0 contratos tocados | ⚪ |
