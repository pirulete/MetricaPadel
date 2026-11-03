# Release Report — Fix "Descubribilidad + comprensión del Editor de Transiciones"

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor`
> date: 2026-11-03 · owner: **@qa-release** · release objetivo: **v0.10**
> Alcance validado: G1 (FAB entry point) · G2 (flow strip) · G3 (affordances/copy) — 15 archivos, 0 endpoints, 0 migraciones.

**Veredicto: ✅ APROBADO para merge a `rama-preview`** (con 2 pendientes no bloqueantes de housekeeping, §4).

---

## 1. Resultado por grupo / AC

### G1 · Descubrimiento — FAB "Crear transición" (LOW)

| AC | Criterio | Evidencia | Estado |
|---|---|---|---|
| G1-1 | ADMIN ve el FAB en las 7 rutas de trabajo (`/dashboard`, `/cursos`, `/cursos/[id]`, `/evaluar`, `/historial`, `/academias`, `/academias/[id]`) | `tests/unit/padel/transition-fab-visibility.test.ts` (A1, 7 casos `it.each`) | ✅ |
| G1-2 | Oculto para `USER`, en `/transiciones*`, `/settings`, `/admin/**` | mismo unit (A2, 6 rutas) + `transition-fab.spec.ts` A4 (`toHaveCount(0)` para USER) | ✅ |
| G1-3 | 1 toque → `/transiciones/nueva` | `transition-fab.spec.ts` A3 (`waitForURL("**/transiciones/nueva")`) | ✅ |
| G1-4 | Target ≥48 px (spec 56 px) sin solape con `BottomNav` (`y+h ≤ vh-61`) | `transition-fab.spec.ts` A5 (`boundingBox` 375×667) + `size-14` en `app-layout-client.tsx:78` | ✅ |
| G1-5 | Oculto en el editor (modo foco) y en la biblioteca | `transition-fab.spec.ts` A3 (2ª mitad) + `FOCUS_MODE_ROUTES` | ✅ |
| G1-6 | CTA del dashboard conserva el botón con copy verbo: "Preparar jugada" | `components/padel/teacher-dashboard.tsx:58`; heading "Transiciones" de la biblioteca intacto | ✅ |
| G1-7 | `focus-visible` visible | `components/ui/button.tsx:8` (`focus-visible:ring-[3px]`) aplica al FAB — no requiere clase extra | ✅ |
| G1-8 | Punto de novedad sin mismatch de hidratación | `useSyncExternalStore` + `getServerSnapshot=false` (`app-layout-client.tsx:47-51`) | ✅ |

### G2 · Onboarding — flow strip (MEDIUM)

| AC | Criterio | Evidencia | Estado |
|---|---|---|---|
| G2-1 | Strip siempre visible con 5 fases y chip activo correcto | `flow-strip.tsx` (`<nav aria-label="Flujo del editor">` + `<ol>` + `aria-current="step"`) · `transition-editor.spec.ts` B3 (2 asserts de `aria-current` → "Tiro" y "Prueba") | ✅ |
| G2-2 | `deriveFlowStep` cubre precedencia (previewing > steps=0 > resto) | `tests/unit/padel/transition-flow.test.ts` (113 L); `lib/padel/court/flow.ts` **100 %** líneas/ramas | ✅ |
| G2-3 | **No** colisiona con locators E2E históricos (`role="tab"`, "Paso N") | `flow-strip.tsx` sin `role="tab"`/`<button>`; `transition-editor.spec.ts` verde **sin** reescribir `getByRole("tab", { name: /^Paso/ })` (B4) | ✅ |
| G2-4 | Sin scroll horizontal a 375 px (AC-01, canvas completo) | `transition-editor.spec.ts` L88-89 (`scrollWidth <= 375`) | ✅ |
| G2-5 | Colapsa a 1 línea tras el primer guardado | `flow-strip.tsx:50` (`<p>` "Paso N de 5 · …") | ✅ |

### G3 · Affordances y copy (MEDIUM)

| AC | Criterio | Evidencia | Estado |
|---|---|---|---|
| G3-1 | Hint visible `role="status"` ("Toca un jugador…" / "Arrastra el arco…" / "Sin tiro") | `scenario-canvas.tsx:43,67,70,97` · `transition-editor.spec.ts` C1 (visible con `selected=null`, ausente durante preview) | ✅ |
| G3-2 | Probar vs Guardar distinguibles por `aria-describedby` sin cambiar nombre accesible | `context-bar.tsx:208,218` + `:47-48` · spec C2 (`#transition-preview-hint` = /en memoria/, `#transition-save-hint` = /biblioteca/) | ✅ |
| G3-3 | Badge `● Cambios sin guardar` / `✓ Guardado` | `context-bar.tsx:134` · spec C3/L180 | ✅ |
| G3-4 | Post-save "Guardado ✓" ≤2 s con nombre accesible estable | `context-bar.tsx:50,119` + `aria-label` · spec C5/L130 | ✅ |
| G3-5 | Filmstrip: "Secuencia · N pasos", "← Antes / Después →", "+ Añadir paso" | `step-filmstrip.tsx:54,150,160` + `aria-label="Añadir paso"` (:65) · spec C4/L145-147 | ✅ |
| G3-6 | Manija del arco con anillo visible, sin regresión del gesto Konva | `EditorStage.tsx` (sólo estilo) + `puzzle-demo.spec.ts` verde (motor intacto) | ✅ (auto) / 👁 **manual pendiente** (Konva no inspeccionable fiable con Playwright — C6) |

---

## 2. Gates ejecutados (resultados REALES de esta pasada)

| # | Gate | Comando | Resultado real | Veredicto |
|---|---|---|---|---|
| 1 | Typecheck | `npx tsc --noEmit` | exit **0**, 0 errores | ✅ PASS |
| 2 | Lint | `pnpm run lint` | **0 errores**, 255 warnings (todos `no-explicit-any`/`security/*` en tests preexistentes; ninguno en archivos del fix) | ✅ PASS |
| 3 | Unit (Jest) | `pnpm run test:unit` | **882 passed / 882**, **67/67 suites**, 5.862 s | ✅ PASS |
| 4 | E2E focalizado | `npx playwright test tests/e2e/{transition-fab,transition-editor,puzzle-demo}.spec.ts` con `DATABASE_URL` a :5434 | **6 passed / 6** (3 workers, 11.7 s), 0 skipped | ✅ PASS |
| 5 | Build | `pnpm run build` | **OK**; `/preview/coach-transition-editor` prerenderizada (static ○) | ✅ PASS |
| 6 | Coverage (módulo afectado) | incluido en `test:unit` | `lib/padel/court` = 99.1 % stmts / 96.96 % ramas; `flow.ts` = **100/100/100/100**; baseline `lib` 88.6/76.6 → **sin regresión** | ✅ PASS |
| 7 | API tests | — | **N/A justificado**: 0 endpoints/contratos tocados; `tests/api/padel/transitions-guard.spec.ts` sin cambios (401/403/404 intactos por lectura de diff) | ⚪ N/A |
| 8 | api-docs | `lib/api-docs/spec.ts` | **N/A**: sin endpoints nuevos ni modificados | ⚪ N/A |
| 9 | DB / migraciones | — | **N/A**: `drizzle/` sin cambios (`0012` sigue siendo la última); 0 columnas/tablas | ⚪ N/A |
| 10 | secrets / SAST / audit-deps | — | **No ejecutados en esta pasada** (0 dependencias nuevas, 0 `.env` tocados, 0 superficie de red). Recomendado correr `node scripts/validate-harness.js --all` antes de `/supercommitpro` | ⚠️ no corrido |

**Evidencia E2E (6/6):**

```
✓ puzzle-demo.spec.ts:56  › sin sesión redirige a /login                      (1.1s)
✓ puzzle-demo.spec.ts:62  › usuario ACTIVE navega los pasos con aria-live     (3.7s)
✓ transition-fab.spec.ts:93  › ADMIN ve el FAB, 1 toque al editor, oculto en biblioteca/editor (5.5s)
✓ transition-fab.spec.ts:127 › USER no ve el FAB en /dashboard                (2.4s)
✓ transition-editor.spec.ts:95  › crear → probar → guardar → recargar persiste, sin scroll horizontal (8.7s)
✓ transition-editor.spec.ts:184 › USER en /transiciones redirigido + API 403  (1.8s)
6 passed (11.7s)
```

> Nota anti-falso-verde: los 3 specs hacen `test.skip(!process.env.DATABASE_URL)`. Se ejecutaron **con** `DATABASE_URL` (Postgres local :5434) → 0 skipped, verde real. `puzzle-demo` y `transition-editor` usaron SQL real (seed `INSERT ... ON CONFLICT`).

---

## 3. Hallazgos

### F-1 · BUG REAL cazado por el E2E: el FAB quedaba fuera del viewport (`position: relative`) — **RESUELTO (fix de 1 línea)**

| Campo | Detalle |
|---|---|
| **Severidad** | **S1 (bloqueante)** — el entry point de G1 era total e invisiblemente inoperante: en dev/build no había error, `tsc`/`lint`/unit verdes; sólo la aserción de geometría del E2E lo detectó. |
| **Repro** | 1) `Button asChild` con `className="... fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] ..."` → 2) `<Link className="relative" …>` → 3) `Slot` fusiona ambas clases **en el mismo `<a>`** → 4) Tailwind emite `.relative` **después** de `.fixed` en el CSS → gana `position: relative` → 5) `bottom: calc(4.75rem+…)` deja de ser offset de viewport y pasa a desplazar el `<a>` **76 px hacia arriba respecto de su flujo normal** → `boundingBox().y ≈ −76` ⇒ FAB fuera de pantalla. |
| **Cómo lo cazó** | `transition-fab.spec.ts` A5: `expect(box.y + box.height).toBeLessThanOrEqual(667 - 61)` (y A3: `toBeVisible()` + `waitForURL`). Con `y` negativo el assert falla; en la UI el FAB sencillamente no se veía. |
| **Causa raíz** | Conflicto de utilidades de `position` en el mismo elemento por `asChild` + `Slot` (el `relative` existía sólo para anclar el punto de novedad `absolute`). Orden de emisión de Tailwind: `.relative` > `.fixed`. |
| **Fix aplicado (1 línea)** | Eliminar `className="relative"` del `<Link>`. El punto de novedad sigue funcionando porque su ancestro posicionado es ahora el propio `<a>` con `fixed` (establece containing block). Resultado: `app-layout-client.tsx:80-94` — `Link` sin `relative`, `<span class="absolute right-2 top-2 size-2 …">`. |
| **Test que lo valida** | `transition-fab.spec.ts` A5 (geometría) + A3 (visibilidad/navegación) → **verde**. |
| **Aprendizaje** | Con `asChild`/`Slot`, **nunca** poner `relative`/`fixed`/`absolute` en el hijo si el padre ya define `position`: las utilidades se concatenan en un solo elemento y gana la última en el CSS, no la del "wrapper". |

### F-2 · Colisión de locators E2E — **contenida, sin incidentes**
El strip se implementó con `<ol>/<li>` + `aria-current="step"` (nunca `role="tab"` ni "Paso N"), y "Probar"/"Guardar"/"Añadir paso" conservaron su nombre accesible. Los 4 locators históricos resuelven a 1 elemento en strict mode (B4). ✅ Riesgo MEDIUM del plan materializado sin daño.

### F-3 · El mockup efímero sigue en el repo (no bloqueante)
`app/preview/coach-transition-editor/page.tsx` + `components/preview/coach-transition-editor.tsx` siguen presentes. `ponytail-review-report.md` §5.3 y `design-approved.md` §4 piden borrarlos al cierre, **pero** este encargo exige que el build incluya `/preview/coach-transition-editor` → se mantiene. **Acción del orquestador al cerrar el fix**: borrar ambos y verificar `grep -rn "coach-transition-editor" app components` = 0.

### F-4 · Verification gap (no bloqueante): desktop `md+`
La pill extendida (`md:h-14 md:w-auto md:px-5` + texto "Nueva transición") y el `md:sticky` del strip **no** tienen assert automatizado: los 3 E2E corren a 375×667. Verificado por lectura de clases; añadir un `viewport 1280` al `transition-fab.spec.ts` queda como mejora de fase 2 (D-2 en `acceptance-criteria.md`).

### F-5 · Sin hallazgos en auth / DB / API
`validateAdmin` sigue protegiendo `/transiciones/nueva` (E2E: USER → redirect + 403 en API). El FAB **no** es frontera de seguridad. 0 cambios en `lib/auth/*`, `drizzle/`, `app/api/*`.

---

## 4. Pendientes antes de `/supercommitpro`

| # | Acción | Bloqueante |
|---|---|---|
| 1 | `node scripts/validate-harness.js --all` (secrets, SAST, audit deps, coverage, features, docs) | No — recomendado |
| 2 | Borrar el mockup efímero (F-3) | No — decisión del orquestador |
| 3 | Verificación visual manual 375 px + 1280 px de la manija del arco (C6) y de la pill desktop (F-4) | No |

## 5. Veredicto

**✅ APROBADO** (release v0.10, fix `2026-11-03-fix-problems`). Los 6 grupos de AC tienen evidencia automatizada y los 5 gates ejecutados pasan con resultados reales: `tsc` 0, lint 0 errores, 882/882 unit, 6/6 E2E con SQL real, build OK. El único defecto real de la implementación (F-1, FAB fuera de viewport) fue detectado y corregido antes de este reporte, y queda cubierto por el E2E de geometría. Sin impacto en auth, DB, API ni dependencias. Sin bugs abiertos de severidad S1/S2.
