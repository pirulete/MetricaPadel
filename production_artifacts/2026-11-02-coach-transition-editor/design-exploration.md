# Design Exploration — Editor de Transiciones (coach, mobile-first)

> change_id: 2026-11-02-coach-transition-editor · date: 2026-11-02 · owner: @ui-designer
> **Modelo C ya decidido por el usuario** (canvas con selección + toolbar contextual + manija de arco + filmstrip + undo/redo). Este documento **no re-abre la interacción**: explora **dónde vive el chrome** alrededor del canvas.

---

## 0. Restricciones comunes a las 3 alternativas

- Viewport de referencia 375×667; targets ≥44×44; sin scroll horizontal (AC-01).
- `touch-action: none` **sólo** dentro del canvas; fuera, scroll normal (EC-04).
- Undo/redo deshabilitados con historial vacío, no-op silencioso (EC-01).
- Preview siempre con `CourtStage` existente (AC-03); nunca animación nueva.
- Componentes reutilizados (nombres exactos): `ui/button`, `ui/card`, `ui/input`, `ui/label`, `ui/badge`, `ui/alert-dialog`, `ui/separator`, `ui/switch`, `ui/tooltip`, `components/padel/empty-state.tsx`, `components/court/CourtStage.tsx`, `COURT_COLORS`, `toast()` (sonner).

---

## Alternativa A — Toolbar flotante anclada al elemento + filmstrip fijo inferior

El chrome sigue al dedo: la toolbar aparece pegada al jugador/pelota seleccionado y se reposiciona (flip arriba/abajo, clamp) para no salirse del canvas.

```
375×667
┌─────────────────────────────────────┐
│ ← Transiciones        ↶  ↷   ⋯      │ 48  top bar
├─────────────────────────────────────┤
│                                     │
│      ┌───────────────────────┐      │
│      │   A                   │      │
│      │              ┌──────┐ │      │
│      │              │◀▲▼▶ │ │      │ ← toolbar flotante
│      │        ╭─────┴──────┤ │      │   anclada a B (140×96)
│      │        │ 🎯  ✕      │ │      │
│      │      ╰──┘  ╭(B)     │ │      │
│      │              ╰───────┘ │      │
│      │   C                D  │      │
│      │       ╭─◯─╮  ← manija │      │
│      └───────┴───┴───────────┘      │ ~420 canvas
├─────────────────────────────────────┤
│ ①▣ ② ③   ＋   ⧉  🗑   ⌃          │ 96  filmstrip
└─────────────────────────────────────┘
```

- **Móvil (375)**: canvas ~230×460; la toolbar flotante ocupa ~15–20% del área de juego y puede tapar al jugador vecino al mover B hacia arriba.
- **768**: canvas centrado más grande; toolbar flotante deja de tapar.
- **1280**: canvas 360×720 + rail lateral de pasos; toolbar flotante sigue anclada.
- **Estados**: default (sin selección → toolbar oculta) · seleccionado (toolbar visible) · sin pasos (filmstrip vacío + CTA “Añadir paso”) · undo vacío (botones `disabled`) · loading preview (overlay `Loader2 animate-spin` sobre canvas) · error de guard (banner inline `destructive` + `toast.error`).
- **Riesgo dominante**: lógica de reposicionamiento (flip/clamp) + oclusión del propio elemento que el usuario está mirando.

---

## Alternativa B — Bottom sheet de detalle (vaul) + filmstrip reducido

La selección abre un `Drawer` de vaul con el detalle del elemento; el canvas queda limpio (sólo manija de arco).

```
375×667
┌─────────────────────────────────────┐
│ ← Transiciones        ↶  ↷          │ 48
├─────────────────────────────────────┤
│      ┌───────────────────────┐      │
│      │   A                   │      │
│      │                       │      │
│      │      ╭────◯────╮      │      │ ← manija de arco
│      │     (B)             D │      │
│      │   C                   │      │
│      └───────────────────────┘      │ ~300 canvas
├─────────────────────────────────────┤
│ ① ②▣ ③   ＋                    │ 64  filmstrip (sin acciones)
├─────────────────────────────────────┤
│         ▁▁▁▁  (asa vaul)            │
│  Jugador B · Paso 2                 │ 200 sheet
│  ◀0.5m  ▲0.5m  ▼0.5m  ▶0.5m        │
│  [ 🎯 Fijar tiro ]  [ 🗑 Borrar ]   │
└─────────────────────────────────────┘
```

- **Ventaja**: canvas libre de solapes; controles grandes (56 px) y siempre en el pulgar.
- **Coste**: abre/cierra un sheet por cada toque → 2 gestos para mover a otro jugador; `vaul` bloquea el scroll del body y compite con el drag del canvas; añade estado modal y focus-trap que hay que testear en E2E móvil.
- **Estados**: mismos 6 + estado “sheet abierto / cerrado”.
- **Riesgo dominante**: fricción de foco (cerrar sheet para ver el resultado del nudge) y conflicto sheet↔drag (el riesgo “Alto” del spec).

---

## Alternativa C — Barra contextual fija bajo el canvas + filmstrip colapsable **(recomendada)**

Canvas con altura máxima; los controles contextuales viven en una barra fija pegada al borde inferior (zona del pulgar) que **cambia de contenido** según la selección. El filmstrip se colapsa a una fila de miniaturas de 40 px para devolver altura al canvas.

```
375×667
┌─────────────────────────────────────┐
│ ← Transiciones     ↶  ↷   [Probar]  │ 48
├─────────────────────────────────────┤
│      ┌───────────────────────┐      │
│      │   A                   │      │
│      │                       │      │
│      │      ╭────◯────╮      │      │ ← manija de arco
│      │     (B)             D │      │   (único control in-situ)
│      │   C                   │      │
│      └───────────────────────┘      │ ~360 canvas
├─────────────────────────────────────┤
│ Jugador B · Paso 2     ● sin guardar│ 40  cabecera contextual
│ ◀  ▲  ▼  ▶ │ 🎯 Fijar │ 🗑        │ 56  controles (44×44)
├─────────────────────────────────────┤
│ ①▣ ② ③   ＋    ⌃                   │ 88  filmstrip (colapsable)
└─────────────────────────────────────┘
```

- **Ventaja**: cero oclusión del canvas, cero lógica de reposicionamiento; controles en zona de pulgar; el filmstrip colapsable recupera 48 px justo cuando el coach arrastra; un solo patrón para todos los elementos (jugador / pelota / tiro) con la etiqueta cambiando.
- **Coste**: la relación “control ↔ elemento” es menos inmediata (se resuelve con la cabecera “Jugador B · Paso 2” + highlight en canvas).
- **Breakpoints**: 375 → barra 2 filas + filmstrip colapsable · 768 → `grid-cols-[1fr_220px]` con rail de pasos vertical a la derecha y barra de una fila · 1280 → canvas 360×720 centrado + rail, barra inline con etiqueta extendida.
- **Estados**: los 6 obligatorios, sin estados extra de overlay.

---

## Tabla comparativa

| Criterio (peso) | A · Flotante | B · Sheet vaul | C · Barra fija |
|---|---|---|---|
| Área de canvas a 375×667 (alto) | Media (toolbar tapa ~18%) | Media-baja (sheet 200 px) | **Alta** |
| Oclusión del elemento seleccionado | **Alta** | Nula | Nula |
| Alcance con el pulgar (una mano) | Media (toolbar puede quedar arriba) | **Alta** | **Alta** |
| Pasos/gestos por acción (nudge) | 2 (tap + tap) | 3 (tap → sheet → tap) | **2** |
| Complejidad de implementación | Alta (flip/clamp/medición) | Alta (modal + scroll-lock + focus-trap) | **Baja** |
| Dependencia nueva | Ninguna | `vaul` (ya instalada, pero patrón nuevo en editor) | **Ninguna** |
| Conflicto con drag del canvas (EC-04) | Bajo | **Alto** | Bajo |
| Descubribilidad para un coach no técnico | Media (toolbar aparece “de la nada”) | Alta | **Alta** (posición estable) |
| Coste de test E2E móvil | Alto | **Muy alto** (sheet + drag) | Medio |
| Accesibilidad (foco/teclado) | Media (elemento flotante posicionado) | Compleja (trap modal) | **Simple** (orden DOM natural) |

---

## Recomendación: **Alternativa C**

Gana en los dos criterios que fijó el product owner —**simplicidad táctil** y **mínima dependencia nueva**— y elimina el riesgo “Alto” del spec (gestos que se pisan): hay **un solo gesto de arrastre** (canvas + manija de arco) y **un solo lugar de botones** (barra inferior), sin overlays que roben eventos. Se implementa con primitivos existentes (`Button` a 44 px, `Card`, `Badge`, `AlertDialog`), sin `vaul` en el editor y sin lógica de posicionamiento.

Del modelo C se conserva intacto: selección por tap, toolbar **contextual** (contenido dependiente de la selección), manija de arco **in-situ** (único control directo sobre el canvas, porque el arco es espacial), filmstrip de pasos y undo/redo en la top bar.

**Riesgo residual y mitigación**: pérdida de la asociación control↔elemento → cabecera contextual (“Jugador B · Paso 2”) + token seleccionado con `ring-2 ring-white` y halo, y auto-scroll del filmstrip al paso activo.

---

## Decisiones de diseño registradas

1. **D1** — Toolbar docked (C) en vez de flotante: prioriza área de canvas y evita flip/clamp.
2. **D2** — Manija de arco **sí** in-situ: el arco es una propiedad espacial; un slider o 4 botones no comunican la curva.
3. **D3** — Filmstrip colapsable (una fila de 40 px) con auto-scroll al paso activo.
4. **D4** — Undo/redo en la top bar (iconos 44 px), no en la barra contextual, para que no cambien de sitio.
5. **D5** — Editor a pantalla completa sin `bottom-nav` (modo foco); la lista de transiciones sí la conserva.
6. **D6** — Estados vacíos con `components/padel/empty-state.tsx`; errores con banner `destructive` + `toast.error` (nunca `alert`).
7. **D7** — Sin `Slider` ni `Sheet` nuevos: el repo no los tiene y el flujo no los necesita.
