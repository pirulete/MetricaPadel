# Feature Spec — Agenda de clases por curso (coach → alumnos)

> change_id: `2026-11-04-class-agenda`
> status: `proposed`
> release: `v0.11` (por confirmar por @architect/@qa-release)
> date: `2026-11-04`
> module: `padel`
> tags: `[agenda, db, api, notifications, ui, mobile]`
> autor: @pm · fuente de decisiones: usuario (cerradas) + análisis read-only de StreetMove

---

## 1. Problema

Hoy `courses.schedule` es **sólo un varchar de display** (`Architecture v0.2`, P05/P07): el coach escribe "Martes y Jueves 18:00" y nada más. No existe entidad de clase, no hay fecha real, no hay asignación de alumnos a una sesión concreta, el alumno no sabe cuándo le toca, no recibe recordatorio y no hay forma de medir asistencia.

Gaps reales verificados:
- `course_enrollments` dice **quién** está en el curso, pero no **cuándo** entrena ni **si asistió**.
- El motor de notificaciones (`lib/notifications/engine.ts`) existe y está subutilizado: no hay evento de dominio "clase asignada/cancelada".
- El coach agenda por fuera (WhatsApp) y el alumno no tiene pantalla donde ver su próxima clase.

## 2. Objetivo

Convertir la agenda en **datos de primera clase por curso**, con dos capas (template + bloques datados) y asignación de alumnos con asistencia, disparando notificaciones inmediatas por el motor existente.

**Objetivo medible (v1):** un coach puede publicar la semana N de un curso, asignar alumnos y un alumno ve su próxima clase en móvil sin intervención manual del coach fuera de la app.

**Alternativa elegida:** C (completa) — template semanal + materialización de semana + asignación con asistencia. Rechazadas: A (sólo template sin fechas reales → no permite notificar ni medir) y B (sólo bloques sueltos → el coach recarga la misma semana a mano cada semana).

## 3. Modelo de dominio (3 tablas, cerrado — no ampliar en spec)

| Tabla | Rol | Campos núcleo |
|---|---|---|
| `weekly_slots` | **Template** recurrente del curso (1ª capa) | `courseId` FK courses, `dayOfWeek` (ISO 1–7), `startTime` (time), `durationMinutes`, `label`/`className` nullable, `isActive`, timestamps |
| `class_blocks` | **Instancia datada** de una semana (2ª capa) | `courseId` FK, `weeklySlotId` FK nullable (origen, `set null` al borrar el slot), `blockDate` (date), `startTime`, `durationMinutes`, `status` PROGRAMADA/COMPLETADA/CANCELADA, `maxCapacity` nullable, `label` nullable, timestamps |
| `block_enrollments` | **Asignación + asistencia** | `blockId` FK cascade, `studentId` FK users (no cascade), `status` (SCHEDULED/COMPLETED/CANCELLED), `attended` (boolean/0-1 **nullable**), `notes` (text nullable), timestamps; UNIQUE (`blockId`,`studentId`) |

Reglas de integridad:
- El alumno asignado **debe estar inscrito en el curso del bloque** (`course_enrollments`) → validación server-side, 400/404 según contrato que fije @architect.
- `maxCapacity` nullable = sin tope. Si existe, se valida al asignar (409 al llenar).
- Anti-IDOR: coach sólo opera bloques/slots de **cursos propios** (`courses.ownerId`); recurso ajeno = **404** (no 403), patrón vigente del repo.
- Nada de `pairId` ni tablas de métricas: agregados se **derivan** por query.

## 4. Alcance

### In-scope (v1)
1. CRUD de `weekly_slots` por curso (coach dueño).
2. **Habilitar semana**: endpoint que materializa `class_blocks` desde el template para un rango de fechas (idempotente: no duplica si ya existe bloque del slot+fecha).
3. Edición/creación/borrado de bloques sueltos de la semana materializada; cambio de status (COMPLETADA/CANCELADA).
4. Asignación de alumnos a bloque (`block_enrollments`) con validación de inscripción y cupo; quitar asignación.
5. **Estados + asistencia completos v1**: bloques y asignaciones con status; `attended` + `notes` editables por el coach post-clase.
6. **Notificaciones inmediatas** (inbox + push) reutilizando `lib/notifications/engine.ts`: asignado, removido, clase cancelada. Dedup por `groupId` (idempotencia ante doble click/reintento).
7. **UI coach**: agenda semanal del curso (grilla día × hora), botón "Habilitar Sem N", dialog de asignación, marcar asistencia, cancelar bloque con confirmación.
8. **UI alumno (móvil-first)**: "Mis próximas clases" en dashboard y/o detalle de curso + subsección de historial con estado/asistencia.
9. **Endpoint de historial + agregados del alumno**: programadas / asistidas / canceladas / % asistencia.
10. Auditoría en mutaciones (`lib/audit/helpers.ts`) y doc de endpoints en `lib/api-docs/spec.ts`.

### Out-of-scope (v1) — explícito
- **Grilla semanal del alumno** (vista calendario completa del alumno): futuro, documentado.
- **Dashboard avanzado de métricas/evolución de asistencia**: los agregados básicos del punto 9 son el techo de v1.
- **Ejecución del recordatorio automático**: NO se crea workflow. Standby documentado (ver §9).
- **Reservas self-service del alumno** (book/cancel propio, planes, límites tipo StreetMove, `bookedBy`): el alumno **no** se autoasigna en v1.
- **Multi-academia en agenda**: la agenda cuelga de `courses`, no de `academies`; sin scoping por academia en v1.
- Categorías/planes/precios de clase, lista de espera, recurrencia infinita, iCal/export, reprogramación automática, notificación de cambios de hora.
- Backfill masivo/importación CSV de agendas históricas.

## 5. Acceptance Criteria (verificables, mínimo 7)

- **AC-01 · Template**: el coach dueño crea/edita/desactiva `weekly_slots` de su curso; slot de curso ajeno → 404. `dayOfWeek` ISO 1–7, `durationMinutes` 15–180 validados con Zod.
- **AC-02 · Materialización idempotente**: "Habilitar Sem N" genera exactamente 1 `class_block` por (`weeklySlotId`, fecha) con status PROGRAMADA; ejecutarlo dos veces **no duplica** (idempotencia verificada por UNIQUE o check en tx) y no toca bloques existentes editados. Semana sin slots activos → 400/409 con mensaje claro, sin escribir nada.
- **AC-03 · Asignación con reglas**: asignar exige alumno **inscrito** en el curso (si no → 400/404 según contrato) y respeta `maxCapacity` (lleno → 409) ; `maxCapacity: null` permite asignar sin tope. Doble asignación → idempotente o 409, nunca duplicado en DB.
- **AC-04 · Estados y asistencia**: bloque pasa PROGRAMADA → COMPLETADA/CANCELADA; asignación guarda `status` + `attended` (null/true/false) + `notes`; asistencia sólo editable por el coach dueño y registrada en `audit_logs`.
- **AC-05 · Notificación inmediata con dedup**: al asignar/remover/cancelar se crea notificación inbox y push según preferencias; 2 llamadas del mismo evento con igual `groupId` producen **1** notificación inbox (dedup 1 h del engine). Fallo de push no rompe la mutación (inbox-first).
- **AC-06 · Historial + agregados del alumno**: `GET` del alumno devuelve próximas clases (futuras, status PROGRAMADA) y pasadas (COMPLETADA/CANCELADA) con asistencia, más agregados programadas/asistidas/canceladas/`attendanceRate`; sólo ve bloques de cursos donde está inscrito (anti-IDOR 404 si consulta un curso ajeno).
- **AC-07 · UI alumno móvil-first**: en 375 px el alumno ve "Mis próximas clases" con fecha/hora/curso/estado, empty state cuando no hay clases y error recuperable; navegación sin scroll horizontal. Al menos 1 E2E navegable cubre este flujo.
- **AC-08 · Gates de repo**: unit tests (Jest) para schemas/queries/lógica de materialización y agregados; **≥1 API test happy-path con SQL real** por endpoint nuevo en `tests/api/padel/`, además de guards 401/403; ≥1 E2E en `tests/e2e/`; `lib/api-docs/spec.ts` actualizado; `tsc` = 0, `lint` = 0 errores, `build` OK, cobertura del módulo sin regresión > 3 %, entrada en `FEATURES.md` con metadata completa.
- **AC-09 · Auditoría**: toda mutación (slot, bloque, asignación, asistencia, cancelación) escribe en `audit_logs` con entidad y acción identificables; ningún endpoint admin sin `guardAdmin`.

## 6. Edge Cases

| # | Caso | Comportamiento esperado |
|---|---|---|
| EC-01 | Semana ya habilitada | Idempotente: no duplica bloques; responde conteo de creados/omitidos |
| EC-02 | Bloque en el pasado | No editable en hora/duración; sólo permite marcar COMPLETADA + asistencia |
| EC-03 | Alumno no inscrito en el curso del bloque | Rechazo server-side (400/404); nunca se persiste la asignación |
| EC-04 | Cupo lleno (`maxCapacity` alcanzado) | 409 con mensaje; sin escritura. `maxCapacity` null → permitido |
| EC-05 | Cancelar bloque con inscritos | Bloque → CANCELADA, asignaciones → CANCELLED, notificación a cada alumno afectado |
| EC-06 | Doble asignación (doble click / reintento) | UNIQUE (`blockId`,`studentId`) + dedup notificación; 1 fila, 1 notificación |
| EC-07 | Timezone / día de la semana | `dayOfWeek` se interpreta en la timezone de la academia/curso definida por @architect; cálculo de fecha documentado, sin `Date` naive en cliente |
| EC-08 | Bloques solapados del mismo curso | Permitido en v1 pero advertido en UI (no bloqueante); documentar decisión |
| EC-09 | Editar slot template tras materializar | No retro-propaga a bloques ya creados (materialización es snapshot) |
| EC-10 | Borrar slot con bloques generados | `weeklySlotId` → null, el bloque datado sobrevive (historial protegido) |
| EC-11 | Alumno removido del curso con bloques futuros asignados | Asignaciones futuras se marcan CANCELLED o se advierten al remover (decisión @architect; nunca dejar alumno externo viendo la clase) |
| EC-12 | Recordatorio automático no activo | Ninguna notificación programada en v1; el contrato del cron queda documentado y el inbox/push inmediato no depende de él |
| EC-13 | Curso archivado | Agenda de sólo lectura/oculta; no se materializan semanas nuevas |

## 7. Dependencias

- **@db-engineer**: migración `0013_*` con 3 tablas, enums `class_block_status`, `block_enrollment_status` (o equivalentes), índices (`courseId`+`blockDate`, UNIQUE `blockId`+`studentId`, `studentId`+fecha) y verificación post-migración de columnas.
- **@auth-security**: `guardAdmin` en mutaciones + ownership por `courses.ownerId` (404 anti-IDOR); `guardUser`+`ACTIVE` en lectura del alumno; revisión de que la agenda no abre superficie a LOCKED.
- **@architect**: contratos API (rutas, Zod, shape de materialización, agregados), timezone, decisión de evento de auditoría y de triggers de notificación.
- **Motor de notificaciones** (`lib/notifications/engine.ts`, `triggers.ts`): nuevos triggers (`class.assigned`, `class.removed`, `class.cancelled`) + `groupId` determinista (p. ej. `class:{blockId}:{studentId}:{action}`).
- **@app-engineer**: UI coach (grilla semanal) + UI alumno móvil-first + E2E.
- **@qa-release**: gates, cobertura, API docs, FEATURES.md, línea de cron standby verificada.
- Sin variables de entorno nuevas en v1 (el cron sería `CRON_SECRET` cuando se active — fuera de v1).

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Scope creep hacia reservas self-service / planes | Alto | Out-of-scope explícito; el alumno no escribe en v1 |
| Materialización duplicada (doble click) | Datos sucios | Transacción + UNIQUE (`weeklySlotId`,`blockDate`) + respuesta de conteo |
| Timezone mal resuelta → clases al día equivocado | Alto (alumno pierde clase) | Decisión documentada de @architect + unit tests de frontera de día |
| Change-map > 5 archivos | Retraso/loops | Fases F0–F6, chunks ≤5 archivos, cross-agent review |
| Cobertura de UI alumno insuficiente | Gate `--coverage` | Tests de lógica pura de agregados en `lib/padel/` + E2E navegable |
| Notificaciones duplicadas al cancelar en lote | Spam | `groupId` por (bloque, alumno, acción) y dedup del engine |
| `class_blocks` sin `weeklySlotId` coherente | Historial roto | `onDelete: set null`, nunca cascade sobre bloques |

## 9. Recordatorio automático — STANDBY documentado

**v1 no implementa recordatorios.** Decisión cerrada (Q4). Se documenta el mecanismo exacto a activar después, calcado de StreetMove (verificado en ese repo): `vercel.json` tiene `crons: []` y el schedule vive en **GitHub Actions** `.github/workflows/cron-external.yml` (`cron: '*/30 * * * *'` + `workflow_dispatch`) que hace `POST`/`GET` a `/api/cron/class-reminders` del deployment de producción.

En v1 sólo se deja el **contrato documentado** en `technical-design.md` (payload, auth por secret, ventana de 24 h previas, marcar `reminderSentAt` para idempotencia). Activarlo debe costar **1 archivo de workflow** + 1 endpoint, sin migración adicional. Prohibido crear el workflow en v1.

## 10. Tests requeridos

| Capa | Archivos | Cobertura mínima |
|---|---|---|
| Unit | `tests/unit/padel/class-agenda.test.ts` (materialización de semana, validación de cupo, agregados/% asistencia, dedup `groupId`), `tests/unit/validations/padel.test.ts` (schemas nuevos) | Lógica pura 100 % de ramas de negocio |
| API guard | `tests/api/padel/class-agenda-guard.spec.ts` | 401 sin sesión, 403 USER en endpoints coach, 404 recurso ajeno |
| API happy-path (SQL real) | `tests/api/padel/class-agenda-happy.spec.ts` | ≥1 por endpoint nuevo: slots, materializar semana, asignar, asistencia, historial alumno |
| E2E | `tests/e2e/class-agenda.spec.ts` | Coach habilita semana y asigna; alumno ve "Mis próximas clases" en 375 px |
