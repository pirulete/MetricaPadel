# Technical Design v2 — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · module: `padel`
> date: `2026-11-04` · autor: @architect
> **Reemplaza a** `technical-design.md` v1 (v1 queda intacto, no se sobrescribe).
> Origen de la revisión: `design-review.md` (@app-engineer) — 3 bloqueantes + 11 ajustes + 15 confirmaciones.
> **Regla de versioning (definida aquí, §11)**: `technical-design-vN.md` sube N cuando cambia un **contrato** (endpoint, DTO, schema, decisión ya comunicada a otro agente) o el **plan de chunks**. Correcciones editoriales (typos, formato, redacción) se editan in-place y se anotan en el changelog. Esta revisión cambia 3 contratos (`groupId`, cursor U2, helper de ownership) ⇒ **v2**. `change-map-vN.md` avanza en lockstep y solo si cambian archivos/chunks/orden.

---

## 0. Resumen de decisiones (D1–D20)

Se mantienen D1, D2, D5–D11, D14–D16 de v1. Las filas marcadas **✏️** son correcciones de esta revisión.

| # | Decisión | Justificación |
|---|---|---|
| **D1** | 3 tablas nuevas, cero migración de datos | Aditivo puro. `courses.schedule` queda como display legacy. |
| **D2** | Enums PG lowercase (`class_block_status`, `block_enrollment_status`) | Convención del repo (todos los `pgEnum` son lowercase). |
| **D3 ✏️** | Fecha/hora = **wall-clock sin TZ**: `block_date date` + `start_time varchar(5)` (`HH:mm`) | **Rationale corregida (A1)**: NO es "patrón verificado en el repo". `lib/date-utils.ts` **hardcodea `America/Santiago`** y **no lee `APP_TIMEZONE`**; no tiene callers (código muerto importado de StreetMove). Es la **primera adopción** de fecha de dominio wall-clock. Ver D18 y §2.5. |
| **D4 ✏️** | `weekly_slots.day_of_week` = **ISO 1–7 (lun=1 … dom=7)** | **Rationale corregida (A3)**: `getIsoDayOfWeek()` existe pero **no tiene callers**; `DAY_OPTIONS` (`create-course-modal.tsx:23`) son **labels** en `courses.days` (jsonb), no enteros. No hay convención entera previa que respetar. Se elige ISO 1–7 por corrección semántica y para mapear `label → index+1` en la UI. **Requiere ack de @pm para reescribir AC-01.** |
| **D5** | `max_capacity integer NULL` = sin tope | Capacidad se evalúa dentro de la tx de asignación. |
| **D6** | `attended boolean NULL` (tri-estado) + `notes text NULL` | Convención booleana del repo. |
| **D7** | Idempotencia por **UNIQUE parcial** `(weekly_slot_id, block_date) WHERE weekly_slot_id IS NOT NULL` + `onConflictDoNothing()` | Resuelve EC-01. Bloques sueltos (`weekly_slot_id NULL`) no colisionan. |
| **D8** | `class_blocks.course_id` cascade · `weekly_slot_id` set null · `block_enrollments.student_id` no action | EC-10 + historial protegido. |
| **D9** | Ownership = `courses.ownerId` para **todos** (ADMIN y SUPER_ADMIN) | Recurso ajeno ⇒ 404, nunca 403. |
| **D10** | Asignación **all-or-nothing** (tx: validar todo → insertar → notificar post-commit) | AC-03/EC-04 "409 sin escritura". |
| **D11** | Orquestador propio `lib/notifications/agenda.ts` (inbox + push) | `engine.ts` **no envía push** (`engine.ts:6`); el orquestador respeta `notification_preferences` y es fire-and-forget. |
| **D12 ✏️** | Dedup por `groupId` **UUID determinista v5** por evento; ventana real del engine = **1 h** | **Corregido (B1)**: `notifications.group_id` es **`uuid`** (`schema.ts:294`, `drizzle/0003_*.sql:24`) ⇒ los strings `block:{id}:assigned:{id}` daban **500**. Ver §4.3 para el rediseño exacto. La ventana de dedup es **1 h** (`queries/notifications.ts:160`), no 24 h (confirmado C3). |
| **D13** | **Sin variables de entorno nuevas** | `CRON_SECRET` y `APP_TIMEZONE` ya están en `.env.example`. `APP_TIMEZONE` **sí** pasa a gobernar las fechas de agenda (D18). |
| **D14** | Cron **STANDBY** | No existe `vercel.json`; workflows solo `ci.yml`. |
| **D15** | UI = Paquete A "embebido ligero" | Cero rutas nuevas; 375 px sin scroll horizontal. |
| **D16** | Zod en `lib/validations/class-agenda.ts` | `padel.ts` = 273 líneas. Precedente `lib/validations/notifications.ts`. |
| **D17** | **No denormalizar `block_date`/`student_id` en `block_enrollments`** | Cierra la referencia colgante de v1 §1.4: el filtro por fecha se resuelve por join a `class_blocks`. |
| **D18 ✏️** | **`lib/date-utils.ts` queda INTACTO y fuera de alcance**. "Hoy" se calcula con `todayInTimeZone(tz, now)` propio en `lib/padel/class-agenda.ts`, con `tz = process.env.APP_TIMEZONE ?? 'UTC'` resuelto en el route handler | Ver §2.5. `date-utils.ts` es código muerto **y** está mal (hardcodea Chile). No se borra en este change (decisión razonada, no omisión): borrarlo toca el blueprint whitelabel (`blueprint/config-mapping.md`) y no es necesario para shippear. **Explícitamente out-of-scope**: @ponytail NO debe borrarlo. |
| **D19 ✏️** | `agendaGroupId()` vive en **`lib/padel/agenda-group-id.ts`** (Node-only: `node:crypto`), NO en `lib/padel/class-agenda.ts` | Mantiene `class-agenda.ts` **client-safe** (cero `node:`/`process.env`) para que `formatBlockDateTime`/`isValidTime` puedan importarse desde componentes sin romper el bundle. |
| **D20 ✏️** | **`getCourseOwned(ownerId, id)`** nuevo en `lib/db/queries/padel/courses.ts` para los 12 handlers de coach | **Corregido (B3)**: `getCourseById` devuelve `CourseDetail` (`{course, students, rubrics}`, 3 queries) y `detail.status` sería `undefined` ⇒ EC-13 nunca daba 409. `getCourseById` **no se toca** (sigue sirviendo P07). |

---

## 1. Modelo de datos (sin cambios respecto a v1 §1)

Migración `drizzle/0013_*.sql` vía `pnpm run db:generate`. Columnas idénticas a v1 §1.2–§1.4; se listan para que @db-engineer no dependa de v1:

| Tabla | Columnas |
|---|---|
| `weekly_slots` | `id` uuid pk · `course_id` uuid → courses **cascade** · `day_of_week` integer (1–7) · `start_time` varchar(5) · `duration_minutes` integer default 60 · `label` varchar(100) null · `is_active` boolean default true · timestamps |
| `class_blocks` | `id` uuid pk · `course_id` uuid → courses **cascade** · `weekly_slot_id` uuid → weekly_slots **set null** · `block_date` **`date({ mode: 'string' })`** · `start_time` varchar(5) · `duration_minutes` integer · `status` `class_block_status` default `scheduled` · `max_capacity` integer null · `label` varchar(100) null · timestamps |
| `block_enrollments` | `id` uuid pk · `block_id` uuid → class_blocks **cascade** · `student_id` uuid → users **no action** · `status` `block_enrollment_status` default `scheduled` · `attended` boolean null · `notes` text null · timestamps |

Índices (8): `weekly_slots_course_day_time_idx` UNIQUE, `weekly_slots_course_active_idx`, `class_blocks_slot_date_idx` UNIQUE **parcial** (`WHERE "weekly_slot_id" is not null`), `class_blocks_course_date_idx`, `class_blocks_date_status_idx`, `block_enrollments_block_student_idx` UNIQUE, `block_enrollments_student_status_idx`, `block_enrollments_student_attended_idx`.

**A2 — primera columna `date` del repo**: `grep 'date(' lib/db/schema.ts` = 0 columnas `date` (todo es `timestamp`). Es convención **nueva**, se documenta en `ARCHITECTURE.md` (C13). Deja de citarse `courses.days` como precedente (`jsonb` de labels, `schema.ts:464`).

**Verificación post-migración (obligatoria)**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'class_blocks' AND column_name IN ('block_date','start_time','max_capacity','status');
-- 4 filas esperadas
```

---

## 2. Lógica pura (`lib/padel/class-agenda.ts` + `lib/padel/agenda-group-id.ts`)

`class-agenda.ts`: **cero imports server-side** (`Date`/`Intl` nativos; sin `node:`, sin `process.env`) → importable desde cliente y Jest.
`agenda-group-id.ts`: `node:crypto` (Node-only, sin DB) → solo lo importa `lib/notifications/agenda.ts`.

```ts
// lib/padel/class-agenda.ts  (D19: client-safe)
export type WeekInfo = { weekStart: string; weekEnd: string; dates: string[]; weekNumber: number };

mondayOf(dateStr: string): string;                 // normaliza a lunes ISO 1..7
buildWeekInfo(weekStartIso: string): WeekInfo;
isValidDateStr(s: string): boolean;                // calendario real (rechaza 2026-02-30)
isValidTime(hhmm: string): boolean;                // /^([01]\d|2[0-3]):[0-5]\d$/
addMinutes(time: string, minutes: number): string;
buildMaterializationPlan(slots, weekStart, existingKeys): {...};
resolveCapacityRemaining(maxCapacity, currentCount): number | null;
validateAssignment(input): { ok: true } | { ok: false; code: 'AGENDA_CAPACITY'; remaining: number };
computeAttendanceAggregates(rows): {...};           // attendanceRate 3 decimales, null si attended+missed = 0
canEditTiming(block, todayIso): boolean;           // false si blockDate < todayIso (EC-02)
todayInTimeZone(timeZone: string, now: Date): string;  // 'YYYY-MM-DD' (D18); RangeError ⇒ fallback UTC
formatBlockDateTime(blockDate, startTime): string; // "lun 3 nov · 18:00" (sin Date para el día)
```

```ts
// lib/padel/agenda-group-id.ts  (D12/D19: Node-only, determinista, sin DB)
import { createHash } from 'node:crypto';

const NAMESPACE = 'padel-evaluation/class-agenda/v1';

export type AgendaEvent = 'assigned' | 'removed' | 'cancelled';

/** Clave legible del evento (va en metadata.eventKey para trazabilidad). */
export function agendaEventKey(blockId: string, event: AgendaEvent, studentId?: string): string {
  if (event === 'cancelled') return `cancelled:${blockId}`;
  if (!studentId) throw new TypeError(`agendaEventKey: studentId requerido para "${event}"`);
  return `${event}:${blockId}:${studentId}`;
}

/** UUID v5 determinista (SHA-1 sobre `${NAMESPACE}/${eventKey}`). Mismo input ⇒ mismo uuid. */
export function agendaGroupId(blockId: string, event: AgendaEvent, studentId?: string): string {
  const digest = createHash('sha1').update(`${NAMESPACE}/${agendaEventKey(blockId, event, studentId)}`).digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;   // versión 5
  b[8] = (b[8] & 0x3f) | 0x80;   // variante RFC 4122
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
```

### 2.5 "Hoy" y timezone (D3 + D18) — regla definitiva

1. **Persistencia**: `block_date` (`date`, sin TZ) + `start_time` (`HH:mm`). Wall-clock del club.
2. **"Hoy"**: `const todayIso = todayInTimeZone(process.env.APP_TIMEZONE ?? 'UTC', new Date())` **en el route handler** (no en el módulo puro, que no lee env). `Intl.DateTimeFormat` con `formatToParts`; si la TZ es inválida (`RangeError`) ⇒ fallback `'UTC'`.
3. **Comparaciones**: strings `YYYY-MM-DD` comparan lexicográficamente = cronológicamente (Postgres `date` y JS). Prohibido `new Date('YYYY-MM-DD')` en cliente.
4. **`lib/date-utils.ts`: NO se importa, NO se modifica, NO se borra** (D18, out-of-scope explícito).
5. **`dayOfWeek`**: ISO 1–7. La UI mapea `label → index+1`; `getIsoDayOfWeek` no se usa.

---

## 3. API contract-first (corregido)

Convenciones heredadas: `guardAdmin`/`guardUser` + `export const runtime = "nodejs"`; Zod `parse` → 400 `{ error: 'Datos inválidos', details }`; 401/403 de guard; **404 anti-IDOR**; 500 genérico; `audit*` en mutaciones post-commit.

Formato de error de negocio: `{ error: string, code: string }` — `AGENDA_NO_SLOTS`, `AGENDA_CAPACITY`, `AGENDA_STUDENT_NOT_ENROLLED`, `AGENDA_BLOCK_PAST`, `AGENDA_BLOCK_HAS_ENROLLMENTS`, `AGENDA_BLOCK_CANCELLED`, `AGENDA_SLOT_DUPLICATE`, `AGENDA_COURSE_ARCHIVED`.

### 3.2 Endpoints coach — patrón de handler **corregido (B3)**

```ts
// patrón obligatorio, literal, en los 9 route handlers de coach:
const session = await guardAdmin(); if (session) return session;            // 401/403
const course = await getCourseOwned(session.user.id, id);                    // 1 query, courses.ownerId
if (!course) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
if (course.status === 'archived' && MUTATES) {
  return NextResponse.json({ error: 'El curso está archivado', code: 'AGENDA_COURSE_ARCHIVED' }, { status: 409 });
}
// toda query de bloque/slot recibe además courseId = course.id  ⇒ bloque de otro curso = 404
```

`getCourseOwned` (nuevo, `lib/db/queries/padel/courses.ts`, ~10 líneas):
```ts
export async function getCourseOwned(ownerId: string, id: string) {
  const [row] = await db.select().from(courses)
    .where(and(eq(courses.id, id), eq(courses.ownerId, ownerId)))
    .limit(1);
  return row ?? null;   // typeof courses.$inferSelect | null — incluye `status`
}
```
`getCourseById` **no se modifica** (sigue devolviendo `CourseDetail` para P07). **Prohibido** leer `course.status` sobre `CourseDetail`.

Endpoints A1–A12: **idénticos a v1 §3.2** (método, ruta, body, 2xx, errores, auditoría), con un cambio de texto: T3 (mutaciones que **no** son de escritura completa) — A1 y A6 son lectura y **permiten curso archivado**; el resto (A2–A5, A7–A12) responde 409 `AGENDA_COURSE_ARCHIVED`.

Reglas transversales (sin cambios): cancelar bloque = `PUT { status:'cancelled' }` en tx (`class_blocks.status` + `block_enrollments.status='cancelled'`) y notifica post-commit; completar = `PUT { status:'completed' }`; asistencia solo toca `block_enrollments.attended/notes` (y `status→completed` si `attended` es true/false); EC-08 solapes permitidos.

**EC-11 matizado (A10)** — al remover un alumno del curso (G12, sin cambios de código): (a) el alumno **deja de ver** el bloque en `/api/student/agenda` (INNER JOIN `course_enrollments`); (b) el bloque **sigue mostrándolo como asignado** (historial, `block_enrollments` no se toca); (c) la lista de **disponibles** del sheet se resuelve **desde `course_enrollments`** (`enrollments.ts:161-174`), nunca desde `users`, por lo que el removido no reaparece como asignable; (d) no se notifica baja ni se cancelan bloques (riesgo aceptado §9.3).

### 3.3 Endpoints alumno — schemas **corregidos (B2 + A5)**

`GET /api/student/agenda` (U1):
- `studentAgendaQuerySchema`: `{ courseId?: uuid, limit: coerce.int.min(1).max(50).default(5) }` → **default 5**, **no** llama `resolveLimit` (A5).
- Query SQL usa `limit` directo.

`GET /api/student/agenda/history` (U2) — **cursor propio, no `paginationQuerySchema`**:
```ts
// lib/validations/class-agenda.ts
export const agendaHistoryQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'cursor debe ser "YYYY-MM-DDTHH:mm"')
    .superRefine((v, ctx) => {
      const [d, t] = v.split('T');
      if (!isValidDateStr(d) || !isValidTime(t)) ctx.addIssue({ code: 'custom', message: 'cursor inválido' });
    })
    .optional(),
});
```
- Query: `limit = resolveLimit(params.limit)` (**solo** clampa limit; es cursor-agnóstico, seguro) con `limit+1`.
- Filtro de página (sin SQL crudo, tipado):
  ```ts
  or(
    lt(classBlocks.blockDate, cursorDate),
    and(eq(classBlocks.blockDate, cursorDate), lt(classBlocks.startTime, cursorTime))
  )
  ```
- Orden: `desc(classBlocks.blockDate), desc(classBlocks.startTime)`.
- `nextCursor` = `` `${last.blockDate}T${last.startTime}` `` (mismo formato que el regex).
- Documentación OpenAPI: `cursor` como `type: string` + `pattern: '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'`, **sin** `format: date-time`.

Respuestas U1/U2 y `AttendanceAggregates`: idénticas a v1 §3.3.

### 3.4/3.5 (sin cambios)
`lib/api-docs/paths/{class-agenda,student-agenda}.ts`, `schemas/class-agenda.ts`, registro en `spec.ts`, 14 entradas en `lib/auth/protected-routes.ts`. Retrocompatibilidad: 0 endpoints existentes modificados; segmento `agenda` no colisiona.

---

## 4. Notificaciones (B1 resuelto)

`engine.createNotification` es **inbox-first** y **no** consulta preferencias; solo el push se filtra (§4.1.3). AC-05 se reescribe (**A4**): *"inbox siempre (inbox-first); push según `notification_preferences`"* — **requiere @pm**.

### 4.3 `groupId` exacto (D12/B1) — decisión y alternativas descartadas

| Evento | `agendaEventKey` | `groupId` |
|---|---|---|
| assigned | `assigned:{blockId}:{studentId}` | uuid v5 determinista |
| removed | `removed:{blockId}:{studentId}` | uuid v5 determinista |
| cancelled | `cancelled:{blockId}` | uuid v5 determinista |

- `groupId: agendaGroupId(blockId, 'assigned', studentId)`; `metadata: { blockId, eventKey }`.
- **Por qué v5 y no otra cosa**:
  - *Usar `blockId` como `groupId`*: la dedup es `(userId, groupId)` ⇒ un `assigned` seguido de `cancelled` del mismo bloque **dentro de 1 h** colapsaría y la cancelación **no se notifica** (rompe AC-05/EC-05). **Descartado.**
  - *Usar `block_enrollments.id`* (uuid real): sirve para `assigned`, pero `removed` reutiliza el mismo id (la fila se borra con `returning()`) ⇒ **colisiona con `assigned`**; y `cancelled` no tiene fila de enrollment por alumno. **Descartado.**
  - *Añadir columna `notifications.dedup_key varchar`*: toca tabla compartida + `checkDuplicateNotification` + `createNotification` + engine ⇒ regresión potencial en evaluación/academia/push. **Descartado** (coste/riesgo mayor).
  - *Aceptar dedup por bloque*: **descartado** (ver primer punto).
- Consecuencia documentada (**EC-05b**): si el coach cancela, revierte a `scheduled` y vuelve a cancelar dentro de 1 h, la segunda cancelación **no** re-notifica (dedup vigente). Aceptado.
- El helper extiende a `'reminder'` cuando se active el cron (§7.2).

### 4.1/4.2/4.3 Invocación
Sin cambios de v1: `notifyClassEvent` con `try/catch` por alumno, `Promise.allSettled(students.map(...))` post-commit, `getActiveSubscriptions` + `sendBulkPushTracked` tolerantes a fallo. **No** se tocan `engine.ts`, `priority.ts` ni `triggers.ts`.

---

## 5. UI (sin cambios respecto a v1 §5)

7 componentes nuevos (5 coach + 2 alumno), `hooks/use-class-agenda.ts`, 3 modificados (`course-detail`, `student-dashboard`, `student-course-detail`), 2 previews a borrar. Reglas: solo tokens, 375 px, targets ≥44 px, sin ítems nuevos en `bottom-nav`, `defaultValue="students"` intacto.

---

## 6. Impacto por capa (actualizado)

| Capa | Impacto | Archivos |
|---|---|---|
| **DB** | Alto: 3 tablas + 2 enums + 8 índices, `0013_*` | `lib/db/schema.ts` MOD |
| **Queries** | Alto: 2 módulos + barrel + `getCourseOwned` | `class-agenda.ts` ✨, `class-agenda-blocks.ts` ✨, `courses.ts` MOD, `index.ts` MOD |
| **Lógica pura** | Medio | `lib/padel/class-agenda.ts` ✨, `lib/padel/agenda-group-id.ts` ✨ |
| **Validaciones** | Medio: 10 schemas | `lib/validations/class-agenda.ts` ✨ |
| **Auth** | Bajo: sin cambios en `auth.ts`/guards | `lib/auth/protected-routes.ts` MOD |
| **API** | Alto: 9 route handlers / 14 endpoints | `app/api/courses/[id]/agenda/**` (7), `app/api/student/agenda/**` (2) |
| **Notificaciones** | Medio | `lib/notifications/agenda.ts` ✨ |
| **UI** | Alto | 7 ✨ + 3 MOD + 1 hook ✨ |
| **API docs** | Medio | `paths/class-agenda.ts` ✨, `paths/student-agenda.ts` ✨, `schemas/class-agenda.ts` ✨, `spec.ts` MOD |
| **Env vars** | **Ninguna nueva** | `.env.example` MOD: **solo** se corrige el comentario de `APP_TIMEZONE` (hoy dice "usado por lib/date-utils.ts" — falso; pasa a "usado por la agenda de clases para calcular el día actual") |
| **Cron** | Ninguno en v1 | — |

---

## 7. Recordatorio automático — STANDBY (sin cambios)

No se crea `vercel.json`, ni workflow, ni endpoint, ni columna `reminder_sent_at`. Contrato futuro (v1 §7.2) actualizado en una línea: `groupId = agendaGroupId(blockId, 'reminder')` (uuid v5) y, al activar, **se prefiere `reminder_sent_at`** porque el dedup de 1 h no cubre una ventana de 24 h.

---

## 8. Tests (mapeo AC → test, actualizado)

| AC | Unit (Jest) | API (Playwright, SQL real) | E2E |
|---|---|---|---|
| AC-01 | `tests/unit/validations/class-agenda.test.ts`: `dayOfWeek` 1–7 (rechaza 0/8), `HH:mm`, 15–180, `.partial()` **vacío rechazado** (A6) | `class-agenda-guard.spec.ts`: 401/403/400 | — |
| AC-02 | `tests/unit/padel/class-agenda.test.ts`: `buildMaterializationPlan` (EC-01/EC-09), `mondayOf`/`buildWeekInfo` frontera de semana **y de año**, `isValidDateStr` (2026-02-30 → false) | `class-agenda-happy.spec.ts`: POST weeks 2× ⇒ `created` luego `0 created`, y `COUNT(*)` igual en SQL | coach "Habilitar semana" |
| AC-03 | `validateAssignment` (null/exacto/1 de más), `resolveCapacityRemaining` | happy: asignar inscrito 201; no inscrito 400; cupo 409 **sin escritura** (`COUNT` antes/después) | coach asigna 2 alumnos |
| AC-04 | `canEditTiming`, agregados tri-estado | happy: PUT attendance `true`/`false`/`null` + fila en `audit_logs`; PUT `status:'completed'` | marcar asistencia |
| AC-05 | **`tests/unit/padel/agenda-group-id.test.ts`**: regex uuid v5 (`/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`), determinismo, 3 eventos ⇒ 3 uuids distintos, `studentId` requerido en assigned/removed | happy: 2 POST iguales ⇒ **1** inbox (`GET /api/user/notifications`); push stub roto no rompe la mutación; `metadata.eventKey` presente | notificación visible en dashboard |
| AC-06 | `computeAttendanceAggregates` (0/1/null/redondeo), **`todayInTimeZone`** (UTC vs `America/Argentina/Buenos_Aires` con `now` fijo: `2026-11-04T02:30:00Z` ⇒ `2026-11-04` vs `2026-11-03`) | happy: U1 próximas + agregados; **U2 cursor** (`?cursor=YYYY-MM-DDTHH:mm` 200, `...THH:mm:ss.000Z` 400, `YYYY-MM-DD` 400) + página 2 sin duplicados; `?courseId` no inscrito ⇒ 404 | alumno ve "Próximas clases" 375 px |
| AC-07 | — | — | viewport 375, empty state |
| AC-08 | cobertura `lib/padel/class-agenda.ts` ≥95 % + `agenda-group-id.ts` 100 % | ≥1 happy por endpoint (14) + guards por grupo + **EC-13 409** (curso archivado) | 2 `test()` |
| AC-09 | — | `audit_logs` con `weekly_slot`/`class_block`/`block_enrollment` | — |
| **B3** | **`tests/unit/db/courses.test.ts` (MOD)**: `getCourseOwned` propio ⇒ fila con `status`; ajeno ⇒ `null`; archivado ⇒ fila con `status:'archived'` | guard spec: bloque de otro curso ⇒ 404 | — |

Comandos: `pnpm run test:unit`, `npx playwright test tests/api/padel/class-agenda-*.spec.ts`, `npx playwright test tests/e2e/class-agenda.spec.ts`.

---

## 9. Riesgos aceptados y deltas que requieren ack de @pm

| # | Delta | Acción |
|---|---|---|
| 1 | `dayOfWeek` **1–7** (spec pedía 0–6) | **@pm debe reescribir AC-01** (A3: no hay convención entera previa; `DAY_OPTIONS` son labels) |
| 2 | Dedup **1 h** (spec dice 24 h) | **@pm debe reescribir AC-05** (A4) junto con "inbox siempre, push por preferencias" |
| 3 | **EC-11** sin efecto completo (remover alumno no cancela bloques ni notifica) | Documentado en §3.2; el alumno deja de verlos; los disponibles salen de `course_enrollments` |
| 4 | Zod en archivo propio (spec §10) | D16 |
| 5 | `groupId` = uuid v5 (opaco) | Trazabilidad vía `metadata.eventKey`; EC-05b documentado |
| 6 | **`lib/date-utils.ts` intacto** | **Out-of-scope explícito** (D18). Borrarlo = cambio separado |
| 7 | Cursor U2 con formato propio, no el de G15 | Justificado: el cursor no es un instante ISO sino un par `(date, time)` wall-clock |

---

## 10. Matriz de resolución del design-review

| Hallazgo | Dónde se resuelve | Estado |
|---|---|---|
| 🔴 **B1** `group_id` uuid | D12 · §4.3 · §2 (`agenda-group-id.ts`) + tests AC-05 | ✅ resuelto (uuid v5; alternativas descartadas documentadas) |
| 🔴 **B2** cursor vs `.datetime()` | §3.3 `agendaHistoryQuerySchema` + §8 AC-06 | ✅ resuelto (regex + comparación compuesta tipada) |
| 🔴 **B3** `getCourseById` → `CourseDetail` | D20 · §3.2 `getCourseOwned` + §8 fila B3 | ✅ resuelto (helper nuevo, `getCourseById` intacto) |
| 🟡 A1 timezone | D3 · D18 · §2.5 | ✅ rationale corregida |
| 🟡 A2 primera columna `date` | §1 nota + `ARCHITECTURE.md` (C13) | ✅ |
| 🟡 A3 ISO 1–7 | D4 | ✅ rationale corregida + ack @pm pendiente |
| 🟡 A4 AC-05 inbox/push | §4 + §9.2 | ✅ ack @pm pendiente |
| 🟡 A5 U1 limit 5 | §3.3 | ✅ schema propio, sin `resolveLimit` |
| 🟡 A6 `.partial()` vacío | §8 AC-01 + `.refine` al final en `change-map-v2` C2 | ✅ |
| 🟡 A7 C11 antes de UI | `change-map-v2` §Orden (C11a/C11b tras C5) | ✅ |
| 🟡 A8 conteos | `change-map-v2` header: **51 archivos** | ✅ |
| 🟡 A9 C6 = 4 archivos | `change-map-v2` C6 (4) + C7 (1) = chunk de 5 | ✅ |
| 🟡 A10 EC-11 | §3.2 bullet EC-11 | ✅ |
| 🟡 A11 split C1 | `change-map-v2` C1a (5) + C1b (3) | ✅ |
| 🟢 C1–C15 | sin cambios | ✅ confirmados |

---

## 11. Regla de versioning (definitiva) y changelog

**Regla**:
1. `technical-design-vN.md` — N sube **solo** si cambia un contrato (endpoint, DTO, schema Zod, error code), una decisión ya comunicada a otro agente, o el plan de chunks. **El archivo anterior nunca se edita ni se borra.**
2. Correcciones editoriales (typos, redacción, tablas): edición in-place del archivo vigente + fila en el changelog.
3. `change-map-vN.md` sube en lockstep con `technical-design-vN.md` **y** solo si cambian archivos, chunks u orden. Si cambia el diseño pero no los archivos, `change-map` se edita in-place con nota.
4. El changelog es la única fuente de verdad de qué versión leyó cada agente.

| Archivo | Versión | Fecha | Autor | Cambio |
|---|---|---|---|---|
| `technical-design.md` | v1 | 2026-11-04 | @architect | creación (D1–D16) — **intacto** |
| `technical-design-v2.md` | **v2** | 2026-11-04 | @architect | B1 (uuid v5) · B2 (cursor propio) · B3 (`getCourseOwned`) · A1–A11 · D17–D20 |
| `change-map.md` | v1 | 2026-11-04 | @architect | creación — **intacto** |
| `change-map-v2.md` | **v2** | 2026-11-04 | @architect | 45 → **51 archivos**, C1a/C1b, C11 adelantado, C6/C7 agrupados |
