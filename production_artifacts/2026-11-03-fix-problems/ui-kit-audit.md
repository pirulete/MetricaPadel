# UI Kit Audit — Fix "Editor de Transiciones" (descubribilidad + comprensión)

> change_id: `2026-11-03-fix-problems` · feature: `2026-11-02-coach-transition-editor` · date: 2026-11-03 · owner: @ui-designer
> Pregunta que responde: **¿qué existe ya y qué falta realmente** para (1) dar un entry point visible y (2) explicar el flujo del editor?

---

## 1. Inventario: lo que YA existe (no recrear)

| Necesidad del fix | Pieza existente | Archivo exacto | Cobertura |
|---|---|---|---|
| CTA de entrada actual (se conserva) | `Button variant="outline" asChild` + `Link` | `components/padel/teacher-dashboard.tsx` L56-63 | 100% del botón; 60% de la descubribilidad |
| Navegación inferior mobile | `BottomNav` (`fixed`, `md:hidden`, `z-40`, 7 items ADMIN) | `components/padel/bottom-nav.tsx` | 100% — **prohibido añadir un 8.º item** (375 px → 53 px/item) |
| Modo foco del editor (nav oculto) | `FOCUS_MODE_ROUTES` regex | `components/layout/app-layout-client.tsx` L15-21 | 100% — el editor ya se comporta como pantalla completa |
| Pista de gesto "Toca un jugador" | `ContextBar` label + `aria-live` | `components/padel/transition-editor/context-bar.tsx` L83-94 | 50% — está **debajo** del canvas y duplicada como microcopy |
| Hint accesible del canvas | `role="group"` + `aria-label` "arrastra los jugadores para moverlos" | `components/padel/transition-editor/scenario-canvas.tsx` L68-72 | 60% — sólo lectores de pantalla, invisible en pantalla |
| Feedback de error/éxito | `toast()` sonner (Toaster global) | `app/layout.tsx` + `editor-screen.tsx` L140, L212 | 100% de errores puntuales; 0% de flujo |
| Empty state de biblioteca / pasos | `EmptyState` (título + descripción + acción) | `components/padel/empty-state.tsx` | 100% reutilizable (sin icono; si se quiere icono, se compone al lado) |
| Empty state de biblioteca (loading/error) | `TransitionLibrary` (skeletons, `role="alert"`, reintento) | `components/padel/transition-editor/transition-library.tsx` | 100% |
| Confirmación destructiva | `AlertDialog` (EC-11 salir sin guardar) | `components/ui/alert-dialog.tsx` | 100% |
| Drawer/hoja (vaul) | vaul **inline** en el header público; **no hay wrapper `ui/sheet.tsx`** | `components/layout/header.tsx` | Patrón copiable, no componente |
| Superficies y chips | `Card`, `CardContent`, `Badge`, `Separator`, `Button` (forzar `size-11`) | `components/ui/*` | 100% |
| Plantilla de mockup | `PreviewShell` + `PreviewScreen[]` + toolbar de estado | `components/preview/preview-shell.tsx` | 100% (obligatoria) |
| Tokens de color | CSS vars en `app/globals.css` (`primary`, `muted`, `accent`, `border`, `card`) + `COURT_COLORS` | `app/globals.css`, `components/court/CourtLayers.ts` | 100% |

## 2. Inventario: lo que FALTA (huecos reales)

| # | Hueco | Por qué no lo cubre nada existente | Alcance mínimo |
|---|-------|-----------------------------------|----------------|
| **N1** | **FAB / acción flotante persistente** (ADMIN) | No existe ningún elemento `fixed bottom-right` en el repo (verificado: sólo `bottom-nav` usa `fixed bottom-0`). Un 8.º item en `BottomNav` rompe el layout a 375 px. | Un `Button asChild size="icon"` de **56 px** con `fixed` + `shadow-lg`; **sin componente nuevo** si se monta inline en `AppLayoutClient` (recomendado) |
| **N2** | **Strip de flujo del editor** (1 Paso → 2 Mueve → 3 Tiro → 4 Prueba → 5 Guarda) | `tabs`/`tabs-list` es semántica de vistas, no de progreso; no hay `stepper` ni `breadcrumb`. El estado actual del flujo no se muestra en ningún sitio. | 1 fila de 5 chips (botones `aria-current="step"`) sobre el canvas; **sin estado propio** (deriva de `steps.length`, `selected`, `dirty`, `previewing`) |
| **N3** | **Hint contextual sobre el lienzo** ("Toca un jugador…") | El `aria-label` del canvas no se ve; la pista del `ContextBar` está fuera del área de atención visual. | Badge flotante `pointer-events-none` dentro del canvas, visible sólo cuando `selected === null` |
| **N4** | **Onboarding de primera vez (persistente)** | No hay `localStorage` de onboarding ni coach marks en ningún módulo. | Coach-mark opcional de 1 tarjeta dismissible (`onboardedAt` en localStorage) sobre el lienzo; sin librería |
| **N5** | **Distinción visual Probar vs Guardar** | Ambos son `Button` adyacentes sin jerarquía; "Probar" es `outline`, "Guardar" es `default`, pero el copy no explica que Probar es en memoria. | Cambio de copy + `Badge` "borrador/guardado" + `title`/`aria-describedby`; cero componentes nuevos |
| **N6** | **Affordance de las manijas del arco** | En Konva las manijas son círculos sin icono; el usuario no sabe que se arrastran. | Anillo más grueso (`strokeWidth`) + icono `GripVertical`/punto central + hint de 1ª vez "Arrastra el arco para curvar el tiro" |

## 3. Componentes a reutilizar (nombres exactos, para @app-engineer)

- `components/ui/button.tsx` → `Button` (`size="icon"` + `className="size-14"` para el FAB; `size-11` en el editor)
- `components/ui/badge.tsx` → `Badge` para chips de paso (`aria-current="step"`) y estado `borrador`/`guardado`
- `components/ui/card.tsx` → `Card`, `CardContent` para el coach-mark y el strip
- `components/ui/alert-dialog.tsx` → `AlertDialog*` (reset del onboarding no lo necesita; se usa `dismiss` del card)
- `components/ui/input.tsx` → `Input` (título)
- `components/ui/separator.tsx` → `Separator`
- `components/padel/empty-state.tsx` → `EmptyState` (primera vez sin pasos)
- `components/padel/transition-editor/context-bar.tsx` → se **modifica copy**, no se reemplaza
- `components/padel/transition-editor/step-filmstrip.tsx` → se **añade subtítulo y etiquetas**, no se reemplaza
- `components/layout/app-layout-client.tsx` → punto único de montaje del FAB (ya conoce `role` y `pathname`)
- `components/preview/preview-shell.tsx` → `PreviewShell`, `PreviewScreen`

## 4. Lo que NO se crea

- ❌ `ui/sheet.tsx` wrapper, `ui/stepper.tsx`, `ui/tooltip-provider`, `ui/skeleton.tsx`
- ❌ Librería de coach marks (`react-joyride`, `driver.js`) — 1 tarjeta condicionada por estado basta
- ❌ 8.º item en `BottomNav`
- ❌ Iconos/colores nuevos: sólo `lucide-react` + CSS vars (`primary`, `muted`, `accent`, `border`, `card`)

## 5. Tokens y accesibilidad

- **FAB**: `bg-primary text-primary-foreground`, `shadow-lg`, `ring-offset` en `focus-visible`; contraste primario `oklch(0.50 0.17 145)` sobre blanco ≥ 4.5:1 para el icono blanco; `aria-label="Crear transición"`.
- **Strip**: chips ≥ 32×32 px (no son acciones primarias; el target real es el lienzo), texto `11–12px`, `aria-current="step"`, contraste `muted-foreground` sobre `card` = 4.6:1.
- **Hint del canvas**: `pointer-events-none` + `role="status"` para que no robe taps.
- Safe area: FAB `bottom: calc(4.5rem + env(safe-area-inset-bottom))` en mobile para no solaparse con `BottomNav` (alto real ≈ 61 px).
