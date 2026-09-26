# Design Exploration — SPEC-EPIC-01 Academia & Branding

> change_id: spec-epic-01-academia-branding | fecha: 2026-09-26 | autor: @ui-designer
> Alcance: 4 pantallas — (1) panel academia, (2) rúbricas institucionales, (3) preview evaluación con branding, (4) exportación PDF.

---

## Alternativa A — "Academy Hub" (sección dedicada con detalle por tabs)

Nueva sección `/academias` en el área privada del coach. Lista de academias → detalle con tabs **Branding / Miembros / Rúbricas**. Replica el patrón `course-detail.tsx` (el más probado del módulo).

```
/ACADEMIAS (lista)                          /ACADEMIAS/[id] (detalle)
┌──────────────────────────────┐            ┌──────────────────────────────────┐
│ Academias            [+Nueva]│            │ [logo] Academia Río Padel   [⚙] │
│ ┌─────────┐ ┌─────────┐     │            │  color: ██  slug: rio-padel     │
│ │[logo]   │ │[logo]   │     │            ├──────────────────────────────────┤
│ │Río Padel│ │Club 21  │     │            │ [Branding] [Miembros] [Rúbricas] │
│ │3 prof.  │ │1 prof.  │     │            │ ┌─ Branding ──────────────────┐  │
│ └─────────┘ └─────────┘     │            │ │ Logo [upload SVG/PNG ≤2MB]  │  │
│ (EmptyState si no hay)      │            │ │ Color  [#0EA5E9] [picker]   │  │
└──────────────────────────────┘            │ │ [Guardar]                  │  │
                                           │ ├─ Miembros ─────────────────┤  │
                                           │ │ [+Invitar]  email + rol    │  │
                                           │ │ • Ana Coach   [COACH] [x]  │  │
                                           │ │ • Luis Prof.  [ADMIN] [x]  │  │
                                           │ ├─ Rúbricas ─────────────────┤  │
                                           │ │ [+Nueva institucional]     │  │
                                           │ │ • Rúbrica Oficial [🔒]     │  │
                                           │ └────────────────────────────┘  │
                                           └──────────────────────────────────┘
```

- **Reutiliza**: `course-detail` (tabs+listas), `create-course-modal` (crear academia), `add-student-modal` (invitar), `rubric-library`+`rubric-card`+`rubric-editor` (rúbricas), `empty-state`, `AlertDialog` (archivar), `settings-form` (patrón branding).
- **Estados**: default (tabs con datos), empty (sin academias / sin miembros / sin rúbricas), loading (skeleton simple "Cargando…"), error (mensaje destructive + retry).
- **Responsive**: mobile = lista 1 col + bottom-nav; desktop = grid 2-3 col + tabs en detalle. El form de branding pasa a modal en mobile si el ancho <640px.

**Pros**: navegación natural y escalable; cada academia tiene su espacio; reutiliza el patrón de detalle más maduro del código. **Contras**: más páginas/rutas nuevas; el coach con 1 academia siente fricción extra.

---

## Alternativa B — "Settings-style" (todo en modales desde /settings)

Sin sección nueva: un bloque "Mis academias" dentro de `/settings`. Crear academia, branding, miembros y rúbricas institucionales se gestionan con modales sobre la misma página.

```
/SETTINGS (sección academias)               MODAL: Academia Río Padel
┌────────────────────────────────┐          ┌──────────────────────────────┐
│ Configuración                 │          │ Academia Río Padel      [x]  │
│ ┌─ Mis academias ────────────┐ │          │ ┌─ Branding ───────────────┐ │
│ │ [logo] Río Padel  [Editar] │ │          │ │ Logo [upload] Color [##] │ │
│ │ [logo] Club 21   [Editar]  │ │          │ └──────────────────────────┘ │
│ │ [+ Crear academia]         │ │          │ ┌─ Miembros ───────────────┐ │
│ └────────────────────────────┘ │          │ │ [+Invitar]               │ │
│ ┌─ Perfil ───────────────────┐ │          │ │ • Ana Coach  [COACH] [x] │ │
│ │ ... (existente)            │ │          │ └──────────────────────────┘ │
│ └────────────────────────────┘ │          │ ┌─ Rúbricas ───────────────┐ │
└────────────────────────────────┘          │ │ [+Nueva]                 │ │
                                            │ │ • Rúbrica Oficial [🔒]   │ │
                                            │ └──────────────────────────┘ │
                                            │ [Guardar]                    │
                                            └──────────────────────────────┘
```

- **Reutiliza**: `profile-form` (layout settings), `create-course-modal`/`dialog` (modales), `rubric-editor` (modal), `empty-state`, `Button`.
- **Estados**: default (cards + modales), empty (sin academias → CTA crear), loading/error en modales.
- **Responsive**: natural — los modales ya son responsive; sin nuevas rutas.

**Pros**: cero rutas nuevas, fricción mínima para coach con 1 academia, todo el branding en un solo lugar. **Contras**: modales anidados se vuelven pesados con rúbricas institucionales (editor complejo dentro de modal); mala escalabilidad a N academias; mezcla conceptos de dominio (academia) con settings de cuenta.

---

## Alternativa C — "Back-office" (gestión en /admin con tablas)

La gestión de academias vive en `/admin` (back-office) con tablas estilo `admin/users/user-list.tsx`. El coach usa /admin para crear academias e invitar; los COACH solo ven rúbricas institucionales y branding en el detalle de evaluación.

```
/ADMIN/ACADEMIAS (tabla)                     /ADMIN/ACADEMIAS/[id] (form)
┌──────────────────────────────────┐         ┌──────────────────────────────┐
│ Academias              [+Nueva] │         │ Nombre [Academia Río Padel]  │
│ ┌──────────────────────────────┐│         │ Slug   [rio-padel]           │
│ │ Nombre      Slug     Miembros││         │ Color  [#0EA5E9] [picker]    │
│ │ Río Padel   rio-padel   3    ││         │ Logo   [upload]              │
│ │ Club 21     club-21     1    ││         │ ── Miembros ─────────────────│
│ └──────────────────────────────┘│         │ [email] [rol] [+Invitar]     │
│ (Table + paginación)             │         │ • Ana Coach  [COACH] [x]    │
└──────────────────────────────────┘         └──────────────────────────────┘
```

- **Reutiliza**: `Table`, `user-list` (patrón tabla), `create-user-form` (invitación), `settings-form` (branding), `rubric-editor`.
- **Estados**: default (tabla), empty (tabla vacía + CTA), loading/error (patrón admin).
- **Responsive**: tabla → cards apiladas en mobile (patrón admin existente).

**Pros**: consistente con el back-office existente; tablas densas para muchos miembros; separa claramente gestión (admin) de uso (app). **Contras**: el coach es ADMIN global, no "admin de plataforma" — /admin hoy es back-office de la app, no del coach; obliga a navegar fuera del flujo de evaluación; más trabajo de adaptación de guards.

---

## Pantallas transversales (comunes a las 3 alternativas)

### 3) Preview de evaluación con branding
```
┌───────────────────────────────────────────────┐
│ [logo] Academia Río Padel        v2 · 24/09   │  ← academy-brand-header
│ ████████████████████ (color primario, 4px)    │
│ ┌───────────────────────────────────────────┐ │
│ │  RADAR 6 dims (recharts RadarChart)       │ │
│ │  Reglas ██  Téc.Básica ██  Téc.Esp. ██    │ │
│ │  Táctica ██  Física ██  Actitud ██        │ │
│ └───────────────────────────────────────────┘ │
│ Alumno: Juan Pérez · Profesor: Ana Coach      │
│ Total: 21/24 · Comentario global              │
│ Tabla de scores por criterio (rubric-viewer)  │
│ [⬇ Exportar PDF]                              │
└───────────────────────────────────────────────┘
```
- **Reutiliza**: `rubric-viewer` (detalle), `evaluation-card` (lista), `Badge`, `Button`.
- **Nuevo**: `academy-brand-header.tsx` (logo + barra de color vía `--brand`), `radar-chart.tsx` (recharts, ya en deps).
- **Estados**: default (con academia), neutro (sin academia → header sin logo, color `--primary`), loading, error (evaluación no encontrada / draft).
- **Responsive**: radar 1 col en mobile, 2 col (radar + tabla) en desktop.

### 4) Exportación PDF
- **UI**: botón "Exportar PDF" (`Button` con icono `Download`) en detalle de evaluación (coach y alumno) y opcional en `evaluation-card`. Sin componente nuevo.
- **Estados**: idle → downloading (disabled + spinner) → success (descarga) / error (toast destructive; 400 si draft).
- **Responsive**: botón full-width en mobile, inline en desktop.
- **Nota**: el PDF es server-side (`@react-pdf/renderer` o `pdf-lib`, decisión @architect). El radar en PDF debe dibujarse en SVG manual (recharts no corre server-side en react-pdf) — compartir la misma data de scores.

---

## Tabla comparativa de tradeoffs

| Criterio | A — Academy Hub | B — Settings-style | C — Back-office |
|---|---|---|---|
| **Complejidad de implementación** | Media (3 rutas nuevas + 4 componentes) | Baja-media (modales, 0 rutas) | Alta (rutas admin + adaptación guards) |
| **Valor UX para el coach** | Alto — flujo natural de gestión | Medio — modales pesados con rúbricas | Bajo — fuera del flujo de trabajo |
| **Reutilización del kit** | Muy alta (>80% patrones padel) | Alta (settings + modales) | Media (tablas admin, patrones distintos) |
| **Escalabilidad a N academias** | Alta (cada academia = página) | Baja (todo en modales) | Alta (tablas) |
| **Multi-academia (COACH en 2+)**: | Claro — lista + detalle por academia | Confuso — modales anidados | Claro |
| **Rúbricas institucionales (editor complejo)** | Bien — página dedicada | Mal — editor dentro de modal | Bien |
| **Consistencia con app existente** | Alta (replica course-detail) | Media | Media (otro paradigma) |
| **Riesgo de sobreingeniería** | Bajo | Bajo | Alto (duplica gestión admin) |

---

## Recomendación: **Alternativa A — Academy Hub**

**Justificación**: es la que maximiza reutilización del patrón más probado (`course-detail.tsx` con tabs), mantiene el coach dentro del flujo de la app (no lo saca a /admin), escala a multi-academia sin fricción y resuelve el caso más complejo (editor de rúbricas institucionales) en una página dedicada en vez de un modal. El costo extra (3 rutas) es menor que el beneficio de claridad. Se adoptan de B el patrón de modales para acciones puntuales (crear academia, invitar miembro) y de C la tabla de miembros en desktop si el volumen lo justifica (decisión de implementación).

**Decisiones de diseño clave**:
1. **Branding por-tenant** vía override de CSS variable en línea (`--brand`), validando contraste WCAG AA del HEX antes de aceptar; nunca clases hardcodeadas.
2. **Radar web** con recharts (ya en deps); **radar PDF** en SVG manual compartiendo la misma data — sin dependencia de charts nueva.
3. **Rúbrica institucional = read-only para COACH**: reutilizar `rubric-viewer` para ver y `rubric-card` sin acción "Editar"; `rubric-editor` solo para OWNER/ADMIN.
4. **Sin mockup navegable** (feature demasiado grande): este documento + ui-kit-audit.md son la especificación de diseño para @app-engineer.

**Próximo paso**: @architect decide storage de logo y librería PDF; @app-engineer implementa siguiendo este diseño y el mapa de reutilización del ui-kit-audit.