# Feature Spec — Rol SUPER_ADMIN (Super Admin de Plataforma)

> status: proposed
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## Problema

El modelo de roles es binario (`USER`/`ADMIN`): cualquier ADMIN tiene acceso total a plataforma (promover admins, CMS, lock de usuarios) sin jerarquía ni control. No existe demote, listado de admins, auditoría global ni visibilidad de plataforma. Audit previo: `production_artifacts/2026-09-27-super-admin-audit/audit-report.md` (10 gaps, G1-G10).

## Objetivo

Introducir el rol global `SUPER_ADMIN` (jerárquicamente superior a ADMIN) con capacidades exclusivas de administración de plataforma: gestionar admins (promote/demote), leer audit_logs, visibilidad global de academias y settings de plataforma. El RBAC por academia (OWNER/ADMIN/COACH) queda **intacto**.

## Alcance

### DB (G1)
- Extender `user_role` enum a `['USER', 'ADMIN', 'SUPER_ADMIN']` (migración aditiva vía `pnpm run db:generate`).
- Sin tablas nuevas. Sin cambios en `academy_memberships`.

### Auth (G2, G4)
- `lib/auth/admin-guard.ts`: nuevo `guardSuperAdmin(session)` (401 sin sesión, 403 si `role !== 'SUPER_ADMIN'` o `status !== 'ACTIVE'`) + `validateSuperAdmin()` (redirect `/dashboard` si no aplica).
- **Jerarquía**: `guardAdmin` acepta `['ADMIN', 'SUPER_ADMIN']` (SUPER_ADMIN es admin). `validateAdmin` idem.
- `lib/auth/role-utils.ts`: `ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN']`, nuevo `SUPER_ADMIN_ROLES = ['SUPER_ADMIN']`, `isAdminRole` incluye ambos, `canAssignRole` restringido a SUPER_ADMIN para asignar `['USER','ADMIN']` (nunca SUPER_ADMIN vía API).

### Seguridad de promoción (G3, G7, G8)
- `POST /api/admin/users/[id]/promote` pasa de `guardAdmin` → `guardSuperAdmin`.
- Nuevo `POST /api/admin/users/[id]/demote` (ADMIN→USER, solo SUPER_ADMIN).
- Protección último SUPER_ADMIN: validación transaccional — no puede quedar 0 SUPER_ADMIN activos; SUPER_ADMIN no puede demotearse a sí mismo (400); SUPER_ADMIN no puede ser bloqueado/demotado por nadie.
- Auditoría dedicada: eventos `ADMIN_PROMOTED`, `ADMIN_DEMOTED`, `SUPER_ADMIN_ACTION` en `lib/audit/helpers.ts`.

### API (G4, G5, G6)
- `GET /api/admin/admins` — listar admins (role ADMIN/SUPER_ADMIN) con estado (guardSuperAdmin).
- `POST /api/admin/users/[id]/demote` — ADMIN→USER (guardSuperAdmin).
- `GET /api/admin/audit-logs` — lectura paginada de audit_logs con filtros acción/usuario (guardSuperAdmin).
- `GET /api/admin/academies` — listar todas las academias (visibilidad global, guardSuperAdmin).
- Todos documentados en `lib/api-docs/spec.ts` + `lib/auth/protected-routes.ts`.

### UI (G9, G10)
- `/admin/admins` — gestionar admins (listar, promote, demote) — visible solo SUPER_ADMIN.
- `/admin/platform` — settings globales de plataforma (feature flags/mantenimiento) — visible solo SUPER_ADMIN.
- Nav admin condicional por rol.

## Acceptance Criteria

- **AC-01**: Solo SUPER_ADMIN puede promover USER→ADMIN (`POST promote` con ADMIN → 403).
- **AC-02**: Solo SUPER_ADMIN puede demote ADMIN→USER (`POST demote` con ADMIN → 403).
- **AC-03**: No puede existir 0 SUPER_ADMIN activos (demote/bloqueo del último → 400, validación transaccional).
- **AC-04**: SUPER_ADMIN pasa `guardAdmin` y `validateAdmin` (jerarquía: super admin es admin).
- **AC-05**: Toda acción de SUPER_ADMIN (promote, demote, settings) queda en `audit_logs` con eventos dedicados.
- **AC-06**: UI `/admin/admins` y `/admin/platform` visibles solo para SUPER_ADMIN (ADMIN → oculto/redirect).
- **AC-07**: `GET /api/admin/admins` y `GET /api/admin/audit-logs` devuelven 403 para ADMIN y 200 para SUPER_ADMIN.
- **AC-08**: Tests — unit (guards jerarquía/estados, role-utils, validación último admin), API (happy-path SQL real por endpoint + guards 401/403), E2E (flujo navegable promote/demote).

## Edge Cases

| Caso | Comportamiento |
|------|----------------|
| ADMIN intenta promover USER→ADMIN | 403 (guardSuperAdmin) |
| SUPER_ADMIN intenta demotearse a sí mismo | 400 |
| Solo 1 SUPER_ADMIN activo y otro intenta demotearlo | 400 (protección último) |
| SUPER_ADMIN bloqueado por otro SUPER_ADMIN | No permitido (protección: SUPER_ADMIN no es bloqueable/demotable) |
| Demote de un USER (no ADMIN) | 400 (target no es ADMIN) |
| Promote de un ADMIN (ya admin) | 400 (idempotencia) |
| Primer SUPER_ADMIN | Seed/DB manual (patrón primer ADMIN, QUICKSTART §7) — nunca vía API |
| SUPER_ADMIN con status LOCKED/TEMPORARY | 403 en guardSuperAdmin; no cuenta como "activo" para protección último |

## Dependencias

- Audit previo `2026-09-27-super-admin-audit` (base).
- Migración Drizzle aditiva (enum) — requiere `db:generate` + verificación de columnas.
- `lib/audit/helpers.ts` — nuevos eventos.
- `lib/api-docs/spec.ts` — 4 endpoints nuevos.
- `lib/auth/protected-routes.ts` — documentación de guards.

## Out-of-Scope

- Permisos granulares por módulo (RBAC fino) — YAGNI; enum jerárquico cubre el caso.
- Multi-tenant admin por academia (ya existe vía `academy_memberships`).
- Self-service de registro de SUPER_ADMIN (siempre seed/DB manual o promoción por otro SUPER_ADMIN).
- Dashboard de métricas globales (usuarios/academias/evaluaciones) — se evalúa en iteración posterior.
- Gestión de términos/legal desde UI admin.

## Tests Requeridos

- **Unit (Jest)** `tests/unit/auth/`: guards jerarquía (SUPER_ADMIN pasa guardAdmin; ADMIN no pasa guardSuperAdmin), estados (LOCKED/TEMPORARY), role-utils (`isAdminRole`, `canAssignRole`), validación último admin (lógica pura).
- **API (Playwright)** `tests/api/admin/`: `admins-guard.spec.ts` (401/403), `admins-happy.spec.ts` (SQL real), `demote-happy.spec.ts` (SQL real + protección último admin), `audit-logs-happy.spec.ts` (SQL real), `academies-global-happy.spec.ts` (SQL real), `promote-guard.spec.ts` (ADMIN → 403).
- **E2E (Playwright)** `tests/e2e/super-admin.spec.ts`: flujo navegable SUPER_ADMIN lista admins → promueve → demota; ADMIN no ve `/admin/admins`.

## Referencias

- `production_artifacts/2026-09-27-super-admin-audit/audit-report.md`
- `lib/db/schema.ts` L4 (`userRoleEnum`)
- `lib/auth/admin-guard.ts` (guardAdmin/validateAdmin)
- `lib/auth/role-utils.ts`
- `FEATURES.md` — `g10-admin-users-ui`, `gaps-user-flows` (G3 out-of-scope superadmin), `spec-epic-01-academia-branding`