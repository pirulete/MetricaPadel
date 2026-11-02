# Mockup Spec — `components/preview/coach-transition-editor.tsx`

> change_id: 2026-11-02-coach-transition-editor · date: 2026-11-02 · owner: @ui-designer
> Tipo: **prototipo efímero** (se borra al implementar). Sin fetch, sin Zod, sin Drizzle, sin tocar `lib/padel`.

---

## 1. Archivo y ruta

| | |
|---|---|
| Componente | `components/preview/coach-transition-editor.tsx` (default export `CoachTransitionEditorPreview`) |
| Ruta de acceso | `app/preview/coach-transition-editor/page.tsx` → **pendiente**: no se creó porque el encargo limita los cambios a `components/preview/`. Snippet exacto (patrón de los demás previews): |

```tsx
import CoachTransitionEditorPreview from "@/components/preview/coach-transition-editor"

export default function PreviewCoachTransitionEditorPage() {
  return <CoachTransitionEditorPreview />
}
```

| Plantilla seguida | `components/preview/etapa3-dashboard-management.tsx` + `preview-shell.tsx` (`PreviewShell`, `PreviewScreen[]`, toggle dark) |
|---|---|
| Lint | 0 errores; 1 warning `max-lines` (1034 líneas) — igual que `etapa3` (843) / `etapa4`: los mockups están exceptuados en la práctica. |

## 2. Pantallas (chips de `PreviewShell`)

| # | Label | Qué demuestra |
|---|-------|---------------|
| 1 | `C · Editor` | **Recomendada**: canvas + selección + barra contextual fija + filmstrip colapsable + undo/redo + Probar + Guardar |
| 2 | `A · Flotante` | Alternativa descartada: toolbar anclada al jugador (se ve la oclusión) |
| 3 | `B · Sheet` | Alternativa descartada: bottom sheet tipo vaul con detalle del elemento |
| 4 | `Estados` | Galería de los 6 estados obligatorios |
| 5 | `Lista` | Entrada `/transiciones`: tarjetas + CTA + empty state (con `Switch` para simular vacío) |

## 3. Estados cubiertos

| Estado | Dónde | Implementación en el mockup |
|--------|-------|-----------------------------|
| default (elemento seleccionado) | C · Editor | `selected = "B"`, barra contextual activa |
| sin selección | `Estados` + tap en el canvas | `ContextBar` con `selection={null}` → 6 botones `disabled` |
| sin pasos (empty) | `Estados` + `Lista` vacía | `EmptyState` de `components/padel/empty-state.tsx` |
| undo vacío / redo vacío | `Estados` | `Button` `disabled` (44 px) — EC-01 |
| loading preview | C · Editor (`Probar`) y `Estados` | `Loader2` + barra + “Reproduciendo paso n de m” (el preview real usa `CourtStage`) |
| error de guard | C · Editor (guardar con título vacío) y `Estados` | Banner `role="alert"` `destructive` + botón deshabilitado — EC-03/EC-07 |
| guardado OK | C · Editor | `Badge` “Guardado” + `dirty` se apaga |
| borrar último paso bloqueado | C · Editor | Botón “Borrar paso” con 1 paso → banner EC-05 |

## 4. Datos mock (conformes a `Paso`)

3 pasos en metros de cancha (10 × 20), mismo shape que `lib/padel/court/types.ts` — `{ id, label, positions{A,B,C,D}, shot{control,to,label}|null }`:

1. `Paso 1 · Saque y salida` — shot `control (5,12) → to (3,6.5)`, label `CRUZADO`.
2. `Paso 2 · Subida a la red` — shot `control (5,7.5) → to (6,3)`, label `PARALELO`.
3. `Paso 3 · Remate` — `shot: null` (el paso “sin cambios” de EC-02 se marca al añadir).

`CourScenario.title` = `"Salida y subida a red"`; `nearestPlayer()` del mock replica la idea de `resolveHitter` (el origen **no** se guarda).

## 5. Interacciones navegables

- Tap en jugador A–D / pelota → selección (anillo blanco + halo, `aria-pressed`).
- Tap en el fondo del canvas → deselección.
- Nudges ±0,5 m → mueven el elemento seleccionado con **clamp** 0..10 / 0..20 (EC-10).
- `Fijar tiro` / `Quitar tiro` → crea/borra `shot` del paso activo.
- Filmstrip: cambiar paso, `+` añadir, `Duplicar`, `Borrar paso`, colapsar/expandir.
- Undo/redo: contadores reales de UI; `disabled` en 0.
- `Probar` → overlay de reproducción (en producción: `CourtStage` vía `next/dynamic({ssr:false})`).
- `Guardar` → título vacío ⇒ error; si no, spinner 900 ms ⇒ badge “Guardado”.
- La manija amarilla sobre el arco está presente pero sólo selecciona el tiro (el drag real llega en implementación).

## 6. Responsive

| Breakpoint | Layout |
|---|---|
| 375×667 | 1 columna: top bar 44 + fila de acciones + canvas `h-[56vh]` (≈373 px → 186 px de ancho) + barra contextual 2 filas + filmstrip 64 px. **Sin scroll horizontal**; el canvas usa `touch-none` (EC-04). |
| 768 | `md:grid-cols-[minmax(0,1fr)_190px]`: canvas `h-[64vh]` + **rail vertical de pasos** a la derecha; filmstrip horizontal `md:hidden` |
| 1280 | Mismo grid dentro de `max-w-3xl` centrado; canvas hasta 520 px de alto; la barra contextual muestra la línea de ayuda |

Targets táctiles: todos los controles a `size-11` (44 px); el token visual del jugador es 30 px dentro de una hit-area de 44 px.

## 7. Accesibilidad

- `aria-label` por acción; `aria-pressed` en tokens y en “Probar”; `aria-selected` en pasos; `aria-expanded` en colapsar.
- Banner de error con `role="alert"`; overlay de preview con `role="status"`.
- Contraste: tokens blancos sobre `primary`; etiqueta del tiro en burbuja blanca con `COURT_COLORS.labelInk` (nunca amarillo sobre azul).
- Colores: sólo CSS variables del design system + paleta del motor (`COURT_COLORS`); **0 hex nuevos**.

## 8. Reutilización efectiva

`PreviewShell`, `Button`, `Card`, `Badge`, `Input`, `Separator`, `Switch`, `EmptyState` (padel), `buildCourtLines` + `COURT_COLORS` (`components/court/CourtLayers.ts`, sin konva). Sin dependencias nuevas.

## 9. Limpieza

Al implementar: borrar `components/preview/coach-transition-editor.tsx` (y la ruta de preview si se añade). Las decisiones de este documento migran a `FEATURES.md` §Diseño UX/UI.
