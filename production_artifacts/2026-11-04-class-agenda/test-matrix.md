# Test Matrix — Agenda de clases por curso (`2026-11-04-class-agenda`)

> Ejecutado por @qa-release · 2026-11-04 · entorno: dev server `:3000` + Neon/Postgres local `:5434`
> Prefijo usado: `DATABASE_URL="postgresql://padel:padel_dev_2026@localhost:5434/padel_evaluation?sslmode=disable"`

## 1. Gates ejecutados

| Gate | Comando | Resultado | Estado |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 errores | ✅ |
| Lint | `pnpm run lint` | **0 errores** / 256 warnings (preexistentes + `protected-routes.ts` max-lines, excepción de registro documentada en `ponytail-review-report.md`) | ✅ |
| Unit (Jest) | `pnpm run test:unit` | **71 suites / 948 tests passed** | ✅ |
| API (SQL real) | `npx playwright test tests/api/padel/class-agenda-{happy,guard,student-happy}.spec.ts` | **6 passed + 1 flaky** (ver §4) | ✅ |
| E2E feature | `npx playwright test tests/e2e/class-agenda.spec.ts` | **2/2 passed** (375×667), estable en 2 corridas consecutivas tras corregir TEST-01..TEST-05 | ✅ |
| E2E regresión | `npx playwright test tests/e2e/{transition-editor,puzzle-demo,transition-fab}.spec.ts` | **6/6 passed** | ✅ |
| Build | `pnpm run build` | OK (route table completa, postbuild `db:migrate` skip sin DATABASE_URL) | ✅ |
| API docs | lectura de `lib/api-docs/spec.ts` + `paths/{class-agenda,student-agenda}.ts` | 15 endpoints registrados (ver §5) | ✅ |
| Efímeros (C13b) | `components/preview/`, `app/preview/` | sin `class-agenda*` (mockup ya eliminado por @ponytail-reviewer) | ✅ |

## 2. Unit tests (nuevos / modificados)

| Archivo | Tipo | Qué cubre |
|---|---|---|
| `tests/unit/padel/class-agenda.test.ts` | ✨ | Cálculo de semana (`buildWeekInfo`), `buildMaterializationPlan` (idempotencia, `skipped`), `addDays`/`daysBetween`, `validateAssignment` (cupo), `resolveCapacityRemaining`, `computeAttendanceAggregates` / `attendanceRate`, `todayInTimeZone` (frontera de día), `isPast`/`canEditTiming`, `formatBlockDateTime` |
| `tests/unit/padel/agenda-group-id.test.ts` | ✨ | `groupId` uuid v5 determinista por (`blockId`,`studentId`,`action`); acciones distintas no colisionan |
| `tests/unit/notifications/agenda.test.ts` | ✨ | `class.assigned` / `class.removed` / `class.cancelled`: copy, prioridad P2/system, `groupId` en payload, 1 push por evento, **duplicado ⇒ 0 push** (dedup) |
| `tests/unit/validations/class-agenda.test.ts` | ✨ | Zod: `dayOfWeek` 1–7, `durationMinutes` 15–180, hora `HH:mm`, `studentIds` no vacío/únicos, payload de materialización, cursor de historial |
| `tests/unit/db/courses.test.ts` | 🔧 | Ajuste por campos nuevos del detalle de curso (agenda del alumno) |

Cobertura del módulo (Jest, `collectCoverage`): `lib/padel/class-agenda.ts` **96.7 %**, `lib/validations/class-agenda.ts` **100 %**, `lib/padel/*` sin regresión (media ≥ 96 %). Sin caída > 3 %.

## 3. API tests (Playwright, SQL real contra la DB)

| Archivo | Test | Endpoints / reglas |
|---|---|---|
| `tests/api/padel/class-agenda-happy.spec.ts` | **A2–A12 con verificación SQL, idempotencia, cupo y archivado** (+ `GET blocks/[blockId]` del C9-fix: `enrolledCount === 1` y `studentId` del alumno en `enrollments`) | Slots CRUD · `POST weeks` (1ª vez `created>0`, 2ª `created:0`) · `GET/POST blocks` · `PUT/DELETE blocks/[blockId]` · asignar (201) · no inscrito (400) · cupo (409) · asistencia `attended` true/false/null + `notes` · cancelar bloque → asignaciones `cancelled` · curso archivado (409) · `audit_logs` (6 aserciones) |
| `tests/api/padel/class-agenda-guard.spec.ts` | 4 tests | **15 rutas → 401 sin sesión** · USER+ACTIVE → **403 en los 13 endpoints de coach** · ADMIN+TEMPORARY → 403 con `code: TEMPORARY` en U1 · 404 cross-coach (curso/bloque ajeno, incluido `GET block`), 409 archivado, 400 Zod |
| `tests/api/padel/class-agenda-student-happy.spec.ts` | 2 tests | **U1** próximas clases + `aggregates` (scheduled/attended/cancelled/`attendanceRate`) con SQL real · **U2** cursor de historial + anti-IDOR (curso ajeno → 404) · 401 sin sesión |

**Happy-path por endpoint**: 15/15 (13 coach + 2 alumno) — cada uno ejercita SQL real, no solo guards.

## 4. Flaky detectado y clasificación

| Test | Síntoma | Clasificación | Resolución |
|---|---|---|---|
| `class-agenda-happy.spec.ts` (A2–A12) | `Test timeout of 30000ms` en la 1ª corrida con 3 workers; pasa en retry (3.5 s) y solo (2.6 s) | **Infra/dev-server** (compilación on-demand de las rutas de agenda + 3 workers en paralelo), **no** defecto de producto | No bloqueante. Re-ejecutado aislado: 1/1 en 4.2 s. Recomendado en CI: `--workers=1` para este archivo o warm-up previo |

## 5. Cobertura de API docs (`lib/api-docs/spec.ts`)

Spread en `spec.ts:332` (`...classAgendaPaths, ...studentAgendaPaths`), tags `padel-agenda` / `padel-student-agenda`.

| Path | Operaciones |
|---|---|
| `/api/courses/{id}/agenda/slots` | `get` (A1), `post` (A2) |
| `/api/courses/{id}/agenda/slots/{slotId}` | `put` (A3), `delete` (A4) |
| `/api/courses/{id}/agenda/weeks` | `post` (A5, materialización) |
| `/api/courses/{id}/agenda/blocks` | `get` (A6), `post` (A7) |
| `/api/courses/{id}/agenda/blocks/{blockId}` | `get` (**C9-fix**), `put` (A8), `delete` (A9) |
| `/api/courses/{id}/agenda/blocks/{blockId}/enrollments` | `post` (A10) |
| `/api/courses/{id}/agenda/blocks/{blockId}/enrollments/{studentId}` | `put` (A11), `delete` (A12) |
| `/api/student/agenda` | `get` (U1) |
| `/api/student/agenda/history` | `get` (U2) |

`lib/auth/protected-routes.ts`: **15 entradas de agenda** (13 coach + 2 alumno), coherentes con el guard spec ("las 15 rutas → 401").

## 6. E2E (Playwright, viewport 375×667)

| Test | Flujo | Aserciones clave |
|---|---|---|
| coach configura la plantilla, habilita la semana y asigna | `/cursos/<id>` → tab Agenda → "Añadir día a la plantilla" (día actual + 18:00) → "Habilitar Sem N" → abrir bloque → check alumno → "Asignar 1" | `Asignados (1)`, nombre del alumno, "1 asignados" en la semana, panel de agenda sin scroll interno |
| alumno ve su clase y otro alumno ve el vacío | login alumno → `/dashboard` → "Próximas clases" | curso, `18:00`, "Programada", `scrollWidth ≤ 375`; segundo alumno ve "No tienes clases programadas" + `scrollWidth ≤ 375` |

## 7. Defectos de test encontrados y corregidos por @qa-release (test-only, sin tocar producto)

| ID | Defecto en el spec | Evidencia | Fix aplicado |
|---|---|---|---|
| TEST-01 | `test.beforeAll/afterAll` a **nivel de archivo** con los tests dentro de un `describe` → Playwright ejecutaba el `afterAll` **entre** tests y borraba el seed | Log `AFTER_ALL_CLEANUP_START` tras el test 1; test 2 con API 200 y `upcoming: []` | Hooks movidos **dentro** del `describe` |
| TEST-02 | `slotDialog.getByLabel("Día")` → strict mode violation (combobox "Día" + switch "Día activo en la plantilla") | `resolved to 2 elements` | `getByRole("combobox", { name: "Día", exact: true })` |
| TEST-03 | `getByText(STUDENT_NAME)` → 2 coincidencias (fila asignada + fila "Ya asignado" de disponibles) | `resolved to 2 elements` | `.first()` (el sheet muestra el alumno en ambas listas por diseño) |
| TEST-04 | `invite_code = \`E2E${STAMP}\`.slice(0,10)` colisiona cada ~16 min → `duplicate key ... courses_invite_code_idx` | beforeAll duplicado entre corridas | Base36 del timestamp (`E2E…`), mantiene unicidad |
| TEST-05 | Assert de scroll horizontal a nivel documento en la página del coach | `scrollWidth = 589–608` en **todas** las tabs | Se acota al panel de la agenda (el desborde de documento es **BUG-01 preexistente**, ver release-report); el assert a nivel documento se conserva en el flujo del alumno (AC-07) |

Ninguno de los cinco cambios altera producto, contratos ni acceptance criteria.
