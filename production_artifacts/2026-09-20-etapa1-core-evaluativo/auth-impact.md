# Auth Impact — Etapa 1: Core Evaluativo (Rúbricas + Evaluaciones)

> change_id: etapa1-core-evaluativo
> module: auth
> date: 2026-09-20
> status: in-progress

## 1. Resumen de Impacto

No se modifica `auth.ts`, ni el flujo de login, ni los enums de rol/estado. Se reutilizan los guards existentes (`guardAdmin`/`guardUser` para API, `validateAdmin`/`validateUser` para páginas). El ownership se resuelve en queries (filtro por `ownerId`/`teacherId`/`studentId`), no en guards nuevos (decisión D1 del technical design).

## 2. Mapeo de Guards por Endpoint

| Endpoint | Guard | Ownership | Auditoría |
|----------|-------|-----------|-----------|
| `POST /api/admin/users` | guardAdmin | — (crea USER) | `auditCreate(user)` |
| `GET /api/admin/users` | guardAdmin | — (solo role USER) | — |
| `GET /api/rubrics` | guardAdmin | ownerId = session.user.id | — |
| `POST /api/rubrics` | guardAdmin | ownerId = session.user.id | `auditCreate(rubric)` |
| `GET /api/rubrics/[id]` | guardAdmin | ownerId (404 si ajeno) | — |
| `PUT /api/rubrics/[id]` | guardAdmin | ownerId (404 si ajeno) | `auditUpdate(rubric)` |
| `DELETE /api/rubrics/[id]` | guardAdmin | ownerId (404 si ajeno) | `auditDelete(rubric, archive)` |
| `GET /api/evaluations` | guardAdmin | teacherId = session.user.id | — |
| `POST /api/evaluations` | guardAdmin | teacherId = session.user.id | `auditCreate(evaluation)` |
| `GET /api/evaluations/[id]` | guardAdmin | teacherId (404 si ajeno) | — |
| `PUT /api/evaluations/[id]` | guardAdmin | teacherId (404 si ajeno) | `auditUpdate(evaluation)` |
| `POST /api/evaluations/[id]/publish` | guardAdmin | teacherId (404 si ajeno) | `auditUpdate(evaluation, publish)` |
| `GET /api/student/evaluations` | guardUser | studentId = session.user.id | — |
| `GET /api/student/evaluations/[id]` | guardUser | studentId (404 si ajeno) | — |
| `POST /api/student/evaluations/[id]/read` | guardUser | studentId (404 si ajeno) | — (idempotente, baja sensibilidad) |

## 3. Guard Server-side Verificado

- `guardAdmin(session)`: 401 sin sesión; 403 si `role !== 'ADMIN'` o `status !== 'ACTIVE'`. Bloquea USER, TEMPORARY y LOCKED. ✅
- `guardUser(session)`: 401 sin sesión; 403 si `status === 'LOCKED'`. Admite TEMPORARY/ACTIVE. ✅
- Páginas: `validateAdmin()` en P02/P03/P09 (coach), `validateUser()` en A03 (alumno). `app/(app)/layout.tsx` ya bloquea LOCKED. ✅

## 4. Ownership Anti-IDOR (decisión D3)

- Toda query de lectura/escritura recibe `ownerId`/`teacherId`/`studentId` y filtra con `and(eq(...), eq(...))`.
- Recurso ajeno → **404** (no 403) para no filtrar existencia de IDs.
- Verificación obligatoria en tests: `tests/api/padel/guard.spec.ts` debe cubrir 404 IDOR (rúbrica ajena, evaluación ajena, evaluación de otro alumno).

## 5. Revisión de Seguridad — `POST /api/admin/users`

Capacidad nueva: crear usuario jugador `USER` con `status=ACTIVE` sin verificación de email.

| Riesgo | Mitigación |
|--------|-----------|
| Creación masiva de cuentas | Solo ADMIN+ACTIVE puede llamar (guardAdmin). Sin auto-registro. |
| Email duplicado | 409 + unique constraint en `users.email`. |
| Password débil | Zod `min 8` + `bcrypt.hash(password, 10)` reutilizado de `lib/db/queries/auth.ts`. |
| Abuso / spam | Auditoría `auditCreate(user)` en cada creación. Considerar rate limit por IP si se detecta abuso (no bloqueante en Etapa 1). |
| Cuenta sin verificar | Aceptado por diseño (flujo admin): el alumno debe poder loguearse. Documentar en FEATURES.md. |

## 6. Auditoría Configurada

- Mutaciones auditadas: crear/editar/archivar rúbrica, crear/guardar/publicar evaluación, crear usuario admin.
- `POST /api/student/evaluations/[id]/read` **no** se audita (idempotente, baja sensibilidad, evita ruido en audit_logs) — decisión explícita.
- Todas las mutaciones usan `lib/audit/helpers.ts` (`auditCreate`/`auditUpdate`/`auditDelete`) con `extractRequestContext(request)` para IP/user-agent.

## 7. Rutas Protegidas Documentadas

`lib/auth/protected-routes.ts` actualizado con 15 endpoints padel (sección "PADEL EVALUATIVO"): guards, allowedStatuses, roles y audit por endpoint. Es referencia para implementación de route handlers.

## 8. Archivos Modificados

- `lib/auth/protected-routes.ts` — +15 rutas padel, descripción actualizada de `POST /api/admin/users`.
- Sin cambios en `auth.ts`, `lib/auth/admin-guard.ts`, `lib/auth/password.ts`.

## 9. Tests de Seguridad Requeridos

- `tests/api/padel/guard.spec.ts`: 401 sin sesión, 403 USER en endpoints coach, 403 ADMIN en endpoints alumno, 404 IDOR.
- `tests/unit/db/admin-users.test.ts`: createActiveUser (hash, ACTIVE, USER), email duplicado.
- `tests/unit/db/rubrics.test.ts` / `evaluations.test.ts`: ownership (404 ajeno).