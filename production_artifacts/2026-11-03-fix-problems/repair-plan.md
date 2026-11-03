# Repair Plan — Descubribilidad + comprensión del Editor de Transiciones

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor`
> date: 2026-11-03 · owner: @architect-fix · insumos: `problems-triage.md`, `design-approved.md`, `test-matrix.md`
> Alcance congelado por diseño aprobado (A3 FAB + O1 onboarding). Este plan **no implementa**; ordena y asigna.

---

## 0. Verificación contra el código real (no sólo contra el triage)

| Afirmación del triage | ¿Confirmada? | Evidencia |
|---|---|---|
| `app-layout-client.tsx` es el único punto que ya conoce `role` + `pathname` | ✅ | 33 L; `role` prop, `usePathname()`, `FOCUS_MODE_ROUTES` y `BottomNav` en el mismo árbol |
| `FOCUS_MODE_ROUTES` ya cubre el editor | ✅ | `[/^\/transiciones\/nueva$/, /^\/transiciones\/[^/]+$/]` — oculta nav en el editor **y** en `/transiciones/<uuid>` |
| `BottomNav` ADMIN a 7 items (no tocar) | ✅ | `ADMIN_NAV_ITEMS` = 7 (dashboard, cursos, academias, evaluar, historial, admin, settings) |
| `context-bar` tiene "sin guardar"/"guardado" en texto plano | ✅ | L159 `{dirty ? "sin guardar" : "guardado"}` |
| `step-filmstrip` usa "Pasos · N", "← Mover", "Mover →" | ✅ | L53, L145, L154 |
| Locators E2E sensibles | ✅ | `getByRole("tab", { name: /^Paso 1/ })`, `{ name: "Probar" }`, `{ name: "Guardar" }`, `{ name: "Añadir paso", exact: true }`, heading "Transiciones" (L102) |
| El mockup ya existe | ✅ | `components/preview/coach-transition-editor.tsx` (falta sólo la ruta que lo monta; hoy `app/preview/{etapa1,etapa3,etapa4}` muestran el patrón de 4 líneas) |
| Cero deuda de gates | ✅ | `tsc --noEmit` = 0, `pnpm run lint` = 0; `.validation/status.json` = pass |

> Corrección al triage: no es un fix de "errores" (0 TS/lint/runtime). Es un fix **UX aditivo** con causa raíz en código de presentación. Eso fija su clasificación y su techo de riesgo.

---

## 1. Causa raíz por grupo (confirmada)

| Grupo | Causa raíz (una frase) | Código donde vive |
|---|---|---|
| **G1 · Entry point** | El editor sólo se alcanza por un CTA secundario en el dashboard del coach; no hay punto de entrada persistente en las rutas de trabajo y el `BottomNav` está saturado a 7 items, así que el acceso depende de que el usuario vuelva al dashboard. | `teacher-dashboard.tsx` (CTA `outline` "Transiciones") + `app-layout-client.tsx` (único lugar con `role`/`pathname` para montar algo global) |
| **G2 · Flujo no representado** | `editor-screen` orquesta 6 estados (`steps/selected/dirty/saving/previewing/previewIndex`) pero **no los expone como progreso**; las pistas están fuera del área de atención (bajo el canvas) y no hay stepper en el UI kit. | `editor-screen.tsx` (layout), `context-bar.tsx` (única pista), `step-filmstrip.tsx` (conteo), `scenario-canvas.tsx` (`aria-label` invisible) |
| **G3 · Affordances/copy** | Los controles nombran la **implementación** ("mover", "pasos") en vez del modelo mental del coach ("antes/después", "secuencia", "probar en memoria vs guardar en biblioteca"); el gesto del arco sólo existe en `aria-label` y el estado del documento se comunica en 11 px de texto plano. | `context-bar.tsx`, `step-filmstrip.tsx`, `scenario-canvas.tsx`, `EditorStage.tsx` (manijas Konva sin anillo/grip) |

**Descartado explícitamente por falta de causa raíz**: no hay desalineación de contrato API, no hay drift de schema, no hay fuga de guard, no hay abstracción compartida rota. Por eso no aparece ninguna causa raíz "de sistema".

---

## 2. Clasificación por grupo

| Grupo | Clasificación | Justificación | ¿Sistémico? |
|---|---|---|---|
| **G1** | **fix local** | Se resuelve dentro de `app-layout-client.tsx` + un helper puro; consume props ya presentes (`role`, `pathname`) y un destino ya guardado (`validateAdmin`). Cero impacto en otros módulos. | ✗ |
| **G2** | **fix local** (con contrato **interno** superficial) | Toca un archivo compartido (`editor-screen.tsx`) pero **sólo añade un hijo presentacional**; el único "contrato" nuevo es la firma de una función pura (`deriveFlowStep`) y un componente sin estado. No modifica estado, mutaciones, props públicas ni navegación. No cruza módulos. | ✗ |
| **G3** | **fix local** | Todo es copy/aria/estilo en 4 componentes de presentación + 1 archivo Konva con cambio **sólo visual** (anillo de la manija, sin hit-testing). | ✗ |

> **Ninguno es sistémico.** No se activa el camino de escalamiento a `/ship-feature`. Tampoco es "fix por contrato": no hay endpoint, Zod schema, tabla ni tipo exportado consumido fuera del editor que cambie (`lib/padel/court/editor.ts`, `history.ts`, `transition.ts`, `use-transitions.ts` quedan intactos y son la red de seguridad).
>
> El único riesgo real es **colisión de locators E2E** (G2/G3), que es un riesgo de *test*, no de arquitectura; se gestiona con la regla "no renombrar nombres accesibles existentes" y con una pasada única de E2E al final.

---

## 3. Orden de ejecución (menor → mayor riesgo)

```
A · G1 (LOW)  →  B · G2 (MEDIUM)  →  C · G3 (MEDIUM-alto)  →  D · verificación visual (efímero)
```

**Por qué este orden y no G1 → G3 → G2:**

1. **A primero**: `LOW`, aditivo e independiente del editor. Desbloquea el síntoma #1 del usuario y no puede romper el flujo del editor.
2. **B antes que C**: los asserts nuevos del strip (`[aria-current="step"]`, "Paso N de 5") **necesitan el strip ya montado**; hacer G3 antes obligaría a editar `transition-editor.spec.ts` dos veces y con el DOM a medio cambiar.
3. **C al final de la implementación**: es el grupo con más superficie de locators (`Probar`/`Guardar`/`Añadir paso`/tabs "Paso N"). Dejarlo último permite **una sola edición consolidada** del spec E2E y una sola corrida completa.
4. **Minimización de re-escrituras** (lo que pedía el brief): `editor-screen.tsx` se toca **una vez** (sólo en B, para montar `<FlowStrip>`); el hint de G3 se monta dentro de `scenario-canvas.tsx` (que ya posee el stage) en vez de en `editor-screen.tsx`, evitando la segunda escritura. `app-layout-client.tsx` se toca **una vez** (A). `tests/e2e/transition-editor.spec.ts` se toca **una vez** (C).
   - Nota: el triage asignaba el overlay del hint a `editor-screen.tsx` (L277-289). Se **reasigna a `scenario-canvas.tsx`** por esta razón; misma aceptación (D2), menor riesgo de conflicto.
5. **D último**: la ruta del mockup es efímera y se borra al cerrar; no debe condicionar ningún gate de código.

---

## 4. Perfil asignado + chunks (≤5 archivos)

**Perfil único: @app-engineer** (chunks A, B, C y D). Justificación: todo el cambio es `app/`, `components/`, `lib/` puro y tests de UI. `components/court/EditorStage.tsx` es territorio de app-engineer (el motor `CourtStage`/`ScenarioPreview` **no** se toca).

| Chunk | Perfil | Archivos (≤5) | Por qué está aquí |
|---|---|---|---|
| **A — G1 FAB + copy CTA** | @app-engineer | 1. `components/layout/app-layout-client.tsx` (montar FAB inline, `Link` + `Route`, `aria-label="Crear transición"`, `size-14`, safe-area, `md:` pill) <br> 2. `lib/constants/navigation.ts` (+ `canShowTransitionFab(role, pathname)` puro; **no** tocar `*_NAV_ITEMS`) <br> 3. `components/padel/teacher-dashboard.tsx` (copy → "Preparar jugada") <br> 4. `tests/unit/padel/transition-fab-visibility.test.ts` ✨ (A1/A2) <br> 5. `tests/e2e/transition-fab.spec.ts` ✨ (A3/A4/A5) | Entrega el entry point sin depender del editor. El dot de novedad lee `localStorage` en `useEffect` (evita mismatch de hidratación) |
| **B — G2 onboarding strip** | @app-engineer | 1. `components/padel/transition-editor/flow-strip.tsx` ✨ (`<ol>/<li>`, `aria-current="step"`, **prohibido** `role="tab"`/`<button>`) <br> 2. `lib/padel/court/flow.ts` ✨ (`deriveFlowStep`, puro, sin `localStorage`) <br> 3. `components/padel/transition-editor/editor-screen.tsx` (montar strip; **sin** tocar estado/mutaciones; archivo a 344 L → el strip va fuera para respetar `max-lines`) <br> 4. `tests/unit/padel/transition-flow.test.ts` ✨ (B1/B2) | 4 archivos. El estado se **deriva**, no se añade: `steps.length`, `selected`, `dirty`, `previewing` |
| **C — G3 affordances + copy + E2E consolidado** | @app-engineer | 1. `components/padel/transition-editor/context-bar.tsx` (Badge estado, `aria-describedby` Probar/Guardar, "Guardado ✓" ≤2 s con `aria-label="Guardar"` estable) <br> 2. `components/padel/transition-editor/step-filmstrip.tsx` ("Secuencia · N pasos", "← Antes / Después →", "+ Añadir paso" con `aria-label` intacto en el chip de cabecera) <br> 3. `components/padel/transition-editor/scenario-canvas.tsx` (Badge hint `role="status"` `pointer-events-none`) <br> 4. `components/court/EditorStage.tsx` (anillo `strokeWidth` 3 + punto central; **cero** cambios de hit-testing/animación) <br> 5. `tests/e2e/transition-editor.spec.ts` 🔧 (B3/B4/B5 + C1..C5 en **una sola** pasada) | 5 archivos. Aquí se paga el riesgo de locators, al final y de una vez |
| **D — verificación visual (efímero)** | @app-engineer / orquestador | 1. `app/preview/coach-transition-editor/page.tsx` ✨ (4 L, patrón `app/preview/etapa3/page.tsx`) | Sólo si se quiere revisar 375 px en navegador. **Se elimina** al cierre junto con `components/preview/coach-transition-editor.tsx` (regla de `design-approved.md` §4) |

**Total: 15 archivos** (10 producción + 5 test), 5 chunks de ≤5. El umbral `>5 archivos` se satisface por chunking, **no** requiere escalar a @pm ni a `/ship-feature`.

Secuencia de arranque de cada chunk: `task-worksheet.md` en el directorio del change (estado: qué archivos tocados / qué falta) antes de editar.

---

## 5. Validación por chunk (la corre el orquestador, **no** el implementador)

| Chunk | Gate propio (obligatorio) | Qué prueba |
|---|---|---|
| **A** | `npx tsc --noEmit` · `pnpm run lint` · `pnpm run test:unit` · `npx playwright test tests/e2e/transition-fab.spec.ts` | Tabla de visibilidad pura; FAB 56 px sin solape con `BottomNav` (`y+h ≤ vh-61`); USER no ve FAB; 1 toque → `/transiciones/nueva`; `/transiciones` y editor sin FAB |
| **B** | `npx tsc --noEmit` · `pnpm run lint` · `pnpm run test:unit` · `npx playwright test tests/e2e/transition-editor.spec.ts` **sin modificar el spec** | El strip se monta y **los 4 locators actuales siguen resolviendo a 1 elemento** (strict mode). Es la prueba de que `ol/li` no colisiona con `role="tab"`. Si este gate falla, se revierte el strip antes de tocar copy |
| **C** | `npx tsc --noEmit` · `pnpm run lint` · `pnpm run test:unit` · `npx playwright test tests/e2e/transition-editor.spec.ts` (spec ya actualizado, completo) · `npx next build` · revisión visual 375×667 (`scrollWidth ≤ 375`, canvas completo) | Copy nuevo + hints + badges, con nombres accesibles estables; sin overflow; sin regresión del gesto del arco |
| **Cierre** | `node scripts/validate-harness.js --typecheck --lint --tests --build --coverage --features` + `--docs` | Cobertura de módulo sin caída >3 % (`lib/padel/court/flow.ts` y `canShowTransitionFab` deben quedar cubiertos por unit) y consistencia de FEATURES.md |

**Punto final único (fin de C + D):** `npx playwright test tests/e2e/transition-editor.spec.ts tests/e2e/transition-fab.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/puzzle-demo.spec.ts`

- Obligatorio ejecutarlo **con `.env.local`** (`DATABASE_URL`): los specs hacen `test.skip(!process.env.DATABASE_URL)` → sin DB hay **falso verde**. Si se saltean, el gate se considera fallido.
- `dashboard.spec.ts` sólo asserta status HTTP: no debe romperse, pero tampoco prueba el FAB (hueco cubierto por A3/A4).
- `puzzle-demo.spec.ts` es la regresión del motor Konva: obligatorio tras el cambio de estilo en `EditorStage.tsx` (C).

**Anti-loop**: implementadores escriben, no ejecutan `next build` / `playwright` / `db:migrate`. Cada chunk = 1 intento; si falla 2 veces el mismo grupo → escalar (límite 3 por grupo, 5 global).

---

## 6. Confirmaciones explícitas

1. **NO interviene @db-engineer**: cero tablas, columnas, enums, índices, migraciones ni queries. `drizzle/` no se toca (`0012` sigue siendo la última).
2. **NO interviene @auth-security**: no se modifica `auth.ts`, guards, JWT/session, ni `lib/auth/*`. El FAB sólo **oculta/muestra UI** consumiendo el `role` que el layout ya recibe; la autorización real sigue en `validateAdmin` + `guardAdmin` en `/api/transitions` (server-side). **El FAB nunca es la frontera de seguridad** — si un USER lo forzara, `/transiciones/nueva` lo redirige igual (E2E A4 lo verifica).
3. **NO interviene @admin-engineer**: `/admin/**` se toca sólo como *ruta excluida* del FAB; no hay cambios en `app/admin` ni en `app/api/admin`.
4. **El límite `>5 archivos` NO escala a `/ship-feature`**: el alcance ya está aprobado por diseño y el chunking lo resuelve. Escalar a @pm **sólo** si: (a) un chunk termina con >5 archivos, (b) se descubre un archivo obligatorio fuera de la lista de §4, o (c) el E2E no logra verde en 2 iteraciones por colisión estructural de locators (no por copy).
5. **Cero dependencias nuevas, cero componentes `ui/*` nuevos, cero CSS hex nuevo, `BottomNav` intacto (7 items).**

---

## 7. Riesgos residuales y mitigación

| Riesgo | Grupo | Mitigación |
|---|---|---|
| Mismatch de hidratación por `localStorage["padel.transitionFab.seen"]` | A | Leer en `useEffect`, default visible; si falla el storage, se muestra |
| FAB tapado por `BottomNav` a 375 px | A | `bottom-[calc(4.75rem+env(safe-area-inset-bottom))]` + assert `y+height ≤ vh-61` (A5) |
| Strip empuja el canvas y rompe AC-01 | B | ~28 px aceptados en `design-exploration.md` §E.1; assert `scrollWidth ≤ 375` y canvas visible (B5) |
| Colisión de locators por roles/aria nuevos | B/C | `ol/li` (nunca `role="tab"`); nombres accesibles "Probar"/"Guardar"/"Añadir paso" intactos; microcopy por `aria-describedby`/`title`/Badge; E2E de B corre el spec **sin cambios** |
| Regresión del gesto del arco (Konva) | C | Sólo `strokeWidth`/punto central; `puzzle-demo.spec.ts` + `transition-editor.spec.ts` en el punto final |
| Falso verde E2E sin `DATABASE_URL` | Todos | Gate falla si los specs se saltean; ejecutar con `.env.local` |

## 8. Rollback por chunk

- **A**: quitar el montaje del FAB en `app-layout-client.tsx` (copy y helper quedan inertes).
- **B**: quitar `<FlowStrip>` de `editor-screen.tsx` (1 línea); `flow.ts`/`flow-strip.tsx` huérfanos se borran.
- **C**: revertir `context-bar`/`step-filmstrip`/`scenario-canvas`/`EditorStage` (presentacional puro) y restaurar el spec previo.

## 9. Pattern Detection (al cierre)

Si A/B/C quedan verdes, registrar en `.agents/patterns/recurring-issues.md` el patrón **`Feature shipped sin entry-point persistente`** (síntoma: feature privada sólo alcanzable desde un CTA secundario; fix: FAB condicionado por función pura + strip de progreso; archivos: `app-layout-client.tsx`, `lib/constants/navigation.ts`, `editor-screen.tsx`; fecha 2026-11-03; contador 1).
