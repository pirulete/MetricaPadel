# DB Plan — Rol SUPER_ADMIN (Fase A, @db-engineer)

> status: in-progress
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: db
> tags: [roles, rbac, super-admin, migration, audit]

## 1. Cambios de esquema

| Archivo | Cambio |
|---------|--------|
| `lib/db/schema.ts` (L4) | `userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN', 'SUPER_ADMIN'])` — único cambio. Sin tablas nuevas, sin enums nuevos, sin índices. |

## 2. Migración generada

- Comando: `pnpm run db:generate` → `drizzle/0009_third_white_tiger.sql`
- SQL generado (verificado, nunca a mano):
  ```sql
  ALTER TYPE "public"."user_role" ADD VALUE 'SUPER_ADMIN';
  ```
- Aditivo, sin backfill (no existen filas SUPER_ADMIN). Sin custom SQL añadido.
- `drizzle/meta/_journal.json`: orden cronológico verificado — `0009_third_white_tiger` al final (idx 9).
- Snapshot `drizzle/meta/0009_snapshot.json` contiene `SUPER_ADMIN` (verificado).

## 3. Ejecución y verificación post-migrate

- `pnpm run db:migrate` **saltó** la migración: el migrador resiliente (`scripts/migrate.ts`) solo bootstrapea — si todas las tablas críticas existen, hace `process.exit(0)` sin aplicar migraciones incrementales (limitación conocida, no un fallo).
- **Acción**: se aplicó el SQL generado manualmente contra Neon (PG 14+, `ALTER TYPE ADD VALUE` válido fuera de transacción) y se verificó:
  - `SELECT enum_range(NULL::user_role)` → `{USER,ADMIN,SUPER_ADMIN}` ✓
  - `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='role'` → existe ✓
- **Nota para próximas migraciones**: el migrador resiliente no aplica migraciones incrementales en DBs ya bootstrapedas; aplicar SQL generado manualmente + verificar (regla AGENTS.md).

## 4. Auditoría dedicada — `lib/audit/super-admin.ts` (NUEVO)

Helpers que delegan en `createAuditLog` (mismo patrón que `auditUpdate` de `helpers.ts`, pero con actionTypes dedicados — D4, AC-05):

| Helper | actionType | entity | entityId | oldValues | newValues | metadata |
|--------|-----------|--------|----------|-----------|-----------|----------|
| `auditAdminPromoted(actorId, targetUserId, context)` | `ADMIN_PROMOTED` | `user` | targetUserId | — | `{role:'ADMIN'}` | `{superAdmin:true}` |
| `auditAdminDemoted(actorId, targetUserId, context)` | `ADMIN_DEMOTED` | `user` | targetUserId | `{role:'ADMIN'}` | `{role:'USER'}` | `{superAdmin:true}` |
| `auditSuperAdminAction(actorId, action, entityName, entityId, changes?, context)` | `SUPER_ADMIN_ACTION` | param | param | — | changes | `{superAdmin:true, action}` |

- `lib/audit/helpers.ts` (539 líneas) **NO se tocó** — se mantiene < 600 (D4).
- Firma `(actorId, targetUserId, context)` alinea con el patrón existente de routes (`{ userId: session.user.id, ...extractRequestContext(request) }`).

## 5. Tests

`tests/unit/db/super-admin.test.ts` (NUEVO) — 6 tests, todos pasando (`npx jest tests/unit/db/super-admin.test.ts --no-coverage`):
1. `userRoleEnum` tiene exactamente 3 valores `['USER','ADMIN','SUPER_ADMIN']`.
2. `auditAdminPromoted` → `ADMIN_PROMOTED`, entity `user`, newValues `{role:'ADMIN'}`, metadata `{superAdmin:true}` (+ caso sin context).
3. `auditAdminDemoted` → `ADMIN_DEMOTED`, oldValues `{role:'ADMIN'}`, newValues `{role:'USER'}`.
4. `auditSuperAdminAction` → `SUPER_ADMIN_ACTION`, metadata `{superAdmin:true, action}` (+ caso sin changes/context).

## 6. Verificaciones de calidad

- `npx tsc --noEmit` → 0 errores.
- Snapshot Drizzle sincronizado con schema (db:generate, no SQL a mano).
- `_journal.json` sin edición manual.

## 7. Pendiente para Fase B (@auth-security)

- `lib/auth/role-utils.ts`: `ADMIN_ROLES = ['ADMIN','SUPER_ADMIN']`, `SUPER_ADMIN_ROLES`, `canAssignRole` (solo SUPER_ADMIN, nunca target SUPER_ADMIN).
- `lib/auth/admin-guard.ts`: `guardAdmin`/`validateAdmin` → `isAdminRole`; nuevos `guardSuperAdmin`/`validateSuperAdmin`.
- `types/auth.ts`, `lib/constants/navigation.ts`, `lib/auth/protected-routes.ts`.
- `tests/unit/audit/super-admin.test.ts` (Fase B) — los helpers ya quedan cubiertos por `tests/unit/db/super-admin.test.ts` (Fase A).