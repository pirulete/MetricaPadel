# FEATURES — Registro de Cambios

## ✨ Soft-delete de evaluaciones — G16 (2026-09-28)

> status: released
> release: v0.7
> date: 2026-09-28
> change_id: evaluation-soft-delete
> module: dashboard
> tags: [padel, evaluation, soft-delete, api, db, migration]

### Problema

No había forma de retirar una evaluación publicada errónea sin borrarla permanentemente. El coach necesita archivar evaluaciones mientras conserva el historial y las versiones.

### Solución Implementada

- **`lib/db/schema.ts`**: columna `deletedAt: timestamp("deleted_at")` nullable en `evaluations` (mismo patrón que `notifications.deletedAt`). Migración `0010_hard_wrecker.sql` generada con `db:generate` (nunca SQL a mano).
- **`lib/db/queries/padel/evaluations.ts`**: helper reusable `isNotDeleted = isNull(evaluations.deletedAt)` aplicado a todas las queries de coach/alumno: `getEvaluationById`, `getStudentEvaluationById`, `listEvaluations`, `listStudentEvaluations`, `saveEvaluationScores`, `publishEvaluation`, `listEvaluationSeries`, `listStudentEvaluationSeries`, `listStudentEvolution`, `markEvaluationRead`. Las queries de admin/super-admin NO filtran (el super admin ve todo). El cómputo de `version` en `publishEvaluation` NO excluye archivadas → no se reutilizan versiones.
- **`lib/db/queries/padel/history.ts`**: `listHistory` excluye archivadas vía `isNotDeleted`.
- **`app/api/evaluations/[id]/route.ts`**: nuevo handler `DELETE` — `guardAdmin`, anti-IDOR (404 si no pertenece al teacher), soft-delete (`UPDATE evaluations SET deletedAt = now()`), auditoría `auditDelete("evaluation", id, oldValues, context)`, retorna `{ success: true }`. DELETE repetido → 404.
- **`lib/api-docs/paths/padel.ts`**: path `delete` documentado en `/api/evaluations/{id}` (G16).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `lib/db/schema.ts` | 🔧 Modificado — `evaluations.deletedAt` |
| `drizzle/0010_hard_wrecker.sql` | ➕ Nuevo — migración |
| `lib/db/queries/padel/evaluations.ts` | 🔧 Modificado — `isNotDeleted` + filtros |
| `lib/db/queries/padel/history.ts` | 🔧 Modificado — filtro deleted |
| `app/api/evaluations/[id]/route.ts` | 🔧 Modificado — handler DELETE |
| `lib/api-docs/paths/padel.ts` | 🔧 Modificado — docs DELETE |
| `tests/api/padel/evaluation-delete.spec.ts` | ➕ Nuevo — guards + happy-path SQL real |
| `tests/unit/db/evaluations.test.ts` | 🔧 Modificado — tests G16 |

### Tests

- Unit (Jest): `tests/unit/db/evaluations.test.ts` — 11 tests G16: `isNotDeleted` reusable, todas las queries incluyen `deleted_at` en el where (vía `sqlColumns` sobre `queryChunks`), `saveEvaluationScores`/`publishEvaluation`/`markEvaluationRead` retornan null/not_found sobre archivadas.
- API (Playwright): `tests/api/padel/evaluation-delete.spec.ts` — 401 sin sesión, 403 USER, 404 inexistente, happy-path con SQL real (deleted_at persistido, oculta de GET/lista coach y alumno, PUT/publish → 404, auditoría DELETE registrada, DELETE repetido → 404).

### Variables de Entorno

Ninguna nueva.

## ✨ Dashboard de métricas globales para SUPER_ADMIN (2026-09-28)

> status: released
> release: v0.7
> date: 2026-09-28
> change_id: platform-metrics-dashboard
> module: admin
> tags: [admin, super-admin, metrics, dashboard, ui, read-only]

### Problema

`/admin/platform` solo mostraba 4 counts básicos (admins, super admins, academias, activas). Un super admin necesita ver tendencias, actividad reciente y breakdown por academia para operar la plataforma.

### Solución Implementada

- **`lib/db/queries/padel/super-admin.ts`**: nueva query `getPlatformMetrics()` que reutiliza `getPlatformStats()` y agrega: rúbricas (total + scope personal/institutional), últimos 10 `audit_logs` con usuario (leftJoin users), y breakdown por academia con `memberCount` (miembros activos) y `evaluationCount` (evaluaciones vía join rubrics.academyId). Se carga server-side — sin endpoint nuevo.
- **`app/admin/platform/page.tsx`**: reescrita con UI rica — sección Resumen (5 cards: Usuarios, Academias, Evaluaciones, Cursos, Rúbricas), sección Rúbricas con barras de distribución por scope, sección Actividad reciente (tabla usuario/acción/entidad/fecha) y sección Academias (tabla nombre/owner/miembros/evaluaciones/estado). Guard `validateSuperAdmin` intacto. Responsive: grid mobile → desktop, tablas con overflow-x.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `lib/db/queries/padel/super-admin.ts` | 🔧 Modificado — `getPlatformMetrics()` |
| `app/admin/platform/page.tsx` | 🔧 Modificado — UI rica read-only |
| `tests/unit/db/super-admin.test.ts` | 🔧 Modificado — tests de `getPlatformMetrics` |

### Tests

- Unit (Jest): `tests/unit/db/super-admin.test.ts` — `getPlatformMetrics` con db mockeado: stats existentes + rubrics + actividad reciente + breakdown (2 passed: happy-path y arrays vacíos).

### Variables de Entorno

Ninguna nueva.

## ✨ Template picker para rúbricas — G14 (2026-09-28)

> status: released
> release: v0.7
> date: 2026-09-28
> change_id: rubric-template-picker
> module: dashboard
> tags: [padel, rubric, template, ui, client-only]

### Problema

El coach tenía que crear rúbricas desde cero cada vez. La plantilla `RUBRICA_INTEGRAL_TEMPLATE` (6 dimensiones × 4 niveles × 1 criterio) existía en `lib/padel/rubric-templates.ts` pero solo como seed manual/API — sin UI. Identificado como gap G14 en `production_artifacts/2026-09-28-roadmap/roadmap.md`.

### Solución Implementada

- **`components/padel/rubric-editor.tsx`**: botón "Usar plantilla" (icono Wand2) en el header de Criterios, visible solo cuando el editor está vacío (0 criterios o 1 criterio en blanco). Abre un `AlertDialog` de confirmación ("Esto reemplazará los criterios actuales. ¿Continuar?") y al confirmar hidrata el state del editor con el template: `title`, `category` y los 6 criterios con sus 4 descriptores (copias mutables vía spread para no mutar la constante `as const`).
- **Sin API nueva ni tabla nueva** — todo client-side; el template se importa como constante.
- **Tipos**: `RUBRICA_INTEGRAL_TEMPLATE` ya era compatible con `CriterionDraft` del editor (name + descriptors[4]); solo se adaptó la hidratación con `[...c.descriptors]` para convertir readonly tuples en arrays mutables.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `components/padel/rubric-editor.tsx` | 🔧 Modificado — botón "Usar plantilla" + AlertDialog + `applyTemplate` |
| `tests/unit/padel/rubric-templates.test.ts` | ✨ Nuevo — unit tests del template |

### Tests

- Unit (Jest): `tests/unit/padel/rubric-templates.test.ts` — 6 criterios, 4 niveles por criterio, scores 4/3/2/1, descriptores completos, categoría válida, título no vacío (6 passed).
- Manual: el botón hidrata el form (título, categoría y 6 criterios con descriptores visibles en el editor).

### Variables de Entorno

Ninguna nueva.

## ✨ Rate limiting en invitaciones de academia (2026-09-28)

> status: released
> release: v0.7
> date: 2026-09-28
> change_id: academy-invite-rate-limit
> module: auth+api
> tags: [security, rate-limit, academy, owasp, tech-debt]

### Problema

Los endpoints `POST /api/academies/[id]/members/invite` y `POST /api/academies/[id]/members/[userId]/accept` no tenían rate limiting: un atacante podía invitar/aceptar masivamente por IP (abuso de emails, spam de notificaciones, carga a la DB). Identificado como gap en `production_artifacts/2026-09-28-roadmap/roadmap.md` (rate limiting academia).

### Solución Implementada

- **`lib/rate-limit.ts`**: `checkPublicRateLimit(ip, options?)` ahora acepta `{ windowMs, max }` opcionales (backward compatible, defaults 100/60s intactos); `rateLimitedResponse`/`rateLimitSuccessHeaders` aceptan `limit` opcional para headers `X-RateLimit-*` precisos. Nuevas constantes `ACADEMY_INVITE_MAX` (10 en prod/dev, 10000 en test para no romper API tests — patrón `PUSH_DIRECT_MAX`) y `ACADEMY_INVITE_WINDOW_MS` (60s).
- **invite route**: rate limit por IP al inicio del handler (antes de auth/guard), key `academy-invite:{ip}`, 429 con `rateLimitedResponse`.
- **accept route**: mismo rate limit y misma key `academy-invite:{ip}` (límite combinado invite+accept — accept no puede bypassear el límite de invite).
- **OWASP**: mitiga A04 (Insecure Design — abuso de función de negocio) y A01 (exceso de requests como vector de spam/DoS parcial).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `lib/rate-limit.ts` | 🔧 Modificado — opciones custom en `checkPublicRateLimit` + constantes academy |
| `app/api/academies/[id]/members/invite/route.ts` | 🔧 Modificado — rate limit por IP |
| `app/api/academies/[id]/members/[userId]/accept/route.ts` | 🔧 Modificado — rate limit por IP |
| `lib/api-docs/paths/academies.ts` | 🔧 Modificado — respuesta 429 documentada |
| `tests/unit/rate-limit.test.ts` | ✨ Nuevo — unit tests del rate limiter |

### Tests

- Unit (Jest): `tests/unit/rate-limit.test.ts` — límite max, aislamiento por key, reset de ventana, defaults, `extractIP`, constantes academy (10 passed).
- API (Playwright): sin cambios — los tests existentes (`members-happy.spec.ts`, `academies-guard.spec.ts`, `institutional-rubrics-happy.spec.ts`) siguen pasando (límite alto en test env).

### Variables de Entorno

Ninguna nueva.

## ✨ Roadmap del proyecto — Métrica Pádel (2026-09-28)

> status: proposed
> release: docs
> date: 2026-09-28
> change_id: roadmap-2026-09-28
> module: docs
> tags: [roadmap, backlog, gaps, tech-debt, priorities]

### Problema

No existía una vista consolidada de qué está hecho y qué queda pendiente en el proyecto. La información estaba dispersa en FEATURES.md (39 entradas), ARCHITECTURE.md y múltiples artifacts (pending-features, rubric-gap-analysis, user-flows-v2, super-admin-audit, security-checklist).

### Solución Implementada

Reporte de roadmap en `production_artifacts/2026-09-28-roadmap/roadmap.md` con: features released por versión (v0.1→v0.7, 35 entradas), pendientes (G1/G2/G13/G14/G15/G16, R4/R5, out-of-scope diferidos de super-admin y academia), gaps de UX (BUG-05, avatar sin UI, términos sin UI, E2E Etapa 4 ausentes, rate limiting academia), backlog de infra/calidad (FLAKY-1, cobertura baja, paginación, carpetas vacías, docs debt) y prioridades recomendadas (impacto × esfuerzo + YAGNI).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `production_artifacts/2026-09-28-roadmap/roadmap.md` | 🔧 Nuevo — reporte de roadmap |

### Tests

No aplica (cambio de documentación).

### Variables de Entorno

Ninguna nueva.

## ✨ SUPER_ADMIN — Rol Super Admin de Plataforma (2026-09-27)

> status: released
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

### Problema

El modelo de roles es binario (USER/ADMIN): cualquier ADMIN tiene acceso total a plataforma (promover admins, CMS, lock de usuarios) sin jerarquía ni control. No hay demote, listado de admins, auditoría global ni visibilidad de plataforma. Audit previo: `production_artifacts/2026-09-27-super-admin-audit/audit-report.md` (10 gaps, G1-G10).

### Solución Implementada

- **DB**: `user_role` extendido a `['USER','ADMIN','SUPER_ADMIN']` (migración `0009_third_white_tiger.sql`); queries en `lib/db/queries/padel/super-admin.ts` (listAdmins, demoteUser transaccional con invariante último SUPER_ADMIN, countActiveSuperAdmins, listAuditLogsPaginated, listAllAcademies); lógica pura `lib/padel/super-admin.ts` (assertNotLastSuperAdmin).
- **Auth**: `guardSuperAdmin`/`validateSuperAdmin` en `admin-guard.ts`; jerarquía — `guardAdmin`/`validateAdmin` usan `isAdminRole` (ADMIN+SUPER_ADMIN); `role-utils.ts` con `ADMIN_ROLES` ampliado + `SUPER_ADMIN_ROLES` + `canAssignRole` restringido (nunca SUPER_ADMIN vía API).
- **Seguridad**: promote restringido a SUPER_ADMIN; nuevo endpoint `demote` (ADMIN→USER, 400 self/SUPER_ADMIN/USER, 404 inexistente, defensa último SUPER_ADMIN transaccional); lock (`DELETE /api/admin/users/[id]`) protege SUPER_ADMIN vía `isAdminRole`; auditoría dedicada en `lib/audit/super-admin.ts` (`ADMIN_PROMOTED`, `ADMIN_DEMOTED`).
- **API**: `GET /api/admin/admins`, `POST /api/admin/users/[id]/demote`, `GET /api/admin/audit-logs`, `GET /api/admin/academies` — todos guardSuperAdmin + documentados en `lib/api-docs/spec.ts` (paths/schemas super-admin) + `lib/auth/protected-routes.ts`.
- **UI**: `/admin/admins` + `/admin/platform` visibles solo SUPER_ADMIN (`validateSuperAdmin`); nav admin condicional en `app/admin/layout.tsx`; componente `components/admin/admins/admin-list.tsx`.
- **Primer SUPER_ADMIN**: seed/DB manual (patrón primer ADMIN, QUICKSTART §7) — nunca vía API.

### Solución Propuesta (spec)

- **DB**: extender `user_role` a `['USER', 'ADMIN', 'SUPER_ADMIN']` (migración aditiva vía `db:generate`). Sin tablas nuevas; RBAC por academia intacto.
- **Auth**: `guardSuperAdmin` + `validateSuperAdmin`; jerarquía — `guardAdmin`/`validateAdmin` aceptan `['ADMIN','SUPER_ADMIN']`; `role-utils.ts` con `ADMIN_ROLES` ampliado + `SUPER_ADMIN_ROLES`.
- **Seguridad**: promote restringido a SUPER_ADMIN; nuevo endpoint `demote` (ADMIN→USER); protección último SUPER_ADMIN (no puede quedar 0 activos, no auto-demote, no bloqueable); auditoría dedicada (`ADMIN_PROMOTED`, `ADMIN_DEMOTED`, `SUPER_ADMIN_ACTION`).
- **API**: `GET /api/admin/admins`, `POST /api/admin/users/[id]/demote`, `GET /api/admin/audit-logs`, `GET /api/admin/academies` (visibilidad global) — todos guardSuperAdmin + documentados en `lib/api-docs/spec.ts`.
- **UI**: `/admin/admins` (gestionar admins) + `/admin/platform` (settings globales) visibles solo para SUPER_ADMIN.
- **Primer SUPER_ADMIN**: seed/DB manual (patrón primer ADMIN, QUICKSTART §7) — nunca vía API.

### Acceptance Criteria

AC-01 solo SUPER_ADMIN promueve; AC-02 solo SUPER_ADMIN demota; AC-03 no puede existir 0 SUPER_ADMIN activos; AC-04 SUPER_ADMIN pasa guardAdmin; AC-05 acciones auditadas con eventos dedicados; AC-06 UI admins solo SUPER_ADMIN; AC-07 endpoints 403 para ADMIN / 200 para SUPER_ADMIN; AC-08 tests unit + API happy-path SQL real + E2E.

### Tests

- Unit (Jest): guards jerarquía/estados, role-utils, validación último admin.
- API (Playwright): happy-path SQL real por endpoint + guards 401/403.
- E2E: flujo navegable promote/demote; ADMIN no ve `/admin/admins`.

### Variables de Entorno

Ninguna nueva.

### Referencias

- `production_artifacts/2026-09-27-super-admin/feature-spec.md`
- `production_artifacts/2026-09-27-super-admin/release-scope.md`
- `production_artifacts/2026-09-27-super-admin-audit/audit-report.md`

### Auth Security (2026-09-27)

> status: in-progress
> release: v0.7
> change_id: super-admin-role
> module: auth
> tags: [roles, rbac, super-admin, security, guards]

#### Problema

Los guards eran binarios (`role === 'ADMIN'`): un SUPER_ADMIN no existía en `admin-guard.ts` ni `role-utils.ts`, y el lock endpoint solo protegía a ADMIN (un SUPER_ADMIN era bloqueable).

#### Solución Implementada

- **`lib/auth/admin-guard.ts`**: `validateAdmin`/`guardAdmin` delegan en `isAdminRole` (jerarquía: SUPER_ADMIN hereda todo el back-office, D1). Nuevos `validateSuperAdmin` (layouts server, redirect `/dashboard`) y `guardSuperAdmin` (async `Promise<NextResponse | null>`, solo `SUPER_ADMIN`+`ACTIVE`, patrón academy-guard).
- **`lib/auth/role-utils.ts`**: `ADMIN_ROLES = ['ADMIN','SUPER_ADMIN']`, `SUPER_ADMIN_ROLES = ['SUPER_ADMIN']`, `isSuperAdminRole`, `canAccessModule`/`canDeleteUser` delegan en `isAdminRole`. `canAssignRole`: solo SUPER_ADMIN actor y target ∈ `['USER','ADMIN']` — nadie asigna SUPER_ADMIN vía API (D2).
- **`app/api/admin/users/[id]/route.ts` (DELETE lock)**: `target.role === 'ADMIN'` → `isAdminRole(target.role)` — SUPER_ADMIN no bloqueable (403, AC-03).
- **`types/auth.ts`**: `role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'`.
- **`lib/auth/protected-routes.ts`**: documentados `POST /api/admin/users/[id]/promote` (MOD → guardSuperAdmin, breaking intencional AC-01), `POST /api/admin/users/[id]/demote`, `GET /api/admin/admins`, `GET /api/admin/audit-logs`, `GET /api/admin/academies` (todos guardSuperAdmin).

#### Archivos Modificados

- `lib/auth/admin-guard.ts`
- `lib/auth/role-utils.ts`
- `lib/auth/protected-routes.ts`
- `app/api/admin/users/[id]/route.ts`
- `types/auth.ts`

#### Tests

- `tests/unit/auth/role-utils.test.ts` (NUEVO): ADMIN_ROLES incluye SUPER_ADMIN, isAdminRole/isSuperAdminRole, canAssignRole restringe (solo SUPER_ADMIN actor, nunca target SUPER_ADMIN), canDeleteUser/canAccessModule delegan.
- `tests/unit/auth/super-admin-guard.test.ts` (NUEVO): jerarquía (SUPER_ADMIN pasa guardAdmin), guardSuperAdmin (solo SUPER_ADMIN+ACTIVE; ADMIN/USER/LOCKED/TEMPORARY → 403), lock protege SUPER_ADMIN (403 vía DELETE handler), canAssignRole.
- Resultado: 25 tests nuevos, 76 tests auth pasando, `tsc --noEmit` 0 errores, lint 0 errores en archivos tocados.

#### Variables de Entorno

Ninguna nueva.

## ✨ SPEC-EPIC-01 — Administrador de Academia & Branding Institucional (2026-09-26)

> status: released
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: admin+api+db+ui
> tags: [multi-tenancy, branding, pdf, roles, rubrics, migration, upload]

### QA Release (2026-09-26)

**Resultado: ✅ APROBADO** — 20/20 gates, 0 fallos, 3 warnings no bloqueantes (harness `--all`).

**Tests agregados en QA**:
- `tests/api/padel/academies-guard.spec.ts` (15 tests: 401/403/404)
- `tests/api/padel/academies-happy.spec.ts` (2: CRUD + logo + slug duplicado 409, SQL real)
- `tests/api/padel/members-happy.spec.ts` (2: invite→accept→list→remove + TEMPORARY, SQL real)
- `tests/api/padel/institutional-rubrics-happy.spec.ts` (1: COACH 403 PUT/DELETE, SQL real)
- `tests/api/padel/pdf-happy.spec.ts` (1: PDF válido + draft 400 + ajeno 404, SQL real)
- `tests/e2e/academy-branding.spec.ts` (1: flujo navegable crear academia → invitar → rúbrica → evaluar → exportar PDF)

**Bugs corregidos durante QA**:
- BUG-01 (MEDIA): slug duplicado → 500 en vez de 409 (Drizzle envuelve 23505 en `cause`); fix en `app/api/academies/route.ts` + `[id]/route.ts`.
- BUG-02 (ALTA): login UI roto en dev (`/api/auth/csrf` 404 con skipCSRFCheck → `json()` throw); fix en `app/(public)/login/page.tsx`.
- BUG-03 (MEDIA): botón "Exportar PDF" inalcanzable para coach (RubricViewer usaba endpoint alumno → 403; GET coach no incluía `academy`); fix en `components/padel/rubric-viewer.tsx` + `app/api/evaluations/[id]/route.ts`.
- BUG-04 (BAJA): test E2E onboarding usaba heading role inexistente (CardTitle = div); fix en `tests/e2e/onboarding.spec.ts`.

**Bug abierto (fuera de scope)**: BUG-05 — home guard marketing (DELETE única home publicada → 200 en vez de 400, aislamiento de tests del módulo marketing).

**Migración**: `0008_shallow_typhoid_mary.sql` aplicada a DB local (academies, academy_memberships, enums, rubrics.academy_id/scope).

**Referencias QA**: `production_artifacts/2026-09-26-academia-branding/{release-report,test-matrix,acceptance-criteria,evidence-manifest}.md/json`

### Problema

Las academias necesitan estandarizar criterios de evaluación entre profesores y emitir informes oficiales con branding institucional. Hoy no existe entidad Academia, no hay rol de profesor multi-academia, las rúbricas son personales (sin versión "institucional" read-only) y no hay exportación PDF.

### Solución Propuesta (spec)

- **RF-01**: Tabla `academies` (nombre, slug único, logo ≤2MB SVG/PNG, color HEX) + endpoints CRUD + upload de logo.
- **RF-02**: Tabla `academy_memberships` (role OWNER/ADMIN/COACH por academia, UNIQUE academyId+userId, multi-academia) + invitación por email con usuario TEMPORARY o existente.
- **RF-03**: `rubrics.academyId` nullable + `rubrics.scope` enum (personal/institutional); COACH usa pero no edita rúbricas institucionales (403).
- **RF-04**: `GET /api/evaluations/[id]/pdf` — PDF con logo, color primario, radar de 6 dimensiones, firma del profesor.
- **Decisión clave**: mantener `user_role` global USER/ADMIN; rol por academia vive en `academy_memberships` (no rompe guards existentes).

### Archivos Propuestos

- `lib/db/schema.ts` (+academies, +academy_memberships, +enums, +columnas rubrics), migración nueva vía `db:generate`
- `lib/auth/` (+guards academia), `lib/validations/padel.ts` (+schemas academia/membership/rubric-scope)
- `app/api/academies/**`, `app/api/academies/[id]/members/**`, `app/api/academies/[id]/rubrics/**`, `app/api/evaluations/[id]/pdf/route.ts`
- `lib/api-docs/spec.ts` (+paths/schemas academias, members, pdf)
- UI: `app/(app)/academias/**` + `components/padel/academy-*`

### Tests

- Unit (Jest): schemas Zod, lógica membresías, guard rúbrica institucional.
- API (Playwright): happy-path SQL real por endpoint + guards 401/403.
- E2E: flujo crear academia → invitar profesor → rúbrica institucional → exportar PDF.

### Variables de Entorno

Ninguna nueva (storage local de logos; sin S3 en esta iteración).

### Referencias

- `production_artifacts/2026-09-26-academia-branding/feature-spec.md`
- `production_artifacts/2026-09-26-academia-branding/release-scope.md`

### Fase B — Guards de Academia (auth-security, 2026-09-26)

> status: in-progress
> release: v0.6
> module: auth
> tags: [rbac, multi-tenancy, guards, audit, notifications]

**Problema**: las operaciones por academia (branding, miembros, rúbricas institucionales) necesitan autorización por academia sin tocar el `user_role` global.

**Solución Implementada**:
- `lib/auth/academy-guard.ts` (NUEVO): `guardAcademyOwner` (solo OWNER), `guardAcademyAdmin` (OWNER/ADMIN), `guardAcademyCoach` (OWNER/ADMIN/COACH activos) + helper `getAcademyMembership`. Guards async DB-backed (`Promise<NextResponse | null>`): consultan `academy_memberships` (status active) + `academies` (status active) en cada request — nunca confían en claims del JWT para el rol de academia.
- Anti-IDOR: membresía inexistente o academia archivada → **404** (no 403). LOCKED/TEMPORARY → 403. Sin sesión → 401.
- `lib/audit/helpers.ts` (MOD): +5 eventos — `ACADEMY_CREATED`, `ACADEMY_UPDATED`, `ACADEMY_ARCHIVED`, `MEMBER_INVITED`, `MEMBER_REMOVED`.
- `lib/notifications/triggers.ts` (MOD): +`triggerAcademyInvite` (inbox, category system, P2, `groupId=membershipId` para dedup 1h).
- `lib/auth/protected-routes.ts` (MOD): documenta guards de academia + endpoints planeados.

**Archivos Modificados**: `lib/auth/academy-guard.ts`, `lib/auth/protected-routes.ts`, `lib/audit/helpers.ts`, `lib/notifications/triggers.ts`.

**Tests**: `tests/unit/auth/academy-guard.test.ts` (22 tests: 401/403/404, jerarquía OWNER≥ADMIN≥COACH, academia archivada), `tests/unit/audit/helpers.test.ts` (+6), `tests/unit/notifications/triggers.test.ts` (+2). Suite completa 477 tests verde; typecheck y ESLint 0 errores.

**Variables de Entorno**: ninguna nueva.

**Referencias**: `production_artifacts/2026-09-26-academia-branding/auth-impact.md`, `security-checklist.md`.

### Fase C — Lógica pura y validaciones (app-engineer, 2026-09-26)

> status: in-progress
> release: v0.6
> module: api
> tags: [validations, radar, logo, pdf, branding]

**Problema**: antes de los endpoints de academia/PDF (Fase D) se necesitan las validaciones Zod y la lógica pura de branding (logo, radar, PDF) unit-testable.

**Solución Implementada**:
- `lib/validations/academy.ts` (NUEVO): `academyCreateSchema` (name 1-200, slug `^[a-z0-9-]{3,50}$` con normalize a minúsculas, primaryColor HEX `#RRGGBB`), `academyUpdateSchema` (partial + refine al menos un campo), `memberInviteSchema` (email), `academyRubricCreateSchema` (reutiliza `rubricCreateSchema` de padel.ts).
- `lib/padel/logo.ts` (NUEVO): `validateLogoUpload(file)` — MIME image/png|image/svg+xml, ≤2MB, dims ≤1024×1024 (PNG vía firma real + IHDR; SVG vía width/height/viewBox), sanitización SVG, devuelve data-URL base64. `sanitizeSvg` usa DOMPurify cuando hay DOM (browser); en Node serverless DOMPurify es no-op (`isSupported=false`) → fallback conservador por allowlist (elimina script/foreignObject/style/iframe/on*/href/src/javascript:).
- `lib/padel/radar.ts` (NUEVO, puro): `computeRadarPoints` (6 vértices unitarios, orden RADAR_DIMENSIONS, tope -90° horario, clamp [0,1], maxScore≤0 → centro), `computeRadarPolygon` (string `points` SVG), `computeGridRing`.
- `lib/padel/pdf.tsx` (NUEVO): `generateEvaluationPdf(evaluation, rubric, scores, academy?, student?, teacher?)` con `renderToBuffer` de `@react-pdf/renderer` — header branding (logo PNG/http embebido; SVG data-URL → fallback iniciales), barra de color, radar SVG 6 dims con grid rings, tabla de scores, comentario global, firma. Server-only.
- **Nota técnica**: el archivo es `.tsx` (no `.ts` como listaba el change-map) porque el documento react-pdf usa JSX — TypeScript solo permite JSX en `.tsx`.

**Archivos Modificados**: `lib/validations/academy.ts`, `lib/padel/logo.ts`, `lib/padel/radar.ts`, `lib/padel/pdf.tsx`.

**Tests**: `tests/unit/padel/academy-schemas.test.ts` (12), `tests/unit/padel/radar.test.ts` (10), `tests/unit/padel/logo.test.ts` (14) — 36 tests nuevos, suite `tests/unit/padel/` 64/64 verde. Typecheck 0 errores, ESLint 0 errores. Spike PDF validado: `next build` + route handler runtime → `%PDF-` válido (riesgo D1 del technical design cerrado).

**Variables de Entorno**: ninguna nueva.

**Referencias**: `production_artifacts/2026-09-26-academia-branding/app-notes.md`.

### Fase D+E — Endpoints y UI (app-engineer, 2026-09-26)

> status: in-progress
> release: v0.6
> module: api+ui
> tags: [endpoints, academies, members, rubrics, pdf, ui, branding]

**Problema**: las academias (schema + guards + validaciones de Fases A-C) no tenían endpoints ni UI. Se implementan los 10 route handlers del contrato y las páginas/componentes del área privada.

**Solución Implementada**:
- **Endpoints (10)**: `GET/POST /api/academies` (guardUser/guardAdmin; POST inserta OWNER en academy_memberships, 409 slug duplicado), `GET/PUT/DELETE /api/academies/[id]` (guardAcademyCoach/Admin/Owner; GET devuelve `myRole`; DELETE soft archive), `POST /api/academies/[id]/logo` (multipart `file`, validateLogoUpload, data-URL), `POST /api/academies/[id]/members/invite` (crea usuario TEMPORARY patrón G4 o reutiliza; membresía COACH pending; triggerAcademyInvite; 409 ya miembro), `POST /api/academies/[id]/members/[userId]/accept` (guardUser solo self, idempotente), `GET /api/academies/[id]/members` (guardAcademyCoach, join users), `DELETE /api/academies/[id]/members/[userId]` (guardAcademyAdmin, soft remove, 400 último OWNER), `GET/POST /api/academies/[id]/rubrics` (scope forzado institutional), `GET /api/evaluations/[id]/pdf` (guardUser + ACTIVE, teacher o student, 400 draft, branding vía resolveAcademyForEvaluation), `PUT/DELETE /api/rubrics/[id]` MOD (institucional → OWNER/ADMIN, COACH 403).
- **Queries**: `lib/db/queries/padel/academies.ts` (NUEVO) — CRUD academias + membresías + rúbricas institucionales + `resolveAcademyForEvaluation` (prioridad rubric.academyId → primera membresía activa del teacher). `rubrics.ts` MOD: `updateRubric`/`archiveRubric` → unión discriminada `RubricMutationResult` (distingue 403 COACH de 404), `getRubricById` access-aware, `createRubric` acepta academyId+scope.
- **UI**: `hooks/use-academies.ts` (NUEVO), `app/(app)/academias/page.tsx` + `[id]/page.tsx` (NUEVOS), 7 componentes nuevos (`academy-card`, `academy-form`, `academy-detail` con tabs Branding/Miembros/Rúbricas, `logo-upload`, `members-list`, `invite-member-modal`, `academy-rubrics-tab`), `rubric-viewer.tsx` MOD (botón "Exportar PDF" solo si la evaluación tiene academia), `navigation.ts` MOD (link `/academias`).
- **API docs**: `lib/api-docs/paths/academies.ts` + `schemas/academies.ts` (NUEVOS, 11 paths), importados en `spec.ts`.

**Archivos Modificados**: 10 route handlers (9 nuevos + rubrics/[id] MOD), `lib/db/queries/padel/academies.ts` (nuevo), `lib/db/queries/padel/rubrics.ts` (MOD), `lib/db/queries/padel/index.ts` (MOD), `lib/auth/protected-routes.ts` (MOD), `lib/api-docs/{paths,schemas}/academies.ts` + `spec.ts` (MOD), `hooks/use-academies.ts` (nuevo), `app/(app)/academias/**` (nuevos), 7 componentes padel (nuevos), `rubric-viewer.tsx` + `navigation.ts` (MOD), `app/api/student/evaluations/[id]/route.ts` (MOD — devuelve `academy` para el botón PDF).

**Tests**: `tests/unit/db/academy-queries.test.ts` (16 tests nuevos), `tests/unit/db/rubrics.test.ts` (actualizado al contrato `RubricMutationResult`). Suite unit 493/493 verde. API tests creados: `academies-guard.spec.ts`, `academies-happy.spec.ts`, `members-happy.spec.ts`, `institutional-rubrics-happy.spec.ts`, `pdf-happy.spec.ts` (requieren servidor + DATABASE_URL). Typecheck 0 errores, ESLint 0 errores, `next build` OK (11 rutas nuevas).

**Variables de Entorno**: ninguna nueva.

**Referencias**: `production_artifacts/2026-09-26-academia-branding/app-notes.md`.

## ✨ README actualizado — documentación del proyecto Métrica Pádel (2026-09-25)

> status: released
> release: v0.5
> date: 2026-09-25
> change_id: readme-metrica-padel
> module: docs
> tags: [docs, readme, documentation]

### Problema

El README.md seguía siendo el genérico del skeleton (`skeleton_base`) y no describía el proyecto real: Métrica Pádel, con sus features de evaluación, cursos, dashboard, notificaciones y CMS.

### Solución Implementada

Reescrito `README.md` completo en español neutro: descripción del proyecto, stack, roles (ADMIN=coach / USER=alumno), features organizadas por área (evaluación, cursos, dashboard, auth/seguridad, notificaciones, admin/marketing), estructura de carpetas, setup local, scripts, convenciones de tests, variables de entorno principales, git workflow (rama-preview → main) y estado del proyecto (v0.5, 31 features, 8 migraciones, deploy Vercel + NeonDB).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `README.md` | 🔧 Reescrito completo — documentación del proyecto |

### Tests

No aplica (cambio de documentación).

### Variables de Entorno

Ninguna nueva.

## ✨ P0 Core + P1 Course Management (2026-09-25)

> status: released
> release: v0.5
> date: 2026-09-25
> change_id: p0-core-p1-courses
> module: dashboard+auth+ui
> tags: [ui, auth, navigation, sidebar, logout, courses, edit, archive, empty-state]

### Problema

La app carece de features core que impiden el uso diario: no hay forma de cerrar sesión desde la UI, no hay navegación en desktop (solo bottom-nav mobile), el login en producción falla silenciosamente para cuentas LOCKED/inexistentes, los coaches no pueden editar ni archivar cursos, y la lista de cursos no muestra estado vacío.

### Solución Implementada

- **P0.1 — Logout**: Botón "Cerrar sesión" en `header-with-notifications.tsx` (dropdown con avatar + nombre) y en `profile-form.tsx`. Llama `signOut()` → redirect `/login`.
- **P0.2 — Desktop Sidebar**: Nuevo `components/layout/app-sidebar.tsx` con shadcn/ui Sidebar colapsable. Items por rol (ADMIN: Inicio/Cursos/Evaluar/Historial/Perfil; USER: Inicio/Cursos/Mis evaluaciones/Evolución/Perfil). Responsive: sidebar md+, bottom-nav mantiene en mobile. `app-layout-client.tsx` orquesta sidebar + main content.
- **P0.3 — Login Logging**: `auth.ts` agrega `console.log` diagnóstico cuando usuario no existe o cuenta LOCKED. Sin cambio de comportamiento.
- **P1.1 — Edit Course**: Nuevo `components/padel/edit-course-modal.tsx` (Sheet con formulario nombre/nivel/horario/días). Botón "Editar" en `course-detail.tsx` para coaches. Reutiliza PUT `/api/courses/[id]` existente.
- **P1.2 — Archive Course**: Botón "Archivar" en `course-detail.tsx` con AlertDialog de confirmación → DELETE `/api/courses/[id]` → redirect `/cursos`.
- **P1.3 — Empty Course List**: Estado vacío en `app/(app)/cursos/page.tsx` con CTA "Crear primer curso" cuando no hay cursos.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `components/layout/app-sidebar.tsx` | 🔧 Nuevo — sidebar desktop colapsable |
| `components/layout/app-layout-client.tsx` | 🔧 Nuevo — layout client con sidebar |
| `components/layout/header-with-notifications.tsx` | 🔧 Agregado dropdown logout |
| `components/padel/profile-form.tsx` | 🔧 Agregado botón logout |
| `components/padel/bottom-nav.tsx` | 🔧 Simplificado (sidebar maneja nav desktop) |
| `components/padel/course-detail.tsx` | 🔧 Botones Edit + Archive para coaches |
| `components/padel/edit-course-modal.tsx` | 🔧 Nuevo — modal edición curso |
| `app/(app)/cursos/page.tsx` | 🔧 Empty state cuando no hay cursos |
| `app/(app)/layout.tsx` | 🔧 Integración sidebar desktop |
| `auth.ts` | 🔧 Logging diagnóstico login |
| `lib/constants/navigation.ts` | 🔧 Nuevo — items de nav por rol |

### Tests

E2E pendientes: `logout-flow.spec.ts`, `sidebar-navigation.spec.ts`, `edit-course.spec.ts`, `archive-course.spec.ts`. Unit tests para schemas de validación de curso. Build exitoso.

### Variables de Entorno

Ninguna nueva.

## ✨ Neon Preview Branch — aislamiento de DB (2026-09-25)

> status: released
> release: v0.5
> date: 2026-09-25
> change_id: neon-preview-branch
> module: infra
> tags: [infra, db, neon, ci-cd, vercel, branching]

### Problema

`DATABASE_URL` apunta a una sola base Neon (main) en todos los ambientes. Los preview deploys de Vercel comparten la DB de producción: cualquier migración o dato de prueba generado por un preview contamina producción. No existe aislamiento de ambiente.

### Solución Implementada

- **Branch fijo `preview`** creado desde `main` (una vez). Connection string estable via Neon API.
- **`lib/neon/branching.ts`** (nuevo): wrapper tipado de Neon API — `ensurePreviewBranch`, `resetBranch`, `cleanupBranch`, `getBranchConnection`. Soporta `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH` (default `production`), `NEON_PREVIEW_BRANCH` (default `preview`).
- **`scripts/neon-preview-branch.ts`** (nuevo): CLI con flags `--ensure`, `--reset`, `--cleanup`, `--migrate`. Ejecuta migraciones contra el branch preview con `DATABASE_URL` del branch.
- **`/supercommitpre`**: paso 2 ejecuta `neon-preview-branch --ensure --migrate` (o fallback local si no hay `NEON_API_KEY`).
- **Vercel Preview**: usa `DATABASE_URL` del scope Preview (configurar una vez en Vercel Dashboard).
- **Unit tests**: `tests/unit/neon-branching.test.ts` (mock Neon API).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `lib/neon/branching.ts` | 🔧 Nuevo — Neon API wrapper |
| `scripts/neon-preview-branch.ts` | 🔧 Nuevo — CLI branching |
| `tests/unit/neon-branching.test.ts` | 🔧 Nuevo — unit tests |
| `.opencode/commands/supercommitpre.md` | 🔧 Integrado paso neon-preview |
| `.env.example` | 🔧 Agregadas vars NEON_* |
| `ARCHITECTURE.md` | 🔧 Sección Neon Preview Branch |

### Tests

195 unit tests en `neon-branching.test.ts` (mock Neon API). Build exitoso, typecheck 0 errores.

### Variables de Entorno

- `NEON_API_KEY` (server-only, opcional — si falta, fallback local)
- `NEON_PROJECT_ID` (server-only)
- `NEON_PARENT_BRANCH` (default `production`)
- `NEON_PREVIEW_BRANCH` (default `preview`)

## ✨ Fix CSRF login producción (2026-09-24)

> status: released
> release: v0.4
> date: 2026-09-24
> change_id: fix-csrf-login
> module: auth+ui
> tags: [fix, auth, login, csrf, production]

### Problema

El login en Vercel fallaba con `MissingCSRF` porque el fetch directo a `/api/auth/callback/credentials` no incluía el token CSRF que Auth.js requiere en producción.

### Solución Implementada

Fetch del token CSRF antes del POST de login: `fetch('/api/auth/csrf')` → extrae `csrfToken` del response → incluido en el body del POST a `/api/auth/callback/credentials`.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/(public)/login/page.tsx` | 🔧 Fetch CSRF token antes de login |

### Tests

Build exitoso, typecheck 0 errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Fix login redirect 200 JSON (2026-09-24)

> status: released
> release: v0.4
> date: 2026-09-24
> change_id: fix-login-redirect
> module: auth+ui
> tags: [fix, auth, login, redirect, typecheck]

### Problema

Auth.js en ciertos escenarios devuelve un 200 con body JSON en vez de 302 redirect. El login no manejaba esta respuesta, causando navegación silenciosa. Además `sessionToken` no estaba declarado en el tipo JWT.

### Solución Implementada

1. `login/page.tsx`: parsea response y si es JSON con `url`, redirige manualmente vía `router.push()`.
2. `types/next-auth.d.ts`: declarado `sessionToken?: string` en el tipo JWT.
3. `auth.ts`: removido import no utilizado.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/(public)/login/page.tsx` | 🔧 Handle 200 JSON response |
| `types/next-auth.d.ts` | 🔧 Declarado sessionToken |
| `auth.ts` | 🔧 Removido import no usado |

### Tests

Build exitoso, typecheck 0 errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Rebranding "Métrica Pádel" + fix voseo + remove "Gratuito" (2026-09-24)

> status: released
> release: v0.4
> date: 2026-09-24
> change_id: remove-gratuito-rebrand
> module: ui+marketing
> tags: [ui, branding, landing, spanish, copy]

### Problema

La app mostraba "Gratuito para alumnos" en el hero (no aplica al modelo de negocio), el footer decía "Skeleton" en vez del nombre real, y el copy usaba voseo argentino ("evaluá", "creá") en vez de español neutro.

### Solución Implementada

1. **Hero**: reemplazado "Gratuito para alumnos" por "Métrica Pádel" y CTA "Empezar" (commit `26ac2a5`).
2. **Footer**: "Skeleton" → "Métrica Pádel" (commit `32a9348`).
3. **Voseo**: 21 instancias de voseo reemplazadas por infinitivo neutro en 4 archivos (commit `bbd4a73`).
4. **Home page**: removido "Gratuito"/"gratis" del home + seed (commit `8bef88b`).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/(public)/page.tsx` | 🔧 Landing copy + rebranding |
| `components/layout/footer.tsx` | 🔧 Brand name |
| `app/(app)/dashboard/page.tsx` | 🔧 Voseo → neutro |
| `components/notifications/push-soft-prompt.tsx` | 🔧 Voseo → neutro |
| `scripts/seed-marketing.ts` | 🔧 Removido "Gratuito" |

### Tests

Build exitoso, typecheck 0 errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Supercommit System (2026-09-24)

> status: released
> release: v0.4
> date: 2026-09-24
> change_id: supercommit-system
> module: infra
> tags: [workflow, git, ci-cd, deploy, commands]

### Problema

No existía un flujo estandarizado para sincronizar con main, commitear a rama-preview y hacer deploy a producción. Cada vez se ejecutaban comandos git manualmente, con riesgo de errores.

### Solución Implementada

- **`scripts/supercommit-common.sh`** (nuevo): lógica compartida — detecta rama actual, valida CI, ejecuta tests, sincroniza version.ts desde FEATURES.md, merge con `--no-ff`.
- **`.opencode/commands/supercommitpre.md`**: sync con main + commit a rama-preview (desarrollo normal).
- **`.opencode/commands/supercommitpro.md`**: commit a rama-preview + merge a main (deploy a producción). Incluye validación local antes del push.
- **`.opencode/commands/ship-feature.md`** (nuevo): workflow end-to-end para features.
- **`lib/constants/version.ts`** (nuevo): `APP_VERSION` y `BUILD_DATE` sincronizados desde FEATURES.md.
- **`ARCHITECTURE.md`**: documentado Git Workflow con branches protegidos.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `scripts/supercommit-common.sh` | 🔧 Nuevo — lógica compartida |
| `.opencode/commands/supercommitpre.md` | 🔧 Nuevo — sync + commit |
| `.opencode/commands/supercommitpro.md` | 🔧 Nuevo — deploy a producción |
| `.opencode/commands/ship-feature.md` | 🔧 Nuevo — workflow feature |
| `lib/constants/version.ts` | 🔧 Nuevo — version tracking |
| `ARCHITECTURE.md` | 🔧 Git Workflow documentado |

### Tests

Build exitoso, typecheck 0 errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Dimensiones de Rúbrica (R1/R3) — split de categorías (2026-09-21)

> status: released
> release: v0.4
> date: 2026-09-21
> change_id: rubric-dimensions
> module: db+api
> tags: [padel, rubric, categories, migration, db]

### Problema

Las categorías de rúbrica originales (`tecnica`, `tactica`, `fisica`, `actitud`) eran demasiado genéricas. R1 pide separar `tecnica` en `tecnica_basica` y `tecnica_especifica`; R3 pide renombrar `actitud` a `actitud_equipo` y agregar `reglas` como categoría independiente.

### Solución Implementada

- **Migración `0006_handy_proemial_gods.sql`**: ALTER TYPE `rubric_category` — agrega `reglas`, `tecnica_basica`, `tecnica_especifica`, `actitud_equipo`; migra datos existentes (`tecnica` → `tecnica_basica`, `actitud` → `actitud_equipo`); elimina valores viejos.
- **`lib/db/schema.ts`**: enum `rubric_category` actualizado a 6 valores.
- **`lib/validations/padel.ts`**: `rubricCategoryValues` actualizado.
- **`lib/padel/rubric-templates.ts`** (nuevo): `RUBRICA_INTEGRAL_TEMPLATE` — plantilla completa con 6 dimensiones × 4 niveles × 1 criterio cada una. Uso: seed manual o API.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `drizzle/0006_handy_proemial_gods.sql` | 🔧 Nuevo — migración categorías |
| `lib/db/schema.ts` | 🔧 Enum rubric_category actualizado |
| `lib/validations/padel.ts` | 🔧 rubricCategoryValues actualizado |
| `lib/padel/rubric-templates.ts` | 🔧 Nuevo — plantilla integral |

### Tests

Tests existentes pasando con nuevas categorías. Build exitoso.

### Variables de Entorno

Ninguna nueva.

## ✨ Landing page rediseñada (2026-09-22)

> status: released
> release: v0.3
> date: 2026-09-22
> change_id: landing-redesign
> module: marketing+ui
> tags: [landing, ui, marketing, homepage, español]

### Problema

La página de inicio era un fallback mínimo ("Página Pública" + 2 botones) sin identidad de marca ni contenido informativo.

### Solución Implementada

Landing page completa en español con 5 secciones: Hero (título + subtitle + CTAs + badge "Gratuito"), Features Grid (3 cards: Rúbricas, Evolución, Cursos), How It Works (3 pasos numerados), Stats Bar (6 dimensiones, 4 niveles, 85+ endpoints, 397+ tests) y CTA Final. Todo estático, sin dependencia de DB.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/(public)/page.tsx` | 🔧 Reemplazado StaticFallback con landing completa (+138/-16) |

### Tests
Build exitoso, typecheck 0 errores.

### Variables de Entorno
Ninguna nueva.

## ✨ G17 — E2E tests completos (2026-09-21)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: g17-e2e-etapa1
> module: tests
> tags: [e2e, padel, tests, playwright, rubric-editor, evaluation-flow, student-view]

### Problema

Los E2E existentes solo verificaban auth guards (401/403) y renderizado básico. No existían tests que navegaran los flujos completos de usuario.

### Solución Implementada

3 specs E2E navegables: `rubric-editor.spec.ts` (10 tests: login admin, nav rubricas, form, guards), `evaluation-flow.spec.ts` (8 tests: coach pages, nav, API guards), `student-view.spec.ts` (14 tests: student nav, authenticated pages, bottom nav, API guards). Total: 32 tests E2E.

### Archivos Creados

| Archivo | Acción |
|---------|--------|
| `tests/e2e/rubric-editor.spec.ts` | 🔧 Nuevo — 10 tests |
| `tests/e2e/evaluation-flow.spec.ts` | 🔧 Nuevo — 8 tests |
| `tests/e2e/student-view.spec.ts` | 🔧 Nuevo — 14 tests |

### Tests
32 E2E tests pasando, 397 unit tests, 76 API tests. Build exitoso.

### Variables de Entorno
Ninguna nueva.

## ✨ Fix Vercel build — deploy en producción (2026-09-22)

> status: released
> release: v0.3
> date: 2026-09-22
> change_id: fix-vercel-build
> module: infra
> tags: [vercel, build, deploy, auth, sentry, fix]

### Problema

El deploy en Vercel fallaba con 3 errores: (1) `NEXTAUTH_SECRET` requerido en module load time durante build; (2) migraciones Drizzle fallaban con "type already exists"; (3) `withSentryConfig` rompía el build output cuando `SENTRY_AUTH_TOKEN` no estaba configurado.

### Solución Implementada

1. `auth.ts`: removido throw en build time, genera secret efímero si falta.
2. `scripts/migrate.ts`: catch para "already exists" en error.cause.message → exit 0.
3. `next.config.mjs`: `withSentryConfig` solo se aplica si `SENTRY_AUTH_TOKEN` existe.
4. `app/not-found.tsx` + `app/(public)/error.tsx`: error boundaries para 404 y errores runtime.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `auth.ts` | 🔧 Removido throw en production build |
| `scripts/migrate.ts` | 🔧 Skip migrations existentes |
| `next.config.mjs` | 🔧 Sentry condicional |
| `app/not-found.tsx` | 🔧 Nuevo — página 404 |
| `app/(public)/error.tsx` | 🔧 Nuevo — error boundary |

### Tests
Build exitoso en Vercel, deploy funcionando.

### Variables de Entorno
`SENTRY_AUTH_TOKEN` (opcional, si no está Sentry se desactiva).

## ✨ Fix login + TEMPORARY dashboard (2026-09-22)

> status: released
> release: v0.3
| date: 2026-09-22
> change_id: fix-auth-ux
> module: auth+ui
> tags: [fix, login, auth, dashboard, temporary]

### Problema

Dos bugs de UX: (1) `signIn()` de next-auth/react causaba `ClientFetchError` en dev porque el endpoint CSRF devolvía body vacío; (2) usuarios TEMPORARY (email no verificado) veían 403 en todas las APIs del dashboard.

### Solución Implementada

1. Login: reemplazado `signIn()` con `fetch()` directo a `/api/auth/callback/credentials` con `redirect: "manual"`.
2. Dashboard: si `status === "TEMPORARY"`, renderiza Card informativo "Verifica tu email para empezar" en vez de `<StudentDashboard>`.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/(public)/login/page.tsx` | 🔧 fetch directo en vez de signIn() |
| `app/(app)/dashboard/page.tsx` | 🔧 Banner TEMPORARY con badge |

### Tests
Typecheck 0 errores, build exitoso.

### Variables de Entorno
Ninguna nueva.

## ✨ Fix DB graceful fallback en páginas públicas (2026-09-20)

> status: released
> release: v0.3
> date: 2026-09-20
> change_id: fix-db-fallback
> module: infra+ui
> tags: [fix, db, fallback, public-pages]

### Problema

La app crasheaba cuando NeonDB no era reachable. El layout y todas las páginas públicas fallaban con errores de conexión.

### Solución Implementada

try/catch en `layout.tsx` y 4 páginas públicas (`page.tsx`, `[slug]/page.tsx`, `blog/page.tsx`, `shop/page.tsx`). Si `getCachedPage()` o `getCachedNavigation()` fallan, se usan datos por defecto (`DEFAULT_NAVIGATION`, `<StaticFallback />`, `[]`).

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/(public)/layout.tsx` | 🔧 try/catch en getCachedNavigation() |
| `app/(public)/page.tsx` | 🔧 try/catch en getCachedPage("home") |
| `app/(public)/[slug]/page.tsx` | 🔧 try/catch en getCachedPage(slug) |
| `app/(public)/blog/page.tsx` | 🔧 try/catch en getCachedPosts() |
| `app/(public)/shop/page.tsx` | 🔧 try/catch en getCachedProducts() |

### Tests
Typecheck 0 errores, build exitoso.

### Variables de Entorno
Ninguna nueva.

## ✨ Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso — G6/G7/G12 (2026-09-21)

> status: released
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: api+db+ui
> tags: [padel, evaluations, versions, evolution, courses, enrollment, migration, api, ui]

### Problema

El loop evaluativo tiene 3 gaps HIGH abiertos (`production_artifacts/2026-09-21-user-flows-v2.md` §7): (G6) el coach solo puede publicar una evaluación por fila y no existe concepto de versión para mostrar progresión del alumno; (G7) el alumno ve sus evaluaciones como lista plana sin vista de evolución/tendencia por categoría; (G12) los alumnos solo entran a un curso por invite code y el coach no puede agregar/remover alumnos manualmente.

### Solución Implementada

- **G6 — Versiones**: columna `evaluations.version` (integer, nullable) + índice `(studentId, rubricId, status)` + backfill legacy (migración `0007_*`); `publishEvaluation` asigna `version = MAX+1` por (studentId, rubricId) publicado; endpoints `GET /api/evaluations/series` (coach) y `GET /api/student/evaluations/series` (alumno); badge "v{N}" en `evaluation-card.tsx` (solo version > 1) y en el header de `scoring-canvas.tsx` al editar una evaluación existente.
- **G7 — Evolución**: lógica pura `lib/padel/evolution.ts` (`computeTrend` up/down/stable + `groupByCategory` genérica, sin imports server-side); endpoint `GET /api/student/evolution` (guardUser + ACTIVE + role USER, anti-IDOR por studentId de sesión); página server `app/(app)/evolucion/page.tsx` + `components/padel/evolution-view.tsx` (client: tarjeta por categoría con flecha de tendencia, comparación última vs anterior, lista de versiones); link `/evolucion` en `bottom-nav.tsx` (rol USER).
- **G12 — Gestión de alumnos**: `POST /api/courses/[id]/students` (add por studentId, 201/400/404/409, audita CREATE), `DELETE /api/courses/[id]/students/[studentId]` (200/404, audita DELETE), `GET /api/courses/[id]/students/search?q=` (candidatos ACTIVE/USER no inscritos, limit 20); UI en tab Alumnos de `course-detail.tsx` con botón "Agregar alumno" (`add-student-modal.tsx` con búsqueda debounced 300ms) y remover por fila con confirmación. Auditoría + anti-IDOR 404 en mutaciones.
- **API docs**: `lib/api-docs/paths/evolution.ts` (nuevo, tag Padel Evolution) + endpoints G12 en `lib/api-docs/paths/courses.ts`; schemas `EvolutionGroupDto` (padel.ts) y `CourseStudentAddInput`/`CourseEnrollmentDto`/`CourseStudentCandidateDto` (courses.ts); compuestos en `lib/api-docs/spec.ts`.

### Archivos Modificados

- `lib/padel/evolution.ts` (nuevo), `app/api/student/evolution/route.ts` (nuevo), `app/(app)/evolucion/page.tsx` (nuevo), `components/padel/evolution-view.tsx` (nuevo), `components/padel/add-student-modal.tsx` (nuevo), `app/api/courses/[id]/students/route.ts` (nuevo), `app/api/courses/[id]/students/[studentId]/route.ts` (nuevo), `app/api/courses/[id]/students/search/route.ts` (nuevo), `lib/api-docs/paths/evolution.ts` (nuevo).
- `components/padel/evaluation-card.tsx`, `components/padel/scoring-canvas.tsx`, `components/padel/bottom-nav.tsx`, `components/padel/course-detail.tsx`, `lib/validations/padel.ts`, `lib/api-docs/paths/courses.ts`, `lib/api-docs/schemas/padel.ts`, `lib/api-docs/schemas/courses.ts`, `lib/api-docs/spec.ts`.

### Tests

- Unit: `tests/unit/padel/evolution.test.ts` (7 casos, 100% cobertura computeTrend/groupByCategory).
- API happy-path (SQL real): `tests/api/padel/student-evolution-happy.spec.ts`, `tests/api/padel/course-students-happy.spec.ts` + guards `tests/api/padel/course-students.spec.ts` (401 sin sesión + 403 de rol).
- E2E: `evaluation-version.spec.ts`, `student-evolution.spec.ts`, `course-students.spec.ts` (pendientes — ver backlog).

### Variables de Entorno

Ninguna nueva.

## ✨ G10: Admin UI de gestión de usuarios (CRUD completo) (2026-09-21)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: g10-admin-users-ui
> module: admin+api+ui
> tags: [admin, users, crud, ui, api, audit, soft-lock]

### Problema

El back-office solo permitía crear/listar jugadores y promoverlos (G3/G4). No existía UI admin para editar datos, bloquear/desbloquear cuentas ni una página de gestión de usuarios navegable desde `/admin`.

### Solución Implementada

- **API** `app/api/admin/users/[id]/route.ts` (+PUT +DELETE +POST unlock):
  - `PUT` actualiza firstName/lastName/phone (guardAdmin + auditUpdate + Zod `adminUpdateUserSchema` con refine "al menos un campo"). Solo role USER (anti-IDOR → 404 si ADMIN/inexistente).
  - `DELETE` soft-lock (status → LOCKED, guardAdmin + auditUpdate). Reglas: no puedes bloquearte a ti mismo → 400; no puedes bloquear a otro ADMIN → 403; inexistente/no USER → 404.
  - `POST` desbloquea (status → ACTIVE, guardAdmin + auditUpdate, solo role USER).
- **Queries** `lib/db/queries/padel/admin-users.ts`: +`updatePlayer`, +`lockPlayer`, +`unlockPlayer` (todas filtran role='USER' a nivel query); `listPlayers` y `getPlayerById` ahora incluyen `phone` y `createdAt`.
- **UI** `app/admin/users/page.tsx` (server) + `components/admin/users/`:
  - `user-list.tsx` (client): search debounced 300ms, tabla (Nombre/Email/Estado/Rol/Creado/Acciones), badges de status/rol, acciones Edit (dialog), Lock/Unlock toggle, Promote (solo USER), botón "Crear usuario".
  - `create-user-form.tsx` (client): email/nombre/apellido/password opcional ("Dejar vacío para auto-generar"); muestra `generatedPassword` en alert una sola vez.
  - `edit-user-form.tsx` (client): firstName/lastName/phone → PUT; toasts con sonner.
- **Nav** `app/admin/page.tsx`: Card link a `/admin/users`.

### Archivos Modificados

- `app/api/admin/users/[id]/route.ts` (+PUT/DELETE/POST unlock), `lib/db/queries/padel/admin-users.ts` (+3 queries, +phone/createdAt), `lib/validations/padel.ts` (+`adminUpdateUserSchema`), `app/admin/page.tsx` (link Usuarios), `lib/api-docs/paths/padel.ts` (+PUT/DELETE/POST en `/api/admin/users/{id}`), `lib/api-docs/schemas/padel.ts` (+`AdminUserUpdateInput`, +phone/createdAt en `AdminUserDto`), `FEATURES.md`
- Nuevos: `app/admin/users/page.tsx`, `components/admin/users/user-list.tsx`, `components/admin/users/create-user-form.tsx`, `components/admin/users/edit-user-form.tsx`

### Tests

- Unit: `tests/unit/db/admin-users.test.ts` (+6 casos: updatePlayer ok/null, lockPlayer ok/null, unlockPlayer ok/null).
- API happy-path + guards (SQL real): `tests/api/padel/admin-users-crud.spec.ts` (PUT 200 + verificación SQL + auditoría + 400 body vacío; DELETE lock 200 + status=LOCKED en DB + auditoría + unlock 200; self-lock 400; otro ADMIN 403; inexistente 404; USER 403; 401 sin sesión).
- E2E: `tests/e2e/admin-users.spec.ts` (página requiere auth, link en /admin, guards 401 de PUT/DELETE).

### Variables de Entorno

Ninguna nueva.

## ✨ G8: Detalle de curso del alumno (2026-09-21)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: student-course-detail
> module: api+db+ui
> tags: [courses, student, padel, api, ui, anti-idor]

### Problema

El detalle de curso (`/cursos/[id]`) era solo para el coach (P07, guardAdmin): el alumno no tenía vista de sus cursos (las cards del dashboard no eran clickeables) ni podía ver las rúbricas asignadas ni sus evaluaciones publicadas por curso.

### Solución Implementada

- **Query** `getStudentCourseDetail(studentId, courseId)` en `lib/db/queries/padel/enrollments.ts`: verifica inscripción (anti-IDOR → null), info del curso, rúbricas asignadas (`course_rubrics` JOIN `rubrics` con category) y evaluaciones publicadas propias del curso con scores enriquecidos (criterionName/levelName).
- **API** `GET /api/student/courses/[id]` (nuevo): guardUser + ACTIVE + role USER; 404 si no inscrito (anti-IDOR); read-only sin auditoría. Response `{ course, rubrics, evaluations }`.
- **UI** `components/padel/student-course-detail.tsx` (nuevo, client): header (nombre, level badge, schedule, days), rúbricas asignadas con category badges, mis evaluaciones con tabla de scores (Card/Badge/Table).
- **Page** `app/(app)/cursos/[id]/page.tsx` convertida a server component que ramifica por rol (D5): ADMIN → `getCourseById` + `CourseDetail` (P07 existente); USER → `getStudentCourseDetail` + `StudentCourseDetail` (G8). Fechas serializadas a ISO para props de client components.
- **Dashboard** `components/padel/student-dashboard.tsx`: cards de cursos envueltas en `<Link href={/cursos/${id}}>` (next/link).

### Archivos Modificados

- `lib/db/queries/padel/enrollments.ts` (+`getStudentCourseDetail` + tipos), `app/(app)/cursos/[id]/page.tsx` (server component por rol), `components/padel/student-dashboard.tsx` (cards clickeables), `lib/api-docs/paths/courses.ts` (+path + tag `Padel Student Courses`), `lib/api-docs/schemas/courses.ts` (+`StudentCourseDetailDto`), `lib/api-docs/spec.ts` (+tag)
- Nuevos: `app/api/student/courses/[id]/route.ts`, `components/padel/student-course-detail.tsx`

### Tests

- Unit: `tests/unit/db/enrollments.test.ts` (+4 casos `getStudentCourseDetail`: inscrito con scores enriquecidos, no inscrito → null, curso inexistente → null, sin evaluaciones).
- API happy-path (SQL real): `tests/api/padel/student-course-happy.spec.ts` (200 con course+rubrics+evaluations, 404 no inscrito/inexistente, 403 rol ADMIN).
- E2E: `tests/e2e/student-course-detail.spec.ts` (auth + 401 sin sesión).

### Variables de Entorno

Ninguna nueva.

## ✨ G5: Perfil y Settings con cambio de contraseña (2026-09-21)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: g5-profile-settings
> module: app+api+auth
> tags: [settings, profile, password, ui, api, audit]

### Problema

No existía página de perfil/settings en el área privada: el usuario no podía editar sus datos personales ni cambiar su contraseña desde la app (solo vía reset con token).

### Solución Implementada

- **`PUT /api/user/password`** (nuevo, guardUser + ACTIVE + auditChangePassword): valida `currentPassword` contra el hash almacenado vía `comparePassword` (nunca lanza), hashea la nueva con bcrypt (cost 10) y actualiza `users.passwordHash`. 400 si la actual es incorrecta o si la nueva es igual a la actual (refine de Zod); 403 si no ACTIVE.
- **`changePasswordSchema`** en `lib/auth/schemas.ts`: `currentPassword` min 1, `newPassword` min 8, refine `currentPassword !== newPassword`.
- **`app/(app)/settings/page.tsx`** (server component): lee sesión + perfil completo vía `getUserById` (incluye phone, que no viaja en el JWT) y renderiza `ProfileForm`.
- **`components/padel/profile-form.tsx`** (client): dos Cards — Datos personales (firstName/lastName/phone → PUT /api/user/profile; email inmutable, disabled) y Cambiar contraseña (current/new/confirm → PUT /api/user/password). Toasts con sonner.
- **Bottom nav**: entrada "Perfil" (`/settings`, icono `User`) agregada a ADMIN_ITEMS y USER_ITEMS.

### Archivos Modificados

- `lib/auth/schemas.ts` (+`changePasswordSchema`), `components/padel/bottom-nav.tsx` (+Perfil), `lib/api-docs/spec.ts` (+path `/api/user/password` + schema `ChangePasswordInput`)
- Nuevos: `app/api/user/password/route.ts`, `app/(app)/settings/page.tsx`, `components/padel/profile-form.tsx`

### Tests

- Unit: `tests/unit/auth/change-password.test.ts` (5 casos: válido, current vacío, new <8, refine igual, campo faltante).
- API happy-path (SQL real): `tests/api/padel/profile-happy.spec.ts` (GET perfil 200, PUT actualiza + verificación SQL, PUT password correcto 200 + hash actualizado, incorrecto 400, igual 400, corta 400).
- E2E: `tests/e2e/settings-profile.spec.ts` (página requiere auth, render autenticado, guards 401 de ambos endpoints).

### Variables de Entorno

Ninguna nueva.

## ✨ R5 — Cobertura Dimensional Soft-Block en Evaluaciones (2026-09-21)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: r5-dimensional-coverage
> module: api+ui
> tags: [padel, evaluations, rubric, coverage, soft-block, api, ui]

### Problema

Un coach podía publicar múltiples evaluaciones del mismo alumno con rúbricas de la misma categoría (ej: `tecnica_basica`) sin ninguna señal de que esa dimensión ya estaba cubierta. R5 pide un soft-block: advertir sin bloquear.

### Solución Implementada

- **`checkDimensionalCoverage(studentId, currentRubricCategory)`** en `lib/padel/score.ts`: `SELECT DISTINCT r.category` con JOIN `evaluations → rubrics` filtrando `student_id` y `status='published'`. Retorna `{ alreadyEvaluated, coveredCategories }`.
- **`POST /api/evaluations/[id]/publish`** (modificado): tras publicar, consulta la categoría de la rúbrica y llama a `checkDimensionalCoverage`; la respuesta ahora es `{ evaluation, alreadyEvaluated }`. El publish nunca se bloquea (soft-block).
- **`components/padel/scoring-canvas.tsx`** (modificado): si `alreadyEvaluated` es true muestra toast warning "Ya evaluaste [categoría] para este alumno. Puedes publicar pero considera evaluar otras dimensiones." El botón Publicar no se deshabilita.

### Archivos Modificados

- `lib/padel/score.ts` (+`checkDimensionalCoverage`), `app/api/evaluations/[id]/publish/route.ts` (respuesta con `alreadyEvaluated`), `components/padel/scoring-canvas.tsx` (toast soft-block), `lib/api-docs/paths/padel.ts` (schema de respuesta publish)

### Tests

- Unit: `tests/unit/padel/coverage.test.ts` (db mockeado — false sin publicaciones, false con otra categoría, true con categoría repetida).
- API happy-path (SQL real): `tests/api/padel/coverage-happy.spec.ts` (publish → `alreadyEvaluated=false` en primera evaluación; `true` al repetir categoría).

### Variables de Entorno

Ninguna nueva.

## ✨ Cierre de Gaps en User Flows: G3/G4/G9/G11 (2026-09-21)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: gaps-user-flows
> module: api+auth+db
> tags: [admin, promotion, users, password, notifications, inbox, enrollment, padel, api, audit]

### Problema

`production_artifacts/2026-09-21-user-flows.md` (§4) detecta 4 gaps que bloquean flujos end-to-end: (G3) no hay endpoint para promover USER→ADMIN — un coach registrado por web no puede operar; (G4) `POST /api/admin/users` crea ACTIVE sin entregar credenciales al alumno; (G9) no hay trigger `evaluation.published` en el inbox; (G11) no existe endpoint para que el alumno abandone un curso.

### Solución Implementada

- **G3** `POST /api/admin/users/[id]/promote` (nuevo, guardAdmin + auditUpdate): cambia `users.role` USER→ADMIN vía `promoteUser(id)` en `lib/db/queries/padel/promote.ts`. 404 si inexistente/ya ADMIN (anti-IDOR); 401/403 guards.
- **G4** `POST /api/admin/users` (modificado): `password` opcional en `adminCreateUserSchema`; si ausente, `generateRandomPassword()` en `lib/padel/password.ts` (12 chars, crypto.randomBytes, charset sin I/l/0/O/1, mezcla de clases) → hash bcrypt en DB → `generatedPassword` devuelta UNA vez en la respuesta (nunca en audit_logs ni logs).
- **G9** `lib/notifications/triggers.ts` +`triggerEvaluationPublished(studentId, evaluationId)`: `createNotification` con `groupId = evaluationId` (uuid, dedup 1h del engine), type success, priority P1, category system, `ctaUrl: /evaluaciones/${id}`. Llamada fire-and-forget con try/catch en `POST /api/evaluations/[id]/publish` (el publish nunca falla por el engine).
- **G11** `DELETE /api/courses/[id]/enrollment` (nuevo, guardUser + ACTIVE + role USER + auditDelete): elimina `course_enrollments` del alumno autenticado vía `deleteEnrollment(courseId, studentId)`; 404 si no inscrito; UNIQUE liberado permite re-join; evaluaciones históricas intactas (FK sin cascade).

### Archivos Modificados

- `app/api/admin/users/route.ts` (POST password opcional + generatedPassword), `app/api/evaluations/[id]/publish/route.ts` (trigger fire-and-forget), `lib/validations/padel.ts` (password `.optional()`), `lib/db/queries/padel/enrollments.ts` (+`deleteEnrollment`), `lib/db/queries/padel/index.ts` (+promote export), `lib/notifications/triggers.ts`, `lib/api-docs/paths/padel.ts`, `lib/api-docs/paths/courses.ts`, `lib/api-docs/schemas/padel.ts` (+`AdminUserCreateResponse`)
- Nuevos: `app/api/admin/users/[id]/promote/route.ts`, `app/api/courses/[id]/enrollment/route.ts`, `lib/db/queries/padel/promote.ts`, `lib/padel/password.ts`

### Tests

- Unit: `tests/unit/padel/password.test.ts`, `tests/unit/notifications/triggers.test.ts`, `tests/unit/db/admin-users.test.ts` (+promoteUser), `tests/unit/db/enrollments.test.ts` (+deleteEnrollment).
- API guard: `tests/api/padel/promote.spec.ts`, `tests/api/padel/admin-users-password.spec.ts`, `tests/api/padel/evaluation-published.spec.ts`, `tests/api/padel/course-leave.spec.ts`.
- API happy-path (SQL real): `tests/api/padel/promote-happy.spec.ts`, `tests/api/padel/admin-users-password-happy.spec.ts` (login real con generatedPassword), `tests/api/padel/evaluation-published-happy.spec.ts` (notificación en DB + dashboard/student), `tests/api/padel/course-leave-happy.spec.ts` (enrollment eliminado + re-join).
- E2E: `tests/e2e/gaps-user-flows.spec.ts`.

### Variables de Entorno

Ninguna nueva.

## ✨ Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management (2026-09-21)

> status: released
> release: v0.2
> date: 2026-09-21
> change_id: etapa2-3-onboarding-dashboard
> module: auth+api+db+ui
> tags: [courses, onboarding, dashboard, enrollment, padel, db, migration, api, ui]

### Problema

Etapa 1 (v0.1) entregó el core evaluativo sin contexto: no hay onboarding real (registro/login), ni cursos para agrupar alumnos, ni hubs de navegación (home profesor/alumno), ni historial. El blueprint clasifica auth + cursos como PREREQUISITO y dashboards/management como MANAGEMENT.

### Solución Implementada

- **DB** (por @db-engineer): +2 enums (`course_level`, `course_status`), +3 tablas (`courses`, `course_enrollments`, `course_rubrics`), `evaluations.courseId` nullable (FK set null, D1); migración `0005_goofy_charles_xavier.sql` vía `db:generate`. Queries en `lib/db/queries/padel/courses.ts` y `lib/db/queries/padel/enrollments.ts`.
- **Lógica pura**: `lib/padel/course-code.ts` (`generateInviteCode` PAD-XXXX) y `lib/padel/dashboard.ts` (`deriveLevel`, `isClassToday`).
- **Validaciones**: `lib/validations/padel.ts` ampliado — `courseCreateSchema`/`courseUpdateSchema` (name 1-200, level enum, schedule ≤100, days ≤7), `courseJoinSchema` (inviteCode normalizado `^PAD-[A-Z0-9]{4}$`), `courseRubricAssignSchema`, `historyQuerySchema`.
- **Queries nuevas**: `lib/db/queries/padel/dashboard.ts` (`getTeacherDashboard` métricas COUNT/AVG + `getStudentDashboard` nivel derivado + notificaciones) y `history.ts` (`listHistory` con filtros courseId/studentId/status, join con courses vía courseId, D8). Exportadas desde `index.ts`.
- **API (7 route handlers nuevos)**: `app/api/courses` (GET list + POST create con retry ≤5 en colisión inviteCode), `app/api/courses/[id]` (GET detail + PUT + DELETE soft archive D7), `app/api/courses/join` (POST 201/400/404/409), `app/api/courses/[id]/rubrics` (GET + POST assign 409 D2), `app/api/dashboard/teacher`, `app/api/dashboard/student`, `app/api/history`. Guards `guardAdmin`/`guardUser` + auditoría en mutaciones + anti-IDOR 404. `POST /api/auth/register` ampliado: `role?` opcional **ignorado** (D6, nunca auto-ADMIN).
- **API docs**: `lib/api-docs/paths/courses.ts` + `lib/api-docs/schemas/courses.ts` + tags `Padel Courses`/`Padel Dashboard` en `spec.ts` (~13 endpoints nuevos).
- **UI (6 páginas / 10 componentes)**: SCR-02 `register` (selector coach/player UX pura), SCR-03 `login` (Auth.js signIn), `dashboard` (router por rol D5: P01/A01), `cursos` (P05), `cursos/[id]` (P07 tabs + copiar código + evaluar), `historial` (P10 filtros). Componentes: `bottom-nav`, `course-card`, `course-detail`, `create-course-modal`, `join-course-modal`, `assign-rubric-modal`, `history-list`, `dashboard-metrics`, `teacher-dashboard`, `student-dashboard`.

### Archivos Modificados

- `lib/validations/padel.ts`, `lib/db/queries/padel/index.ts`, `lib/api-docs/spec.ts`, `app/api/auth/register/route.ts`, `ARCHITECTURE.md`, `FEATURES.md`
- Nuevos: `lib/padel/course-code.ts`, `lib/padel/dashboard.ts`, `lib/db/queries/padel/dashboard.ts`, `lib/db/queries/padel/history.ts`, 7 route handlers en `app/api/courses/route.ts`, `app/api/courses/[id]/route.ts`, `app/api/courses/join/route.ts`, `app/api/courses/[id]/rubrics/route.ts`, `app/api/dashboard/teacher/route.ts`, `app/api/dashboard/student/route.ts`, `app/api/history/route.ts`, `lib/api-docs/paths/courses.ts`, `lib/api-docs/schemas/courses.ts`, 6 páginas en `app/(app)/dashboard/page.tsx`, `app/(app)/cursos/page.tsx`, `app/(app)/cursos/[id]/page.tsx`, `app/(app)/historial/page.tsx`, `app/(public)/login/page.tsx`, `app/(public)/register/page.tsx`, 10 componentes en `components/padel/`

### Tests

- Unit: `tests/unit/padel/course-code.test.ts`, `tests/unit/padel/dashboard.test.ts` (lógica pura), `tests/unit/validations/padel.test.ts` ampliado (course/join/assign/history schemas).
- API: `tests/api/padel/courses-guard.spec.ts` (401/403), `tests/api/padel/courses-happy.spec.ts`, `tests/api/padel/join-happy.spec.ts`, `tests/api/padel/dashboard-happy.spec.ts`, `tests/api/padel/history-happy.spec.ts` (SQL real contra NeonDB + edge cases join 404/409/400 + IDOR history).
- E2E (@qa-release): `tests/e2e/onboarding.spec.ts`, `tests/e2e/course-flow.spec.ts`, `tests/e2e/dashboard.spec.ts` (auth-guard + render + API guards).

### Variables de Entorno

Ninguna nueva.

## ✨ Etapa 1: Core Evaluativo — Rúbricas + Evaluaciones (2026-09-20)

> status: released
> release: v0.1
> date: 2026-09-20
> change_id: etapa1-core-evaluativo
> module: admin+api+db+ui
> tags: [rubrics, evaluations, padel, db, migration, api, ui]

### Problema

La app de evaluación de pádel no tiene capacidad de rúbricas ni evaluaciones (greenfield). El mockup `components/preview/etapa1-core-evaluativo.tsx` define el loop de valor: coach crea rúbrica → evalúa alumno → alumno ve su evaluación. El blueprint previo proponía 16 pantallas; el usuario confirmó alcance reducido: 4 pantallas, cursos fuera (Etapa 2), roles USER/ADMIN (sin `padel_role`).

### Solución Implementada

- **DB**: +3 enums (`rubric_status`, `evaluation_status`, `rubric_category`), +6 tablas (`rubrics`, `rubric_levels`, `rubric_criteria`, `rubric_descriptors`, `evaluations`, `evaluation_scores`); migración `0004_*` vía `db:generate`.
- **Queries**: `lib/db/queries/padel/{rubrics,evaluations,admin-users}.ts` — CRUD transaccional, ownership anti-IDOR (ownerId/teacherId/studentId → 404), publish con validación de criterios completos, markRead idempotente, `createActiveUser` (bcrypt + ACTIVE + USER).
- **Validaciones**: `lib/validations/padel.ts` — schemas Zod (adminCreateUser, rubricCreate/Update con 4 descriptores fijos, evaluationCreate/Save, list queries, id params).
- **Score**: `lib/padel/score.ts` — funciones puras `computeMaxScore`/`computeTotalScore`/`validatePublish`.
- **API (10 route handlers / 15 endpoints)**: `app/api/admin/users` (GET+POST+[id]), `app/api/rubrics` (GET+POST+[id] GET/PUT/DELETE archive), `app/api/evaluations` (GET+POST+[id] GET/PUT+publish), `app/api/student/evaluations` (GET+[id]+read). Guards server-side (`guardAdmin`/`guardUser`), auditoría en mutaciones, 409 email duplicado, 404 IDOR.
- **API docs**: `lib/api-docs/paths/padel.ts` + `lib/api-docs/schemas/padel.ts` + tags `Padel Admin`/`Padel Student` en `spec.ts`.
- **UI (7 páginas / 8 componentes)**: P02 `rubricas` (RubricLibrary + RubricCard + EmptyState), P03 `rubricas/nueva` + `rubricas/[id]` (RubricEditor), P09 `evaluar` + `evaluar/[id]` (ScoringCanvas + StudentPicker), A03 `evaluaciones` + `evaluaciones/[id]` (EvaluationCard + RubricViewer). Páginas coach con `validateAdmin`; alumno protegidas por layout `validateUser`.

### Archivos Modificados

- `lib/db/schema.ts`, `lib/db/queries/padel/*`, `lib/auth/protected-routes.ts`, `lib/api-docs/spec.ts`, `ARCHITECTURE.md`, `FEATURES.md`
- Nuevos: `lib/validations/padel.ts`, `lib/padel/score.ts`, 10 route handlers en `app/api/{admin/users,rubrics,evaluations,student/evaluations}`, `lib/api-docs/{paths,schemas}/padel.ts`, 7 páginas en `app/(app)/{rubricas,evaluar,evaluaciones}`, 8 componentes en `components/padel/`

### Tests

- Unit: `tests/unit/validations/padel.test.ts` (Zod), `tests/unit/padel/score.test.ts` (score puro), `tests/unit/db/{rubrics,evaluations,admin-users}.test.ts` (queries).
- API: `tests/api/padel/guard.spec.ts` (401/403/IDOR), `tests/api/padel/{admin-users,rubrics,evaluations,student}-happy.spec.ts` (SQL real contra NeonDB).
- E2E: `rubric-editor.spec.ts`, `evaluation-flow.spec.ts`, `student-view.spec.ts` (completados vía G17 — 32 tests).

### Variables de Entorno

Ninguna nueva.

## ✨ Project Blueprint: questionnaire + scaffolding para nuevos proyectos (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: project-blueprint
> module: infra
> tags: [blueprint, scaffolding, templates, init]

### Problema

Cada proyecto nuevo requiere ~2 horas de setup manual (copiar, renombrar, configurar, migrar). No hay questionnaire que guíe las decisiones, ni templates por tipo de proyecto, ni script de scaffolding.

### Solución Implementada

- **`blueprint/questionnaire.md`** — 15 preguntas agrupadas en 3 bloques (Identidad, Features, Dominio) con tipos de respuesta definidos.
- **`blueprint/config-mapping.md`** — mapeo respuestas → acciones concretas (archivo a tocar + valor a escribir).
- **`blueprint/patterns/*.md`** — 5 templates de proyecto (saas, ecommerce, blog, services, education) con schema base, endpoints y UI pages.
- **`blueprint/templates/*.ts`** — snippets de schema, queries, API y tests.
- **`scripts/init-project.mjs`** — scaffolding automatizado: copia + renombrado + env + migrate + validate; acepta `--from-blueprint answers.json`.
- **`blueprint/README.md`** — documentación del flujo completo.

### Archivos Modificados

- `blueprint/questionnaire.md`, `blueprint/config-mapping.md`, `blueprint/patterns/*.md`, `blueprint/templates/*.ts`, `scripts/init-project.mjs`, `blueprint/README.md` (nuevos)

### Tests

- Unit tests ejecutados exitosamente.

### Variables de Entorno

Ninguna nueva.

## ✨ Harness refactor: módulos + risk-rules (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: harness-refactor
> module: infra
> tags: [harness, modules, refactor, risk-policy]

### Problema

`scripts/validate-harness.js` era monolítico (989 líneas) difícil de mantener y testear. StreetMove ya había extraído la lógica en módulos reutilizables (`lib/modules/harness/`), pero el skeleton no los tenía.

### Solución Implementada

- **Módulos extraídos** en `lib/modules/harness/`: `runner.js` (process-tree-safe spawn), `status.js` (status.json I/O), `evidence.js` (evidence manifest + completion claim), `gates.js` (definición declarativa de gates), `validate.js` (orquestador), `types.js` (JSDoc types).
- **Checks** en `lib/modules/harness/checks/`: `artifacts.js` (artifact completeness), `features.js` (FEATURES.md consistency), `migrations.js` (migration journal check).
- **Risk policy** en `lib/policy/`: `risk-rules.js` (clasificación de riesgo por patrón de ruta, adaptado sin dominio StreetMove) + `risk-policy.ts` (tipos TypeScript).
- **Entry point**: `validate-harness.js` monolito se mantiene intacto por ahora (los módulos están listos para usar en refactor futuro).

### Archivos Creados

- `lib/modules/harness/runner.js`, `status.js`, `evidence.js`, `gates.js`, `validate.js`, `types.js`, `risk-policy.ts`
- `lib/modules/harness/checks/artifacts.js`, `features.js`, `migrations.js`, `index.js`
- `lib/policy/risk-rules.js`, `risk-policy.ts`

### Tests

- Harness validado con `--typecheck --lint --tests` PASS
- 204 unit tests passing; `npx tsc --noEmit` 0 errores

## ✨ Notification Inbox: UI del buzón de notificaciones (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: notification-inbox
> module: ui
> tags: [notifications, inbox, ui, badge, dropdown]

### Problema

El mecanismo de notificaciones (engine, API, DB) existía pero no había UI para que el usuario viera sus notificaciones. Faltaba el inbox page, el badge en el header, el dropdown de preview y los filtros.

### Solución Implementada

- **`app/(app)/notifications/page.tsx`**: inbox completo con header "Marcar todo como leído", filtros (Todas/No leídas), lista con `notification-item`, "Cargar más" (cursor pagination), empty/loading/error states.
- **`components/notifications/notification-badge.tsx`**: badge del header con icono Bell + contador de no leídas (poll 30s via hook).
- **`components/notifications/notification-dropdown.tsx`**: dropdown con últimas 10 notificaciones, "Marcar todo como leído", "Ver todas" → `/notifications`.
- **`components/notifications/notification-item.tsx`**: card individual de notificación con icono, título, body, timestamp, estado read/unread.
- **`components/notifications/notification-filters.tsx`**: tabs "Todas" / "No leídas" con aria-selected.
- **`components/notifications/empty-state.tsx`**: BellOff + "Sin notificaciones" reutilizable.
- **`components/layout/header-with-notifications.tsx`**: wrapper client del header del área privada + badge.

### Archivos Modificados

- `app/(app)/notifications/page.tsx` (nuevo), `components/notifications/notification-badge.tsx` (nuevo), `components/notifications/notification-dropdown.tsx` (nuevo), `components/notifications/notification-item.tsx`, `components/notifications/notification-filters.tsx` (nuevo), `components/notifications/empty-state.tsx` (nuevo), `components/layout/header-with-notifications.tsx` (nuevo), `app/(app)/layout.tsx`

### Tests

- `tests/e2e/notifications.spec.ts`: sin sesión → redirect a `/login`; con sesión → heading "Notificaciones" visible.
- Suite completa: 247 tests passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Push infrastructure: hooks + service worker + componentes de notificaciones (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: push-infra-hooks-sw
> module: dashboard
> tags: [push, pwa, notifications, hooks, service-worker, ui]

### Problema

El mecanismo push (endpoints API, schema DB, engine) ya existía (I4), pero faltaba la capa client: hooks de suscripción/inbox, service worker estático y componentes de infraestructura (registro SW, soft prompt, preferencias). Sin esto el inbox y el badge del header (I5) no tienen de dónde leer estado.

### Solución Implementada

- **`hooks/use-push-subscription.ts`** (nuevo): detecta soporte (`PushManager`), obtiene VAPID key de `/api/user/push/vapid-key`, subscribe (SW ready → `PushManager.subscribe` → POST `/api/user/push/subscription`), unsubscribe (browser + DELETE por endpoint), maneja `pushsubscriptionchange` (re-subscribe o persiste `newSubscription`). Estado: `isPushSupported`, `isSubscribed`, `permission`, `loading`.
- **`hooks/use-notifications.ts`** (nuevo): inbox client con `fetchNotifications({category?, unread?, reset?})` paginado por cursor, `fetchUnreadCount()` con polling 30s + `visibilitychange`, `markAsRead(ids)` / `markAllAsRead()` (PATCH batch), `deleteNotification(id)` (DELETE soft), `fetchPreferences()` / `updatePreference(channel, category, enabled)`. Exporta `UseNotificationsReturn` y `NotificationItem`.
- **`public/sw.js`** (nuevo): SW estático minimalista — `push` (muestra notificación con data.title/body/url), `notificationclick` (focus + navegación + POST `/api/user/push/click` fire-and-forget), `pushsubscriptionchange` (re-subscribe).
- **`components/notifications/service-worker-registrar.tsx`** (nuevo): registra `/sw.js` con scope `/` solo en producción o localhost (nunca http remoto); limpia workers viejos de `/serwist/`.
- **`components/notifications/push-soft-prompt.tsx`** (nuevo): banner no intrusivo tras 2da interacción o 30s; respeta "no mostrar de nuevo" (localStorage) y cooldown 14d tras "Ahora no"; botones Activar / Ahora no / No mostrar de nuevo.
- **`components/notifications/preference-toggles.tsx`** (nuevo): toggles canal (inbox/push) × categoría (system/account/billing/marketing/social/custom) con `Switch` de shadcn/ui; default enabled=true.
- **`lib/notifications/priority.ts`**: exporta `TYPE_ICONS` para lookup estático (satisface `react-hooks/static-components`).
- **`components/notifications/notification-item.tsx`** (scaffold I5 previo): fix lint `static-components` (lookup estático en vez de `getNotificationIcon()` en render).
- **`components/notifications/notification-badge.tsx`** (nuevo): badge del header — icono Bell + contador de no leídas (poll 30s vía hook); sin no leídas solo icono; click abre el dropdown (Popover).
- **`components/notifications/notification-dropdown.tsx`** (nuevo): dropdown del header — últimas 10 notificaciones, "Marcar todo como leído", "Ver todas" → `/notifications`, empty state.
- **`components/notifications/notification-filters.tsx`** (nuevo): tabs "Todas" / "No leídas" (rol=tablist, aria-selected).
- **`components/notifications/empty-state.tsx`** (nuevo): BellOff + "Sin notificaciones" (muted), reutilizable.
- **`app/(app)/notifications/page.tsx`** (nuevo): inbox completo — header con "Marcar todo como leído", filtros, lista (notification-item), "Cargar más" (cursor), empty/loading/error states, layout `Section`.
- **`components/layout/header-with-notifications.tsx`** (nuevo): wrapper client del header del área privada + badge; usado por `app/(app)/layout.tsx` (server).

### Archivos Modificados

- `hooks/use-push-subscription.ts` (nuevo), `hooks/use-notifications.ts` (nuevo), `public/sw.js` (nuevo), `components/notifications/service-worker-registrar.tsx` (nuevo), `components/notifications/push-soft-prompt.tsx` (nuevo), `components/notifications/preference-toggles.tsx` (nuevo), `lib/notifications/priority.ts`, `components/notifications/notification-item.tsx`, `components/notifications/notification-badge.tsx` (nuevo), `components/notifications/notification-dropdown.tsx` (nuevo), `components/notifications/notification-filters.tsx` (nuevo), `components/notifications/empty-state.tsx` (nuevo), `app/(app)/notifications/page.tsx` (nuevo), `components/layout/header-with-notifications.tsx` (nuevo), `app/(app)/layout.tsx`

### Tests

- `tests/unit/hooks/use-push-subscription.test.ts` (nuevo): mock PushManager/Notification/fetch — soporte, suscripción existente, subscribe happy-path, permiso denegado, unsubscribe, listener pushsubscriptionchange.
- `tests/unit/hooks/use-notifications.test.ts` (nuevo): mock fetch — carga inicial, paginación con cursor, reset, markRead/markAllAsRead/deleteNotification, preferencias GET/PUT, polling 30s, visibilitychange.
- `tests/e2e/notifications.spec.ts` (nuevo): sin sesión → redirect a `/login`; con sesión (signIn Auth.js + SQL real) → heading "Notificaciones" visible.
- Suite completa: 247 tests passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

- Ninguna nueva (usa `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ya documentada).

## ✨ Sync StreetMove → skeleton: audit helpers push/notifications + env VAPID + fix-problems gates (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: infra-sync-port
> module: infra
> tags: [sync, audit, push, notifications, env, workflow]

### Problema

El diff `eda408ce..HEAD` de StreetMove agrega helpers de auditoría genéricos para push/notifications, vars de entorno genéricas (VAPID, session TTL, TikTok pixel) y gates de confirmación al workflow fix-problems. El skeleton carecía de estos helpers y gates.

### Solución Implementada

- **Audit**: 7 helpers genéricos portados a `lib/audit/helpers.ts` — `auditPushSubscriptionCreated`, `auditPushSubscriptionRevoked`, `auditPushDirectSent`, `auditPushBroadcastSent`, `auditNotificationHidden`, `auditNotificationDeleted`, `auditBroadcastDeleted` (para feature I4 Push/notifications futura).
- **Env**: `.env.example` + `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `OPENCODE_ZEN_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SESSION_ACCESS_TOKEN_TTL`.
- **Workflow**: `.opencode/commands/fix-problems.md` + sección 4.5 (entry FEATURES.md para fixes Tier M/L) + sección "Commit y Push" con gate de confirmación (nunca merge/push a main).

### Archivos Modificados

- `lib/audit/helpers.ts`, `.env.example`, `.opencode/commands/fix-problems.md`, `tests/unit/audit/helpers.test.ts`

### Tests

- `tests/unit/audit/helpers.test.ts` ampliado: 13 casos (7 nuevos helpers). Suite passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

- `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `OPENCODE_ZEN_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SESSION_ACCESS_TOKEN_TTL`

### SKIP (dominio StreetMove / ya portado)

- `schema.ts` (avatarUrl ya portado; pushPreferences/notificationCategory/refresh_tokens son dominio o I4 Push), queries/auth.ts `updateUserAvatar` (ya existe), queries/index.ts (sin queries/notifications en skeleton), `lib/db/index.ts` (max:5 ya existe), `lib/utils.ts` `formatDocumentBytes` (ya existe), `next.config.mjs` (CSP frame-src + remotePatterns blob ya portados; serwist SKIP), `scripts/migrate.ts` (verificación plan_type = dominio), `package.json` (test:mutation requiere stryker; serwist/web-push/blob = I4 Push), `lib/validations/notifications.ts` (módulo inexistente en skeleton), AGENTS.md (reglas ya presentes; entries version.ts/ROADMAP.md = release-process StreetMove).

## ✨ Sync StreetMove → skeleton: session_config + TTL configurable + sesiones persistentes (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: auth-sync-port
> module: auth+db
> tags: [sync, security, session, ttl]

### Problema

El diff `eda408ce..HEAD` de StreetMove introduce TTL de sesión configurable (`session_config` + `getSessionConfig`) y cambia el patrón de sesión: JWT cookie long-lived (30 días) con la sesión DB como gate real (sliding window). El skeleton seguía con 15 min hardcodeados en dos puntos de `auth.ts`.

### Solución Implementada

- **DB**: tabla singleton `session_config` (`access_token_ttl` default 15) + migración `drizzle/0002_slippery_satana.sql` vía `db:generate`.
- **Queries**: `lib/db/queries/session-config.ts` (`getSessionConfig`/`updateSessionConfig`) con fallback env `SESSION_ACCESS_TOKEN_TTL` leído en call-time (no module-load) para testabilidad; export en lib/db/queries/index.ts.
- **auth.ts**: `validateCredentials` y sliding session del callback `jwt` leen el TTL de `session_config` con try-catch graceful (fallback 15 min si la tabla no existe). `session.maxAge` 15 min → 30 días (JWT cookie long-lived; el gate real es la sesión DB + sliding window).
- **Env**: `SESSION_ACCESS_TOKEN_TTL` documentada en `.env.example`.

### Archivos Modificados

- `lib/db/schema.ts`, `lib/db/queries/session-config.ts` (nuevo), `lib/db/queries/index.ts`, `auth.ts`, `.env.example`, `drizzle/0002_slippery_satana.sql` (nuevo)

### Tests

- `tests/unit/db/session-config.test.ts` (5 casos: fila existente, default 15, fallback env, update, upsert insert). Suite unit completa 171/171 passing; `npx tsc --noEmit` 0 errores.

### Variables de Entorno

- `SESSION_ACCESS_TOKEN_TTL` (minutos, default 15; la fila en `session_config` tiene prioridad)

### SKIP (dominio StreetMove / dead code)

- `stepUpVerifiedAt` + cookie `step_up_verified` (step-up auth inexistente en skeleton), `guardGamificationAccess` plan `TOTAL`, rutas gamification/rewards, `types/auth.ts` `avatarUrl` (ya portado).

## ✨ Push Notifications + Notification Inbox (genérico whitelabel) (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: push-notifications
> module: api+db+ui
> tags: [push, pwa, notifications, inbox]

### Problema

El skeleton no tiene notificaciones push ni inbox. El sitio público (marketing CMS) no puede comunicarse con usuarios autenticados: no hay forma de avisar eventos de cuenta (bienvenida, email verificado), ni entregar mensajes in-app persistentes, ni habilitar/deshabilitar canales desde admin. StreetMove lo resolvió con ~40 archivos, 6 tablas DB y 13 endpoints, pero con lógica de dominio fitness que no aplica a proyectos whitelabel.

### Solución Propuesta

- **DB**: 4 tablas (`notifications`, `push_subscriptions`, `push_click_events`, `notification_preferences`) + 4 enums + índices; una migración Drizzle vía `db:generate`.
- **Engine**: `lib/notifications/engine.ts` (inbox-first + dedup por `groupId` + dispatch), `events.ts`, `priority.ts` (P1-P3), `triggers.ts` (2 ejemplos: `account.welcome`, `account.email_verified`).
- **Push**: `lib/push/sender.ts` (web-push + VAPID), `preferences.ts`, `push-log.ts`; `public/sw.js`; soft-prompt + SW registrar.
- **API**: 13 endpoints (user push: subscription/vapid-key/click; user notifications: list/batch/[id]/unread-count/preferences; admin: settings GET/PUT con auditoría).
- **UI**: badge, dropdown, item, filters, preference-toggles, inbox page `app/(app)/notifications`, admin page `app/admin/notifications`.
- **Deps**: `web-push` (^3.6.7) + `@types/web-push` (dev). **Env**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server-only), `VAPID_SUBJECT`.

### Tests (requeridos)

- Unit: engine (dedup), priority, sender (404/410 → revoke), preferences, queries notifications/push, hooks.
- API: subscription, vapid-key, notifications, unread-count, preferences, admin settings — guard 401/403 + happy-path SQL real.
- E2E: `tests/e2e/notifications.spec.ts` (soft-prompt → subscribe → badge → dropdown → inbox → admin toggle).

### Out-of-Scope

Crons de dominio (plan-expiring, class-reminders), triggers fitness, rich push, email notifications, broadcast admin (v2), `push_notification_log`.

## ✨ Sync StreetMove → skeleton: hardening auth + T&C + avatar (data layer) (2026-08-21)

> status: released
> release: v0.2
> date: 2026-08-21
> change_id: streetmove-sync-port
> module: auth+db+api
> tags: [sync, security, terms, avatar]

### Problema

El skeleton está desincronizado del fuente StreetMove (SHA `82a4db38` vs última sync `eda408ce`). Entre los cambios no portados hay fixes de seguridad críticos F3/F4: `bcrypt.compare()` lanza excepción con hashes corruptos/no-bcrypt, rompiendo el login (CredentialsSignin) en vez de devolver credenciales inválidas. El fuente también incorpora capacidades genéricas whitelabel que el skeleton necesita: avatar de perfil (capa de datos), Terms & Conditions versionados, pooling `max: 5`, formateador de bytes y reglas de trabajo de migraciones/.env.

### Solución Propuesta

- **Auth hardening (crítico)**: nuevo `lib/auth/password.ts` (`isBcryptHash` + `comparePassword`, nunca lanza); `auth.ts` aplica F3/F4, propaga `avatarUrl` en JWT/session y check `requiresTermsAcceptance` graceful (mapping `phone`).
- **DB**: `users.avatar_url` + tablas `terms_versions`/`user_terms_acceptance` + relations; migración Drizzle; `lib/db/queries/terms.ts`; `updateUserAvatar()`. SKIP `planType 'TOTAL'` y `user_documents`.
- **Auditoría**: `auditAvatarUploaded/Deleted`, `auditTermsAccepted`, `auditTermsVersionPublished`.
- **Types**: `avatarUrl?` + `requiresTermsAcceptance?` en next-auth.d.ts y auth.ts.
- **Infra menor**: `pool max: 5`, `formatDocumentBytes()`, `.nvmrc`, `jest.config.js`.
- **Docs/config**: reglas "verificar columnas tras migrar" y "nunca sobrescribir .env.local"; `.env.example` merge LOOP_*; `date-utils` solo `getIsoDayOfWeek`.
- **Deps**: `@tiptap/*` + `dompurify` (rich text + XSS sanitize blog CMS).

### Solución Implementada (release v0.2 — APROBADO por @qa-release 2026-08-23)

- **Auth hardening F3/F4**: `lib/auth/password.ts` (`isBcryptHash` + `comparePassword`, nunca lanza); `auth.ts` aplica F3/F4, propaga `avatarUrl` en JWT/session y check `requiresTermsAcceptance` graceful.
- **DB**: `users.avatar_url` + tablas `terms_versions`/`user_terms_acceptance` + relations; migración `drizzle/0001_romantic_gambit.sql` (generada, pendiente de aplicar con DATABASE_URL); `lib/db/queries/terms.ts`; `updateUserAvatar()`.
- **Auditoría**: `auditAvatarUploaded/Deleted`, `auditTermsAccepted`, `auditTermsVersionPublished`.
- **Infra menor**: `pool max: 5`, `formatDocumentBytes()`, `.nvmrc`, `jest.config.js`.
- **Fix de test infra**: `playwright.config.ts` testDir "tests/e2e" → "tests" + testMatch "**/*.spec.ts" (descubre `tests/api/`; 38 fallos latentes saneados con server probe).
- **API tests auth creados**: `tests/api/auth/signin-guard.spec.ts` (400/401 + no-session) y `signin-happy.spec.ts` (SQL real + auditoría LOGIN + cleanup), con helper `helpers.ts` (serverUp + uniqueIp anti-rate-limit).

### Archivos Modificados (plan)

- `lib/auth/password.ts` (nuevo), `lib/db/queries/terms.ts` (nuevo)
- `auth.ts`, `lib/db/schema.ts`, `lib/db/queries/auth.ts`, `lib/db/queries/index.ts`, `lib/audit/helpers.ts`
- `types/next-auth.d.ts`, `types/auth.ts`, `lib/db/index.ts`, `lib/utils.ts`
- `.nvmrc`, `jest.config.js`, `AGENTS.md`, `.agents/agents.md`, `.env.example`, `lib/date-utils.ts`, `lib/api-docs/spec.ts`, `package.json`
- `drizzle/*` (migración)

### Tests (requeridos)

- `tests/unit/auth/password.test.ts` — isBcryptHash/comparePassword (hash corrupto, válido, null).
- `tests/unit/db/terms.test.ts` — requiresTermsAcceptance (is_current/is_blocking, aceptación).
- `tests/unit/audit/helpers.test.ts` — avatar + terms auditors.
- `tests/unit/` — updateUserAvatar, formatDocumentBytes, callbacks JWT/session.
- `tests/api/auth/` — 401 guard (hash corrupto) + happy-path login con SQL real. **Creados**: `signin-guard.spec.ts`, `signin-happy.spec.ts`, `helpers.ts` (re-validación iteración 2: 9/9 ACs PASS).

### Variables de Entorno

- `.env.example`: `LOOP_METRICS_FILE`, `LOOP_TIMERS_FILE`, `LOOP_REWORK_THRESHOLD` (merge). Mantiene `APP_TIMEZONE`.

## ✨ Harness Sync: mejoras genéricas desde StreetMove (2026-08-02)

> status: released
> release: v0.2
> date: 2026-08-02
> change_id: 2026-08-02-harness-improvements
> module: api
> tags: [harness, coverage, ci, tests, tooling]

### Problema

El skeleton se mantiene sincronizado con el harness de StreetMove (proyecto fuente). Al comparar el fuente con la última sync (`d2a8cb2b`), aparecieron mejoras genéricas del harness no portadas: gate de cobertura con baseline por módulo, baseline de cantidad de tests, fallback a `gh` CLI en el script de espera de CI, declaración de `engines`/`packageManager`, y una plantilla de hoja de trabajo retomable para tareas interrumpibles.

### Solución Implementada

- **Gate `--coverage`**: amplía el radar de cobertura a `app/api/`, `components/` y `hooks/` (antes solo `lib/`) y detecta regresiones >3% por módulo contra `.validation/coverage-baseline.json`. Usa `jest.coverage.config.js` (sin thresholds duros) y reporta baseline forward-looking.
- **Baseline de tests**: `validate-harness.js` registra el conteo de tests en `.validation/baseline.json` y expone `test_coverage_delta` en `.validation/status.json`. Comando de unit tests con `pipefail` + `maxBuffer` 64MB.
- **Fallback `gh` CLI**: `wait-for-ci.js` intenta `gh api` cuando GitHub API devuelve 401/403/404 sin token (repos privados autenticados vía `gh auth login`).
- **`engines`/`packageManager`** en `package.json` (node >=22, pnpm >=9).
- **`.agents/templates/task-worksheet.md`**: plantilla para tareas interrumpibles (timeout/contexto) — qué se hizo, qué queda, cómo validar. Adaptada al whitelabel (sin gates AOSE del fuente).
- **Regla de cobertura** documentada en `AGENTS.md` y `.agents/agents.md`: no reducir cobertura del módulo afectado >3% sin justificación.

### Archivos Modificados

- `scripts/validate-harness.js`
- `scripts/wait-for-ci.js`
- `jest.coverage.config.js` (nuevo)
- `package.json`
- `.agents/templates/task-worksheet.md` (nuevo)
- `AGENTS.md`
- `.agents/agents.md`
- `tests/unit/wait-for-ci.test.ts` (nuevo)
- `tests/unit/harness-baseline.test.ts` (nuevo)

### Tests

- `tests/unit/wait-for-ci.test.ts` — 22 tests (fallback gh CLI + regresión de API checks).
- `tests/unit/harness-baseline.test.ts` — 10 tests (extractTestCount, delta de tests, regresión de cobertura).

### Variables de Entorno

Ninguna nueva.

## ✨ Marketing CMS: páginas de marketing genéricas editables desde admin (2026-08-08)

> status: released
> release: v0.1
> date: 2026-08-08
> change_id: marketing-cms
> module: admin+api+db+ui
> tags: [cms, marketing, cache, admin, migration]

### Problema

El sitio público del skeleton es solo placeholders (login, register, home estática). Cada cliente whitelabel necesita landing pages, blog, catálogo y páginas informativas editables sin tocar código, y no existe CMS, layout público (header/footer) ni tablas de contenido de marketing.

### Cambios de DB Implementados (Fase 1 · @db-engineer, 2026-08-09)

- **Schema**: +2 enums (`marketing_status`, `marketing_block_type`), +6 tablas (`marketing_pages`, `marketing_sections`, `marketing_posts`, `marketing_products`, `marketing_categories`, `marketing_settings`), relations Drizzle, índices `(page_id, sort_order)` y `(category_id)`, FK sections→pages `onDelete cascade`, products→categories `onDelete set null`, slugs UNIQUE.
- **Migración**: `drizzle/0000_narrow_puff_adder.sql` generada con `pnpm run db:generate` (baseline completo del repo: 10 tablas). drizzle/meta/_journal.json cronológico (idx 0). Sin SQL a mano ni custom SQL.
- **Queries**: `lib/db/queries/marketing/` (pages, sections, posts, products, categories, settings) — puras sin caché; `getPageBySlug` batched (sin N+1); `reorderSections` batch con paso 1024; productos con left join a categoría; `price` documentado como string (numeric pg).
- **Tests unit**: `tests/unit/marketing/schema.test.ts` + `queries.test.ts` — 44 tests verdes.
- Docs: documentación de migración y plan de DB.

### Solución Propuesta

- 6 tablas nuevas (`marketing_pages`, `marketing_sections`, `marketing_posts`, `marketing_products`, `marketing_categories`, `marketing_settings`) con 10 block types (hero, features_grid, pricing, testimonials, cta_banner, faq, contact_form, stats, product_grid, blog_list) validados con Zod.
- Rutas públicas renderizadas desde DB con `unstable_cache` + `revalidateTag` (tags `pages:${slug}`, `posts`, `products`, `settings`, `navigation`; TTL fallback 300s).
- Admin panel `/admin/marketing/` (pages + editor de secciones con reorder, blog, products + categories, settings) protegido con `validateAdmin` + auditoría.
- Cero dependencias nuevas (Next.js nativo + Drizzle + UI kit existente).

### Archivos Modificados (plan)

- `lib/db/schema.ts`, `lib/db/queries/` — tablas y queries marketing
- `lib/marketing/` — schemas Zod, cache helpers, reserved-slugs
- `app/(public)/layout.tsx`, `app/(public)/page.tsx`, `app/(public)/blog/*`, `app/(public)/shop/*`, `app/(public)/[slug]/page.tsx`
- `components/marketing/blocks/*` — 10 componentes de bloque
- `app/api/public/*`, `app/api/admin/marketing/*`
- `app/admin/marketing/*` — CRUD UI

### Tests (plan)

- `tests/unit/marketing/` — schemas Zod, queries, cache/revalidate, slugs reservados, reorder
- `tests/api/admin/marketing/` — guards 401/403
- `tests/api/*-happy.spec.ts` — happy-path con SQL real por endpoint
- `tests/e2e/` — 1 público (home desde DB + navegación) + 1 admin (crear/publicar/verificar)

### Cambios de App/Dashboard Implementados (Fase 2-3 · @app-engineer, 2026-08-09)

- **Schemas Zod** (`lib/marketing/schemas/`): 10 block types + entidades (page/post/product/category/settings/contact). Anti-XSS: se prohíben esquemas `javascript:`/`data:`/`vbscript:` en href e imágenes (solo http(s)); `parseBlockConfig` para validación/registry.
- **Cache** (`lib/marketing/cache.ts`): `unstable_cache` + tags (`pages:${slug}`, `posts`, `products`, `settings`, `navigation`) + TTL 300s; `invalidateForEntity` y `revalidateMarketing` (firma Next 16 `revalidateTag(tag, { expire })`).
- **Reserved slugs**: `lib/marketing/reserved-slugs.ts` (login, register, admin, api, blog, shop, dashboard, settings, home) + `isReservedSlug()`.
- **UI wrappers**: `aspect-ratio`, `separator`, `navigation-menu` (Radix) y `carousel` (embla, accesible, con `orientation` en contexto).
- **10 blocks** (`components/marketing/blocks/`): hero, features_grid, pricing, testimonials (carousel), cta_banner, faq, contact_form (client, POST `/api/public/contact`), stats, product_grid y blog_list (client, consumen la API pública cacheada para poder renderizarse también en el preview admin con un solo renderer). Estados loading/empty/error (`block-states.tsx`); error en preview admin con `showErrors`.
- **Layout público** (`components/layout/`): `header.tsx` (client, nav desktop con navigation-menu + drawer móvil vaul, fallback mínimo si CMS vacío), `footer.tsx`, `nav-menu.tsx`.
- **Rutas públicas**: `app/(public)/layout.tsx` con header/footer dinámicos desde `getCachedNavigation`; page.tsx renderiza `home` desde DB con fallback al hero estático; app/(public)/[slug]/page.tsx (reserved → notFound + `generateMetadata`); app/(public)/blog/page.tsx, app/(public)/blog/[slug]/page.tsx (contenido tipográfico validado con Zod), app/(public)/shop/page.tsx, app/(public)/shop/[slug]/page.tsx; `loading.tsx` con `BlockSkeleton`.
- **API pública** (`app/api/public/`): `pages/[slug]`, `posts`, `posts/[slug]`, `products`, `products/[slug]`, `settings/navigation` (GET cacheadas con `Cache-Control: public, s-maxage=300`) y `contact` (POST, Zod + rate limit `checkPublicRateLimit`).
- **Seed local**: `scripts/seed-marketing.ts` (`pnpm run seed:marketing`) — home publicada con 4 secciones, settings, categoría + 2 productos, 2 posts.
- **API docs**: `lib/api-docs/paths/public-marketing.ts` + lib/api-docs/schemas/marketing.ts compuestos en `spec.ts` (tag `Marketing Public`).

### Tests (Fase 2-3)

- `tests/unit/marketing/schemas.test.ts` — 10 blockTypes válidos/inválidos + entidades + anti-XSS (47 tests con cache.test.ts)
- `tests/unit/marketing/cache.test.ts` — tags/TTL correctos, `invalidateForEntity`, `revalidateMarketing`, defaults de navigation
- `tests/api/public/marketing-happy.spec.ts` — happy-path con SQL real de endpoints públicos (requiere seed + servidor; data-dependent tests se skipean si no hay seed)

### Cambios de Admin Implementados (Fase 4 · @admin-engineer, 2026-08-09)

- **API admin** (`app/api/admin/marketing/`, 12 rutas): CRUD de `pages`, `pages/[id]` (con secciones), `sections` (POST add / PUT reorder con paso 1024), `sections/[sectionId]` (PATCH/DELETE), `blog`, `blog/[id]`, `products`, `products/[id]`, `categories`, `categories/[id]`, `settings` (GET/PATCH upsert por key), `revalidate` (tags whitelist). Todas con `guardAdmin` server-side + auditoría (`auditCreate/Update/Delete`, `auditAdminAction` para revalidate) + Zod en body + `invalidateForEntity`/`revalidateMarketing` tras mutaciones.
- **Home guard**: no renombrar ni borrar la página `home` publicada si es la única publicada (400).
- **Config de bloque validada** contra `BLOCK_TYPE_REGISTRY` en POST/PATCH de secciones (400 si shape inválido).
- **Slug checks**: reservados (`isReservedSlug` → 400) y duplicados (409).
- **Admin UI** (`app/admin/marketing/` + `components/admin/marketing/`): layout con sidebar (Pages/Blog/Products/Categories/Settings), listados con Table + Badge estado + publish/unpublish + AlertDialog delete; Stack Builder de página (Tabs Editar/Preview, preview con `<BlockRenderer showErrors>`), `section-stack` con DnD nativo HTML5 + botones up/down, `section-editor` + `section-type-forms/` (10 forms por blockType sobre primitivas compartidas), `post-editor` (bloques heading/paragraph/list), `product-editor` (categorías en Select), `category-manager`, `settings-form` (siteName/logo/navLinks/footerLinks). Feedback con Sonner.
- **Hook** `hooks/use-admin-fetch.ts`: fetch con loading/error/reload compliant con `react-hooks/set-state-in-effect`.
- **API docs**: `lib/api-docs/paths/admin-marketing.ts` (14 paths) + schemas admin en lib/api-docs/schemas/marketing.ts, compuestos en `spec.ts` con tag `Marketing Admin`.

### Tests (Fase 4)

- `tests/api/admin/marketing/guard.spec.ts` — 401 (sin sesión) y 403 (sesión USER) en los 26 endpoints admin
- `tests/api/admin/marketing/pages-happy.spec.ts` — CRUD páginas + secciones + reorder + home guard + 409/400 + revalidate (SQL real)
- `tests/api/admin/marketing/blog-happy.spec.ts` — CRUD posts + content inválido 400 + 409 (SQL real)
- `tests/api/admin/marketing/products-happy.spec.ts` — CRUD categorías + productos + FK SET NULL al borrar categoría (SQL real)
- Helper `tests/api/admin/marketing/helpers.ts` — crea usuarios ADMIN/USER (bcrypt+pg), sesión Auth.js (csrf+callback), cleanup hermético por test

### Variables de Entorno

Ninguna nueva.

### QA Release (2026-08-09 · @qa-release) — ⚠️ REJECTED

> Validación realizada por @qa-release.

- **AC PASS**: AC1 DB+unit tests (88 unit marketing, 123 total verdes), AC2 API pública+caché (unstable_cache + tags + TTL 300), AC3 API admin protegida (guardAdmin + auditoría + Zod, 12 rutas), AC6 invalidación (revalidateTag + revalidate manual).
- **AC FAIL**: AC4 rutas públicas sin E2E (`tests/e2e/` vacío), AC5 admin panel sin E2E admin, AC7 contact sin test 429 rate limit, AC8 build falla en prerender público sin `DATABASE_URL` (layout introdujo dependencia de DB en build para páginas antes estáticas; `RESEND_API_KEY` es fallo pre-existente del baseline auth).
- **Cobertura**: lib 93.9%, gate `--coverage` PASS (sin regresión >3%).
- **Acciones para aprobar**: crear `tests/e2e/marketing-public.spec.ts` + `marketing-admin.spec.ts`, test 429 en contact, opcional fallback del layout si DB no responde, y re-ejecutar harness `--all` con `DATABASE_URL` real (api_integration).

## ✨ API endpoints push notifications + inbox (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: push-notifications-api
> module: api
> tags: [push, notifications, inbox, api, admin]

### Problema

El skeleton no tenía endpoints para push subscriptions (Web Push/VAPID), inbox de notificaciones ni settings globales. El diseño (`push-notifications-design.md` §4) define 13 endpoints contract-first; faltaba la capa API.

### Solución Implementada

- **User push** (guardUser + ACTIVE explícito): `GET /api/user/push/vapid-key` (200 `{publicKey}`, 503 controlado si VAPID no configurado), `POST/DELETE /api/user/push/subscription` (upsert por userId+endpoint / revoke, rate limit por IP, auditoría push), `POST /api/user/push/click` (CTR, rate limit).
- **User notifications** (guardUser + ACTIVE): `GET /api/user/notifications` (cursor pagination + filtros category/unread + `{items,nextCursor,unread}`), `PATCH` batch mark-read, `PATCH/DELETE /api/user/notifications/[id]` (mark single / soft delete + audit NOTIFICATION_HIDDEN), `GET unread-count`, `GET/PUT preferences` (upsert UNIQUE userId+channel+category).
- **Admin** (guardAdmin + auditoría): `GET/PUT /api/admin/notifications/settings` — toggles `pushEnabled`/`inboxEnabled` persistidos en `marketing_settings` (keys `notifications.*`), default pushEnabled = VAPID configurado, revalidateTag(`settings`).
- **Queries nuevas** en `lib/db/queries/notifications.ts`: `setNotificationsRead` (batch read/unread), `getNotificationPreferences`, `upsertNotificationPreference`.
- **Validaciones** `lib/validations/notifications.ts`: subscribe, unsubscribe, click, query, markRead, markSingleRead, params uuid, preference, admin settings.
- **api-docs**: 13 endpoints en `lib/api-docs/paths/notifications.ts` + schemas en lib/api-docs/schemas/notifications.ts.

### Archivos Modificados

- app/api/user/push/vapid-key/route.ts, app/api/user/push/subscription/route.ts, app/api/user/push/click/route.ts (nuevos)
- `app/api/user/notifications/route.ts`, `app/api/user/notifications/[id]/route.ts`, app/api/user/notifications/unread-count/route.ts, app/api/user/notifications/preferences/route.ts (nuevos)
- `app/api/admin/notifications/settings/route.ts` (nuevo)
- `lib/validations/notifications.ts` (nuevo), `lib/db/queries/notifications.ts` (3 queries nuevas)
- `lib/api-docs/paths/notifications.ts`, `lib/api-docs/schemas/notifications.ts`, `lib/api-docs/spec.ts`

### Tests

- `tests/api/user/notifications.spec.ts` — 401 sin sesión (5 endpoints) + happy-path SQL real (lista, unread-count, mark-read, soft-delete, preferencias) con skip graceful sin DB.
- `tests/api/admin/notifications/settings.spec.ts` — 401/403 + PUT happy-path con auditoría (skip graceful sin DB).
- Suite unit 231 tests passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ya documentadas en `.env.example`; `vapid-key` devuelve 503 si faltan)

## ✨ SUPER_ADMIN — Endpoints + UI de plataforma (2026-09-27)

> status: in-progress
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+api+ui
> tags: [roles, rbac, super-admin, security, audit, ui, api]

### Problema

Fase A (DB) y Fase B (auth) del rol SUPER_ADMIN estaban listas (enum, guards, role-utils, audit helpers), pero faltaban los endpoints exclusivos de plataforma y la UI para gestionar admins.

### Solución Implementada

- **`POST /api/admin/users/[id]/promote` (MOD)**: `guardAdmin` → `guardSuperAdmin`; auditoría `auditUpdate` → `auditAdminPromoted` (ADMIN_PROMOTED). Breaking intencional: un ADMIN ya no promueve (AC-01).
- **`POST /api/admin/users/[id]/demote` (NUEVO)**: `guardSuperAdmin`; 400 self-demote / target SUPER_ADMIN / target USER; 404 inexistente; `canAssignRole` verificado; transaccional (`demoteUser` valida invariante ≥1 SUPER_ADMIN activo dentro de la transacción, D5); audita `ADMIN_DEMOTED`.
- **`GET /api/admin/admins` (NUEVO)**: `guardSuperAdmin`; lista role ADMIN/SUPER_ADMIN con `?search=` ILIKE.
- **`GET /api/admin/audit-logs` (NUEVO)**: `guardSuperAdmin`; paginado (`page`/`pageSize` ≤100) + filtros `actionType`/`userId`; logs con usuario asociado (userEmail).
- **`GET /api/admin/academies` (NUEVO)**: `guardSuperAdmin`; lista TODAS las academias con owner + `memberCount`/`rubricCount` (visibilidad global, D6).
- **Queries** `lib/db/queries/padel/super-admin.ts`: `listAdmins`, `demoteUser` (transaccional), `countActiveSuperAdmins`, `listAuditLogsPaginated`, `listAllAcademies`. Lógica pura `lib/padel/super-admin.ts`: `assertNotLastSuperAdmin`.
- **UI**: `/admin/admins` (validateSuperAdmin) + `components/admin/admins/admin-list.tsx` (tabla con demote + confirmación); `/admin/platform` read-only (counts globales, D7); nav en `app/admin/layout.tsx` con links Admins/Plataforma solo para SUPER_ADMIN.

### Archivos Modificados

- `app/api/admin/users/[id]/promote/route.ts` (MOD), `app/api/admin/users/[id]/demote/route.ts` (NUEVO)
- `app/api/admin/admins/route.ts`, `app/api/admin/audit-logs/route.ts`, `app/api/admin/academies/route.ts` (NUEVOS)
- `lib/db/queries/padel/super-admin.ts`, `lib/padel/super-admin.ts` (NUEVOS), `lib/db/queries/padel/index.ts` (MOD)
- `app/admin/admins/page.tsx`, `app/admin/platform/page.tsx`, `components/admin/admins/admin-list.tsx` (NUEVOS), `app/admin/layout.tsx` (MOD)
- `lib/api-docs/paths/super-admin.ts`, `lib/api-docs/schemas/super-admin.ts` (NUEVOS), `lib/api-docs/spec.ts` (MOD), `lib/api-docs/paths/padel.ts` (MOD promote)

### Tests

- `tests/api/admin/promote-super-admin.spec.ts` — happy-path SQL real (role ADMIN + ADMIN_PROMOTED) + guards 401/403.
- `tests/api/admin/demote-super-admin.spec.ts` — happy-path SQL real (role USER + ADMIN_DEMOTED) + 400 self/SUPER_ADMIN/USER + 404 + guards.
- `tests/api/admin/admins-list.spec.ts` — happy-path SQL real (lista ADMIN/SUPER_ADMIN, no USER, search) + guards.
- `tests/api/admin/audit-logs.spec.ts` — happy-path SQL real (paginación + filtros actionType/userId + userEmail) + guards.
- `tests/api/admin/academies-global.spec.ts` — happy-path SQL real (academia con owner + métricas) + guards.
- `tests/unit/padel/super-admin.test.ts` — `assertNotLastSuperAdmin` (count 0/1 bloquea, >1 permite).

### Variables de Entorno

Ninguna nueva.

## ✨ Tech Debt — Cobertura unit tests >70% en triggers, enrollments y admin-users (2026-09-28)

> status: released
> release: v0.7
> date: 2026-09-28
> change_id: coverage-unit-tests-2026-09-28
> module: dashboard
> tags: [tests, coverage, tech-debt, unit]

### Problema

Tres archivos de unit tests no alcanzaban >70% en todas las métricas (statements, branches, functions, lines): `triggers.test.ts` (50% functions), `enrollments.test.ts` (89% functions, 86% branches) y `admin-users.test.ts` (83% functions, 77% branches).

### Solución Implementada

- `triggers.test.ts`: tests para `triggerWelcome` y `triggerEmailVerified` (payload P2/P3, category account, CTA, dedup null).
- `enrollments.test.ts`: tests para `listStudentCourses` y `listCourseStudents`; ramas de fallback en `getStudentCourseDetail` (rúbrica/criterio/nivel ausentes → null, evaluación sin scores → []).
- `admin-users.test.ts`: tests para `getPlayerById` (existe + anti-IDOR null); se agregó `.limit` al mock chain de `@/lib/db` que faltaba.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `tests/unit/notifications/triggers.test.ts` | 🔧 Modificado — +4 tests |
| `tests/unit/db/enrollments.test.ts` | 🔧 Modificado — +4 tests |
| `tests/unit/db/admin-users.test.ts` | 🔧 Modificado — +2 tests, fix mock chain |

### Tests

Los 3 archivos pasan a 100% en statements/branches/functions/lines. Suite completa: 44 suites, 544 tests pasando. `npx tsc --noEmit` sin errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Tech Debt — E2E Tests Etapa 4 (evaluation-version, student-evolution, course-students) (2026-09-28)

> status: released
> release: v0.4
> date: 2026-09-28
> change_id: etapa4-e2e-tests-2026-09-28
> module: dashboard
> tags: [tests, e2e, tech-debt, etapa4, g6, g7, g12]

### Problema

El roadmap (`production_artifacts/2026-09-28-roadmap/roadmap.md` §3) detectó que Etapa 4 (G6 versionado, G7 evolución, G12 gestión de alumnos) figuraba released pero sus 3 E2E navegables no existían en `tests/e2e/`, violando el gate `tests` de features UI.

### Solución Implementada

- `tests/e2e/evaluation-version.spec.ts` — coach publica 2 evaluaciones (misma studentId+rubricId) → v1 y v2; badge v2 en evaluation-card del alumno; serie de versiones; historial del coach.
- `tests/e2e/student-evolution.spec.ts` — alumno con evaluaciones ve heading "Mi evolución" + categorías con trend indicator; alumno sin evaluaciones ve empty state; link /evolucion en bottom-nav.
- `tests/e2e/course-students.spec.ts` — coach abre curso → tab Alumnos → modal búsqueda → agregar alumno → verificar en lista → remover (confirm + DELETE 200) → desaparece.
- Setup/cleanup con SQL real (usuarios bcrypt, rúbrica con criterio/niveles/descriptors, curso, evaluaciones publicadas v1/v2); helpers `serverUp()` y `signIn()` compartidos.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `tests/e2e/evaluation-version.spec.ts` | ✨ Nuevo — 1 test |
| `tests/e2e/student-evolution.spec.ts` | ✨ Nuevo — 3 tests |
| `tests/e2e/course-students.spec.ts` | ✨ Nuevo — 1 test |

### Tests

Los 3 archivos parsean (`--list`: 1+3+1 tests) y pasan `npx tsc --noEmit` sin errores.

### Hallazgo (BUG-E2E-01)

`GET /api/evaluations/series` no existe (404): las queries `listEvaluationSeries`/`listStudentEvaluationSeries` están implementadas pero los route handlers nunca se crearon. El test de serie fallará en runtime hasta implementarlos. Detalle en `production_artifacts/2026-09-28-etapa4-e2e-tests/repair-report.md`.

### Variables de Entorno

Ninguna nueva.

## ✨ Fix BUG-E2E-01 — Route handler GET /api/evaluations/series (2026-09-28)

> status: released
> release: v0.4
> date: 2026-09-28
> change_id: fix-evaluations-series-route-2026-09-28
> module: dashboard
> tags: [api, fix, etapa4, g6, route-handler]

### Problema

`GET /api/evaluations/series` retornaba 404: la query `listEvaluationSeries` existía en `lib/db/queries/padel/evaluations.ts` (L298) pero el route handler nunca se creó (BUG-E2E-01, `production_artifacts/2026-09-28-etapa4-e2e-tests/repair-report.md`).

### Solución Implementada

- Nuevo `app/api/evaluations/series/route.ts`: `GET` con query params `studentId`/`rubricId` validados con Zod (uuid), `guardAdmin`, llama `listEvaluationSeries(teacherId, studentId, rubricId)` y retorna `{ series }`.
- Anti-IDOR a nivel query: `listEvaluationSeries` scopa por `teacherId` de la sesión → alumno/rúbrica ajenos retornan `[]` (no 404, no leak).
- `lib/api-docs/spec.ts`: path `/api/evaluations/series` + schema `EvaluationSeriesItem`.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `app/api/evaluations/series/route.ts` | ✨ Nuevo — GET guardAdmin + Zod + listEvaluationSeries |
| `lib/api-docs/paths/padel.ts` | 🔧 Modificado — path `/api/evaluations/series` |
| `lib/api-docs/schemas/padel.ts` | 🔧 Modificado — schema `EvaluationSeriesItem` |
| `tests/api/padel/guard.spec.ts` | 🔧 Modificado — +401 sin sesión, +403 USER |
| `tests/api/padel/evaluation-series-happy.spec.ts` | ✨ Nuevo — happy-path SQL real (v1/v2, 400, anti-IDOR []) |

### Tests

- `npx tsc --noEmit` sin errores.
- `npx playwright test tests/e2e/evaluation-version.spec.ts --list` parsea (1 test).
- Happy-path `evaluation-series-happy.spec.ts` sigue el patrón de `evaluations-happy.spec.ts` (SQL real contra NeonDB; skip graceful sin `DATABASE_URL`). Guard tests 401/403 añadidos.

### Variables de Entorno

Ninguna nueva.

## ✨ G13 — Trigger evaluation.read para Métrica Pádel (2026-09-28)

> status: released
> release: v0.4
> date: 2026-09-28
> change_id: g13-evaluation-read-trigger-2026-09-28
> module: dashboard
> tags: [api, notifications, g13, trigger, padel]

### Problema

Cuando un alumno lee una evaluación publicada, el coach no recibía notificación. El engine de notificaciones ya existía pero no había trigger para el evento `evaluation.read`.

### Solución Implementada

- `lib/notifications/triggers.ts`: nuevo `triggerEvaluationRead(teacherId, evaluationId)` — category `system`, priority `P2` (informativa), type `info`, `groupId = evaluationId` para dedup 1h del engine (re-leer no duplica).
- `lib/db/queries/padel/evaluations.ts`: `markEvaluationRead` ahora retorna `{ evaluation, firstRead } | null`. Detecta la primera lectura de forma atómica (UPDATE condicionado a `readAt IS NULL` + fallback SELECT para re-lectura idempotente sin romper el 404).
- `app/api/student/evaluations/[id]/read/route.ts`: tras `markEvaluationRead`, si `firstRead` y existe `teacherId`, dispara `triggerEvaluationRead`. La respuesta al alumno no cambia.

### Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `lib/notifications/triggers.ts` | 🔧 Modificado — +`triggerEvaluationRead` |
| `lib/db/queries/padel/evaluations.ts` | 🔧 Modificado — `markEvaluationRead` retorna `{ evaluation, firstRead }` |
| `app/api/student/evaluations/[id]/read/route.ts` | 🔧 Modificado — trigger en primera lectura |
| `tests/unit/notifications/triggers.test.ts` | 🔧 Modificado — +2 tests `triggerEvaluationRead` |
| `tests/unit/db/evaluations.test.ts` | 🔧 Modificado — tests `markEvaluationRead` adaptados a `firstRead` |
| `tests/api/padel/evaluation-read-happy.spec.ts` | ✨ Nuevo — happy-path SQL real (notificación al coach + dedup re-lectura) |

### Tests

- Unit: `triggerEvaluationRead` verifica payload P2/system + groupId; `markEvaluationRead` cubre firstRead=true/false/null.
- API happy-path con SQL real: crear rúbrica → evaluación → publish → leer como alumno → verifica notificación `info/P2/system` para el coach con `group_id = evaluationId`; re-leer no duplica (dedup).
- `npx tsc --noEmit` y `pnpm run test:unit` pasan.

### Variables de Entorno

Ninguna nueva.
