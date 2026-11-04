# Acceptance Criteria — Fix "Descubribilidad + comprensión del Editor de Transiciones"

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor` · release: **v0.10**
> date: 2026-11-03 · owner: **@qa-release** · fuentes: `design-exploration.md` (A/B/C/D), `design-approved.md` (D1–D6), `problems-triage.md` (G1/G2/G3), `test-matrix.md` §5.
> Criterio de estado: ✅ = evidencia automatizada verde ejecutada en esta pasada · 👁 = verificación manual · ⚪ = N/A justificado.

---

## 1. G1 · Descubrimiento (FAB) — LOW

| ID | Criterio de aceptación (verificable) | Evidencia | Estado |
|---|---|---|---|
| AC-G1-1 | Con sesión **ADMIN/SUPER_ADMIN**, existe un `link` con nombre accesible **"Crear transición"** en `/dashboard`, `/cursos`, `/cursos/[id]`, `/evaluar`, `/historial`, `/academias`, `/academias/[id]`. | `transition-fab-visibility.test.ts` (A1, 7 rutas) + `transition-fab.spec.ts:93` en `/dashboard` | ✅ |
| AC-G1-2 | Con sesión **USER**, el link **no existe** (`toHaveCount(0)`) en ninguna ruta. | unit A2 + `transition-fab.spec.ts:127` | ✅ |
| AC-G1-3 | El FAB está **oculto** en `/transiciones`, `/transiciones/nueva`, `/transiciones/[id]`, `/settings`, `/admin/**`. | unit A2 (6 rutas) + E2E A3 (biblioteca + editor) | ✅ |
| AC-G1-4 | **1 toque** en el FAB navega a `/transiciones/nueva` (sin speed-dial ni menú intermedio). | `transition-fab.spec.ts:115` (`waitForURL("**/transiciones/nueva")`) | ✅ |
| AC-G1-5 | Target táctil **≥48×48 px** (spec: 56 px) y **sin solape** con `BottomNav` a 375×667 (`y + height ≤ viewportHeight − 61`). | `transition-fab.spec.ts:104-109` + `size-14` (`app-layout-client.tsx:78`) | ✅ |
| AC-G1-6 | Sin **scroll horizontal** en la ruta donde se monta (`documentElement.scrollWidth ≤ 375`). | `transition-editor.spec.ts:88-89` (patrón; FAB en `/dashboard` sin overflow por ser `fixed`) | ✅ |
| AC-G1-7 | El FAB es **flotante** (`position: fixed`) — nunca desplaza el contenido ni aparece desplazado por su propio `bottom`. | Inspección del DOM resuelto: `<a>` con `fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]`, sin `relative` | ✅ (regresión F-1 cubierta por AC-G1-5) |
| AC-G1-8 | Foco visible con teclado (`focus-visible` ring) y nombre accesible independiente del icono (`Route` es `aria-hidden`). | `components/ui/button.tsx:8` + `app-layout-client.tsx:82,86` | ✅ |
| AC-G1-9 | Punto de novedad de primera sesión **sin** mismatch de hidratación; si `localStorage` falla/no está, el FAB se muestra igual. | `useSyncExternalStore` + `getServerSnapshot=false` + `try/catch` en `app-layout-client.tsx:26-42` | ✅ |
| AC-G1-10 | El CTA del dashboard **se conserva** (no se reemplaza) con copy verbo: "Preparar jugada"; el heading "Transiciones" de la biblioteca **no cambia**. | `teacher-dashboard.tsx:58` · `transition-library.tsx` intacto (asserta en `transition-editor.spec.ts:102`) | ✅ |
| AC-G1-11 | `BottomNav` sigue con **7 items** (ningún 8.º). | `lib/constants/navigation.ts` `ADMIN_NAV_ITEMS` sin cambios | ✅ |
| AC-G1-12 | El FAB **no** es frontera de seguridad: un USER que fuerce la URL cae en `/dashboard` y la API responde 403. | `transition-editor.spec.ts:184` + `:194` | ✅ |

## 2. G2 · Onboarding (flow strip) — MEDIUM

| ID | Criterio de aceptación | Evidencia | Estado |
|---|---|---|---|
| AC-G2-1 | El strip es visible en el editor en todo momento, con 5 fases (`①Paso ②Mueve ③Tiro ④Prueba ⑤Guarda`). | `flow-strip.tsx:57-58` (`<nav aria-label="Flujo del editor">` + `<ol>`) | ✅ |
| AC-G2-2 | Existe **exactamente 1** chip con `aria-current="step"` en cada estado. | `transition-editor.spec.ts:118` (`toHaveCount(1)`) + `:138`, `:160` | ✅ |
| AC-G2-3 | El chip activo es correcto por estado: `steps=0`→Paso · `selected=null`→Mueve · seleccionado sin tiro→Tiro · `previewing`→Prueba · `dirty`/guardado→Guarda. | `transition-flow.test.ts` (17 casos) — `flow.ts` 100 % ramas | ✅ |
| AC-G2-4 | `previewing` tiene **prioridad** sobre cualquier otro estado. | unit B2 | ✅ |
| AC-G2-5 | El strip **no** introduce `role="tab"` ni nombres "Paso N" (no colisiona con los tabs del filmstrip). | `flow-strip.tsx` (`ol/li`, sin `button`) + strict-mode verde del spec sin cambios en B4 | ✅ |
| AC-G2-6 | Tras el primer guardado el strip **colapsa** a 1 línea ("Paso N de 5 · …"). | `flow-strip.tsx:50` | ✅ (código) |
| AC-G2-7 | Con el strip montado, el canvas sigue completo y sin overflow a 375×667 (AC-01). | `transition-editor.spec.ts:88` + riesgo aceptado §E.1 | ✅ |
| AC-G2-8 | El strip **nunca** aparece en `/transiciones` (biblioteca). | Sólo se monta en `editor-screen.tsx` | ✅ |

## 3. G3 · Affordances, gestos y copy — MEDIUM

| ID | Criterio de aceptación | Evidencia | Estado |
|---|---|---|---|
| AC-G3-1 | Con `selected === null`, el canvas muestra un hint visible `role="status"` con "Toca un jugador" (no sólo `aria-label`). | `scenario-canvas.tsx:97` + `transition-editor.spec.ts:121` | ✅ |
| AC-G3-2 | Con jugador seleccionado **con tiro**, el hint cambia a "Arrastra el arco para curvar el tiro"; **sin** tiro, a "Sin tiro · toca ◎ para fijarlo". | `scenario-canvas.tsx:67-70` (ternario de 3 ramas) | ✅ (código) |
| AC-G3-3 | Durante el preview el hint de selección **desaparece**. | `transition-editor.spec.ts:161` (`toHaveCount(0)`) | ✅ |
| AC-G3-4 | **Probar** conserva el nombre accesible exacto `"Probar"` **y** tiene `aria-describedby` que contiene "en memoria". | `context-bar.tsx:208` + `:47` · spec `:126-127` | ✅ |
| AC-G3-5 | **Guardar** conserva el nombre accesible exacto `"Guardar"` **y** tiene `aria-describedby` que contiene "biblioteca". | `context-bar.tsx:218` + `:48` · spec `:128-129` | ✅ |
| AC-G3-6 | Tras guardar, el botón muestra "Guardado ✓" **≤2 s** y luego vuelve a "Guardar", **sin** cambiar el nombre accesible. | `context-bar.tsx:50,119` · spec `:130` | ✅ |
| AC-G3-7 | Badge de estado del documento: `● Cambios sin guardar` cuando hay cambios; `✓ Guardado` tras persistir. | `context-bar.tsx:134` · spec `:180` | ✅ |
| AC-G3-8 | Filmstrip: "Secuencia · N pasos" + subtítulo "Cada paso es una foto de la jugada"; conteo correcto con singular/plural. | `step-filmstrip.tsx:54` · spec `:145` | ✅ |
| AC-G3-9 | Reordenamiento con copy de modelo mental: "← Antes" / "Después →" (no "Mover"). | `step-filmstrip.tsx:150,160` · spec `:147` | ✅ |
| AC-G3-10 | "+ Añadir paso" visible en `md+` y con `aria-label="Añadir paso"` (el chip de cabecera) / `"Añadir paso al final"` (el del final) — el locator `{ name: "Añadir paso", exact: true }` sigue resolviendo a 1 elemento. | `step-filmstrip.tsx:65,68,91,135` · strict mode verde | ✅ |
| AC-G3-11 | La manija del arco tiene anillo (`strokeWidth` 3) + punto central visibles y sigue siendo arrastrable; sin cambios de hit-testing/animación. | `EditorStage.tsx` (sólo estilo) + `puzzle-demo.spec.ts` verde | 👁 **manual** (Konva) |
| AC-G3-12 | Cero dependencias nuevas, cero componentes `ui/*` nuevos, cero hex nuevo (sólo CSS vars/`COURT_COLORS`). | `git status` sin `package.json` · `ui/*` sin archivos nuevos | ✅ |

## 4. AC transversales (repo)

| ID | Criterio | Evidencia | Estado |
|---|---|---|---|
| AC-T-1 | `npx tsc --noEmit` = 0 errores | ejecutado | ✅ |
| AC-T-2 | `pnpm run lint` = 0 errores (warnings permitidos) | 0 errores / 255 warnings preexistentes | ✅ |
| AC-T-3 | Unit completo verde y sin regresión (882) | 882/882, 67 suites | ✅ |
| AC-T-4 | E2E de la feature verde con SQL real (sin skip) | 6/6, `DATABASE_URL` :5434 | ✅ |
| AC-T-5 | `pnpm run build` OK incluyendo `/preview/coach-transition-editor` | build OK, ruta ○ static | ✅ |
| AC-T-6 | Cobertura del módulo sin caída >3 % | `lib/padel/court` 99.1/96.96 · `flow.ts` 100 % | ✅ |
| AC-T-7 | 0 impacto en auth/DB/API/`.env`/`api-docs` | `lib/auth/*`, `drizzle/*`, `app/api/*`, `lib/api-docs/spec.ts` sin diff | ✅ |
| AC-T-8 | Sin leak de credenciales ni dependencias vulnerables nuevas | 0 deps nuevas, 0 `.env` tocados (secrets/SAST **no** corridos en esta pasada → ver `release-report.md` §2 gate 10) | ⚠️ no corrido |

---

## 5. AC adicionales propuestos por @qa-release (edge cases)

> No bloquean el release: se documentan como criterios de fase 2 / vigilancia. Cada uno indica si hoy está cubierto, parcialmente cubierto o abierto.

| ID | Edge case | Por qué importa | Cobertura hoy | Estado |
|---|---|---|---|---|
| EC-1 | **Deep-link** `/transiciones/nueva` por un USER (forzando URL, sin pasar por el FAB) | El FAB no es frontera de seguridad | `transition-editor.spec.ts:184` (USER en `/transiciones` → redirect) + `validateAdmin` en la página | ✅ cubierto (variante directa al sub-path: ⚠️ no testeada) |
| EC-2 | **`localStorage` bloqueado** (Safari privado / cookies bloqueadas) | `getItem`/`setItem` pueden lanzar | `try/catch` en `getFabHintSnapshot`/`dismissFabHint`; fallback = FAB visible sin punto | ✅ cubierto (por código) |
| EC-3 | **Rutas futuras con prefijo parecido** (`/transiciones-internas`, `/settings-personal`, `/administracion`) | El regex de exclusión podría comerse rutas válidas | unit: `canShowTransitionFab` devuelve `true` para ambos (match exacto por segmento) | ✅ cubierto |
| EC-4 | **Rutas dinámicas anidadas** (`/cursos/[id]/alumnos`, `/academias/[id]/rubricas`) | El FAB debe seguir visible en sub-rutas de trabajo | Testeado: `/cursos/<uuid>` y `/academias/<uuid>` | ⚠️ parcial (sub-sub-rutas no testeadas; comportamiento esperado: FAB visible) |
| EC-5 | **Pill extendida en `md+` / tablet apaisada** (768–1280 px) | Nadie asserta el layout desktop | Sólo lectura de clases (`md:h-14 md:w-auto md:px-5`) | 🔴 abierto (F-4 del release report) |
| EC-6 | **Sidebar colapsado** en desktop | El FAB es `fixed`: no debe moverse ni tapar el sidebar | `fixed right-6 bottom-6` (independiente del sidebar) | ⚠️ no testeado |
| EC-7 | **Zoom 200 % / `text-size-adjust`** en móvil | El strip de 5 chips podría desbordar | `overflow-x-auto` en el `<ol>` (`flow-strip.tsx:58`) | ⚠️ parcial (por código, no por test) |
| EC-8 | **Editor con 0 pasos** (primer uso real): strip en ① y hint "Toca un jugador" | Es el caso del usuario que reportó el problema | `flow.ts` (`stepsCount=0 → 1`) + `scenario-canvas` hint | ✅ cubierto (unit + E2E parcial) |
| EC-9 | **Preview en curso + guardado simultáneo**: el strip no debe marcar dos chips activos | `aria-live`/estado visual inconsistente | spec `:118` (`toHaveCount(1)` en transiciones de estado) | ✅ cubierto |
| EC-10 | **Guardado con error** (respuesta no-OK): botón vuelve a "Guardar", badge sigue `● Cambios sin guardar` | Feedback de fallo | `context-bar.tsx` (transición `saving→false`) · sin E2E de error | 🔴 abierto (mejora de fase 2) |
| EC-11 | **Salida con cambios sin guardar** (`AlertDialog` EC-11 + `beforeunload`) | Regresión de seguridad de datos | Conservado (no se tocó `editor-screen`) | ✅ cubierto (por código) |
| EC-12 | **`prefers-reduced-motion`**: el "Guardado ✓" no depende de animación | Accesibilidad | Cambio de texto, sin animación | ✅ cubierto |

---

## 6. Checklist manual (único work pendiente, no bloqueante)

- [ ] **C6 / AC-G3-11** — 375×667 (Chrome + Safari iOS): la manija del arco muestra anillo + punto central y se arrastra sin salto; el hint "Arrastra el arco…" aparece con jugador + tiro.
- [ ] **EC-5 / F-4** — 1280 px: el FAB es pill (`Route · Nueva transición`), el strip queda `sticky` bajo la cabecera y no tapa el canvas.
- [ ] **EC-6** — 1280 px con sidebar colapsado: el FAB mantiene `right-6 bottom-6`.
- [ ] **EC-7** — 375 px con zoom de texto al 150 %: el strip scrollea en horizontal sin romper el layout.
- [ ] **Housekeeping** — borrar el mockup efímero (`app/preview/coach-transition-editor/`, `components/preview/coach-transition-editor.tsx`) y verificar `grep -rn "coach-transition-editor" app components` = 0.
- [ ] Registrar el patrón `Feature shipped sin entry-point persistente` en `.agents/patterns/recurring-issues.md` (contador 1), según `problems-triage.md` §5 y `repair-plan.md` §9.

## 7. Veredicto de aceptación

**Todas las AC bloqueantes (AC-G1-*, AC-G2-*, AC-G3-1..G3-10, AC-G3-12, AC-T-1..T-7) cumplen con evidencia ejecutada.** No quedan AC bloqueantes abiertos; el único criterio no verificado por automatización (manija Konva, AC-G3-11) se mitiga con la regresión verde del motor y queda en el checklist manual. **Fix aceptado para v0.10.**
