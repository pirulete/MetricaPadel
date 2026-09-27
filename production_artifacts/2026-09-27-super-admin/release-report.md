# Release Report — Rol SUPER_ADMIN (Super Admin de Plataforma)

> status: released
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## Resumen

Release del rol global `SUPER_ADMIN` (jerárquicamente superior a ADMIN) con capacidades exclusivas de plataforma: promote/demote de admins, lectura de audit_logs, visibilidad global de academias y páginas admin dedicadas. RBAC por academia (OWNER/ADMIN/COACH) intacto. Cierra los 10 gaps del audit previo (`2026-09-27-super-admin-audit`).

## Veredicto

**✅ APROBADO PARA RELEASE** — 8/8 acceptance criteria + 9 edge cases adicionales cumplidos. Todos los gates verdes:

| Gate | Resultado |
|------|-----------|
| typecheck | ✅ 0 errores |
| unit tests | ✅ 524/524 (43 suites) |
| API tests | ✅ 16/16 (5 specs, happy-path SQL real por endpoint) |
| E2E | ✅ 6/6 |
| api-docs | ✅ 5 endpoints documentados en `lib/api-docs/spec.ts` |
| lint/build | ✅ (sin regresión — verificado en implementación) |

## Cambios principales

- **DB**: migración `0009_third_white_tiger.sql` (enum `user_role` + SUPER_ADMIN); queries `lib/db/queries/padel/super-admin.ts`; lógica pura `lib/padel/super-admin.ts`.
- **Auth**: `guardSuperAdmin`/`validateSuperAdmin`; jerarquía `guardAdmin` acepta SUPER_ADMIN; `role-utils.ts` con `canAssignRole` restringido.
- **API**: promote MOD (guardSuperAdmin) + 4 endpoints nuevos (demote, admins, audit-logs, academias globales).
- **UI**: `/admin/admins` + `/admin/platform` (solo SUPER_ADMIN) + nav condicional.
- **Auditoría**: `lib/audit/super-admin.ts` (ADMIN_PROMOTED, ADMIN_DEMOTED).

## Seguridad validada

- ✅ Promote/demote exclusivos de SUPER_ADMIN (403 para ADMIN).
- ✅ Invariante último SUPER_ADMIN (transaccional, no puede quedar 0 activos).
- ✅ SUPER_ADMIN no auto-demotable, no demotable por nadie, no bloqueable.
- ✅ Anti-IDOR: recurso ajeno/inexistente → 404 (no 403).
- ✅ Estados: guardSuperAdmin exige ACTIVE (LOCKED/TEMPORARY → 403).
- ✅ Auditoría dedicada en toda mutación.

## Bugs encontrados

Ninguno. No se genera `repair-report.md` (no es un fix).

## Archivos de release

- `acceptance-criteria.md` — 8 AC spec + 9 edge cases, todos PASS
- `test-matrix.md` — matriz completa de tests (unit/API/E2E) + cobertura API docs
- `feature-spec.md`, `change-map.md`, `technical-design.md`, `auth-impact.md`, `security-checklist.md`, `db-plan.md`, `ponytail-review-report.md` — artifacts previos del workflow

## Notas de rollout

- Primer SUPER_ADMIN: seed/DB manual (patrón primer ADMIN, QUICKSTART §7) — nunca vía API.
- Migración `0009` requiere `pnpm run db:migrate` con `DATABASE_URL`; verificar `enum_range` post-migración.
- FEATURES.md actualizado a `status: released` con sección "Solución Implementada".