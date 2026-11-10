# Change Map v2 — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · date: `2026-11-04` · autor: @architect
> Fuente: `technical-design-v2.md` (D1–D20). Reemplaza a `change-map.md` v1 (**v1 intacto**, no se sobrescribe).
> **Total: 51 archivos (37 nuevos — 2 de ellos generados por `db:generate` —, 12 modificados, 2 borrados)** ⇒ **`split` obligatorio**: ningún chunk supera 5 archivos y ningún agente recibe >5 archivos por invocación.

## Leyenda

`tipo`: ✨ nuevo · MOD modificado · 🗑 borrar · ⚙ generado (nunca a mano)
`líneas`: estimación post-cambio (⚠️ >300 = vigilar, `split` = dividir antes de asignar)
`estado`: `pendiente` salvo indicación

### Cambios respecto a v1 (trazabilidad)

| Cambio | Motivo | Efecto en el mapa |
|---|---|---|
| `C1` → **C1a + C1b** | `class-agenda.ts` con 12 funciones >400 líneas ⇒ `split` (A11); además `getCourseOwned` (B3) entra en `courses.ts` | +1 archivo (`class-agenda-blocks.ts`) |
| `agenda-group-id.ts` ✨ | `groupId` debe ser uuid (B1); `node:crypto` no puede vivir en el módulo client-safe (D19) | +1 archivo +1 test |
| `getCourseOwned` en `courses.ts` MOD | `getCourseById` devuelve `CourseDetail` (B3) | +1 archivo MOD |
| `tests/unit/db/courses.test.ts` MOD | spec de `getCourseOwned` (B3) | +1 archivo MOD |
| `.env.example` MOD | comentario de `APP_TIMEZONE` es falso hoy (A1/D18) | +1 archivo MOD |
| `C11` adelantado tras `C5`; `C6`+`C7` agrupados | contrato antes de UI (A7, A9) | mismo nº de archivos |
| Header v1 decía "34 archivos (24/8/2)"; realidad v1 = **45** (34/9/2) y v2 = **51** (37/12/2) | conteo (A8) | corrige `evidence-manifest.json` |

---

## Orden de ejecución (dependencias duras) — v2

```
C1a (DB schema + queries slots/weeks + getCourseOwned)
   └─► C1b (queries blocks/enrollments/student + barrel + unit test)
          └─► C2 (lógica pura + agenda-group-id + Zod) ─► C3 (notificaciones)
                 └─► C4 (API coach slots/weeks/blocks) ─► C5 (API coach enrollments + alumno)
                        ├─► C6+C7 (api-docs + protected-routes)
                        └─► C11a ─► C11b (TESTS API — movidos aquí)
                               └─► C8 ─► C9 ─► C10 (UI) ─► @ponytail-reviewer ─► C12 (E2E) ─► C13 (docs) ─► C13b (cleanup)
```

`@db-engineer` (C1a, C1b) → `@app-engineer` (C2, C3, C4, C5, C11a, C11b, C8, C9, C10) → `@app-engineer`/`@auth-security` (C6+C7) → `@ponytail-reviewer` (tras C10) → `@qa-release` (C12, C13, C13b + gates).

**Ruta crítica**: C1a → C1b → C2 → C3 → C4 → C5 → C11a → C11b → C8 → C9 → C10 → C12 → C13.
C6+C7 puede ir en paralelo con C11a (documentan endpoints ya congelados por C5).

**Mapeo con `app-notes.md` (T1–T14)**: T1 = C1a · **T1b nuevo = C1b** · T2 = C2 (con `agenda-group-id.ts`) · T3 = C3 · T4 = C4 · T5 = C5 · T6 = C11a · T7 = C11b · T8 = C6+C7 · T9 = C8 · T10 = C9 · T11 = C10 · T12 = C12 · T13 = C13 · T14 = C13b. (Los chunks conservan el nombre C*; la numeración T de `app-notes` se reajusta al ejecutar.)

---

## C1a · DB schema + queries (slots/weeks) — **@db-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 1 | `lib/db/schema.ts` | MOD | 838 → ~985 | 2 `pgEnum` + 3 tablas + 8 índices + relations. **Excepción de límite aprobada**. |
| 2 | `drizzle/0013_*.sql` | ⚙ | ~70 | `pnpm run db:generate` (journal idx 13). Prohibido SQL a mano. |
| 3 | `drizzle/meta/_journal.json` + snapshot | ⚙ | auto | Verificar orden cronológico post-`generate`. |
| 4 | `lib/db/queries/padel/courses.ts` | MOD | 268 → ~280 | **`getCourseOwned(ownerId, id)`** (B3, ≤10 líneas). `getCourseById` **intacto**. |
| 5 | `lib/db/queries/padel/class-agenda.ts` | ✨ | ~230 | Slots CRUD scoped + `materializeWeek` (tx + `onConflictDoNothing`) + `listBlocksByRange`. Tope duro **≤300 líneas**; lo demás va a C1b. |

**Gate de salida**: `db:generate` + `db:migrate` + `information_schema` (4 columnas de `class_blocks`) + `npx tsc --noEmit` = 0.

---

## C1b · Queries (bloques/enrollments/alumno) — **@db-engineer** (3 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 6 | `lib/db/queries/padel/class-agenda-blocks.ts` | ✨ | ~280 ⚠️ | `listBlockDetail`, `assignStudents` (tx all-or-nothing), `updateAttendance`, `removeEnrollment`, `setBlockStatus`, `listStudentUpcoming`, `listStudentHistory` (cursor `(block_date,start_time)`, **B2**), `getStudentAggregates`. |
| 7 | `lib/db/queries/padel/index.ts` | MOD | +2 | `export * from './class-agenda'` + `'./class-agenda-blocks'`. |
| 8 | `tests/unit/db/courses.test.ts` | MOD | 118 → ~160 | `getCourseOwned`: propio ⇒ fila con `status`; ajeno ⇒ `null`; archivado ⇒ `status:'archived'` (B3). Mock `db.select` (patrón ya existente en el archivo). |

**Gate de salida**: `tsc --noEmit` = 0 · `pnpm run test:unit tests/unit/db/courses.test.ts`.

---

## C2 · Lógica pura + validaciones — **@app-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 9 | `lib/padel/class-agenda.ts` | ✨ | ~250 | `mondayOf`, `buildWeekInfo`, `isValidDateStr`, `isValidTime`, `addMinutes`, `buildMaterializationPlan`, `resolveCapacityRemaining`, `validateAssignment`, `computeAttendanceAggregates`, `canEditTiming`, **`todayInTimeZone`**, `formatBlockDateTime`. **Cero `node:`/`process.env`/DB** (client-safe). |
| 10 | `lib/padel/agenda-group-id.ts` | ✨ | ~40 | `agendaEventKey` + `agendaGroupId` (uuid v5, `node:crypto`). **B1** |
| 11 | `lib/validations/class-agenda.ts` | ✨ | ~150 | 10 schemas. **`agendaHistoryQuerySchema.cursor` = regex `YYYY-MM-DDTHH:mm`** (B2) · **U1 `limit` default 5** (A5) · **`.partial()` + `.refine(v => Object.keys(v).length > 0)` como último eslabón** (A6), nunca `.extend` después. |
| 12 | `tests/unit/padel/class-agenda.test.ts` | ✨ | ~270 | Materialización, frontera semana/año, capacidad, agregados, `canEditTiming`, **`todayInTimeZone`** (UTC vs Buenos Aires). |
| 13 | `tests/unit/validations/class-agenda.test.ts` | ✨ | ~120 | `dayOfWeek` 1–7, `HH:mm`, 15–180, `studentIds` 1..50, tri-estado, **cursor acepta `2026-11-04T18:00` / rechaza `...:00.000Z` y `YYYY-MM-DD`**, `.partial({})` rechazado. |

**Gate de salida**: unit verdes · `tsc` 0 · `class-agenda.ts` sin imports Node.

---

## C3 · Notificaciones — **@app-engineer** (3 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 14 | `lib/notifications/agenda.ts` | ✨ | ~95 | `notifyClassEvent` (inbox + push tolerante a fallo), copy por evento, `groupId: agendaGroupId(...)`, `metadata.eventKey`, respeta `notification_preferences`. **No** toca `engine.ts`/`triggers.ts`/`priority.ts`. |
| 15 | `tests/unit/notifications/agenda.test.ts` | ✨ | ~90 | Push falla ⇒ no propaga; preferencia push off ⇒ 0 push; duplicado ⇒ 0 push. |
| 16 | `tests/unit/padel/agenda-group-id.test.ts` | ✨ | ~70 | Regex uuid v5, determinismo, 3 eventos ⇒ 3 uuids distintos, `studentId` requerido. |

**Gate de salida**: `@auth-security` revisa que el orquestador no pueda notificar a un alumno no inscrito (recibe `studentIds` ya validados por C4/C5).

---

## C4 · API coach — slots, semana y bloques — **@app-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Endpoints |
|---|---|---|---|---|
| 17 | `app/api/courses/[id]/agenda/slots/route.ts` | ✨ | ~90 | A1 GET, A2 POST |
| 18 | `app/api/courses/[id]/agenda/slots/[slotId]/route.ts` | ✨ | ~100 | A3 PUT, A4 DELETE |
| 19 | `app/api/courses/[id]/agenda/weeks/route.ts` | ✨ | ~110 | A5 POST (materialización idempotente en tx) |
| 20 | `app/api/courses/[id]/agenda/blocks/route.ts` | ✨ | ~110 | A6 GET (rango ≤8 semanas), A7 POST |
| 21 | `app/api/courses/[id]/agenda/blocks/[blockId]/route.ts` | ✨ | ~150 | A8 PUT (incluye `status:'cancelled'` → tx + notificación), A9 DELETE |

Patrón obligatorio (B3): `guardAdmin` → **`getCourseOwned(session.user.id, id)`** → `null` ⇒ 404 → `status==='archived'` **y** operación de escritura ⇒ 409 `AGENDA_COURSE_ARCHIVED` → Zod → query con `courseId` → `audit*` post-commit → notificación `Promise.allSettled`.
**Prohibido**: `getCourseById(...).status` (devuelve `CourseDetail`).

---

## C5 · API coach (asignación/asistencia) + alumno — **@app-engineer** (4 archivos)

| # | Archivo | Tipo | Líneas | Endpoints |
|---|---|---|---|---|
| 22 | `app/api/courses/[id]/agenda/blocks/[blockId]/enrollments/route.ts` | ✨ | ~130 | A10 POST (valida `course_enrollments`, capacidad all-or-nothing, 409/400) |
| 23 | `app/api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]/route.ts` | ✨ | ~110 | A11 PUT, A12 DELETE (+ `removed`) |
| 24 | `app/api/student/agenda/route.ts` | ✨ | ~95 | U1 GET (`limit` default 5, `todayInTimeZone(process.env.APP_TIMEZONE ?? 'UTC', new Date())`, `?courseId` no inscrito ⇒ 404) |
| 25 | `app/api/student/agenda/history/route.ts` | ✨ | ~95 | U2 GET (cursor `YYYY-MM-DDTHH:mm`, `limit+1`, comparación compuesta) |

**Anti-IDOR**: coach ⇒ `courses.ownerId`; alumno ⇒ `INNER JOIN course_enrollments`. Sin bypass SUPER_ADMIN (D9).

---

## C6 + C7 · API docs + guards — **@app-engineer** / **@auth-security** (5 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 26 | `lib/api-docs/paths/class-agenda.ts` | ✨ | ~240 | A1–A12 (coach). |
| 27 | `lib/api-docs/paths/student-agenda.ts` | ✨ | ~120 | U1–U2. Cursor documentado como `type: string` + `pattern` (**sin** `format: date-time`). |
| 28 | `lib/api-docs/schemas/class-agenda.ts` | ✨ | ~150 | DTOs + `AgendaError` + `AttendanceAggregates`. |
| 29 | `lib/api-docs/spec.ts` | MOD | +8 | Registro de paths, schemas y tags `Padel Agenda` / `Padel Student Agenda`. **Gate `--api-docs`**. |
| 30 | `lib/auth/protected-routes.ts` | MOD | 542 → ~600 | 14 entradas (`guard`, `allowedStatuses:['ACTIVE']`, `roles`, `antiIdor`, `audit`). Sin tocar `auth.ts`/`admin-guard.ts`. |

**Gate de salida (`auth-impact.md`)**: 401 sin sesión ×14 · 403 USER en los 12 de coach · 404 recurso ajeno · 409 curso archivado · auditoría en toda mutación · LOCKED nunca.

---

## C11a · Tests API coach — **@app-engineer** (2 archivos) — *adelantado*

| # | Archivo | Tipo | Líneas | Cobertura |
|---|---|---|---|---|
| 31 | `tests/api/padel/class-agenda-guard.spec.ts` | ✨ | ~170 | 401 ×14, 403 USER ×12, 404 curso/bloque ajeno, **404 bloque de otro curso**, **409 `AGENDA_COURSE_ARCHIVED`** (EC-13), 400 Zod |
| 32 | `tests/api/padel/class-agenda-happy.spec.ts` | ✨ | ~280 ⚠️ | **SQL real**: A2–A4, A5 ×2 (idempotencia + `COUNT`), A7–A9, A10 (201 / no inscrito 400 / cupo 409 sin escritura), A11 (tri-estado), A12, `audit_logs` |

## C11b · Tests API alumno — **@app-engineer** (1 archivo)

| # | Archivo | Tipo | Líneas | Cobertura |
|---|---|---|---|---|
| 33 | `tests/api/padel/class-agenda-student-happy.spec.ts` | ✨ | ~170 | U1 próximas + agregados; **U2 cursor**: `?cursor=2026-11-04T18:00` ⇒ 200, `...T18:00:00.000Z` ⇒ 400, `2026-11-04` ⇒ 400, página 2 sin duplicados; **dedup 1 inbox** con uuid (2 POST iguales); `metadata.eventKey` |

> Los contratos (400/404/409, `{items,nextCursor}`, dedup) se validan con SQL real **antes** de construir la UI (A7), evitando rework en C8–C10.

---

## C8 · UI coach (componentes) — **@app-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Referencia mockup |
|---|---|---|---|---|
| 34 | `components/padel/agenda-week-list.tsx` | ✨ | ~260 ⚠️ | #1, #5 (loading/error/vacío) |
| 35 | `components/padel/weekly-slot-manager.tsx` | ✨ | ~180 | #1 panel plantilla (`label → index+1` para `dayOfWeek`) |
| 36 | `components/padel/enable-week-dialog.tsx` | ✨ | ~120 | #3 |
| 37 | `components/padel/block-assignment-sheet.tsx` | ✨ | ~300 ⚠️ | #4 (ocupación, asistencia, cancelar); disponibles **desde `course_enrollments`** (EC-11) |
| 38 | `components/padel/block-enrollment-row.tsx` | ✨ | ~80 | #4 fila de asignado (`aria-pressed` 3 estados) |

Tope: si `agenda-week-list.tsx` o `block-assignment-sheet.tsx` exceden 300 líneas ⇒ extraer subcomponente antes de continuar (el `split` con `block-enrollment-row.tsx` ya está previsto).

## C9 · UI coach (hook + wiring) — **@app-engineer** (2 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 39 | `hooks/use-class-agenda.ts` | ✨ | ~180 | Fetch + mutaciones + `toast` Sonner + `router.refresh()`. Único punto de `fetch` de la agenda coach. |
| 40 | `components/padel/course-detail.tsx` | MOD | 249 → ~264 | 3er `TabsTrigger value="agenda"`; `defaultValue="students"` intacto. |

## C10 · UI alumno — **@app-engineer** (4 archivos)

| # | Archivo | Tipo | Líneas | Referencia mockup |
|---|---|---|---|---|
| 41 | `components/padel/upcoming-classes-card.tsx` | ✨ | ~140 | #6, #8 (empty), `id="proximas-clases"`, highlight `?highlight=` |
| 42 | `components/padel/student-course-agenda.tsx` | ✨ | ~180 | #7 (3 métricas + próximas + anteriores + "Cargar más" con cursor) |
| 43 | `components/padel/student-dashboard.tsx` | MOD | 149 → ~155 | Inserta la card entre hero y nivel |
| 44 | `components/padel/student-course-detail.tsx` | MOD | 169 → ~180 | Sección "Mis clases" |

Móvil-first 375 px; sin ítems nuevos en `bottom-nav`; solo tokens de color.
**Gate intermedio**: `@ponytail-reviewer` revisa C8–C10 (net-negative preferido, sin abstracciones nuevas, sin dependencias). **`lib/date-utils.ts` NO se toca ni se borra** (D18, out-of-scope declarado en `technical-design-v2.md` §0 D18 y §9.6).

---

## C12 · E2E — **@qa-release** (escribe @app-engineer, ejecuta QA) (1 archivo)

| # | Archivo | Tipo | Líneas | Flujos |
|---|---|---|---|---|
| 45 | `tests/e2e/class-agenda.spec.ts` | ✨ | ~150 | `test('coach habilita semana y asigna alumno')` + `test('alumno ve próximas clases a 375 px')` (viewport 375×667, empty state, sin scroll horizontal) |

## C13 · Documentación — **@qa-release** (4 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 46 | `FEATURES.md` | MOD | +~60 | Metadata (`status: in-progress`, `release: v0.11`, `module: padel`, `change_id`, tags) |
| 47 | `ARCHITECTURE.md` | MOD | +~30 | Sección "Agenda de clases (v0.11)": 3 tablas, endpoints, **convención nueva `date` string + `varchar(5)` (A2)**, **`todayInTimeZone` + `APP_TIMEZONE` (D18)**, `groupId` uuid v5, cron standby |
| 48 | `.env.example` | MOD | +2/−2 | **Solo comentario** de `APP_TIMEZONE`: hoy afirma "usado por lib/date-utils.ts" (falso) → "usado por la agenda de clases (`lib/padel/class-agenda.ts`) para calcular el día actual". **No se añaden variables** (D13). |
| 49 | `production_artifacts/2026-11-04-class-agenda/evidence-manifest.json` | ✨ | ~60 | Post-flight obligatorio; debe declarar **51 archivos (37/12/2)** |

`AGENTS.md`: **sin cambios** (no cambian roles, workflows, gates ni iteration limits).

## C13b · Cleanup (efímeros) — **@qa-release** (2 borrados)

| # | Archivo | Tipo | Notas |
|---|---|---|---|
| 50 | `components/preview/class-agenda.tsx` | 🗑 | efímero (mockup-spec §7.8) |
| 51 | `app/preview/class-agenda/page.tsx` | 🗑 | solo si existe |

---

## Resumen por agente

| Agente | Chunks | Archivos | Gate de salida |
|---|---|---|---|
| @db-engineer | C1a, C1b | 8 | migración aplicada + 4 columnas verificadas + `tsc` 0 |
| @app-engineer | C2, C3, C4, C5, C11a, C11b, C8, C9, C10 | 29 | typecheck/lint 0, unit + API verdes |
| @app-engineer / @auth-security | C6 + C7 | 5 | gate `--api-docs` + `auth-impact.md` + `security-checklist.md` |
| @ponytail-reviewer | revisión C8–C10 | 0 propios | `ponytail-review-report.md` |
| @qa-release | C12, C13, C13b | 5 (+2 borrados) | `release-report.md`, `test-matrix.md`, `evidence-manifest.json`, gates `--all` |

## Reglas de ejecución

1. **Ningún chunk >5 archivos**; archivo >300 líneas ⇒ vigilar, >400 ⇒ nueva invocación con `split` (C1a/C1b, C8 ya marcados).
2. **Contrato antes de UI**: C11a/C11b se ejecutan **antes** de C8 (A7).
3. Implementadores **no** ejecutan `next build`, `playwright test`, `db:migrate` ni servers (anti-loop); solo `db:generate`/`db:migrate` en C1a/C1b (@db-engineer) y los gates los corre @qa-release.
4. Cada chunk abre/actualiza `task-worksheet.md` antes de escribir código.
5. Si un chunk falla 2 veces ⇒ `escalation-report.md` (no reintentar a ciegas).
6. **Al implementar, la fuente de verdad es `technical-design-v2.md`**, no v1.
