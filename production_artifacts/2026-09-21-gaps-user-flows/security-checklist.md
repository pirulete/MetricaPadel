# Security Checklist — Gaps User Flows (G3, G4, G11)

> change_id: gaps-user-flows
> module: auth
> date: 2026-09-21
> release: v0.3
> status: in-progress

## G3 — `POST /api/admin/users/[id]/promote`

| # | Control | Estado | Evidencia |
|---|---------|--------|-----------|
| 1 | Solo ADMIN puede promover | ✅ Verificado | `guardAdmin` (401 sin sesión / 403 role≠ADMIN o status≠ACTIVE) + entrada en protected-routes |
| 2 | No self-promote | ✅ Verificado (diseño) | Query `promoteUser(id)` filtra `role='USER'` (D1): el admin tiene role ADMIN → `null` → 404. El admin nunca puede promoverse a sí mismo |
| 3 | Idempotente (ya ADMIN → 404) | ✅ Verificado (diseño) | Mismo filtro `role='USER'`: ya-ADMIN → `null` → 404. Re-POST no muta ni duplica |
| 4 | Anti-IDOR: recurso no aplicable = 404, nunca 403 | ✅ Verificado (diseño) | Usuario inexistente o no-USER → `null` → 404 (D1) |
| 5 | Auditoría de la mutación | ✅ Verificado (diseño) | `auditUpdate("user", id, { role: "USER" }, { role: "ADMIN" }, { userId: adminId })` (D7) |
| 6 | Params uuid validados | ✅ Verificado | `padelIdParamsSchema` (uuid) → 400 si inválido |

## G4 — `POST /api/admin/users` (password opcional + generatedPassword)

| # | Control | Estado | Evidencia |
|---|---------|--------|-----------|
| 1 | generatedPassword NO se loguea | ✅ Verificado (diseño) | El catch del route loguea solo `error` (nunca `body`/`validated`/respuesta). **Regla para @app-engineer: no añadir `console.log` de la respuesta ni del body** |
| 2 | generatedPassword NO llega a audit_logs | ✅ Verificado | `auditCreate` actual (route.ts:62-67) persiste solo `email/firstName/lastName/role/status` — sin password. D2/D7: mantener este payload al implementar |
| 3 | Password nunca persistida en claro | ✅ Verificado | `createActiveUser` hashea con bcrypt (cost 10) antes del INSERT (admin-users.ts:18) |
| 4 | Password generada cumple política | ✅ Verificado (diseño) | `generatePassword()` en `lib/padel/password.ts`: ≥8 chars (randomBytes ≥12), mezcla de clases, charset sin ambiguos (I/l/0/O/1) (D2) |
| 5 | Password generada se devuelve UNA vez | ✅ Verificado (diseño) | Solo en `generatedPassword` de la respuesta 201; no se persiste en claro ni se puede recuperar después |
| 6 | Password respetada (si viene en body) → sin generatedPassword | ✅ Verificado (diseño) | Contrato 201: `{ user }` sin `generatedPassword` |
| 7 | Validación mínima password | ✅ Verificado | Schema: `min(8)` → 400 si corta; sigue aplicando al pasar password explícita |
| 8 | Guard admin | ✅ Verificado | `guardAdmin` existente |

## G11 — `DELETE /api/courses/[id]/enrollment`

| # | Control | Estado | Evidencia |
|---|---------|--------|-----------|
| 1 | Solo el alumno inscrito puede salir | ✅ Verificado (diseño) | `guardUser` + `status === "ACTIVE"` + `role === "USER"` (D5, mismo patrón que join route.ts:20-26) |
| 2 | Coach/ADMIN no puede desinscribir | ✅ Verificado (diseño) | role≠USER → 403 explícito |
| 3 | Otro alumno no puede desinscribir a un tercero | ✅ Verificado (diseño) | Query `deleteEnrollment(courseId, studentId)` filtra `studentId = session.user.id` → enrollment ajeno → `null` → 404 (D6) |
| 4 | Doble DELETE idempotente | ✅ Verificado (diseño) | No existe enrollment → `null` → 404 (D6) |
| 5 | Anti-IDOR: no inscrito/curso inexistente = 404 | ✅ Verificado (diseño) | `null` → 404, nunca 403 |
| 6 | Auditoría de la mutación | ✅ Verificado (diseño) | `auditDelete("course_enrollment", enrollmentId, { courseId, studentId }, { userId: studentId })` (D7) |
| 7 | Params uuid validados | ✅ Verificado | `padelIdParamsSchema` → 400 si inválido |

## OWASP / buenas prácticas

| Control | Estado |
|---------|--------|
| Broken Access Control (A01) — guards server-side en los 3 endpoints | ✅ |
| Anti-IDOR (A01) — 404 para recurso ajeno/no aplicable | ✅ |
| Cryptographic Failures (A02) — bcrypt cost 10, password nunca en claro | ✅ |
| Sensitive Data Exposure — generatedPassword solo en respuesta HTTP, no en logs/audit | ✅ |
| Security Logging (A09) — auditoría en las 3 mutaciones | ✅ |
| CSRF — endpoints JSON con Auth.js session cookie (sin cambios) | ✅ (sin impacto) |
| HTTP-only cookies — sin cambios en `auth.ts` | ✅ (sin impacto) |

## Pendiente de verificación en implementación (@app-engineer)

- [ ] `lib/padel/password.ts` implementado con charset sin ambiguos y entropía randomBytes
- [ ] Route promote: catch loguea solo `error`, nunca el body
- [ ] Route admin/users POST: `generatedPassword` solo en respuesta; auditCreate sin password
- [ ] Route enrollment DELETE: check `role !== "USER"` → 403 antes de tocar DB
- [ ] API tests guard 401/403 + happy-path SQL real (promote, admin-users-password, course-leave)