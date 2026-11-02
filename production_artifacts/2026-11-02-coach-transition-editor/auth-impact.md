# Auth Impact — Editor de Transiciones (coach/ADMIN)

> change_id: `2026-11-02-coach-transition-editor`
> status: `approved-for-implementation`
> date: 2026-11-02
> module: `padel`
> owner: @auth-security
> inputs: `technical-design.md` (v1), `change-map.md` (v1), `feature-spec.md`
> **Versioning**: `v1`. Revisiones → `auth-impact-v2.md` (nunca se sobrescribe v1).

---

## 0. Veredicto

**Sin cambios en el modelo de autenticación.** No se toca `auth.ts`, JWT/session callbacks, cookies, estados (`TEMPORARY`/`ACTIVE`/`LOCKED`), roles globales ni flujos de register/signin/reset. La superficie nueva es **5 endpoints API** y **3 rutas de página**, ambas cubiertas por guards existentes:

| Capa | Helper exacto | Archivo |
|---|---|---|
| API (5 handlers) | `guardAdmin(session)` | `lib/auth/admin-guard.ts:67` |
| Páginas (3 rutas) | `validateAdmin()` | `lib/auth/admin-guard.ts:20` |

`guardAdmin` es **síncrono** y devuelve `NextResponse | null` (null = OK); `validateAdmin` es **async** y hace `redirect()`. No se añaden guards nuevos.

**Riesgo residual aceptado (informativo)**: `guardAdmin` acepta `ADMIN` **y** `SUPER_ADMIN` (`ADMIN_ROLES = ['ADMIN','SUPER_ADMIN']`, `lib/auth/role-utils.ts:7`). `protected-routes.ts` documenta `roles: ['ADMIN']` por convención del repo (igual que `/api/rubrics`, `/api/courses`). Un `SUPER_ADMIN` puede operar el editor; su propiedad queda igualmente aislada por `ownerId`. No es un hallazgo, es comportamiento intencional de la jerarquía.

---

## 1. Matriz de estados × superficie

| Superficie | Sin sesión | `LOCKED` | `USER` + `ACTIVE` | `ADMIN`/`SUPER_ADMIN` + `TEMPORARY` | `ADMIN`/`SUPER_ADMIN` + `ACTIVE` |
|---|---|---|---|---|---|
| `GET/POST /api/transitions` | `401` | `403` ¹ | `403` | `403` | `200`/`201` |
| `GET/PUT/DELETE /api/transitions/[id]` | `401` | `403` ¹ | `403` | `403` | `200` · **`404` si ajeno/inexistente** |
| `/transiciones`, `/nueva`, `/[id]` | `redirect /login` ² | `redirect /login` ³ | `redirect /dashboard` | `redirect /dashboard` | render |

¹ `LOCKED` no puede autenticarse (`auth.ts:47-50`); si el status cambia a `LOCKED` con un JWT vivo, `guardAdmin` cae por `status !== 'ACTIVE'` → `403`. `guardUser`/`guardAdmin` **nunca** permiten `LOCKED`.
² `validateAdmin()` → `!session` → `redirect('/login')`.
³ `app/(app)/layout.tsx` ejecuta `validateUser()` **antes** que el page: `LOCKED` → `redirect('/login')`; `TEMPORARY` → pantalla "Verifica tu email" (no llega al page). `validateAdmin()` corre después como segunda barrera → `redirect('/dashboard')`.
**`TEMPORARY` nunca ve datos de transiciones**: bloqueado en layout (página) y `403` en API.

---

## 2. Guard por endpoint (contrato exacto para @app-engineer)

Patrón obligatorio, idéntico a `app/api/rubrics/route.ts:19-21` — **guard antes de leer body/params/DB**:

```ts
const session = await auth();
const guardError = guardAdmin(session);
if (guardError) return guardError;
// recién aquí: Zod → query DB con ownerId = session!.user.id
```

| # | Endpoint | `runtime` | Guard (línea 1) | Orden de rechazos | Auditoría |
|---|---|---|---|---|---|
| 1 | `GET /api/transitions` | `nodejs` | `guardAdmin` | `401` → `403` → `400` (query Zod) | — |
| 2 | `POST /api/transitions` | `nodejs` | `guardAdmin` | `401` → `403` → `400` (body Zod) → `201` | `auditCreate` |
| 3 | `GET /api/transitions/[id]` | `nodejs` | `guardAdmin` | `401` → `403` → `400` (uuid) → **`404`** | — |
| 4 | `PUT /api/transitions/[id]` | `nodejs` | `guardAdmin` | `401` → `403` → `400` → **`404`** → `200` | `auditUpdate` |
| 5 | `DELETE /api/transitions/[id]` | `nodejs` | `guardAdmin` | `401` → `403` → `400` (uuid) → **`404`** → `200` | `auditDelete` |

Reglas:
- **`400` de uuid solo después del guard** (el no autenticado nunca obtiene señal de formato de path).
- **`403` ≠ `404`**: el `403` es de rol/estado (antes de tocar DB); el `404` es de **propiedad inexistente** (después del filtro `ownerId`). Nunca `403` por recurso ajeno (evita oráculo de existencia → EC-06).
- `ownerId` **siempre** de `session!.user.id`; **jamás** del body, query o path.
- Error de DB/auditoría → `500` con `{ error: "Error interno del servidor" }` (nunca mensaje de Postgres).

### 2.1 Páginas (UI)

| Ruta | Guard | Notas |
|---|---|---|
| `app/(app)/transiciones/page.tsx` | `await validateAdmin()` (1ª línea del componente) | `USER` → `/dashboard` |
| `app/(app)/transiciones/nueva/page.tsx` | `await validateAdmin()` | idem |
| `app/(app)/transiciones/[id]/page.tsx` | `await validateAdmin()` | idem; `404` de la API → `notFound()` |

- Patrón de referencia: `app/(app)/rubricas/[id]/page.tsx:11` (server component con `validateAdmin` + componente client que llama la API con cookies del navegador). **No** hacer `fetch` server-side a `/api/transitions` sin reenviar cookies (el guard daría `401`); si el page necesita datos, el fetch va en el client component (como `RubricEditor`).
- Sin lógica de autorización en componentes visuales (regla AGENTS.md): la UI **no** decide; solo renderiza lo que la API ya filtró.

---

## 3. `lib/auth/protected-routes.ts` — alcance real (respuesta a la duda 3)

**Este archivo es SOLO para route handlers de API.** Claves con formato `'METHOD /api/…'`; el header lo declara explícitamente: *"REFERENCIA para implementación de route handlers — no es un middleware automático"* (`protected-routes.ts:1-24`). **No existen claves para páginas** (`/rubricas`, `/cursos`, `/admin/*` no están registrados ahí); las páginas se documentan en este `auth-impact.md` y en `ARCHITECTURE.md`.

→ **Se añaden exactamente 5 claves** (método + path de API), ninguna para `/transiciones`, `/nueva` o `/[id]`:

```ts
  // ─── PADEL EVALUATIVO — Transiciones (coach/ADMIN) ─────────────
  'GET /api/transitions': {
    guard: 'guardAdmin', allowedStatuses: ['ACTIVE'], roles: ['ADMIN'],
    description: 'Lista transiciones del coach (ownerId=me, cursor updatedAt, anti-IDOR)',
  },
  'POST /api/transitions': {
    guard: 'guardAdmin', allowedStatuses: ['ACTIVE'], roles: ['ADMIN'],
    description: 'Crea transición (ownerId=me; scenario jsonb {initialStepIndex,steps})',
    audit: 'auditCreate(coach_transition)',
  },
  'GET /api/transitions/[id]': {
    guard: 'guardAdmin', allowedStatuses: ['ACTIVE'], roles: ['ADMIN'],
    description: 'Lee transición completa (ownerId=me, 404 si ajena/inexistente)',
  },
  'PUT /api/transitions/[id]': {
    guard: 'guardAdmin', allowedStatuses: ['ACTIVE'], roles: ['ADMIN'],
    description: 'Reemplazo completo title+scenario (ownerId=me, 404 si ajena)',
    audit: 'auditUpdate(coach_transition)',
  },
  'DELETE /api/transitions/[id]': {
    guard: 'guardAdmin', allowedStatuses: ['ACTIVE'], roles: ['ADMIN'],
    description: 'Hard delete (sin FKs entrantes; audit_logs conserva rastro; ownerId=me, 404 si ajena)',
    audit: 'auditDelete(coach_transition)',
  },
```

`allowedStatuses: ['ACTIVE']` **nunca** incluye `LOCKED` ni `TEMPORARY`.

---

## 4. Anti-IDOR / BOLA (OWASP A01) — requisito por endpoint

Fuente de la propiedad: `coach_transitions.owner_id` (FK `users.id`). Toda query recibe `ownerId` como **primer parámetro** (convención `lib/db/queries/padel/courses.ts`).

| Endpoint | Filtro obligatorio | Recurso ajeno |
|---|---|---|
| `GET /api/transitions` | `and(eq(ownerId), cursor ? lt(updatedAt, cursor) : undefined)` — **`ownerId` en el `WHERE` incluso con cursor**; `orderBy(desc(updatedAt))` | No aparece en la página (nunca se devuelve) |
| `POST /api/transitions` | `values({ ownerId: ownerId_de_sesión, ... })` | n/a (no hay id de entrada) |
| `GET /api/transitions/[id]` | `where(and(eq(id), eq(ownerId)))` → `null` → `404` | `404` |
| `PUT /api/transitions/[id]` | `update(...).where(and(eq(id), eq(ownerId))).returning()` → `[]` → `404` | `404` (sin ventana TOCTOU) |
| `DELETE /api/transitions/[id]` | `delete(...).where(and(eq(id), eq(ownerId))).returning()` → `[]` → `404` | `404` |

**Verificaciones explícitas para el implementador:**
1. El listado **no** debe admitir `ownerId`/`userId` por query string. `transitionListQuerySchema = paginationQuerySchema` (solo `limit` + `cursor`) → parámetros extra **descartados** por Zod (no rompe, no escala privilegios).
2. El cursor **no** relaja el aislamiento: `lt(updatedAt, cursor)` se **agrega** al `and`, nunca lo reemplaza. Un cursor de otra cuenta no expone filas ajenas (el `ownerId` sigue en el `WHERE`).
3. `cursor` ya está validado como ISO (`paginationQuerySchema`, `z.string().datetime({ offset: true })`) → sin `Invalid Date` hacia Postgres (evita `500` + ruido).
4. `stepCount` en el listado se calcula en SQL con `jsonb_array_length(scenario->'steps')` usando **template `sql` con identificador de columna** (`sql<number>\`COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)\``); **prohibido** interpolar strings de usuario.
5. Ownership **re-validado en la mutación**, no solo en el read previo (§5.2): el read previo es para `oldValues`, el `UPDATE`/`DELETE` siempre lleva `where(and(id, ownerId))`.
6. `updatedAt` se setea en el `UPDATE` (`new Date()`); `POST` lo deja al `defaultNow()`.

**DTO sin datos sensibles:** `TransitionDto`/`TransitionSummary` exponen `id, title, steps, initialStepIndex, createdAt, updatedAt` (lista: `stepCount`). **No** se devuelve `ownerId`, email ni datos del usuario; `scenario` completo **no** se incluye en el listado.

---

## 5. Auditoría obligatoria en las 3 mutaciones

Reutilizar helpers genéricos (D-12); **no** crear wrappers de dominio en `lib/audit/helpers.ts`. Import: `import { auditCreate, auditUpdate, auditDelete, extractRequestContext } from "@/lib/audit/helpers"`.

Contexto **siempre**: `{ userId: session!.user.id, ...extractRequestContext(request) }` (mismo patrón que `app/api/rubrics/route.ts:67`).

| Endpoint | Llamada exacta | Payload |
|---|---|---|
| `POST` | `auditCreate("coach_transition", created.id, { title, stepCount: steps.length }, ctx)` | tras el insert OK, antes del `201` |
| `PUT` | `auditUpdate("coach_transition", id, { title: old.title, stepCount: old.steps.length }, { title: new.title, stepCount: new.steps.length }, ctx)` | **5 argumentos** (ver §6.1) |
| `DELETE` | `auditDelete("coach_transition", id, { title: deleted.title, stepCount: deleted.steps.length }, ctx)` | `oldValues` desde el `.returning()` del delete |

Reglas:
- **Nunca** auditar `scenario`/coordenadas completas: el payload es `{ title, stepCount }` → acota tamaño de `audit_logs` y evita volcar material de clase a logs.
- `entityName` literal `"coach_transition"` (minúsculas, snake) → consistente con `"rubric"`, `"course"`, `"evaluation"`.
- `entityId` = uuid real de la fila (columna `audit_logs.entity_id` es NOT NULL).
- Si la mutación devuelve `404` o `400` → **no** se audita (no hubo cambio).
- Semántica de fallo idéntica al repo (rubrics): si `createAuditLog` falla tras el commit, el handler responde `500` aunque el dato persistió. Aceptado; no se introduce transacción con auditoría en esta feature.

### 5.1 Mapa de eventos

`CREATE` / `UPDATE` / `DELETE` sobre `coach_transition` (los `action_type` genéricos ya existen, p. ej. `audit_logs` de `/api/rubrics`). Sin migración de enums ni `audit_logs` nuevos.

---

## 6. Huecos detectados en `technical-design.md` v1 → requisitos explícitos

No se reescribe el diseño (evita `technical-design-v2.md`); estos puntos son **obligatorios** para @app-engineer:

### 6.1 `auditUpdate` tiene 5 argumentos, no 4
La tabla §3.2 del diseño abrevia `auditUpdate(entity, id, old, new)`. Firma real: `auditUpdate(entityName, entityId, oldValues, newValues, context)` (`lib/audit/helpers.ts:36-42`). Llamarlo con 4 argumentos deja `context` `undefined` → `createAuditLog` sin `userId` (evento anónimo) o `TypeError`. **Usar la firma de 5.**

### 6.2 `PUT` necesita un read previo **para `oldValues`**, no para autorizar
`update(...).returning()` solo devuelve la fila nueva; `oldValues` se obtiene con `getTransitionById(ownerId, id)` **antes** del update:
- read `null` → `404` (sin update, sin auditoría);
- update `.returning()` vacío (carrera con otro tab/delete) → `404`;
- la autorización efectiva sigue siendo el `where(and(id, ownerId))` del update (D-05 last-write-wins, sin `version` → sin `409`).

### 6.3 `DELETE` usa `.returning()` para el `oldValues`
Hard delete (D-04): el payload de auditoría se construye con la fila devuelta por el delete; **no** hacer un `SELECT` previo extra (innecesario) ni auditar con valores reconstruidos del request.

### 6.4 `roles: ['ADMIN']` es documental, no restrictivo
`guardAdmin` acepta `SUPER_ADMIN`. Mantener `['ADMIN']` por consistencia con el resto del archivo; no añadir lógica condicional para excluir `SUPER_ADMIN`.

### 6.5 Rate limit: no aplica (coherente con el repo)
`/api/rubrics`, `/api/courses`, `/api/evaluations` **no** tienen rate limit (solo `/api/auth/*`, `/api/academy-requests`, push). Añadirlo solo a transiciones sería inconsistente y fuera de alcance. **No** se añade; queda registrado como decisión consciente.

### 6.6 Tamaño de body (endurecimiento opcional, no bloqueante)
`steps` ≤ 50 × 4 puntos + shot ≈ 20-60 KB. Zod lo acota **después** de `request.json()`. Si @app-engineer quiere margen anti-DoS: rechazar `content-length > 256 KB` con `413` **antes** del parse. Opcional (P3); si se omite, no es un hallazgo porque el payload está acotado por schema y el endpoint es autenticado `ADMIN+ACTIVE`.

---

## 7. Sesión, CSRF y cookies — revisión (sin cambios requeridos)

| Control | Estado | Evidencia |
|---|---|---|
| Estrategia de sesión | JWT 30d + `sessions.token` en DB como gate real + sliding window | `auth.ts:163-168`, `auth.ts:214-234` |
| Revalidación por request | El callback `jwt` relee `users` (status/role frescos) y mata la sesión si `sessions.token` no existe | `auth.ts:189-222` → un `LOCKED` reciente se propaga sin esperar al guard |
| Session timeout | `SESSION_ACCESS_TOKEN_TTL` / tabla `session_config` (default 15 min) | sin cambios |
| Cookies | Defaults de Auth.js v5 (`httpOnly`, `sameSite=lax`, `secure` en prod con prefijo `__Secure-`) — **no** se sobrescriben | `auth.ts` no define `cookies` |
| CSRF | `skipCSRFCheck` solo en `NODE_ENV === "development"`; mutaciones son JSON (`application/json`) → cross-site form no puede forjar el body; sin cabeceras CORS añadidas | `auth.ts:172` |
| Autorización en cliente | Prohibida: la UI no decide acceso; `use-transitions.ts` solo consume API y propaga `401/403/404` | regla AGENTS.md |

No se modifica `NEXTAUTH_SECRET`, `trustHost`, ni el flujo de login.

---

## 8. OWASP Top 10 (2021) — evaluación del cambio

| Riesgo | Aplica | Mitigación en esta feature |
|---|---|---|
| **A01 Broken Access Control** | **Sí (principal)** | `guardAdmin` en 5 handlers; `validateAdmin` en 3 páginas; `ownerId` de sesión en **todas** las queries (incl. list con cursor); ajeno/inexistente → `404`; sin `ownerId` desde cliente; `roles`/`status` desde DB vía callback `jwt`, no del token firmado viejo |
| **A02 Cryptographic Failures** | No | No se añaden secretos, hashes ni cifrado. Sin variables de entorno nuevas |
| **A03 Injection** | Sí (bajo) | Drizzle parametrizado; único `sql` crudo es `jsonb_array_length(<col> -> 'steps')` con identificador de columna, **sin** interpolación de input; `id` validado como uuid por Zod antes de la query; `jsonb` lo serializa el driver (no hay SQL string building) |
| **A04 Insecure Design** | Sí | Sin mass assignment: `transitionCreateSchema` no declara `ownerId`/`id` (`createdAt`/`updatedAt`); `PUT` = reemplazo completo (D-06) sin campos parciales ambiguos; `version` omitido con last-write-wins justificado (D-05) |
| **A05 Security Misconfiguration** | Bajo | `runtime = "nodejs"`; respuestas `500` genéricas (sin detalle de Postgres); sin CORS nuevo; sin `dangerouslySetInnerHTML` para `title`/`label` (React escapa) |
| **A06 Vulnerable Components** | No | Cero dependencias nuevas (`package.json` intacto) |
| **A07 Identification/Auth Failures** | Sí (bajo) | No se tocan login/registro/reset; `LOCKED` no autentica (`auth.ts:47`) y no pasa `guardAdmin`; `TEMPORARY` → `403` |
| **A08 Data/Software Integrity** | No | Sin cambios de build/CI; migración aditiva generada por `db:generate` |
| **A09 Logging/Monitoring Failures** | Sí | `CREATE`/`UPDATE`/`DELETE` auditados con `userId` + IP + UA; payload acotado (`title`, `stepCount`), sin volcar `scenario` |
| **A10 SSRF** | No | Sin fetch a URLs de usuario |

**IDOR/BOLA (A01) es el único riesgo material** → cubierto por el test de dos coaches en `transitions-guard.spec.ts`.

---

## 9. Tests de seguridad exigidos (chunk C2, `tests/api/padel/transitions-guard.spec.ts`)

Patrón copiado de `tests/api/padel/courses-guard.spec.ts` (helpers de `tests/api/admin/marketing/helpers.ts`, `serverUp()` con `test.skip` graceful, `HAS_DB` para los bloques con SQL real).

| # | Caso | Asserts |
|---|---|---|
| 1 | Sin sesión | `GET/POST /api/transitions` → `401`; `GET/PUT/DELETE /api/transitions/[uuid]` → `401` (sin body válido: el guard corre antes de Zod) |
| 2 | `USER` + `ACTIVE` | los 5 → `403` |
| 3 | `role=ADMIN` + `status=TEMPORARY` | los 5 → `403` (prueba el `status !== 'ACTIVE'`, no solo el rol). Requiere insert con SQL directo (`tests/api/auth/helpers.ts:insertUser` fuerza ACTIVE → usar INSERT propio con `status='TEMPORARY', role='ADMIN'`; `authorize` **sí** deja entrar a `TEMPORARY`, solo bloquea `LOCKED`) |
| 4 | **IDOR cross-coach** | Coach A (ADMIN) crea transición; Coach B (ADMIN) → `GET /[id]` `404`, `PUT /[id]` `404`, `DELETE /[id]` `404`; y `GET /api/transitions` de B **no** contiene el id de A |
| 5 | Id inexistente (uuid v4 random) como ADMIN | `GET/PUT/DELETE` → `404` (mismo código que ajeno: no oráculo) |
| 6 | Caso feliz mínimo | ADMIN `POST` → `201` con `id`; `GET /[id]` → `200` (lo cubre `transitions-happy.spec.ts`, no este archivo) |

**E2E (`tests/e2e/transition-editor.spec.ts`, lo escribe @app-engineer)**: `USER` navega a `/transiciones` → expect `**/dashboard`; y llamada directa a `/api/transitions` desde el contexto del `USER` → `403` (AC-09). Cubre la frontera UI + API.

Cobertura: no se reduce `lib/auth/` (sin cambios); aumenta `lib/db/queries/padel/` y `lib/validations/padel.ts`.

---

## 10. Documentación / artifacts

- `lib/auth/protected-routes.ts`: **5 claves** (§3). Doc-only, sin runtime effect.
- `ARCHITECTURE.md`: fila de "Convenciones de Seguridad" ya cubre `guardAdmin`/auditoría → @architect añade tabla/endpoints de transiciones, **sin** cambios en la sección de auth.
- `FEATURES.md`: entrada de la feature (responsable: @pm/@qa-release según change-map #40); debe mencionar `module: padel`, `tags: [api, db, ui, auth]` y que **no** hay cambios de auth (solo guards existentes).
- `lib/api-docs/spec.ts`: obligatorio documentar los 5 endpoints con `401/403/404` en `responses` (@app-engineer, C4).

## 11. Rollback (perspectiva de seguridad)

`DROP TABLE coach_transitions` + borrar los 2 route handlers: no hay sesiones, roles, permisos ni `audit_logs` que dependan de la tabla. Las filas de `audit_logs` con `entity_name='coach_transition'` **permanecen** (rastro histórico, correcto). Cero impacto en `auth.ts`.
