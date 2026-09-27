# Security Checklist — Rol SUPER_ADMIN (auth-security)

> change_id: super-admin-role
> date: 2026-09-27
> module: auth
> status: in-progress

## OWASP Top 10 — revisión por cambio

| OWASP | Control aplicado | Estado |
|-------|------------------|--------|
| A01 Broken Access Control | `guardSuperAdmin` (async) en endpoints exclusivos; `guardAdmin` jerárquico; `canAssignRole` solo SUPER_ADMIN actor y nunca target SUPER_ADMIN; lock protege `isAdminRole` | ✅ |
| A02 Cryptographic Failures | Sin cambios criptográficos (JWT/session intactos) | ✅ |
| A03 Injection | Sin cambios en queries; validación Zod existente intacta | ✅ |
| A04 Insecure Design | Invariante "≥1 SUPER_ADMIN activo" por construcción: demote rechaza SUPER_ADMIN target (400), lock rechaza isAdminRole (403), self-demote 400 | ✅ |
| A05 Security Misconfiguration | Sin cambios de config; `NEXTAUTH_SECRET` intacto | ✅ |
| A07 Identification/Auth Failures | Estados respetados: guardSuperAdmin exige `status === 'ACTIVE'`; nunca LOCKED/TEMPORARY | ✅ |
| A09 Logging/Monitoring | Auditoría dedicada `ADMIN_PROMOTED`/`ADMIN_DEMOTED`/`SUPER_ADMIN_ACTION` (lib/audit/super-admin.ts) + `console.warn` en validateSuperAdmin | ✅ |
| A10 SSRF | Sin cambios | ✅ |

## Checklist de seguridad

- [x] Guard server-side verificado: `guardSuperAdmin` async, null = OK.
- [x] 401 sin sesión / 403 sin rol o status no-ACTIVE en todos los endpoints nuevos.
- [x] SUPER_ADMIN no bloqueable (lock → 403 vía `isAdminRole`).
- [x] SUPER_ADMIN no asignable vía API (`canAssignRole` target ∈ USER/ADMIN).
- [x] ADMIN no puede promover (breaking intencional AC-01) ni demotar.
- [x] Auditoría en mutaciones sensibles (promote/demote → helpers dedicados).
- [x] Anti-IDOR: promote/demote filtran por rol target (404 si no aplica); demote self → 400.
- [x] Estados: `ACTIVE` obligatorio; LOCKED/TEMPORARY → 403/redirect.
- [x] Sin variables de entorno nuevas; sin cambios en cookies/CSRF/session TTL.
- [x] `tsc --noEmit` 0 errores; lint 0 errores en archivos tocados; 25 tests unit nuevos.

## Pendiente (otros agentes)

- [ ] Endpoints promote/demote/admins/audit-logs/academias-global con `guardSuperAdmin` + audit helpers (@admin-engineer).
- [ ] API tests guard 401/403 + happy-path SQL real por endpoint (@admin-engineer).
- [ ] E2E flujo promote/demote navegable (@qa-release).
- [ ] `lib/api-docs/spec.ts` con endpoints nuevos (@admin-engineer).
- [ ] UI `/admin/admins` + `/admin/platform` con `validateSuperAdmin` (@admin-engineer).
- [ ] Verificación post-migrate: `SELECT enum_range(NULL::user_role)` incluye SUPER_ADMIN (@db-engineer).