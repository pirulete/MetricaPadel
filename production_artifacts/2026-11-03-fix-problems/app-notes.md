# App Notes — fix-problems 2026-11-03 (entry FAB + onboarding editor)

> change_id: 2026-11-03-fix-problems · Tier L · perfil: @app-engineer (chunks A–D)
> Diseño: fase A con @ui-designer → `ui-kit-audit.md`, `design-exploration.md` (FAB A3 + onboarding O1), `mockup-spec.md`, `design-approved.md`, mockup navegable `components/preview/coach-transition-editor.tsx` + ruta `/preview/coach-transition-editor`.

## Qué se implementó (chunks ≤5, repair-plan.md)

### Chunk A — G1 Entry point (FAB)
- `components/layout/app-layout-client.tsx`: FAB `fixed` de 56 px (`size-14`) → `/transiciones/nueva`, `aria-label="Crear transición"`, sólo ADMIN, oculto en modo foco y rutas `/transiciones*`/`/settings`/`/admin`, dot de novedad con `localStorage` leído vía `useSyncExternalStore` (sin mismatch de hidratación).
- `lib/constants/navigation.ts`: función pura `canShowTransitionFab(role, pathname)` (los `*_NAV_ITEMS` NO se tocaron).
- `components/padel/teacher-dashboard.tsx`: copy del CTA → **"Preparar jugada"**.
- Tests: `tests/unit/padel/transition-fab-visibility.test.ts` (16 tests de la tabla de visibilidad) + `tests/e2e/transition-fab.spec.ts` (ADMIN ve/1 toque/ocultos + USER no ve, viewport 375×667).

### Chunk B — G2 Onboarding (strip de flujo)
- `lib/padel/court/flow.ts` (nuevo, puro): `deriveFlowStep({stepsCount, selected, hasShot, dirty, previewing}) → 1..5` — estado **derivado**, sin estado nuevo ni localStorage.
- `components/padel/transition-editor/flow-strip.tsx` (nuevo): `<nav><ol><li>` con `aria-current="step"` (sin `role="tab"` — colisión con locators E2E), colapsa a "Paso N de 5 · X" tras guardar.
- `editor-screen.tsx`: sólo montaje del strip (sin tocar estado/mutaciones).
- Tests: `tests/unit/padel/transition-flow.test.ts` (17 tests, `flow.ts` 100%).

### Chunk C — G3 Affordances + copy + E2E consolidado
- `context-bar.tsx`: Badge `● Cambios sin guardar` / `✓ Guardado` (2 s), `aria-describedby` fijo (`#transition-preview-hint` "en memoria" / `#transition-save-hint` "biblioteca"), `aria-label="Guardar"` estable.
- `step-filmstrip.tsx`: "Secuencia · N pasos", "← Antes / Después →", "+ Añadir paso" (aria-label del chip intacto).
- `scenario-canvas.tsx`: hint de gesto `role="status"` `pointer-events-none` ("Toca un jugador…").
- `components/court/EditorStage.tsx`: anillo de selección `strokeWidth 3` + punto central (sólo estilo; **cero** cambios de hit-testing/motor).
- `tests/e2e/transition-editor.spec.ts`: asserts nuevos (strip/hints/badges/copy) en una sola pasada, 4 locators históricos intactos.

### Chunk D — ruta del mockup
- `app/preview/coach-transition-editor/page.tsx` (patrón `app/preview/etapa3`) — para navegar el mockup de fase A. **Pendiente de decisión**: `design-approved.md` §4 prevé borrarlo con el mockup al cierre; el usuario pidió verlo navegable → queda hasta su confirmación.

## Bug real cazado por el E2E (S1) y resuelto

**Síntoma**: `transition-fab.spec.ts` — el FAB era "visible" pero `element is outside of the viewport` (click imposible); medición con Playwright: `rect {x:303, y:-76, w:56, h:56}` en 375×667.

**Causa raíz**: el `<Link className="relative">` dentro de `Button asChild` — al fusionar classNames vía `Slot`, conviven `fixed` (del Button) y `relative` (del Link); Tailwind emite `.relative` **después** de `.fixed` en el stylesheet → gana `position: relative`. La declaración `bottom` del FAB (calc con safe-area, computada correctamente: 76px) pasa a ser desplazamiento **relativo** → el FAB sube 76 px → `y = -76`, fuera del viewport.

**Fix (1 línea)**: eliminar `className="relative"` del `Link`. El dot de anclaje (`absolute right-2 top-2`) sigue bien porque el `fixed` del propio Link es contexto de posicionamiento.

**Blindaje**: el assert geométrico del E2E (`box.y + box.height ≤ viewport.height − 61`) + `waitForURL` al tocar.

## Verificación final (reales)

- `npx tsc --noEmit` = 0 · `pnpm run lint` = 0 errores (255 warnings preexistentes/patrón) · `pnpm run test:unit` = **882/882** (67 suites; +33 del fix) · E2E **6/6** (`transition-fab` 2 + `transition-editor` 2 + `puzzle-demo` 2, con SQL real en :5434) · `pnpm run build` = OK (incluye `/preview/coach-transition-editor`).
- `@ponytail-reviewer`: net **−3 L** (spacer→`ml-auto`, label duplicado, title redundante); `useSyncExternalStore`/`deriveFlowStep`/`canShowTransitionFab` mantenidos (nativa/testeables).

## Archivos tocados (15 fix + artifacts)

Producción (10): `app-layout-client.tsx`, `navigation.ts`, `teacher-dashboard.tsx`, `flow-strip.tsx` ✨, `editor-screen.tsx`, `context-bar.tsx`, `step-filmstrip.tsx`, `scenario-canvas.tsx`, `EditorStage.tsx`, `flow.ts` ✨.
Tests (5): `transition-fab-visibility.test.ts` ✨, `transition-flow.test.ts` ✨, `transition-fab.spec.ts` ✨, `transition-editor.spec.ts` 🔧, (+ ruta preview y mockup de fase A).

## Sin impacto

Auth/DB/API/migraciones/`lib/api-docs`/.env: **cero cambios**. `BottomNav` intacto (7 items). El FAB no es frontera de seguridad (`validateAdmin` sigue en la ruta destino). Motor Konva (`CourtStage`/`ScenarioPreview`) intacto.
