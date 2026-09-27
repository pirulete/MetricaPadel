# App Notes — Fases D+E: Endpoints y UI (SPEC-EPIC-01)

> status: in-progress
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: api+ui
> tags: [endpoints, academies, members, rubrics, pdf, ui, branding]
> agent: @app-engineer

## Alcance

Fases D (10 endpoints) y E (UI) del epic. Complementa `app-notes.md` de Fase C (lógica pura y validaciones).

## Fase D — Endpoints (10)

| Endpoint | Guard | Notas |
|----------|-------|-------|
| `GET/POST /api/academies` | guardUser / guardAdmin | POST inserta OWNER en academy_memberships (transacción); 409 slug duplicado |
| `GET/PUT/DELETE /api/academies/[id]` | guardAcademyCoach / Admin / Owner | GET devuelve `myRole`; DELETE soft archive |
| `POST /api/academies/[id]/logo` | guardAcademyAdmin | multipart `file`, validateLogoUpload, data-URL en logoUrl |
| `POST /api/academies/[id]/members/invite` | guardAcademyAdmin | crea usuario TEMPORARY (patrón G4) o reutiliza; membresía COACH pending; triggerAcademyInvite; 409 ya miembro |
| `POST /api/academies/[id]/members/[userId]/accept` | guardUser (solo self) | marca active (idempotente); 404 si removida |
| `GET /api/academies/[id]/members` | guardAcademyCoach | join users (firstName/lastName/email) |
| `DELETE /api/academies/[id]/members/[userId]` | guardAcademyAdmin | soft remove; 400 último OWNER activo |
| `GET/POST /api/academies/[id]/rubrics` | guardAcademyCoach / Admin | scope forzado institutional + academyId=ruta |
| `GET /api/evaluations/[id]/pdf` | guardUser + ACTIVE | teacher o student; 400 draft; branding vía resolveAcademyForEvaluation |
| `PUT/DELETE /api/rubrics/[id]` (MOD) | guard extendido | institucional → OWNER/ADMIN (COACH 403); personal → owner |

## Fase E — UI

- `hooks/use-academies.ts` — fetch + CRUD helpers (create/update/archive/uploadLogo/invite/accept/removeMember).
- `app/(app)/academias/page.tsx` + `[id]/page.tsx` — lista + detalle.
- 7 componentes nuevos en `components/padel/`: academy-card, academy-form, academy-detail (tabs Branding/Miembros/Rúbricas), logo-upload, members-list, invite-member-modal, academy-rubrics-tab.
- `components/padel/rubric-viewer.tsx` (MOD) — botón "Exportar PDF" solo si la evaluación tiene academia (rúbrica institucional o membresía del teacher). El endpoint student devuelve `academy` resuelto.
- `lib/constants/navigation.ts` (MOD) — link `/academias` en bottom-nav (ADMIN y USER).

## Decisiones técnicas

### D-D1 — `myRole` en GET /api/academies/[id]
La UI necesita saber el rol del caller para mostrar acciones (editar/invitar/archivar). Se devuelve `{ academy, myRole }` resolviendo la membresía del caller (getAcademyMembership) — evita que el cliente adivine el rol desde la lista de miembros.

### D-D2 — Queries en `lib/db/queries/padel/academies.ts` (nuevo)
CRUD academias + membresías + rúbricas institucionales + `resolveAcademyForEvaluation` (prioridad: rubric.academyId → primera membresía activa del teacher). `createInstitutionalRubric` reutiliza `createRubric` de rubrics.ts con academyId+scope (extensión aditiva de `CreateRubricInput`).

### D-D3 — `updateRubric`/`archiveRubric` → unión discriminada `RubricMutationResult`
Para distinguir 403 (COACH con membresía) de 404 (sin membresía/ajeno) en rúbricas institucionales, las queries de mutación devuelven `{ ok, reason: 'not_found' | 'forbidden' }`. `getRubricById` es access-aware (personal → owner; institucional → miembro activo COACH+). El route handler mapea reason → status HTTP. Test unit rubrics.test.ts actualizado al nuevo contrato.

### D-D4 — PDF: categoría por fila = categoría de la rúbrica
El modelo de datos tiene UNA categoría por rúbrica (una de las 6 dimensiones del radar). `loadScoreRows` asigna `category = rubric.category` a cada fila y `maxScore = 4` (escala fija). El radar del PDF muestra la dimensión de la rúbrica.

### D-D5 — Invitación: usuario TEMPORARY con password generado
`inviteMember` genera password aleatorio (randomBytes base64url) y crea usuario TEMPORARY (patrón G4 de admin-users). El invitado no puede loguear hasta verificar email; si lo necesita, usa forgot-password. Re-invitar a un miembro existente (cualquier status) → 409.

### D-D6 — Remover miembro: guard de último OWNER
`removeMember` cuenta OWNER activos; si el target es OWNER y count ≤ 1 → 400. El contrato no restringe ADMIN→OWNER (solo el último OWNER), por lo que no se agregó regla extra (decisión de seguridad consultable con @auth-security).

## Validación ejecutada

| Gate | Resultado |
|------|-----------|
| `npx tsc --noEmit` | 0 errores |
| `npx eslint` (archivos nuevos/modificados) | 0 errores, 15 warnings (no-explicit-any en mocks de tests, consistente con suite) |
| `npx jest tests/unit/ --no-coverage` | 493/493 pass (39 suites) — incluye 16 nuevos de academy-queries + rubrics.test.ts actualizado |
| `npx next build` | OK — 11 rutas nuevas compiladas (academias, members, rubrics, pdf) |

## Pendiente (Fase G)

- Tests API happy-path SQL real: `academies-happy.spec.ts`, `members-happy.spec.ts`, `institutional-rubrics-happy.spec.ts`, `pdf-happy.spec.ts`, `academies-guard.spec.ts` (creados, requieren servidor + DATABASE_URL).
- E2E `tests/e2e/academy-branding.spec.ts` (flujo crear academia → invitar → rúbrica institucional → exportar PDF).
- API docs `lib/api-docs/paths/academies.ts` + `schemas/academies.ts` (creados e importados en spec.ts).
- FEATURES.md + ARCHITECTURE.md (actualizados en esta fase).

## Referencias

- `production_artifacts/2026-09-26-academia-branding/technical-design.md` (§3 contratos, §5 archivos)
- `production_artifacts/2026-09-26-academia-branding/change-map.md` (Fases D/E)
- `FEATURES.md` → sección "Fase D+E — Endpoints y UI"