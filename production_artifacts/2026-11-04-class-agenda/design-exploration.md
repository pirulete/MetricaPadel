# Design Exploration — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · autor: @ui-designer · date: `2026-11-04`
> Fuente de alcance: `feature-spec.md` (AC-01…AC-09, EC-01…EC-13). UI kit: `ui-kit-audit.md`.
> Prioridad declarada de diseño: **simplicidad móvil para el coach** → **claridad para el alumno**.
> Referencia conceptual externa: StreetMove (sólo lectura; **no** se copia código).

---

## 0. Restricciones que acotan el diseño

1. El alumno es **read-only** en v1 (sin reservas self-service, sin cancelar).
2. `bottom-nav` está saturado (7 ítems coach / 6 alumno) → **prohibido** añadir ítem nuevo.
3. Los endpoints devuelven **agregados**, no series de tiempo → la UI muestra contadores, no gráficas.
4. Timezone se resuelve server-side (EC-07) → la UI **nunca** calcula fechas con `Date` naive; recibe `blockDate` (ISO date) y `startTime` (HH:mm) ya resueltos.
5. La grilla completa del alumno es **out-of-scope** (v1).
6. `PreviewShell`/`Phone` fijan el marco móvil: todo debe funcionar a **375 px sin scroll horizontal**.

---

## 1. Paquete A — "Embebido ligero" (recomendado)

**Idea**: la agenda es una propiedad **del curso**. Coach: tercer tab en P07. Alumno: tarjeta de próximas clases en el dashboard + historial en el detalle del curso. Cero rutas nuevas.

### A.1 Coach — P07 `/cursos/[id]` → tab "Agenda"

```
┌─────────────────────────────────────┐ 375 px
│ ‹  Cursos            ⋯              │
│ Intermedio · Martes y Jueves 18:00  │
│ [Copiar PAD-7K2M]   [Evaluar]       │
│                                     │
│ ┌─Alumnos─┬─Rúbricas─┬─Agenda─┐     │  Tabs (3º)
│                                     │
│  ‹  Sem 45 · 3–9 nov  ›   [⋮]      │  selector semana
│  ┌───────────────────────────────┐  │
│  │ 3 bloques · 1 sin habilitar   │  │
│  │ [ Habilitar Sem 45 ]          │  │  ← CTA primaria
│  └───────────────────────────────┘  │
│                                     │
│  ● LUN 3 NOV                        │  día como <h3>
│  ┌───────────────────────────────┐  │
│  │ 18:00–19:30  Pista 2          │  │  Card/divide-y
│  │ [Programada]  2/4 alumnos     │  │
│  │ Ana G. · Luis M.        [⋯]   │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 20:00–21:00  Pista 1          │  │
│  │ [Completada]  3/4 · 2 asist.  │  │
│  └───────────────────────────────┘  │
│                                     │
│  ● MIÉ 5 NOV                        │
│  ┌───────────────────────────────┐  │
│  │ 09:00–10:00  Pista 3          │  │
│  │ [Cancelada]  1 alumno         │  │  ← badge destructive
│  └───────────────────────────────┘  │
│                                     │
│  ● JUE 6 NOV                        │
│  (sin clases)                       │
│  [+ Añadir bloque suelto]           │
│                                     │
│ ┌ Plantilla semanal ──────── [⚙] ┐  │  ← sección colapsada
│ │ Lun 18:00 · 90'   [Activo ●]   │  │
│ │ Jue 18:00 · 90'   [Activo ●]   │  │
│ │ [+ Nuevo día]                  │  │
│ └────────────────────────────────┘  │
└─────────────────────────────────────┘
```

### A.2 Coach — asignación (sheet dentro del bloque)

```
┌─────────────────────────────────────┐
│  Bloque · Lun 3 nov · 18:00–19:30   │
│  Pista 2 · 2/4 alumnos              │
│  ─────────────────────────────────  │
│  Asignados (2)                      │
│  ☑ Ana García       [Asistió][No][—]│  ← aria-pressed
│  ☑ Luis Martín      [Asistió][No][—]│
│  ─────────────────────────────────  │
│  Disponibles en el curso (3)        │
│  ☐ Marta Ruiz                       │
│  ☐ Pablo Soto                       │
│  ☐ Nuria Gil                        │
│                                     │
│  [Cancelar]      [Asignar 2 · 4/4]  │  ← cupo en el CTA
│  [ Marcar bloque completado ]       │
│  [ Cancelar clase ] (destructive)   │  → AlertDialog
└─────────────────────────────────────┘
```

### A.3 Coach — "Habilitar Sem 45" (Dialog)

```
┌─────────────────────────────────────┐
│ Habilitar Sem 45                    │
│ 3–9 nov · 2 días del template       │
│ ─────────────────────────────────── │
│ Lun 3 nov  18:00  90'   →  crear    │
│ Jue 6 nov  18:00  90'   →  crear    │
│                                     │
│ Se crearán 2 bloques PROGRAMADA.    │
│ Lo ya editado no se sobrescribe.    │
│                                     │
│ [Cancelar]        [Habilitar 2]     │
└─────────────────────────────────────┘
   Resultado: "2 creados · 0 omitidos" (EC-01)
```

### A.4 Alumno — dashboard `/dashboard`

```
┌─────────────────────────────────────┐
│ Hola, jugador          [🔔 3]       │  ← NotificationBadge
│ Tu progreso en el pádel  [+ Curso]  │
│                                     │
│ Próximas clases            Ver todas│  ← A01c
│ ┌───────────────────────────────┐   │
│ │ HOY · 18:00                   │   │  ← énfasis temporal
│ │ Pista 2 · Intermedio          │   │
│ │ [Programada]    90 min        │   │
│ └───────────────────────────────┘   │
│ ┌───────────────────────────────┐   │
│ │ Jue 6 nov · 18:00             │   │
│ │ Pista 1 · Intermedio          │   │
│ │ [Programada]                  │   │
│ └───────────────────────────────┘   │
│                                     │
│ Tu nivel: Intermedio  ▓▓▓▓░░ 4.1    │
│ Mis cursos (1)                      │
│ ┌ Intermedio · 8 alumnos ───────┐   │
│ └───────────────────────────────┘   │
├─────────────────────────────────────┤
│ Inicio Cursos Academias …  Perfil   │  UserBottomNav
└─────────────────────────────────────┘
```

### A.5 Alumno — historial dentro del curso `/cursos/[id]`

```
┌─────────────────────────────────────┐
│ ‹  Intermedio                        │
│ Mis clases                          │
│ Programadas 6 · Asistidas 4 · 80 %  │  ← dashboard-metrics (3 cols)
│                                     │
│ PRÓXIMAS                            │
│ Lun 11 nov · 18:00 · [Programada]   │
│                                     │
│ ANTERIORES                          │
│ Jue 30 oct · 18:00 · [Completada]   │
│   Asististe                          │  ← attended true → texto
│ Mar 28 oct · 18:00 · [Cancelada]    │
│   Cancelada por el coach            │
│                                     │
│ [Cargar más]                        │  ← patrón history-list
└─────────────────────────────────────┘
```

### A.6 Estados cubiertos

| Estado | Coach | Alumno |
|---|---|---|
| **Empty** | "Sin agenda todavía" + `[Configurar plantilla]` (`EmptyState`). Semana sin materializar: "La Sem 45 no está habilitada" + `[Habilitar Sem 45]`. Día sin bloques: "(sin clases)". | "Sin clases programadas" + `[Ver mis cursos]`. Historial vacío: "Aún no hay clases pasadas". |
| **Loading** | Skeleton de 3 filas con `aria-busy="true"` + texto "Cargando agenda…". | `Card` con 2 filas grises + "Cargando tus clases…". |
| **Error** | Inline `role="alert"`: "No se pudo cargar la agenda" + `[Reintentar]` (mantiene tab activa). | Igual, dentro de la card; el resto del dashboard sigue vivo. |
| **Semana ya habilitada** | Botón cambia a `variant="outline"` deshabilitado con "Sem 45 habilitada" + conteo "2 creados · 1 omitido" tras reintento (EC-01). | — |
| **Bloque sin alumnos** | Fila muestra "0 asignados" + acción `[Asignar]` como CTA `secondary` dentro de la fila. | — |
| **Cupo lleno** | Sheet con "4/4" y filas disponibles deshabilitadas + hint "Cupo completo (409)". | — |
| **Bloque en el pasado (EC-02)** | Edición de hora/duración deshabilitada + tooltip "Sólo asistencia en clases pasadas". | Se muestra como "Completada" o "Sin marcar". |
| **Curso archivado (EC-13)** | Tab Agenda en sólo lectura; botones de materializar ocultos. | Sólo historial. |

### A.7 Breakpoints

| bp | Coach | Alumno |
|---|---|---|
| **375** | Lista por día apilada, sheet full-width (`Dialog` → `inset-x-0 bottom-0`), chips de semana `overflow-x-auto` acotado a la barra. | Card full-width, métricas en 3 columnas compactas. |
| **768** | `sm:` días en 2 columnas (grid `sm:grid-cols-2`), sheet centrado (`max-w-md`). | Próximas clases en 2 columnas. |
| **1280** | Lista + panel lateral de plantilla (`lg:grid-cols-[1fr_320px]`); roster con `Table` (asistencia en columnas). | Dashboard a 2 columnas: clases (izq.) + nivel/cursos (der.). |

### A.8 Componentes

**Reutiliza**: `Tabs`, `Card/CardHeader/CardTitle/CardContent`, `Badge`, `Button`, `Dialog`, `AlertDialog`, `Select`, `Input`, `Label`, `Switch`, `Separator`, `EmptyState`, `dashboard-metrics`, `history-list` (patrón), `NotificationBadge`/`NotificationItem`.
**Nuevos**: `agenda-week-list`, `block-assignment-sheet`, `upcoming-classes-card`.

---

## 2. Paquete B — "Agenda dedicada"

**Idea**: ruta `/agenda` (coach: selector de curso + semanas; alumno: `/mis-clases`). El detalle del curso sólo enlaza.

### B.1 Coach `/agenda`

```
┌─────────────────────────────────────┐
│ Agenda                              │
│ [ Curso: Intermedio        ▾ ]      │  ← Select
│                                     │
│ ( A )  ( B )  ( C )                 │  ← selector de curso si >3
│                                     │
│ ‹ Sem 45 · 3–9 nov ›  [Habilitar]   │
│                                     │
│ LUN 3 NOV                           │
│ 18:00  Pista 2  [Programada] 2/4    │
│ 20:00  Pista 1  [Completada] 3/4    │
│ MIÉ 5 NOV                           │
│ 09:00  Pista 3  [Cancelada] 1/4     │
│                                     │
│ [+ Nuevo bloque]                    │
├─────────────────────────────────────┤
│ Inicio Cursos Academias …  Perfil   │
└─────────────────────────────────────┘
```

### B.2 Alumno `/mis-clases`

Misma tarjeta de A.4 + historial + agregados, en una ruta propia; el dashboard sólo muestra un resumen de 1 línea ("Próxima: hoy 18:00 →").

**Estados**: idénticos a A.6 + estado "sin curso seleccionado" (coach) y "no estás inscrito en ningún curso" (alumno).
**Componentes**: reutiliza todo A + **necesita** 1 ruta nueva por rol, 1 selector de curso, 1 item de entrada (link en `course-card` y/o dashboard). Accesibilidad ok, pero duplica el header de curso y obliga a un `Select` extra antes de ver nada útil.

---

## 3. Paquete C — "Calendario denso" (estilo calendario semanal)

**Idea**: grilla 7 columnas × franjas horarias con scroll horizontal, como una agenda de escritorio.

### C.1 Coach (375 px — el problema se ve aquí)

```
┌─────────────────────────────────────┐
│ Agenda · Intermedio   [Habilitar]   │
│ ‹ Sem 45 ›                          │
│ ┌────┬────┬────┬→ (scroll) ────────┐│
│ │LUN │MAR │MIÉ │JUE │VIE │SÁB │DOM ││
│ │    │    │    │    │    │    │    ││
│17:00│    │    │    │    │    │    ││
│18:00│███ │    │███ │    │    │    ││ ← bloques 38px
│19:00│███ │    │███ │    │    │    ││
│20:00│    │███ │    │    │    │    ││
│21:00│    │    │    │    │    │    ││
│    └────┴────┴────┴────┴────┴────┴┘│
│  ← desliza para ver más días →      │
└─────────────────────────────────────┘
```
En 375 px caben **3.5 días**; los bloques de 38 px no permiten mostrar estado + cupo + acción → el tap abre un sheet. Requiere lógica de posicionamiento (altura por duración), manejo de solapes (EC-08) y scroll bidireccional. Reutiliza `Badge`/`Dialog`, **pero crea** `agenda-week-grid` (≈300 líneas) + cálculo de layout.

### C.2 Alumno
Sólo lista en el detalle del curso (igual que A.5 pero sin dashboard). Máxima simplicidad de datos, mínima visibilidad: el alumno debe entrar a cada curso para saber cuándo entrena → incumple el objetivo "un alumno ve su próxima clase sin intervención".

---

## 4. Tabla comparativa

| Criterio (peso) | A · Embebido ligero | B · Agenda dedicada | C · Calendario denso |
|---|---|---|---|
| Simplicidad móvil coach (30 %) | **5** — lista vertical, 1 tap por acción | 3 — selector de curso antes de ver nada | 1 — 3.5 días visibles, solapes, tap obligatorio |
| Claridad alumno (25 %) | **5** — próxima clase en el home, 0 taps | 4 — ruta dedicada, 1 tap más | 2 — debe entrar curso por curso |
| Rutas / navegación nuevas (10 %) | **5** — 0 rutas, 0 ítems de nav | 2 — 2 rutas + entrada en 2 sitios | 3 — 1-2 rutas |
| Componentes nuevos (10 %) | **4** — 3 de dominio, 0 primitivos | 4 — mismos 3 + selector | 1 — grilla ~300 líneas + layout engine |
| Estados / a11y (10 %) | **5** — lista semántica, targets 44 px | 4 | 2 — scroll horizontal rompe AC-07 |
| Esfuerzo de tests E2E (10 %) | **5** — 1 flujo: tab → habilitar → asignar | 3 — 2 flujos por ruta | 2 — interacción de grilla frágil |
| Riesgo timezone / fechas cliente (5 %) | **5** — no se calcula fecha en cliente | 5 | 2 — posicionamiento por fecha/hora en cliente |
| **Ponderado** | **4.85** | **3.35** | **1.75** |

### Recomendación: **Paquete A**

1. **Cero navegación nueva**: la agenda es del curso (coherente con el modelo: `weekly_slots.courseId`), y el `bottom-nav` ya está al límite.
2. **Mobile-first real**: la lista por día funciona a 375 px sin scroll horizontal ni posicionamiento absoluto → cumple AC-07 sin trucos.
3. **La próxima clase aparece sola** en el dashboard del alumno (objetivo medible del spec) sin que el coach haga nada extra.
4. **Coste mínimo**: 3 componentes de dominio, 0 primitivos, 0 dependencias, 1 flujo E2E.
5. **Deuda documentada**: la grilla semanal del coach (y del alumno) queda como evolución futura cuando haya volumen; el modelo de datos ya la soporta sin migración.

Si más adelante el coach gestiona ≥5 cursos, migrar a B es **incremental**: `agenda-week-list` se monta igual dentro de `/agenda`, sin reescribir.

---

## 5. Diseño de los flujos de notificación visibles

El motor (`lib/notifications/engine.ts`) es inbox-first + push; **la UI ya existe** (`notification-badge` → `notification-dropdown` → `notification-item`). Sólo se definen contenidos y destinos.

### 5.1 `class.assigned` — "te agendaron"

```
Bell + "1"  (badge destructive, sin cambios)
┌─ Notificaciones ────────── Marcar todo ─┐
│▌🏷  Nueva clase agendada      hace 2 min │  ← border-l según prioridad
│▌   Lun 11 nov · 18:00 · Pista 2         │  ← body line-clamp-2
│▌   Curso Intermedio                     │
│▌   Ver mi clase →                       │  ← ctaUrl /dashboard#proximas-clases
└─────────────────────────────────────────┘
```
- No leída → `bg-accent` + título `font-semibold` (ya implementado en `notification-item`).
- Push nativo: mismo título/body; `data.url` → `/dashboard#proximas-clases`.
- En el dashboard, la card de esa clase se **resalta** (`ring-1 ring-primary/40`) durante la sesión (`?highlight=blockId`) y `scrollIntoView` del ancla — refuerza el push sin nueva UI.
- Estado vacío de preferencias: si el alumno desactivó push, sólo inbox; **no** se muestra prompt adicional (evita doble soft-prompt).

### 5.2 `class.cancelled`

```
▌⚠️  Clase cancelada                hace 5 min
▌    Lun 11 nov · 18:00 · Pista 2
▌    El coach canceló la sesión.
▌    Ver detalle →
```
- Prioridad P1 → barra izquierda `destructive`, icono alerta.
- La card del alumno pasa a `[Cancelada]` (badge destructive) y se mueve a "Anteriores" sólo cuando la fecha pasa; mientras tanto queda en próximas con estado cancelado.

### 5.3 `class.removed`

Igual pero **sin CTA** e informativo: "Ya no estás asignado a la clase del lun 11 nov". No genera push si el alumno no tenía push activo.

### 5.4 Feedback del coach (lado emisor)

- Al asignar: `toast.success("2 alumnos notificados")` (Sonner).
- Al cancelar bloque: `AlertDialog` → copy "Se cancelará la clase y se notificará a los 3 alumnos asignados. Esta acción no se puede deshacer." → tras confirmar: `toast.success("Clase cancelada · 3 avisos enviados")`.
- Si el push falla, el toast dice "Avisos enviados al inbox" (nunca "falló": inbox-first por AC-05).

---

## 6. Orden de implementación sugerido (para @architect/@app-engineer)

1. Tab `agenda` + `agenda-week-list` (sólo lectura de bloques).
2. Plantilla (`weekly_slots`) en panel/dialog + "Habilitar Sem N" (`Dialog` de confirmación).
3. `block-assignment-sheet` (asignar/quitar + cupo) + estados.
4. Asistencia post-clase (`aria-pressed`) + cancelar bloque (`AlertDialog`).
5. `upcoming-classes-card` en dashboard del alumno + historial en detalle de curso + deep-link de notificación.
