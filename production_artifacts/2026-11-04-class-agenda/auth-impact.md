# Auth Impact — Agenda de clases por curso (v0.11)

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · date: `2026-11-04` · autor: @auth-security
> Alcance: C7 (`lib/auth/protected-routes.ts` MOD, fila 30 del `change-map-v2.md`) + **gate de salida de C3**.
> **Sin cambios en `auth.ts`, `lib/auth/admin-guard.ts`, sesiones, JWT callbacks ni cookies.** Solo registro de rutas (archivo de referencia, no middleware).

## 1. Semántica de guards usados (sin modificar)

| Helper | Sin sesión | Rol no permitido | Status ≠ ACTIVE | LOCKED |
|---|---|---|---|---|
| `guardAdmin(session)` | 401 `No autenticado` | 403 `No autorizado` | 403 | 403 |
| `guardUser(session)` | 401 `No autenticado` | n/a | TEMPORARY → 403 `code: TEMPORARY` | 403 |

`guardAdmin` acepta **ADMIN ∪ SUPER_ADMIN** (`isAdminRole`) y exige `status === 'ACTIVE'`.
**Nunca se permite `LOCKED`** en ninguno de los 14 endpoints. `TEMPORARY` nunca pasa en la agenda (todos los registros declaran `allowedStatuses: ['ACTIVE']`).

## 2. Tabla de guard por endpoint (14 registros)

| # | Endpoint | Guard | Estados | Rol efectivo | Errores de seguridad | Auditoría | Anti-IDOR |
|---|---|---|---|---|---|---|---|
| A1 | `GET /api/courses/[id]/agenda/slots` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404 | — (lectura) | `getCourseOwned(me, id)` → null = 404 |
| A2 | `POST .../agenda/slots` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 `AGENDA_SLOT_DUPLICATE` / `AGENDA_COURSE_ARCHIVED` | `auditCreate(weekly_slot)` | ídem |
| A3 | `PUT .../agenda/slots/[slotId]` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 dup / archivado | `auditUpdate(weekly_slot)` | `getCourseOwned` + slot filtrado por `courseId` |
| A4 | `DELETE .../agenda/slots/[slotId]` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 archivado | `auditDelete(weekly_slot)` | ídem A3 |
| A5 | `POST .../agenda/weeks` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 `AGENDA_NO_SLOTS` / archivado | `auditCreate(class_block_week)` | `getCourseOwned` |
| A6 | `GET .../agenda/blocks` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 400 (rango > 8 semanas) | — (lectura) | `getCourseOwned` |
| A7 | `POST .../agenda/blocks` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 dup / archivado | `auditCreate(class_block)` | `getCourseOwned` |
| A8 | `PUT .../agenda/blocks/[blockId]` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 `AGENDA_BLOCK_PAST` / `AGENDA_BLOCK_CANCELLED` / archivado | `auditUpdate(class_block)` (+ `cancelled`) | `getCourseOwned` + bloque scoped por `courseId` |
| A9 | `DELETE .../agenda/blocks/[blockId]` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 `AGENDA_BLOCK_HAS_ENROLLMENTS` / archivado | `auditDelete(class_block)` | ídem A8 |
| A10 | `POST .../agenda/blocks/[blockId]/enrollments` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 400 `AGENDA_STUDENT_NOT_ENROLLED`, 409 `AGENDA_CAPACITY` / `AGENDA_BLOCK_CANCELLED` | `auditCreate(block_enrollment)` | `getCourseOwned` + `assignStudents` valida `course_enrollments` del curso en la misma tx |
| A11 | `PUT .../enrollments/[studentId]` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404, 409 `AGENDA_BLOCK_CANCELLED` | `auditUpdate(block_enrollment)` | `getCourseOwned` + `updateAttendance(courseId, blockId, studentId)` |
| A12 | `DELETE .../enrollments/[studentId]` | `guardAdmin` | ACTIVE | ADMIN/SUPER_ADMIN | 401, 403, 404 | `auditDelete(block_enrollment)` | `getCourseOwned` + `removeEnrollment(courseId, blockId, studentId)` |
| U1 | `GET /api/student/agenda` | `guardUser` | ACTIVE | USER (también ADMIN, scope = sus propias inscripciones) | 401, 403 (TEMPORARY/LOCKED), 404 `?courseId` no inscrito | — (lectura) | `INNER JOIN course_enrollments(studentId=me)`; `getEnrollment` para `?courseId` |
| U2 | `GET /api/student/agenda/history` | `guardUser` | ACTIVE | USER | 401, 403, 404 `?courseId` no inscrito, 400 cursor inválido | — (lectura) | ídem U1 |

**Anti-IDOR:** recurso ajeno o inexistente → **404** (nunca 403) para no crear oráculo de existencia. `courses.ownerId` para coach; `course_enrollments.studentId` para alumno. **D9: no hay bypass de ownership para SUPER_ADMIN** — un SUPER_ADMIN que no es `ownerId` del curso recibe 404 igual que cualquier ADMIN.

**Curso archivado (T3/A):** solo A1 y A6 (lectura) lo permiten; A2–A5 y A7–A12 responden **409 `AGENDA_COURSE_ARCHIVED`** antes de validar el body.

## 3. Auditoría

Toda mutación (A2–A5, A7–A12) escribe en `audit_logs` **post-commit** vía `lib/audit/helpers.ts` (`auditCreate/auditUpdate/auditDelete`) con `{ userId: session.user.id, ...extractRequestContext(request) }`. Las lecturas (A1, A6, U1, U2) no auditan (consistente con el resto del repo). Cancelación (A8) registra `notified` y el `cancelledStudentIds` queda trazado por el propio `block_enrollment` (mismo patrón que `PAIR_EVALUATION_PUBLISHED`).

## 4. Gate de salida de C3 — revisión de notificaciones

Revisado: `lib/notifications/agenda.ts` + los 3 call sites reales.

| Call site | Origen de `studentId(s)` | Verificado |
|---|---|---|
| A10 `enrollments/route.ts` | `result.assigned` = filas **insertadas** devueltas por `assignStudents`, que antes validó `INNER` contra `course_enrollments(courseId, studentId)` | ✅ nunca un id del body |
| A12 `enrollments/[studentId]/route.ts` | `studentId` de la URL, pero la notificación ocurre **solo** si `removeEnrollment` devolvió `ok` (fila existente en ese `blockId` cuyo bloque pertenece al curso) | ✅ existencia validada |
| A8 `blocks/[blockId]/route.ts` | `result.cancelledStudentIds` = `RETURNING studentId` del `UPDATE block_enrollments` dentro de la tx de `setBlockStatus` | ✅ nunca un id del body |

**Veredicto: C3 OK** — `notifyClassEvent` recibe siempre ids ya validados por query; el body/URL nunca se reenvía a otro usuario. No hay hueco explotable por un ADMIN autenticado.

**Observaciones (no bloqueantes, sin escalar a C5):**
1. `lib/notifications/agenda.ts` **no re-verifica** la inscripción por sí mismo: la garantía es un **contrato de llamada** (caller-side). Cualquier caller futuro debe respetar "solo ids devueltos por una query scoped". Documentado aquí como invariante.
2. A12 notifica `removed` aunque el bloque esté `cancelled` (`removeEnrollment` no filtra status) → posible notificación redundante tras una cancelación; es ruido de UX, **no** un problema de autorización.
3. A12 puede notificar a un alumno ya removido de `course_enrollments` (EC-11 matizado, riesgo aceptado §9.3): el alumno estuvo realmente asignado al bloque, no hay fuga de datos.

## 5. OWASP Top 10 aplicado

| Categoría | Control |
|---|---|
| **A01 Broken Access Control** | Guard en cada handler (401), rol (403), ownership DB-backed por `ownerId`/`course_enrollments` con **404** (no 403) y sin bypass SUPER_ADMIN. `courseId`/`blockId`/`studentId` siempre se combinan con el scope del curso en el `WHERE` (no basta el id de la ruta). |
| **A03 Injection** | Zod en **todos** los mutation bodies y params (`class-agenda.ts`, `padelIdParamsSchema`, uuid schemas); Drizzle parametriza SQL; cursor `YYYY-MM-DDTHH:mm` con regex estricta. |
| A02 Cryptographic failures | Sin cambios criptográficos; `groupId` uuid v5 derivado (no secreto) en `lib/padel/agenda-group-id.ts`. |
| A04 Insecure design | All-or-nothing en asignación (D10) y materialización idempotente (tx + `onConflictDoNothing`); capacidad validada server-side. |
| A05 Security misconfiguration | Sin nuevas env vars (D13); `APP_TIMEZONE` con fallback `"UTC"`. |
| A07 Auth failures | `allowedStatuses: ['ACTIVE']` en los 14; `TEMPORARY`/`LOCKED` → 403. |
| A08 Data integrity | Mutaciones transaccionales + auditoría post-commit. |
| A09 Logging failures | `audit_logs` en toda mutación; `console.error` sólo en 500/notificación. |
| A10 SSRF | Sin fetches a URLs del usuario. |

## 6. Regresión

- `lib/auth/protected-routes.ts` es **referencia sin consumidores** (0 imports en el repo): el cambio es aditivo y no altera runtime.
- Cero endpoints existentes modificados; el segmento `agenda` bajo `/api/courses/[id]/` y `/api/student/` no colisiona con rutas previas.
- `npx tsc --noEmit` = 0.
