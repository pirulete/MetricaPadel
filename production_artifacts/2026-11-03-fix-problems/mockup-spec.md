# Mockup Spec — Fix "Editor de Transiciones"

> change_id: `2026-11-03-fix-problems` · date: 2026-11-03 · owner: @ui-designer
> Archivo: **`components/preview/coach-transition-editor.tsx`** (efímero, borrar al implementar)

---

## 1. Qué cubre

| Pantalla (chip) | Estado | Qué demuestra |
|---|---|---|
| **P01 · FAB** | Dashboard del coach | FAB A3 de 56 px (`aria-label="Crear transición"`) en `bottom 76px / right 16px`, sobre el `BottomNav` de **7 items** (sin 8.º). Mantiene el CTA "Preparar jugada" + "Evaluar ahora". Punto de novedad rojo (dismissible). |
| **Editor · Vacío** | `steps.length === 0` | Strip en ①Paso + `EmptyState` real (`components/padel/empty-state`) con "Añadir paso" + contexto deshabilitado. |
| **Editor · Sin selección** | `selected === null` | Hint flotante "👆 Toca un jugador para moverlo" (`role="status"`, `pointer-events-none`), strip en ②Mueve, badge `● Cambios sin guardar`. |
| **Editor · Seleccionado** | `selected === "A"`, con tiro | Anillo de selección, hint "Arrastra el arco para curvar el tiro", manija del arco con anillo amarillo + grip, strip en ③Tiro, filmstrip "Secuencia · 3 pasos" con subtítulo. |
| **Editor · Guardado** | post-save | Strip en ⑤Guarda, badge `✓ Guardado`, botón "Guardado", toast inline "Transición guardada", contexto con tiro fijado. |

Además (transversal en el mockup): strip 1→5 completo, `Probar` vs `Guardar` con microcopy **"Probar reproduce en memoria · Guardar guarda en tu biblioteca"**, filmstrip con "← Antes / Después →", nota de modo foco.

## 2. Qué NO cubre (a propósito)

- No reproduce Konva: la cancha es SVG estático con `COURT_COLORS` (misma paleta homologada, cero hex nuevos).
- No hay lógica de negocio, fetch, undo/redo real ni persistencia; datos mock.
- No incluye la biblioteca `/transiciones` (ya resuelta por `TransitionLibrary`).
- No prototipa el `Dialog` de ayuda O3 (fase 2 opcional).

## 3. Cómo verlo

El mockup necesita una ruta de 4 líneas (no creada por límite de alcance de este fix):

```tsx
// app/preview/coach-transition-editor/page.tsx
import Mockup from "@/components/preview/coach-transition-editor"
export default function Page() { return <Mockup /> }
```

→ `http://localhost:3000/preview/coach-transition-editor`. Sin la ruta, el componente es visible vía el patrón existente de `app/preview/etapa*`.

## 4. Contrato con la implementación real

| Mockup | Implementación (sin cambios de lógica) |
|---|---|
| `Fab` | Montar inline en `components/layout/app-layout-client.tsx` con `Button asChild` + `Link href="/transiciones/nueva"` |
| `FlowStrip` | Nuevo presentacional `transition-editor/flow-strip.tsx` (chips `aria-current="step"`, estado derivado) |
| `CourtMock` hint | Badge flotante dentro de `ScenarioCanvas` (mismo `pointer-events-none`) |
| `ContextBarMock` | Modificar copy/`Badge` en `context-bar.tsx` (no reemplazar) |
| `StepFilmstripMock` | Modificar subtítulo y etiquetas en `step-filmstrip.tsx` |

## 5. Criterios de aceptación del mockup

- [x] 5 pantallas navegables vía `PreviewShell`.
- [x] 375×667 como referencia; contenedor responsive `max-w-[375px]` centrado.
- [x] Sólo tokens de `globals.css` + `COURT_COLORS`; cero hex nuevos.
- [x] Targets ≥44 px en todos los controles (FAB 56 px).
- [x] Estados vacío / sin selección / seleccionado / guardado presentes.
- [x] `npx tsc --noEmit` y `eslint` sin errores (sólo warning `max-lines` heredado del patrón de previews).
- [x] Sin tocar `components/padel/transition-editor/` ni lógica de negocio.
