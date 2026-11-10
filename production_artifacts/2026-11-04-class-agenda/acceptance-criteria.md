# Acceptance Criteria — Agenda de clases por curso (`2026-11-04-class-agenda`)

> Validado por @qa-release · 2026-11-04 · release **v0.11** · módulo `padel`
> Fuente: `feature-spec.md` §5 (AC-01..AC-09) + §6 (EC-01..EC-13).

## Resumen

| AC | Estado | Evidencia | Notas |
|---|---|---|---|
| AC-01 Template de slots | ✅ PASS | `class-agenda-happy.spec.ts` (A2: create/update/delete `weekly_slots` con SQL real) · `class-agenda-guard.spec.ts` (404 slot de curso ajeno) · `tests/unit/validations/class-agenda.test.ts` (`dayOfWeek` 1–7, `durationMinutes` 15–180, rechazos Zod) | 100 % ramas del schema cubiertas |
| AC-02 Materialización idempotente | ✅ PASS | `class-agenda-happy.spec.ts` (A5: "Habilitar Sem N" → `created`, segunda llamada → `created: 0` / `skipped: N`, filas SQL contadas) · unit `buildMaterializationPlan` | Semana sin slots activos → 400/409 cubierto en guard spec |
| AC-03 Asignación con reglas | ✅ PASS | `class-agenda-happy.spec.ts` (A10: inscrito → 201; no inscrito → 400 `AGENDA_STUDENT_NOT_ENROLLED`; cupo lleno → 409 `AGENDA_CAPACITY`; doble asignación → `alreadyAssigned`) · E2E coach asigna desde UI | `maxCapacity: null` = sin tope (unit `validateAssignment`) |
| AC-04 Estados y asistencia | ✅ PASS | `class-agenda-happy.spec.ts` (A9/A12: bloque `completed`/`cancelled`, `attended` true/false/null + `notes`; cancelar → asignaciones `cancelled`) · UI tri-estado en `block-enrollment-row.tsx` | Asistencia solo coach dueño (guard + `getCourseOwned`) |
| AC-05 Notificación con dedup | ⚠️ PARCIAL (automático ok, push visible = manual) | `tests/unit/notifications/agenda.test.ts` (groupId uuid v5 determinista, copy P2, dedup del engine ⇒ 0 push en duplicado) · respuesta API `notified: 1` verificada en E2E/API | Ver checklist manual M-01 |
| AC-06 Historial + agregados alumno | ✅ PASS | `class-agenda-student-happy.spec.ts` (U1: próximas + `aggregates.scheduled/attended/cancelled/attendanceRate` con SQL real; U2: cursor + anti-IDOR 404) · unit `computeAttendanceAggregates` | — |
| AC-07 UI alumno móvil-first | ✅ PASS | `tests/e2e/class-agenda.spec.ts` test 2 (375×667: "Próximas clases" con curso/hora/estado, alumno sin clases ve empty state, `documentElement.scrollWidth ≤ 375`) | — |
| AC-08 Gates de repo | ✅ PASS | `tsc` 0 · lint 0 errores · 948/948 unit · 7 API SQL real · 2 E2E · build OK · `lib/api-docs/spec.ts` con 15 endpoints · FEATURES.md con metadata | Cobertura: `lib/padel/class-agenda.ts` 96.7 %, `lib/validations/class-agenda.ts` 100 % |
| AC-09 Auditoría | ✅ PASS | `class-agenda-happy.spec.ts` asevera `audit_logs` (6 puntos: slot, bloque, asignación, asistencia, cancelación) · todas las rutas coach con `guardAdmin` | Entidades `weekly_slot` / `class_block` / `block_enrollment` |

## Edge cases (feature-spec §6)

| # | Caso | Estado | Evidencia |
|---|---|---|---|
| EC-01 | Semana ya habilitada | ✅ | A5 idempotente (conteo `created`/`skipped`) |
| EC-02 | Bloque en el pasado | ✅ unit | `canEditTiming`/`isPast` en `class-agenda.test.ts`; solo COMPLETADA + asistencia |
| EC-03 | Alumno no inscrito | ✅ | 400 `AGENDA_STUDENT_NOT_ENROLLED` sin escritura (all-or-nothing) |
| EC-04 | Cupo lleno | ✅ | 409 `AGENDA_CAPACITY` |
| EC-05 | Cancelar bloque con inscritos | ✅ | asignaciones → `cancelled` + notificación por alumno (unit agenda) |
| EC-06 | Doble asignación | ✅ | UNIQUE `blockId`+`studentId` + `alreadyAssigned` + dedup `groupId` |
| EC-07 | Timezone | ✅ unit | `todayInTimeZone` + frontera de día en `class-agenda.test.ts` |
| EC-08 | Bloques solapados | ✅ | permitido, sin bloqueo server-side (decisión documentada) |
| EC-09 | Editar slot tras materializar | ✅ | snapshot: no retro-propaga |
| EC-10 | Borrar slot con bloques | ✅ | `weeklySlotId` → null (`set null`) |
| EC-11 | Alumno removido del curso | ✅ | la query del alumno exige `course_enrollments` (join) → deja de ver la clase |
| EC-12 | Recordatorio no activo | ✅ | sin cron en v1; contrato en ARCHITECTURE.md (standby) |
| EC-13 | Curso archivado | ✅ | 409 `AGENDA_COURSE_ARCHIVED` en mutaciones; lectura permitida |

## Checklist manual pendiente (no automatizable en CI)

- [ ] **M-01 — Push visible en dispositivo real**: asignar/cancelar una clase y confirmar que llega la notificación push (Safari iOS + Chrome Android) y que el inbox la muestra en `/notifications`. Requiere VAPID de producción + permiso de notificaciones del navegador.
- [ ] **M-02 — Responsive visual del tab Agenda en iPhone SE real** (375×667): la grilla y el sheet de asignación se ven sin recortes (el desborde del header es BUG-01, ajeno a la agenda).
- [ ] **M-03 — Timezone de producción**: con `APP_TIMEZONE=America/Santiago`, crear un slot del día y verificar que "Hoy · HH:mm" coincide con la hora local del coach.
- [ ] **M-04 — Recordatorio (futuro)**: al activar `/api/cron/class-reminders`, validar `CRON_SECRET` y `reminderSentAt` (fuera de v1).
