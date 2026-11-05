# Technical Design — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · module: `padel`
> date: `2026-11-04` · autor: @architect
> Fuentes: `feature-spec.md`, `release-scope.md` (@pm) · `ui-kit-audit.md`, `design-exploration.md`, `mockup-spec.md` (@ui-designer)
> Versioning: `technical-design.md` v1 (creación). Revisiones posteriores → `technical-design-v2.md` (nunca sobrescribir v1 si cambian contratos ya implementados).

---

## 0. Resumen de decisiones (D1–D16)

| # | Decisión | Justificación |
|---|---|---|
| **D1** | **3 tablas nuevas, cero migración de datos** | Aditivo puro. `courses.schedule` (varchar) queda como display legacy (release-scope §2). |
| **D2** | **Enums PG** (`class_block_status`, `block_enrollment_status`) en minúsculas | Convención del repo: todos los `pgEnum` son lowercase (`draft`/`active`/`archived`, `active`/`archived`). Los labels ES mayúsculas viven en la UI. |
| **D3** | **Fecha/hora = wall-clock sin timezone**: `block_date date` (string `YYYY-MM-DD`) + `start_time varchar(5)` (`HH:mm`) | Patrón verificado en `lib/date-utils.ts` (comentario "las fechas se guardan como strings sin timezone") y en `courses.days`. Evita el bug clásico de `timestamptz` desplazando la clase al día anterior (EC-07). El servidor nunca construye `Date` naive a partir de estos campos para decidir "hoy": usa `todayInChileStr()`/equivalente de `lib/date-utils.ts`. Ver §2.4. |
| **D4** | `weekly_slots.day_of_week` = **ISO 1–7 (lun=1 … dom=7)** | ⚠️ **Delta sobre AC-01 (spec pedía 0–6)**: el repo ya tiene `getIsoDayOfWeek()` en `lib/date-utils.ts` y la UI ya usa `DAY_OPTIONS = ["Lun"…"Dom"]` (`create-course-modal.tsx:23`). Usar 0–6 obligaría a dos convenciones y a un off-by-one. Requiere ack de @pm; el AC se reescribe como "1–7 validado con Zod". |
| **D5** | `max_capacity integer NULL` = sin tope | Q2 cerrada. Capacidad se evalúa **dentro de la transacción** de asignación (cuenta filas activas). |
| **D6** | `attended boolean NULL` (tri-estado: null = sin marcar) | Convención booleana del repo (`is_active`, `email_verified`). `notes text NULL`. |
| **D7** | **Idempotencia de materialización por UNIQUE parcial** `(weekly_slot_id, block_date) WHERE weekly_slot_id IS NOT NULL` + `onConflictDoNothing()` en tx | Resuelve EC-01 y el riesgo "materialización duplicada". Los bloques sueltos (`weekly_slot_id NULL`) no colisionan entre sí. |
| **D8** | `class_blocks.course_id` → **cascade**; `class_blocks.weekly_slot_id` → **set null** | El curso nunca se hard-deletea (archivar es soft), así que cascade es inerte y mantiene la DB consistente. `weekly_slot_id: set null` = EC-10 (borrar slot no borra historial). `block_enrollments.student_id` → **no action** (nunca cascade sobre usuarios, igual que `course_enrollments`). |
| **D9** | **Ownership = `courses.ownerId`** para *todos* (ADMIN y SUPER_ADMIN) | `lib/db/queries/padel/courses.ts` filtra SIEMPRE por `ownerId` (`listCourses`, `getCourseById`, `updateCourse`, `archiveCourse`). SUPER_ADMIN no es un bypass en cursos. Consistencia > conveniencia; recurso ajeno → **404**. |
| **D10** | Asignación **all-or-nothing**: cupo o alumno inválido ⇒ nada se escribe | AC-03/EC-04 ("409 sin escritura"). Batch se resuelve en una tx: validar todo → insertar → notificar post-commit. |
| **D11** | Asignar/quitar/cancelar notifican **inbox + push** desde un orquestador propio (`lib/notifications/agenda.ts`) | `lib/notifications/engine.ts` **no envía push** (comentario explícito línea 6). Push existe (`lib/push/sender.ts`, `getActiveSubscriptions`) pero no estaba cableado. El orquestador respeta `notification_preferences` y es **fire-and-forget** (push roto no rompe la mutación → AC-05). |
| **D12** | Dedup `groupId` explícito: `block:{blockId}:{event}` y `block:{blockId}:assigned:{studentId}`; ventana real del engine = **1 h** (no 24 h) | `checkDuplicateNotification` usa `cutoff = now - 60*60*1000`. AC-05 dice "24 h": se acepta la ventana de 1 h del engine como comportamiento vigente (documentado como delta menor; no se toca el engine). |
| **D13** | **Sin variables de entorno nuevas** | `CRON_SECRET` **ya existe** en `.env.example:41`. `APP_TIMEZONE` ya existe. El cron no se implementa en v1. |
| **D14** | **Cron STANDBY**, no se crea workflow ni endpoint | Q4. Ver §7. Activación = 1 archivo de workflow + 1 route handler + 0 env vars. |
| **D15** | UI = **Paquete A "embebido ligero"** de @ui-designer | Cero rutas nuevas, `bottom-nav` ya saturado (7/6 ítems), lista vertical funciona a 375 px sin scroll horizontal (AC-07). Coherente con `weekly_slots.courseId`. |
| **D16** | Zod en **`lib/validations/class-agenda.ts`** (no en `padel.ts`) | `padel.ts` ya tiene 273 líneas y es solo de rúbricas/evaluaciones; los schemas de agenda suman ~140 líneas. Precedente: `lib/validations/notifications.ts`. |

---

## 1. Modelo de datos (F0 — @db-engineer)

Migración: `pnpm run db:generate` → `drizzle/0013_*.sql` (journal `idx: 13`). **Nunca SQL a mano.**

### 1.1 Enums

```ts
// lib/db/schema.ts (sección Padel)
export const classBlockStatusEnum = pgEnum('class_block_status', ['scheduled', 'completed', 'cancelled']);
export const blockEnrollmentStatusEnum = pgEnum('block_enrollment_status', ['scheduled', 'completed', 'cancelled']);
export type ClassBlockStatus = (typeof classBlockStatusEnum.enumValues)[number];
export type BlockEnrollmentStatus = (typeof blockEnrollmentStatusEnum.enumValues)[number];
```

### 1.2 `weekly_slots` — template recurrente (1ª capa)

| Columna | Tipo Drizzle | Null | Notas |
|---|---|---|---|
| `id` | `uuid().primaryKey().defaultRandom()` | no | |
| `course_id` | `uuid().notNull().references(() => courses.id, { onDelete: 'cascade' })` | no | |
| `day_of_week` | `integer()` | no | ISO 1–7 (D4) |
| `start_time` | `varchar({ length: 5 })` | no | `HH:mm` (D3) |
| `duration_minutes` | `integer()` | no | default `60`; 15–180 (Zod) |
| `label` | `varchar({ length: 100 })` | sí | p.ej. "Pista 2" |
| `is_active` | `boolean()` | no | default `true` |
| `created_at` / `updated_at` | `timestamp()` | no | defaultNow / defaultNow |

Índices:
- `uniqueIndex("weekly_slots_course_day_time_idx").on(courseId, dayOfWeek, startTime)` → evita plantilla duplicada.
- `index("weekly_slots_course_active_idx").on(courseId, isActive)` → query "slots activos del curso" (materialización).

### 1.3 `class_blocks` — instancia datada (2ª capa)

| Columna | Tipo Drizzle | Null | Notas |
|---|---|---|---|
| `id` | `uuid` pk | no | |
| `course_id` | `uuid` FK `courses` **cascade** | no | |
| `weekly_slot_id` | `uuid` FK `weekly_slots` **set null** | sí | origen; null = bloque suelto (EC-10) |
| `block_date` | `date()` (mode string) | no | `YYYY-MM-DD` (D3) |
| `start_time` | `varchar({ length: 5 })` | no | `HH:mm` |
| `duration_minutes` | `integer()` | no | |
| `status` | `class_block_status` | no | default `'scheduled'` |
| `max_capacity` | `integer()` | sí | null = sin tope (D5) |
| `label` | `varchar({ length: 100 })` | sí | |
| `created_at` / `updated_at` | `timestamp()` | no | |

Índices:
- `uniqueIndex("class_blocks_slot_date_idx").on(weeklySlotId, blockDate).where(sql\`"weekly_slot_id" is not null\`)` → idempotencia D7.
- `index("class_blocks_course_date_idx").on(courseId, blockDate)` → **consulta "bloques por curso+fecha"** (agenda semanal coach: `courseId = ? AND block_date BETWEEN ? AND ?`).
- `index("class_blocks_date_status_idx").on(blockDate, status)` → próximas clases / cancelaciones.

### 1.4 `block_enrollments` — asignación + asistencia

| Columna | Tipo Drizzle | Null | Notas |
|---|---|---|---|
| `id` | `uuid` pk | no | |
| `block_id` | `uuid` FK `class_blocks` **cascade** | no | |
| `student_id` | `uuid` FK `users` **no action** | no | historial protegido (D8) |
| `status` | `block_enrollment_status` | no | default `'scheduled'` |
| `attended` | `boolean()` | sí | null/true/false (D6) |
| `notes` | `text()` | sí | |
| `created_at` / `updated_at` | `timestamp()` | no | |

Índices:
- `uniqueIndex("block_enrollments_block_student_idx").on(blockId, studentId)` → EC-06, y cubre "inscripciones por bloque" (prefijo `block_id`).
- `index("block_enrollments_student_status_idx").on(studentId, status)` → **"inscripciones por alumno"**; el filtro por fecha se resuelve con el join a `class_blocks` usando `class_blocks_course_date_idx` (no se denormaliza `block_date`, D17).
- `index("block_enrollments_student_attended_idx").on(studentId, attended)` → **agregados de asistencia** (`COUNT FILTER`).

### 1.5 Relaciones Drizzle

`weeklySlotsRelations` (course one, blocks many), `classBlocksRelations` (course one, weeklySlot one, enrollments many), `blockEnrollmentsRelations` (block one, student one). Necesarias solo si se usa `db.query.*`; las queries del diseño usan `select/join` explícito (patrón `courses.ts`), así que son opcionales pero se declaran por consistencia.

### 1.6 Verificación post-migración (obligatoria)

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'class_blocks' AND column_name IN ('block_date','start_time','max_capacity','status');
-- 4 filas esperadas. El migrador puede reportar éxito sin ejecutar (ARCHITECTURE.md).
```

---

## 2. Lógica pura (F1) — `lib/padel/class-agenda.ts`

Sin imports server-side (testeable en Jest, patrón `lib/padel/pair.ts` / `evolution.ts`).

```ts
export type WeekInfo = { weekStart: string; weekEnd: string; dates: string[]; weekNumber: number };

mondayOf(dateStr: string): string;              // normaliza cualquier YYYY-MM-DD al lunes de su semana (ISO)
buildWeekInfo(weekStartIso: string): WeekInfo;  // 7 fechas + rango + nº de semana ISO
isValidTime(hhmm: string): boolean;             // /^([01]\d|2[0-3]):[0-5]\d$/
addMinutes(time: string, minutes: number): string;
buildMaterializationPlan(
  slots: WeeklySlotRow[],            // solo isActive
  weekStart: string,
  existingKeys: string[],            // `${weeklySlotId}:${blockDate}` ya presentes
): { candidates: NewBlockCandidate[]; skippedExisting: number; skippedInactive: number };
// → si candidates.length === 0 && slots.length === 0 ⇒ caller responde 409 AGENDA_NO_SLOTS
resolveCapacityRemaining(maxCapacity: number | null, currentCount: number): number | null;
validateAssignment(input: {
  maxCapacity: number | null; currentCount: number; requested: number;
}): { ok: true } | { ok: false; code: 'AGENDA_CAPACITY'; remaining: number };
computeAttendanceAggregates(rows: Array<{ status: ClassBlockStatus; attended: boolean | null }>): {
  scheduled: number; completed: number; cancelled: number; attended: number; missed: number;
  total: number; attendanceRate: number | null;  // attended/(attended+missed), 3 decimales; null si no hay completadas
};
canEditTiming(block: { blockDate: string; status: ClassBlockStatus }, todayIso: string): boolean;
// false si blockDate < todayIso  → EC-02 (solo asistencia/estado)
agendaGroupId(blockId: string, event: 'assigned' | 'removed' | 'cancelled', studentId?: string): string;
// assigned → `block:${blockId}:assigned:${studentId}` ; cancelled → `block:${blockId}:cancelled`
formatBlockDateTime(blockDate: string, startTime: string): string;  // "lun 3 nov · 18:00" (sin Date)
```

### 2.4 Convención de fecha/hora (EC-07) — regla definitiva

1. **Persistencia**: `block_date` (`date`, sin TZ) + `start_time` (`HH:mm`, sin TZ). Representan wall-clock del club.
2. **"Hoy"**: se calcula **server-side** y se pasa como string a las queries/pure functions (`todayIso` de `lib/date-utils.ts`: `todayInChileStr()`; si el deploy define `APP_TIMEZONE`, `date-utils.ts` es el único punto a tocar — 1 archivo, sin migración).
3. **Comparaciones**: strings ISO (`YYYY-MM-DD`) comparan lexicográficamente = cronológicamente en Postgres (`date`) y en SQL. Prohibido `new Date('YYYY-MM-DD')` en cliente para decidir pasado/futuro (evita off-by-one por UTC).
4. **Cliente**: recibe `blockDate`/`startTime` ya resueltos y solo formatea (`formatBlockDateTime` no usa `Date` para el día de la semana; usa tabla de labels ISO).
5. **`dayOfWeek`**: ISO 1–7 (D4). `mondayOf()` es puro sobre el string (parse UTC), misma técnica que `getIsoDayOfWeek()`.

---

## 3. API contract-first

Convenciones heredadas (no negociables): `guardAdmin`/`guardUser` + `export const runtime = "nodejs"`, Zod `parse` → 400 `{ error: 'Datos inválidos', details }`, 401/403 de guard, **404 anti-IDOR**, 500 `{ error: 'Error interno del servidor' }`, `audit*` en mutaciones, `extractRequestContext(request)`.

Formato de error de negocio: `{ error: string, code: string }` con `code` estable (`AGENDA_NO_SLOTS`, `AGENDA_CAPACITY`, `AGENDA_STUDENT_NOT_ENROLLED`, `AGENDA_BLOCK_PAST`, `AGENDA_BLOCK_HAS_ENROLLMENTS`, `AGENDA_COURSE_ARCHIVED`).

### 3.1 DTOs

```ts
// WeeklySlotDto
{ id, courseId, dayOfWeek: 1..7, startTime: "HH:mm", durationMinutes: number,
  label: string|null, isActive: boolean }

// BlockEnrollmentDto
{ id, blockId, studentId, firstName: string|null, lastName: string|null,
  status: "scheduled"|"completed"|"cancelled", attended: boolean|null, notes: string|null }

// CourseBlockDto  (coach)
{ id, courseId, weeklySlotId: string|null, blockDate: "YYYY-MM-DD", startTime: "HH:mm",
  durationMinutes: number, status: "scheduled"|"completed"|"cancelled",
  maxCapacity: number|null, label: string|null,
  enrolledCount: number, attendedCount: number, capacityRemaining: number|null,
  isPast: boolean, canEditTiming: boolean,
  enrollments: BlockEnrollmentDto[] }   // solo en GET de detalle/bloque único

// StudentClassDto (alumno)
{ blockId, courseId, courseName, blockDate: "YYYY-MM-DD", startTime: "HH:mm",
  durationMinutes: number, label: string|null, blockStatus: "...", enrollmentStatus: "...",
  attended: boolean|null }
```

### 3.2 Endpoints coach — `guardAdmin` + ownership `courses.ownerId` (404)

Base: `app/api/courses/[id]/agenda/…`. Cada handler: `guardAdmin` → `getCourseById(session.user.id, id)` → null = **404** (`Curso no encontrado`) → si `course.status === 'archived'` y la operación escribe ⇒ **409 `AGENDA_COURSE_ARCHIVED`** (EC-13).

| # | Método + ruta | Body / Query | 2xx | Errores de negocio | Auditoría |
|---|---|---|---|---|---|
| A1 | `GET /api/courses/[id]/agenda/slots` | — | `200 { items: WeeklySlotDto[] }` | 404 | — |
| A2 | `POST /api/courses/[id]/agenda/slots` | `{ dayOfWeek 1-7, startTime HH:mm, durationMinutes 15-180, label? max100, isActive? }` | `201 { slot }` | 400, 404, **409 `AGENDA_SLOT_DUPLICATE`** (UNIQUE) | `auditCreate('weekly_slot', id, …)` |
| A3 | `PUT /api/courses/[id]/agenda/slots/[slotId]` | igual a A2, todos opcionales (≥1) | `200 { slot }` | 400, 404, 409 dup | `auditUpdate` |
| A4 | `DELETE /api/courses/[id]/agenda/slots/[slotId]` | — | `200 { deleted: true, detachedBlocks: n }` | 404 | `auditDelete` |
| A5 | `POST /api/courses/[id]/agenda/weeks` | `{ weekStart?: "YYYY-MM-DD" }` (default = lunes de la semana actual) | `200 { weekStart, weekEnd, created: n, skipped: n, blocks: CourseBlockDto[] }` | 400 (fecha inválida), 404, **409 `AGENDA_NO_SLOTS`** (sin slots activos, sin escritura) | `auditCreate('class_block_week', weekStart, …)` |
| A6 | `GET /api/courses/[id]/agenda/blocks?from=&to=` | `from`/`to` `YYYY-MM-DD` (default = semana actual, máximo 8 semanas) | `200 { blocks: CourseBlockDto[] }` (agrupables por día en cliente) | 400, 404 | — |
| A7 | `POST /api/courses/[id]/agenda/blocks` | `{ blockDate, startTime, durationMinutes, label?, maxCapacity?, weeklySlotId? }` | `201 { block }` | 400, 404, 409 dup si slot+fecha ya existe | `auditCreate('class_block', …)` |
| A8 | `PUT /api/courses/[id]/agenda/blocks/[blockId]` | `{ blockDate?, startTime?, durationMinutes?, label?, maxCapacity?, status? }` | `200 { block, notified: n }` | 400, 404, **409 `AGENDA_BLOCK_PAST`** si cambia horario de un bloque pasado (EC-02); 409 `AGENDA_BLOCK_CANCELLED` si se edita un cancelado | `auditUpdate('class_block', …)`; `status='cancelled'` ⇒ `auditUpdate` + notifica |
| A9 | `DELETE /api/courses/[id]/agenda/blocks/[blockId]` | — | `200 { deleted: true }` | 404; **409 `AGENDA_BLOCK_HAS_ENROLLMENTS`** si tiene inscripciones (usar cancelación) | `auditDelete` |
| A10 | `POST /api/courses/[id]/agenda/blocks/[blockId]/enrollments` | `{ studentIds: string[1..50] }` | `201 { assigned: string[], alreadyAssigned: string[], enrolledCount, notified: n }` | 400 `AGENDA_STUDENT_NOT_ENROLLED` (alumno fuera de `course_enrollments`), 400 (uuid inválido), 404 (bloque/curso ajeno), **409 `AGENDA_CAPACITY`** (all-or-nothing, D10), 409 `AGENDA_BLOCK_CANCELLED` | `auditCreate('block_enrollment', blockId, …)` (1 log con `studentIds`) |
| A11 | `PUT /api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]` | `{ attended: boolean|null, notes?: string|null max 500 }` | `200 { enrollment, block }` | 400, 404, 409 `AGENDA_BLOCK_CANCELLED` | `auditUpdate('block_enrollment', …)` |
| A12 | `DELETE /api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]` | — | `200 { removed: true }` | 400, 404 | `auditDelete` |

**Reglas transversales**
- **Cancelar bloque** = `PUT` con `status:'cancelled'` (no hay endpoint aparte): dentro de una tx actualiza `class_blocks.status='cancelled'` + `block_enrollments.status='cancelled'` (EC-05), y post-commit notifica `class.cancelled` a cada alumno inscrito (dedup `block:{id}:cancelled`).
- **Completar bloque** = `PUT` con `status:'completed'`.
- **Asistencia**: solo cambia `block_enrollments.attended`/`notes`; si `attended` se marca true/false, el `status` de la enrollment pasa a `completed`.
- **EC-11** (alumno removido del curso con bloques futuros): `removeStudentFromCourse` (G12) **no** se modifica en v1; las asignaciones se quedan, pero el alumno deja de recibir el bloque en `/api/student/agenda` porque la query hace `INNER JOIN course_enrollments`. Se documenta como comportamiento: *no se notifica baja de curso, no se cancelan bloques* (riesgo aceptado, ver §9). Alternativa (cancelar en lote) descartada por scope: >1 archivo extra y notificación masiva no pedida.
- **EC-08** (solapes): permitidos. No se valida ni en DB ni en API; la UI muestra badge "solapa" (no bloqueante).

### 3.3 Endpoints alumno — `guardUser` (ACTIVE; TEMPORARY/LOCKED → 403)

Solo lectura, **sin** escritura (v1 read-only, §0 release-scope).

| # | Método + ruta | Query | Respuesta |
|---|---|---|---|
| U1 | `GET /api/student/agenda` | `?courseId=&limit=1..50` (default 5) | `200 { upcoming: StudentClassDto[], aggregates: AttendanceAggregates, todayIso: "YYYY-MM-DD" }` — `upcoming` = `status='scheduled' AND block_date >= todayIso` intersectado con `course_enrollments(studentId)`, orden `block_date ASC, start_time ASC`. `courseId` ausente = todos los cursos del alumno; `courseId` **no inscrito ⇒ 404**. |
| U2 | `GET /api/student/agenda/history` | `?courseId=&limit=&cursor=` | `200 { items: StudentClassDto[], nextCursor: "YYYY-MM-DDTHH:mm"\|null }` — pasadas (`block_date < todayIso` **o** `status<>'scheduled'`), orden `block_date DESC, start_time DESC`. Cursor G15 sobre `(block_date,start_time)` comparados como string concatenado (documentado; mismo patrón `limit+1` de `pagination.ts`). `aggregates` se agrega a U1, no a U2 (una sola fuente de contadores). |

`AttendanceAggregates`:
```ts
{ scheduled: number; completed: number; cancelled: number; attended: number; missed: number;
  total: number;                     // filas consideradas (todas las asignaciones del alumno)
  attendanceRate: number | null }    // attended / (attended + missed), 3 decimales; null si 0
```

Anti-IDOR: `INNER JOIN course_enrollments ON courseId AND studentId = session.id` → el alumno nunca ve bloques de cursos donde no está. Sin `ownerId`: el scoping es por inscripción.

### 3.4 Archivos de contrato (docs)

- `lib/api-docs/paths/class-agenda.ts` — tags `Padel Agenda` (coach) y `Padel Student Agenda`; 14 operaciones.
- `lib/api-docs/schemas/class-agenda.ts` — `WeeklySlotDto`, `WeeklySlotInput`, `CourseBlockDto`, `BlockEnrollmentDto`, `StudentClassDto`, `AttendanceAggregates`, `MaterializeWeekResult`, `AgendaError`.
- Registro en `lib/api-docs/spec.ts` (imports `classAgendaPaths`, `classAgendaSchemas`, tags) — **gate `--api-docs`**.
- `lib/auth/protected-routes.ts` — 14 entradas con `guard`, `allowedStatuses: ['ACTIVE']`, `roles`, `antiIdor: 'course.ownerId → 404'` / `'course_enrollments → 404'`, `audit`.

### 3.5 Retrocompatibilidad

- 0 cambios en endpoints existentes. `GET /api/courses/[id]`, `/api/dashboard/student`, `/api/history` intactos.
- Nuevo segmento `agenda` bajo `[id]`: no colisiona (hoy solo `/rubrics` y `/students`).
- `courses.schedule` sigue devolviéndose igual (legacy display). Sin deprecaciones.

---

## 4. Notificaciones (F3)

`lib/notifications/engine.ts`: inbox-first, dedup por `(userId, groupId)` ventana **1 h** (D12). `engine` **no** envía push ⇒ orquestador nuevo.

### 4.1 `lib/notifications/agenda.ts` (nuevo, ~90 líneas)

```ts
export type AgendaEvent = 'assigned' | 'removed' | 'cancelled';

export async function notifyClassEvent(params: {
  event: AgendaEvent;
  studentId: string;
  blockId: string;
  courseName: string;
  blockDate: string; startTime: string; label: string | null;
  deadlineMins?: never;
}): Promise<{ inboxCreated: boolean; pushSent: number }>
```

Implementación:
1. `const copy = AGENDA_NOTIFICATION_COPY[event]` (título/body/priority/type/ctaUrl) → P1 `warning` para `cancelled`, P2 `info` para `assigned`, P3 `info` para `removed`.
2. `await createNotification({ userId, type, priority, category: 'system', groupId: agendaGroupId(...), title, body, ctaUrl, ctaLabel, metadata: { blockId } })` → `null` = duplicado (no push).
3. Push: `getNotificationPreferences(studentId)` → si `channel='push', category='system', enabled=false` ⇒ skip; si inbox duplicado ⇒ skip. Luego `const subs = await getActiveSubscriptions(studentId)` y `sendBulkPushTracked(subs, { title, body, url: ctaUrl })` **dentro de `try/catch`** (nunca propaga).
4. CTA: `assigned` → `/dashboard#proximas-clases` (deep-link del mockup #9); `cancelled`/`removed` → `/cursos` (o `/student/courses/{id}` si el deep-link se habilita en F5).

### 4.2 Copy

| Evento | type / priority | title | body | cta |
|---|---|---|---|---|
| `assigned` | `info` / P2 | `Nueva clase agendada` | `{Curso} · {lun 3 nov · 18:00}` | `Ver mi clase` → `/dashboard#proximas-clases` |
| `removed` | `info` / P3 | `Ya no estás en esta clase` | `Saliste de la clase del {lun 3 nov · 18:00}` | sin CTA |
| `cancelled` | `warning` / P1 | `Clase cancelada` | `El coach canceló la clase del {lun 3 nov · 18:00}` | `Ver detalle` |

### 4.3 Invocación

Post-commit **siempre** (nunca dentro de la tx): `Promise.allSettled(students.map(id => notifyClassEvent(...)))`. Si lanza, se loguea con `console.error('[agenda] notify failed')` y la respuesta 2xx se mantiene (AC-05).

`groupId` (D12):
- assigned: `block:{blockId}:assigned:{studentId}`
- removed: `block:{blockId}:removed:{studentId}`
- cancelled: `block:{blockId}:cancelled`

No se toca `lib/notifications/priority.ts` (P1–P3 ya cubren), ni `engine.ts`, ni `triggers.ts` **excepto** añadir los 3 `triggerClass*` finos si @app-engineer prefiere exponerlos (opcional; el orquestador puede llamar `createNotification` directo). **Decisión: no se añaden a `triggers.ts`** (evita duplicar copy en dos sitios).

---

## 5. UI (F4/F5) — Paquete A

### 5.1 Archivos

| Archivo | Tipo | Detalle |
|---|---|---|
| `components/padel/agenda-week-list.tsx` | ✨ client | Tab Agenda coach: `WeekPicker` (‹ Sem N · rango ›, sin DatePicker), agrupación por día (`<h3>` + lista semántica), estados loading (`aria-busy`) / error (`role="alert"` + Reintentar) / semana no habilitada / día sin clases. Consume `GET blocks` + `POST weeks`. ≤260 líneas. |
| `components/padel/weekly-slot-manager.tsx` | ✨ client | Panel "Plantilla semanal": lista de slots + `Switch` activo + crear/editar/borrar (Dialog). Consume A1–A4. ≤180 líneas. |
| `components/padel/enable-week-dialog.tsx` | ✨ client | Dialog de confirmación con preview de bloques a crear + copy de idempotencia + resultado `"2 creados · 0 omitidos"`. Consume A5. ≤120 líneas. |
| `components/padel/block-assignment-sheet.tsx` | ✨ client | Sheet del bloque: ocupación `n/max`, asignados con asistencia de 3 estados (`aria-pressed`, texto Sí/No/Sin marcar), disponibles del curso con búsqueda, marcar completada, cancelar (`AlertDialog` con consecuencia). Consume A8, A10–A12 + `GET /api/courses/[id]` (alumnos). ≤300 líneas → **split interno** con `block-enrollment-row.tsx` si excede. |
| `components/padel/block-enrollment-row.tsx` | ✨ client | Fila de asignado (nombre + 3 botones de asistencia + nota). ≤80 líneas. |
| `components/padel/upcoming-classes-card.tsx` | ✨ client | "Próximas clases" del alumno, ancla `id="proximas-clases"`, resaltado `ring-primary/40` si `?highlight=blockId`, empty state "¿Esperabas una clase?". Consume U1. ≤140 líneas. |
| `components/padel/student-course-agenda.tsx` | ✨ client | Historial + agregados (3 métricas) en el detalle de curso del alumno, patrón visual `history-list` + "Cargar más" (cursor). Consume U1 (`courseId`) + U2. ≤180 líneas. |
| `hooks/use-class-agenda.ts` | ✨ client | Fetch + mutaciones (crear/editar/borrar/ materializar/asignar/asistencia) con `toast` Sonner y `router.refresh()`; reutilizable por los 4 componentes coach. ≤180 líneas. |
| `components/padel/course-detail.tsx` | MOD | 3er `TabsTrigger value="agenda"` → monta `AgendaWeekList` (mockup #1); `defaultValue` sigue en `students`. +15 líneas (249 → ~264). |
| `components/padel/student-dashboard.tsx` | MOD | Inserta `UpcomingClassesCard` entre hero y "Tu nivel" (mockup #6). +6 líneas. |
| `components/padel/student-course-detail.tsx` | MOD | Sección "Mis clases" con `StudentCourseAgenda` (mockup #7). +10 líneas (169 → ~179). |
| `app/(app)/cursos/[id]/page.tsx` | SIN CAMBIO | Sigue siendo client page que monta `CourseDetail`; la agenda va dentro del tab (no fetch extra en page). |
| `components/preview/class-agenda.tsx` | **BORRAR** al cerrar F5 | efímero (mockup-spec §7.8) |
| `app/preview/class-agenda/page.tsx` | **BORRAR** si existe | efímero |

Reglas de UI (obligatorias): solo tokens (`bg-card`, `text-muted-foreground`, `border-destructive/40`, `bg-accent`, `ring-primary/50`), cero colores hardcodeados, 375 px sin scroll horizontal, targets ≥44 px, `EmptyState` existente, `NotificationBadge` reutilizado (no nueva UI de inbox), **ningún ítem nuevo en `bottom-nav`**.

### 5.2 Datos en UI

Todo viene ya resuelto del server (`blockDate`, `startTime`, `attendanceRate`, `capacityRemaining`, `canEditTiming`). La UI no calcula fechas ni capacidad.

---

## 6. Impacto por capa

| Capa | Impacto | Archivos |
|---|---|---|
| **DB** | Alto: 3 tablas + 2 enums + 6 índices, migración `0013_*` | `lib/db/schema.ts`, `drizzle/0013_*.sql` + snapshot/journal |
| **Queries** | Alto: nuevo módulo + barrel | `lib/db/queries/padel/class-agenda.ts` ✨, `lib/db/queries/padel/index.ts` (1 línea) |
| **Lógica pura** | Medio: materialización, capacidad, agregados, groupId | `lib/padel/class-agenda.ts` ✨ |
| **Validaciones** | Medio: ~11 schemas Zod | `lib/validations/class-agenda.ts` ✨ |
| **Auth** | Bajo: sin cambios en `auth.ts`/JWT. Solo `guardAdmin`/`guardUser` + ownership + doc | `lib/auth/protected-routes.ts` (14 entradas) |
| **API** | Alto: 9 route handlers / 14 endpoints | `app/api/courses/[id]/agenda/**` (7 archivos), `app/api/student/agenda/route.ts`, `app/api/student/agenda/history/route.ts` |
| **Notificaciones** | Medio: orquestador + push cableado | `lib/notifications/agenda.ts` ✨ |
| **Auditoría** | Bajo: helpers genéricos existentes | `lib/audit/helpers.ts` (sin cambios; se usan `auditCreate/Update/Delete`) |
| **UI** | Alto: 7 componentes nuevos + 3 modificados + 1 hook | ver §5.1 |
| **API docs** | Medio | `lib/api-docs/paths/class-agenda.ts` ✨, `lib/api-docs/schemas/class-agenda.ts` ✨, `lib/api-docs/spec.ts` (MOD) |
| **Env vars** | **Ninguna nueva** | `.env.example` sin cambios (D13) |
| **Cron** | Ninguno en v1 (standby) | nada |

---

## 7. Recordatorio automático — STANDBY (NO implementar en v1)

**Verificado en este repo**: **no existe `vercel.json`** y `.github/workflows/` solo contiene `ci.yml`. `CRON_SECRET` **ya está** en `.env.example` (línea 41). Por tanto la activación no requiere variables nuevas.

### 7.1 Plan de activación (cuando @pm lo autorice)

| Paso | Archivo | Contenido |
|---|---|---|
| 1 | `.github/workflows/cron-external.yml` ✨ | `on: { schedule: [{ cron: '*/30 * * * *' }], workflow_dispatch: {} }`; job `curl -fsS -X POST "$PROD_URL/api/cron/class-reminders" -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"` con `PROD_URL` desde `secrets`/`vars`. Timeout 30 s, `--retry 2`. |
| 2 | `app/api/cron/class-reminders/route.ts` ✨ | `GET` + `POST` (mismo handler). Auth: `Authorization: Bearer ${process.env.CRON_SECRET}` (comparación `timingSafeEqual`); sin secreto configurado ⇒ **503** (fail-closed); token inválido ⇒ **401**. `export const runtime = "nodejs"`, `dynamic = 'force-dynamic'`. |
| 3 | `vercel.json` (opcional) | `{ "crons": [] }` explícito para documentar que el scheduling **no** vive en Vercel (patrón StreetMove). No es requisito del endpoint. |
| 4 | `lib/notifications/agenda.ts` | añadir `notifyClassReminder(...)` reutilizando el orquestador. |
| 5 | `drizzle/00XX_*.sql` | añadir columna `class_blocks.reminder_sent_at timestamp NULL` **solo si** se elige idempotencia persistida (en lugar de dedup por `groupId = block:{id}:reminder:24h`). En v1 **no** se crea la columna. |

### 7.2 Contrato del endpoint futuro

```
GET|POST /api/cron/class-reminders
Auth: Bearer CRON_SECRET  (401 token inválido · 503 secreto no configurado)
Ventana: bloques con status='scheduled' y (block_date + start_time) dentro de las próximas 24 h
         (comparación con date/time strings del servidor, sin timestamptz)
Efecto: notifyClassEvent('reminder', blockId, studentId) → inbox + push
Idempotencia: groupId = `block:{blockId}:reminder` (dedup 1 h del engine ⇒ ajustar a ventana
              del cron o usar reminder_sent_at; decisión al activar)
Respuesta: 200 { scanned: n, notified: m, skipped: k }
```

**Prohibido en v1**: crear el workflow, el endpoint, la columna `reminder_sent_at` o cualquier `vercel.json`. El inbox/push inmediato **no** depende de este mecanismo (EC-12).

---

## 8. Tests (mapeo AC → test)

| AC | Unit (Jest) | API (Playwright, SQL real) | E2E |
|---|---|---|---|
| AC-01 | `tests/unit/validations/class-agenda.test.ts` (dayOfWeek 1–7, HH:mm, 15–180, campos extra) | `class-agenda-guard.spec.ts` (401/403/404 slot de curso ajeno) | — |
| AC-02 | `tests/unit/padel/class-agenda.test.ts` → `buildMaterializationPlan` (idempotencia, EC-01/EC-09), `mondayOf`/`buildWeekInfo` (frontera de semana y de año) | `class-agenda-happy.spec.ts` → POST weeks 2× (`created` luego `0 created / n skipped`) | `tests/e2e/class-agenda.spec.ts` → coach "Habilitar semana" |
| AC-03 | `validateAssignment` (null, exacto, 1 de más), `resolveCapacityRemaining` | happy: asignar inscrito 201; no inscrito 400; cupo 409 sin escritura | coach asigna 2 alumnos en el sheet |
| AC-04 | `canEditTiming`, agregados con `attended` tri-estado | happy: PUT attendance (`true`/`false`/`null`) + `audit_logs` row; PUT status completed | marcar asistencia |
| AC-05 | `agendaGroupId` determinista + 3 eventos (strings estables) | happy: 2 POST iguales ⇒ 1 notificación inbox (`GET /api/user/notifications`); push stub no rompe la mutación | notificación visible en dashboard |
| AC-06 | `computeAttendanceAggregates` (rate 0, 1, null, redondeo) | happy: U1 próximas + agregados; U2 paginación cursor; alumno ajeno → 404 | alumno ve "Próximas clases" en 375 px |
| AC-07 | — | — | `tests/e2e/class-agenda.spec.ts` viewport 375, empty state |
| AC-08 | cobertura `lib/padel/class-agenda.ts` ≥95 % | ≥1 happy por endpoint nuevo (14) y guards por grupo | 1 E2E coach + 1 E2E alumno (mismo archivo, 2 `test()`) |
| AC-09 | — | happy: `audit_logs` tiene `weekly_slot`/`class_block`/`block_enrollment` tras las mutaciones | — |

Comandos: `pnpm run test:unit`, `npx playwright test tests/api/padel/class-agenda-guard.spec.ts tests/api/padel/class-agenda-happy.spec.ts`, `npx playwright test tests/e2e/class-agenda.spec.ts`.

Lógica pura exigida (para no tumbar `--coverage`): **todo** el cálculo de semana, capacidad, agregados y `groupId` vive en `lib/padel/class-agenda.ts` (sin DB) y se testea en Jest.

---

## 9. Riesgos aceptados y deltas sobre los artifacts previos

| # | Delta / riesgo | Mitigación |
|---|---|---|
| 1 | **`dayOfWeek` 1–7 en vez de 0–6** (AC-01, spec §3) | Reutiliza `getIsoDayOfWeek` + labels `Lun…Dom` existentes (D4). Requiere ack de @pm. |
| 2 | **Dedup 1 h en vez de 24 h** (AC-05) | Es la ventana real del engine; no se modifica el motor (riesgo de regresión global). Suficiente para doble click/reintento. |
| 3 | **EC-11 sin efecto completo**: remover alumno del curso no cancela bloques futuros | El alumno deja de verlos (join con `course_enrollments`) y no se notifica masivamente. Documentado; iteración futura. |
| 4 | **Zod en archivo propio** en vez de `padel.ts` (spec §10) | Evita `padel.ts` >420 líneas (D16). |
| 5 | **`maxCapacity` en 409 batch** podría confundir | Mensaje con `code` + `remaining`; la UI deshabilita filas a tope (mockup #4). |
| 6 | **Cross-Agent Review**: >5 archivos y contratos nuevos | Se declara en `change-map.md`; chunks ≤5 archivos por invocación. |
| 7 | **Timezone**: si el club no está en la TZ de `date-utils.ts` | Punto único de cambio: `lib/date-utils.ts`/`APP_TIMEZONE`. Unit tests de frontera de día cubren. |

---

## 10. Changelog de versioning

| Archivo | Versión | Fecha | Autor | Cambio |
|---|---|---|---|---|
| `feature-spec.md` | v1 | 2026-11-04 | @pm | creación |
| `release-scope.md` | v1 | 2026-11-04 | @pm | creación |
| `design-exploration.md` / `ui-kit-audit.md` / `mockup-spec.md` | v1 | 2026-11-04 | @ui-designer | creación, paquete A |
| `technical-design.md` | **v1** | 2026-11-04 | @architect | creación (D1–D16, 14 endpoints, cron standby) |
| `change-map.md` | **v1** | 2026-11-04 | @architect | creación (10 chunks ≤5 archivos) |
| `db-plan.md` / `migration-notes.md` | v1 | — | @db-engineer | pendiente F0 |
| `app-notes.md` / `auth-impact.md` / `security-checklist.md` | v1 | — | @app-engineer / @auth-security | pendiente F2–F5 |
| `release-report.md` / `test-matrix.md` / `evidence-manifest.json` | v1 | — | @qa-release | pendiente F6 |

Regla: v1 **no se sobrescribe**. Si cambian contratos ya consumidos por UI o tests → `technical-design-v2.md` + nota en `change-map-v2.md`.
