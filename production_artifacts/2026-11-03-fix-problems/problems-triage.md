# Problems Triage — Descubribilidad + comprensión del Editor de Transiciones

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor` (ya en `main`)
> date: 2026-11-03 · owner: @qa-fix · fase previa: diseño aprobado (A3 FAB + onboarding O1)
> Fuente del alcance: `design-exploration.md`, `ui-kit-audit.md`, `mockup-spec.md`, `design-approved.md` (mismo directorio).

---

## 0. Insumos y estado del repo

| Insumo | Resultado |
|---|---|
| Panel Problems (TS/lint) | **No disponible / sin errores**: `npx tsc --noEmit` = 0, `pnpm run lint` = 0 errores (verificado por el orquestador) |
| `.validation/status.json` | `status: "pass"` (18 gates OK, 0 fail) — no hay deuda de gates que arrastre este fix |
| Reporte del usuario | Cuenta **ADMIN**: (1) no encontró cómo entrar al editor; (2) al entrar, no entendió el flujo |
| Naturaleza de los "errores" | **No son bugs de runtime**: son defectos de **descubribilidad y de modelo mental** (UX), con causa raíz localizable en código |
| `.agents/patterns/recurring-issues.md` | **0 matches**. El único patrón registrado es `DB Connection Crash on Layout Import` (`app/(public)/layout.tsx`) — no relacionado. No se crea entrada de patrón todavía (se evaluará al cerrar el fix; ver §5) |

> Consecuencia: el triage no clasifica "TypeScript / import / test / lint / runtime", porque ninguna de esas categorías tiene entradas. Se agrupa por **causa raíz UX**, que es donde está el defecto real.

---

## 1. Grupos por causa raíz

### G1 · Descubrimiento / entry-point — "no sé cómo entrar"

| Campo | Detalle |
|---|---|
| **Síntoma** | Con sesión ADMIN, el usuario no encontró el editor ni desde el dashboard ni desde la navegación. |
| **Causa raíz** | El único acceso es un CTA secundario `variant="outline"` con **sustantivo** ("Transiciones") en el header del dashboard del coach, en competencia visual con el primario "Evaluar ahora". No existe ningún punto de entrada persistente en el resto de rutas de trabajo, y el `BottomNav` ya está **saturado a 7 items** (prohibido el 8.º: 375 px / 7 ≈ 53 px por item). El editor además **oculta el nav** (`FOCUS_MODE_ROUTES`), así que una vez dentro no hay retorno por nav. |
| **Archivos afectados (reales)** | `components/padel/teacher-dashboard.tsx` (L56-63: `Button variant="outline"` → `Link href="/transiciones"`, label "Transiciones") · `components/layout/app-layout-client.tsx` (L16 `FOCUS_MODE_ROUTES`, L18-21 `role`/`pathname`, L30 montaje de `BottomNav` — único punto que ya conoce rol y ruta) · `lib/constants/navigation.ts` (L3-11 `ADMIN_NAV_ITEMS`, 7 items — **no tocar**) · `components/padel/bottom-nav.tsx` (consumidor de `getNavItems`) |
| **Fix mínimo (diseño aprobado D5/D6 · A3)** | 1. Montar **inline** en `AppLayoutClient` un `Button asChild size="icon" className="size-14 rounded-full fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6 md:h-14 md:w-auto md:px-5 z-40 shadow-lg"` → `Link href="/transiciones/nueva"`, icono `Route`, `aria-label="Crear transición"`, pill extendida `md+` con texto "Nueva transición", `focus-visible:ring-2`. **Sin componente `ui/*` nuevo.** 2. Visibilidad por **función pura exportada** (testeable, sin DOM): `canShowTransitionFab(role, pathname)` → `role === "ADMIN" && !FOCUS_MODE_ROUTES.some(r => r.test(pathname)) && !/^\/(transiciones|settings|admin)(\/|$)/.test(pathname)`. 3. Cambiar el copy del CTA existente a verbo de acción: **"Preparar jugada"** (se conserva el botón). 4. Punto de novedad dismissible con `localStorage["padel.transitionFab.seen"]` (fallback: visible si falla). |
| **Riesgo** | **LOW**. Aditivo, cero cambios de auth/DB/API (el destino `/transiciones/nueva` ya está guardado por `validateAdmin`); condición derivada de props ya presentes en el layout; sin dependencias nuevas; `BottomNav` intacto (7 items). Riesgo residual: dot de novedad puede causar mismatch de hidratación si se lee `localStorage` en render → leer en `useEffect`. |
| **Aceptación** | FAB visible para ADMIN en `/dashboard`, `/cursos`, `/cursos/[id]`, `/evaluar`, `/historial`, `/academias`, `/academias/[id]`; **oculto** en `/transiciones*`, `/settings`, `/admin/**` y para `USER`; 1 toque → `/transiciones/nueva`. |

---

### G2 · Onboarding / flujo no representado — "no sé qué sigue"

| Campo | Detalle |
|---|---|
| **Síntoma** | El usuario entra y no entiende la secuencia (paso → mover → tiro → probar → guardar); tiene que descubrirla por ensayo/error. |
| **Causa raíz** | El flujo **no está representado en ninguna parte**: `editor-screen` orquesta 6 estados (`steps`, `selected`, `dirty`, `saving`, `previewing`, `previewIndex`) pero no los expone como progreso. Las pistas existentes están **fuera del área de atención** (bajo el canvas) y son fragmentadas. No hay `stepper`/`breadcrumb` en el UI kit (`ui-kit-audit.md` §2 N2). |
| **Archivos afectados (reales)** | `components/padel/transition-editor/editor-screen.tsx` (L96-101 derivación de `doc/steps/step/dirty/canSave`; L250-324 layout: header + canvas + filmstrip + `ContextBar`) · `components/padel/transition-editor/context-bar.tsx` (L83-94 header con la única pista "Toca un jugador en la cancha") · `components/padel/transition-editor/step-filmstrip.tsx` (L52-55 "Pasos · N") · `components/padel/transition-editor/scenario-canvas.tsx` (L70-72 `aria-label` del gesto: sólo para lectores de pantalla) |
| **Fix mínimo (diseño aprobado D1 · O1)** | 1. Nuevo **presentacional** `components/padel/transition-editor/flow-strip.tsx`: 5 chips `①Paso ②Mueve ③Tiro ④Prueba ⑤Guarda` con `aria-current="step"` en el activo. **Prohibido `role="tab"`/`<button>`**: usar `<ol>/<li>` (no interactivo) para no colisionar con los locators E2E de `getByRole("tab", { name: /^Paso N/ })`. 2. Función pura `deriveFlowStep({ stepsCount, selected, hasShot, dirty, previewing })` en `lib/padel/court/flow.ts` → índice 1..5 (sin estado nuevo, sin `localStorage`). 3. Montar el strip en `editor-screen` sobre el canvas (`md:sticky` bajo la cabecera); colapsa a 1 línea "Paso 2 de 5 · Tiro" tras el primer guardado. 4. **No** se toca estado ni mutaciones de `editor-screen`. |
| **Riesgo** | **MEDIUM**. (a) Layout: +28 px a 375×667 → canvas baja de 54vh a ~50vh (sigue dentro de AC-01; riesgo aceptado en `design-exploration.md` §E.1). (b) **Colisión de locators**: añadir roles/nombres nuevos puede romper `tests/e2e/transition-editor.spec.ts` (strict mode) → mitigado por la regla de no usar `role="tab"`. (c) `editor-screen.tsx` está a 344 líneas; el strip debe quedar fuera para no acercarlo al límite `max-lines`. Sin cambios de lógica de negocio. |
| **Aceptación** | Strip siempre visible en el editor; chip activo correcto en los 5 estados; colapsa tras guardar; nunca en `/transiciones` (biblioteca). |

---

### G3 · Affordances, gestos implícitos y copy ambiguo — "Probar y Guardar parecen lo mismo"

| Campo | Detalle |
|---|---|
| **Síntoma** | "Probar" vs "Guardar" indistinguibles; el filmstrip no explica qué es un paso; los controles "← Mover / Mover →" son ambiguos; las manijas del arco no parecen arrastrables; "sin guardar"/"guardado" es microcopy muda. |
| **Causa raíz** | Los controles nombran la **implementación** (mover, pasos) en lugar del **modelo mental del coach** (antes/después, secuencia, probar en memoria vs guardar en biblioteca). Las manijas del arco son círculos sin icono ni anillo diferenciado en `EditorStage` (Konva), y la única explicación del gesto está en `aria-label` (invisible). El estado del documento se comunica con texto plano en 11 px. |
| **Archivos afectados (reales)** | `components/padel/transition-editor/context-bar.tsx` (L82-83 `disabled`/`label`, L158-160 "sin guardar"/"guardado", L161-173 botones Probar/Guardar sin jerarquía semántica) · `components/padel/transition-editor/step-filmstrip.tsx` (L52-55 "Pasos · N", L137-155 "← Mover"/"Mover →", L56-65 `+` sin texto, L126-134 `+` final) · `components/padel/transition-editor/scenario-canvas.tsx` (L63-88 contenedor del stage, sin overlay de hint) · `components/court/EditorStage.tsx` (manijas del arco: círculos Konva sin anillo/grip) · `components/padel/transition-editor/editor-screen.tsx` (L277-289 contenedor del canvas, punto natural del overlay) |
| **Fix mínimo (diseño aprobado D2/D3/D4 + N5/N6)** | 1. `scenario-canvas.tsx`: **Badge flotante** `pointer-events-none role="status"` dentro del contenedor → "Toca un jugador para moverlo" si `selected === null`; "Arrastra el arco para curvar el tiro" si hay jugador con tiro; "Sin tiro · toca ◎ para fijarlo" si el paso no tiene tiro. 2. `context-bar.tsx`: `aria-describedby` en **Probar** ("Reproduce la jugada en memoria · no guarda") y **Guardar** ("Guarda en tu biblioteca"); `Badge` `● Cambios sin guardar` / `✓ Guardado`; estado post-save del botón **"Guardado ✓" 2 s sin cambiar el nombre accesible** (mantener `Guardar` accesible vía `aria-label` o `sr-only`, para no romper E2E). 3. `step-filmstrip.tsx`: "Pasos · N" → **"Secuencia · N pasos"** + subtítulo "Cada paso es una foto de la jugada"; "← Mover/Mover →" → **"← Antes / Después →"**; `+` → `+ Añadir paso` (texto `md+`, `aria-label` siempre). 4. `EditorStage.tsx`: anillo `strokeWidth` 3 + punto central en la manija del arco (sólo estilo, cero cambios de hit-testing/animación). |
| **Riesgo** | **MEDIUM**. Copy y etiquetas son lo más testeado del editor: `tests/e2e/transition-editor.spec.ts` usa `getByRole("button", { name: "Probar" })`, `{ name: "Guardar" }`, `getByRole("tab", { name: /^Paso N/ })`, `{ name: "Añadir paso", exact: true }`. Cambios seguros: `aria-describedby`, `title`, Badge, subtítulo, "← Antes". Cambios **rompientes**: renombrar el paso de "Paso N" (tabs), o dejar "Guardar" sin nombre accesible estable. `EditorStage` es Konva (`dynamic ssr:false`): cambio visual de bajo alcance, riesgo medio por regresión de gesto. Sin auth/DB/API. |
| **Aceptación** | Probar y Guardar se distinguen por copy accesible y por badge de estado; filmstrip se entiende sin manual; el gesto del arco es visible; los 4 locators E2E vigentes siguen resolviendo a **1** elemento (strict mode). |

---

## 2. Archivos afectados — consolidado

| # | Archivo | Grupo | Acción | Riesgo |
|---|---|---|---|---|
| 1 | `components/layout/app-layout-client.tsx` | G1 | Montar FAB condicionado | LOW |
| 2 | `lib/constants/navigation.ts` | G1 | + `canShowTransitionFab()` puro (sin tocar `*_NAV_ITEMS`) | LOW |
| 3 | `components/padel/teacher-dashboard.tsx` | G1 | Copy CTA → "Preparar jugada" | LOW |
| 4 | `components/padel/transition-editor/flow-strip.tsx` | G2 | **NUEVO** presentacional (`ol/li`, `aria-current`) | LOW |
| 5 | `lib/padel/court/flow.ts` | G2 | **NUEVO** `deriveFlowStep()` puro | LOW |
| 6 | `components/padel/transition-editor/editor-screen.tsx` | G2/G3 | Montar strip + overlay hint (sin tocar estado) | MEDIUM |
| 7 | `components/padel/transition-editor/context-bar.tsx` | G3 | Copy, `aria-describedby`, Badge estado | MEDIUM |
| 8 | `components/padel/transition-editor/step-filmstrip.tsx` | G3 | Labels "Secuencia", "Antes/Después", "+ Añadir paso" | MEDIUM |
| 9 | `components/padel/transition-editor/scenario-canvas.tsx` | G3 | Badge hint `role="status"` | LOW |
| 10 | `components/court/EditorStage.tsx` | G3 | Manija del arco (estilo Konva) | MEDIUM |
| 11 | `app/preview/coach-transition-editor/page.tsx` | — | **NUEVO** (4 líneas) para ver el mockup | LOW |
| 12 | `tests/unit/padel/transition-fab-visibility.test.ts` | G1 | **NUEVO** tabla de visibilidad | LOW |
| 13 | `tests/unit/padel/transition-flow.test.ts` | G2 | **NUEVO** `deriveFlowStep` | LOW |
| 14 | `tests/e2e/transition-fab.spec.ts` | G1 | **NUEVO** ADMIN ve / USER no ve | LOW |
| 15 | `tests/e2e/transition-editor.spec.ts` | G2/G3 | **ACTUALIZAR** asserts (strip, hints, sin regresión de locators) | MEDIUM |

**Total: 15 archivos** (10 de producción, 5 de test). Supera el umbral de `>5 archivos` de `AGENTS.md` → **no es un fix de una pasada**. Mitigación sin cambiar alcance (ya validado por diseño): ejecutar en **3 chunks secuenciales ≤5 archivos**, cada uno con su gate. Alternativa si el orquestador prefiere: escalar a @pm sólo para confirmar el chunking (el alcance ya está aprobado en `design-approved.md`, no se reabre).

| Chunk | Ritmo | Archivos | Gate propio |
|---|---|---|---|
| **A — G1** | primero (desbloquea el descubrimiento) | 1, 2, 3, 12, 14 | `tsc` + `test:unit` + E2E `transition-fab` |
| **B — G2** | tras A verde | 4, 5, 6, 13, 15 | `tsc` + `test:unit` + E2E `transition-editor` (sin romper el flujo actual) |
| **C — G3** | tras B verde | 7, 8, 9, 10, 11 | `tsc` + `lint` + E2E `transition-editor` completo + revisión visual 375 px |

---

## 3. Clasificación de riesgo global

| Grupo | Riesgo | Justificación | Rollback |
|---|---|---|---|
| G1 Descubrimiento | **LOW** | Componente aditivo + guard admin ya existente; sin DB/API | Revertir el montaje del FAB en `app-layout-client.tsx` |
| G2 Onboarding | **MEDIUM** | Espacio vertical a 375 px + colisión potencial de locators E2E | Quitar `<FlowStrip>` de `editor-screen` (1 línea) |
| G3 Affordances/copy | **MEDIUM** | Copy y roles accesibles están cubiertos por E2E; `EditorStage` es Konva | Revertir `context-bar`/`step-filmstrip`/`scenario-canvas` (presentacional puro) |

- **Sin impacto** en auth, DB, migraciones, API, `lib/api-docs/spec.ts` ni `.env` (cero endpoints, cero columnas, cero dependencias).
- **No** se modifica `BottomNav` (7 items) ni la lógica de `use-transitions`/`lib/padel/court/*` (excepto el nuevo `flow.ts`, puro).

---

## 4. Fuera de alcance (no se toca en este fix)

- `components/padel/transition-editor/transition-library.tsx` y `transition-library-view.tsx` (biblioteca ya resuelta; su heading "Transiciones" **se mantiene** porque `transition-editor.spec.ts` L102 lo asserta).
- O3 (`CircleHelp` + `Dialog` "¿Cómo funciona?") — fase 2 opcional (D7).
- `CourtStage`, motor de animación, `ScenarioPreview` (la nota del feature lo prohíbe explícitamente).
- Cualquier 8.º item de `BottomNav`, `ui/sheet.tsx`, `ui/stepper.tsx`, librerías de coach-marks.

## 5. Pattern Detection

- Búsqueda en `.agents/patterns/recurring-issues.md`: **0 matches** con los síntomas de G1/G2/G3 (el único patrón registrado es un crash de layout por DB, no relacionado).
- Al cierre del fix, si G2/G3 se confirman como recurrencia de "feature sin entry point persistente" + "flujo no representado", registrar el patrón `Feature shipped sin entry-point persistente` (síntoma, fix FAB+strip, archivos, fecha) y dejar contador en 1.
