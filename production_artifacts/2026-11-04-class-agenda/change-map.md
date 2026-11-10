# Change Map — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · date: `2026-11-04` · autor: @architect
> Fuente: `technical-design.md` v1 (D1–D16). Versioning: `change-map.md` v1; revisiones → `change-map-v2.md`.
> **Total: 34 archivos (24 nuevos, 8 modificados, 2 borrados)** ⇒ **`split` obligatorio**: ningún chunk supera 5 archivos y ningún agente recibe >5 archivos por invocación.

## Leyenda

`tipo`: ✨ nuevo · MOD modificado · 🗑 borrar · ⚙ generado (nunca a mano)
`líneas`: estimación post-cambio (⚠️ >300 = vigilar, `split` = dividir antes de asignar)
`estado`: `pendiente` salvo indicación

---

## Orden de ejecución (dependencias duras)

```
C1 (DB) ─► C2 (lógica pura + Zod) ─► C3 (notificaciones) ─► C4 ─► C5 (API coach + alumno)
                                                             └─► C6 (api-docs) ─► C7 (protected-routes)
                                                                                 └─► C8 ─► C9 ─► C10 (UI)
C4..C10 ─► C11 (API tests) ─► C12 (E2E) ─► C13 (cleanup + docs)
```
`@db-engineer` (C1) → `@auth-security` (revisión C4/C5 + C7) → `@app-engineer` (C2–C6, C8–C12) → `@ponytail-reviewer` (tras C10) → `@qa-release` (C11–C13 + gates).

---

## C1 · DB schema + migración — **@db-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 1 | `lib/db/schema.ts` | MOD | 838 → ~985 | 2 `pgEnum` + 3 tablas + índices + `$inferSelect/Insert` + relations. **Excepción de límite aprobada** (`lib/db/schema.ts`). |
| 2 | `drizzle/0013_*.sql` | ⚙ | ~70 | `pnpm run db:generate` (journal idx 13). Prohibido SQL a mano. |
| 3 | `drizzle/meta/_journal.json` + snapshot | ⚙ | auto | Verificar orden cronológico post-`generate`. |
| 4 | `lib/db/queries/padel/class-agenda.ts` | ✨ | ~330 ⚠️ | Slots CRUD scoped, `materializeWeek` (tx + `onConflictDoNothing`), `listBlocksByRange`, `listBlockDetail`, `assignStudents` (tx all-or-nothing), `updateAttendance`, `removeEnrollment`, `setBlockStatus`, `listStudentUpcoming`, `listStudentHistory`, `getStudentAggregates`. **Si supera 400 líneas ⇒ `split` en `class-agenda.ts` (slots+weeks) + `class-agenda-blocks.ts`** (ambos exportados por el barrel). |
| 5 | `lib/db/queries/padel/index.ts` | MOD | +1 | `export * from './class-agenda'`. |

**Gate de salida**: `db:generate` + `db:migrate` + verificación `information_schema` de las 4 columnas clave (technical-design §1.6) + `npx tsc --noEmit` = 0.

---

## C2 · Lógica pura + validaciones — **@app-engineer** (4 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 6 | `lib/padel/class-agenda.ts` | ✨ | ~260 | `mondayOf`, `buildWeekInfo`, `buildMaterializationPlan`, `validateAssignment`, `resolveCapacityRemaining`, `computeAttendanceAggregates`, `canEditTiming`, `agendaGroupId`, `formatBlockDateTime`, `isValidTime`. **Cero imports server-side** (Jest puro). |
| 7 | `lib/validations/class-agenda.ts` | ✨ | ~140 | `weeklySlotCreateSchema`, `weeklySlotUpdateSchema`, `materializeWeekSchema`, `blockCreateSchema`, `blockUpdateSchema`, `assignStudentsSchema`, `attendanceSchema`, `agendaRangeQuerySchema`, `studentAgendaQuerySchema`, `agendaHistoryQuerySchema`. (D16: fuera de `padel.ts`). |
| 8 | `tests/unit/padel/class-agenda.test.ts` | ✨ | ~260 | Materialización (idempotencia EC-01, snapshot EC-09), frontera de semana/año, capacidad (EC-04), agregados (`attendanceRate` 0/1/null/redondeo), `canEditTiming` (EC-02), `groupId` estable. |
| 9 | `tests/unit/validations/class-agenda.test.ts` | ✨ | ~110 | `dayOfWeek` 1–7 (rechaza 0 y 8), `HH:mm`, `durationMinutes` 15–180, `studentIds` 1..50, `attended` tri-estado. |

*Nota*: `release-scope.md` F1 listaba `@db-engineer`; se reasigna a `@app-engineer` porque es lógica de aplicación pura y `@db-engineer` ya carga C1.

---

## C3 · Notificaciones — **@app-engineer** (2 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 10 | `lib/notifications/agenda.ts` | ✨ | ~90 | `notifyClassEvent` (inbox + push tolerante a fallo), copy por evento, `groupId` (D12), respeta `notification_preferences`. **No** modifica `engine.ts`/`triggers.ts`/`priority.ts`. |
| 11 | `tests/unit/notifications/agenda.test.ts` | ✨ | ~90 | Mocks de `createNotification`/`getActiveSubscriptions`/`sendBulkPushTracked`: push falla ⇒ no propaga; preferencia push off ⇒ 0 push; duplicado ⇒ 0 push. |

**Gate de salida**: `@auth-security` revisa que el orquestador no pueda notificar a un alumno no inscrito (recibe `studentIds` ya validados por C4/C5).

---

## C4 · API coach — slots, semana y bloques — **@app-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Endpoints |
|---|---|---|---|---|
| 12 | `app/api/courses/[id]/agenda/slots/route.ts` | ✨ | ~90 | A1 GET, A2 POST |
| 13 | `app/api/courses/[id]/agenda/slots/[slotId]/route.ts` | ✨ | ~100 | A3 PUT, A4 DELETE |
| 14 | `app/api/courses/[id]/agenda/weeks/route.ts` | ✨ | ~110 | A5 POST (materialización idempotente en tx) |
| 15 | `app/api/courses/[id]/agenda/blocks/route.ts` | ✨ | ~110 | A6 GET (rango ≤8 semanas), A7 POST |
| 16 | `app/api/courses/[id]/agenda/blocks/[blockId]/route.ts` | ✨ | ~140 | A8 PUT (incluye `status:'cancelled'` → tx enrollments + notificación), A9 DELETE |

Patrón obligatorio: `guardAdmin` → ownership `getCourseById(session.user.id, id)` → 404 → curso archivado ⇒ 409 en escrituras → Zod → query → `audit*` → notificación post-commit (`Promise.allSettled`).

---

## C5 · API coach (asignación/asistencia) + alumno — **@app-engineer** (4 archivos)

| # | Archivo | Tipo | Líneas | Endpoints |
|---|---|---|---|---|
| 17 | `app/api/courses/[id]/agenda/blocks/[blockId]/enrollments/route.ts` | ✨ | ~130 | A10 POST (valida inscripción en el curso, capacidad all-or-nothing, 409/400) |
| 18 | `app/api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]/route.ts` | ✨ | ~110 | A11 PUT (asistencia/notas), A12 DELETE (+ `class.removed`) |
| 19 | `app/api/student/agenda/route.ts` | ✨ | ~90 | U1 GET (próximas + agregados, `?courseId` no inscrito → 404) |
| 20 | `app/api/student/agenda/history/route.ts` | ✨ | ~90 | U2 GET (cursor `YYYY-MM-DDTHH:mm`, `limit+1`) |

**Anti-IDOR**: coach ⇒ `courses.ownerId`; alumno ⇒ `INNER JOIN course_enrollments`. Sin excepciones para SUPER_ADMIN (D9).

---

## C6 · API docs — **@app-engineer** (3 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 21 | `lib/api-docs/paths/class-agenda.ts` | ✨ | ~240 | A1–A9 (coach). |
| 22 | `lib/api-docs/paths/student-agenda.ts` | ✨ | ~120 | U1–U2. **Split declarado** (un solo archivo de 14 operaciones superaría 300 líneas). |
| 23 | `lib/api-docs/schemas/class-agenda.ts` + `lib/api-docs/spec.ts` | ✨/MOD | ~150 / +8 | Schemas + registro de paths, tags `Padel Agenda` / `Padel Student Agenda`. |

*Nota*: si se prefiere mantener 3 archivos en el chunk, `schemas/class-agenda.ts` va junto a `paths/` y `spec.ts` se edita aquí mismo (3 archivos editados, 2 creados → contar como chunk de 4, sigue ≤5).

---

## C7 · Guards / documentación de rutas — **@auth-security** (1 archivo)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 24 | `lib/auth/protected-routes.ts` | MOD | 542 → ~600 | 14 entradas con `guard`, `allowedStatuses: ['ACTIVE']`, `roles`, `antiIdor`, `audit`. Sin tocar `auth.ts` ni `admin-guard.ts`. |

**Gate de salida (`auth-impact.md`)**: 401 sin sesión en los 14; 403 USER en los 12 de coach; 404 recurso ajeno (curso/bloque/inscripción); auditoría presente en toda mutación; LOCKED nunca permitido (lo garantiza `guardUser`/`guardAdmin`).

---

## C8 · UI coach (componentes) — **@app-engineer** (5 archivos)

| # | Archivo | Tipo | Líneas | Referencia mockup |
|---|---|---|---|---|
| 25 | `components/padel/agenda-week-list.tsx` | ✨ | ~260 ⚠️ | #1, #5 (loading/error/vacío) |
| 26 | `components/padel/weekly-slot-manager.tsx` | ✨ | ~180 | #1 panel plantilla |
| 27 | `components/padel/enable-week-dialog.tsx` | ✨ | ~120 | #3 |
| 28 | `components/padel/block-assignment-sheet.tsx` | ✨ | ~300 ⚠️ | #4 (ocupación, asistencia, cancelar) |
| 29 | `components/padel/block-enrollment-row.tsx` | ✨ | ~80 | #4 fila de asignado (`aria-pressed` 3 estados) |

Tope: si `agenda-week-list.tsx` o `block-assignment-sheet.tsx` exceden 300 líneas ⇒ extraer subcomponente de fila/tarjeta antes de continuar (`split` ya previsto con `block-enrollment-row.tsx`).

---

## C9 · UI coach (hook + wiring) — **@app-engineer** (2 archivos)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 30 | `hooks/use-class-agenda.ts` | ✨ | ~180 | Fetch + mutaciones + `toast` Sonner + `router.refresh()`. Único punto de `fetch` de la agenda coach. |
| 31 | `components/padel/course-detail.tsx` | MOD | 249 → ~264 | 3er `TabsTrigger value="agenda"`; `defaultValue="students"` intacto. |

---

## C10 · UI alumno — **@app-engineer** (4 archivos)

| # | Archivo | Tipo | Líneas | Referencia mockup |
|---|---|---|---|---|
| 32 | `components/padel/upcoming-classes-card.tsx` | ✨ | ~140 | #6, #8 (empty), `id="proximas-clases"`, highlight `?highlight=` |
| 33 | `components/padel/student-course-agenda.tsx` | ✨ | ~180 | #7 (3 métricas + próximas + anteriores + "Cargar más") |
| 34 | `components/padel/student-dashboard.tsx` | MOD | 149 → ~155 | Inserta la card entre hero y nivel |
| 35 | `components/padel/student-course-detail.tsx` | MOD | 169 → ~180 | Sección "Mis clases" |

Móvil-first 375 px; sin ítems nuevos en `bottom-nav`; solo tokens de color.

**Gate intermedio**: `@ponytail-reviewer` revisa C8–C10 (net-negative preferido, sin abstracciones nuevas, sin dependencias).

---

## C11 · Tests API — **@app-engineer** (3 archivos)

| # | Archivo | Tipo | Líneas | Cobertura |
|---|---|---|---|---|
| 36 | `tests/api/padel/class-agenda-guard.spec.ts` | ✨ | ~160 | 401 sin sesión (14), 403 USER en coach (12), 404 curso/bloque ajeno, 404 alumno `?courseId` no inscrito, 400 Zod |
| 37 | `tests/api/padel/class-agenda-happy.spec.ts` | ✨ | ~260 ⚠️ | **SQL real**: A2/A3/A4 slots, A5 materializar ×2 (idempotencia), A7/A8/A9 bloques (completed/cancelled), A10/A11/A12 asignación/cupo 409/asistencia, auditoría en `audit_logs` |
| 38 | `tests/api/padel/class-agenda-student-happy.spec.ts` | ✨ | ~150 | U1 próximas + agregados, U2 paginación cursor, dedup de notificación (2 POST ⇒ 1 inbox) |

> Split de happy-path en 2 archivos para no romper el límite de 300 líneas y mantener el foco coach/alumno.

---

## C12 · E2E — **@qa-release** (escribe @app-engineer en C11 si el orquestador lo prefiere) (1 archivo)

| # | Archivo | Tipo | Líneas | Flujos |
|---|---|---|---|---|
| 39 | `tests/e2e/class-agenda.spec.ts` | ✨ | ~150 | `test('coach habilita semana y asigna alumno')` + `test('alumno ve próximas clases a 375 px')` (viewport 375×667, empty state, sin scroll horizontal) |

---

## C13 · Cleanup + documentación — **@qa-release** (3 archivos + 2 borrados)

| # | Archivo | Tipo | Líneas | Notas |
|---|---|---|---|---|
| 40 | `components/preview/class-agenda.tsx` | 🗑 | — | efímero (mockup-spec §7.8) |
| 41 | `app/preview/class-agenda/page.tsx` | 🗑 | — | solo si existe |
| 42 | `FEATURES.md` | MOD | +~60 | Entrada con metadata (`status: in-progress`, `release: v0.11`, `module: padel`, `change_id`, tags) |
| 43 | `ARCHITECTURE.md` | MOD | +~25 | Sección "Agenda de clases (v0.11)": 3 tablas, endpoints, timezone D3, cron standby |
| 44 | `production_artifacts/2026-11-04-class-agenda/evidence-manifest.json` | ✨ | ~60 | Post-flight obligatorio |

`AGENTS.md`: **sin cambios** (no cambian roles, workflows, gates ni reglas). `.env.example`: **sin cambios** (D13; `CRON_SECRET` ya existe).

---

## Resumen por agente

| Agente | Chunks | Archivos | Gate de salida |
|---|---|---|---|
| @db-engineer | C1 | 5 | migración aplicada + columnas verificadas |
| @auth-security | revisión C4/C5 + C7 | 1 propio (+review) | `auth-impact.md` + `security-checklist.md` |
| @app-engineer | C2, C3, C4, C5, C6, C8, C9, C10, C11 | 25 | typecheck/lint 0, unit + API verdes |
| @ponytail-reviewer | revisión C8–C10 | 0 propios | `ponytail-review-report.md` |
| @qa-release | C12, C13 | 4 (+2 borrados) | `release-report.md`, `test-matrix.md`, `evidence-manifest.json` |

## Reglas de ejecución

1. **Ningún chunk >5 archivos**; si un archivo supera 400 líneas ⇒ nueva invocación con `split` (C1 #4, C8 #25/#28 ya marcados).
2. **Cross-Agent Review obligatorio** antes de F4 (UI): 34 archivos y 14 contratos nuevos superan el umbral de 5. Flujo: @app-engineer valida viabilidad (C2–C6) → `design-review.md` → @architect ajusta → se implementa UI.
3. Implementadores **no** ejecutan `next build`, `playwright test`, `db:migrate` ni servers (anti-loop); los corren @qa-release/orquestador.
4. Cada chunk abre/actualiza `task-worksheet.md` antes de escribir código.
5. Si un chunk falla 2 veces ⇒ escalar (no reintentar a ciegas): `escalation-report.md`.
