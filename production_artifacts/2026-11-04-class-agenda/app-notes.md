# App Notes — Viabilidad y plan de implementación

> change_id: `2026-11-04-class-agenda` · autor: @app-engineer · date: `2026-11-04`
> Rol: cross-agent review de viabilidad (pre-implementación). **No se escribió código de producción.**
> Documento hermano: `design-review.md` (hallazgos con severidad y evidencia).

---

## 1. Veredicto de viabilidad

**IMPLEMENTABLE — verde con 3 correcciones previas.**

El diseño es coherente con el repo real: los guards, la auditoría, el motor de notificaciones, el push, el ownership por `courses.ownerId`, el patrón de route handlers anidados y la paginación por cursor existen y tienen las firmas asumidas. El cambio es **aditivo puro** (3 tablas nuevas, 0 migración de datos, 0 cambios en endpoints existentes), por lo que el riesgo de regresión es bajo y está acotado a 3 componentes modificados.

Lo que **impide arrancar C2 tal cual** son 3 supuestos falsos que producen bugs silenciosos o 500:

1. 🔴 **`notifications.group_id` es `uuid`** (`lib/db/schema.ts:294`) y el diseño propone `block:{id}:assigned:{id}`. Rompe A8-cancel/A10/A12 con 500 al notificar.
2. 🔴 **El cursor de U2 no pasa Zod**: `paginationQuerySchema.cursor` usa `.datetime({offset:true})` (`lib/validations/padel.ts:22`); `2026-11-04T18:00` es **inválido** (verificado en runtime).
3. 🔴 **`getCourseById()` devuelve `CourseDetail`, no el curso** (`courses.ts:148-181`): el check `course.status === 'archived'` de EC-13 quedaría `undefined` y nunca daría 409.

Ninguna corrección altera alcance, modelo de datos ni número de endpoints. Estimación: resolverlas antes de C2 cuesta ~30 min de edición de artifacts + ~40 líneas de código incremental (`getCourseOwned` + uuid v5 + schema de cursor).

---

## 2. Hallazgos (archivo:línea)

| Sev. | Hallazgo | Evidencia |
|---|---|---|
| 🔴 | `group_id` es uuid; los `groupId` con `:` no se pueden insertar | `lib/db/schema.ts:294`; `lib/db/queries/notifications.ts:145,165`; convención uuid en `app/api/academies/[id]/members/invite/route.ts:67` |
| 🔴 | Cursor U2 rechazado por Zod (`.datetime`) | `lib/validations/padel.ts:20-23` (probado: `'2026-11-04T18:00'` → false) |
| 🔴 | `getCourseById` → `CourseDetail`; `course.status` undefined ⇒ EC-13 muerto; 3 queries por request | `lib/db/queries/padel/courses.ts:148-181`; uso correcto en `app/api/courses/[id]/route.ts:73` |
| 🟡 | `APP_TIMEZONE` **no** lo lee `date-utils.ts` (hardcode `America/Santiago`); archivo sin imports (dead code de StreetMove) | `lib/date-utils.ts:17`; `.env.example:46-48`; grep `todayInChileStr/getIsoDayOfWeek` → 0 usos externos |
| 🟡 | Primera columna `date` del repo (todo es `timestamp`); `courses.days` es jsonb de labels | `lib/db/schema.ts` (55 `timestamp`, 0 `date`), `:464` |
| 🟡 | D4: `getIsoDayOfWeek` sin callers; `DAY_OPTIONS` son labels no enteros | `lib/date-utils.ts:110-113`; `components/padel/create-course-modal.tsx:23` |
| 🟡 | AC-05: el engine ignora preferencias en el inbox | `lib/notifications/engine.ts:43-49` |
| 🟡 | U1 `limit` default 5 vs `resolveLimit` default 20 | `lib/db/queries/padel/pagination.ts:21-23` |
| 🟡 | `.partial()` permite `{}` pese a "≥1 campo" | regla `.extend`→`refine` al final: `lib/validations/padel.ts:191-195,252-254` |
| 🟡 | EC-11: bloque sigue mostrando al removido como asignado | `courses.ts:261-269` (solo borra `course_enrollments`) |
| 🟡 | change-map: header 34 archivos vs 44 filas; C6 "3 archivos" lista 4; C11 tras UI | `change-map.md:5,92-100,152-158` |
| 🟢 | Guards 401/403 + ACTIVE; SUPER_ADMIN incluido en coach | `lib/auth/admin-guard.ts:54-89` |
| 🟢 | Dedup real 1 h (D12 correcto) | `lib/db/queries/notifications.ts:160` |
| 🟢 | `getActiveSubscriptions` ↔ `sendBulkPushTracked` encajan | `lib/db/queries/push.ts:72-79`; `lib/push/sender.ts:49-53,126` |
| 🟢 | Precedente de ruta anidada `Promise<{id, studentId}>` | `app/api/courses/[id]/students/[studentId]/route.ts:16-27` |
| 🟢 | `{items,nextCursor}` + `resolveLimit` | `lib/db/queries/padel/pagination.ts:15-23`; `lib/api-docs/paths/courses.ts:20-30` |
| 🟢 | Helpers de tests API reutilizables | `tests/api/admin/marketing/helpers` (usado en `tests/api/padel/pair-evaluations-happy.spec.ts:9-13`) |

---

## 3. Plan de sub-tasks (T1..T14) — 13 chunks reordenados

Reglas: ≤5 archivos por invocación, cero `build`/`playwright`/`db:migrate` en implementadores, `task-worksheet.md` al abrir cada T.
`C1` se parte en **C1a + C1b** para no exceder 5 archivos al aplicar el split de queries (A11).

| T | Chunk origen | Agente | Archivos | Depende de | Gate de salida |
|---|---|---|---|---|---|
| **T0** | — | @architect | `technical-design-v2.md`, `change-map-v2.md` | este review | B1/B2/B3 + A1–A11 aplicados |
| **T1** | C1a | @db-engineer | `lib/db/schema.ts`, `drizzle/0013_*.sql`, `_journal.json`, snapshot | T0 | `db:generate` + `db:migrate` + `information_schema` (4 columnas) |
| **T2** | C1b | @db-engineer | `lib/db/queries/padel/class-agenda.ts` (slots/weeks + `getCourseOwned`), `class-agenda-blocks.ts` (blocks/enrollments/student), `lib/db/queries/padel/index.ts` | T1 | `tsc --noEmit` = 0 |
| **T3** | C2 | @app-engineer | `lib/padel/class-agenda.ts` (**incluye `agendaGroupId` → uuid v5**), `lib/validations/class-agenda.ts` (**cursor regex**, `.refine` al final), `tests/unit/padel/class-agenda.test.ts`, `tests/unit/validations/class-agenda.test.ts` | T0 | unit verdes, uuid válido + determinista |
| **T4** | C3 | @app-engineer | `lib/notifications/agenda.ts`, `tests/unit/notifications/agenda.test.ts` | T3 | push roto no propaga; dedup skip |
| **T5** | C4 | @app-engineer | 5 route handlers coach: `slots/route.ts`, `slots/[slotId]/route.ts`, `weeks/route.ts`, `blocks/route.ts`, `blocks/[blockId]/route.ts` | T2, T4 | 404/409 correctos, `audit*` post-commit |
| **T6** | C5 | @app-engineer | `blocks/[blockId]/enrollments/route.ts`, `enrollments/[studentId]/route.ts`, `app/api/student/agenda/route.ts`, `app/api/student/agenda/history/route.ts` | T5 | all-or-nothing + `{items,nextCursor}` |
| **T7** | C11a (**movido**) | @app-engineer | `tests/api/padel/class-agenda-guard.spec.ts`, `tests/api/padel/class-agenda-happy.spec.ts` | T6 | 401/403/404/400 + happy SQL real coach |
| **T8** | C11b (**movido**) | @app-engineer | `tests/api/padel/class-agenda-student-happy.spec.ts` | T7 | U1/U2 + dedup 1 inbox |
| **T9** | C6 + C7 | @app-engineer / @auth-security | `lib/api-docs/paths/class-agenda.ts`, `lib/api-docs/paths/student-agenda.ts`, `lib/api-docs/schemas/class-agenda.ts`, `lib/api-docs/spec.ts`, `lib/auth/protected-routes.ts` (5) | T6 | gate `--api-docs` + `auth-impact.md` |
| **T10** | C8 | @app-engineer | `agenda-week-list.tsx`, `weekly-slot-manager.tsx`, `enable-week-dialog.tsx`, `block-assignment-sheet.tsx`, `block-enrollment-row.tsx` | T5, T6 | ≤300 líneas/archivo, tokens only |
| **T11** | C9 | @app-engineer | `hooks/use-class-agenda.ts`, `components/padel/course-detail.tsx` (tab `agenda`) | T10 | `defaultValue="students"` intacto |
| **T12** | C10 | @app-engineer | `upcoming-classes-card.tsx`, `student-course-agenda.tsx`, `student-dashboard.tsx`, `student-course-detail.tsx` | T8 | 375 px sin scroll horizontal |
| **T13** | C12 | @app-engineer (escribe) / @qa-release (ejecuta) | `tests/e2e/class-agenda.spec.ts` | T11, T12 | 2 `test()` (coach, alumno) |
| **T14** | C13 | @qa-release | borrar 2 previews + `FEATURES.md`, `ARCHITECTURE.md`, `evidence-manifest.json` | T13 | gates `--all`, cobertura, docs |

**Cambios respecto al change-map v1**
- `C1` → `C1a`/`C1b` por el split de queries (>400 líneas previstas con 12 funciones).
- `C11` se adelanta entre `C5` y `C6` (antes estaba tras `C10`): los contratos se validan con SQL real **antes** de construir 7 componentes; evita rework de UI por un 409 mal tipado o un `nextCursor` roto.
- `C6`+`C7` se agrupan (4+1 = 5 archivos) para respetar el límite.
- `@ponytail-reviewer` se ejecuta tras **T12** (C8–C10 completos) y antes de T13.

**Ruta crítica**: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7/T8 → T10 → T11/T12 → T13 → T14.

---

## 4. Riesgos operativos para la ejecución

1. **B1 es el más caro si se descubre tarde**: toca `lib/padel/class-agenda.ts` (T3) + su test y el orquestador (T4). Resolverlo en T0, no en T5.
2. **Cursor U2**: el test happy de T8 es el que detectaría el 400; adelantarlo (T8) evita llegar a la UI con el bug.
3. **EC-13 (curso archivado)**: sin B3 el 409 no se emite nunca y ningún test lo detecta salvo que T7 lo cubra explícitamente. Añadir caso en `class-agenda-guard.spec.ts`.
4. **Migración**: verificar las 4 columnas con `information_schema` tras `db:migrate` (el migrador puede reportar éxito sin ejecutar); el UNIQUE **parcial** es la única garantía real de AC-02.
5. **Anti-loop**: T1 es el único chunk que ejecuta `db:generate`/`db:migrate` (@db-engineer, permitido); T13/T14 los ejecuta QA.
6. **Cobertura**: concentrar Jest en `lib/padel/class-agenda.ts` (materialización, capacidad, agregados, uuid groupId, `mondayOf` con frontera de año) para no caer >3 %.

---

## 5. Estado

- `design-review.md` ✅ generado (3 bloqueantes, 11 ajustes, 15 confirmaciones).
- `app-notes.md` ✅ este documento.
- Implementación: **pendiente** de `technical-design-v2.md` (T0) que incorpore B1–B3 + A1–A11.

---

## Apéndice — C9-fix: GET block detail

**Gap de contrato (detectado en C9, T11)**

`hooks/use-class-agenda.ts` (`loadBlockDetail`) hace `GET /api/courses/[id]/agenda/blocks/[blockId]` esperando `BlockDetailResponse = { block?, enrollments? }` para rehidratar los alumnos asignados al reabrir un bloque. El handler sólo exportaba `PUT`/`DELETE` → 404/405 → el hook degradaba silenciosamente a la caché en memoria, que arranca vacía tras recargar la página (reabrir un bloque mostraba 0 alumnos asignados aunque la fila existiera en `block_enrollments`).

**Fix (contrato mínimo, sin tocar PUT/DELETE)**

| Archivo | Cambio |
|---|---|
| `app/api/courses/[id]/agenda/blocks/[blockId]/route.ts` | + `GET`: `guardAdmin` → `getCourseOwned` (404 curso ajeno) → `listBlockDetail(course.id, blockId)` (404 si el bloque no existe o es de otro curso) → `{ block: toBlockDto(...), enrollments }`. Reutiliza el `toBlockDto` del PUT (mismos contadores reales `enrolledCount`/`attendedCount`/`capacityRemaining`/`isPast`/`canEditTiming`) y la query existente `listBlockDetail` de C1b. Lectura: sin auditoría y permitida en curso archivado (mismo criterio que A6). No se creó query nueva. |
| `lib/api-docs/paths/class-agenda.ts` | + operación `get` en el path `blocks/{blockId}` (200 `{ block, enrollments }`; 401/403/404). |
| `lib/auth/protected-routes.ts` | + entrada `GET /api/courses/[id]/agenda/blocks/[blockId]` (15ª ruta de agenda: guard `guardAdmin`, anti-IDOR vía `getCourseOwned`+courseId). |
| `tests/api/padel/class-agenda-guard.spec.ts` | arrays 14→15 y 12→13 rutas + `GET block con ADMIN de otro curso → 404` (anti-IDOR explícito). |
| `tests/api/padel/class-agenda-happy.spec.ts` | happy-path: tras `A10`, `GET` devuelve `block.enrolledCount === 1` y el `studentId` asignado en `enrollments` (contrato que consume el hook). |

**Nota**: el hook queda intacto; la rama que tolera 404/405 se conserva como degradación defensiva. `enrollments[].status` viaja con el valor crudo de la DB (`scheduled`/`completed`/`cancelled`) y el hook lo mapea a la vista (`scheduled → assigned`), por lo que no hubo que normalizar en el server.
