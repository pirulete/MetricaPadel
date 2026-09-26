# Auth Impact — SPEC-EPIC-01 Fase B: Guards de Academia

> status: in-progress
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: auth
> tags: [rbac, multi-tenancy, guards, audit, notifications]

## 1. Resumen de impacto en autenticación/autorización

La Fase B NO modifica el flujo de autenticación (login/register/sesión JWT) ni el
`user_role` global (USER/ADMIN). Agrega una capa de **autorización por academia**
(RBAC multi-tenant) con guards DB-backed que consultan `academy_memberships` en
cada request.

| Área | Cambio | Riesgo |
|------|--------|--------|
| `auth.ts` (Auth.js) | Sin cambios | — |
| `lib/auth/admin-guard.ts` | Sin cambios (guardUser/guardAdmin intactos) | — |
| `lib/auth/academy-guard.ts` | **NUEVO**: 3 guards + helper `getAcademyMembership` | Medio (DB-backed por request) |
| `lib/auth/protected-routes.ts` | Documenta guards de academia + endpoints planeados | Bajo (referencia) |
| `lib/audit/helpers.ts` | +5 audit helpers de academia | Bajo |
| `lib/notifications/triggers.ts` | +1 trigger de invitación | Bajo |

## 2. Guards implementados

Patrón: `async function guardX(session, academyId): Promise<NextResponse | null>`
(null = OK, NextResponse = error). Todos consultan la DB — nunca confían en claims
del JWT para el rol de academia.

| Guard | Roles permitidos | Uso previsto |
|-------|------------------|--------------|
| `guardAcademyOwner` | OWNER | Archivar academia, remover miembros, transferir ownership |
| `guardAcademyAdmin` | OWNER, ADMIN | Editar branding, invitar, crear rúbrica institucional |
| `guardAcademyCoach` | OWNER, ADMIN, COACH | Lectura (miembros, rúbricas institucionales) |

### Helper `getAcademyMembership(userId, academyId)`
- Consulta `academy_memberships` con `status = 'active'` + join a `academies`.
- Retorna `null` si: no existe membresía activa **o** la academia está archivada.
- Es la base del anti-IDOR: el caller responde **404** (no 403) para no filtrar
  existencia de recursos ajenos.

## 3. Matriz de estados de usuario

| Estado | guardAcademy* | Justificación |
|--------|---------------|---------------|
| Sin sesión | 401 | No autenticado |
| LOCKED | 403 | Nunca permitir LOCKED (principio global) |
| TEMPORARY | 403 | Email no verificado; operaciones de academia exigen ACTIVE |
| ACTIVE + sin membresía | 404 | Anti-IDOR: no revelar existencia |
| ACTIVE + academia archivada | 404 | Anti-IDOR: recurso inaccesible |
| ACTIVE + rol insuficiente | 403 | Autenticado pero sin permiso |

## 4. Auditoría agregada (audit_logs)

| Evento | actionType | entityName | Cuándo |
|--------|-----------|------------|--------|
| Academia creada | `ACADEMY_CREATED` | academies | POST /api/academies |
| Academia actualizada | `ACADEMY_UPDATED` | academies | PUT /api/academies/[id] (branding) |
| Academia archivada | `ACADEMY_ARCHIVED` | academies | DELETE /api/academies/[id] |
| Miembro invitado | `MEMBER_INVITED` | academy_memberships | POST invite |
| Miembro removido | `MEMBER_REMOVED` | academy_memberships | DELETE member |

## 5. Notificaciones

`triggerAcademyInvite(userId, academyName, membershipId)` — inbox, category
`system`, priority P2, `groupId = membershipId` (dedup 1h del engine: re-invitar
no duplica). CTA `/academias`.

## 6. Endpoints protegidos (referencia en protected-routes.ts)

| Endpoint | Guard | Notas |
|----------|-------|-------|
| GET /api/academies | guardUser | Lista membresías activas |
| POST /api/academies | guardAdmin | Crea academia (ownerId=me) |
| GET /api/academies/[id] | guardAcademyCoach | 404 anti-IDOR |
| PUT /api/academies/[id] | guardAcademyAdmin | Branding |
| DELETE /api/academies/[id] | guardAcademyOwner | Soft archive |
| POST /api/academies/[id]/members | guardAcademyAdmin | Invitar |
| DELETE /api/academies/[id]/members/[memberId] | guardAcademyOwner | Remover |

## 7. Archivos modificados

- `lib/auth/academy-guard.ts` (NUEVO)
- `lib/auth/protected-routes.ts` (MOD)
- `lib/audit/helpers.ts` (MOD)
- `lib/notifications/triggers.ts` (MOD)
- `tests/unit/auth/academy-guard.test.ts` (NUEVO)
- `tests/unit/audit/helpers.test.ts` (MOD — tests academia)
- `tests/unit/notifications/triggers.test.ts` (MOD — test triggerAcademyInvite)

## 8. Tests

| Archivo | Cubre |
|---------|-------|
| `tests/unit/auth/academy-guard.test.ts` | 22 tests: getAcademyMembership, 3 guards, 401/403/404, jerarquía OWNER≥ADMIN≥COACH, academia archivada |
| `tests/unit/audit/helpers.test.ts` | +6 tests de audit helpers academia |
| `tests/unit/notifications/triggers.test.ts` | +2 tests de triggerAcademyInvite |

Pendiente (Fase C, @app-engineer): API tests happy-path con SQL real por endpoint
+ guard tests 401/403/404/409 en `tests/api/padel/`.