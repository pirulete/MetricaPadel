# Change Map — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (v0.9)

> change_id: 2026-10-03-super-admin-academy-ownership
> release: v0.9
> module: admin+academy

## Archivos a crear/modificar

| Path | Acción | Agente | Est. líneas | Notas |
|------|--------|--------|-------------|-------|
| `lib/db/schema.ts` | Modificar | @db-engineer | +45 (total ~805) | 2 enums + tabla `academy_access_requests` + índices parciales UNIQUE. Excepción 500 líneas (schema). |
| `drizzle/0011_*.sql` | Crear | @db-engineer | ~80 | `db:generate` + DO block data migration + re-`db:generate`. Verificar columnas post-migración. |
| `lib/db/queries/padel/academy-requests.ts` | Crear | @db-engineer | ~200 | create/list/get/approveJoin/approveCreate/reject (tx). |
| `lib/db/queries/padel/academies.ts` | Modificar | @db-engineer | +80 (total ~400) | transferOwnership, assignMemberRole, restoreAcademy. |
| `lib/db/queries/padel/super-admin.ts` | Modificar | @db-engineer | +15 | `listActiveAcademies()` (o en academies.ts). |
| `lib/padel/academy-migration.ts` | Crear | @db-engineer | ~60 | `buildOwnershipMigrationPlan` puro (unit-testable). |
| `lib/auth/academy-guard.ts` | Modificar | @auth-security | +40 (total ~150) | `guardSuperAdminOrAcademyRole` + 3 wrappers. |
| `lib/audit/academy.ts` | Crear | @auth-security | ~90 | 6 helpers nuevos (helpers.ts no se toca). |
| `lib/validations/academy.ts` | Modificar | @app-engineer | +50 (total ~100) | `academyCreateWithOwnerSchema`, `academyRequestCreateSchema` (discriminated union), `academyRequestQuerySchema`, `roleAssignSchema`, `transferOwnershipSchema`. |
| `lib/padel/academy-requests.ts` | Crear | @app-engineer | ~80 | `canAssignAcademyRole`, `validateRequestPayload`, `buildRequestAuditPayload`. |
| `app/api/academies/route.ts` | Modificar | @app-engineer | ~15 | POST → guardSuperAdmin + ownerId opcional. |
| `app/api/academies/[id]/route.ts` | Modificar | @app-engineer | +30 | Guards SuperAdminOr; DELETE → guardSuperAdminOrAcademyOwner. |
| `app/api/academies/[id]/logo/route.ts` | Modificar | @app-engineer | ~5 | Guard → guardSuperAdminOrAcademyAdmin. |
| `app/api/academies/[id]/members/route.ts` | Modificar | @app-engineer | ~5 | Guard → guardSuperAdminOrAcademyCoach. |
| `app/api/academies/[id]/members/invite/route.ts` | Modificar | @app-engineer | ~5 | Guard → guardSuperAdminOrAcademyAdmin. |
| `app/api/academies/[id]/members/[userId]/route.ts` | Modificar | @app-engineer | +40 | Guard SuperAdminOr + método PUT (role assign). |
| `app/api/academies/[id]/rubrics/route.ts` | Modificar | @app-engineer | ~10 | Guards → SuperAdminOr. |
| `app/api/academies/[id]/transfer-ownership/route.ts` | Crear | @app-engineer | ~60 | guardSuperAdmin + tx + auditoría. |
| `app/api/academies/[id]/restore/route.ts` | Crear | @app-engineer | ~50 | guardSuperAdmin + auditoría. |
| `app/api/academy-requests/route.ts` | Crear | @app-engineer | ~90 | POST (guardAdmin + rate limit) + GET (guardSuperAdmin). |
| `app/api/academy-requests/[id]/approve/route.ts` | Crear | @app-engineer | ~70 | guardSuperAdmin + auditoría. |
| `app/api/academy-requests/[id]/reject/route.ts` | Crear | @app-engineer | ~50 | guardSuperAdmin + auditoría. |
| `app/api/academy-requests/available-academies/route.ts` | Crear | @app-engineer | ~40 | guardAdmin, selector del modal join. |
| `hooks/use-academies.ts` | Modificar | @app-engineer | +40 | transferOwnership, assignRole, restore. |
| `hooks/use-academy-requests.ts` | Crear | @app-engineer | ~90 | create/list/approve/reject/available. |
| `app/(app)/academias/page.tsx` | Modificar | @app-engineer | ~20 | Quitar AcademyForm para ADMIN; botón "Solicitar acceso". |
| `components/padel/academy-request-form.tsx` | Crear | @app-engineer | ~150 | Modal 2 tabs (join/create). |
| `components/padel/academy-request-status.tsx` | Crear | @app-engineer | ~40 | Badge estado solicitudes (opcional). |
| `app/admin/platform/academias/page.tsx` | Crear | @admin-engineer | ~150 | Tabla academias + acciones SA. |
| `app/admin/platform/solicitudes/page.tsx` | Crear | @admin-engineer | ~120 | Tabla solicitudes + approve/reject. |
| `components/admin/platform/academy-admin-table.tsx` | Crear | @admin-engineer | ~120 | Tabla + acciones. |
| `components/admin/platform/academy-request-table.tsx` | Crear | @admin-engineer | ~100 | Tabla + approve/reject. |
| `components/admin/platform/academy-create-modal.tsx` | Crear | @admin-engineer | ~80 | Crear academia (ownerId opcional). |
| `components/admin/platform/transfer-ownership-modal.tsx` | Crear | @admin-engineer | ~70 | Select target + confirmar. |
| `components/admin/platform/role-assign-modal.tsx` | Crear | @admin-engineer | ~70 | Select rol (OWNER solo SA). |
| `app/admin/layout.tsx` | Modificar | @admin-engineer | ~10 | Links "Academias" y "Solicitudes" (SA). |
| `lib/api-docs/paths/academy-requests.ts` | Crear | @app-engineer | ~120 | Paths OpenAPI nuevos. |
| `lib/api-docs/schemas/academy-requests.ts` | Crear | @app-engineer | ~60 | Schemas OpenAPI nuevos. |
| `lib/api-docs/paths/academies.ts` | Modificar | @app-engineer | +60 | POST guard, transfer, restore, role. |
| `lib/api-docs/spec.ts` | Modificar | @app-engineer | ~5 | Wire tags/paths/schemas. |
| `tests/unit/padel/academy-requests.test.ts` | Crear | @app-engineer | ~80 | Lógica pura requests. |
| `tests/unit/padel/academy-ownership.test.ts` | Crear | @app-engineer | ~80 | Invariantes transfer/roles. |
| `tests/unit/db/academy-requests-queries.test.ts` | Crear | @db-engineer | ~90 | Queries requests. |
| `tests/unit/db/academy-migration.test.ts` | Crear | @db-engineer | ~70 | Plan de migración. |
| `tests/api/padel/academy-requests-happy.spec.ts` | Crear | @app-engineer | ~180 | SQL real. |
| `tests/api/padel/academy-requests-guard.spec.ts` | Crear | @app-engineer | ~140 | 401/403/400/404/409. |
| `tests/api/padel/academy-ownership-happy.spec.ts` | Crear | @app-engineer | ~160 | SQL real. |
| `tests/api/padel/academy-ownership-guard.spec.ts` | Crear | @app-engineer | ~120 | 401/403/400/404. |
| `tests/api/padel/academies-guard.spec.ts` | Modificar | @app-engineer | ~10 | POST /api/academies ADMIN → 403. |
| `tests/api/padel/academies-happy.spec.ts` | Modificar | @app-engineer | ~15 | Crear con SUPER_ADMIN. |
| `tests/e2e/academy-super-admin.spec.ts` | Crear | @admin-engineer | ~150 | Flujo SA navegable. |
| `ARCHITECTURE.md` | Modificar | @architect | +40 | Sección v0.9. |
| `FEATURES.md` | Modificar | implementadores | +30 | Entrada v0.9. |
| `.env.example` | Sin cambios | — | — | Sin env vars nuevas. |

## Orden de ejecución

1. @db-engineer (schema + migración + queries + unit db)
2. @auth-security (guards + auditoría + tests guard)
3. @app-engineer (validations + endpoints + lógica pura + hooks + UI coach + API docs + tests)
4. @admin-engineer (admin platform + componentes + E2E)
5. @ponytail-reviewer → @qa-release

## Gates

- `validate-harness.js --all` verde antes de merge a `rama-preview`.
- Cobertura sin regresión >3% en módulos afectados.
- API docs completos en `lib/api-docs/spec.ts`.
- Migración verificada: `SELECT owner_id FROM academies` + `SELECT count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> sa_id` = 0.