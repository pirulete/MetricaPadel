# User Flows — Padel Evaluativo (v2, up-to-date)

> status: released
> release: v0.3
> date: 2026-09-21
> change_id: user-flows-v2
> module: docs
> tags: [user-flows, coach, player, admin, auth, routes, api, gaps]
> Supersede: `production_artifacts/2026-09-21-user-flows.md` (v1, pre-G5/G8/G10/R5/gaps)

---

## 1. Coach Flow (ADMIN) — full journey

```
Registro público (register) ──► TEMPORARY ──► verify-email ──► ACTIVE (USER)
   │
   ├─ (a) Promovido por otro ADMIN: POST /api/admin/users/[id]/promote  → role=ADMIN
   └─ (b) Creado por admin: POST /api/admin/users (role USER) → promote manual
```

### 1.1 Onboarding (registro → primer login)
1. `GET /register` (público) — selector coach/player es **UX pura** (D6): el backend ignora `role` y crea `USER/TEMPORARY`.
2. `POST /api/auth/register` → 201, usuario `TEMPORARY`, email de verificación enviado (Resend), trigger `account.welcome`.
3. `POST /api/auth/verify-email` (código de 6 dígitos) → status `ACTIVE`.
4. `POST /api/auth/signin` (credentials) → sesión Auth.js JWT long-lived (30 días) + sesión DB con sliding window (TTL `session_config`, default 15 min).
5. **Promoción a coach**: un ADMIN existente ejecuta `POST /api/admin/users/[id]/promote` (guardAdmin + auditUpdate). Sin esto, el usuario sigue siendo `USER` y no ve las rutas coach.

### 1.2 Gestión de rúbricas (P02/P03)
1. `GET /api/rubrics` (guardAdmin, owner) — biblioteca de rúbricas propias.
2. `POST /api/rubrics` — crea rúbrica con 4 niveles fijos (Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1), criteria + 4 descriptors cada una. Seed manual: `RUBRICA_INTEGRAL_TEMPLATE` (6 dimensiones: reglas, técnica básica, técnica específica, táctica, física, actitud).
3. `GET/PUT /api/rubrics/[id]` — editar (reemplazo completo de criteria/descriptors).
4. `DELETE /api/rubrics/[id]` — archivo soft (status=archived). Anti-IDOR: rúbrica ajena → 404.

### 1.3 Gestión de cursos (P05/P07)
1. `POST /api/courses` — crea curso con `inviteCode` `PAD-XXXX` generado (retry ≤5 en colisión).
2. `GET /api/courses` / `GET /api/courses/[id]` — listado y detalle (students + rubrics asignadas).
3. `POST /api/courses/[id]/rubrics` — asigna rúbrica activa propia al curso (409 si ya asignada).
4. `PUT /api/courses/[id]` — edita; `DELETE /api/courses/[id]` — archiva soft (enrollments/rubrics se conservan).
5. Alumno se une con el código: `POST /api/courses/join` (case-insensitive, 400 si coach se une a su propio curso, 404 código inválido, 409 ya inscrito).

### 1.4 Evaluación (P09)
1. `POST /api/evaluations` — crea borrador (teacherId=owner, studentId, rubricId, courseId opcional).
2. `GET /api/evaluations/[id]` — carga scores previos.
3. `PUT /api/evaluations/[id]` — guarda scores/globalComment en borrador (score en vivo en `ScoringCanvas`).
4. `POST /api/evaluations/[id]/publish` — valida criterios completos (`validatePublish`), publica, dispara:
   - `triggerEvaluationPublished(studentId, evaluationId)` → notificación P1 system con CTA `/evaluaciones/{id}` (dedup 1h por groupId=evaluationId).
   - Soft-block dimensional (R5): respuesta `{ evaluation, alreadyEvaluated }` si el alumno ya tiene una evaluación publicada de la misma categoría (toast warning, nunca bloquea).

### 1.5 Dashboard / Historial
1. `GET /api/dashboard/teacher` — métricas (students, evaluations, average, classesToday) + cursos propios.
2. `GET /api/history?courseId&studentId&status` — historial de evaluaciones con filtros (anti-IDOR).

### 1.6 Settings
- `GET/PUT /api/user/profile` (firstName/lastName/phone; email inmutable).
- `PUT /api/user/password` (currentPassword + newPassword ≥8, refine distinto; auditChangePassword).

---

## 2. Player Flow (USER) — full journey

```
Registro público ──► TEMPORARY ──► verify-email ──► ACTIVE (USER)
   │
   ├─ Creado por admin: POST /api/admin/users (ACTIVE directo, sin verificación; password opcional → generatedPassword devuelta UNA vez)
   └─ Se une a curso: POST /api/courses/join (inviteCode)
```

### 2.1 Onboarding
1. Registro web → TEMPORARY → verify-email → ACTIVE (igual que coach, pero sin promoción).
2. **Alternativa admin**: el coach crea al alumno con `POST /api/admin/users` (status ACTIVE directo; si no se envía password, se auto-genera y se muestra `generatedPassword` una sola vez en la respuesta).

### 2.2 Unirse a un curso
1. `POST /api/courses/join` con `inviteCode` `PAD-XXXX` → 201 (auditCreate enrollment).
2. `GET /api/student/courses/[id]` (G8) — detalle del curso: info + rúbricas asignadas + mis evaluaciones publicadas con scores enriquecidos (criterionName/levelName). 404 si no inscrito (anti-IDOR).
3. `DELETE /api/courses/[id]/enrollment` (G11) — auto-desinscripción (role USER obligatorio; 403 coach; 404 si no inscrito; re-join permitido; evaluaciones históricas intactas).

### 2.3 Ver evaluaciones (A03)
1. `GET /api/student/evaluations` — lista de evaluaciones publicadas propias.
2. `GET /api/student/evaluations/[id]` — detalle con scores (404 si ajena).
3. `POST /api/student/evaluations/[id]/read` — marca leída (idempotente).
4. Notificación push/inbox: al publicar el coach, llega `evaluation.published` (P1, CTA `/evaluaciones/{id}`).

### 2.4 Dashboard
- `GET /api/dashboard/student` — nivel derivado (`deriveLevel`), cursos del alumno, últimas 5 notificaciones del inbox.

### 2.5 Settings
- Igual que coach: perfil + cambio de contraseña.

---

## 3. Admin Flow — user management + marketing CMS

### 3.1 User Management (`/admin/users`, G10)
1. `GET /api/admin/users` — lista jugadores (search debounced 300ms, badges estado/rol).
2. `POST /api/admin/users` — crea jugador (email/nombre/apellido/password opcional → auto-generada; 409 email duplicado).
3. `GET /api/admin/users/[id]` — detalle (solo role USER; 404 si ADMIN/inexistente).
4. `PUT /api/admin/users/[id]` — edita firstName/lastName/phone (refine "al menos un campo").
5. `POST /api/admin/users/[id]/promote` — USER→ADMIN (404 si ya ADMIN/inexistente).
6. `DELETE /api/admin/users/[id]` — soft-lock (status→LOCKED). Reglas: self-lock 400, otro ADMIN 403, inexistente/no-USER 404.
7. `POST /api/admin/users/[id]/unlock` — LOCKED→ACTIVE (solo role USER).
- Todas las mutaciones: guardAdmin + auditUpdate + Zod.

### 3.2 Marketing CMS (`/admin/marketing/`)
- **Pages**: `GET/POST /api/admin/marketing/pages`, `GET/PATCH/DELETE /api/admin/marketing/pages/[id]`, secciones `POST .../sections`, `PATCH/DELETE .../sections/[sectionId]`, `PUT .../sections/reorder`. Home guard: no borrar la única `home` publicada (400).
- **Blog**: `GET/POST /api/admin/marketing/blog`, `PATCH/DELETE /api/admin/marketing/blog/[id]` (publish/unpublish).
- **Products**: `GET/POST /api/admin/marketing/products`, `PATCH/DELETE .../[id]`.
- **Categories**: `GET/POST /api/admin/marketing/categories`, `PATCH/DELETE .../[id]` (FK SET NULL).
- **Settings**: `GET/PATCH /api/admin/marketing/settings` (siteName/nav/footer).
- **Revalidate**: `POST /api/admin/marketing/revalidate` (tags whitelist).
- **Notifications settings**: `GET/PUT /api/admin/notifications/settings` (pushEnabled/inboxEnabled).
- Todas: guardAdmin + auditoría + Zod + `invalidateForEntity`/`revalidateMarketing` tras mutaciones.

---

## 4. Auth State Machine

```
                    ┌────────────────────────────┐
                    │                            │
   register ───────►│  TEMPORARY                 │
                    │  (email no verificado)     │
                    └─────────────┬──────────────┘
                                  │ verify-email (código 6 dígitos)
                                  ▼
                    ┌────────────────────────────┐
                    │  ACTIVE                    │
                    │  (puede operar)            │
                    └──────┬──────────────┬──────┘
                           │              │
        failedAttempts ≥ N │              │ admin DELETE (soft-lock)
                           ▼              ▼
                    ┌────────────────────────────┐
                    │  LOCKED                    │
                    │  (NUNCA permitido en rutas)│
                    └─────────────┬──────────────┘
                                  │ admin POST unlock → ACTIVE
                                  ▼
                              ACTIVE
```

| Transición | Trigger | Endpoint |
|---|---|---|
| → TEMPORARY | Registro web | `POST /api/auth/register` (role ignorado, D6) |
| TEMPORARY → ACTIVE | Verificar email | `POST /api/auth/verify-email` |
| TEMPORARY → ACTIVE | Creado por admin | `POST /api/admin/users` (ACTIVE directo) |
| ACTIVE → LOCKED | Admin soft-lock | `DELETE /api/admin/users/[id]` |
| LOCKED → ACTIVE | Admin unlock | `POST /api/admin/users/[id]/unlock` |
| USER → ADMIN | Promoción | `POST /api/admin/users/[id]/promote` |

- **Sesión**: JWT cookie long-lived (30 días) + sesión DB como gate real (sliding window, TTL `session_config` default 15 min). `POST /api/auth/refresh-session` revalida; `POST /api/auth/logout` destruye.
- **Password**: forgot → `POST /api/auth/forgot-password` → `verify-reset-code` → `reset-password`. Cambio desde settings: `PUT /api/user/password` (requiere ACTIVE).
- **Principio**: LOCKED nunca pasa guards; TEMPORARY solo en `GET/PUT /api/user/profile` (GET admite TEMPORARY, PUT requiere ACTIVE).

---

## 5. Complete Route Map with Guards

### 5.1 Público (sin guard)
| Ruta | Descripción |
|---|---|
| `/` `/[slug]` `/blog` `/blog/[slug]` `/shop` `/shop/[slug]` | Marketing CMS (cache tags, TTL 300s) |
| `/login` `/register` | Auth UI |
| `GET /api/public/*` (pages, posts, products, settings/navigation) | CMS público cacheado |
| `POST /api/public/contact` | Contacto (rate limit) |
| `GET /api/health` | Health check |
| `POST /api/auth/register`, `signin`, `verify-email`, `resend-code`, `forgot-password`, `verify-reset-code`, `reset-password`, `logout`, `refresh-session` | Auth (rate limit en públicos) |

### 5.2 Privado USER (`guardUser`, ACTIVE salvo nota)
| Ruta | Estados | Notas |
|---|---|---|
| `GET /api/user/profile` | TEMPORARY, ACTIVE | |
| `PUT /api/user/profile` | ACTIVE | |
| `PUT /api/user/password` | ACTIVE | auditChangePassword |
| `GET /api/student/evaluations` `[id]` `[id]/read` | ACTIVE | ownership studentId, 404 IDOR |
| `GET /api/student/courses/[id]` | ACTIVE | role USER, 404 no inscrito |
| `POST /api/courses/join` | ACTIVE | auditCreate enrollment |
| `DELETE /api/courses/[id]/enrollment` | ACTIVE | role USER, auditDelete |
| `GET /api/dashboard/student` | ACTIVE | |
| `GET/PATCH/DELETE /api/user/notifications*`, `unread-count`, `preferences` | ACTIVE | |
| `GET/POST/DELETE /api/user/push/*` | ACTIVE | rate limit, auditoría push |

### 5.3 Privado ADMIN (`guardAdmin`, ACTIVE, role ADMIN)
| Ruta | Notas |
|---|---|
| `GET/POST /api/admin/users`, `GET/PUT/DELETE/POST /api/admin/users/[id]` (+promote, +unlock) | anti-IDOR 404, self-lock 400, otro ADMIN 403 |
| `GET/POST /api/rubrics`, `GET/PUT/DELETE /api/rubrics/[id]` | owner, archive soft |
| `GET/POST /api/evaluations`, `GET/PUT /api/evaluations/[id]`, `POST .../publish` | teacherId, publish + soft-block R5 + trigger G9 |
| `GET/POST /api/courses`, `GET/PUT/DELETE /api/courses/[id]`, `GET/POST .../rubrics` | ownerId, inviteCode |
| `GET /api/dashboard/teacher` | |
| `GET /api/history` | filtros, anti-IDOR |
| `GET/POST/PATCH/DELETE /api/admin/marketing/*` (26 endpoints) | CMS + auditoría + revalidate |
| `GET/PUT /api/admin/notifications/settings` | toggles push/inbox |

### 5.4 Páginas
| Ruta | Guard | Rol |
|---|---|---|
| `app/(app)/dashboard` | layout `validateUser` + router por rol (D5) | ADMIN→teacher, USER→student |
| `app/(app)/rubricas`, `rubricas/nueva`, `rubricas/[id]` | `validateAdmin` | ADMIN |
| `app/(app)/evaluar`, `evaluar/[id]` | `validateAdmin` | ADMIN |
| `app/(app)/evaluaciones`, `evaluaciones/[id]` | layout `validateUser` | ADMIN (lista propia) / USER (publicadas propias) |
| `app/(app)/cursos`, `cursos/[id]` | layout `validateUser` + ramifica por rol | ADMIN (P07) / USER (G8) |
| `app/(app)/historial` | `validateAdmin` | ADMIN |
| `app/(app)/settings` | layout `validateUser` | ambos |
| `app/(app)/notifications` | layout `validateUser` | ambos |
| `app/admin`, `app/admin/users`, `app/admin/marketing/*` | layout `validateAdmin` | ADMIN |

---

## 6. All API Endpoints by Module

### Auth (`/api/auth/`) — 10
`register`, `signin`, `verify-email`, `resend-code`, `forgot-password`, `verify-reset-code`, `reset-password`, `logout`, `refresh-session`, `[...nextauth]`

### User (`/api/user/`) — 9
`profile` (GET/PUT), `password` (PUT), `notifications` (GET/PATCH), `notifications/[id]` (PATCH/DELETE), `notifications/unread-count` (GET), `notifications/preferences` (GET/PUT), `push/vapid-key` (GET), `push/subscription` (POST/DELETE), `push/click` (POST)

### Admin Users (`/api/admin/users/`) — 6
`GET/POST` (list/create), `[id]` GET/PUT/DELETE, `[id]/promote` POST, `[id]/unlock` POST

### Admin Marketing (`/api/admin/marketing/`) — 26
`pages` (GET/POST), `pages/[id]` (GET/PATCH/DELETE), `pages/[id]/sections` (POST), `pages/[id]/sections/[sectionId]` (PATCH/DELETE), `pages/[id]/sections/reorder` (PUT), `blog` (GET/POST), `blog/[id]` (PATCH/DELETE), `products` (GET/POST), `products/[id]` (PATCH/DELETE), `categories` (GET/POST), `categories/[id]` (PATCH/DELETE), `settings` (GET/PATCH), `revalidate` (POST)

### Admin Notifications (`/api/admin/notifications/`) — 2
`settings` (GET/PUT)

### Padel Coach (`/api/`) — 15
`rubrics` (GET/POST), `rubrics/[id]` (GET/PUT/DELETE), `evaluations` (GET/POST), `evaluations/[id]` (GET/PUT), `evaluations/[id]/publish` (POST), `courses` (GET/POST), `courses/[id]` (GET/PUT/DELETE), `courses/[id]/rubrics` (GET/POST), `dashboard/teacher` (GET), `history` (GET)

### Padel Student (`/api/student/`) — 5
`evaluations` (GET), `evaluations/[id]` (GET), `evaluations/[id]/read` (POST), `courses/[id]` (GET), + `courses/join` (POST) y `courses/[id]/enrollment` (DELETE) en `/api/courses/`

### Public (`/api/public/`) — 7
`pages/[slug]`, `posts`, `posts/[slug]`, `products`, `products/[slug]`, `settings/navigation`, `contact`

### Otros — 1
`health` (GET)

**Total: ~75 endpoints** (todos documentados en `lib/api-docs/spec.ts`).

---

## 7. Remaining Gaps

| # | Gap | Impacto | Estado |
|---|---|---|---|
| G1 | No hay edición de perfil desde el admin (solo desde settings del propio usuario) | Bajo | Open |
| G2 | No hay exportación CSV de evaluaciones/historial | Medio | Open |
| G3 | ~~Promoción USER→ADMIN~~ | — | **Cerrado** (gaps-user-flows) |
| G4 | ~~Credenciales al crear alumno~~ | — | **Cerrado** (generatedPassword) |
| G5 | ~~Settings/perfil~~ | — | **Cerrado** (g5-profile-settings) |
| G6 | No hay re-evaluación/versiones de una evaluación (solo publish único) | Medio | Open |
| G7 | No hay vista comparativa alumno (evolución entre evaluaciones) | Medio | Open |
| G8 | ~~Detalle de curso del alumno~~ | — | **Cerrado** (student-course-detail) |
| G9 | ~~Trigger evaluation.published~~ | — | **Cerrado** (gaps-user-flows) |
| G10 | ~~Admin UI gestión de usuarios~~ | — | **Cerrado** (g10-admin-users-ui) |
| G11 | ~~Auto-desinscripción de curso~~ | — | **Cerrado** (gaps-user-flows) |
| G12 | No hay gestión de alumnos por curso desde el coach (solo join por código) | Medio | Open |
| G13 | No hay notificación al coach cuando el alumno marca leída una evaluación | Bajo | Open |
| G14 | No hay plantillas de rúbrica precargadas en UI (solo seed manual `RUBRICA_INTEGRAL_TEMPLATE`) | Bajo | Open |
| G15 | No hay paginación en listados de rúbricas/evaluaciones/cursos (solo notifications tiene cursor) | Medio | Open |
| G16 | No hay soft-delete de evaluaciones (solo archive de rúbricas y cursos) | Bajo | Open |
| G17 | E2E de Etapa 1 pendientes de QA (`rubric-editor`, `evaluation-flow`, `student-view`) | Medio | Open |

**Recomendación v0.4**: G6+G7 (evolución del alumno) y G12 (gestión de alumnos por curso) son los de mayor valor para el loop evaluativo.