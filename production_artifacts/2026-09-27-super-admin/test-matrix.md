# Test Matrix — Rol SUPER_ADMIN (Super Admin de Plataforma)

> status: released
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## Resumen de ejecución

| Suite | Comando | Resultado |
|-------|---------|-----------|
| Typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| Unit (Jest) | `pnpm run test:unit` | ✅ 43 suites / 524 tests PASS |
| API (Playwright) | `npx playwright test tests/api/admin/{promote-super-admin,demote-super-admin,admins-list,audit-logs,academies-global}.spec.ts` | ✅ 16/16 PASS |
| E2E (Playwright) | `npx playwright test tests/e2e/super-admin.spec.ts` | ✅ 6/6 PASS |

## Unit tests (Jest) — 31 tests super-admin

| Archivo | Cobertura | Resultado |
|---------|-----------|-----------|
| `tests/unit/auth/super-admin-guard.test.ts` | Jerarquía (SUPER_ADMIN pasa guardAdmin), guardSuperAdmin (solo SUPER_ADMIN+ACTIVE; ADMIN/USER/LOCKED/TEMPORARY → 403), lock protege SUPER_ADMIN | ✅ PASS |
| `tests/unit/auth/role-utils.test.ts` | `isAdminRole`, `isSuperAdminRole`, `canAssignRole` (solo SUPER_ADMIN asigna USER/ADMIN; nunca SUPER_ADMIN) | ✅ PASS |
| `tests/unit/padel/super-admin.test.ts` | `assertNotLastSuperAdmin` (lógica pura, invariante último admin) | ✅ PASS |
| `tests/unit/db/super-admin.test.ts` | Queries super-admin (listAdmins, demoteUser, countActiveSuperAdmins) | ✅ PASS |
| `tests/unit/audit/super-admin.test.ts` | Helpers de auditoría ADMIN_PROMOTED/ADMIN_DEMOTED | ✅ PASS |

## API tests (Playwright) — 16 tests, 5 specs

| Spec | Guards (401/403) | Happy-path (SQL real) | Resultado |
|------|------------------|------------------------|-----------|
| `tests/api/admin/promote-super-admin.spec.ts` | 401 sin sesión; 403 ADMIN (AC-01) | POST promote → role ADMIN en DB + auditoría ADMIN_PROMOTED + re-promote 404 | ✅ 3/3 |
| `tests/api/admin/demote-super-admin.spec.ts` | 401 sin sesión; 403 ADMIN (AC-02) | POST demote → role USER en DB + auditoría ADMIN_DEMOTED + 400 self/SUPER_ADMIN/USER + 404 | ✅ 4/4 |
| `tests/api/admin/admins-list.spec.ts` | 401 sin sesión; 403 USER y ADMIN (AC-07) | GET lista ADMIN+SUPER_ADMIN (no USER) + `?search=` ILIKE | ✅ 3/3 |
| `tests/api/admin/audit-logs.spec.ts` | 401 sin sesión; 403 ADMIN (AC-07) | GET paginado + filtros actionType/userId + userEmail + 400 userId inválido/pageSize>100 | ✅ 3/3 |
| `tests/api/admin/academies-global.spec.ts` | 401 sin sesión; 403 ADMIN | GET lista academias globales con owner + memberCount/rubricCount | ✅ 3/3 |

### Nota sobre naming `-happy.spec.ts`

La convención de AGENTS.md (`-happy.spec.ts` cuando complementa un archivo guard-only) **no aplica aquí**: los 5 specs ya combinan guards 401/403 + happy-path con SQL real en el mismo archivo. No se generaron `promote-super-admin-happy.spec.ts` / `demote-super-admin-happy.spec.ts` duplicados — el happy-path con SQL real ya existe y pasa en `promote-super-admin.spec.ts:77` y `demote-super-admin.spec.ts:79`.

## E2E tests (Playwright) — 6 tests

| Spec | Cobertura | Resultado |
|------|-----------|-----------|
| `tests/e2e/super-admin.spec.ts` | `/admin/admins` y `/admin/platform` requieren auth (401); guards API 401 sin sesión (admins, audit-logs, academies, demote) | ✅ 6/6 |

## Cobertura de API docs

| Endpoint | `lib/api-docs/spec.ts` | Resultado |
|----------|------------------------|-----------|
| `POST /api/admin/users/[id]/promote` (MOD) | paths/padel.ts (guardSuperAdmin, 403) | ✅ |
| `POST /api/admin/users/[id]/demote` | paths/super-admin.ts | ✅ |
| `GET /api/admin/admins` | paths/super-admin.ts + schemas/super-admin.ts (AdminDto) | ✅ |
| `GET /api/admin/audit-logs` | paths/super-admin.ts + schemas/super-admin.ts (AuditLogDto, pagination) | ✅ |
| `GET /api/admin/academies` | paths/super-admin.ts + schemas/super-admin.ts (AcademyGlobalDto) | ✅ |

## Veredicto

**TODOS LOS TESTS PASAN** — sin bugs abiertos. No se requiere `repair-report.md` (no es un fix).