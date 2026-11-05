# UI Kit Audit — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · autor: @ui-designer · date: `2026-11-04`
> Alcance: auditoría **read-only** de lo existente antes de proponer UI. Nada de este documento
> implica cambios en componentes reales. StreetMove se usó sólo como referencia conceptual externa
> (sin copiar código ni archivos).

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Hay design system? | Sí: Tailwind v4 + CSS vars en `app/globals.css` (paleta oklch, `--primary` verde 145) + shadcn/ui + Radix. |
| ¿Hay primitivos suficientes para la agenda? | Sí, **salvo** un `Calendar/DatePicker` que **no hace falta** en v1 (ver §5). |
| ¿Reutilizamos el patrón de tabs del curso? | Sí: `course-detail.tsx` ya usa `Tabs` (Alumnos / Rúbricas) → agenda entra como **tercer tab**. |
| ¿Hay motor de notificaciones visible? | Sí y completo: `NotificationBadge` → `NotificationDropdown` → `NotificationItem` (inbox), con prioridad por color y CTA. |
| ¿Componentes nuevos necesarios? | Máximo **3**, todos de dominio y presentacionales (no primitivos): `AgendaWeekList`, `BlockAssignmentSheet`, `UpcomingClassesCard`. 0 primitivos nuevos. |
| Riesgo principal | Duplicar una grilla calendario "tipo StreetMove" (densa, scroll horizontal) cuando el coach usa móvil 375 px. |

---

## 2. Inventario de primitivos (`components/ui/`)

| Componente | Variantes / API relevante | ¿Se usa en agenda? | Nota |
|---|---|---|---|
| `Button` | `default \| destructive \| outline \| secondary \| ghost \| link`; `sm \| default \| lg \| icon \| icon-sm \| icon-lg` | ✅ | "Habilitar Sem N", "Asignar", "Marcar asistencia", icon-buttons de fila. Targets: `size="sm"` = 32 px → **subir a `icon` (36) o `h-11` en móvil**. |
| `Badge` | `default \| secondary \| destructive \| outline \| ghost \| link` | ✅ | Estados PROGRAMADA (`secondary`), COMPLETADA (`outline` + `text-primary`), CANCELADA (`destructive`), asistencia (`outline`). |
| `Card` / `CardHeader` / `CardTitle` / `CardContent` | — | ✅ | Contenedor de "Próximas clases" (alumno) y de la lista de días (coach). |
| `Dialog` | header/content/footer/title/description | ✅ | Crear/editar slot template y editar bloque. |
| `AlertDialog` | ya usado para "Archivar curso" | ✅ | **Cancelar bloque** (destructivo + copy de consecuencia: "se notificará a N alumnos"). |
| `Tabs` | `defaultValue` + `TabsList/TabsTrigger/TabsContent`, `className="mt-4"` en content | ✅ | Tercer tab `agenda` en P07 (patrón idéntico a `students`/`rubrics`). |
| `Select` | Radix, `SelectTrigger/Content/Item` | ✅ | Hora inicio (incrementos de 15'), duración (30/60/90). |
| `Input` / `Label` / `Textarea` | — | ✅ | `label` del slot, `maxCapacity`, `notes` de asistencia. |
| `Switch` | Radix, `h-6 w-11`, `data-[state=checked]:bg-primary` | ✅ | `isActive` del slot template. |
| `Separator` | — | ✅ | Separadores de día en la lista semanal. |
| `Table` | — | ⚠️ opcional | Útil en **desktop ≥1280** para roster de asistencia; en móvil NO. |
| `Tooltip` / `Popover` / `DropdownMenu` | — | ⚠️ | `DropdownMenu` para acciones de fila (`⋯`) si se necesitan ≥3 acciones. |
| `Accordion` | — | ➖ | Alternativa a "día colapsable"; v1 no lo necesita. |
| `Carousel` / `AspectRatio` / `NavigationMenu` | — | ❌ | No aplica. |
| `Section` / `SectionHeader` | `py-8 md:py-24`, `max-w-7xl` | ❌ **no usar** | Es primitivo de **marketing**; en páginas privadas rompe densidad. Las páginas privadas usan `div.space-y-*` + grid directo (ver `course-detail.tsx`, `student-dashboard.tsx`). |

### Fuente de verdad visual
- **Tokens**: `app/globals.css` (`--primary`, `--muted-foreground`, `--destructive`, `--accent`, `--border`, `--radius: 0.75rem`). **Prohibido** hardcodear colores; sólo clases semánticas (`bg-primary/10`, `border-border`, `text-muted-foreground`).
- **Dark mode**: `PreviewShell` redefine las mismas variables en `.preview-dark`. Cualquier color nuevo debe seguir funcionando ahí.

---

## 3. Patrones de página privada

| Patrón | Archivo de referencia | Regla a respetar |
|---|---|---|
| Header de página | `course-detail.tsx:118-164` | `h1.text-2xl.font-bold` + `flex flex-wrap items-center gap-2` + acciones a la derecha. |
| Tabs de entidad | `course-detail.tsx:166-247` | `<Tabs defaultValue="students">` + `<TabsContent className="mt-4">`; cada tab con su propio `EmptyState`. |
| Lista de entidad | `course-detail.tsx:182-216` | `Card` + `CardContent.divide-y.divide-border` + fila `py-2.5` (label izq., acciones der.). |
| Hook de datos | `student-dashboard.tsx:48-73` | `useEffect` + `fetch(..., {cache:"no-store"})` + `loading` local + `toast.error` de Sonner. Sin estado global. |
| Navegación | `bottom-nav.tsx` + `lib/constants/navigation.ts` | `ADMIN_NAV_ITEMS` (7 ítems, ya saturado) / `USER_NAV_ITEMS` (6 ítems). **No añadir ítem de agenda** → agenda vive dentro de `/cursos/[id]`. |
| Empty state | `components/padel/empty-state.tsx` | `title` + `description` + `action` opcional; borde dashed, centrado. |
| Confirmación destructiva | `course-detail.tsx:143-162` (`AlertDialog` archivar) | Mismo shape para cancelar bloque; el description **debe** nombrar el efecto en alumnos. |
| Toasts | `sonner` (`toast.error`, `toast.success`) | Feedback de mutaciones; nunca reemplaza el estado inline de error. |

---

## 4. Componentes de dominio existentes (`components/padel/`)

| Componente | Reutilización para agenda | Veredicto |
|---|---|---|
| `course-detail.tsx` | Contenedor del coach: añadir tab `agenda` (P07) | ✅ **Reutilizar** — único punto de entrada del coach |
| `course-card.tsx` | Muestra curso en listas | ✅ **Sin cambios**; opcional badge "N clases esta semana" (futuro) |
| `student-dashboard.tsx` | Home del alumno (nivel + cursos + notificaciones) | ✅ **Reutilizar** — insertar bloque "Próximas clases" entre hero y cursos |
| `student-course-detail.tsx` | Detalle de curso del alumno con evaluaciones | ✅ **Reutilizar** — añadir sección de historial de clases (tab o bloque) |
| `empty-state.tsx` | Empty states de agenda | ✅ Reutilizar tal cual |
| `add-student-modal.tsx` / `student-picker.tsx` | Ya resuelven "elegir alumno inscrito" con búsqueda | ✅ **Reutilizar el patrón**; para asignación por bloque se necesita multi-selección → `BlockAssignmentSheet` (nuevo, ~120 líneas) que reutiliza el markup de fila y el filtro. |
| `assign-rubric-modal.tsx` | Dialog con lista seleccionable | ✅ Referencia de estructura para el sheet de asignación |
| `dashboard-metrics.tsx` | Grid de métricas (2/4 cols) | ✅ Reutilizar para agregados del alumno (programadas / asistidas / %). |
| `history-list.tsx` | Lista con filtros + "Cargar más" (cursor G15) | ✅ Reutilizar patrón para historial de clases del alumno. |
| `bottom-nav.tsx` | Navegación | ✅ Sin cambios (no se añade ítem) |

### Componentes nuevos propuestos (sólo si nada cubre >80 %)

| Nuevo | Por qué no basta lo existente | Tamaño estimado |
|---|---|---|
| `agenda-week-list.tsx` (coach) | No existe ninguna vista de días/horas. Se implementa como **lista por día** (no grilla) para 375 px. | ~180 líneas |
| `block-assignment-sheet.tsx` | `add-student-modal` es 1-alumno y sin cupo/estado por bloque; el flujo requiere multi-select + contador de cupo. | ~140 líneas |
| `upcoming-classes-card.tsx` (alumno) | `student-dashboard` sólo lista cursos; no hay tarjeta de próxima clase con fecha/hora/estado. | ~90 líneas |

Todo lo demás (tablas de plantilla, diálogos de slot, marcar asistencia) se compone con primitivos + filas del patrón `Card/divide-y` **sin** componentes nuevos.

---

## 5. Calendario / DatePicker — decisión explícita

- `react-day-picker@9.8.0` y `date-fns@4.1.0` **están instalados**.
- **NO existe** `components/ui/calendar.tsx` (no hay wrapper shadcn) y **no se usa en ningún archivo** del repo.
- **Veredicto: no crear el wrapper en v1.** La acción "Habilitar Sem N" se resuelve con navegación de semana: `‹ Sem 45 · 3–9 nov ›` (flechas `Button variant="ghost" size="icon"`), donde el backend recibe `weekStart` ISO. Esto evita: dependencia de un popover calendario en 375 px, problemas de timezone en cliente (EC-07 del spec) y una superficie nueva que auditar.
- Si más adelante se requiere "elegir fecha exacta" para bloques sueltos, ahí sí se añade `calendar.tsx` (wrapper de 1 archivo) — documentado como deuda.

---

## 6. Notificaciones — qué existe y cómo se reutiliza

| Pieza | Archivo | Comportamiento real |
|---|---|---|
| Badge de campana | `components/notifications/notification-badge.tsx` | `Bell` + contador rojo (`bg-destructive`, `99+`), polling 30 s vía `useNotifications`. |
| Dropdown | `notification-dropdown.tsx` | Últimas 10, "Marcar todo como leído", "Ver todas" → `/notifications`. EmptyState propio. |
| Ítem | `notification-item.tsx` | `border-l-2` con color por prioridad (`getPriorityColor`), no leída = `bg-accent` + `font-semibold`, body `line-clamp-2`, **CTA** (`ctaUrl`/`ctaLabel`) → `text-primary`. Botón `X` = soft-delete. |
| Inbox completo | `app/(app)/notifications/page.tsx` | Lista paginada + filtros (`notification-filters.tsx`). |
| Push soft-prompt | `push-soft-prompt.tsx` | Opt-in no intrusivo. |

**Implicación de diseño**: la agenda **no necesita UI de notificación nueva**.
- `class.assigned` → `title: "Nueva clase agendada"`, `body: "Martes 11 nov · 18:00 · Pista 2 · Curso Intermedio"`, `ctaLabel: "Ver mi clase"`, `ctaUrl: "/dashboard#proximas-clases"` (o `/cursos/{id}?tab=agenda`).
- `class.cancelled` → prioridad P1 (`border-l` destructive), `ctaLabel: "Ver detalle"`.
- `class.removed` → sin CTA (informativo).
- Iconos por `TYPE_ICONS` en `lib/notifications/priority.ts`: usar un type existente de sistema/clase; **@app-engineer** decide si añade un type nuevo (no es decisión de UI).

---

## 7. Patrón de mockups (`components/preview/`)

| Archivo | Estructura |
|---|---|
| `preview-shell.tsx` | `PreviewShell({title, screens, toolbar})`: chips de navegación, toggle `preview-dark` (mismas CSS vars), `<main>` con la pantalla activa, footer. |
| `coach-transition-editor.tsx` | `"use client"`, primitivas locales `Phone` (max-w-[375px], min-h-[667px], `role="group"`, `aria-label`), `MiniBottomNav`, `Fab`; luego `*Screen` por estado; export default con `screens: PreviewScreen[]` + `toolbar` de badges. |
| `etapa3-dashboard-management.tsx` | Mismo patrón multietapa. |

**El mockup `class-agenda.tsx` replica exactamente**: `"use client"` → import `PreviewShell` de `./preview-shell` → `Phone`/`MiniBottomNav` locales → pantallas → `export default` con `screens` + `toolbar`.

---

## 8. Accesibilidad (WCAG AA) — checklist de diseño

- [x] Contraste: estados con `Badge` sobre `bg-card` (secondary/outline/destructive) ≥ 4.5:1 en light y dark de `preview-dark`.
- [x] **Nunca sólo color** para estado: texto "Programada/Completada/Cancelada" dentro del badge.
- [x] Targets táctiles ≥44 px en móvil (`h-11` en filas de acción; `icon` = 36 px sólo en desktop).
- [x] `aria-label` en flechas de semana (`Semana anterior`/`Semana siguiente`), en `Switch` de slot, en botones icon-only de fila.
- [x] Asistencia = grupo de 3 botones con `aria-pressed` (Asistió / No asistió / Sin marcar) — no un checkbox ambiguo.
- [x] `AlertDialog` para cancelar bloque (focus trap nativo de Radix) + copy con consecuencia.
- [x] Listas semánticas (`<ul>/<li>`) para días y bloques; heading por día (`h3`).
- [x] Sin scroll horizontal: días apilados verticalmente; chips de semana con `overflow-x-auto` sólo en el selector de fecha, no en la grilla.
- [x] Loading con `aria-busy` + skeleton textual; error con `role="alert"` y acción "Reintentar".

---

## 9. Veredicto

Reutilizar `Tabs` + `Card` + `Badge` + `AlertDialog` + `EmptyState` + `notification-*` cubre **>80 %** del caso de uso.
Sólo 3 componentes de dominio nuevos, 0 primitivos nuevos, 0 dependencias nuevas, 0 items de navegación nuevos.
