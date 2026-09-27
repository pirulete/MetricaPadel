# Audit Report — Rol "Super Admin" en Métrica Pádel

> status: proposed
> release: v0.7 (objetivo)
> date: 2026-09-27
> change_id: super-admin-audit
> module: admin+auth+api+db
> tags: [audit, roles, rbac, super-admin, admin, security, gaps]

## Resumen ejecutivo

**No existe el rol SUPER_ADMIN en la aplicación.** El modelo de roles es binario: `USER` (alumno) y `ADMIN` (coach + plataforma, doble rol fusionado). No hay distinción entre "admin de plataforma" y "super admin". Cualquier ADMIN puede promover a otro usuario a ADMIN, bloquear jugadores y gestionar el CMS completo, sin jerarquía ni restricción de escalada.

---

## 1. Tabla de roles existentes

| Rol | Dónde vive | Quién lo tiene | Qué puede hacer | Guard |
|-----|-----------|----------------|-----------------|-------|
| `USER` | `users.role` (enum `user_role`) | Alumno (registro público, backend ignora `role` → siempre USER/TEMPORARY, D6) | Ver evaluaciones publicadas, marcar leído, unirse/salir de cursos, dashboard alumno, perfil, notificaciones | `guardUser` (401/403 LOCKED/TEMPORARY) |
| `ADMIN` | `users.role` (enum `user_role`) | Coach + plataforma (se asigna vía seed/DB manual o `POST /api/admin/users/[id]/promote`) | TODO lo de USER + rúbricas, evaluaciones, cursos, dashboard teacher, historial, gestión de usuarios (crear/editar/lock/unlock/promote), CMS marketing completo, settings de notificaciones, academias (crear) | `guardAdmin` (role ADMIN + status ACTIVE) |
| `OWNER` (academia) | `academy_memberships.role` (enum `academy_membership_role`) | Creador de la academia | Archivar academia, remover miembros, transferir ownership, branding, invitar, rúbricas institucionales | `guardAcademyOwner` (DB-backed) |
| `ADMIN` (academia) | `academy_memberships.role` | Invitado con rol ADMIN | Branding, invitar, remover miembros (no último OWNER), rúbricas institucionales | `guardAcademyAdmin` (DB-backed) |
| `COACH` (academia) | `academy_memberships.role` | Profesor invitado | Leer academia, operar como coach dentro de la academia; NO edita rúbricas institucionales (403) | `guardAcademyCoach` (DB-backed) |

**Conclusión clave:** `user_role` global es binario (USER/ADMIN). El rol por academia (OWNER/ADMIN/COACH) es un RBAC multi-tenant separado que NO toca el rol global. **No hay SUPER_ADMIN en ningún nivel.**

---

## 2. Mapa de capacidades admin actuales

### 2.1 Guards y autorización

| Guard | Archivo | Regla | Uso |
|-------|---------|-------|-----|
| `validateUser()` | `lib/auth/admin-guard.ts` | Sesión + no LOCKED | Layouts server de área privada |
| `validateAdmin()` | `lib/auth/admin-guard.ts` | Sesión + `role === 'ADMIN'` + `status === 'ACTIVE'` → redirect `/dashboard` | Layout `app/admin/layout.tsx` |
| `guardUser(session)` | `lib/auth/admin-guard.ts` | 401 sin sesión, 403 LOCKED/TEMPORARY | Endpoints privados |
| `guardAdmin(session)` | `lib/auth/admin-guard.ts` | 401 sin sesión, 403 si `role !== 'ADMIN'` o `status !== 'ACTIVE'` | Todos los endpoints admin + padel coach |
| `guardAcademyOwner/Admin/Coach` | `lib/auth/academy-guard.ts` | DB-backed: consulta `academy_memberships` (status active) + `academies` (status active) en cada request. Anti-IDOR → 404 | Endpoints de academia |
| `isAdminRole/canAccessModule/canDeleteUser/canAssignRole` | `lib/auth/role-utils.ts` | Solo contemplan `ADMIN`; `canAssignRole('ADMIN', target)` permite asignar `['USER','ADMIN']` | Utilidades (sin uso crítico actual) |

**No existe ningún guard que aplique solo a SUPER_ADMIN.**

### 2.2 Endpoints admin (app/api/admin/)

| Endpoint | Métodos | Guard | Auditoría |
|----------|---------|-------|-----------|
| `/api/admin/users` | GET (lista jugadores), POST (crea USER ACTIVE, password opcional → `generatedPassword`) | guardAdmin | auditCreate |
| `/api/admin/users/[id]` | GET (detalle), PUT (editar), DELETE (soft-lock), POST (unlock) | guardAdmin | auditUpdate |
| `/api/admin/users/[id]/promote` | POST (USER→ADMIN) | guardAdmin | auditUpdate |
| `/api/admin/marketing/pages` + `[id]` + `sections` | CRUD completo + reorder | guardAdmin | auditCreate/Update/Delete |
| `/api/admin/marketing/blog` + `[id]` | CRUD + publish/unpublish | guardAdmin | auditCreate/Update/Delete |
| `/api/admin/marketing/products` + `[id]` | CRUD | guardAdmin | auditCreate/Update/Delete |
| `/api/admin/marketing/categories` + `[id]` | CRUD | guardAdmin | auditCreate/Update/Delete |
| `/api/admin/marketing/settings` | GET/PATCH (siteName/nav/footer) | guardAdmin | auditUpdate |
| `/api/admin/marketing/revalidate` | POST (invalidación caché) | guardAdmin | auditAdminAction |
| `/api/admin/notifications/settings` | GET/PUT (pushEnabled/inboxEnabled) | guardAdmin | auditUpdate |

**Endpoints padel protegidos con guardAdmin (coach):** `/api/rubrics*`, `/api/evaluations*`, `/api/courses*` (excepto join), `/api/dashboard/teacher`, `/api/history`, `POST /api/academies`.

### 2.3 Páginas admin (app/admin/)

| Ruta | Contenido |
|------|-----------|
| `/admin` | Dashboard con Card link a Usuarios |
| `/admin/users` | Gestión de usuarios (lista, crear, editar, lock/unlock, promote) |
| `/admin/marketing` | Redirect a `/admin/marketing/pages` |
| `/admin/marketing/pages` + `[id]` | CMS páginas (Stack Builder) |
| `/admin/marketing/blog` + `[id]` + `new` | CMS blog |
| `/admin/marketing/products` + `[id]` + `new` | CMS productos |
| `/admin/marketing/categories` | CMS categorías |
| `/admin/marketing/settings` | Settings globales de marketing |

### 2.4 UI admin (components/admin/)

- `components/admin/users/`: `user-list.tsx`, `create-user-form.tsx`, `edit-user-form.tsx`
- `components/admin/marketing/`: editor CMS completo (page-list, page-editor, section-stack, section-editor, section-type-forms/*, blog-list, post-editor, products-list, product-editor, category-manager, settings-form, marketing-nav)

### 2.5 Auditoría (lib/audit/helpers.ts)

Eventos existentes relevantes a admin: `CREATE/UPDATE/DELETE` (genéricos), `auditAdminAction` (REVALIDATE), `auditSecurityEvent`, `ACADEMY_CREATED/UPDATED/ARCHIVED`, `MEMBER_INVITED/REMOVED`, `TERMS_VERSION_PUBLISHED`, `NOTIFICATION_DELETED`, `BROADCAST_DELETED`, push events.

**No hay eventos específicos de super admin** (no existe el rol). La promoción USER→ADMIN usa `auditUpdate` genérico (no hay `ADMIN_PROMOTED`).

### 2.6 FEATURES.md — features admin documentadas

| change_id | Feature | Relevancia super admin |
|-----------|---------|------------------------|
| `g10-admin-users-ui` | Admin UI gestión usuarios (CRUD + lock/unlock + promote) | Base de la gestión de usuarios actual |
| `gaps-user-flows` (G3) | `POST /api/admin/users/[id]/promote` | **Explícitamente declara out-of-scope: "Rol superadmin separado (no existe en el modelo; ADMIN = coach + plataforma)"** |
| `spec-epic-01-academia-branding` | Academia + RBAC por academia | Decisión clave: mantener `user_role` global USER/ADMIN |
| `marketing-cms` | CMS marketing editable desde admin | Capacidad admin actual |

---

## 3. Estructura de usuarios — cómo se crea un admin

| Vía | Mecanismo | Restricción |
|-----|-----------|-------------|
| Seed / DB manual | `users.role = 'ADMIN'` (QUICKSTART §7) | Ninguna (acceso DB) |
| `POST /api/admin/users/[id]/promote` | Cambia `users.role` USER→ADMIN vía `promoteUser(id)` | **Cualquier ADMIN puede promover a cualquier USER.** No hay jerarquía. |
| Registro público | Backend ignora `role` del body → siempre USER/TEMPORARY (D6) | Nunca auto-ADMIN |

**Gaps de seguridad en promoción:**
- No hay restricción de quién puede promover (cualquier ADMIN = poder de crear admins).
- No hay endpoint de demote (ADMIN→USER).
- No hay protección contra "último admin" (un ADMIN puede bloquear a otro ADMIN → 403 sí existe, pero no hay protección de último admin activo).
- No hay listado de admins (solo `listPlayers` filtra role USER; no existe "listar admins").
- No hay auditoría dedicada de promoción (solo `auditUpdate` genérico).

---

## 4. Gaps: ¿qué le falta al super admin?

| # | Gap | Severidad | Detalle |
|---|-----|-----------|---------|
| G1 | **No existe el rol SUPER_ADMIN** | CRÍTICA | `user_role` enum = `['USER','ADMIN']`; no hay valor SUPER_ADMIN en schema, guards, types (`types/auth.ts`), ni session |
| G2 | **No hay guard super admin** | CRÍTICA | `guardAdmin` es el único gate; no hay `guardSuperAdmin`/`validateSuperAdmin` |
| G3 | **Escalada de privilegios sin control** | ALTA | Cualquier ADMIN promueve a otro ADMIN; no hay jerarquía ni restricción |
| G4 | **No hay demote ni gestión de admins** | ALTA | No existe endpoint para revocar ADMIN ni listar admins |
| G5 | **No hay visibilidad global de plataforma** | MEDIA | Un super admin no puede ver todas las academias, todos los usuarios, ni métricas globales (los dashboards son por-owner) |
| G6 | **No hay gestión de academias a nivel plataforma** | MEDIA | Las academias solo son gestionables por su OWNER/ADMIN; no hay endpoint super admin para archivar/auditar academias |
| G7 | **No hay auditoría dedicada de acciones de admin** | MEDIA | Promoción usa `auditUpdate` genérico; no hay `ADMIN_PROMOTED`/`ADMIN_DEMOTED`/`SUPER_ADMIN_ACTION` |
| G8 | **No hay protección de último admin** | MEDIA | Nada impide dejar la plataforma sin admins activos |
| G9 | **No hay UI de super admin** | MEDIA | `/admin` es único para todos los ADMIN; no hay sección "Admins" ni "Plataforma" |
| G10 | **No hay settings globales de plataforma** | BAJA | `marketing_settings` y `notification_settings` son los únicos globales; no hay config de plataforma (feature flags, mantenimiento, etc.) |

---

## 5. Comparación con un "super admin" típico

| Capacidad típica de super admin | Estado en Métrica Pádel |
|----------------------------------|------------------------|
| Crear/revocar admins | ❌ Solo promote USER→ADMIN sin jerarquía; sin demote |
| Ver todos los usuarios/entidades | ❌ Solo jugadores (role USER) vía `listPlayers`; sin vista global |
| Configuración global de plataforma | ⚠️ Parcial: marketing settings + notification settings (ambos accesibles a cualquier ADMIN) |
| Auditoría global / ver audit_logs | ❌ No hay endpoint de lectura de audit_logs |
| Gestión de academias (todas) | ❌ Solo por OWNER/ADMIN de cada academia |
| Protección de la propia cuenta (no bloqueable) | ⚠️ Parcial: un ADMIN no puede bloquear a otro ADMIN (403), pero no hay rol superior |
| Métricas globales de la plataforma | ❌ Dashboards son por-owner (teacher/student) |
| Gestión de términos/legal | ⚠️ Existe infraestructura `terms_versions` pero sin UI admin dedicada visible |

---

## 6. Recomendaciones para la feature de super admin

### 6.1 Modelo de datos (recomendado: enum extendido, no tabla nueva)
- Extender `user_role` a `['USER', 'ADMIN', 'SUPER_ADMIN']` (migración aditiva vía `db:generate`).
- Alternativa descartada: tabla `admin_roles` separada — sobreingeniería para un solo rol jerárquico; el enum es suficiente y consistente con el modelo actual.
- **Decisión de diseño**: SUPER_ADMIN debe ser un rol global de plataforma (no por academia). El RBAC por academia (OWNER/ADMIN/COACH) queda intacto.

### 6.2 Guards
- Nuevo `guardSuperAdmin(session)` + `validateSuperAdmin()` en `lib/auth/admin-guard.ts`: `role === 'SUPER_ADMIN'` + `status === 'ACTIVE'`.
- **Jerarquía**: SUPER_ADMIN debe pasar `guardAdmin` también (un super admin es admin). Decidir si `guardAdmin` acepta `['ADMIN','SUPER_ADMIN']` o si SUPER_ADMIN se trata como ADMIN en rutas coach (recomendado: `isAdminRole` incluye ambos; `guardAdmin` acepta ambos).
- `role-utils.ts`: extender `ADMIN_ROLES` o crear `SUPER_ADMIN_ROLES`.

### 6.3 Seguridad de promoción (crítico)
- **Restringir promote a SUPER_ADMIN**: `POST /api/admin/users/[id]/promote` pasa a `guardSuperAdmin`.
- Nuevo endpoint `POST /api/admin/users/[id]/demote` (ADMIN→USER, solo SUPER_ADMIN, con protección de último admin).
- Protección: SUPER_ADMIN no puede ser bloqueado/demotado por nadie; no puede existir 0 SUPER_ADMIN activos (validación transaccional).
- Auditoría dedicada: `ADMIN_PROMOTED`, `ADMIN_DEMOTED`, `SUPER_ADMIN_ACTION`.

### 6.4 Capacidades nuevas de super admin
- `GET /api/admin/admins` — listar admins (role ADMIN/SUPER_ADMIN) con estado.
- `GET /api/admin/audit-logs` — lectura de audit_logs (paginada, filtros por acción/usuario).
- `GET /api/admin/academies` — listar todas las academias (visibilidad global) + archivar por super admin.
- Dashboard de métricas globales (usuarios totales, academias, evaluaciones publicadas).
- UI: sección `/admin/admins` (gestionar admins) + `/admin/platform` (settings globales) visibles solo para SUPER_ADMIN.

### 6.5 Out-of-scope sugerido para v1
- Multi-tenant admin por academia (ya existe vía academy_memberships).
- Permisos granulares por módulo (RBAC fino) — YAGNI; el enum jerárquico cubre el caso.
- Self-service de registro de super admin (siempre seed/DB manual o promoción por otro super admin).

### 6.6 Tests requeridos (cuando se implemente)
- **Unit**: guards (jerarquía, estados), role-utils, validaciones de demote/último admin.
- **API**: `promote` con guardSuperAdmin (401/403), `demote` happy-path SQL real, `admins` list, `audit-logs` list, protección último admin.
- **E2E**: flujo navegable super admin promueve/demota admin.

### 6.7 Próximo paso
Cuando se apruebe, crear `feature-spec.md` con change_id propio (ej: `super-admin-role`), actualizar `FEATURES.md`, `lib/api-docs/spec.ts`, `ARCHITECTURE.md` (Roles) y `lib/auth/protected-routes.ts`.

---

## Referencias

- `lib/db/schema.ts` — enums `user_role` (L4), `academy_membership_role` (L415)
- `lib/auth/admin-guard.ts` — `guardAdmin`/`validateAdmin` (L19-55)
- `lib/auth/academy-guard.ts` — guards DB-backed (L104-110)
- `lib/auth/role-utils.ts` — solo ADMIN
- `lib/auth/protected-routes.ts` — 40+ endpoints admin documentados
- `lib/audit/helpers.ts` — eventos de auditoría
- `FEATURES.md` — `g10-admin-users-ui`, `gaps-user-flows` (G3 out-of-scope superadmin), `spec-epic-01-academia-branding`
- `production_artifacts/2026-09-21-gaps-user-flows/feature-spec.md` — L47: "Rol superadmin separado (no existe en el modelo)"
- `QUICKSTART.md` §7 — primer ADMIN vía DB manual