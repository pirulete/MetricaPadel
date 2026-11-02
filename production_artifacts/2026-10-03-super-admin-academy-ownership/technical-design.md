# Technical Design — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (v0.9)

> change_id: 2026-10-03-super-admin-academy-ownership
> release: v0.9
> module: admin+academy
> date: 2026-10-03
> status: in-progress

## 1. Decisiones de diseño (respetando el spec)

| # | Decisión | Detalle |
|---|----------|---------|
| D1 | Creación solo SUPER_ADMIN | `POST /api/academies` cambia `guardAdmin` → `guardSuperAdmin`. Body acepta `ownerId` opcional (default = session user) para que SUPER_ADMIN asigne OWNER a otro miembro. |
| D2 | Migración ownership | Data migration idempotente: `ownerId` de academias → único SUPER_ADMIN activo; membresías OWNER previas del coach → ADMIN; upsert membresía OWNER activa del SUPER_ADMIN en cada academia. Fallo explícito si no hay SUPER_ADMIN activo. |
| D3 | Tabla `academy_access_requests` | type `join_academy`/`create_academy`, requestedRole OWNER/ADMIN/COACH, payload jsonb, status pending/approved/rejected. Índices parciales UNIQUE para duplicados pendientes (409). |
| D4 | Guard compuesto | Un solo genérico `guardSuperAdminOrAcademyRole(session, academyId, allowedRoles)` en `academy-guard.ts` (mejor que 2 funciones duplicadas): path SUPER_ADMIN verifica existencia de academia (404 anti-IDOR) y permite archivadas (visibilidad plataforma); path no-SA delega en `guardAcademyRole` existente. Wrappers: `guardSuperAdminOrAcademyOwner/Admin/Coach`. |
| D5 | Transfer ownership | Solo SUPER_ADMIN (`guardSuperAdmin` + existencia academia → 404). Target → OWNER, previo → ADMIN, `academies.ownerId` → target. Tx. Self-transfer → 400. |
| D6 | Role assignment | `PUT /api/academies/[id]/members/[userId]` con `guardSuperAdminOrAcademyAdmin`; regla de negocio en handler: `role=OWNER` requiere SUPER_ADMIN (función pura `canAssignAcademyRole`). |
| D7 | Unarchive | `POST /api/academies/[id]/restore`, solo SUPER_ADMIN. 400 si ya está activa. |
| D8 | Approve join/create | `POST /api/academy-requests/[id]/approve` (SUPER_ADMIN). join → membresía active con requestedRole (409 si ya miembro activo); create → academia + OWNER=requester (409 si slug colisiona al aprobar). |
| D9 | Rate limit solicitudes | Key `academy-request:{ip}`, 10/min, ventana 60s, reusa `checkPublicRateLimit` (patrón `academy-invite`). |
| D10 | Auditoría | Helpers nuevos en `lib/audit/academy.ts` (archivo nuevo — `helpers.ts` ya tiene 579 líneas, no crece más). Eventos: REQUEST_CREATED/APPROVED/REJECTED, OWNERSHIP_TRANSFERRED, ACADEMY_RESTORED, MEMBER_ROLE_ASSIGNED. |
| D11 | Retrocompatibilidad | Contratos existentes intactos salvo guard de creación (403 para ADMIN global, breaking documentado). Guards de academia existentes se extienden con variante SuperAdminOr — no se eliminan. |

## 2. Schema DB

### 2.1 Enums nuevos (en `lib/db/schema.ts`, sección academia)

```ts
export const academyRequestTypeEnum = pgEnum('academy_request_type', ['join_academy', 'create_academy']);
export const academyRequestStatusEnum = pgEnum('academy_request_status', ['pending', 'approved', 'rejected']);

export type AcademyRequestType = (typeof academyRequestTypeEnum.enumValues)[number];
export type AcademyRequestStatus = (typeof academyRequestStatusEnum.enumValues)[number];
```

### 2.2 Tabla nueva `academy_access_requests`

```ts
export const academyAccessRequests = pgTable("academy_access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "no action" }),
  type: academyRequestTypeEnum("type").notNull(),
  academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }), // join_academy; null en create_academy
  requestedRole: academyMembershipRoleEnum("requested_role").notNull().default('COACH'),
  payload: jsonb("payload").notNull().default({}), // create_academy: {name, slug, primaryColor?}
  status: academyRequestStatusEnum("status").notNull().default('pending'),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "no action" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("academy_requests_user_idx").on(table.userId),
  index("academy_requests_status_idx").on(table.status),
  index("academy_requests_academy_idx").on(table.academyId),
  // Duplicado pendiente join: mismo usuario + type + academia → 409
  uniqueIndex("academy_requests_pending_join_idx")
    .on(table.userId, table.type, table.academyId)
    .where(sql`${table.status} = 'pending' AND ${table.type} = 'join_academy'`),
  // Duplicado pendiente create: mismo usuario + type (academyId null) → 409
  uniqueIndex("academy_requests_pending_create_idx")
    .on(table.userId, table.type)
    .where(sql`${table.status} = 'pending' AND ${table.type} = 'create_academy'`),
]);
```

Nota: los índices parciales UNIQUE son la fuente de verdad del 409 (Postgres trata NULLs como distintos, por eso `create_academy` necesita su propio índice sin academyId).

### 2.3 Data migration (custom SQL en la migración generada por `db:generate`)

Regla @db-engineer: `pnpm run db:generate` primero (tabla + enums), luego agregar el DO block al archivo SQL generado, y re-ejecutar `db:generate` para actualizar el snapshot. Migración esperada: `0011_*`.

```sql
-- Data migration: ownership de academias → único SUPER_ADMIN activo (idempotente)
DO $$
DECLARE
  sa_id uuid;
BEGIN
  SELECT id INTO sa_id FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;
  IF sa_id IS NULL THEN
    RAISE EXCEPTION 'No existe SUPER_ADMIN activo; migración de ownership abortada';
  END IF;

  -- 1. ownerId de academias → SUPER_ADMIN
  UPDATE academies SET owner_id = sa_id, updated_at = now() WHERE owner_id IS DISTINCT FROM sa_id;

  -- 2. Membresías OWNER previas (no SUPER_ADMIN) → ADMIN (se conservan activas)
  UPDATE academy_memberships SET role = 'ADMIN', updated_at = now()
  WHERE role = 'OWNER' AND status = 'active' AND user_id <> sa_id;

  -- 3. Upsert membresía OWNER activa del SUPER_ADMIN en cada academia
  UPDATE academy_memberships SET role = 'OWNER', status = 'active', updated_at = now()
  WHERE user_id = sa_id AND academy_id IN (SELECT id FROM academies);

  INSERT INTO academy_memberships (academy_id, user_id, role, status, created_at, updated_at)
  SELECT a.id, sa_id, 'OWNER', 'active', now(), now()
  FROM academies a
  WHERE NOT EXISTS (
    SELECT 1 FROM academy_memberships m WHERE m.academy_id = a.id AND m.user_id = sa_id
  );
END $$;
```

Idempotencia: paso 1 no-op si owner ya es SA; paso 2 no-op si no hay OWNER no-SA; paso 3 no-op si la membresía SA ya existe. Verificación post-migración (obligatoria): `SELECT owner_id FROM academies` y `SELECT count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> sa_id` = 0.

## 3. Guards

### 3.1 Nuevo guard compuesto en `lib/auth/academy-guard.ts`

```ts
/**
 * Guard compuesto: SUPER_ADMIN (global, plataforma) O rol de academia.
 * - Path SUPER_ADMIN: verifica que la academia EXISTE (404 anti-IDOR si no);
 *   permite academias archivadas (visibilidad plataforma, D4).
 * - Path no-SA: delega en guardAcademyRole (membresía activa + academia activa).
 */
async function guardSuperAdminOrAcademyRole(
  session: any,
  academyId: string,
  allowedRoles: AcademyMembershipRole[]
): Promise<NextResponse | null> {
  const gate = sessionGate(session);
  if (gate) return gate;

  if (isSuperAdminRole(session.user.role) && session.user.status === 'ACTIVE') {
    const academy = await db.query.academies.findFirst({ where: eq(academies.id, academyId) });
    if (!academy) return notFound();
    return null;
  }
  return guardAcademyRole(session, academyId, allowedRoles);
}

export const guardSuperAdminOrAcademyOwner = (s: any, id: string) => guardSuperAdminOrAcademyRole(s, id, [OWNER]);
export const guardSuperAdminOrAcademyAdmin = (s: any, id: string) => guardSuperAdminOrAcademyRole(s, id, [OWNER, ADMIN]);
export const guardSuperAdminOrAcademyCoach = (s: any, id: string) => guardSuperAdminOrAcademyRole(s, id, [OWNER, ADMIN, COACH]);
```

Importa `isSuperAdminRole` de `lib/auth/role-utils` y `academies` de schema. Comportamiento: 401 sin sesión, 403 LOCKED/TEMPORARY/rol insuficiente, 404 anti-IDOR (academia inexistente para SA; membresía inexistente o academia archivada para no-SA).

### 3.2 Endpoints que usan guardSuperAdmin puro (sin membresía)

- `POST /api/academies` (crear), `POST /api/academies/[id]/transfer-ownership`, `POST /api/academies/[id]/restore`, `GET /api/academy-requests`, `POST /api/academy-requests/[id]/approve`, `POST /api/academy-requests/[id]/reject` → `guardSuperAdmin(session)` + verificación explícita de existencia del recurso (404).

### 3.3 Mapa de guards por endpoint (existente + nuevo)

| Endpoint | Guard actual | Guard nuevo |
|----------|--------------|-------------|
| GET /api/academies | guardUser | sin cambio |
| POST /api/academies | guardAdmin | **guardSuperAdmin** |
| GET /api/academies/[id] | guardAcademyCoach | guardSuperAdminOrAcademyCoach |
| PUT /api/academies/[id] | guardAcademyAdmin | guardSuperAdminOrAcademyAdmin |
| DELETE /api/academies/[id] | guardAcademyOwner | guardSuperAdminOrAcademyOwner |
| POST /api/academies/[id]/logo | guardAcademyAdmin | guardSuperAdminOrAcademyAdmin |
| GET /api/academies/[id]/members | guardAcademyCoach | guardSuperAdminOrAcademyCoach |
| POST /api/academies/[id]/members/invite | guardAcademyAdmin | guardSuperAdminOrAcademyAdmin |
| DELETE /api/academies/[id]/members/[userId] | guardAcademyAdmin | guardSuperAdminOrAcademyAdmin |
| POST /api/academies/[id]/members/[userId]/accept | guardUser self | sin cambio |
| GET/POST /api/academies/[id]/rubrics | guardAcademyCoach/Admin | guardSuperAdminOrAcademyCoach/Admin |
| POST /api/academies/[id]/transfer-ownership | — | guardSuperAdmin |
| PUT /api/academies/[id]/members/[userId] | — | guardSuperAdminOrAcademyAdmin + regla OWNER |
| POST /api/academies/[id]/restore | — | guardSuperAdmin |
| POST /api/academy-requests | — | guardAdmin (coach) |
| GET /api/academy-requests | — | guardSuperAdmin |
| POST /api/academy-requests/[id]/approve | — | guardSuperAdmin |
| POST /api/academy-requests/[id]/reject | — | guardSuperAdmin |
| GET /api/academy-requests/available-academies | — | guardAdmin |

## 4. Contratos API (contract-first)

Convenciones: `NextResponse.json`, Zod parse → 400, guard early-return, audit helpers, 23505 → 409. Todos los endpoints nuevos se documentan en `lib/api-docs/spec.ts`.

### 4.1 `POST /api/academies` (MODIFICADO)

- **Guard**: `guardSuperAdmin`
- **Request body** (`academyCreateSchema` extendido):
  ```ts
  academyCreateWithOwnerSchema = academyCreateSchema.extend({
    ownerId: z.string().uuid("ownerId debe ser un uuid válido").optional(), // default = session.user.id
  });
  ```
- **201**: `{ academy }` (AcademyDto)
- **400**: Zod inválido / ownerId no existe en users
- **401/403**: sin sesión / no SUPER_ADMIN
- **409**: slug duplicado (23505)
- **Auditoría**: `auditAcademyCreated` (existente)

### 4.2 `POST /api/academy-requests` (NUEVO)

- **Guard**: `guardAdmin` (coach global, ACTIVE)
- **Rate limit**: `checkPublicRateLimit('academy-request:' + ip, { windowMs: ACADEMY_REQUEST_WINDOW_MS, max: ACADEMY_REQUEST_MAX })` → 429
- **Request body** (discriminated union en `lib/validations/academy.ts`):
  ```ts
  academyRequestCreateSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('join_academy'),
      academyId: z.string().uuid(),
      requestedRole: z.enum(['ADMIN', 'COACH']),
    }),
    z.object({
      type: z.literal('create_academy'),
      name: z.string().trim().min(1).max(200),
      slug: z.string().trim().toLowerCase().regex(academySlugRegex),
      primaryColor: z.string().regex(hexColorRegex).optional(),
      requestedRole: z.literal('OWNER').optional(), // default OWNER
    }),
  ]);
  ```
- **201**: `{ request }` (AcademyRequestDto)
- **400**: Zod inválido / academia archivada (join)
- **401/403**: sin sesión / no ADMIN global
- **404**: academia inexistente (join)
- **409**: duplicado pendiente (índice parcial) / ya miembro activo (join) / slug existe (create)
- **Auditoría**: `auditAccessRequestCreated`

### 4.3 `GET /api/academy-requests` (NUEVO)

- **Guard**: `guardSuperAdmin`
- **Query**: `status?` (pending|approved|rejected), `type?` (join_academy|create_academy) — Zod `academyRequestQuerySchema`
- **200**: `{ requests: AcademyRequestDto[] }` — incluye requester (email/firstName/lastName), academy (name/slug), payload, status, reviewedBy
- **401/403**
- **Sin auditoría** (lectura)

### 4.4 `POST /api/academy-requests/[id]/approve` (NUEVO)

- **Guard**: `guardSuperAdmin`
- **200**: `{ request, membership? }` (join) | `{ request, academy? }` (create)
- **400**: solicitud ya revisada (approved/rejected)
- **401/403**
- **404**: solicitud inexistente
- **409**: join → usuario ya miembro activo; create → slug colisiona al aprobar
- **Auditoría**: `auditAccessRequestApproved` + `auditMemberRoleAssigned` (join) o `auditAcademyCreated` (create)

### 4.5 `POST /api/academy-requests/[id]/reject` (NUEVO)

- **Guard**: `guardSuperAdmin`
- **200**: `{ request }`
- **400**: solicitud ya revisada
- **401/403**
- **404**: solicitud inexistente
- **Auditoría**: `auditAccessRequestRejected`

### 4.6 `GET /api/academy-requests/available-academies` (NUEVO)

- **Guard**: `guardAdmin`
- **200**: `{ academies: [{ id, name, slug }] }` — academias activas para el selector del modal de join
- **401/403**
- **Sin auditoría** (lectura)

### 4.7 `POST /api/academies/[id]/transfer-ownership` (NUEVO)

- **Guard**: `guardSuperAdmin` + `getAcademyById(id)` → 404 si no existe
- **Request body**: `{ targetUserId: z.string().uuid() }`
- **200**: `{ academy, previousOwner: { userId, role }, newOwner: { userId, role } }`
- **400**: self-transfer (target === session.user.id) / target no es miembro activo
- **401/403**
- **404**: academia inexistente / target inexistente
- **Auditoría**: `auditOwnershipTransferred`

### 4.8 `PUT /api/academies/[id]/members/[userId]` (NUEVO método en ruta existente)

- **Guard**: `guardSuperAdminOrAcademyAdmin`
- **Request body**: `{ role: z.enum(['OWNER', 'ADMIN', 'COACH']) }`
- **Regla handler**: `role === 'OWNER' && !isSuperAdminRole(session.user.role)` → 403 (función pura `canAssignAcademyRole`)
- **200**: `{ membership }`
- **400**: miembro pending/removed / demote del último OWNER activo
- **401/403**
- **404**: academia/miembro inexistente
- **Auditoría**: `auditMemberRoleAssigned`

### 4.9 `POST /api/academies/[id]/restore` (NUEVO)

- **Guard**: `guardSuperAdmin` + `getAcademyById(id)` → 404 si no existe
- **200**: `{ academy }`
- **400**: academia ya activa
- **401/403**
- **404**: academia inexistente
- **Auditoría**: `auditAcademyRestored`

### 4.10 `GET /api/academies/[id]/rubrics` (GUARD MODIFICADO)

- **Guard**: `guardAcademyCoach` → `guardSuperAdminOrAcademyCoach` (SUPER_ADMIN ve rúbricas de cualquier academia)
- **200**: `{ rubrics }` (reusa `listInstitutionalRubrics`)

## 5. Queries

### 5.1 `lib/db/queries/padel/academy-requests.ts` (NUEVO)

- `createAccessRequest(input: { userId, type, academyId?, requestedRole, payload })` → insert; catch 23505 → `{ ok: false, reason: 'duplicate_pending' }`
- `listAccessRequests(filters: { status?, type? })` → join users (requester) + left join academies (name/slug)
- `getAccessRequestById(id)` → con requester + academy
- `approveJoinRequest(requestId, actorId)` → **tx**: carga request (pending, join) → null si no; academia activa (error `academy_archived`); usuario sin membresía activa (error `already_member`); insert membresía (role=requestedRole, status=active, invitedBy=actorId); update request → approved/reviewedBy/reviewedAt. Retorna `{ request, membership }`.
- `approveCreateRequest(requestId, actorId)` → **tx**: carga request (pending, create); slug del payload no existe en academies (error `slug_exists`); insert academia (ownerId=requester) + membresía OWNER activa (lógica espejo de `createAcademy` pero con el cliente tx — no reusar `createAcademy` porque abre su propia tx); update request → approved. Retorna `{ request, academy }`.
- `rejectRequest(requestId, actorId)` → update status rejected solo si pending (si no → `already_reviewed`)

### 5.2 `lib/db/queries/padel/academies.ts` (MODIFICAR)

- `transferOwnership(academyId, targetUserId)` → **tx**: academia existe (null); target es miembro activo (error `target_not_member`); target !== owner actual (error `self_transfer`); update target membresía → OWNER active; update membresía OWNER previa → ADMIN active; update `academies.ownerId` → target. Retorna `{ academy, previousOwner, newOwner }`.
- `assignMemberRole(academyId, userId, role)` → membresía activa (null); si role !== OWNER y es el último OWNER activo → `last_owner`; update role. Retorna membresía.
- `restoreAcademy(id)` → update status active solo si archived (si active → `already_active`).

### 5.3 `lib/db/queries/padel/super-admin.ts` (MODIFICAR, menor)

- `listActiveAcademies()` → `{ id, name, slug }` de academias activas (para `GET /api/academy-requests/available-academies`). Alternativa: query simple en `academies.ts`.

## 6. Lógica pura (unit-testable, sin imports server-side)

### 6.1 `lib/padel/academy-requests.ts` (NUEVO)

- `canAssignAcademyRole(actorRole: 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'COACH', targetRole: AcademyMembershipRole): boolean` — SUPER_ADMIN → true (cualquier rol); OWNER/ADMIN → target ∈ {ADMIN, COACH}; COACH → false.
- `validateRequestPayload(type, payload)` — invariantes del payload por tipo (usado por unit tests).
- `buildRequestAuditPayload(request)` — payload normalizado para auditoría.

### 6.2 `lib/padel/academy-migration.ts` (NUEVO)

- `buildOwnershipMigrationPlan({ academies, ownerMemberships, superAdminId })` → `{ academiesToUpdate: string[], membershipsToDemote: string[], membershipsToInsert: string[] }` — espejo puro del DO block SQL; la migración real ejecuta el SQL, esta función permite unit-testear la lógica de reasignación (AC-02).

## 7. Auditoría — `lib/audit/academy.ts` (NUEVO)

Helpers nuevos (importan `createAuditLog` de `helpers.ts`; `helpers.ts` NO se toca — ya tiene 579 líneas):

| Helper | Evento | entityName |
|--------|--------|------------|
| `auditAccessRequestCreated(requestId, data, ctx)` | REQUEST_CREATED | academy_access_requests |
| `auditAccessRequestApproved(requestId, data, ctx)` | REQUEST_APPROVED | academy_access_requests |
| `auditAccessRequestRejected(requestId, data, ctx)` | REQUEST_REJECTED | academy_access_requests |
| `auditOwnershipTransferred(academyId, data, ctx)` | OWNERSHIP_TRANSFERRED | academies |
| `auditAcademyRestored(academyId, oldValues, ctx)` | ACADEMY_RESTORED | academies |
| `auditMemberRoleAssigned(academyId, memberId, data, ctx)` | MEMBER_ROLE_ASSIGNED | academy_memberships |

## 8. UI

### 8.1 Usuario coach (`app/(app)/academias`)

- **Modificar** `app/(app)/academias/page.tsx`: quitar `AcademyForm` para ADMIN (AC-01: el ADMIN global pierde el botón "Crear academia"); agregar botón "Solicitar acceso" (solo ADMIN) que abre `AcademyRequestForm`.
- **Nuevo** `components/padel/academy-request-form.tsx`: modal con 2 tabs — "Unirme a academia" (select de `GET /api/academy-requests/available-academies` + rol ADMIN/COACH) y "Crear academia para mí" (name/slug/primaryColor, rol OWNER implícito). Feedback con Sonner.
- **Nuevo** `components/padel/academy-request-status.tsx` (opcional, mínimo): badge de estado de solicitudes pendientes del coach.

### 8.2 SUPER_ADMIN (`app/admin/platform`)

- **Nuevo** `app/admin/platform/academias/page.tsx`: tabla de todas las academias (`listAllAcademias`) con acciones: crear (modal), archivar/restore, transferir ownership (modal), asignar rol (modal), ver rúbricas.
- **Nuevo** `app/admin/platform/solicitudes/page.tsx`: tabla de solicitudes pendientes (`GET /api/academy-requests?status=pending`) con aprobar/rechazar.
- **Nuevos componentes** `components/admin/platform/`: `academy-admin-table.tsx`, `academy-request-table.tsx`, `academy-create-modal.tsx`, `transfer-ownership-modal.tsx`, `role-assign-modal.tsx`.
- **Modificar** `app/admin/layout.tsx`: links "Academias" y "Solicitudes" en la nav de SUPER_ADMIN.

### 8.3 Hooks

- **Modificar** `hooks/use-academies.ts`: `transferOwnership(id, targetUserId)`, `assignRole(id, userId, role)`, `restore(id)`.
- **Nuevo** `hooks/use-academy-requests.ts`: `createRequest(input)`, `listRequests(filters)` (admin), `approve(id)`, `reject(id)`, `listAvailableAcademies()`.

## 9. Tests mapeados

| Archivo | Tipo | Cubre |
|---------|------|-------|
| `tests/unit/padel/academy-requests.test.ts` | Unit | `canAssignAcademyRole`, `validateRequestPayload`, `buildRequestAuditPayload` |
| `tests/unit/padel/academy-ownership.test.ts` | Unit | invariante último OWNER, self-transfer, reglas de asignación |
| `tests/unit/db/academy-requests-queries.test.ts` | Unit | uniones discriminadas de queries (mock db) |
| `tests/unit/db/academy-migration.test.ts` | Unit | `buildOwnershipMigrationPlan` (AC-02) |
| `tests/api/padel/academy-requests-happy.spec.ts` | API happy (SQL real) | POST join/create, GET list, approve join, approve create, reject |
| `tests/api/padel/academy-requests-guard.spec.ts` | API guard | 401/403/400/404/409 |
| `tests/api/padel/academy-ownership-happy.spec.ts` | API happy (SQL real) | POST /api/academies (SA), transfer, role assign, restore |
| `tests/api/padel/academy-ownership-guard.spec.ts` | API guard | 401/403/400/404 |
| `tests/api/padel/academies-guard.spec.ts` | API guard (MODIFICAR) | POST /api/academies: ADMIN → 403 (antes 201) |
| `tests/api/padel/academies-happy.spec.ts` | API happy (MODIFICAR) | crear con SUPER_ADMIN (helper de usuario SA) |
| `tests/e2e/academy-super-admin.spec.ts` | E2E | flujo navegable: SA aprueba join → asigna rol → transfiere ownership |

Cobertura: sin regresión >3% en `lib/db/queries/padel/academies.ts`, `lib/auth/academy-guard.ts`, `app/api/academies/*`.

## 10. Impacto

| Área | Impacto |
|------|---------|
| **Auth/RBAC** | `academy-guard.ts` (guard compuesto), `admin-guard.ts` (reuso `guardSuperAdmin`), `role-utils.ts` (sin cambios). LOCKED nunca permitido; TEMPORARY rechazado por sessionGate. |
| **DB** | 2 enums + 1 tabla + 3 índices + 2 índices parciales UNIQUE + data migration. Migración `0011_*`. |
| **API** | 1 endpoint modificado (POST /api/academies), 8 guards modificados, 9 endpoints nuevos. |
| **UI** | 2 páginas nuevas admin, 1 página modificada (academias), 6 componentes nuevos, 2 hooks. |
| **Tests** | 4 unit nuevos, 4 API nuevos, 2 API modificados, 1 E2E nuevo. |
| **Docs** | `lib/api-docs/spec.ts` (paths/schemas nuevos), `ARCHITECTURE.md` (sección v0.9), `FEATURES.md`. |

## 11. Variables de entorno

**Sin variables nuevas.** No se modifica `.env.example`. Rate limit de solicitudes reusa constantes en `lib/rate-limit.ts` (`ACADEMY_REQUEST_MAX = isTestEnv ? 10000 : 10`, `ACADEMY_REQUEST_WINDOW_MS = 60_000`).

## 12. API Docs

- **Nuevo** `lib/api-docs/paths/academy-requests.ts` + `lib/api-docs/schemas/academy-requests.ts` (AcademyRequestDto, AcademyRequestInput, AcademyRequestQuery).
- **Modificar** `lib/api-docs/paths/academies.ts`: POST /api/academies (guardSuperAdmin + ownerId), transfer-ownership, restore, PUT members/[userId] role.
- **Modificar** `lib/api-docs/spec.ts`: wire de tags/paths/schemas nuevos.

## 13. Orden de ejecución de agentes

1. **@db-engineer** — schema.ts, migración `0011_*` (tabla + enums + DO block + verificación columnas), `academy-requests.ts` queries, `academies.ts` (transfer/assign/restore), `lib/padel/academy-migration.ts`, unit tests db.
2. **@auth-security** — `academy-guard.ts` (guard compuesto), `lib/audit/academy.ts`, guards API tests, revisión OWASP (anti-IDOR, rate limit).
3. **@app-engineer** — validations Zod, endpoints `/api/academies/*` y `/api/academy-requests/*`, lógica pura `lib/padel/academy-requests.ts`, hooks, UI coach (academias page + request form), API docs, unit/API/E2E tests app.
4. **@admin-engineer** — páginas `app/admin/platform/academias` + `solicitudes`, componentes admin, nav layout, API tests admin, E2E.
5. **@ponytail-reviewer** — revisión de simplicidad antes de QA.
6. **@qa-release** — smoke, regresión auth, test-matrix, release-report.

## 14. Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Migración rompe academias existentes | DO block idempotente + fallo explícito sin SA + verificación post-migración |
| Breaking: ADMIN pierde creación | Documentado en release notes; UI oculta botón; tests actualizados |
| Anti-IDOR en endpoints nuevos | Guard compuesto con 404 para recursos ajenos/inexistentes |
| Invariante último OWNER | Transferencia/assign transaccionales; nunca 0 OWNER activo |
| `helpers.ts` crece >500 líneas | Helpers de auditoría nuevos en `lib/audit/academy.ts` (split explícito) |