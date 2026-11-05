# Mockup Spec — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · autor: @ui-designer · date: `2026-11-04`
> Componente: `components/preview/class-agenda.tsx` (**efímero**, se elimina al implementar).
> Paquete implementado: **A · "Embebido ligero"** (ver `design-exploration.md`).
> Estado técnico: `tsc --noEmit` = 0 errores · `eslint` = 0 errores (1 warning `max-lines` esperado en mockups).

---

## 1. Cómo abrirlo

El mockup es un client component puro. Sigue el patrón del repo: una ruta de preview de 4 líneas.

```tsx
// app/preview/class-agenda/page.tsx  (fuera del alcance de @ui-designer; lo crea @app-engineer/@qa-release)
import ClassAgendaMockup from "@/components/preview/class-agenda";

export default function PreviewClassAgendaPage() {
  return <ClassAgendaMockup />;
}
```

Ruta resultante: `/preview/class-agenda`. Se elimina junto con el componente al implementar la feature (igual que `coach-transition-editor`).

---

## 2. Estructura del componente

```
components/preview/class-agenda.tsx
├── Primitivas locales
│   ├── Phone({role?, active?, label})        → marco 375 px, h-667, scroll interno, role="group"
│   ├── MiniBottomNav({role, active})         → COACH_NAV (7) / USER_NAV (6) — replica lib/constants/navigation
│   ├── StatusBadge({status})                 → PROGRAMADA secondary · COMPLETADA outline+primary · CANCELADA destructive
│   ├── WeekPicker({week, range})             → ‹ Semana N · rango ›  (sin DatePicker: ver ui-kit-audit §5)
│   ├── BlockRow({time, place, status, assigned, capacity, attended, past})
│   └── DayGroup({day, date, children})       → <h3> con bullet, lista semántica de bloques
├── Coach
│   ├── CoachAgendaScreen                     → tab Agenda + días + plantilla
│   ├── CoachEmptyScreen                      → sin plantilla (EmptyState + "cómo funciona")
│   ├── CoachEnableWeekScreen                 → dialog "Habilitar Semana 46" sobre agenda atenuada
│   ├── CoachAssignmentScreen                 → asignación + asistencia (Sí/No/Sin marcar) + cancelar
│   └── CoachStatesScreen                     → loading / error / semana no habilitada / bloque sin alumnos
├── Alumno
│   ├── StudentDashboardScreen                → "Próximas clases" (hoy resaltado) + nivel + cursos
│   ├── StudentHistoryScreen                  → 3 métricas + próximas + anteriores + "Cargar más"
│   ├── StudentEmptyScreen                    → sin clases programadas
│   └── StudentNotificationScreen             → panel de notificaciones + card resaltada por deep-link
├── DesktopAgendaScreen                       → 1280 px, grid [1fr_320px] (lista + plantilla)
└── export default ClassAgendaMockup          → <PreviewShell title screens toolbar>
```

**Reglas respetadas**
- Sólo primitivos existentes: `Button`, `Badge`, `Card/CardContent`, `Input`, `Separator`, `Switch`, `Tabs`, `EmptyState`, `PreviewShell`.
- **Cero** colores hardcodeados: sólo tokens (`bg-card`, `text-muted-foreground`, `bg-primary/5`, `border-destructive/40`, `bg-accent`, `ring-primary/50`).
- **Cero** lógica de negocio, fetch, hooks de datos ni imports de `lib/` (sólo `cn`).
- Datos 100 % mock inline; ningún id real.

---

## 3. Pantallas (10)

| # | Chip | Pantalla | Qué demuestra |
|---|---|---|---|
| 1 | `Coach · Agenda` | Tab Agenda de `/cursos/[id]` | 3º tab, selector de semana, CTA "Habilitada", 4 estados de bloque (Programada / Cancelada / Completada con asistencia / sin clases), plantilla con `Switch`. |
| 2 | `Coach · Sin plantilla` | Empty state | `EmptyState` + CTA primaria + explicación en 3 pasos (reduce soporte). |
| 3 | `Coach · Habilitar semana` | `Dialog` | Preview de bloques a crear, copy de idempotencia (EC-01/EC-09), acción "Habilitar 2". |
| 4 | `Coach · Bloque / asistencia` | Sheet de bloque | Ocupación 2/4, asignados con asistencia de 3 estados (`aria-pressed`), disponibles con búsqueda, marcar completada / cancelar con consecuencia explícita, CTA con cupo ("Asignar 1 · 3/4"). |
| 5 | `Coach · Loading/Error` | Estados transversales | `aria-busy` + skeletons, `role="alert"` + Reintentar, semana no habilitada, bloque con 0 alumnos y CTA "Asignar alumnos". |
| 6 | `Alumno · Próximas clases` | Dashboard | Badge campana con contador, "Hoy · 18:00", estado, duración, nivel y cursos. Cumple AC-07 a 375 px. |
| 7 | `Alumno · Historial` | Detalle de curso | Agregados (Programadas / Asistidas / %), próximas, anteriores con "Asististe" / "Cancelada por el coach" / "No asististe", "Cargar más" (patrón `history-list`). |
| 8 | `Alumno · Vacío` | Dashboard vacío | `EmptyState` + pista "¿Esperabas una clase?" (recuperable, sin callejón). |
| 9 | `Alumno · Aviso agendado` | Notificación | Panel de inbox con borde por prioridad, no leída en `bg-accent`, CTA "Ver mi clase →", cancelación destructiva y aviso informativo sin CTA; card de la clase resaltada (`ring-primary/50`). |
| 10 | `1280 · Desktop coach` | Breakpoint | Grid 1fr/320 px, días en 2 columnas, panel de plantilla lateral. |

---

## 4. Cobertura de estados (requisito @ui-designer)

| Estado | Dónde se ve | Implementación |
|---|---|---|
| default | #1, #4, #6, #7 | Datos mock realistas (Ana, Luis, Marta, Pablo, Nuria). |
| empty (sin template) | #2 | `EmptyState` + CTA "Configurar plantilla". |
| empty (semana no habilitada) | #5 | Bloque dashed + CTA "Habilitar Sem 46". |
| empty (bloque sin alumnos) | #5 | Fila dashed + "0 asignados" + CTA secundaria. |
| empty (alumno sin clases) | #8 | `EmptyState` + "Ver mis cursos". |
| empty (historial) | — | Mismo `EmptyState` de `history-list` (documentado, no duplicado en el mockup). |
| loading | #5 | `aria-busy`, `Loader2` con `animate-spin`, 3 skeletons. |
| error | #5 | `role="alert"`, borde `destructive`, "Reintentar" (no bloquea el resto). |
| semana ya habilitada | #1 | Botón `outline` deshabilitado "Habilitada" + copy "nada pendiente". |
| cupo lleno | #4 | "Ocupación 2/4" y CTA con cupo; en implementación las filas disponibles pasan a `disabled` a 4/4 (EC-04). |
| bloque pasado | #1, #10 | "Completada · 2 asistieron", edición de hora deshabilitada (EC-02). |
| cancelada | #1, #7, #9 | `Badge destructive` + texto, notificación destructiva. |
| notificación no leída / leída | #9 | `bg-accent` + `font-semibold` vs `bg-background` + `text-muted-foreground`. |
| dark mode | global | `PreviewShell` `.preview-dark` redefine variables; no hay colores fuera de tokens. |

---

## 5. Breakpoints

| bp | Qué cambia | Verificación |
|---|---|---|
| **375** | Lista vertical por día; sheet full-width; chips de semana contenidos; bottom-nav 6/7 ítems a `text-[9px]`. | `Phone max-w-[375px]` + `h-[667px]` + scroll interno (sin scroll horizontal). |
| **768** | Días en `md:grid-cols-2`; sheet centrado (`max-w-md`). | Pantalla #10 (`md:grid-cols-2`). |
| **1280** | `lg:grid-cols-[1fr_320px]`; plantilla como panel lateral; roster de asistencia en `Table` (real, no en móvil). | Pantalla #10. |

---

## 6. Accesibilidad del mockup

- `Phone` → `role="group"` + `aria-label` por pantalla.
- `MiniBottomNav` → `aria-current="page"`.
- Flechas de semana → `aria-label="Semana anterior"` / `"Semana siguiente"`.
- Asistencia → 3 `<button aria-pressed>`, nunca sólo color (texto Sí / No / Sin marcar).
- Badge de campana → `aria-label="Notificaciones, 3 sin leer"`.
- `Switch` de plantilla → `aria-label="Activar plantilla del Lunes"`.
- Iconos decorativos → `aria-hidden` (MapPin, Users, Clock, AlertTriangle, etc.).
- Contraste: `Badge destructive`/`secondary` y texto `muted-foreground` sobre `bg-card` cumplen AA en light y en `.preview-dark`.

---

## 7. Traspaso a implementación (`@app-engineer`)

1. `CoachAgendaScreen` → `components/padel/agenda-week-list.tsx` montado en el **3er `TabsTrigger`** de `course-detail.tsx` (`defaultValue` sigue en `students`).
2. `CoachAssignmentScreen` → `components/padel/block-assignment-sheet.tsx` (`Dialog`/sheet), reutilizando el filtro de `student-picker`.
3. `CoachEnableWeekScreen` → `Dialog` + `POST` de materialización; el copy de conteo ("2 creados · 0 omitidos") sale de la respuesta real.
4. `WeekPicker` → estado `weekStart` en la página; el server resuelve timezone (EC-07). **No** crear `calendar.tsx`.
5. `StudentDashboardScreen` → insertar `upcoming-classes-card.tsx` entre el hero y "Tu nivel"; deep-link `#proximas-clases`.
6. `StudentHistoryScreen` → sección en `student-course-detail.tsx` reutilizando el patrón visual de `history-list` (cursor G15).
7. `StudentNotificationScreen` → **no se implementa UI nueva**: basta con `class.assigned` (`ctaUrl=/dashboard#proximas-clases`) en `lib/notifications/triggers.ts`.
8. Al terminar: **borrar** `components/preview/class-agenda.tsx` y la ruta `/preview/class-agenda`.
