# Release Scope — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso

> change_id: 2026-10-03-super-admin-academy-ownership
> release: v0.9
> date: 2026-10-03
> module: admin+academy

## Módulos Afectados

| Módulo | Archivos esperados | Impacto |
|--------|--------------------|---------|
| DB | `lib/db/schema.ts`, migración Drizzle nueva (`academy_access_requests` + enums `academy_request_type`/`academy_request_status`), `lib/db/queries/padel/academies.ts` (transfer, role assign, unarchive), `lib/db/queries/padel/academy-requests.ts` (nuevo) | Alto — tabla nueva + data migration de ownership |
| Auth/RBAC | `lib/auth/academy-guard.ts` (guardSuperAdminAcademy o extensión), `lib/auth/admin-guard.ts` (reuso guardSuperAdmin), `lib/auth/role-utils.ts` | Medio — nuevos guards de rol dentro de academia |
| API | `app/api/academies/route.ts` (POST → guardSuperAdmin), `app/api/academies/[id]/route.ts` (unarchive, transfer, role assign), `app/api/academy-requests/` (nuevo: POST/GET/[id] approve/reject) | Alto — ~6-8 endpoints nuevos/modificados |
| UI | `app/(app)/academias/*` (quitar botón crear para ADMIN), `app/admin/platform/*` o nueva sección solicitudes (SUPER_ADMIN) | Medio |
| Auditoría | `lib/audit/helpers.ts` (eventos: REQUEST_CREATED/APPROVED/REJECTED, OWNERSHIP_TRANSFERRED, ACADEMY_RESTORED, ROLE_ASSIGNED) | Medio |
| Tests | `tests/unit/padel/*`, `tests/api/academy/*`, `tests/e2e/academy-super-admin.spec.ts` | Alto |
| Docs | `lib/api-docs/spec.ts`, `FEATURES.md`, `ARCHITECTURE.md` | Bajo |

## Riesgo

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Migración de ownership rompe academias existentes | Alta | Data migration idempotente + fallo explícito si no hay SUPER_ADMIN activo + verificación post-migración (`SELECT owner_id FROM academies`) |
| Breaking change: ADMIN global pierde creación | Media | Feature flag no necesario; documentar en release notes; UI oculta botón |
| Anti-IDOR en nuevos endpoints | Alta | Reusar patrón DB-backed guards + 404 para recursos ajenos |
| Invariante último OWNER | Alta | Transferencia transaccional: target→OWNER, previo→ADMIN; nunca 0 OWNER |
| Rate limit solicitudes | Media | Reusar patrón `academy-invite:{ip}` |

## Dependencias

- v0.7 SUPER_ADMIN (guardSuperAdmin, role-utils, super-admin queries) — released.
- v0.6 academia-branding (academies, memberships, guards academia) — released.
- Migración Drizzle nueva (tabla + enums + data migration).
- Auditoría existente extendida.

## Rollout

1. **Fase 1 — DB**: `db:generate` (tabla `academy_access_requests`, enums), data migration de ownership (ADMIN → único SUPER_ADMIN activo), verificación de columnas post-migración.
2. **Fase 2 — Backend**: guards + endpoints (creación restringida, solicitudes, approve/reject, transfer, role assign, unarchive) + auditoría.
3. **Fase 3 — Tests**: unit + API happy-path (SQL real) + guards + E2E.
4. **Fase 4 — UI**: ocultar creación para ADMIN, sección SUPER_ADMIN de solicitudes/gestión.
5. **Fase 5 — Docs**: `lib/api-docs/spec.ts`, FEATURES.md, ARCHITECTURE.md, `.env.example` si aplica (sin vars nuevas esperadas).
6. **Gate**: `validate-harness.js --all` verde antes de merge a `rama-preview`; `/supercommitpro` para producción.

## Notas

- Sin variables de entorno nuevas esperadas.
- Compatibilidad: endpoints existentes de academia mantienen contrato; solo cambia el guard de creación (403 para ADMIN global).
- El rol ADMIN de academia (membresía) lo ocupa un coach (ADMIN global) — no confundir con SUPER_ADMIN.