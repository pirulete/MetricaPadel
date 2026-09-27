# Technical Design — SPEC-EPIC-01: Administrador de Academia & Branding Institucional

> status: in-progress
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: admin+api+db+ui
> tags: [multi-tenancy, branding, pdf, roles, rubrics, migration, upload]

## 1. Decisiones de diseño (con justificación)

### D1 — Librería PDF: `@react-pdf/renderer` (server-side, `renderToBuffer`)
| Opción | Radar 6 dims | Logo SVG | Layout declarativo | Riesgo React 19 | Peso |
|--------|-------------|----------|--------------------|-----------------|------|
| `@react-pdf/renderer` | SVG nativo (`<Svg><Polygon>`) | `<Image>`/`<Svg>` | Alto (JSX) | Peer dep (pin v4.x compatible) | Alto (server-only) |
| `pdf-lib` | `drawPolygon` manual | PNG ok, SVG requiere conversión | Bajo (código manual) | Ninguno | Bajo |
| `jspdf` | Manual | Manual | Bajo | Ninguno | Medio |

**Decisión**: `@react-pdf/renderer`. Es la recomendación del spec, cubre radar + logo + firma con JSX declarativo y corre server-only en el route handler (cero impacto en bundle client). **Mitigación**: spike temprano (release-scope ya lo pide) — si el peer dep bloquea con React 19, fallback a `pdf-lib` con `lib/padel/radar.ts` (función pura de polígono, ya diseñada para ser agnóstica del renderer). El radar se computa en `lib/padel/radar.ts` (puro, unit-testable) y el renderer solo dibuja.

### D2 — Storage de logo: **data-URL en DB** (columna `logoUrl`), NO filesystem
| Opción | Vercel serverless | Dep nueva | Env var nueva | Atomicidad |
|--------|-------------------|-----------|---------------|------------|
| `public/uploads/` | **Ephemeral + read-only** — logos se pierden en redeploy, no compartidos entre instancias | No | No | No |
| data-URL en DB | Funciona (logo viaja con la fila) | No | No | Sí (misma transacción) |
| Vercel Blob | Funciona | `@vercel/blob` | `BLOB_READ_WRITE_TOKEN` | No |

**Decisión**: data-URL en DB. El spec recomendaba filesystem, pero el proyecto deploya en Vercel (serverless) donde `public/uploads/` es efímero — sería un bug de producción. Data-URL: cero deps nuevas, cero env vars, el PDF embebe el logo directo desde la fila, y el `<img src={dataUrl}>` funciona en UI. Límite 2MB validado server-side + sanitización SVG (DOMPurify ya está en deps) + dims ≤1024×1024. `logoUrl` acepta data-URL o URL externa (futuro-proof).

### D3 — Impacto de `academyId` en queries existentes: **extensión aditiva, sin romper retrocompatibilidad**
- `rubrics.academyId` nullable FK `set null` + `scope` enum default `personal`. Rúbricas personales existentes: `academyId = null`, `scope = personal` → queries actuales por `ownerId` siguen funcionando **sin cambios de contrato**.
- `getRubricById(ownerId, id)`: si `scope === 'institutional'`, el acceso se valida por membresía activa (COACH+) en `rubric.academyId`; si no, fallback al check `ownerId` actual.
- `updateRubric`/`archiveRubric`: si institucional, mutación solo OWNER/ADMIN de la academia (403 para COACH); si personal, check `ownerId` actual.
- `listRubrics`: filtro `scope` opcional; institucional visible a miembros de la academia.
- **Evaluaciones**: NO se agrega `academyId` a `evaluations` ni a `courses`. La academia para branding PDF se resuelve por prioridad: (1) `evaluation.rubric.academyId` si la rúbrica es institucional, (2) primera membresía activa del teacher. Esto cumple RF-04 ("curso con academia o profesor pertenece a una") sin tocar courses.

### D4 — Roles: **tabla `academy_memberships`**, `user_role` global intacto
Confirmado el approach del spec: `user_role` (USER/ADMIN) no se toca → guards existentes (`guardAdmin`, `guardUser`) intactos. El rol por academia vive en `academy_memberships.role` (`OWNER`/`ADMIN`/`COACH`). El ADMIN global que crea la academia se inserta como OWNER. Multi-academia: UNIQUE (academyId, userId) permite N membresías por usuario.

### D5 — Guard de rúbricas institucionales: **guards DB-backed en `lib/auth/academy-guard.ts`**
Nuevos guards async que consultan `academy_memberships` (patrón `guardAdmin` → `NextResponse | null`):
- `guardAcademyOwner(session, academyId)` — rol OWNER (mutaciones críticas: DELETE academia, remover OWNER).
- `guardAcademyAdmin(session, academyId)` — OWNER o ADMIN (editar branding, invitar, crear rúbrica institucional, remover miembro).
- `guardAcademyCoach(session, academyId)` — OWNER/ADMIN/COACH activos (lectura: listar miembros, listar rúbricas institucionales).
- Anti-IDOR: membresía inexistente o academia archivada → 404 (no 403). COACH autenticado con membresía pero sin permiso de mutación → 403.

## 2. Impacto por capa

| Capa | Impacto |
|------|---------|
| **DB** | Migración `0008_*`: enums `academy_membership_role`, `rubric_scope`, `academy_status`; tablas `academies`, `academy_memberships`; columnas `rubrics.academyId`, `rubrics.scope`; índices. Aditivo, sin backfill destructivo. |
| **Auth** | `lib/auth/academy-guard.ts` nuevo (3 guards + helper `getAcademyMembership`). `user_role` intacto. Invitación crea usuario TEMPORARY (patrón G4) o reutiliza existente. `protected-routes.ts` documenta guards. |
| **API** | 9 route handlers nuevos + 1 modificado (`rubrics/[id]`). Contratos en §3. Auditoría en todas las mutaciones. |
| **UI** | `app/(app)/academias` (lista + detalle con tabs branding/miembros/rúbricas), botón "Exportar PDF" en detalle de evaluación. 7 componentes nuevos en `components/padel/`. |
| **Tests** | Unit: schemas, radar, logo, guards, queries. API: happy-path SQL real por endpoint + guards 401/403/404/409. E2E: 1 flujo navegable completo. |
| **Env vars** | **Ninguna nueva** (data-URL evita BLOB token; react-pdf no requiere env). `.env.example` sin cambios. |
| **API docs** | `lib/api-docs/paths/academies.ts` + `schemas/academies.ts` nuevos, importados en `spec.ts`. |

## 3. Contratos API (contract first)

### Academias
**`POST /api/academies`** (guardAdmin) → `201 { academy }` | `400` | `409` (slug duplicado)
```ts
Body: { name: string(1-200), slug: string(/^[a-z0-9-]{3,50}$/), primaryColor?: string(/^#[0-9A-Fa-f]{6}$/) }
```
**`GET /api/academies`** (guardUser) → `200 { academies: AcademyDto[] }` — academias donde el usuario es miembro activo (cualquier rol) o owner.

**`GET /api/academies/[id]`** (guardUser + membresía activa) → `200 { academy }` | `404` (anti-IDOR)

**`PUT /api/academies/[id]`** (guardAcademyAdmin) → `200 { academy }` | `400` | `404`. Body: partial `{ name?, slug?, primaryColor? }`. Audita UPDATE.

**`DELETE /api/academies/[id]`** (guardAcademyOwner) → `200 { academy: { id, status: 'archived' } }` | `400` (último OWNER) | `404`. Soft archive. Audita DELETE.

**`POST /api/academies/[id]/logo`** (guardAcademyAdmin) → `200 { academy }` | `400` (MIME/tamaño/dims inválidos) | `404`. `multipart/form-data`, campo `file`, SVG/PNG ≤2MB, dims ≤1024×1024, SVG sanitizado. Audita UPDATE (logo).

### Miembros
**`POST /api/academies/[id]/members/invite`** (guardAcademyAdmin) → `201 { membership }` | `400` | `404` | `409` (ya miembro)
```ts
Body: { email: string(email) }
```
Crea usuario TEMPORARY con password generado (patrón G4) si no existe; crea membresía `pending`; dispara `triggerAcademyInvite` (inbox). Audita CREATE.

**`POST /api/academies/[id]/members/[userId]/accept`** (guardUser, solo self) → `200 { membership }` | `404`. Marca `active`. Audita UPDATE.

**`GET /api/academies/[id]/members`** (guardAcademyCoach) → `200 { members: MemberDto[] }` (user + role + status).

**`DELETE /api/academies/[id]/members/[userId]`** (guardAcademyAdmin) → `200 { membership: { id, status: 'removed' } }` | `400` (último OWNER) | `404`. Soft remove. Audita DELETE.

### Rúbricas institucionales
**`GET /api/academies/[id]/rubrics`** (guardAcademyCoach) → `200 { rubrics: RubricDto[] }` — solo `scope: institutional` de esa academia.

**`POST /api/academies/[id]/rubrics`** (guardAcademyAdmin) → `201 { rubric }` | `400` | `404`. Body: `rubricCreateSchema` (scope forzado `institutional`, academyId = ruta). Audita CREATE.

**`PUT /api/rubrics/[id]`** (modificado) → guard extendido: institucional requiere OWNER/ADMIN de la academia; COACH → `403`. Audita UPDATE.

**`DELETE /api/rubrics/[id]`** (modificado) → guard extendido idem; COACH → `403`. Audita DELETE.

### PDF
**`GET /api/evaluations/[id]/pdf`** (guardUser + ACTIVE; teacher o student de la evaluación) → `200 application/pdf` | `400` (draft) | `404`. Sin auditoría (lectura). Content-Disposition `attachment; filename="evaluacion-{id}.pdf"`.

## 4. Esquema DB (migración `0008_*`)

```ts
// enums
academyMembershipRoleEnum = pgEnum('academy_membership_role', ['OWNER', 'ADMIN', 'COACH'])
rubricScopeEnum = pgEnum('rubric_scope', ['personal', 'institutional'])
academyStatusEnum = pgEnum('academy_status', ['active', 'archived'])

// academies
id uuid PK defaultRandom
name varchar(200) notNull
slug varchar(50) notNull unique
logoUrl varchar(2000) nullable          // data-URL o URL externa
primaryColor varchar(7) notNull default '#16a34a'
ownerId uuid FK users onDelete no action notNull
status academy_status default 'active'
createdAt / updatedAt
// índices: unique slug, academies_owner_idx

// academy_memberships
id uuid PK defaultRandom
academyId uuid FK academies onDelete cascade notNull
userId uuid FK users onDelete no action notNull
role academy_membership_role notNull
invitedBy uuid FK users onDelete no action notNull
status varchar(20) default 'pending'    // pending | active | removed
createdAt / updatedAt
// índices: UNIQUE(academyId, userId), academy_idx, user_idx

// rubrics (modificación aditiva)
+ academyId uuid nullable FK academies onDelete set null
+ scope rubric_scope notNull default 'personal'
// índice: rubrics_academy_scope_idx (academyId, scope)
```

## 5. Archivos a tocar

### Crear
| Archivo | Rol | Est. líneas |
|---------|-----|-------------|
| `lib/db/queries/padel/academies.ts` | CRUD academias + membresías (create/accept/remove/list, resolveAcademyForEvaluation) | ~220 |
| `lib/auth/academy-guard.ts` | guardAcademyOwner/Admin/Coach + getAcademyMembership | ~90 |
| `lib/validations/academy.ts` | academyCreate/Update/Invite schemas + logo validation | ~80 |
| `lib/padel/logo.ts` | validación MIME/dims, sanitización SVG, build data-URL | ~70 |
| `lib/padel/radar.ts` | polígono radar 6 dims (puro) | ~60 |
| `lib/padel/pdf.ts` | documento PDF (react-pdf): header branding, radar, tabla, firma | ~180 |
| `app/api/academies/route.ts` | GET+POST | ~90 |
| `app/api/academies/[id]/route.ts` | GET+PUT+DELETE | ~120 |
| `app/api/academies/[id]/logo/route.ts` | POST multipart | ~80 |
| `app/api/academies/[id]/members/invite/route.ts` | POST | ~80 |
| `app/api/academies/[id]/members/[userId]/accept/route.ts` | POST | ~50 |
| `app/api/academies/[id]/members/route.ts` | GET | ~50 |
| `app/api/academies/[id]/members/[userId]/route.ts` | DELETE | ~60 |
| `app/api/academies/[id]/rubrics/route.ts` | GET+POST | ~90 |
| `app/api/evaluations/[id]/pdf/route.ts` | GET PDF | ~70 |
| `app/(app)/academias/page.tsx` | lista + crear | ~120 |
| `app/(app)/academias/[id]/page.tsx` | detalle tabs | ~100 |
| `components/padel/academy-card.tsx` | card | ~50 |
| `components/padel/academy-form.tsx` | crear/editar | ~90 |
| `components/padel/academy-detail.tsx` | tabs branding/miembros/rúbricas | ~150 |
| `components/padel/logo-upload.tsx` | upload + preview | ~80 |
| `components/padel/members-list.tsx` | lista + remover | ~80 |
| `components/padel/invite-member-modal.tsx` | modal email | ~70 |
| `components/padel/academy-rubrics-tab.tsx` | lista + crear institucional | ~90 |
| `hooks/use-academies.ts` | fetch/CRUD client | ~80 |
| `lib/api-docs/paths/academies.ts` | paths OpenAPI | ~200 |
| `lib/api-docs/schemas/academies.ts` | schemas OpenAPI | ~120 |
| `tests/unit/padel/academy-schemas.test.ts` | schemas Zod | ~80 |
| `tests/unit/padel/radar.test.ts` | polígono radar | ~60 |
| `tests/unit/padel/logo.test.ts` | validación logo | ~70 |
| `tests/unit/auth/academy-guard.test.ts` | guards | ~90 |
| `tests/unit/db/academy-queries.test.ts` | queries (mock db) | ~110 |
| `tests/api/padel/academies-happy.spec.ts` | happy-path SQL real | ~120 |
| `tests/api/padel/academies-guard.spec.ts` | 401/403/404/409 | ~90 |
| `tests/api/padel/members-happy.spec.ts` | invite/accept/remove | ~130 |
| `tests/api/padel/institutional-rubrics-happy.spec.ts` | scope + 403 COACH | ~120 |
| `tests/api/padel/pdf-happy.spec.ts` | PDF válido + draft 400 | ~80 |
| `tests/e2e/academy-branding.spec.ts` | flujo completo navegable | ~110 |

### Modificar
| Archivo | Cambio |
|---------|--------|
| `lib/db/schema.ts` | +3 enums, +2 tablas, rubrics +2 cols, relations (excepción tamaño: schema file) |
| `lib/db/queries/padel/rubrics.ts` | getRubricById/updateRubric/archiveRubric/listRubrics con scope + guard institucional |
| `lib/db/queries/padel/evaluations.ts` | + resolveAcademyForEvaluation (rubric.academyId → teacher membership) |
| `lib/notifications/triggers.ts` | + triggerAcademyInvite (inbox, category account, cta /academias) |
| `app/api/rubrics/[id]/route.ts` | guard extendido en PUT/DELETE (403 COACH institucional) |
| `components/padel/evaluation-detail.tsx` | + botón "Exportar PDF" (link a /api/evaluations/[id]/pdf) |
| `app/(app)/evaluaciones/[id]/page.tsx` | wire del botón |
| `lib/auth/protected-routes.ts` | documentar guards de academia |
| `lib/api-docs/spec.ts` | import paths/schemas academies + tags |
| `FEATURES.md` | entrada SPEC-EPIC-01 |
| `ARCHITECTURE.md` | sección "Padel Evaluativo — Academia & Branding (v0.6)" |

## 6. Tests requeridos (mapeo)

| Tipo | Archivo | Cubre |
|------|---------|-------|
| Unit | `academy-schemas.test.ts` | slug regex, color HEX, invite email, logo MIME/dims |
| Unit | `radar.test.ts` | 6 puntos polígono, normalización 0-4, orden categorías |
| Unit | `logo.test.ts` | data-URL build, SVG sanitizado, rechazo >2MB |
| Unit | `academy-guard.test.ts` | OWNER/ADMIN/COACH, 404 anti-IDOR, academia archivada |
| Unit | `academy-queries.test.ts` | CRUD academias, membresías, resolveAcademyForEvaluation |
| API happy | `academies-happy.spec.ts` | POST/GET/PUT/DELETE + logo con SQL real |
| API guard | `academies-guard.spec.ts` | 401 no auth, 403 USER, 404 ajeno, 409 slug, 400 color |
| API happy | `members-happy.spec.ts` | invite→accept→list→remove, multi-academia (AC-03) |
| API happy | `institutional-rubrics-happy.spec.ts` | crear institucional, COACH usa pero 403 PUT/DELETE (AC-04) |
| API happy | `pdf-happy.spec.ts` | content-type application/pdf, draft 400 (AC-05) |
| E2E | `academy-branding.spec.ts` | crear academia → invitar → rúbrica institucional → exportar PDF (AC-07) |

## 7. Agentes y orden de ejecución

1. **@db-engineer** — schema + migración `0008` + queries academias/rubrics/evaluations + unit tests DB. Verificar columnas post-migrate (`information_schema`).
2. **@auth-security** — `academy-guard.ts` + invitación (usuario TEMPORARY patrón G4) + auditoría + `auth-impact.md` + `security-checklist.md` + unit tests guards.
3. **@app-engineer** — endpoints + UI + PDF + API docs + tests API/E2E + `app-notes.md`.
4. **@ponytail-reviewer** — revisión simplicidad (spike PDF temprano, data-URL sin deps).
5. **@qa-release** — E2E + test-matrix + acceptance-criteria + release-report + evidence-manifest.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `@react-pdf/renderer` peer dep con React 19 | Spike al inicio; fallback `pdf-lib` (radar.ts agnóstico) |
| SVG malicioso en logo | DOMPurify server-side + MIME real + dims ≤1024 |
| Cobertura módulo rubrics/evaluations | Tests unit + happy-path por endpoint; gate `--coverage` |
| Migración aditiva en rubrics | Columnas nullable + default → sin backfill destructivo; verificar `information_schema` |
| PDF grande en serverless | Límite 2MB logo; documento único sin assets externos |