# Feature Spec — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso

> status: in-progress
> release: v0.9
> date: 2026-10-03
> change_id: 2026-10-03-super-admin-academy-ownership
> module: admin+academy
> tags: [academy, super-admin, rbac, ownership, requests, migration]

## Problema

Hoy cualquier ADMIN global (coach) puede crear academias vía `POST /api/academies` (guard `guardAdmin`), y el ownership queda en manos del coach creador. El usuario quiere un modelo de plataforma centralizado: **solo SUPER_ADMIN opera academias** (crear, editar, archivar/desarchivar, gestionar miembros, transferir ownership, asignar roles). Los coaches (ADMIN global) dejan de crear academias y pasan a **solicitar acceso** (join a academia existente o creación de una nueva para ellos). No existe hoy: transferencia de ownership, solicitudes de acceso, desarchivar academias, ni asignación de roles vía API.

## Objetivo

- Restringir la creación de academias a SUPER_ADMIN únicamente; migrar el ownership de academias existentes creadas por ADMIN al único SUPER_ADMIN.
- Introducir el flujo de solicitudes de acceso (`join_academy` / `create_academy`) con aprobación/rechazo por SUPER_ADMIN.
- Dar a SUPER_ADMIN CRUD completo sobre academias: branding, archivar/desarchivar, miembros (invitar/remover/asignar roles), transferencia de ownership, lectura de rúbricas institucionales de cualquier academia.
- Mantener el rol ADMIN de academia (membresía) gestionable por un coach (ADMIN global) pero **sin poder asignar/transferir OWNER** (reservado a SUPER_ADMIN).

## Alcance

### In-Scope

1. **Creación solo SUPER_ADMIN**: `POST /api/academies` cambia de `guardAdmin` a `guardSuperAdmin`. El ADMIN global pierde el botón "Crear academia" en UI.
2. **Migración de ownership**: academias existentes con `ownerId` de un ADMIN global → migrar al único SUPER_ADMIN activo (data migration). El SUPER_ADMIN pasa a ser OWNER de todas las academias existentes.
3. **Solicitudes de acceso** (tabla nueva `academy_access_requests`):
   - `join_academy`: coach (ADMIN global) pide ser asignado a una academia existente con rol ADMIN/COACH.
   - `create_academy`: coach pide que SUPER_ADMIN cree una academia para él (payload `name`/`slug`) y le asigne rol OWNER.
   - Endpoints: crear solicitud (coach), listar solicitudes (SUPER_ADMIN), aprobar/rechazar (SUPER_ADMIN).
4. **SUPER_ADMIN CRUD completo**:
   - Crear academia (con OWNER asignable a sí mismo o a otro miembro).
   - Editar branding, archivar, **desarchivar (restore)**.
   - Gestionar miembros: invitar, remover, **asignar roles OWNER/ADMIN/COACH**.
   - **Transferir ownership** (feature nueva): target → OWNER; OWNER anterior → ADMIN.
   - Ver rúbricas institucionales de cualquier academia.
5. **Asignación de roles dentro de academia**: solo SUPER_ADMIN asigna OWNER. Academy ADMIN (membresía ADMIN, que es un coach global) puede gestionar branding/invite/remove/archivar y asignar ADMIN/COACH, pero **no** OWNER ni transferir.
6. **Guards**: nuevos guards/endpoints con anti-IDOR 404 y 403 para roles insuficientes.
7. **Auditoría**: eventos nuevos para solicitudes, transferencia, unarchive, asignación de roles.

### Out-of-Scope

- Cambios al flujo de invitación por email existente (`inviteMember` con status pending) — se mantiene; las solicitudes de acceso son un canal adicional.
- Auto-aprobación de solicitudes (siempre requiere SUPER_ADMIN).
- Notificaciones push/inbox para solicitudes (se puede agregar en release futuro).
- Multi-OWNER por academia (solo 1 OWNER).
- Eliminación física de academias (solo soft archive).
- Cambios a `user_role` global (SUPER_ADMIN ya existe desde v0.7).
- UI de gestión de solicitudes en el front del coach (solo endpoints + UI mínima de SUPER_ADMIN en `/admin/platform` o similar).

## Acceptance Criteria

- **AC-01 (creación)**: `POST /api/academias` (o `/api/academies`) con usuario ADMIN global → 403; con SUPER_ADMIN → 201 y crea academia + membresía OWNER en tx. El ADMIN global no ve botón "Crear academia".
- **AC-02 (migración)**: tras la data migration, todas las academias existentes tienen `ownerId` = único SUPER_ADMIN activo; la membresía OWNER previa del coach queda como ADMIN (o se documenta el criterio exacto de reasignación). Migración idempotente y verificable por query.
- **AC-03 (solicitud join)**: coach ADMIN global puede `POST /api/academy-requests` con `type=join_academy` + `academyId` → 201; solicitud duplicada pendiente para misma academia+usuario → 409; solicitud sobre academia archivada → 400/404.
- **AC-04 (solicitud create)**: coach ADMIN global puede `POST /api/academy-requests` con `type=create_academy` + `name`/`slug` → 201; slug duplicado → 409; slug con formato inválido → 400.
- **AC-05 (approve/reject)**: SUPER_ADMIN aprueba `join_academy` → crea membresía activa con rol ADMIN/COACH (según payload) y marca la solicitud approved; rechaza → status rejected. ADMIN global → 403. Solicitud inexistente → 404.
- **AC-06 (approve create_academy)**: SUPER_ADMIN aprueba `create_academy` → crea academia con slug del payload (validando duplicado en el momento de aprobar; si ya existe → 409) y asigna al solicitante rol OWNER.
- **AC-07 (transfer ownership)**: solo SUPER_ADMIN puede transferir; target → OWNER, OWNER anterior → ADMIN. Transferir a sí mismo → 400. Target no miembro → 404. Academy ADMIN → 403.
- **AC-08 (role assignment)**: SUPER_ADMIN puede asignar OWNER/ADMIN/COACH a cualquier miembro activo; academy ADMIN puede asignar ADMIN/COACH pero asignar OWNER → 403. Asignar rol a miembro pending/removed → 400/404.
- **AC-09 (unarchive)**: SUPER_ADMIN puede desarchivar una academia archivada (status active); academy ADMIN → 403; academia inexistente → 404.
- **AC-10 (guards)**: todos los endpoints nuevos devuelven 401 sin sesión, 403 con rol insuficiente, 404 anti-IDOR (recurso ajeno/inexistente). LOCKED nunca permitido.
- **AC-11 (tests)**: unit tests (Jest) para lógica pura (validación de solicitudes, transferencia, asignación de roles, migración), API tests happy-path con SQL real contra NeonDB para cada endpoint nuevo, API tests de guard (401/403/400/404/409), y al menos 1 E2E navegable del flujo SUPER_ADMIN (aprobar solicitud + transferir ownership).

## Edge Cases

- **Último OWNER**: transferir ownership cuando el target es el único otro miembro — el OWNER anterior pasa a ADMIN; nunca queda academia sin OWNER.
- **Slug duplicado**: en `create_academy` y en approve de `create_academy` — validar en el momento de aprobar (puede colisionar entre solicitud y aprobación).
- **Solicitud sobre academia archivada**: rechazar con 400/404.
- **Target ya miembro**: al aprobar `join_academy` si el usuario ya es miembro activo → 409 o idempotente (decidir: 409).
- **Coach que ya es OWNER**: un coach que ya es OWNER de una academia no debería poder solicitar join a la misma academia → 409.
- **SUPER_ADMIN transfiriendo a sí mismo**: 400.
- **Aprobación de create_academy cuando slug ya existe**: 409 en approve (no en create de la solicitud).
- **Rate limit solicitudes**: aplicar rate limit por IP en creación de solicitudes (patrón `academy-invite:{ip}`).
- **Migración sin SUPER_ADMIN activo**: si no existe SUPER_ADMIN activo, la migración debe fallar explícitamente (no dejar academias sin owner).
- **Membresía pending/removed**: no asignable a roles; solo miembros activos.

## Dependencias

- v0.7 SUPER_ADMIN (`guardSuperAdmin`, `role-utils.ts`, `super-admin.ts` queries) — ya released.
- v0.6 academia-branding (`academies`, `academy_memberships`, enums, guards academia) — ya released.
- Migración Drizzle nueva (tabla `academy_access_requests` + posible enum `academy_request_type`/`academy_request_status`).
- Auditoría existente (`lib/audit/helpers.ts`) extendida con eventos nuevos.

## Requerimiento de Tests

- **Unit (Jest)**: `tests/unit/padel/academy-requests.test.ts` (validación tipos/payloads), `tests/unit/padel/academy-ownership.test.ts` (transferencia, asignación de roles, invariante último OWNER), `tests/unit/db/academy-requests-queries.test.ts`, `tests/unit/db/academy-migration.test.ts` (lógica de migración de ownership).
- **API (Playwright)**: `tests/api/academy/academy-requests-happy.spec.ts` (SQL real), `tests/api/academy/academy-requests-guard.spec.ts` (401/403/400/404/409), `tests/api/academy/academy-ownership-happy.spec.ts` (transfer + role assign + unarchive), `tests/api/academy/academy-ownership-guard.spec.ts`.
- **E2E (Playwright)**: `tests/e2e/academy-super-admin.spec.ts` — flujo navegable: SUPER_ADMIN aprueba solicitud join → asigna rol → transfiere ownership.
- **Cobertura**: sin regresión >3% en módulos afectados (`lib/db/queries/padel/academies.ts`, `lib/auth/academy-guard.ts`, `app/api/academies/*`).
- **API docs**: todos los endpoints nuevos documentados en `lib/api-docs/spec.ts`.