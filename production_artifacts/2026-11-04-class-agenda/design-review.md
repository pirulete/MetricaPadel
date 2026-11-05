# Design Review — Viabilidad técnica (cross-agent review)

> change_id: `2026-11-04-class-agenda` · autor: @app-engineer · date: `2026-11-04`
> Alcance: validación de `technical-design.md` v1 + `change-map.md` v1 contra el **código real** del repo.
> Método: lectura directa de guards, audit, engine de notificaciones, push, queries de cursos/inscripciones, schema Drizzle, route handlers con params anidados, validaciones y componentes a modificar. Sin ejecutar build/tests (anti-loop).
> Veredicto global: **IMPLEMENTABLE con 3 correcciones bloqueantes** (ninguna requiere cambiar el modelo de dominio ni el alcance funcional).

---

## 0. Resumen

| Severidad | Nº | Tema |
|---|---|---|
| 🔴 Bloqueante | 3 | `groupId` no es uuid · cursor U2 incompatible con Zod actual · `getCourseById` no devuelve el curso |
| 🟡 Ajuste | 11 | timezone/`APP_TIMEZONE` mal documentado · primera columna `date` del repo · rationale D4 · AC-05 vs engine · limit U1 · Zod `.partial()` vacío · orden C11 · conteos del change-map · EC-11 en UI · split de C1 · (confirmaciones) |
| 🟢 Confirmado | 12 | guards, audit, dedup 1 h, engine no-push, ownership, params anidados, paginación, `CRON_SECRET`/sin `vercel.json`, tabs, dashboard alumno |

Los 3 bloqueantes son **correcciones de contrato/documentación, no de alcance**: no mueven ninguno de los 34/44 archivos previstos ni añaden endpoints.

---

## 1. Hallazgos bloqueantes

### 🔴 B1 · `notifications.group_id` es `uuid` — los `groupId` propuestos no se pueden insertar

**Evidencia**
- `lib/db/schema.ts:294` → `groupId: uuid("group_id")`.
- `lib/db/queries/notifications.ts:145` inserta `groupId` tal cual; `:165` compara con `eq(notifications.groupId, groupId)`.
- Convención vigente: todos los `groupId` reales son UUIDs (`app/api/student/evaluations/[id]/read/route.ts:40` usa `evaluationId`; `app/api/academies/[id]/members/invite/route.ts:67` usa `membershipId`).

**Problema** — D12 y §4.3 definen `groupId = block:{blockId}:assigned:{studentId}` (string con `:`). Postgres rechaza el cast a `uuid` (`invalid input syntax for type uuid`), por lo que **A10 (asignar), A12 (quitar) y A8-cancel** devolverían 500 al notificar. Lo mismo aplica al contrato del recordatorio futuro (`block:{blockId}:reminder` en §7.2).

**Corrección propuesta (preferida)** — `agendaGroupId()` devuelve un **UUID v5 determinista** derivado del string de evento (`sha256(eventKey)` → nibble de versión 5), seguido exportando el `eventKey` en `metadata.eventKey` para trazabilidad. Es puro (`node:crypto`, sin DB), testeable en Jest y no toca el engine ni el schema.
- `assigned` → uuidv5(`block:{blockId}:assigned:{studentId}`)
- `removed` → uuidv5(`block:{blockId}:removed:{studentId}`)
- `cancelled` → uuidv5(`block:{blockId}:cancelled`)

**Alternativa descartada** — usar `blockId` como `groupId`: la dedup es `(userId, groupId)`, así que un "assigned" y un "cancelled" del mismo bloque para el mismo alumno dentro de la hora **colapsarían** y la cancelación no se notificaría. Inaceptable para AC-05/EC-05.
**Ajuste obligatorio en artifacts**: D12 + §4.3 + §7.2 + `tests/unit/padel/class-agenda.test.ts` (validar regex uuid, determinismo y unicidad entre los 3 eventos).

### 🔴 B2 · El cursor de U2 (`YYYY-MM-DDTHH:mm`) es rechazado por `paginationQuerySchema`

**Evidencia** — `lib/validations/padel.ts:20-23` define `cursor: z.string().datetime({ offset: true, ... })`. Verificado en runtime: `'2026-11-04T18:00'` → **false**, `'2026-11-04T18:00:00.000Z'` → true, `'2026-11-04'` → false.

**Problema** — §3.3 U2 define el cursor como `"YYYY-MM-DDTHH:mm"`. Si el implementador reutiliza `paginationQuerySchema` (patrón G15 "heredado"), **toda petición con `?cursor=` devuelve 400** y el botón "Cargar más" muere silenciosamente. Además el cursor no es un instante ISO: es un par `(date, time)` wall-clock.

**Corrección propuesta** —
- `agendaHistoryQuerySchema` propio en `lib/validations/class-agenda.ts` con `cursor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, ...)` (no reutilizar `paginationQuerySchema`).
- Comparación compuesta explícita con SQL: `(block_date, start_time) < ($cursorDate, $cursorTime)` + `ORDER BY block_date DESC, start_time DESC`, `limit+1` para `hasMore` (mismo patrón `limit+1` de `pagination.ts`, sin reutilizar su tipo de cursor).
- En `lib/api-docs/paths/student-agenda.ts`, el cursor se documenta como `type: string` con `pattern` (no `format: date-time`).

### 🔴 B3 · `getCourseById()` devuelve `CourseDetail`, no el curso → el check de EC-13 quedaría muerto

**Evidencia** — `lib/db/queries/padel/courses.ts:148-181`: `getCourseById(ownerId, id): Promise<CourseDetail | null>` con `{ course, students, rubrics }`. El único uso actual hace `detail.course.name` (`app/api/courses/[id]/route.ts:73`).

**Problema** — §3.2 escribe el pseudo-flujo `guardAdmin → getCourseById(session.user.id, id) → null = 404 → si course.status === 'archived' ⇒ 409`. Un implementador siguiendo la letra escribiría `getCourseById(...).then(c => c.status)` → `undefined` → **nunca** devuelve 409 `AGENDA_COURSE_ARCHIVED` (EC-13 se incumple en silencio). Además ese helper ejecuta **3 queries** (curso + alumnos + rúbricas) en los 12 handlers de coach: coste innecesario para un check de ownership.

**Corrección propuesta** — añadir `getCourseOwned(ownerId, id)` (select de la fila `courses`, ≤10 líneas, en el mismo módulo) y usarlo en todos los handlers de agenda; `getCourseById` se mantiene intacto para P07. Añadir a C1 (queries) y a `change-map` (sin cambiar el cómputo de archivos: va en el mismo `class-agenda.ts`).

---

## 2. Ajustes (no bloquean, pero deben corregirse antes de implementar)

### 🟡 A1 · D3/delta 7 sobre timezone: la premisa "verificado en el repo" es incorrecta

- `lib/date-utils.ts:17` → `const CHILE_TIME_ZONE = 'America/Santiago'` **hardcodeado**; el archivo **no lee `process.env.APP_TIMEZONE`** (0 coincidencias).
- `.env.example:46-48` afirma *"usado por lib/date-utils.ts"* y fija `APP_TIMEZONE=UTC` → **hoy es mentira**: cambiar esa variable no altera nada.
- `lib/date-utils.ts` es **código muerto en este repo**: 0 imports de `todayInChileStr`/`getIsoDayOfWeek`/`parseLocalDate` fuera del propio archivo (grep en `app/`, `components/`, `lib/`, `tests/`), y su cabecera habla de "Street Move" y de `check_in_date`, inexistente aquí.

**Decisión**: D3 (wall-clock `date` + `HH:mm`) es **correcta** y se confirma; lo que se corrige es la justificación: no es "patrón verificado", es **primera adopción** de un helper heredado. Texto sugerido para §2.4: *"`lib/date-utils.ts` hoy hardcodea `America/Santiago` e ignora `APP_TIMEZONE`; es el único punto a tocar si el club cambia de TZ (1 archivo, sin migración)"*. **No** declarar que `APP_TIMEZONE` gobierna el runtime.

### 🟡 A2 · D3 introduce la primera columna `date` del repo
`grep 'date('` en `lib/db/schema.ts` → 0 columnas `date`; **todo** es `timestamp()` (55 coincidencias) y `courses.days` es `jsonb` de labels (`schema.ts:464`). Confirmar D3 pero documentarlo en `ARCHITECTURE.md` como convención nueva ("fechas de dominio = `date` string + `varchar(5)` time") y dejar de citar `courses.days` como precedente.

### 🟡 A3 · D4 (ISO 1–7): decisión OK, rationale incorrecta
`getIsoDayOfWeek` (`date-utils.ts:110-113`) devuelve 1–7 pero **no tiene callers**. `DAY_OPTIONS = ["Lun"…"Dom"]` (`components/padel/create-course-modal.tsx:23`) son **labels** guardados en `courses.days` (jsonb), no enteros. No existe hoy convención entera que respetar. Se **confirma** ISO 1–7 (mejor que 0–6), corrigiendo el texto: la UI debe mapear `label → index+1`; requiere **ack de @pm** para reescribir AC-01.

### 🟡 A4 · AC-05 "inbox y push según preferencias" no refleja el engine
`engine.createNotification` (`lib/notifications/engine.ts:43-49`) **siempre** persiste el inbox y no consulta `notification_preferences`; solo el push se filtra por preferencias (§4.1, correcto). Reescribir AC-05: *"inbox siempre (inbox-first); push según `notification_preferences`"*.

### 🟡 A5 · U1 `limit` default 5 vs `resolveLimit` default 20
`resolveLimit` (`pagination.ts:21-23`) → default 20, máx 50. U1 pide default 5. Solución: `studentAgendaQuerySchema` con `.default(5)` propio y **no** llamar a `resolveLimit` en U1; U2 sí lo usa (con `limit+1`).

### 🟡 A6 · `weeklySlotUpdateSchema`/`blockUpdateSchema`: `.partial()` acepta `{}` pero A3 exige "≥1 campo"
Regla vigente del repo: `.extend()` solo sobre `ZodObject` limpio y `refine/superRefine` **al final** (`lib/validations/padel.ts:191-195`, precedente `transitionCreateSchema:252-254`). Añadir `.refine(v => Object.keys(v).length > 0)` **como último eslabón** (devuelve `ZodEffects`) y no volver a extenderlo. Idéntico para `blockUpdateSchema`.

### 🟡 A7 · Orden de chunks: C11 (tests API) debe ir antes de la UI
`change-map.md:18-21` pone C11 tras C10 (UI). Mover **C11 tras C5**: los contratos (códigos 400/404/409, shape `{items,nextCursor}`, dedup) se validan con SQL real antes de cablear 7 componentes, evitando rework de UI. C3 **debe** seguir antes de C4 (los handlers importan `notifyClassEvent`).

### 🟡 A8 · Conteo del change-map
Header: "Total: 34 archivos (24 nuevos, 8 modificados, 2 borrados)". El archivo tiene **44 filas numeradas sin huecos ni duplicados** (verificado: 44 filas, máximo 44). Recalcular para `evidence-manifest.json` y para el gate de QA.

### 🟡 A9 · C6 dice "3 archivos" y lista 4
`paths/class-agenda.ts` + `paths/student-agenda.ts` + `schemas/class-agenda.ts` + `spec.ts` = 4 (sigue ≤5, pero el conteo debe ser exacto). Si se respeta el límite, C6 y C7 pueden ir juntos (4+1 = 5).

### 🟡 A10 · EC-11: el alumno removido del curso sigue apareciendo "asignado" en el bloque
`block_enrollments` no se toca al ejecutar G12 (`courses.ts:261-269` solo borra `course_enrollments`). El "asignados" del sheet se resolverá con `users` (por `block_id`), pero la lista de **disponibles** debe venir de `course_enrollments` (`enrollments.ts:161-174`), no de `users`. Documentar explícitamente: el removido sigue asignado al bloque (historial), no aparece como disponible, y deja de verlo en `/api/student/agenda` por el `INNER JOIN`. Sin cambio de código en G12 (coherente con §3.2, pero debe quedar escrito).

### 🟡 A11 · `class-agenda.ts` de queries excederá 400 líneas con 12 funciones
C1 ya prevé el split, pero **si se ejecuta en el mismo chunk, C1 pasa a 6 archivos** (>5). Recomendación: cerrar C1 en 5 (schema + migración + `class-agenda.ts` con slots/weeks + barrel) y abrir **C1b** con `class-agenda-blocks.ts` (bloques, asignaciones, queries de alumno) + actualización del barrel. Ver `app-notes.md` §3.

---

## 3. Confirmaciones (verificadas contra código)

| # | Assumption del diseño | Evidencia |
|---|---|---|
| C1 | `guardAdmin`/`guardUser` 401/403 + ACTIVE; ADMIN ∪ SUPER_ADMIN = coach | `lib/auth/admin-guard.ts:67-75` (`isAdminRole`), `:54-65` (TEMPORARY→403, LOCKED→403) |
| C2 | `auditCreate/Update/Delete` con `AuditContext` + `extractRequestContext` | `lib/audit/helpers.ts:18-69`, `:238-246` |
| C3 | Dedup del engine = **1 h** (no 24 h) | `lib/db/queries/notifications.ts:157-170` (`60 * 60 * 1000`) — **D12 es correcto**, AC-05 debe cambiar |
| C4 | El engine **no** envía push | `lib/notifications/engine.ts:6` (comentario) y ausencia de imports de `lib/push` |
| C5 | `getActiveSubscriptions(userId)` + `sendBulkPushTracked(subs, payload)` encajan | `lib/db/queries/push.ts:72-79` (filas con `endpoint/p256dh/auth`) ↔ `lib/push/sender.ts:49-53` (structural) |
| C6 | Preferencias por canal×categoría con default `enabled=true` | `lib/db/queries/notifications.ts:176-180`, `schema.ts:340-348` |
| C7 | Ownership por `courses.ownerId` en **todas** las queries de curso, 404 | `lib/db/queries/padel/courses.ts:84-117,148-181,187-199,205-211` |
| C8 | Inscripción consultable por (`courseId`,`studentId`) para AC-03 | `lib/db/queries/padel/enrollments.ts:179-187`; alumnos del curso `:161-174` |
| C9 | Patrón de route handler con params anidados `Promise<{...}>` | `app/api/courses/[id]/students/[studentId]/route.ts:16-27` (precedente directo de `[id]/agenda/.../[studentId]`) |
| C10 | Convención de respuesta paginada `{ items, nextCursor }` | `lib/db/queries/padel/pagination.ts:15-18`, `paths/courses.ts` (OpenAPI) |
| C11 | `CRON_SECRET` ya existe, no hay `vercel.json`, workflows solo `ci.yml` | `.env.example:41`; `ls vercel.json` → no existe; `.github/workflows/` → `ci.yml` |
| C12 | Añadir tab a `course-detail` es seguro (`defaultValue="students"`) | `components/padel/course-detail.tsx:166-170` |
| C13 | Insertar card en `student-dashboard` es de bajo riesgo | `components/padel/student-dashboard.tsx:48-77` (loading propio), `:102-128` (secciones independientes) |
| C14 | Split de `agenda`/`student` bajo `[id]` no colisiona | `app/api/courses/[id]/` = `enrollment`, `rubrics`, `students`, `route.ts` |
| C15 | Zod 3.25 / Drizzle 0.45 soportan `.extend`→`.superRefine`, `uniqueIndex().where()`, `onConflictDoNothing` | `package.json` (`zod 3.25.76`, `drizzle-orm ^0.45.1`); precedente `lib/db/queries/padel/pair.ts` (tx) |

---

## 4. Riesgo sobre features existentes

| Feature | Riesgo | Evidencia / mitigación |
|---|---|---|
| Tabs de `course-detail` (Alumnos/Rúbricas) | **Bajo** | Tab nuevo es aditivo; `defaultValue="students"` intacto (`course-detail.tsx:166`). |
| `student-dashboard` (nivel + cursos + notificaciones) | **Bajo** | Cada bloque tiene fetch/loading independiente; la card nueva no bloquea el render (`student-dashboard.tsx:48-77`). |
| Notificaciones existentes (evaluación, academia) | **Bajo** | No se tocan `engine.ts`/`triggers.ts`/`priority.ts`; el orquestador llama `createNotification` directamente. **Riesgo residual**: si B1 no se corrige, la excepción del cast uuid podría escapar del orquestador → obligatorio `try/catch` por alumno (ya previsto en §4.3). |
| `courses.schedule` legacy | **Nulo** | Sigue siendo `varchar` display; ninguna query nueva lo lee ni lo migra (`schema.ts:464-468`, `courses.ts:38-44`). |
| G12 `removeStudentFromCourse` | **Bajo, documentar** | Ver A10. |
| `GET /api/courses/[id]` | **Nulo** | B3 propone un helper nuevo; no modifica `getCourseById`. |
| Cobertura del módulo | **Medio** | 7 componentes nuevos sin lógica de negocio → el 95 % exigido se concentra en `lib/padel/class-agenda.ts` (Jest), como ya prevé §8. |

---

## 5. Tests: cobertura de AC (validación del plan)

| AC | Cubierto por | Observación |
|---|---|---|
| AC-01 | unit validations + guard 401/403/404 | OK. Añadir caso `dayOfWeek=0` y `8` (ya previsto), y `durationMinutes` 14/181. |
| AC-02 | unit `buildMaterializationPlan` + happy POST weeks ×2 | OK. La idempotencia **real** depende del UNIQUE parcial; el test debe assertear `created`/`skipped` y `COUNT(*)` en SQL. |
| AC-03 | unit `validateAssignment` + happy 201/400/409 | OK. Falta nombre exacto del test de "409 sin escritura" (contar filas antes/después). |
| AC-04 | unit `canEditTiming` + happy attendance tri-estado + `audit_logs` | OK. |
| AC-05 | unit `agendaGroupId` + happy "2 POST ⇒ 1 inbox" | **Depende de B1**: el test fallará con 500 hasta cambiar a uuid. El test debe consultar `/api/user/notifications` (ruta existe: `app/api/user/notifications/route.ts`). |
| AC-06 | unit `computeAttendanceAggregates` + happy U1/U2 + 404 ajeno | **Depende de B2** (cursor). Añadir caso `attendanceRate = null` y redondeo 3 decimales. |
| AC-07 | E2E 375 px | Precedente de `test.use({ viewport })` en `tests/e2e/transition-editor.spec.ts:93`. Reutilizable. |
| AC-08 | ≥1 happy por endpoint (14) + guards | Reutilizar helpers existentes (`tests/api/admin/marketing/helpers`: `createUser`, `getPool`, `createAuthedContext`) — confirmado en `tests/api/padel/pair-evaluations-happy.spec.ts:9-13`. |
| AC-09 | happy `audit_logs` | OK; `audit*` usan `db` global (no tx) ⇒ deben invocarse post-commit (coherente con §3). |

Ningún AC queda sin test. El plan es correcto **una vez** movido C11 antes de la UI (A7) y resueltos B1/B2.

---

## 6. Deltas que @architect marcó para ack — veredicto

| Delta | Veredicto | Motivo |
|---|---|---|
| **`dayOfWeek` 1–7 vs spec 0–6** | **CONFIRMO la decisión, CORRIJO el rationale** | ISO 1–7 es mejor; pero `getIsoDayOfWeek` no tiene callers y `DAY_OPTIONS` son labels, no enteros (A3). Requiere ack de @pm para AC-01. |
| **Dedup engine 1 h vs 24 h** | **CONFIRMO (hecho verificado)** | `queries/notifications.ts:160`. No tocar el motor. @pm debe reescribir AC-05. |
| **Zod en archivo nuevo `lib/validations/class-agenda.ts`** | **CONFIRMO** | `padel.ts` = 273 líneas y solo rúbricas/evaluaciones/transiciones; precedente `lib/validations/notifications.ts`. |
| **EC-11 sin cancelación en lote** | **CONFIRMO el scope, AÑADO matiz de UI** | El `INNER JOIN` oculta la clase al removido, pero el bloque lo sigue mostrando asignado (A10): debe quedar escrito y la lista de disponibles debe salir de `course_enrollments`. |

---

## 7. Bloqueantes de implementación (checklist previo a C2)

- [ ] **B1** — D12/§4.3/§7.2: `groupId` → UUID v5 determinista; `agendaGroupId()` devuelve uuid; tests actualizados.
- [ ] **B2** — §3.3 U2: cursor propio (`regex`), comparación compuesta `(block_date,start_time)`, sin `paginationQuerySchema`; docs sin `format: date-time`.
- [ ] **B3** — §3.2: `getCourseOwned(ownerId,id)` para los 12 handlers; nunca `course.status` sobre `CourseDetail`.
- [ ] A1–A11 aplicados en `technical-design.md` v2 / `change-map-v2.md` (v1 no se sobrescribe) antes de C2.
