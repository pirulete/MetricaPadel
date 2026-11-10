# Security Checklist — Agenda de clases por curso (v0.11)

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · date: `2026-11-04` · autor: @auth-security
> Verificable por el implementador (@app-engineer) y por @qa-release antes del release.
> Referencia: `auth-impact.md` (misma carpeta), `technical-design-v2.md` §3.2/§3.3, `change-map-v2.md` C6+C7.

## 1. Registro de rutas — `lib/auth/protected-routes.ts` (C7)

- [x] Las **14 entradas** existen (A1–A12 coach + U1–U2 alumno), sin duplicados ni colisión de claves.
- [x] Las 12 de coach declaran `guard: 'guardAdmin'` + `roles: ['ADMIN']` + `allowedStatuses: ['ACTIVE']`.
- [x] U1/U2 declaran `guard: 'guardUser'` + `allowedStatuses: ['ACTIVE']` (sin `roles`).
- [x] Las 10 mutaciones (A2, A3, A4, A5, A7, A8, A9, A10, A11, A12) declaran `audit:`.
- [x] Las 4 lecturas (A1, A6, U1, U2) no declaran `audit`.
- [x] Las 12 de coach declaran `antiIdor:` (`getCourseOwned(ownerId=me, id)`); U1/U2 documentan `INNER JOIN course_enrollments`.
- [x] `allowedStatuses` es `['ACTIVE']` en los 14 → **TEMPORARY y LOCKED quedan fuera**.
- [x] No se tocó `auth.ts` ni `lib/auth/admin-guard.ts`.
- [x] `npx tsc --noEmit` = 0.

## 2. Guard en cada handler (C4/C5)

- [x] Los 12 handlers de coach llaman `guardAdmin(session)` **antes** de parsear body/params y devuelven el `NextResponse` del guard tal cual (401/403).
- [x] U1 y U2 llaman `guardUser(session)` antes de cualquier query.
- [x] Ningún handler confía en el rol/ownership del cliente (ni `role` en body ni `ownerId` en body).
- [x] No existe bypass de ownership para SUPER_ADMIN en la agenda (D9).

## 3. Anti-IDOR (A01)

- [x] Coach: `getCourseOwned(session.user.id, id)` → `null` ⇒ **404** (nunca 403, sin oráculo de existencia).
- [x] `blockId`/`slotId`/`studentId` **siempre** se filtran junto a `courseId` en el `WHERE` de la query; un id válido de otro curso ⇒ 404.
- [x] Alumno: alcance por `INNER JOIN course_enrollments(studentId = me)`; `?courseId` de curso no inscrito ⇒ **404** (U1 y U2).
- [x] Cero parámetros de ownership tomados del body/query (`ownerId`, `studentId` de sesión).

## 4. Archivado y estados de negocio

- [x] A1 y A6 (lectura) permiten curso `archived`.
- [x] A2–A5 y A7–A12 devuelven **409 `AGENDA_COURSE_ARCHIVED`** si el curso está archivado, **antes** de validar el body.
- [x] `AGENDA_BLOCK_CANCELLED` (409) en A10/A11 y A8 (edición de cancelado).
- [x] `AGENDA_BLOCK_PAST` (409) al cambiar el timing de un bloque pasado (EC-02).
- [x] `AGENDA_BLOCK_HAS_ENROLLMENTS` (409) en A9 en lugar de borrar con inscripciones.

## 5. Validación de entrada (A03)

- [x] Zod en el 100 % de los mutation bodies (`lib/validations/class-agenda.ts`).
- [x] `padelIdParamsSchema` + `z.string().uuid()` para `id`, `blockId`, `slotId`, `studentId`.
- [x] `studentIds`: array de uuid, 1..50; duplicados deduplicados server-side.
- [x] `dayOfWeek` 1–7, `startTime` `HH:mm`, `durationMinutes` 15–180, `maxCapacity` coherente.
- [x] Cursor de U2 restringido a `YYYY-MM-DDTHH:mm` (rechaza `...T18:00:00.000Z` y `YYYY-MM-DD`).
- [x] Ningún `raw SQL` interpolado; todo por Drizzle.

## 6. Auditoría (A09)

- [x] Toda mutación escribe `audit_logs` **post-commit** con `userId` de sesión + `extractRequestContext(request)`.
- [x] La notificación de cancelación (A8) se ejecuta con `Promise.allSettled` y **no** revierte la tx.
- [x] El fallo de push no propaga (AC-05) ni rompe la mutación.

## 7. Notificaciones — gate de salida de C3

- [x] A10 notifica **solo** `result.assigned` (filas insertadas tras validar `course_enrollments`).
- [x] A12 notifica **solo** tras `removeEnrollment` con `ok` (existencia real de la inscripción en el bloque del curso).
- [x] A8 notifica **solo** `cancelledStudentIds` devueltos por la tx de `setBlockStatus`.
- [x] Ningún `studentId` proviene directo del body/URL sin validación por query scoped al curso.
- [x] Invariante documentado en `auth-impact.md` §4: *`notifyClassEvent` solo acepta ids devueltos por una query scoped* (contrato de llamada, sin check propio).
- [x] Observaciones no bloqueantes registradas (A12 puede notificar `removed` sobre bloque cancelado; EC-11 aceptado).

## 8. Sesión / cookies / CSRF (sin cambios)

- [x] No se modifican callbacks de Auth.js, TTL de sesión, `session_config` ni cookies (el repo no usa `getServerSession` con `cookies()` custom aquí).
- [x] Sin nuevas variables de entorno (D13).
- [x] Sin endpoints públicos nuevos → no se requiere rate limit adicional; todas las rutas exigen sesión ACTIVE.
- [x] `LOCKED` nunca alcanza ningún handler (403 del guard antes de la lógica).

## 9. Casos que **C11a/C11b** (@app-engineer) deben cubrir

### `tests/api/padel/class-agenda-guard.spec.ts`
- [ ] **401 sin sesión × 14** (A1–A12, U1, U2).
- [ ] **403 USER × 12** en los endpoints de coach (A1–A12) con un usuario `USER`/`ACTIVE` equivalente a `playwright` user.
- [ ] **403 TEMPORARY y 403 LOCKED** en al menos 1 endpoint coach y 1 alumno (verificar `code: TEMPORARY` en U1).
- [ ] **404 cross-course**: curso de otro coach → 404 en A1, A6, A8, A10 (y 404 `blockId` de otro curso con curso propio en A8/A10/A11/A12).
- [ ] **404 en U1/U2** con `?courseId` de un curso donde el alumno no está inscrito.
- [ ] **409 `AGENDA_COURSE_ARCHIVED`** en A2/A5/A7/A10 (EC-13) y **200** en A1/A6 con el mismo curso archivado.
- [ ] **400 Zod** (uuid inválido, `dayOfWeek` fuera de rango, `studentIds` vacío, cursor inválido en U2).

### `tests/api/padel/class-agenda-happy.spec.ts` / `-student-happy.spec.ts`
- [ ] Happy-path con **SQL real** por endpoint nuevo (14) + fila en `audit_logs` por cada mutación.
- [ ] **Dedup de inbox**: 2 POST A10 idénticos ⇒ **1** notificación (`GET /api/user/notifications`), `metadata.eventKey` presente.
- [ ] **Notificación solo a alumnos realmente inscritos**: asignar 2 alumnos y verificar que no se crea notificación para un tercer id (usar `studentIds` con un id de otro curso ⇒ 400 `AGENDA_STUDENT_NOT_ENROLLED` y **0** notificaciones).
- [ ] **All-or-nothing**: cupo excedido ⇒ 409 `AGENDA_CAPACITY` y `block_enrollments` sin cambios.

## 10. Firma de conformidad

| Gate | Resultado |
|---|---|
| 14 registros en `protected-routes.ts` | ✅ |
| Guard server-side en los 14 handlers | ✅ |
| Auditoría en las 10 mutaciones | ✅ |
| Zod en todas las mutaciones | ✅ |
| 404 en recurso ajeno | ✅ |
| `LOCKED` nunca permitido | ✅ |
| Gate C3 (notificaciones) | ✅ (3 call sites verificados) |
| `npx tsc --noEmit` | ✅ 0 errores |
