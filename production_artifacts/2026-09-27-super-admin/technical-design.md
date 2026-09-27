# Technical Design — Rol SUPER_ADMIN (Super Admin de Plataforma)

> status: in-progress
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## 1. Decisiones de diseño (con justificación)

### D1 — `guardAdmin`/`validateAdmin` aceptan `['ADMIN', 'SUPER_ADMIN']` (jerarquía)
| Opción | Impacto en endpoints existentes | Riesgo |
|--------|--------------------------------|--------|
| Solo `['ADMIN']` | SUPER_ADMIN no accede a CMS/rúbricas/cursos → duplicar guards en ~40 endpoints | Alto (explosión de cambios) |
| **Ambos (elegida)** | SUPER_ADMIN hereda todo el back-office sin tocar rutas; `guardSuperAdmin` restringe solo lo exclusivo | Bajo |

**Decisión**: `guardAdmin`/`validateAdmin` delegan en `isAdminRole(role)` (que incluye SUPER_ADMIN). Un SUPER_ADMIN es admin: accede a todo `/admin`, CMS, rúbricas, evaluaciones, cursos y academias. `guardSuperAdmin` se usa **solo** en los endpoints exclusivos de plataforma (promote, demote, admins, audit-logs, academias globales). Retrocompatibilidad total: ningún ADMIN pierde acceso.

### D2 — `role-utils.ts`: extender `ADMIN_ROLES` + nuevo `SUPER_ADMIN_ROLES`
- `ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const` — representa "puede operar como admin".
- `SUPER_ADMIN_ROLES = ['SUPER_ADMIN'] as const` — representa "puede operar como super admin".
- `isAdminRole(role)` → `ADMIN_ROLES.includes(...)`.
- `canAssignRole(actorRole, targetRole)` → **solo** `actorRole === 'SUPER_ADMIN'` y `targetRole ∈ ['USER', 'ADMIN']`. **Nunca** se asigna SUPER_ADMIN vía API (seed/DB manual, patrón primer ADMIN).
- `canDeleteUser`/`canAccessModule` → delegar en `isAdminRole` (SUPER_ADMIN hereda).

### D3 — Migración del enum: `ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN'` vía `db:generate`
- Cambio en `lib/db/schema.ts` L4: `pgEnum('user_role', ['USER', 'ADMIN', 'SUPER_ADMIN'])` → `pnpm run db:generate` genera `ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN'` (aditivo, sin backfill: no existen filas SUPER_ADMIN).
- **Gotcha Postgres**: `ALTER TYPE ... ADD VALUE` no puede ejecutarse dentro de un bloque transaccional en PG < 12; en PG 12+ puede pero el nuevo valor no es usable hasta el commit. Neon es PG 14+ → OK con el migrador Drizzle (ejecuta statements secuenciales).
- **Verificación post-migrate** (regla AGENTS.md): `SELECT enum_range(NULL::user_role)` debe incluir `SUPER_ADMIN`; además `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='role'`.
- Seed del primer SUPER_ADMIN: SQL manual en DB (patrón QUICKSTART §7), nunca vía API.

### D4 — Auditoría: **helpers dedicados en `lib/audit/super-admin.ts`** (no en `helpers.ts`)
- `helpers.ts` ya tiene 539 líneas; agregar 3 helpers lo llevaría >600 → viola límite de 500. Se crea `lib/audit/super-admin.ts` con:
  - `auditAdminPromoted(actorId, targetUserId, context)` → `actionType='ADMIN_PROMOTED'`, entity `user`, newValues `{role:'ADMIN'}`, metadata `{superAdmin:true}`.
  - `auditAdminDemoted(actorId, targetUserId, context)` → `actionType='ADMIN_DEMOTED'`, oldValues `{role:'ADMIN'}`, newValues `{role:'USER'}`.
  - `auditSuperAdminAction(actorId, action, entityName, entityId, changes, context)` → `actionType='SUPER_ADMIN_ACTION'`, metadata `{superAdmin:true, action}` (para settings de plataforma y futuras acciones).
- **Justificación**: eventos dedicados hacen el filtro `actionType` de `GET /api/admin/audit-logs` significativo y trazable (AC-05).

### D5 — Protección último SUPER_ADMIN: **invariante por construcción + defensa en profundidad**
- Por construcción: `demote` solo acepta targets `role='ADMIN'` (SUPER_ADMIN → 400); lock (`DELETE /api/admin/users/[id]`) rechaza `isAdminRole(target.role)` → 403. Ninguna API puede reducir SUPER_ADMINs → el invariante "≥1 SUPER_ADMIN activo" no es violable vía API.
- Defensa en profundidad: helper puro `assertNotLastSuperAdmin(activeCount)` en `lib/padel/super-admin.ts` + check transaccional `countActiveSuperAdmins()` dentro de `demoteUser` (si el target fuera SUPER_ADMIN y count=1 → abort). Unit-testable (AC-03).
- Self-demote: `target.id === session.user.id` → 400 (explícito aunque redundante: un SUPER_ADMIN demotándose a sí mismo ya cae en "target es SUPER_ADMIN → 400").

### D6 — `GET /api/admin/academies` (global) no colisiona con `GET /api/academies`
- `GET /api/academies` (guardUser) lista academias del usuario (membresías). El nuevo `GET /api/admin/academies` (guardSuperAdmin) lista **todas** las academias con métricas (memberCount, rubricCount) — visibilidad global de plataforma. Rutas distintas, sin conflicto.

### D7 — UI `/admin/platform`: **read-only en v0.7** (settings de mantenimiento diferidos)
- El spec pide "settings globales de plataforma (feature flags/mantenimiento)" pero la sección DB declara **"Sin tablas nuevas"**. Sin tabla `platform_settings`, un toggle de mantenimiento no tiene dónde persistir.
- **Decisión**: `/admin/platform` muestra overview read-only (versión de app, entorno, counts globales: usuarios/admins/academias/evaluaciones) consumiendo `GET /api/admin/academies` + counts. El toggle de mantenimiento/feature flags se difiere a iteración posterior con tabla `platform_settings` (fuera de alcance v0.7, documentado como riesgo aceptado).

## 2. Impacto por capa

| Capa | Impacto |
|------|---------|
| **DB** | Migración `0009_*`: `ALTER TYPE user_role ADD VALUE 'SUPER_ADMIN'`. Sin tablas nuevas, sin índices, sin backfill. |
| **Auth** | `admin-guard.ts`: `guardAdmin`/`validateAdmin` → `isAdminRole`; nuevos `guardSuperAdmin`/`validateSuperAdmin`. `role-utils.ts`: `ADMIN_ROLES` extendido + `SUPER_ADMIN_ROLES`. `types/auth.ts`: role type + SUPER_ADMIN. `navigation.ts`: `getNavItems` acepta SUPER_ADMIN. |
| **API** | 1 endpoint modificado (promote → guardSuperAdmin + audit dedicado), 4 endpoints nuevos (demote, admins, audit-logs, academias-global). Lock endpoint: protege SUPER_ADMIN (403). |
| **UI** | `/admin/admins` + `/admin/platform` (solo SUPER_ADMIN vía `validateSuperAdmin`). Nav condicional en admin layout. 2 componentes nuevos en `components/admin/super-admin/`. |
| **Tests** | Unit: guards jerarquía/estados, role-utils, assertNotLastSuperAdmin, audit helpers. API: happy-path SQL real por endpoint + guards 401/403. E2E: flujo promote/demote navegable. |
| **Env vars** | **Ninguna nueva** — `.env.example` sin cambios (verificado). |
| **API docs** | `lib/api-docs/paths/super-admin.ts` + `schemas/super-admin.ts` nuevos; `spec.ts` importa; enums role en `schemas/padel.ts` y `spec.ts` + SUPER_ADMIN. |

## 3. Contratos API (contract first)

### Modificado
**`POST /api/admin/users/[id]/promote`** (guardAdmin → **guardSuperAdmin**) → `200 { user }` | `400` | `401` | `403` (ADMIN) | `404`
- Body: ninguno. Query filtra `role='USER'` (ya ADMIN/inexistente → 404 anti-IDOR). Audita `ADMIN_PROMOTED`.

### Nuevos
**`POST /api/admin/users/[id]/demote`** (guardSuperAdmin) → `200 { user }` | `400` | `401` | `403` | `404`
```ts
// Reglas:
// - target.role === 'USER'        → 400 "El usuario no es ADMIN"
// - target.role === 'SUPER_ADMIN' → 400 "SUPER_ADMIN no puede ser demotado"
// - target.id === session.id      → 400 "No puedes demotar tu propio usuario"
// - target inexistente            → 404
```
- Transaccional: `demoteUser(id)` valida rol + `countActiveSuperAdmins()` defensivo. Audita `ADMIN_DEMOTED`.

**`GET /api/admin/admins`** (guardSuperAdmin) → `200 { admins: AdminDto[] }` | `401` | `403`
```ts
// Query: ?search= (opcional, ILIKE por nombre/email)
// AdminDto: { id, email, firstName, lastName, role: 'ADMIN'|'SUPER_ADMIN', status, createdAt }
// Lista role IN ('ADMIN','SUPER_ADMIN'), ordenado por createdAt desc.
```

**`GET /api/admin/audit-logs`** (guardSuperAdmin) → `200 { logs: AuditLogDto[], pagination }` | `400` | `401` | `403`
```ts
// Query: ?actionType=&userId=&page=1&pageSize=20 (pageSize ≤ 100)
// AuditLogDto: { id, userId, actionType, entityName, entityId, oldValues, newValues, metadata, ipAddress, createdAt }
// Orden createdAt desc. Sin auditoría (lectura).
```

**`GET /api/admin/academies`** (guardSuperAdmin) → `200 { academies: AcademyGlobalDto[] }` | `401` | `403`
```ts
// AcademyGlobalDto: { id, name, slug, status, primaryColor, ownerId, memberCount, rubricCount, createdAt }
// Lista TODAS las academias (activas y archivadas), ordenado por createdAt desc.
```

## 4. Esquema DB (migración `0009_*`)

```ts
// lib/db/schema.ts L4 — único cambio
export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN', 'SUPER_ADMIN']);
```
SQL generado por `db:generate` (nunca a mano):
```sql
ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN';
```
Sin backfill, sin índices, sin tablas. Verificación post-migrate: `SELECT enum_range(NULL::user_role)`.

## 5. Guards

### `lib/auth/admin-guard.ts`
```ts
// MOD: jerarquía — ADMIN_ROLES incluye SUPER_ADMIN
export async function validateAdmin() {
  // ... session checks ...
  if (!isAdminRole(session.user.role) || session.user.status !== 'ACTIVE') { redirect("/dashboard") }
}
export function guardAdmin(session) {
  // ... 401 check ...
  if (!isAdminRole(session.user.role) || session.user.status !== 'ACTIVE') { return 403 }
}

// NEW
export async function validateSuperAdmin() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== 'SUPER_ADMIN' || session.user.status !== 'ACTIVE') {
    console.warn(`[Security] Intento de acceso super-admin bloqueado para ${session.user.email} (${session.user.status})`)
    redirect("/dashboard")
  }
  return session
}
export function guardSuperAdmin(session): NextResponse | null {
  if (!session?.user?.id) return 401
  if (session.user.role !== 'SUPER_ADMIN' || session.user.status !== 'ACTIVE') return 403
  return null
}
```

### `lib/auth/role-utils.ts`
```ts
export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const
export const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'] as const
export type AdminRole = typeof ADMIN_ROLES[number]
export type SuperAdminRole = typeof SUPER_ADMIN_ROLES[number]
export function isAdminRole(role: string): boolean { return ADMIN_ROLES.includes(role as AdminRole) }
export function isSuperAdminRole(role: string): boolean { return role === 'SUPER_ADMIN' }
export function canAccessModule(role: string, _module: string): boolean { return isAdminRole(role) }
export function canDeleteUser(role: string): boolean { return isAdminRole(role) }
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'SUPER_ADMIN') return ['USER', 'ADMIN'].includes(targetRole)
  return false
}
```

### Lock endpoint (`DELETE /api/admin/users/[id]`) — MOD
`if (target.role === 'ADMIN')` → `if (isAdminRole(target.role))` → 403 "No puedes bloquear a otro administrador". Protege SUPER_ADMIN (AC-03).

## 6. Auditoría dedicada

`lib/audit/super-admin.ts` (nuevo, mantiene `helpers.ts` < 500 líneas):
| Helper | actionType | entity | newValues | metadata |
|--------|-----------|--------|-----------|----------|
| `auditAdminPromoted` | `ADMIN_PROMOTED` | `user` | `{role:'ADMIN'}` | `{superAdmin:true}` |
| `auditAdminDemoted` | `ADMIN_DEMOTED` | `user` | `{role:'USER'}` | `{superAdmin:true}` |
| `auditSuperAdminAction` | `SUPER_ADMIN_ACTION` | param | param | `{superAdmin:true, action}` |

## 7. Archivos a tocar (resumen)

| Área | Archivos |
|------|----------|
| DB | `lib/db/schema.ts` (L4), `drizzle/0009_*.sql` (gen) |
| Auth | `lib/auth/admin-guard.ts`, `lib/auth/role-utils.ts`, `types/auth.ts`, `lib/constants/navigation.ts`, `lib/auth/protected-routes.ts` |
| Queries | `lib/db/queries/padel/super-admin.ts` (NEW: listAdmins, demoteUser, countActiveSuperAdmins, listAuditLogsPaginated, listAllAcademies) |
| Lógica pura | `lib/padel/super-admin.ts` (NEW: assertNotLastSuperAdmin) |
| Audit | `lib/audit/super-admin.ts` (NEW) |
| API | `app/api/admin/users/[id]/promote/route.ts` (MOD), `app/api/admin/users/[id]/demote/route.ts` (NEW), `app/api/admin/users/[id]/route.ts` (MOD lock), `app/api/admin/admins/route.ts` (NEW), `app/api/admin/audit-logs/route.ts` (NEW), `app/api/admin/academies/route.ts` (NEW) |
| UI | `app/admin/admins/page.tsx` (NEW), `app/admin/platform/page.tsx` (NEW), `app/admin/layout.tsx` (MOD nav condicional), `components/admin/super-admin/admins-list.tsx` (NEW), `components/admin/super-admin/platform-overview.tsx` (NEW) |
| Docs | `lib/api-docs/paths/super-admin.ts` (NEW), `lib/api-docs/schemas/super-admin.ts` (NEW), `lib/api-docs/spec.ts` (MOD), `lib/api-docs/schemas/padel.ts` (MOD enum), `FEATURES.md`, `ARCHITECTURE.md` |
| Tests | ver §8 |

## 8. Tests requeridos

### Unit (Jest) — `tests/unit/`
| Archivo | Cubre |
|---------|-------|
| `tests/unit/auth/admin-guard.test.ts` | MOD: SUPER_ADMIN pasa guardAdmin/validateAdmin; ADMIN no pasa guardSuperAdmin; LOCKED/TEMPORARY → 403 |
| `tests/unit/auth/role-utils.test.ts` | MOD: isAdminRole(SUPER_ADMIN)=true, canAssignRole solo SUPER_ADMIN y nunca SUPER_ADMIN target |
| `tests/unit/padel/super-admin.test.ts` | NEW: assertNotLastSuperAdmin (count 1 → bloquea, count >1 → permite) |
| `tests/unit/audit/super-admin.test.ts` | NEW: 3 helpers generan actionTypes correctos |

### API (Playwright) — `tests/api/admin/`
| Archivo | Cubre |
|---------|-------|
| `tests/api/admin/promote-guard.spec.ts` | ADMIN → 403; sin sesión → 401 |
| `tests/api/admin/admins-guard.spec.ts` | GET /api/admin/admins: 401/403 para USER/ADMIN |
| `tests/api/admin/admins-happy.spec.ts` | SQL real: SUPER_ADMIN lista admins |
| `tests/api/admin/demote-happy.spec.ts` | SQL real: ADMIN→USER; 400 self/SUPER_ADMIN/USER target; protección último |
| `tests/api/admin/audit-logs-happy.spec.ts` | SQL real: paginación + filtros actionType/userId |
| `tests/api/admin/academies-global-happy.spec.ts` | SQL real: lista todas las academias con counts |

### E2E (Playwright) — `tests/e2e/super-admin.spec.ts`
Flujo navegable: SUPER_ADMIN ve `/admin/admins`, promueve USER→ADMIN, demota ADMIN→USER; ADMIN no ve `/admin/admins` (redirect /dashboard).

## 9. Retrocompatibilidad

- `guardAdmin` amplía (nunca restringe): ADMINs existentes conservan acceso total.
- `promote` cambia de guardAdmin → guardSuperAdmin: **breaking intencional** (AC-01) — documentado en release-scope; los ADMINs existentes pierden promote (correcto por diseño).
- `DELETE /api/admin/users/[id]` amplía la protección a SUPER_ADMIN (403) — no rompe flujos existentes (ya bloqueaba ADMIN).
- Enums role en schemas Zod (`validations/user.ts`) se mantienen `['USER','ADMIN']` — SUPER_ADMIN nunca asignable vía API (D2).
- `types/auth.ts` y `navigation.ts` amplían tipos — compilación estricta exige actualizar call sites (grep `"ADMIN" | "USER"`).

## 10. Riesgos aceptados

- `/admin/platform` read-only en v0.7 (D7): el toggle de mantenimiento requiere tabla nueva → diferido. Documentado como riesgo aceptado.
- `ALTER TYPE ADD VALUE` en Neon: validado PG 14+; verificación post-migrate obligatoria (regla AGENTS.md).
- Cobertura: módulos admin/auth se amplían con tests; sin regresión >3% esperada (baseline `.validation/coverage-baseline.json`).

## 11. Orden de ejecución

1. **@db-engineer**: schema L4 → `db:generate` → `db:migrate` → verificar enum → queries `super-admin.ts` + unit tests.
2. **@auth-security**: guards, role-utils, types, lock protection, audit helpers + unit tests.
3. **@app-engineer/@admin-engineer**: endpoints (promote MOD + 4 NEW) + api-docs + UI + API tests.
4. **@ponytail-reviewer**: revisión simplicidad (sin abstracciones, helpers mínimos).
5. **@qa-release**: E2E, test-matrix, acceptance-criteria, release-report, evidence-manifest.