# Auth Impact — Módulo Torneos (M1)

> change_id: `2026-11-04-motor-torneo-ts`
> module: `torneos`
> fecha: `2026-11-04`
> alcance: registro de guards (F3b-parte1) + revisión de seguridad del worker
> **stack de auth sin cambios**: `auth.ts`, `lib/auth/admin-guard.ts`, `auth.config`, callbacks JWT/session, cookies y flujos de login/registro intactos.

---

## 1. Guards por endpoint (estado final)

| # | Endpoint | Guard | Roles | Estados permitidos | Ownership / anti-IDOR | Auditoría |
|---|---|---|---|---|---|---|
| 1 | `GET /api/torneos` | `guardAdmin` | ADMIN ∪ SUPER_ADMIN | ACTIVE | `ownerId` en el `WHERE` | — |
| 2 | `POST /api/torneos` | `guardAdmin` | ADMIN ∪ SUPER_ADMIN | ACTIVE | `ownerId` = sesión (nunca del body) | `auditCreate(tournament)` |
| 3 | `GET /api/torneos/[id]` | `guardAdmin` | ADMIN ∪ SUPER_ADMIN | ACTIVE | `getTournamentDetail(id, ownerId)` → 404 | — |
| 4 | `GET /api/torneos/[id]/instancia` | `guardAdmin` | ADMIN ∪ SUPER_ADMIN | ACTIVE | `buildInstance(id, ownerId)` → 404 | — |
| 5 | `POST /api/torneos/[id]/agenda` | `guardAdmin` (+ rate limit pendiente H1) | ADMIN ∪ SUPER_ADMIN | ACTIVE | `getTournamentById(id, ownerId)` → 404 | `auditCreate(tournament_run)` |
| 6 | `GET /api/torneos/[id]/runs/[runId]` | `guardAdmin` | ADMIN ∪ SUPER_ADMIN | ACTIVE | `getTournamentById` + `getRun(runId,{tournamentId})` → 404 | — |
| 7 | `POST /api/torneos/[id]/archive` | `guardAdmin` | ADMIN ∪ SUPER_ADMIN | ACTIVE | `archiveTournament(id, ownerId)` → 404 | `auditUpdate(tournament)` |
| 8 | `POST /api/internal/tournament-worker` | **`worker-secret`** (`x-worker-secret`) | n/a | n/a (sin sesión) | n/a: no expone datos del torneo | `auditUpdate(tournament_run)` tras `finishRun` (pendiente H4) |

- **Implementación**: `lib/auth/protected-routes.ts` (+8 entradas, sección `TORNEOS (v0.12, M1)`), más 3 líneas en el docblock de guards describiendo `worker-secret`. Ninguna entrada preexistente modificada; `RouteKey` se amplía automáticamente.
- **Estados**: `TEMPORARY` → 403 en las 7 rutas con sesión (`guardAdmin` exige `ACTIVE`). `LOCKED` → imposible en todas (el callback `jwt`/`session` de Auth.js ya invalida la sesión; `guardAdmin` vuelve a exigir `ACTIVE`). Sin rutas de alumno en M1 ⇒ ningún `guardUser` que registrar.

## 2. Decisión: worker por secreto, no por `guardAdmin`

| Criterio | `guardAdmin` | **Secreto (`x-worker-secret`)** |
|---|---|---|
| Quién invoca | coach desde el browser | servidor → servidor (`dispatchRun`) |
| Sesión | requiere cookie JWT | inexistente por diseño |
| Latencia | valida sesión + DB por request | 1 hash + 1 compare; el claim es la única escritura previa al solver |
| CSRF | relevante (cookie) | no aplica (sin cookie) |
| Falla si no está configurado | n/a | **503 `worker_not_configured` fail-closed** — jamás "sin auth" |
| Blast radius si se filtra | sesión de un coach | ejecutar/reclamar cualquier run `queued` (no lee datos; el solve se acota por clamp + 1 run activo) |

**Decisión**: el worker es una superficie *interna* (`/api/internal/*`), no un endpoint de usuario. Se autentica con secreto compartido comparado por `sha256` + `timingSafeEqual` (digests de longitud constante ⇒ no se filtra la longitud). Se **rechaza** `guardAdmin` porque obligaría a propagar la cookie de sesión entre servidores (peor: expone el JWT del coach a un hop extra) y **se rechaza** "sin auth" porque el endpoint dispara CPU/WASM. Sin fallback: si `TOURNAMENT_WORKER_SECRET` no existe, 503.

## 3. Auditoría por mutación

| Mutación | Evento | Actor | Estado |
|---|---|---|---|
| Import de torneo | `CREATE tournament` | `session.user.id` | ✅ implementado |
| Generar agenda | `CREATE tournament_run` (`timeLimitMs` efectivo post-clamp) | `session.user.id` | ✅ implementado |
| Archivar torneo | `UPDATE tournament {status} → {status:'archived'}` | `session.user.id` | ✅ implementado |
| Cierre del run (worker) | `UPDATE tournament_run {running} → {terminal, slotsCount, timeMs, error.code}` | `run.requestedBy` (ya persistido al crear el run) | ⏳ F3b-parte2 (H4) |

Ningún evento nuevo en `audit_logs`: se reutilizan `auditCreate`/`auditUpdate` genéricos con `entityName ∈ {tournament, tournament_run}` (DV-3 del technical-design — evitar wrappers específicos es decisión de simplicidad).

## 4. Variables de entorno

| Var | Sensibilidad | Requerida | Nota |
|---|---|---|---|
| `TOURNAMENT_WORKER_SECRET` | **secreta** (server-only, ≥32 chars) | sí en prod (503 fail-closed) | `openssl rand -hex 32`. Nunca en bundle, logs ni respuestas. Rotación = redeploy del mismo commit en ambos lados (emisor y worker comparten env). |
| `TOURNAMENT_MAX_TIME_LIMIT_MS` | no | no (default 240000) | techo del clamp; no es control de seguridad por sí sola (el clamp tiene su propio `min(240s)`). |
| `TOURNAMENT_WORKER_URL` | no (config) | no | override plan B contenedor. **Nunca** se construye desde input del usuario ⇒ sin SSRF. |

`.env.example` documentado (`.env.local` no se tocó, regla del repo).

## 5. Impacto en sesiones / revalidación

- **Cero cambios** en `auth.ts`, callbacks `jwt`/`session`, TTL (`session_config`), sliding window, `failedAttempts`, `LOCKED`, verify-email, reset-password, logout.
- Los endpoints nuevos son `POST/GET` puntuales: no crean ni renuevan sesión, no tocan cookies, no requieren revalidación adicional. El `force-dynamic` (donde está declarado) evita cualquier caché sobre datos derivados de la sesión.
- `GET /api/torneos/[id]` y `…/runs/[runId]` tienen un **efecto lateral de escritura** (reaper perezoso). Es seguro bajo `guardAdmin` porque el ownership se valida antes (404) y el reaper solo actúa sobre runs del torneo propio; no requiere elevación ni auditoría (es mantenimiento idempotente derivable del estado).

## 6. Riesgos restantes

| # | Riesgo | Severidad | Mitigación / estado |
|---|---|---|---|
| R1 | Secreto del worker filtrado (env leak, log accidental) ⇒ un tercero puede reclamar runs `queued` de cualquier torneo | Media | rotación por redeploy; `timingSafeEqual` sin eco; logs solo `runId`; el claim no lee datos y el trabajo está acotado (clamp ≤240 s, 1 run activo/torneo). No hay endpoint que devuelva el secreto. |
| R2 | Auditoría no atómica respecto de la mutación (import/agenda/archive) | Baja | H8 en `security-checklist.md`: try/catch para no devolver 500 tras commit. Patrón preexistente del repo. |
| R3 | Cierre del run sin auditoría hasta F3b-parte2 | Media | H4: `auditUpdate(tournament_run)` con actor `run.requestedBy` dentro del handler. |
| R4 | Ausencia de rate limit en `POST /agenda` e `POST /torneos` (§6.0 del technical-design) | Media | H1/H2. Aun sin él: solo ADMIN autenticado, 1 run activo por torneo, clamp + R6 acotan el coste. |
| R5 | `handleAdmin` valida `status` desde el JWT, no desde DB | Baja (preexistente, repo-wide) | `session_config` + callback `jwt` invalidan la sesión al cambiar el estado; cualquier `LOCKED` cae antes de llegar al handler. Sin cambio en M1. |
| R6 | Reaper invocado desde un `GET` (efecto lateral en método seguro) | Baja | Solo escribe en runs del propio owner, idempotente, y es el mecanismo que garantiza AC-09 (nunca `running` eterno). Documentado en `protected-routes.ts`. |
| R7 | `highs` (WASM) en el runtime del worker: superficie de memoria/CPU | Baja | `runtime='nodejs'` (nunca edge), `maxDuration=300`, `serverExternalPackages` si F1 lo exige; gate `audit_deps` de @qa-release. |

**Sin riesgos críticos.** El módulo no altera el modelo de autenticación; añade 7 endpoints de coach correctamente guardados y 1 endpoint interno con autenticación por secreto fail-closed.

## 7. Tests de seguridad esperados (F5b, referencia)

- `tests/api/torneos/worker-guard.spec.ts`: 401 sin header · 401 secreto inválido · 409 `not_claimed` · 503 sin env (fail-closed).
- `tests/api/torneos/torneos-guard.spec.ts`: 401 sin sesión · 403 `USER`/`TEMPORARY` · 404 torneo ajeno · 409 doble POST/`archived` · 422 `infeasible_occupancy` · 400 regla de cargador.
- `tests/unit/torneos/limits.test.ts` (o equivalente existente): `clampTimeLimit` nunca supera `min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)` con input adversarial.
