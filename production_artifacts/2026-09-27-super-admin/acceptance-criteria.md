# Acceptance Criteria — Rol SUPER_ADMIN (Super Admin de Plataforma)

> status: released
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## Resultado por criterio

| ID | Criterio | Estado | Evidencia |
|----|----------|--------|-----------|
| AC-01 | Solo SUPER_ADMIN puede promover USER→ADMIN (`POST promote` con ADMIN → 403) | ✅ PASS | `app/api/admin/users/[id]/promote/route.ts` usa `guardSuperAdmin`; test `promote-super-admin.spec.ts:43` (ADMIN → 403) |
| AC-02 | Solo SUPER_ADMIN puede demote ADMIN→USER (`POST demote` con ADMIN → 403) | ✅ PASS | `app/api/admin/users/[id]/demote/route.ts` usa `guardSuperAdmin`; test `demote-super-admin.spec.ts:43` (ADMIN → 403) |
| AC-03 | No puede existir 0 SUPER_ADMIN activos (demote/bloqueo del último → 400, validación transaccional) | ✅ PASS | `demoteUser` en `lib/db/queries/padel/super-admin.ts` valida `countActiveSuperAdmins` dentro de transacción (reason `last_super_admin` → 400); test `demote-super-admin.spec.ts:116` (400 self/SUPER_ADMIN/USER) |
| AC-04 | SUPER_ADMIN pasa `guardAdmin` y `validateAdmin` (jerarquía) | ✅ PASS | `admin-guard.ts` usa `isAdminRole` (ADMIN_ROLES = ['ADMIN','SUPER_ADMIN']); unit `tests/unit/auth/super-admin-guard.test.ts` |
| AC-05 | Toda acción de SUPER_ADMIN queda en `audit_logs` con eventos dedicados | ✅ PASS | `lib/audit/super-admin.ts` (`ADMIN_PROMOTED`, `ADMIN_DEMOTED`); tests verifican filas en audit_logs con `metadata.superAdmin=true` |
| AC-06 | UI `/admin/admins` y `/admin/platform` visibles solo para SUPER_ADMIN | ✅ PASS | `app/admin/admins/page.tsx` + `app/admin/platform/page.tsx` con `validateSuperAdmin`; E2E `super-admin.spec.ts` (401 sin auth) |
| AC-07 | `GET /api/admin/admins` y `GET /api/admin/audit-logs` → 403 ADMIN / 200 SUPER_ADMIN | ✅ PASS | Ambos routes con `guardSuperAdmin`; tests `admins-list.spec.ts:41` y `audit-logs.spec.ts:41` (403 ADMIN), happy-path 200 |
| AC-08 | Tests: unit + API happy-path SQL real + E2E | ✅ PASS | 31 unit tests, 16 API tests (5 specs con SQL real), 6 E2E tests — todos verdes |

## Criterios adicionales (edge cases validados)

| ID | Criterio | Estado | Evidencia |
|----|----------|--------|-----------|
| AC-09 | Demote de un USER (no ADMIN) → 400 | ✅ PASS | `demote/route.ts:44` + test `demote-super-admin.spec.ts:116` |
| AC-10 | Promote de un ADMIN (ya admin) → 404 (anti-IDOR, recurso no aplicable) | ✅ PASS | `promote/route.ts:31` + test `promote-super-admin.spec.ts:109` |
| AC-11 | SUPER_ADMIN no puede demotarse a sí mismo → 400 | ✅ PASS | `demote/route.ts:38` + test `demote-super-admin.spec.ts:127` |
| AC-12 | SUPER_ADMIN no es demotable por nadie → 400 | ✅ PASS | `demote/route.ts:41` + test `demote-super-admin.spec.ts:129` |
| AC-13 | SUPER_ADMIN no es bloqueable (lock) — `DELETE /api/admin/users/[id]` rechaza `isAdminRole` | ✅ PASS | `app/api/admin/users/[id]/route.ts` + unit `super-admin-guard.test.ts` |
| AC-14 | SUPER_ADMIN con status LOCKED/TEMPORARY → 403 en guardSuperAdmin; no cuenta como activo | ✅ PASS | `guardSuperAdmin` exige `status === 'ACTIVE'`; unit `super-admin-guard.test.ts` |
| AC-15 | `GET /api/admin/audit-logs` valida paginación (pageSize ≤ 100) y userId UUID → 400 | ✅ PASS | test `audit-logs.spec.ts:107-112` |
| AC-16 | `GET /api/admin/admins` soporta `?search=` (ILIKE) | ✅ PASS | test `admins-list.spec.ts:98` |
| AC-17 | `GET /api/admin/academies` lista academias globales con owner + métricas (memberCount, rubricCount) | ✅ PASS | test `academies-global.spec.ts:73` |

## Veredicto

**APROBADO** — 8/8 acceptance criteria de la spec + 9 criterios adicionales de edge cases cumplidos y verificados con tests verdes (unit + API SQL real + E2E).