# UI Kit Audit — Editor de Transiciones (coach)

> change_id: 2026-11-02-coach-transition-editor · date: 2026-11-02 · owner: @ui-designer
> Insumo: `feature-spec.md` (AC-01..AC-06) · demo viva: `/puzzle-demo` + `components/court/*`
> Regla aplicada: reutilizar si un existente cubre **>80%**; crear sólo el hueco real.

---

## 1. Inventario auditado

| Fuente | Qué hay | Relevancia |
|--------|---------|-----------|
| `components/ui/*` | accordion, alert-dialog, aspect-ratio, badge, button, card, carousel, dialog, dropdown-menu, form, input, label, navigation-menu, popover, section, select, separator, switch, table, tabs, textarea, tooltip | Primitivos suficientes. **No existe `sheet.tsx` ni `slider.tsx`** |
| `components/court/*` | `CourtStage.tsx` (default export, Konva, `listening={false}`), `CourtLayers.ts` (prop-builders, **sin import de konva**), `CourtParts.tsx`, `useCourtConfig.ts`, `PuzzleDemo.tsx` | Motor completo para **preview de sólo lectura**; no sirve para edición (ver §3) |
| `lib/padel/court/*` | `types.ts` (`CourtScenario`/`Paso`/`Shot`), `geometry.ts` (`courtToPx`, `computeScale`, `computeOffsets`), `annotation.ts` (`resolveHitter`, `computeCurveGeometry`, `quadraticPoint`), `demo-scenario.ts` | Reutilizable tal cual. **Falta la inversa `pxToCourt`** (ver §3) |
| Página privada | `app/(app)/**` + `Section`, `components/padel/bottom-nav.tsx` (`fixed`, `md:hidden`), `components/padel/empty-state.tsx` | Patrón de página y nav ya resueltos |
| Feedback | `<Toaster/>` montado en `app/layout.tsx` (sonner, `richColors`), `toast()` ya usado en `scoring-canvas.tsx` | Reutilizar sin montar otro Toaster |
| Drawer | `vaul` importado **inline** en `components/layout/header.tsx` (no hay wrapper `ui/sheet`) | Reutilizable como patrón, no como componente |
| Mockups | `components/preview/preview-shell.tsx` (`PreviewShell` + `PreviewScreen[]`), `etapa1/3/4-*.tsx` | **Plantilla obligatoria** del mockup |

---

## 2. Componentes que se REUTILIZAN

| Necesidad del editor | Componente existente | Cómo |
|----------------------|----------------------|------|
| Botones / iconos (nudge, undo/redo, guardar, promediar) | `ui/button` | `variant="outline|ghost"`, `size="icon"`. **Ojo: el tamaño máximo nativo es 36–40 px** → las acciones táctiles deben forzar `className="size-11"` (44 px, AC-01). No crear un `TouchButton`. |
| Superficie de toolbar / filmstrip / tarjetas de paso | `ui/card` + `CardContent` | Contenedores con `bg-card border` |
| Título de la transición | `ui/input` + `ui/label` | Validación Zod compartida (EC-07) |
| Marca “sin cambios” / “guardado” / “nuevo” | `ui/badge` | `variant="secondary"` |
| Confirmación destructiva (borrar último paso EC-05, salir con cambios EC-11) | `ui/alert-dialog` | No usar `window.confirm` |
| Toggle “evaluar/preview” u opciones secundarias | `ui/switch`, `ui/select`, `ui/tabs` | Reutilizar para segmentar vista Editor/Preview si hace falta |
| División de zonas del editor | `ui/separator` | — |
| Feedback de error/éxito al guardar | `toast()` de sonner | Ya montado globalmente |
| Lista vacía de transiciones | `components/padel/empty-state.tsx` | Componente ya existente (icono + título + CTA) |
| Navegación inferior de la lista | `components/padel/bottom-nav.tsx` | En el **editor** se oculta (modo foco a pantalla completa) |
| Página contenedora | `components/ui/section` | La ruta real `app/(app)/transiciones/*` |
| Preview de la jugada (AC-03) | `components/court/CourtStage.tsx` vía `next/dynamic({ssr:false})` | Exactamente como `PuzzleDemo.tsx`; cero lógica nueva |
| Colores de cancha | `COURT_COLORS` de `components/court/CourtLayers.ts` | Archivo **sin** import de konva → se puede importar en UI/editor. Evita inventar hex (regla de design system) |
| Playback model | `lib/padel/court/annotation.ts` (`resolveHitter`, `computeCurveGeometry`) | Para dibujar el arco del tiro en el canvas de edición |

---

## 3. Huecos reales (crear sólo esto)

| # | Hueco | Justificación (>80%) | Alcance mínimo |
|---|-------|----------------------|----------------|
| N1 | **`EditorStage`** (canvas de edición Konva, `listening=true`, hit-areas, drag de jugadores/pelota, handle de arco) | `CourtStage` es **`listening={false}` + `pointerEvents:"none"`** (AC-06 del spike, para no secuestrar scroll) → **0% reutilizable para interacción**. Pero **sí** reutiliza `buildCourtLines/buildPlayerFigures` (`CourtLayers`) para no duplicar dibujo | Sólo capa interactiva + `dragBoundFunc` con clamp 0..10 / 0..20 (EC-10). Diferido además por `dynamic({ssr:false})` |
| N2 | **`pxToCourt(point, viewport)`** en `lib/padel/court/geometry.ts` | No existe la inversa de `courtToPx` → no se puede normalizar el drag sin duplicar matemática en el componente. Función pura ⇒ unit test (AC-06) | 6 líneas + test |
| N3 | **`StepFilmstrip`** (miniaturas de pasos + add/duplicate/delete/reorder + colapsable) | `carousel` da scroll/snap pero no reordenar ni acciones por miniatura; `tabs` no es correcto semánticamente (pasos ordenados, no vistas). Composición de primitivos existentes, **sin dependencia nueva** | Componente de presentación; reorder vía long-press/drag en fase 2 (ver risk) |
| N4 | **`ContextBar`** (toolbar contextual) | No hay patrón de “toolbar flotante/contextual” en el repo. Es sólo layout + `Button`; se implementa como `div` con `bg-card shadow` (en el mockup se prototipa) | Sin estado propio: recibe `selection` y callbacks |
| N5 | **Reducer undo/redo** en `lib/padel/editor-history.ts` | Nada existente. Es lógica pura ⇒ test unitario (AC-06) | `{past[], present, future[]}`, límite N, no-op en vacío (EC-01) |

> **No crear**: `Slider` (no hace falta; los nudges son botones ±0.5 m, no slider continuo), `Sheet` wrapper (vaul inline basta si se elige la variante con sheet), `Skeleton` de `ui/` (el repo no lo tiene; los mockups usan `animate-pulse` inline y la implementación real sólo necesita el patrón de `loading` de una sección).

---

## 4. Tokens y accesibilidad

- **Colores**: sólo CSS variables de `app/globals.css` (`background, card, border, primary, muted, destructive, ring`). Excepción documentada: paleta de cancha desde `COURT_COLORS` (tokens `court`/`yellow`/`green` ya homologados en el spike). **Ningún hex nuevo.**
- **Targets táctiles**: `Button` nativo llega a 40 px → el editor exige `min 44×44` (AC-01); el mockup lo demuestra con `size-11` y área táctil separada del visual en los tokens de jugador.
- **Contraste**: texto sobre `primary` (verde oklch 0.50 0.17 145) = `primary-foreground` blanco → AA ok. La etiqueta del tiro sobre cancha azul usa burbuja blanca con texto `foreground` (nunca amarillo sobre azul).
- **Teclado / lector**: canvas con `role="application"`, `aria-label` del paso activo en región `aria-live`; toolbar expone `aria-label` por acción; `AlertDialog` para destructivos; el filmstrip es `role="tablist"`-like con `aria-selected`.

---

## 5. Conclusión

**Reutilización ≈ 85%** (todo el chrome, feedback, navegación, motor de preview y matemática de cancha). Se crean **2 componentes** (`EditorStage`, `StepFilmstrip`), **1 primitivo de layout** (`ContextBar`) y **2 módulos puros** (`pxToCourt`, historial undo/redo). **0 dependencias nuevas** (`konva`, `react-konva`, `vaul`, `sonner`, `zod` ya instalados).
