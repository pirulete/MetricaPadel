# Design Approved — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · autor: @ui-designer · date: `2026-11-04`
> Fuentes: `design-exploration.md` (alternativas A/B/C) · `mockup-spec.md` (mockup) · `ui-kit-audit.md` (UI kit).
> Estado: **APROBADO** — decisión delegada al diseño (usuario no requirió firmar alternativas).

---

## 1. Decisión aprobada

**Paquete A · "Embebido ligero"** (ponderado 4.85 vs 3.35 de B y 1.75 de C).

- Coach: la agenda es una sección dentro del detalle de curso → **3er tab "Agenda"** en `/cursos/[id]` (junto a Alumnos y Rúbricas).
- Alumno: **"Próximas clases"** como tarjeta en `/dashboard` + **historial de clases** en el detalle del curso.
- Cero rutas nuevas, cero ítems nuevos en `bottom-nav`.

### Justificación

- **Mobile-first real**: lista vertical por día, targets ≥44 px, funciona a 375 px sin scroll horizontal ni posicionamiento absoluto por hora → cumple AC-07 sin trucos.
- **Reutiliza lo que ya existe**: `Tabs` + `CourseDetail` / `student-course-detail` ya montan dos tabs; la agenda entra como tercer panel sin tocar layout ni header del curso.
- **Cero navegación nueva**: `bottom-nav` ya tiene 7 ítems (coach) / 6 (alumno); añadir `/agenda` lo satura y obliga a un selector de curso antes de ver nada útil.
- **La próxima clase aparece sola** en el dashboard del alumno (objetivo medible del spec) sin acción extra del coach, y el deep-link `#proximas-clases` reutiliza el inbox de notificaciones existente.

---

## 2. Mockup

`components/preview/class-agenda.tsx` — **efímero**: se elimina al implementar la feature, junto con la ruta `/preview/class-agenda` (mismo patrón que `coach-transition-editor`).

**10 pantallas**: Coach · Agenda (3er tab, selector de semana, 4 estados de bloque, plantilla con `Switch`) · Coach · Sin plantilla · Coach · Habilitar semana (`Dialog`) · Coach · Bloque/asistencia (ocupación 2/4, 3 estados de asistencia `aria-pressed`, cancelar con consecuencia) · Coach · Loading/Error · Alumno · Próximas clases · Alumno · Historial (agregados + próximas + anteriores + "Cargar más") · Alumno · Vacío · Alumno · Aviso agendado (inbox + card resaltada) · 1280 · Desktop coach (grid `1fr_320px`).

Sólo primitivos existentes (`Button`, `Badge`, `Card`, `Tabs`, `Switch`, `EmptyState`, `PreviewShell`), cero colores fuera de tokens, cero lógica de negocio.

---

## 3. Estados aprobados

| Estado | Comportamiento aprobado |
|---|---|
| **Empty sin plantilla** | `EmptyState` + CTA "Configurar plantilla" + explicación en 3 pasos (coach). |
| **Semana ya habilitada** | El CTA "Habilitar Sem N" pasa a `variant="outline"` **deshabilitado** ("Habilitada") + copy de idempotencia ("2 creados · 0 omitidos", EC-01). |
| **Bloque sin alumnos** | Fila con "0 asignados" + CTA secundaria "Asignar alumnos"; no se oculta el bloque. |
| **Loading** | `aria-busy="true"` + 3 skeletons + "Cargando agenda…"; en el alumno la card no bloquea el resto del dashboard. |
| **Error** | Inline `role="alert"` + "Reintentar", mantiene el tab activo y el resto de la página viva. |
| **Alumno sin clases** | `EmptyState` "Sin clases programadas" + "Ver mis cursos" (recuperable, sin callejón). |

Cubiertos además: cupo lleno (4/4 → filas `disabled`), bloque pasado (edición de hora deshabilitada, EC-02), curso archivado (sólo lectura, EC-13).

---

## 4. Desviaciones menores vs la spec

1. **Sin `Calendar` nativo**: no se crea `components/ui/calendar.tsx`. La selección de semana usa `‹ Sem N · rango ›` con flechas `ghost/icon` y el server recibe `weekStart` ISO (evita timezone en cliente, EC-07).
2. **Sin DatePicker/calendario denso**: la grilla semanal (Paquete C) queda como evolución futura documentada; el modelo de datos ya la soporta sin migración.
3. **Avisos de notificación sin UI nueva**: `class.assigned`/`class.cancelled`/`class.removed` se renderizan con el inbox existente (`notification-item`); sólo se define copy y `ctaUrl`.

---

## 5. Pendiente de usuario

Ninguno. La decisión de diseño fue delegada y queda cerrada; cualquier cambio de dirección (p. ej. migrar a Paquete B con `/agenda` dedicada) es una nueva iteración con su propio change_id.
