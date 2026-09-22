# User Flows — Padel Evaluativo (End-to-End)

> status: released
> release: v0.2
> date: 2026-09-21
> change_id: user-flows-documentation
> module: docs
> tags: [user-flows, e2e, validation, roles, auth, padel]

## Propósito

Documento de validación end-to-end de todas las features released (Etapa 1 v0.1 + Etapa 2+3 v0.2). Sirve como checklist funcional para @qa-release y como mapa de navegación para el equipo. Cada flujo indica: pasos, endpoints involucrados, guards, estados de usuario y gaps conocidos.

---

## 1. Coach Flow (rol ADMIN)

> **Cómo se convierte en ADMIN**: NO hay auto-registro con rol ADMIN (D6 — el backend ignora `role` del body y siempre crea USER/TEMPORARY). El rol ADMIN se asigna **solo** vía seed o edición directa en DB (`users.role = 'ADMIN'`). No existe endpoint público ni admin para promover a ADMIN. **GAP**: ver §4.

### 1.1 Registro y primer acceso
1. Visita `/register` (SCR-02) — selector coach/player es UX pura.
2. Completa email + password + nombre/apellido → `POST /api/auth/register`.
3. Backend crea `USER`/`TEMPORARY` (el selector NO crea ADMIN). Email duplicado → 400; rate limit → 429.
4. Recibe email de verificación → `POST /api/auth/verify-email` → estado `ACTIVE`.
5. Login en `/login` (SCR-03) → `POST /api/auth/signin` → sesión Auth.js (JWT + sliding session DB).
6. **Nota**: un coach recién registrado es USER, no ADMIN. Para operar como coach necesita que su rol sea ADMIN (seed/DB).

### 1.2 Dashboard Profesor (P01)
1. Accede a `/dashboard` → router por rol (D5): ADMIN ve `teacher-dashboard`.
2. `GET /api/dashboard/teacher` (guardAdmin, ACTIVE) → métricas: alumnos (COUNT enrollments), evaluaciones (COUNT teacherId=me), promedio (AVG totalScore/maxScore publicadas), clases hoy.
3. CTA "Evaluar ahora" → `/evaluar` (P09). Lista "Mis cursos" → `/cursos` (P05). Bottom nav: Dashboard / Cursos / Historial / Rúbricas.

### 1.3 Crear Rúbrica (P03)
1. `/rubricas` (P02) → "Nueva Rúbrica" → `/rubricas/nueva`.
2. Título + categoría (tecnica/tactica/fisica/actitud) + niveles fijos 4 (Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1) + matriz de descriptores por criterio (mínimo 1 criterio, 4 descriptores por criterio).
3. Guardar → `POST /api/rubrics` (guardAdmin, auditCreate). Status inicial `draft`.
4. Editar → `/rubricas/[id]` → `PUT /api/rubrics/[id]` (reemplazo completo de criteria/descriptors).

### 1.4 Publicar Rúbrica
1. Desde el editor o biblioteca → cambiar status a `active` (vía PUT).
2. Solo rúbricas `active` son asignables a cursos (P08) y usables en evaluaciones.
3. Archivar → `DELETE /api/rubrics/[id]` (soft archive, status=archived; evaluaciones históricas intactas).

### 1.5 Crear Curso (P06) y obtener invite code
1. `/cursos` (P05) → "Crear curso" → modal (P06).
2. Nombre + nivel (iniciacion/intermedio/avanzado) + horario + días → `POST /api/courses` (guardAdmin, auditCreate).
3. Backend genera `inviteCode` `PAD-XXXX` (UNIQUE, retry ≤5 en colisión) → se muestra con botón copiar.
4. Detalle → `/cursos/[id]` (P07) → `GET /api/courses/[id]` (ownerId=me, 404 si ajeno): tabs Alumnos / Rúbricas asignadas + código invite.

### 1.6 Asignar Rúbrica a Curso (P08)
1. En `/cursos/[id]` tab Rúbricas → "Asignar rúbrica" → modal 2 pasos: elegir rúbrica `active` propia + alumnos inscritos.
2. `POST /api/courses/[id]/rubrics` (guardAdmin, auditCreate) → 409 si ya asignada (UNIQUE courseId+rubricId); 404 si curso/rúbrica ajenos; 400 si rúbrica archivada.
3. Curso sin alumnos → empty state, botón deshabilitado.

### 1.7 Evaluar Alumno (P09)
1. `/evaluar` → `GET /api/evaluations` (lista borradores propios) + StudentPicker (`GET /api/admin/users` solo role USER) + rúbrica activa.
2. `/evaluar/[id]` → ScoringCanvas: selector de nivel (4 cards) por criterio, score en vivo (`lib/padel/score.ts`), nota opcional por criterio, comentario global.
3. Guardar borrador → `POST /api/evaluations` (crea draft) + `PUT /api/evaluations/[id]` (scores/globalComment).
4. Publicar → `POST /api/evaluations/[id]/publish` (valida criterios completos → 400 si falta nivel; auditUpdate publish). Se setea `publishedAt`, `totalScore`/`maxScore` denormalizados.
5. Opcional: `courseId` en la evaluación (nullable, FK set null).

### 1.8 Ver Detalle de Evaluación (A03 — vista coach)
1. Desde historial o lista → `GET /api/evaluations/[id]` (teacherId=me, 404 si ajeno).
2. Muestra scores, comentario, estado draft/published.

### 1.9 Ver Historial (P10)
1. `/historial` → `GET /api/history` (guardAdmin) con filtros courseId/studentId/status.
2. Solo evaluaciones con teacherId=me (anti-IDOR → 404).

### 1.10 Crear Estudiantes desde Admin
1. `POST /api/admin/users` (guardAdmin, auditCreate) → crea usuario `USER` con status `ACTIVE` directo (sin verificación de email, D5).
2. `GET /api/admin/users` lista jugadores (solo role USER) para el picker de P09.
3. `GET /api/admin/users/[id]` detalle (404 si no es USER).
4. **Nota**: el alumno creado por admin NO recibe email de bienvenida ni credenciales por email (ver §4).

---

## 2. Player Flow (rol USER)

### 2.1 Registro y verificación
1. `/register` (SCR-02) → selector coach/player (UX) → `POST /api/auth/register` → siempre `USER`/`TEMPORARY`.
2. Verifica email → `POST /api/auth/verify-email` → `ACTIVE`. Reenvío: `POST /api/auth/resend-code`.
3. Login → `/login` (SCR-03) → `POST /api/auth/signin`.

### 2.2 Dashboard Alumno (A01)
1. `/dashboard` → router por rol (D5): USER ve `student-dashboard`.
2. `GET /api/dashboard/student` (guardUser, ACTIVE) → nivel (primer curso activo), notificaciones recientes (inbox), "Mis cursos".
3. CTA "Únete a un curso" → modal input PAD-XXXX (A02).

### 2.3 Unirse a Curso (A02)
1. Ingresa código `PAD-XXXX` → `POST /api/courses/join` (guardUser, auditCreate).
2. 201 éxito; 404 código inválido/curso archivado; 409 ya inscrito; 400 si el coach intenta unirse a su propio curso.
3. Lookup case-insensitive (`upper()`).

### 2.4 Ver Detalle de Curso
1. Desde dashboard "Mis cursos" → `GET /api/courses/[id]`? **NO** — ese endpoint es guardAdmin (ownerId=me). El alumno ve sus cursos vía `GET /api/dashboard/student` (enrollments activos). **GAP**: no hay endpoint de detalle de curso para USER (ver §4).

### 2.5 Recibir Evaluaciones Publicadas
1. El coach publica una evaluación con studentId=me → `publishedAt` set.
2. El alumno ve la lista en `/evaluaciones` → `GET /api/student/evaluations` (solo publicadas, studentId=me).
3. **Nota**: no hay notificación push/inbox automática al publicar (trigger `evaluation.published` es post-MVP). El alumno solo se entera al entrar.

### 2.6 Ver Detalle de Evaluación (A03)
1. `/evaluaciones/[id]` → `GET /api/student/evaluations/[id]` (publicada, propia; 404 si ajena).
2. Hero con score total + barra de progreso, comentario del profesor, desglose por criterio (nivel + descriptor).
3. Botón "Marcar como leído" → `POST /api/student/evaluations/[id]/read` (idempotente, set readAt si null).

### 2.7 Historial de Evaluaciones (alumno)
1. El alumno ve sus evaluaciones publicadas en `/evaluaciones` (lista). No hay página de historial separada para USER (P10 es solo coach).

---

## 3. Admin Flow (Plataforma — mismo rol ADMIN)

> **No existe super-admin separado.** El rol `ADMIN` es a la vez coach (dominio padel) y administrador de plataforma (marketing CMS, notificaciones, usuarios). Un ADMIN puede hacer todo.

### 3.1 Gestión de Usuarios
- `GET/POST /api/admin/users`, `GET /api/admin/users/[id]` — crear/listar jugadores (solo role USER). No hay UI admin de usuarios en `app/admin` (solo API + picker en P09). **GAP**: sin UI de gestión de usuarios.

### 3.2 Marketing CMS
- `/admin/marketing/` — CRUD pages/blog/products/categories/settings (12 rutas API, guardAdmin + auditoría + revalidateTag). Ya implementado (v0.1).

### 3.3 Notification Settings
- `GET/PUT /api/admin/notifications/settings` — toggles pushEnabled/inboxEnabled (guardAdmin + auditoría). UI en `/admin/notifications`? **GAP**: verificar si existe página admin de notificaciones (spec v0.3 la menciona; no confirmada en rutas actuales).

---

## 4. Missing Flows / Gaps

| # | Flujo | Estado | Detalle |
|---|-------|--------|---------|
| G1 | **Email verification (TEMPORARY → ACTIVE)** | ✅ Implementado | `verify-email`, `resend-code` existen. UI de verificación: modal/estado en login (validar UX). |
| G2 | **Password reset** | ✅ Implementado (API) | `forgot-password`, `verify-reset-code`, `reset-password` existen. Reset pone estado TEMPORARY (requiere re-verificación). UI de forgot-password: **verificar** si hay página. |
| G3 | **Coach → ADMIN promotion** | ⚠️ GAP | No hay endpoint ni UI para promover USER→ADMIN. Solo seed/DB manual. Un coach registrado por web queda USER y no puede operar. |
| G4 | **Email al crear estudiante** | ⚠️ GAP | `POST /api/admin/users` crea ACTIVE sin enviar email de bienvenida ni credenciales. El alumno no sabe su password. |
| G5 | **Profile management** | ⚠️ Parcial | `GET/PUT /api/user/profile` existen (PUT solo ACTIVE). No hay página de settings/perfil en `app/(app)` (solo avatar data-layer). |
| G6 | **Course archiving** | ✅ Implementado | `DELETE /api/courses/[id]` soft archive (status=archived). UI: verificar botón en P07. |
| G7 | **Rubric archiving** | ✅ Implementado | `DELETE /api/rubrics/[id]` soft archive. UI en P02 (menú contextual). |
| G8 | **Course detail para USER** | ⚠️ GAP | El alumno no tiene endpoint de detalle de curso (solo dashboard con enrollments). No puede ver alumnos/rúbricas del curso. |
| G9 | **Notificación al publicar evaluación** | ⚠️ GAP (post-MVP) | No hay trigger `evaluation.published` en el inbox. El alumno no recibe aviso. |
| G10 | **Admin UI de usuarios** | ⚠️ GAP | Solo API; sin página en `/admin` para gestionar usuarios. |
| G11 | **Salir de curso (enrollment delete)** | ⚠️ GAP (post-MVP) | No existe endpoint para que el alumno abandone un curso. |
| G12 | **Editar/borrar enrollments por coach** | ⚠️ GAP | No hay endpoint para remover un alumno de un curso. |

---

## 5. Auth State Machine

### Estados de usuario
| Estado | Cómo se entra | Qué puede hacer | Cómo sale |
|--------|---------------|-----------------|-----------|
| `TEMPORARY` | Registro público (`POST /api/auth/register`); reset de password | Nada en rutas privadas (solo `GET /api/user/profile` lo admite) | `POST /api/auth/verify-email` → ACTIVE |
| `ACTIVE` | Verificación de email; creación admin (`POST /api/admin/users` crea ACTIVE directo) | Todo según rol (USER/ADMIN) | Reset password → TEMPORARY; intentos fallidos → LOCKED |
| `LOCKED` | Demasiados intentos fallidos de login (`incrementFailedAttempts`) | Nada — nunca permitido en rutas privadas | Reset password (`forgot-password` resetea failedAttempts y pasa a TEMPORARY) |

### Roles
| Rol | Dominio | Guard | Rutas |
|-----|---------|-------|-------|
| `USER` | Player / Alumno | `guardUser` (ACTIVE) | `/api/student/*`, `/api/courses/join`, `/api/dashboard/student`, perfil |
| `ADMIN` | Coach + Plataforma | `guardAdmin` (ACTIVE + role ADMIN) | `/api/rubrics`, `/api/evaluations`, `/api/courses`, `/api/dashboard/teacher`, `/api/history`, `/api/admin/*` |

### Transiciones
```
Registro ──► TEMPORARY ──verify-email──► ACTIVE ──failed attempts──► LOCKED
                 ▲                          │                            │
                 └────── reset-password ◄───┘                            │
                 (reset también limpia failedAttempts) ◄─────────────────┘
Admin crea usuario ──► ACTIVE directo (sin TEMPORARY, sin email)
```

---

## 6. Route Map

### Públicas (sin sesión)
| Ruta | Descripción |
|------|-------------|
| `/` , `/[slug]`, `/blog`, `/shop` | Marketing CMS (público, cacheado) |
| `/login` (SCR-03) | Login |
| `/register` (SCR-02) | Registro (siempre USER/TEMPORARY) |
| `/api/auth/*` | register, signin, verify-email, resend-code, forgot-password, verify-reset-code, reset-password, logout, refresh-session |
| `/api/public/*` | Marketing público cacheado + contact (rate limit) |

### Privadas — `app/(app)` (layout `validateUser`)
| Ruta | Guard | Rol | Estados |
|------|-------|-----|---------|
| `/dashboard` | router por rol (D5) | ADMIN→P01, USER→A01 | ACTIVE |
| `/rubricas` (P02) | `validateAdmin` | ADMIN | ACTIVE |
| `/rubricas/nueva`, `/rubricas/[id]` (P03) | `validateAdmin` | ADMIN | ACTIVE |
| `/evaluar`, `/evaluar/[id]` (P09) | `validateAdmin` | ADMIN | ACTIVE |
| `/evaluaciones` (A03 lista) | `validateUser` | USER | ACTIVE |
| `/evaluaciones/[id]` (A03) | `validateUser` | USER | ACTIVE |
| `/cursos` (P05) | `validateAdmin` | ADMIN | ACTIVE |
| `/cursos/[id]` (P07) | `validateAdmin` | ADMIN | ACTIVE |
| `/historial` (P10) | `validateAdmin` | ADMIN | ACTIVE |
| `/notifications` | `validateUser` | USER+ADMIN | ACTIVE |

### Privadas — `app/admin` (layout `validateAdmin`)
| Ruta | Descripción |
|------|-------------|
| `/admin` | Home admin |
| `/admin/marketing/*` | CMS (pages, blog, products, categories, settings) |

### API protegida (resumen por guard)
| Guard | Endpoints |
|-------|-----------|
| `guardAdmin` (ACTIVE, role ADMIN) | `/api/admin/users*`, `/api/admin/marketing/*`, `/api/admin/notifications/settings`, `/api/rubrics*`, `/api/evaluations*`, `/api/courses*` (excepto join), `/api/dashboard/teacher`, `/api/history` |
| `guardUser` (ACTIVE) | `/api/student/evaluations*`, `/api/courses/join`, `/api/dashboard/student`, `/api/user/profile*`, `/api/user/push/*`, `/api/user/notifications*` |
| `guardUser` (TEMPORARY+ACTIVE) | `GET /api/user/profile` (único endpoint que admite TEMPORARY) |

---

## Checklist de Validación E2E Sugerida

1. **Coach**: seed ADMIN → login → crear rúbrica → publicar → crear curso → asignar rúbrica → crear alumno (admin) → evaluar → publicar → ver historial.
2. **Player**: registrar → verificar email → login → join curso → ver evaluación publicada → marcar leído.
3. **Guards**: sin sesión → 401; USER en rutas coach → 403; ADMIN en rutas alumno → 403; IDOR → 404.
4. **Estados**: TEMPORARY no opera; LOCKED bloqueado; reset password → TEMPORARY → re-verificar.
5. **Gaps G3/G4/G8/G9/G10**: documentar como pendientes para próximas etapas.