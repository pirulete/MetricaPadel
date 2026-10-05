# Auth Impact — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (auth-security)

> change_id: 2026-10-03-super-admin-academy-ownership
> date: 2026-10-03
> module: auth+academy
> status: in-progress

## Cambios en autenticación/autorización

| Archivo | Cambio | Impacto |
|---------|--------|---------|
| `lib/auth/academy-guard.ts` | NUEVO `guardSuperAdminOrAcademyRole(session, academyId, allowedRoles)` + wrappers `guardSuperAdminOrAcademyOwner/Admin/Coach` | Guard compuesto: SUPER_ADMIN (plataforma) O rol de academia. sessionGate primero (401/403 LOCKED/TEMPORARY); path SA verifica existencia de academia (404 anti-IDOR) y permite archivadas (D4); path no-SA delega en `guardAcademyRole` existente |
| `lib/auth/academy-guard.ts` | Import `isSuperAdminRole` de `role-utils`, `academies` de schema | Reuso, no reimplementación |
| `lib/audit/academy.ts` | NUEVO — 6 helpers de auditoría (helpers.ts NO se toca, 579 líneas) | REQUEST_CREATED/APPROVED/REJECTED, OWNERSHIP_TRANSFERRED, ACADEMY_RESTORED, MEMBER_ROLE_ASSIGNED |
| `lib/auth/admin-guard.ts` | Sin cambios — reuso `guardSuperAdmin` existente | Endpoints puros SA (create, transfer, restore, requests) usan `guardSuperAdmin` + verificación explícita de recurso |

## Guard server-side verificado por endpoint

| Endpoint | Guard | 401 | 403 | 404 |
|----------|-------|-----|-----|-----|
| GET /api/academies | guardUser | sin sesión | LOCKED/TEMPORARY | — |
| POST /api/academies | **guardSuperAdmin** (breaking: antes guardAdmin) | sin sesión | no SUPER_ADMIN / no ACTIVE | — |
| GET /api/academies/[id] | guardSuperAdminOrAcademyCoach | sin sesión | LOCKED/TEMPORARY / rol insuficiente | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| PUT /api/academies/[id] | guardSuperAdminOrAcademyAdmin | sin sesión | LOCKED/TEMPORARY / COACH | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| DELETE /api/academies/[id] | guardSuperAdminOrAcademyOwner | sin sesión | LOCKED/TEMPORARY / ADMIN o COACH | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| POST /api/academies/[id]/logo | guardSuperAdminOrAcademyAdmin | sin sesión | LOCKED/TEMPORARY / COACH | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| GET /api/academies/[id]/members | guardSuperAdminOrAcademyCoach | sin sesión | LOCKED/TEMPORARY / rol insuficiente | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| POST /api/academies/[id]/members/invite | guardSuperAdminOrAcademyAdmin | sin sesión | LOCKED/TEMPORARY / COACH | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| DELETE /api/academies/[id]/members/[userId] | guardSuperAdminOrAcademyAdmin | sin sesión | LOCKED/TEMPORARY / COACH | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| POST /api/academies/[id]/members/[userId]/accept | guardUser self (sin cambio) | sin sesión | LOCKED/TEMPORARY | — |
| GET/POST /api/academies/[id]/rubrics | guardSuperAdminOrAcademyCoach/Admin | sin sesión | LOCKED/TEMPORARY / rol insuficiente | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| POST /api/academies/[id]/transfer-ownership | guardSuperAdmin + getAcademyById | sin sesión | no SUPER_ADMIN / no ACTIVE | academia inexistente |
| PUT /api/academies/[id]/members/[userId] | guardSuperAdminOrAcademyAdmin + regla handler `canAssignAcademyRole` | sin sesión | LOCKED/TEMPORARY / COACH / `role=OWNER` sin SUPER_ADMIN | academia inexistente (SA) / sin membresía o archivada (no-SA) |
| POST /api/academies/[id]/restore | guardSuperAdmin + getAcademyById | sin sesión | no SUPER_ADMIN / no ACTIVE | academia inexistente |
| POST /api/academy-requests | guardAdmin + rate limit | sin sesión | no ADMIN global / no ACTIVE | academia inexistente (join, validación handler) |
| GET /api/academy-requests | guardSuperAdmin | sin sesión | no SUPER_ADMIN / no ACTIVE | — |
| POST /api/academy-requests/[id]/approve | guardSuperAdmin | sin sesión | no SUPER_ADMIN / no ACTIVE | solicitud inexistente |
| POST /api/academy-requests/[id]/reject | guardSuperAdmin | sin sesión | no SUPER_ADMIN / no ACTIVE | solicitud inexistente |
| GET /api/academy-requests/available-academies | guardAdmin | sin sesión | no ADMIN global / no ACTIVE | — |

## 403/404 esperados

- **403**: LOCKED/TEMPORARY (sessionGate, incluso SUPER_ADMIN), rol de academia insuficiente, no SUPER_ADMIN en endpoints puros SA, `role=OWNER` por academy ADMIN (regla handler).
- **404 anti-IDOR**: academia inexistente para SA (el bypass NUNCA opera sin verificar existencia), membresía inexistente o academia archivada para no-SA, solicitud inexistente, target no miembro en transfer (spec AC-07, no 400).
- **Nunca 500 ni mensajes que revelen existencia de recursos ajenos.**

## Auditoría configurada

- `lib/audit/academy.ts` (NUEVO, importa `createAuditLog` + `AuditContext` de helpers.ts):
  - `auditAccessRequestCreated` → REQUEST_CREATED / academy_access_requests
  - `auditAccessRequestApproved` → REQUEST_APPROVED / academy_access_requests
  - `auditAccessRequestRejected` → REQUEST_REJECTED / academy_access_requests
  - `auditOwnershipTransferred` → OWNERSHIP_TRANSFERRED / academies
  - `auditAcademyRestored` → ACADEMY_RESTORED / academies
  - `auditMemberRoleAssigned` → MEMBER_ROLE_ASSIGNED / academy_memberships
- **OJO tx**: `createAuditLog` usa el handle global `db`, NO el tx client (helpers.ts 552-557). Los endpoints deben llamar los helpers FUERA de la tx; si el insert autoritativo ocurre dentro de la tx (approve join/create), el insert de auditoría se hace con el tx client y el helper espeja el payload para consistencia de API.
- Mutaciones sensibles auditadas: crear academia (existente), solicitud creada/aprobada/rechazada, transfer ownership, restore, asignación de rol.

## OWASP

| OWASP | Control |
|-------|---------|
| A01 Broken Access Control | Guard compuesto server-side por endpoint; 404 anti-IDOR (nunca 403 para recursos ajenos); `canAssignAcademyRole` en handler (OWNER solo SUPER_ADMIN); invariante último OWNER en queries tx |
| A03 Injection | Zod en todos los bodies nuevos; queries Drizzle parametrizadas |
| A04 Insecure Design | sessionGate primero en el guard compuesto — el bypass SA no salta el gate de sesión; verificación de existencia de academia SIEMPRE antes de operar |
| A05 Security Misconfiguration | Sin cambios de cookies/CSRF (Auth.js intacto); sin env vars nuevas |
| A07 Identification/Auth Failures | Estados respetados: ACTIVE obligatorio; LOCKED/TEMPORARY → 403 incluso para SUPER_ADMIN |
| A09 Logging/Monitoring | 6 eventos de auditoría nuevos trazables en audit_logs |
| Rate limit | `POST /api/academy-requests` → `checkPublicRateLimit('academy-request:{ip}')` 10/min (constantes `ACADEMY_REQUEST_MAX`/`ACADEMY_REQUEST_WINDOW_MS` las crea @app-engineer en `lib/rate-limit.ts`, patrón `academy-invite`) |

## Tests

- `tests/unit/auth/academy-super-admin-guard.test.ts` (NUEVO) — 22 tests: sessionGate (401/403 LOCKED/TEMPORARY incluso SA), path SA (null con academia existente, 404 inexistente, null con archivada, no consulta membresía), path no-SA (404 sin membresía, 404 archivada, 403 rol insuficiente, null rol OK, no consulta academias), 3 wrappers.
- Suite auth: 96 tests pasando. `tsc --noEmit` 0 errores. `academy-guard.ts` 100% cobertura.

## Riesgos

- **Breaking**: `POST /api/academies` cambia `guardAdmin` → `guardSuperAdmin` — ADMIN global pierde creación (403, antes 201). Documentado en release-scope (AC-01); UI oculta botón; tests existentes que crean academia con ADMIN (`pdf-happy`, `members-happy`, `institutional-rubrics-happy`, `academies-guard`) deben migrar a helper SUPER_ADMIN (@app-engineer).
- **Detalle de rúbricas institucionales para SA sin membresía**: `canAccessRubric` exige membresía activa → 404 en detalle. Mitigación recomendada (b) en app-notes §3: agregar path SUPER_ADMIN en `canAccessRubric` (3 líneas, @db-engineer o agente asignado).
- **`myRole` null para SA sin membresía** en GET /api/academies/[id]: aceptable (responder `myRole: null`).