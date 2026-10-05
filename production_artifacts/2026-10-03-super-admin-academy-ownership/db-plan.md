# DB Plan — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (v0.9)

> change_id: 2026-10-03-super-admin-academy-ownership
> release: v0.9
> module: admin+academy
> date: 2026-10-03
> status: in-progress
> Rol: @db-engineer

## 1. Schema (`lib/db/schema.ts`)

### Enums nuevos (2)
- `academy_request_type` → `join_academy` | `create_academy`
- `academy_request_status` → `pending` | `approved` | `rejected`

### Tabla nueva `academy_access_requests` (1)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK defaultRandom | |
| user_id | uuid FK users no action | solicitante |
| type | academy_request_type notNull | join_academy / create_academy |
| academy_id | uuid FK academies set null | join_academy; null en create_academy |
| requested_role | academy_membership_role default COACH | OWNER/ADMIN/COACH |
| payload | jsonb default {} | create_academy: {name, slug, primaryColor?} |
| status | academy_request_status default pending | |
| reviewed_by | uuid FK users no action | revisor (SUPER_ADMIN) |
| reviewed_at | timestamp | |
| created_at / updated_at | timestamp defaultNow | |

### Índices (5)
- `academy_requests_user_idx` (user_id)
- `academy_requests_status_idx` (status)
- `academy_requests_academy_idx` (academy_id)
- `academy_requests_pending_join_idx` UNIQUE parcial: (user_id, type, academy_id) WHERE status='pending' AND type='join_academy' → fuente del 409
- `academy_requests_pending_create_idx` UNIQUE parcial: (user_id, type) WHERE status='pending' AND type='create_academy' → fuente del 409 (Postgres trata NULLs como distintos, por eso create necesita índice propio sin academy_id)

### Tipos TypeScript exportados
- `AcademyRequestType`, `AcademyRequestStatus`, `AcademyAccessRequest`, `NewAcademyAccessRequest`
- Relations: `academyAccessRequestsRelations` (user, academy, reviewer)

## 2. Migración `0011_dazzling_makkari.sql`

- `pnpm run db:generate` → DDL (2 enums + tabla + 5 índices)
- DO block data migration agregado al SQL generado (custom SQL, regla ARCHITECTURE)
- Re-`pnpm run db:generate` → snapshot sincronizado ("No schema changes, nothing to migrate")
- Journal: `0011_dazzling_makkari` último, orden cronológico OK

### DO block (fail-closed, idempotente)
1. `owner_id` de academias → único SUPER_ADMIN activo (más antiguo)
2. Membresías OWNER previas (no SA) → ADMIN (se conservan activas)
3. Upsert membresía OWNER activa del SA en cada academia
- Sin SUPER_ADMIN activo → `RAISE EXCEPTION` → migración falla (spec lo pide)

## 3. Queries nuevas (`lib/db/queries/padel/academy-requests.ts`)

| Función | Comportamiento |
|---------|----------------|
| `createAccessRequest` | insert pending; catch 23505 (error.code o error.cause.code) → `duplicate_pending` |
| `listAccessRequests` | join users (requester) + left join academies; filtros status/type |
| `getAccessRequestById` | detalle con requester + academy; null → 404 |
| `approveJoinRequest` | **tx**: request pending+join → null not_found; academia activa (academy_archived); sin membresía activa (already_member); insert membresía active con requestedRole + invitedBy=actorId; update request approved |
| `approveCreateRequest` | **tx**: request pending+create; slug del payload no existe (slug_exists); insert academia (ownerId=requester) + membresía OWNER active (lógica espejo de createAcademy con tx client — NO reusa createAcademy); update request approved |
| `rejectRequest` | update rejected solo si pending; ya revisada → already_reviewed |

Uniones discriminadas estilo `RemoveMemberResult`:
- `CreateAccessRequestResult`, `ApproveJoinRequestResult`, `ApproveCreateRequestResult`, `RejectRequestResult`

## 4. Queries modificadas (`lib/db/queries/padel/academies.ts`)

| Función | Comportamiento |
|---------|----------------|
| `transferOwnership(academyId, targetUserId)` | **tx**: academia inexistente → `target_not_found` (404); target user inexistente → `target_not_found` (404); target === owner actual → `self_transfer` (400); target sin membresía activa → `target_not_member` (404); target → OWNER active, previo OWNER → ADMIN active, academies.ownerId → target. Retorna `{ academy, previousOwner, newOwner }` |
| `assignMemberRole(academyId, userId, role)` | membresía activa requerida (null → not_found); role !== OWNER sobre único OWNER activo → `last_owner` (400); update role |
| `restoreAcademy(id)` | archived → active; ya active → `already_active` (400); inexistente → `not_found` |

Tipos: `TransferOwnershipResult`, `AssignMemberRoleResult`, `RestoreAcademyResult`.

## 5. Lógica pura (`lib/padel/academy-migration.ts`)

- `buildOwnershipMigrationPlan({ academies, ownerMemberships, superAdminId })` → `{ academiesToUpdate, membershipsToDemote, membershipsToInsert }` — espejo puro del DO block (AC-02), sin imports server-side.

## 6. Rubrics access (`lib/db/queries/padel/rubrics.ts`)

- `canAccessRubric`: institucional → membresía activa **o** SUPER_ADMIN global (3 líneas, app-notes §3)
- `canMutateRubric`: institucional → OWNER/ADMIN **o** SUPER_ADMIN global

## 7. Fix infra (`scripts/migrate.ts`)

- **Bug detectado**: `splitStatements` descartaba chunks que empiezan con comentario `--` → el DO block de la migración 0011 se saltaba silenciosamente (11 statements en vez de 12). En producción el data migration no habría corrido.
- **Fix**: el filtro ahora conserva chunks con SQL real (línea no-comentario) y solo descarta chunks comment-only. Verificado: 12 statements, DO block incluido.

## 8. Tests

| Archivo | Cubre |
|---------|-------|
| `tests/unit/db/academy-requests-queries.test.ts` | create (23505 → duplicate_pending, error.cause), list/get joins, approveJoin (not_found/already_reviewed/academy_archived/already_member/happy), approveCreate (slug_exists/happy), reject |
| `tests/unit/db/academy-migration.test.ts` | buildOwnershipMigrationPlan (AC-02): updates/demotes/inserts, no-op, no demote SA, insert sin membresía |
| `tests/unit/db/academy-ownership-queries.test.ts` | transferOwnership (404/400/happy), assignMemberRole (last_owner), restoreAcademy (already_active) |

Resultado: 308/308 unit tests db+padel pasan; typecheck 0 errores; lint 0 errores (32 warnings de `any` en mocks, permitidos).

## 9. Pendiente para otros agentes

- @auth-security: guard compuesto `guardSuperAdminOrAcademyRole` + `lib/audit/academy.ts` (helpers nuevos)
- @app-engineer: validations Zod, endpoints, lógica pura `lib/padel/academy-requests.ts`, hooks, UI coach, API docs
- @admin-engineer: admin platform + E2E