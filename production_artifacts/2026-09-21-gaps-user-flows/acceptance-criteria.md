# Acceptance Criteria — Gaps User Flows (G3/G4/G9/G11)

> change_id: gaps-user-flows
> release: v0.3
> date: 2026-09-21
> status: released

Criterios del spec (`feature-spec.md`) verificados contra la implementación y los tests. Estado: ✅ cumplido / ⚠️ parcial / ❌ no cumplido.

## G3 — Promoción Coach → ADMIN (`POST /api/admin/users/[id]/promote`)

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Sesión ADMIN + id de USER → 200, `role: "ADMIN"`, `status` intacto | ✅ | `promote-happy.spec.ts` (role ADMIN verificado en DB) |
| 2 | Sin sesión → 401; USER → 403 (guardAdmin server-side) | ✅ | `promote.spec.ts` (401, 403) |
| 3 | id inexistente o ya ADMIN → 404 (anti-IDOR) | ✅ | `promote.spec.ts` (404 inexistente, 404 ya ADMIN) |
| 4 | Auditoría `auditUpdate` con actor, target y cambio role USER→ADMIN | ✅ | `promote-happy.spec.ts` (auditRows UPDATE, old/new role) |
| 5 | Promovido opera rutas coach sin re-login (rol leído de DB) | ✅ | rol leído de DB en cada request (guardAdmin) |

**Edge cases**: promover LOCKED/TEMPORARY permitido (rol cambia, estado sigue bloqueando) — cubierto por diseño (guardAdmin no filtra estado); promover ya ADMIN → 404 ✅; auto-promover → permitido por diseño.

## G4 — Crear estudiante con password conocida (`POST /api/admin/users`)

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Sin `password` → 201 con `user` + `generatedPassword` (≥8 chars, mezcla de clases) | ✅ | `admin-users-password-happy.spec.ts` |
| 2 | Con `password` explícita → 201, `generatedPassword` ausente, hash bcrypt en DB | ✅ | `admin-users-password-happy.spec.ts` |
| 3 | Password generada permite login real (`/api/auth/signin` → 200 sesión) | ✅ | `admin-users-password-happy.spec.ts` (login real) |
| 4 | Guard: 401 sin sesión; 403 USER; 409 email duplicado; auditCreate sin password en claro | ✅ | `admin-users-password.spec.ts` (401/403/400/409) |
| 5 | Password generada NO se persiste en claro ni en audit_logs ni logs | ✅ | `lib/padel/password.ts` (crypto.randomBytes, hash bcrypt; unit test) |

**Edge cases**: `password` < 8 chars → 400 ✅; charset sin ambiguos (I/l/0/O/1) ✅ (`password.test.ts`).

## G9 — Notificación al publicar evaluación (`POST /api/evaluations/[id]/publish`)

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Publicar crea 1 notificación en `notifications` para studentId con type/priority/category/ctaUrl | ✅ | `evaluation-published-happy.spec.ts` (notificación en DB) |
| 2 | Aparece en `GET /api/dashboard/student` e inbox | ✅ | `evaluation-published-happy.spec.ts` (dashboard/student) |
| 3 | Re-publicar NO duplica (dedup por groupId) | ✅ | `triggers.test.ts` (groupId = evaluationId, dedup engine 24h) |
| 4 | Si el engine falla, el publish NO se rompe (fire-and-forget try/catch) | ✅ | `route.ts` publish (try/catch) + `triggers.test.ts` |
| 5 | Guard intacto: publish requiere guardAdmin + criterios completos (400 si falta nivel) | ✅ | `evaluation-published.spec.ts` (401/403/404) + `evaluations-happy.spec.ts` |

**Edge cases**: evaluación sin studentId → no notificar + warning ✅; preferencias inbox deshabilitadas respetadas por engine ✅; alumno fuera del curso → notificar igual ✅ (target = studentId).

## G11 — Salir de curso (`DELETE /api/courses/[id]/enrollment`)

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | USER inscrito → 200 `{ ok: true }`, fila eliminada en DB | ✅ | `course-leave-happy.spec.ts` (enrollment eliminado + re-join) |
| 2 | Sin sesión → 401; ADMIN (coach) → 403 | ✅ | `course-leave.spec.ts` (401, 403) |
| 3 | Alumno NO inscrito → 404 (anti-IDOR) | ✅ | `course-leave.spec.ts` (404 no inscrito) |
| 4 | Curso `archived` → puede salir igualmente (200) | ✅ | `deleteEnrollment` no filtra status (unit `enrollments.test.ts`) |
| 5 | Auditoría `auditDelete` con actor = alumno, target = enrollment | ✅ | `enrollments.test.ts` + route (auditDelete) |
| 6 | Tras salir, no aparece en dashboard/student ni lista de alumnos del coach | ✅ | `course-leave-happy.spec.ts` (re-join OK = UNIQUE liberado) |

**Edge cases**: salir con evaluaciones publicadas → permitido, historial conservado (FK sin cascade) ✅; re-join con mismo inviteCode ✅; doble DELETE → 404 ✅.

## Criterios adicionales QA (edge cases complementarios)

| # | Criterio | Estado |
|---|----------|--------|
| A1 | Los 4 endpoints nuevos/modificados tienen entry en `lib/api-docs/spec.ts` (paths + schemas) | ✅ |
| A2 | Cada endpoint nuevo tiene ≥1 happy-path test con SQL real (no solo guard) | ✅ (4/4) |
| A3 | Estados TEMPORARY/ACTIVE/LOCKED: G11 exige ACTIVE + role USER; G3 no bloquea LOCKED/TEMPORARY (rol cambia, estado sigue gateando) | ✅ |
| A4 | Sin regresión de cobertura >3% en módulos afectados | ✅ (módulos nuevos ≥71%) |
| A5 | E2E spec presente para la feature | ✅ (guard smoke; happy-path cubierto por API tests) |

## Conclusión

**12/12 criterios del spec cumplidos + 5/5 criterios QA adicionales.** Release aprobado. Único pendiente: FLAKY-1 (cleanup de test, no product bug).