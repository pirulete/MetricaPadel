# Release Scope — Agenda de clases por curso (v0.11)

> change_id: `2026-11-04-class-agenda`
> status: `proposed`
> release objetivo: `v0.11` (a confirmar por @architect/@qa-release al cierre)
> date: `2026-11-04`
> module: `padel`
> feature-spec: `./feature-spec.md`

---

## 1. Qué entra

| # | Item | Valor | Evidencia de aceptación |
|---|---|---|---|
| 1 | `weekly_slots` (template semanal por curso) | Coach define día/hora/duración/tipo una vez | AC-01 unit + API happy |
| 2 | Habilitar semana → `class_blocks` datados | De texto a fechas reales, idempotente | AC-02 unit + API happy |
| 3 | Edición de bloques sueltos + estados PROGRAMADA/COMPLETADA/CANCELADA | Operación semanal real | AC-04 API |
| 4 | `block_enrollments` con validación de inscripción + `maxCapacity` nullable | Sin alumnos fantasma, sin sobrecupo | AC-03 unit + API |
| 5 | Asistencia (`attended` 0/1/null) + `notes` | Base de métricas futuras | AC-04 unit |
| 6 | Notificaciones inmediatas inbox+push (asignar/remover/cancelar) con dedup `groupId` | El alumno se entera en la app | AC-05 unit + API |
| 7 | Historial + agregados del alumno (programadas/asistidas/canceladas/% asistencia) | Visibilidad y valor percibido | AC-06 API happy |
| 8 | UI coach: grilla semanal del curso + asignar + asistencia + cancelar | Operación completa | E2E |
| 9 | UI alumno móvil-first: "Mis próximas clases" + historial | Core del valor | AC-07 E2E 375 px |
| 10 | Auditoría + `lib/api-docs/spec.ts` + `FEATURES.md` | Cumplimiento de gates | AC-08/AC-09 |

## 2. Qué NO entra

- Grilla semanal completa del alumno (calendario navegable por semana) — futuro.
- Dashboard avanzado de métricas/evolución de asistencia del alumno — futuro.
- **Ejecución** del recordatorio automático (workflow GH Actions / `/api/cron/class-reminders`) — standby documentado, sólo contrato.
- Reservas self-service del alumno (book/cancel propio), planes, límites, `bookedBy`, lista de espera.
- Multi-academia en agenda, precios de clase, export iCal, reprogramación automática, backfill/import CSV.
- Cambios en `courses.schedule` (el varchar existente se mantiene como display legacy, no se migra ni se borra).

## 3. Fases de ejecución

| Fase | Contenido | Agente | Gate de salida |
|---|---|---|---|
| **F0 · Schema** | 3 tablas (`weekly_slots`, `class_blocks`, `block_enrollments`), enums de status, UNIQUE (`weeklySlotId`,`blockDate`) y (`blockId`,`studentId`), índices por curso/fecha y alumno/fecha; migración `0013_*` | @db-engineer | `db:generate` + `db:migrate` + verificación de columnas |
| **F1 · Lógica pura + contratos** | Zod en `lib/validations/padel.ts`; `lib/padel/class-agenda.ts` (materialización, cupo, agregados/% asistencia, `groupId`); contratos API documentados | @architect + @db-engineer | Technical design con endpoints y shapes cerrados |
| **F2 · API coach** | Slots, materializar semana, bloques, asignar/quitar, asistencia, cancelar; `guardAdmin` + ownership 404 + auditoría | @app-engineer (+@auth-security review) | API guard + happy-path con SQL real |
| **F3 · Notificaciones** | Triggers `class.assigned` / `class.removed` / `class.cancelled` sobre el engine existente, `groupId` determinista | @app-engineer + @auth-security | Unit dedup + inbox-first (push falla → mutación vive) |
| **F4 · UI coach** | Grilla semanal del curso, "Habilitar Sem N", dialog asignar, marcar asistencia, cancelar con confirm | @app-engineer | E2E coach |
| **F5 · UI alumno** | "Mis próximas clases" + historial, móvil-first, empty/loading/error | @app-engineer | E2E alumno 375 px |
| **F6 · Tests & docs** | Unit/API/E2E completos, `lib/api-docs/spec.ts`, `FEATURES.md`, `tsc`/`lint`/`build`/coverage | @qa-release | Gates verdes + release-report |

## 4. Impacto por agente

| Agente | Impacto | Archivos esperados |
|---|---|---|
| @db-engineer | Alto | `lib/db/schema.ts`, `drizzle/0013_*`, `lib/db/queries/padel/class-agenda.ts` ✨, `tests/unit/db/*` |
| @auth-security | Medio | Revisión de guards/ownership/auditoría en mutaciones; sin cambios en `auth.ts` |
| @app-engineer | Alto | `app/api/courses/[id]/agenda/*`, `app/api/blocks/*` o equivalente, UI en `components/padel/`, `hooks/`, `tests/api/padel/*`, `tests/e2e/*` |
| @admin-engineer | Nulo | Sin back-office nuevo (el coach es `ADMIN` y opera en `app/(app)`) |
| @ui-designer | Opcional | Mockup efímero de grilla coach/alumno si el orquestador lo invoca |
| @ponytail-reviewer | Medio | Revisión de la grilla semanal y de la lógica de materialización |
| @qa-release | Medio | Gates, cobertura, API docs, E2E |

## 5. Riesgos de release

- **Tamaño**: change-map superará **5 archivos** (schema + API + UI + tests) ⇒ `split` en chunks ≤5 y **Cross-Agent Review obligatorio** antes de implementar; ninguna fase asigna >5 archivos a un solo agente sin dividir.
- **Timezone**: si @architect no fija regla explícita, AC-02/AC-06 fallan intermitentemente → bloqueante para F2.
- **Cobertura**: UI nueva sin lógica pura testeable puede tumbar el gate `--coverage` > 3 % ⇒ F1 debe extraer materialización/agregados a `lib/padel/` testeable en Jest.
- **Scope**: presión para incluir reservas self-service o el cron ⇒ rechazado por decisión cerrada Q4/out-of-scope.
- **Migración**: patrón conocido del repo — el migrador reporta éxito sin ejecutar ⇒ verificar columnas con `information_schema` antes de F2.

## 6. Dependencias y bloqueos

- Sin variables de entorno nuevas en v1 (`CRON_SECRET` sólo cuando se active el recordatorio, fuera de v1).
- Depende de `courses`/`course_enrollments` (v0.1/v0.2) y del motor de notificaciones (v0.3) — estables.
- No bloquea ni es bloqueado por la agenda de transiciones (feature independiente).

## 7. Criterio de cierre del release

Los 9 AC de `feature-spec.md` verificados, `tsc`=0, `lint`=0 errores, `build` OK, unit + ≥1 happy-path SQL real por endpoint + ≥1 E2E navegable, cobertura sin regresión >3 %, `lib/api-docs/spec.ts` y `FEATURES.md` actualizados, y recordatorio automático documentado como standby (sin workflow creado).
