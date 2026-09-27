# Release Scope — v0.7 (Super Admin)

> status: proposed
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## Objetivo del Release

Entregar el rol SUPER_ADMIN de plataforma: jerarquía de roles, gestión de admins con seguridad (promote/demote restringido + protección último), auditoría dedicada, visibilidad global (admins, audit-logs, academias) y UI exclusiva.

## Features en Scope

| # | Feature | change_id | Módulo | ACs |
|---|---------|-----------|--------|-----|
| 1 | Enum `user_role` + SUPER_ADMIN (migración aditiva) | super-admin-role | db | — |
| 2 | Guards `guardSuperAdmin`/`validateSuperAdmin` + jerarquía en `guardAdmin`/`validateAdmin` | super-admin-role | auth | AC-04 |
| 3 | Promote restringido a SUPER_ADMIN + endpoint `demote` + protección último admin | super-admin-role | api+auth | AC-01, AC-02, AC-03 |
| 4 | Auditoría dedicada (`ADMIN_PROMOTED`, `ADMIN_DEMOTED`, `SUPER_ADMIN_ACTION`) | super-admin-role | audit | AC-05 |
| 5 | `GET /api/admin/admins`, `GET /api/admin/audit-logs`, `GET /api/admin/academies` | super-admin-role | api | AC-07 |
| 6 | UI `/admin/admins` + `/admin/platform` (solo SUPER_ADMIN) | super-admin-role | ui | AC-06 |
| 7 | Tests unit + API + E2E | super-admin-role | tests | AC-08 |

## Fuera de Scope (v0.7)

- Dashboard de métricas globales de plataforma.
- RBAC fino por módulo.
- Gestión de términos/legal desde UI.
- Self-service de registro de SUPER_ADMIN.

## Dependencias

- Audit `2026-09-27-super-admin-audit` (completado).
- Migración Drizzle (enum) — `db:generate` + verificación de columnas post-migrate.
- `lib/api-docs/spec.ts` + `lib/auth/protected-routes.ts` actualizados.

## Orden de Ejecución Sugerido

1. **@db-engineer**: enum + migración.
2. **@auth-security**: guards, role-utils, protección último admin, auditoría.
3. **@app-engineer/@admin-engineer**: endpoints + UI + api-docs.
4. **@qa-release**: test-matrix, acceptance-criteria, release-report.

## Gates de Salida

- typecheck, lint, build 0 errores.
- Unit suite verde (guards + role-utils + último admin).
- API happy-path con SQL real por endpoint + guards 401/403.
- E2E flujo promote/demote navegable.
- Cobertura módulo admin/auth sin regresión >3%.
- FEATURES.md actualizado con entry `super-admin-role`.