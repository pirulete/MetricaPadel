# App Notes — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso

> change_id: 2026-10-03-super-admin-academy-ownership
> Rol: @app-engineer (notas de implementación)
> Veredicto viabilidad: VIABLE (ver design-review no aplicable — 3 observaciones menores en el review)

## Patterns a reutilizar (código real existente)

### Guards
- `guardSuperAdmin(session)` ya existe en `lib/auth/admin-guard.ts:81` — síncrono, null = OK. Reusar tal cual.
- Patrón de guard compuesto: copiar la estructura de `lib/auth/academy-guard.ts` (`sessionGate` + `guardAcademyRole` + wrappers). `sessionGate` (líneas 73-81) ya rechaza LOCKED/TEMPORARY.
- `isSuperAdminRole` / `isAdminRole` en `lib/auth/role-utils.ts` — importar, no reimplementar.
- Anti-IDOR 404: `getAcademyMembership` retorna null si no hay membresía activa o academia archivada → caller responde 404 (patrón de `app/api/academies/[id]/route.ts:37`).

### Rate limit (CRITICAL — archivo NO listado en change-map)
- `lib/rate-limit.ts` NO tiene `ACADEMY_REQUEST_MAX`/`ACADEMY_REQUEST_WINDOW_MS` — hay que CREARLOS (patrón `ACADEMY_INVITE_MAX`, líneas 231-232):
  ```ts
  export const ACADEMY_REQUEST_MAX = isTestEnv ? 10000 : 10;
  export const ACADEMY_REQUEST_WINDOW_MS = 60_000;
  ```
- Patrón de uso exacto: `app/api/academies/[id]/members/invite/route.ts:33-40`:
  ```ts
  const ip = extractIP(request);
  const rate = checkPublicRateLimit(`academy-request:${ip}`, { windowMs: ACADEMY_REQUEST_WINDOW_MS, max: ACADEMY_REQUEST_MAX });
  if (!rate.allowed) return rateLimitedResponse(rate.resetTime, ACADEMY_REQUEST_MAX);
  ```
- Rate limit ANTES del guard (patrón invite) — 429 sin gastar DB.

### Validations Zod
- `lib/validations/academy.ts` ya exporta `academySlugRegex`, `hexColorRegex`, `academyCreateSchema`. Extender con `.extend({ ownerId: z.string().uuid().optional() })`.
- Discriminated union: `z.discriminatedUnion('type', [...])` — Zod soporta nativamente.
- Params: `padelIdParamsSchema` de `lib/validations/padel.ts` + `.extend({ userId: z.string().uuid() })` (patrón `members/[userId]/route.ts:23`).

### Handlers (patrón canónico)
Copiar estructura de `app/api/academies/route.ts` POST:
1. `runtime = "nodejs"`
2. `auth()` → guard early-return
3. Zod parse → 400 `{ error: "Datos inválidos", details }`
4. Query → manejar unión discriminada `{ ok: false, reason }` → status code
5. `extractRequestContext(request)` para audit ctx
6. 23505 → 409 (chequear `error.code` y `error.cause.code`)
7. `console.error` + 500 genérico (nunca filtrar)

### Auditoría
- `createAuditLog` vive en `lib/audit/helpers.ts` (NO tocar — 579 líneas). Los helpers nuevos van en `lib/audit/academy.ts` e importan `createAuditLog` + `AuditContext` de helpers.
- Firma de helpers existentes: `auditAcademyCreated(academyId, data, context)` — context = `{ userId, ...extractRequestContext(request) }`.
- OJO con transacciones: `createAuditLog` usa el handle global `db`, NO el tx client (ver comentario en `auditPairEvaluationPublished`, línea 552-557). Los inserts de auditoría autoritativos dentro de tx deben hacerse con el tx o quedar fuera de la tx.

### Queries
- Transacciones: `db.transaction(async (tx) => {...})` — patrón `createAcademy` en `lib/db/queries/padel/academies.ts:55-72`.
- UNIONES discriminadas para errores de negocio: `RemoveMemberResult` (líneas 40-42) — seguir ese estilo para `TransferOwnershipResult`, `AssignRoleResult`, etc.
- `listAllAcademies()` YA EXISTE en `lib/db/queries/padel/super-admin.ts:158` — no crear `listActiveAcademies` duplicada; filtrar por status o agregar where ligero.
- `getAcademyById(id)` existe y NO filtra por status — reusar para 404-checks de SUPER_ADMIN (incluye archivadas).

### UI coach (`app/(app)/academias/page.tsx`)
- Role detection actual: probe a `/api/dashboard/teacher` → si ok, role=ADMIN. **Cuidado**: SUPER_ADMIN también pasa ese probe y vería "Solicitar acceso". Mejor: traer el role de `/api/auth/session` o del response de `/api/dashboard/teacher` si expone el role.
- `AcademyForm` se renderiza en 2 places (header + EmptyState) — quitar ambos y reemplazar con `AcademyRequestForm` solo si `role === "ADMIN"` (no SUPER_ADMIN).
- Patrón de modal: seguir componentes existentes en `components/padel/` (create-join-assign-modals de v0.2). Feedback con `sonsonner`.

### Hooks
- `hooks/use-academies.ts` patrón: `fetch` + `{ ok: true/false, error? }` + `reload()`. Copiar para `use-academy-requests.ts`.
- Endpoints nuevos: `/api/academy-requests` (POST/GET), `/api/academy-requests/[id]/approve|reject`, `/api/academy-requests/available-academies`, `/api/academies/[id]/transfer-ownership|restore`.

### API Docs
- Patrón: `lib/api-docs/paths/*.ts` exporta `xxxTags` + `xxxPaths`; wire en `lib/api-docs/spec.ts` línea 325 (`...academiesPaths, ...superAdminPaths`).
- Schemas en `lib/api-docs/schemas/academies.ts` — agregar AcademyRequestDto etc.
- Docs de `POST /api/academies` en `paths/academies.ts:23-36` dicen "guardAdmin" — actualizar a guardSuperAdmin + ownerId.

## Cuidados (riesgos reales detectados en el código)

### 1. Breaking change en tests existentes (NO listados en change-map)
Estos specs crean academias vía POST con usuario ADMIN y ROMPERÁN al cambiar el guard a guardSuperAdmin:
- `tests/api/padel/pdf-happy.spec.ts:80` — `coachCtx.post("/api/academies", ...)`
- `tests/api/padel/members-happy.spec.ts:64,167` — `ownerCtx.post("/api/academies", ...)`
- `tests/api/padel/institutional-rubrics-happy.spec.ts:80` — `ownerCtx.post("/api/academies", ...)`
Fix: crear helper SUPER_ADMIN en el spec (createUser ya soporta `role: "SUPER_ADMIN"` en `tests/api/admin/marketing/helpers.ts:32`) y usarlo solo para el POST de creación. Los flujos de miembros/rubrics siguen con ADMIN como OWNER vía transfer o creación por SA con ownerId del coach.

En `tests/api/padel/academies-guard.spec.ts:140`: test "slug inválido → 400" usa ADMIN — tras el cambio el guard corre ANTES de Zod → será **403**, no 400. Actualizar la expectativa o mover el test al contexto SA.

### 2. Contrato transfer-ownership: seguir el SPEC, no el design
- `feature-spec.md` AC-07: target no miembro → **404**
- `technical-design.md` §4.7: target no miembro → 400
**Usar 404** (anti-IDOR: no revelar si un usuario es miembro). Self-transfer → 400 sí. El query `transferOwnership` debe distinguir: target user inexistente → 404; target user existe pero no es miembro activo → 404 (no 400).

### 3. SUPER_ADMIN y detalle de rúbricas institucionales
`lib/db/queries/padel/rubrics.ts` `canAccessRubric` (líneas 109-124) exige membresía activa para rúbricas institucionales — el detalle vía `getRubricById` dará 404 a SUPER_ADMIN sin membresía. La migración lo mitiga (SA queda OWNER de todas las existentes), pero academias nuevas aprobadas a otro OWNER quedarán ciegas para SA en el detalle.
Opciones: (a) aceptar y documentar (list endpoint `GET /api/academies/[id]/rubrics` sí funciona para SA vía guard compuesto); (b) @db-engineer/agente asignado agrega path SUPER_ADMIN en `canAccessRubric`/`canMutateRubric`. Recomendado: (b) mínimo en `canAccessRubric` — 3 líneas.

### 4. Migración: orden y fail-closed
- Migración `0011_*`: `db:generate` primero, luego DO block en el SQL generado, luego `db:generate` de nuevo (regla ARCHITECTURE).
- Si no hay SUPER_ADMIN activo, el DO block lanza EXCEPTION → falla TODA la migración (incluida la DDL de la tabla nueva). Es fail-closed intencional (spec lo pide). Verificar post-migración:
  ```sql
  SELECT owner_id FROM academies;
  SELECT count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> '<sa_id>';
  ```
- `users.role` es enum con SUPER_ADMIN (v0.7) — el DO block usa `'SUPER_ADMIN'` literal, correcto.

### 5. Guard compuesto: archived academies
- Path SA: permite archivadas (visibilidad plataforma) — correcto para transfer/restore.
- Path no-SA: `guardAcademyRole` retorna 404 si academia archivada — correcto.
- En `GET /api/academies/[id]`, tras el guard SA, el handler llama `getAcademyMembership` para `myRole` → null para SA sin membresía. Aceptable (responder `myRole: null`).

### 6. Idempotencia de solicitudes
- Índices parciales UNIQUE son la fuente del 409: `create_access_request` debe mapear 23505 → `{ ok: false, reason: 'duplicate_pending' }` → 409.
- `approveJoinRequest`: re-validar dentro de tx (academia activa, usuario no miembro) — no confiar solo en la validación del POST de la solicitud (pudo cambiar entre create y approve).
- `approveCreateRequest`: re-validar slug en el momento del approve (colisión posible entre solicitud y aprobación).

### 7. `canAssignAcademyRole` — lógica pura en handler
- Guard `guardSuperAdminOrAcademyAdmin` deja pasar academy ADMIN. El handler DEBE verificar: `role === 'OWNER' && !isSuperAdminRole(session.user.role)` → 403.
- Último OWNER: `assignMemberRole` con `role !== OWNER` sobre el único OWNER activo → `last_owner` → 400 (patrón `removeMember` líneas 236-246).

### 8. UI: quitar AcademyForm sin romper alumnos
- `role === "USER"` no muestra AcademyForm — solo cambia la rama ADMIN.
- EmptyState description para ADMIN debe cambiar de "Crea tu primera academia" a "Solicita acceso a una academia o pide que se cree una para ti".

## Referencias de código (paths exactos)

| Qué | Path |
|-----|------|
| Guard SA existente | `lib/auth/admin-guard.ts:81` |
| Guards academia | `lib/auth/academy-guard.ts` |
| Role utils | `lib/auth/role-utils.ts` |
| Validations academia | `lib/validations/academy.ts` |
| Rate limit pattern | `lib/rate-limit.ts:227-276` + invite route |
| Create academy tx | `lib/db/queries/padel/academies.ts:54-72` |
| listAllAcademies | `lib/db/queries/padel/super-admin.ts:158` |
| Audit helpers academia | `lib/audit/helpers.ts:446-539` |
| API docs pattern | `lib/api-docs/paths/academies.ts` + `spec.ts:325` |
| Test helpers (createUser SA) | `tests/api/admin/marketing/helpers.ts:32` |
| Hook pattern | `hooks/use-academies.ts` |
| Academias page | `app/(app)/academias/page.tsx` |
| Admin layout nav SA | `app/admin/layout.tsx:25-34` |
| Platform page SA | `app/admin/platform/page.tsx` |

## Tests a crear (resumen para @app-engineer)

| Archivo | Cubre |
|---------|-------|
| `tests/unit/padel/academy-requests.test.ts` | canAssignAcademyRole, validateRequestPayload |
| `tests/unit/padel/academy-ownership.test.ts` | invariantes transfer/roles |
| `tests/api/padel/academy-requests-happy.spec.ts` | SQL real: join/create/approve/reject |
| `tests/api/padel/academy-requests-guard.spec.ts` | 401/403/400/404/409 |
| `tests/api/padel/academy-ownership-happy.spec.ts` | SQL real: create SA/transfer/role/restore |
| `tests/api/padel/academy-ownership-guard.spec.ts` | 401/403/400/404 |
| `tests/api/padel/academies-guard.spec.ts` (MOD) | ADMIN → 403 en POST |
| `tests/api/padel/academies-happy.spec.ts` (MOD) | crear con SUPER_ADMIN |
| `tests/api/padel/pdf-happy.spec.ts` (MOD) | setup con SA para crear academia |
| `tests/api/padel/members-happy.spec.ts` (MOD) | setup con SA para crear academia |
| `tests/api/padel/institutional-rubrics-happy.spec.ts` (MOD) | setup con SA para crear academia |

E2E: `tests/e2e/academy-super-admin.spec.ts` (asignado a @admin-engineer en change-map).

## Orden de ejecución recordatorio

1. @db-engineer — schema + migración + queries + unit db
2. @auth-security — guard compuesto + lib/audit/academy.ts + OWASP
3. **@app-engineer** — validations + rate-limit constants + endpoints + lógica pura + hooks + UI coach + API docs + tests
4. @admin-engineer — admin platform + componentes + E2E
5. @ponytail-reviewer → @qa-release

Dependencia oculta: @auth-security debe terminar `lib/audit/academy.ts` ANTES de @app-engineer (los endpoints importan esos helpers).

## Estado de implementación @app-engineer (2026-10-03)

### ✅ Listo (implementado + verificado)

| Área | Detalle |
|------|---------|
| Rate limit | `ACADEMY_REQUEST_MAX`/`ACADEMY_REQUEST_WINDOW_MS` en `lib/rate-limit.ts` (patrón invite). |
| Validations | `academyCreateWithOwnerSchema`, `academyRequestCreateSchema` (discriminated union), `academyRequestQuerySchema`, `roleAssignSchema`, `transferOwnershipSchema` en `lib/validations/academy.ts`. |
| Lógica pura | `lib/padel/academy-requests.ts` — `canAssignAcademyRole`, `validateRequestPayload`, `buildRequestAuditPayload`. |
| Endpoints modificados | POST /api/academies (guardSuperAdmin + ownerId validado en users), [id] GET/PUT/DELETE (SuperAdminOr), logo, members GET, invite, rubrics GET/POST, members/[userId] DELETE + **PUT nuevo** (role assign, OWNER solo SA). |
| Endpoints nuevos | transfer-ownership (404 target no miembro — SPEC AC-07), restore (400 ya activa), academy-requests POST/GET, approve, reject, available-academies. |
| Hooks | `use-academies.ts` +transferOwnership/assignRole/restore; `use-academy-requests.ts` nuevo. |
| UI coach | academias page usa `/api/auth/session` para role (SUPER_ADMIN no ve "Solicitar acceso"); `AcademyRequestForm` modal 2 tabs; EmptyState copy actualizado. |
| API docs | paths/schemas academy-requests nuevos; academies actualizado; wire en spec.ts. |
| Tests unit | `tests/unit/padel/academy-requests.test.ts` + `academy-ownership.test.ts` — 18 tests, 712 unit totales OK. |
| Tests API | 4 specs nuevos (34 tests) + 5 specs modificados — **157/160 padel API tests OK** (3 fallos pre-existentes en promote, no relacionados). |

### 🔧 Fix a código de @db-engineer (bloqueante, ya corregido)

`lib/db/queries/padel/academy-requests.ts` usaba `sql<Record<string, unknown>>`` (template vacío) en `listAccessRequests`/`getAccessRequestById` → generaba SQL inválido (`syntax error at or near ","`) → 500 en approve/reject. Corregido a `sql<Record<string, unknown>>\`${academyAccessRequests.payload}\``. **@db-engineer debe revisar** si su unit test mockeado no detectó esto (el mock no valida SQL generado).

### ⚠️ Pendientes / notas para @admin-engineer

- **Páginas admin**: `app/admin/platform/academias/page.tsx` + `solicitudes/page.tsx` + componentes `components/admin/platform/*` + nav en `app/admin/layout.tsx` (asignado a @admin-engineer).
- **E2E**: `tests/e2e/academy-super-admin.spec.ts` (asignado a @admin-engineer).
- **Rate limit en tests**: el límite es por IP (10/min en dev, `isTestEnv` solo con NODE_ENV=test). Los specs comparten IP localhost — mantener el volumen de POSTs bajo (≤10 por ventana) o reiniciar servidor entre runs. `academy-ownership-happy` inserta membresía vía SQL para no gastar invite rate limit.
- **Guard antes de Zod**: en transfer-ownership/restore/PUT role, el guard/404 corre ANTES del parse Zod → body inválido sobre academia inexistente = 404 (no 400). Tests ajustados en consecuencia.
- **Invariante último OWNER**: tras transfer, el target es el único OWNER — demote requiere 2 OWNERS (test lo cubre).
- **promote.spec.ts / promote-happy.spec.ts**: 3 fallos pre-existentes (403 vs 404) NO relacionados con esta feature — verificar si son bug real o test desactualizado.
- **API tests con DB**: correr con servidor up (`npx next dev -p 3000`) + `DATABASE_URL` set. Migración 0011 aplicada (tabla `academy_access_requests` verificada).
- **ARCHITECTURE.md**: falta sección v0.9 (asignado a @architect).
