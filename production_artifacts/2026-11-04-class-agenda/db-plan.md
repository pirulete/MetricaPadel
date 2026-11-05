# DB Plan — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · module: `padel`
> date: `2026-11-04` · autor: @db-engineer
> Chunks: **C1a** (schema + migración + slots/weeks + `getCourseOwned`) y **C1b** (bloques/enrollments/alumno + barrel + test).
> Fuente: `technical-design-v2.md` §1 (D1–D8, D17) · `change-map-v2.md` C1a/C1b.

## 1. Modelo de datos (aditivo puro, cero migración de datos)

3 tablas nuevas, 2 enums, 8 índices. `courses.schedule` queda como display legacy.

### Enums (lowercase, D2)

| Enum | Valores |
|---|---|
| `class_block_status` | `scheduled` · `completed` · `cancelled` |
| `block_enrollment_status` | `scheduled` · `completed` · `cancelled` |

### `weekly_slots` — plantilla semanal (capa 1)

| Columna | Drizzle | Null | Notas |
|---|---|---|---|
| `id` | `uuid` pk defaultRandom | no | |
| `course_id` | `uuid` → `courses` **cascade** | no | |
| `day_of_week` | `integer` | no | ISO 1–7 (D4) |
| `start_time` | `varchar(5)` | no | `HH:mm` wall-clock (D3) |
| `duration_minutes` | `integer` default `60` | no | 15–180 validado en Zod |
| `label` | `varchar(100)` | sí | p.ej. "Pista 2" |
| `is_active` | `boolean` default `true` | no | |
| `created_at` / `updated_at` | `timestamp` | no | defaultNow |

Índices: `weekly_slots_course_day_time_idx` **UNIQUE** (courseId, dayOfWeek, startTime) → base del 409 `AGENDA_SLOT_DUPLICATE`; `weekly_slots_course_active_idx` (courseId, isActive).

### `class_blocks` — instancia datada (capa 2)

| Columna | Drizzle | Null | Notas |
|---|---|---|---|
| `id` | `uuid` pk | no | |
| `course_id` | `uuid` → `courses` **cascade** | no | |
| `weekly_slot_id` | `uuid` → `weekly_slots` **set null** | sí | null = bloque suelto (EC-10) |
| `block_date` | **`date({ mode: 'string' })`** | no | primera columna `date` del repo (A2) |
| `start_time` | `varchar(5)` | no | `HH:mm` |
| `duration_minutes` | `integer` | no | |
| `status` | `class_block_status` default `scheduled` | no | |
| `max_capacity` | `integer` | **sí** | null = sin tope (D5) |
| `label` | `varchar(100)` | sí | |
| `created_at` / `updated_at` | `timestamp` | no | |

Índices: `class_blocks_slot_date_idx` **UNIQUE parcial** `(weekly_slot_id, block_date) WHERE weekly_slot_id IS NOT NULL` → idempotencia D7; `class_blocks_course_date_idx` (courseId, blockDate); `class_blocks_date_status_idx` (blockDate, status).

### `block_enrollments` — asignación + asistencia

| Columna | Drizzle | Null | Notas |
|---|---|---|---|
| `id` | `uuid` pk | no | |
| `block_id` | `uuid` → `class_blocks` **cascade** | no | |
| `student_id` | `uuid` → `users` **no action** | no | historial protegido (D8) |
| `status` | `block_enrollment_status` default `scheduled` | no | |
| `attended` | `boolean` | **sí** | tri-estado null/true/false (D6) |
| `notes` | `text` | sí | |
| `created_at` / `updated_at` | `timestamp` | no | |

Índices: `block_enrollments_block_student_idx` **UNIQUE** (blockId, studentId) → EC-06; `block_enrollments_student_status_idx` (studentId, status); `block_enrollments_student_attended_idx` (studentId, attended).

**D17 respetado**: sin `block_date` ni `student_id` denormalizados; el filtro por fecha va por join a `class_blocks`.

## 2. Queries (`lib/db/queries/padel/`)

### `class-agenda.ts` (C1a, 223 líneas)

| Función | Contrato |
|---|---|
| `listWeeklySlots(courseId)` | `WeeklySlot[]`, orden dayOfWeek/startTime asc |
| `createWeeklySlot(courseId, data)` | insert `WeeklySlot`; UNIQUE ⇒ el caller traduce a 409 `AGENDA_SLOT_DUPLICATE` |
| `updateWeeklySlot(courseId, slotId, data)` | update parcial scoped ⇒ `WeeklySlot \| null` |
| `deleteWeeklySlot(courseId, slotId)` | tx ⇒ `{ deleted, detachedBlocks }` (FK set null conserva historial) |
| `materializeWeek(courseId, weekStart)` | tx idempotente: slots activos → 7 fechas → `onConflictDoNothing` ⇒ `{ ok:true, weekStart, weekEnd, created, skipped, activeSlots }` \| `{ ok:false, reason:'no_slots' }` (sin escritura) |
| `listBlocksByRange(courseId, from, to)` | `CourseBlockRow[]` con `enrolledCount` (status ≠ cancelled), `attendedCount`, `capacityRemaining` (null si sin tope) |

> `materializeWeek` no importa la lógica pura de C2 (aún no existía en C1a): calcula las 7 fechas con `Date.UTC` sobre el string. La planificación pura (`buildMaterializationPlan`) es de C2 y no duplica I/O.
> `isPast`/`canEditTiming` **no** viven en las queries (dependen de `todayIso`); los añade el handler con la lógica pura (C2).

### `class-agenda-blocks.ts` (C1b, 381 líneas)

| Función | Contrato |
|---|---|
| `listBlockDetail(courseId, blockId)` | `{ block, enrollments[] } \| null` (404 si el bloque no es de ese curso) |
| `assignStudents(courseId, blockId, studentIds)` | tx **all-or-nothing** (D10): bloque del curso, no cancelado, todos inscritos a `course_enrollments`, cupo ⇒ `{ ok:true, assigned, alreadyAssigned, enrolledCount }` \| `{ ok:false, reason }` (`block_not_found`/`block_cancelled`/`student_not_enrolled`(+ids)/`capacity`(+remaining)) |
| `updateAttendance(courseId, blockId, studentId, { attended?, notes? })` | tx tri-estado; `attended` true/false ⇒ `status='completed'`, null ⇒ status intacto |
| `removeEnrollment(courseId, blockId, studentId)` | tx hard delete ⇒ `{ ok:true, removed }` \| `enrollment_not_found` |
| `setBlockStatus(courseId, blockId, status)` | tx; `cancelled` arrastra enrollments ⇒ `cancelledStudentIds[]` para notificar post-commit (EC-05) |
| `listStudentUpcoming(studentId, todayIso, {courseId?, limit?})` | `block_date >= todayIso` + `status='scheduled'`, INNER JOIN `course_enrollments`; `limit` default **5** (A5) |
| `listStudentHistory(studentId, todayIso, {courseId?, limit?, cursor?})` | cursor `YYYY-MM-DDTHH:mm` (B2), orden desc, `limit+1`, `nextCursor` = `` `${blockDate}T${startTime}` `` |
| `getStudentAggregates(studentId, courseId?)` | conteos por status de bloque + attended/missed + `attendanceRate` 3 decimales (null si 0 marcadas) |

Sin bypass SUPER_ADMIN (D9): el scoping es `courses.ownerId` (coach, vía `getCourseOwned`) o `course_enrollments` (alumno).

### `courses.ts` (MOD, D20/B3)

`getCourseOwned(ownerId, id)` → fila de `courses` (incluye `status`) o `null`. 1 query, `courses.ownerId`. `getCourseById` **intacto** (`CourseDetail`).

### Barrel (`index.ts`)

`export * from './class-agenda'` + `'./class-agenda-blocks'`.

## 3. Migración

Ver `migration-notes.md` — `drizzle/0013_spotty_felicia_hardy.sql`, aplicada en local (puerto 5434).

## 4. Verificación

- `npx tsc --noEmit` ⇒ **0 errores**.
- `npx eslint` sobre los 5 archivos ⇒ **0 errores** (1 warning preexistente `max-lines` en `schema.ts`, excepción aprobada en el change-map).
- `pnpm run test:unit` ⇒ **67 suites / 885 tests verdes** (incluye 3 nuevos casos de `getCourseOwned` en `tests/unit/db/courses.test.ts`).
- Smoke funcional real contra la DB (fixtures creadas y **eliminadas** al final): materialización idempotente `created:1 → created:0`, asignación + re-asignación idempotente, asistencia tri-estado, cancelación con cascada de enrollments, upcoming vacío tras cancelar, historial paginado.
- Verificación de columnas/índices/FKs: ver `migration-notes.md` §3.

## 5. Riesgos y notas para C4/C5

1. **`materializeWeek` devuelve `{ok:false, reason:'no_slots'}`** ⇒ el handler responde 409 `AGENDA_NO_SLOTS` (no escribir nada).
2. **409 de UNIQUE**: `createWeeklySlot`/`updateWeeklySlot` dejan propagar el error de constraint; el handler lo traduce a `AGENDA_SLOT_DUPLICATE`.
3. **Bloque de otro curso ⇒ 404**: toda query de bloque exige `(blockId, courseId)`.
4. `listBlocksByRange` no incluye `enrollments[]`; el detalle se obtiene con `listBlockDetail`.
5. `capacityRemaining` cuenta inscripciones con `status <> 'cancelled'`.
