# Auth Impact — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> module: auth
> tags: [auth, audit, anti-idor, guard]

## 1. Guards Utilizados

- **`guardAdmin`** (`lib/auth/admin-guard.ts`): exige `isAdminRole(role)` (ADMIN o SUPER_ADMIN) + `status === 'ACTIVE'`. Coach = ADMIN → cubre el requisito "coach autenticado". 401 si no hay sesión, 403 si rol insuficiente o status != ACTIVE.
- **Sin cambios** en `auth.ts`, `lib/auth/admin-guard.ts`, roles, estados (TEMPORARY/ACTIVE/LOCKED) ni sesiones. Se reutiliza el guard existente (consistente con los endpoints 1v1 de `app/api/evaluations/route.ts`).

## 2. Anti-IDOR Pattern Aplicado (404, no 403)

| Recurso | Verificación | Código |
|---------|--------------|--------|
| Rúbrica | `getRubricById(teacherId, rubricId)` — debe pertenecer al coach (access-aware: personal → owner; institucional → miembro COACH+) | 404 |
| Alumno A/B | `getPlayerById(studentId)` — debe existir y ser role USER | 404 |
| Inscripción A/B | `getEnrollment(courseId, studentId)` — ambos inscritos al curso (CA-07) | 404 |
| Borradores (save/publish) | `teacherId` del borrador === sesión (en `savePairEvaluationScores` explícito; en `publishPairEvaluation` filtrado en el WHERE → `not_found`) | 404 |
| Re-check inscripción en publish | `getEnrollment` re-validado dentro de la transacción (defensa en profundidad ante remoción entre draft y publish) | 404 |

**Estado de implementación:** las verificaciones de rúbrica y alumnos viven en los route handlers (pendientes de @app-engineer, patrón de `POST /api/evaluations`). Las verificaciones de inscripción y ownership ya están implementadas en `lib/db/queries/padel/pair.ts` (create: `student_not_enrolled`; save: `not_found`/`not_owner`/`not_draft`; publish: `not_found`/`student_not_enrolled`).

## 3. Auditoría Configurada

- **Evento nuevo**: `PAIR_EVALUATION_PUBLISHED` (constante exportada en `lib/audit/helpers.ts`).
- **Payload**: `{coach_id, course_id, student_a_id, student_b_id, shared_criteria_count, individual_criteria_count, duration_seconds}`.
- **D5 — dentro de la transacción**: `publishPairEvaluation` inserta el log en `audit_logs` con el cliente `tx` (misma transacción que los 2 updates a published). Desviación deliberada del patrón 1v1 (audit post-transacción) exigida por CA-06/R2. Si falla cualquier update, el insert de auditoría hace rollback con todo.
- **CREATE por borrador**: `createPairDrafts` audita `CREATE` por cada una de las 2 filas (patrón existente, post-transacción).
- **Helper**: `auditPairEvaluationPublished(entityId, context, payload)` agregado a `lib/audit/helpers.ts` como espejo del payload. **No se usa dentro de la tx** (createAuditLog usa el handle global `db`, no el cliente tx) — el insert directo en `pair.ts` es el camino autoritativo.
- **Desviación del snippet solicitado**: el snippet original llamaba a `audit(...)` con `entityId: undefined`; ese helper no existe en el archivo y `audit_logs.entity_id` es NOT NULL. Se adaptó a `createAuditLog(actionType, entityName, entityId, options)` con `entityId = evaluationA.id`.

## 4. Validación Zod (pendiente @app-engineer)

Schemas especificados en technical-design §2.6 (aún no en `lib/validations/padel.ts`):
- `pairEvaluationCreateSchema` — studentAId/studentBId/rubricId/courseId uuid; refine `studentAId !== studentBId` → 400.
- `pairEvaluationSaveSchema` — evaluationAId/evaluationBId uuid, scoresA/scoresB (shape de `evaluationSaveSchema`), globalCommentA/B opcionales.
- `pairEvaluationPublishSchema` — evaluationAId/evaluationBId uuid, durationSeconds integer ≥ 0 opcional.

## 5. Rate Limit

- **No aplica**: endpoints de coach autenticado (`guardAdmin`), consistente con los endpoints de evaluación 1v1 existentes (sin rate limit).

## 6. Sin Cambios en Roles / Estados / Sesiones

- Roles: USER/ADMIN intactos. Sin `padel_role`, sin SUPER_ADMIN nuevo.
- Estados: TEMPORARY/ACTIVE/LOCKED intactos. `guardAdmin` ya rechaza LOCKED y no-ACTIVE.
- Sesiones: JWT + sliding window intactos. Sin nuevas cookies ni env vars.
- **Nuevas env vars: ninguna** (D11, verificado en `.env.example`).

## 7. Pendientes de @app-engineer (bloqueantes para cerrar auth-impact)

1. Crear `app/api/evaluations/pair/route.ts` (POST + PUT) y `app/api/evaluations/pair/publish/route.ts` (POST) con `guardAdmin` + Zod + anti-IDOR (rúbrica del coach, alumnos USER, inscripción CA-07).
2. Agregar los 3 schemas Zod a `lib/validations/padel.ts`.
3. Mapear `reason` de las queries a códigos HTTP: `not_found`/`not_owner`/`student_not_enrolled` → 404; `not_draft`/`incomplete` → 400.
4. Tests: `tests/api/padel/pair-evaluations-guard.spec.ts` (401/403/400/404) + happy-path con SQL real.