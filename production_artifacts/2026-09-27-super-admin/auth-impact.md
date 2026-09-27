# Auth Impact — Rol SUPER_ADMIN (auth-security)

> change_id: super-admin-role
> date: 2026-09-27
> module: auth
> status: in-progress

## Cambios en autenticación/autorización

| Archivo | Cambio | Impacto |
|---------|--------|---------|
| `lib/auth/admin-guard.ts` | `validateAdmin`/`guardAdmin` → `isAdminRole` (jerarquía) | SUPER_ADMIN hereda todo el back-office; ADMIN conserva acceso (retrocompatible, D1) |
| `lib/auth/admin-guard.ts` | NUEVO `guardSuperAdmin` (async, `Promise<NextResponse | null>`) | Endpoints exclusivos de plataforma: promote/demote/admins/audit-logs/academias-global |
| `lib/auth/admin-guard.ts` | NUEVO `validateSuperAdmin` | Layouts server `/admin/admins`, `/admin/platform` — redirect `/dashboard` si no aplica |
| `lib/auth/role-utils.ts` | `ADMIN_ROLES = ['ADMIN','SUPER_ADMIN']`, `SUPER_ADMIN_ROLES = ['SUPER_ADMIN']`, `isSuperAdminRole` | RBAC jerárquico; `canAccessModule`/`canDeleteUser` delegan en `isAdminRole` |
| `lib/auth/role-utils.ts` | `canAssignRole`: solo SUPER_ADMIN actor, target ∈ USER/ADMIN | ADMIN ya no puede promover (AC-01, breaking intencional); SUPER_ADMIN nunca asignable vía API (D2) |
| `app/api/admin/users/[id]/route.ts` | Lock: `isAdminRole(target.role)` → 403 | SUPER_ADMIN no bloqueable (AC-03); ADMIN sigue protegido |
| `types/auth.ts` | `role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'` | Tipado estricto; call sites con union `'ADMIN' | 'USER'` deben ampliarse |
| `lib/auth/protected-routes.ts` | 5 rutas documentadas (1 MOD + 4 NEW) | Referencia de guards por endpoint |

## Guard server-side verificado

- `guardSuperAdmin` es **async** (patrón academy-guard): `Promise<NextResponse | null>` — null = OK.
- 401 sin sesión; 403 si `role !== 'SUPER_ADMIN'` o `status !== 'ACTIVE'` (nunca LOCKED/TEMPORARY).
- `guardAdmin` mantiene firma sync existente — cero cambios en ~40 call sites.

## 403 en endpoints protegidos

- `POST /api/admin/users/[id]/promote`: ADMIN → 403 (antes 200) — **breaking intencional** documentado en release-scope (AC-01).
- `POST /api/admin/users/[id]/demote`, `GET /api/admin/admins`, `GET /api/admin/audit-logs`, `GET /api/admin/academies`: USER/ADMIN → 403, sin sesión → 401.
- Lock `DELETE /api/admin/users/[id]`: target SUPER_ADMIN → 403.

## Auditoría configurada

- `lib/audit/super-admin.ts` (ya creado por @db-engineer): `auditAdminPromoted` (ADMIN_PROMOTED), `auditAdminDemoted` (ADMIN_DEMOTED), `auditSuperAdminAction` (SUPER_ADMIN_ACTION) — actionTypes dedicados trazables en `GET /api/admin/audit-logs`.
- Los endpoints promote/demote usarán estos helpers (implementación @admin-engineer).

## Tests

- `tests/unit/auth/role-utils.test.ts` (NUEVO) — 12 tests.
- `tests/unit/auth/super-admin-guard.test.ts` (NUEVO) — 13 tests (incluye lock protection vía DELETE handler real).
- Suite auth completa: 76 tests pasando. `tsc --noEmit` 0 errores. Lint 0 errores en archivos tocados.

## Riesgos

- `promote` cambia de guardAdmin → guardSuperAdmin: los ADMINs existentes pierden promote (correcto por diseño, AC-01).
- `types/auth.ts` ampliado: compilación estricta puede exigir actualizar call sites con union `'ADMIN' | 'USER'` (grep pendiente en UI/navigation — @admin-engineer).