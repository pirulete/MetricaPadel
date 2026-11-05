# Security Checklist — Módulo Torneos (M1)

> change_id: `2026-11-04-motor-torneo-ts`
> module: `torneos`
> fecha: `2026-11-04`
> alcance revisado: F2b (`/api/torneos`, `/api/torneos/[id]`, `/api/torneos/[id]/instancia`), F3a1 (`/agenda`, `/runs/[runId]`), F3a2 (`/archive`, `lib/torneos/dispatch.ts`, `lib/torneos/limits.ts`), contrato del worker F3b (§6.5)
> leyenda: ✅ OK · ⚠️ a corregir en F3b-parte2 (@app-engineer) · ℹ️ informativo (sin acción)

---

## 1. Autenticación y autorización (guardAdmin por endpoint)

| Endpoint | Guard server-side | Estados | LOCKED | Verificación |
|---|---|---|---|---|
| `GET /api/torneos` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/route.ts:27-29` |
| `POST /api/torneos` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/route.ts:70-72` |
| `GET /api/torneos/[id]` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/[id]/route.ts:30-32` |
| `GET /api/torneos/[id]/instancia` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/[id]/instancia/route.ts:25-27` |
| `POST /api/torneos/[id]/agenda` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/[id]/agenda/route.ts:33-35` |
| `GET /api/torneos/[id]/runs/[runId]` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/[id]/runs/[runId]/route.ts:34-36` |
| `POST /api/torneos/[id]/archive` | `auth()` + `guardAdmin` | ACTIVE | imposible | ✅ `app/api/torneos/[id]/archive/route.ts:24-26` |
| `POST /api/internal/tournament-worker` | `x-worker-secret` (sin sesión) | n/a | n/a | ⏳ pendiente F3b (§4) |

- **`guardAdmin` acepta `ADMIN` ∪ `SUPER_ADMIN` + `ACTIVE`** (`lib/auth/admin-guard.ts`): el coach de plataforma y el super admin entran; `USER`/`TEMPORARY` → 403; sin sesión → 401. ✅
- Ningún handler lee `role`/`ownerId` del body o query: el ownership sale de `session.user.id`. ✅ (`route.ts:104`, `[id]/route.ts:35`, `agenda:38`, `archive:29`, `runs:39`)
- No hay rutas de alumno en M1 (sin publicación) ⇒ no hay endpoint `guardUser` que validar. ✅

## 2. Anti-IDOR (404, sin oráculo de existencia)

| Ruta | Clave de ownership | Resultado ajeno | Verificación |
|---|---|---|---|
| `GET /api/torneos` | `listTournaments(ownerId)` filtra en SQL | lista vacía | ✅ `route.ts:35` |
| `POST /api/torneos` | `importTournament(ownerId=sesión)` | n/a | ✅ `route.ts:104-105` |
| `GET /api/torneos/[id]` | `getTournamentDetail(id, ownerId)` → `null` | **404** | ✅ `[id]/route.ts:36-39` |
| `GET …/instancia` | `buildInstance(id, ownerId)` → `null` | **404** | ✅ `instancia/route.ts:30-33` |
| `POST …/agenda` | `getTournamentById(id, ownerId)` + `buildInstance(id, ownerId)` | **404** | ✅ `agenda/route.ts:40-46, 58-64` |
| `GET …/runs/[runId]` | `getTournamentById` **y** `getRun(runId, { tournamentId })` | **404** | ✅ `runs/[runId]/route.ts:45-51, 58-64` |
| `POST …/archive` | `getTournamentById` + `archiveTournament(id, ownerId)` | **404** | ✅ `archive/route.ts:31-37, 39` |

- **Orden correcto en el reaper**: en `GET /api/torneos/[id]` y `…/runs/[runId]` el ownership se valida **antes** de `reapStaleRuns(id)` ⇒ el reaper (que **escribe**) nunca toca un torneo ajeno. ✅ (`[id]/route.ts:36-41`, `runs/[runId]/route.ts:45-53`)
- `runId` ajeno a un torneo propio ⇒ `getRun` filtra por `tournamentId` ⇒ 404. Sin fuga de existencia entre torneos. ✅
- `409 run_active` devuelve `activeRunId` **solo** del torneo propio (ya pasó el 404 de ownership). ✅ `agenda/route.ts:96-106`

## 3. Auditoría de mutaciones

| Mutación | Helper | Entidad | Verificación |
|---|---|---|---|
| `POST /api/torneos` (import) | `auditCreate` | `tournament` | ✅ `route.ts:113-118` (incluye `name` + counts) |
| `POST …/agenda` (generar) | `auditCreate` | `tournament_run` | ✅ `agenda/route.ts:109-114` (`tournamentId`, `timeLimitMs` efectivo, `mipRelGap`) |
| `POST …/archive` | `auditUpdate` | `tournament` | ✅ `archive/route.ts:50-56` (`{status: old} → {status:'archived'}`) |
| `POST /api/internal/tournament-worker` | *(dentro de `finishRun`)* | `tournament_run` | ⏳ pendiente F3b (§4.3) |

- El `timeLimitMs` auditado es el **efectivo** (post-clamp), no el del body: trazabilidad real de AC-09. ✅ `agenda/route.ts:82, 112`
- Contexto de request (`ip`, `userAgent`) presente en las 3 mutaciones. ✅
- ⚠️ **Auditoría no atómica** (patrón heredado del repo, no regresión de M1): `createAuditLog` hace `db.insert` fuera de la transacción del dominio. Si falla, la mutación ya está commiteada y el handler responde 500 (el usuario reintenta y puede duplicar: en import crearía otro torneo, en agenda el 409 `run_active` lo frena). **Archivo:línea**: `app/api/torneos/route.ts:113`, `app/api/torneos/[id]/agenda/route.ts:109`, `app/api/torneos/[id]/archive/route.ts:50`. **Fix exacto (F3b-parte2)**: envolver en `try { await auditCreate(...) } catch (error) { console.error("[torneos] auditoría falló", ...) }` y devolver el status de éxito (la mutación ya ocurrió; la traza se pierde pero el cliente no recibe un 500 engañoso). Severidad **baja**, consistente con `courses`/`transitions`.

## 4. Worker interno — contrato de seguridad (§6.5, a implementar en F3b)

### 4.1 Secreto (OBLIGATORIO al implementar)

| Control | Requisito | Estado |
|---|---|---|
| Secreto ausente en el entorno | **503** `{code:'worker_not_configured'}` **fail-closed** — jamás "sin auth" | ⏳ |
| Header ausente / vacío | **401** (sin distinguir "falta" de "inválido" en el body) | ⏳ |
| Comparación | `crypto.timingSafeEqual(sha256(provided), sha256(expected))` — digests de longitud **constante**, no filtra longitud ni prefijo | ⏳ |
| Claim antes de trabajo pesado | verificar secreto **primero**, luego `claimRun`; nunca buildInstance/solve sin claim | ⏳ |
| Logs | nunca `console.*` con el secreto, ni con `expected`/`provided`; solo `runId` y códigos | ⏳ |
| Respuesta | `{ runId, status, timeMs }` — **cero** datos del torneo (no es un endpoint de lectura) | ⏳ |
| Runtime | `runtime='nodejs'` (nunca `edge`), `dynamic='force-dynamic'`, `maxDuration=300` | ⏳ |
| Zod | body `{ runId: uuid }` validado **antes** del claim; 400 `invalid_body` en otro caso | ⏳ |
| Sesión/cookies | **no** llamar `auth()`; el endpoint no acepta cookie como alternativa al secreto | ⏳ |

**Notas de implementación para F3b-parte2** (patrón exacto sugerido, sin archivo nuevo):

```ts
const expected = process.env.TOURNAMENT_WORKER_SECRET?.trim();
if (!expected) return NextResponse.json({ code: "worker_not_configured" }, { status: 503 });
const provided = request.headers.get("x-worker-secret") ?? "";
const digest = (v: string) => createHash("sha256").update(v).digest();
if (!timingSafeEqual(digest(provided), digest(expected))) {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 }); // nunca eco del secreto
}
```
`timingSafeEqual` sobre digests evita el `RangeError` por longitudes distintas **sin** filtrar la longitud por temporización.

### 4.2 Superficie DoS

| Vector | Mitigación existente | Estado |
|---|---|---|
| Runs concurrentes por torneo | Índice UNIQUE **parcial** `tournament_runs_active_uq … WHERE status IN ('queued','running')` ⇒ `23505` ⇒ 409 `run_active` (`runs.ts:188-215`) | ✅ |
| Presupuesto de solve | `clampTimeLimit` server-side `[30s, min(240s, TOURNAMENT_MAX_TIME_LIMIT_MS)]`; el body nunca bypassa (AC-09) | ✅ `lib/torneos/limits.ts:83-99` |
| Instancias gigantes | R6: `MAX_MATCHES=600`, `MAX_CELLS=120_000` ⇒ 422 antes de crear run | ✅ `lib/torneos/limits.ts:22-25` + `loader.ts` |
| Worker colgado | reaper perezoso `running` > `maxDuration+60s` ⇒ `failed(worker_crash)`; claim atómico ⇒ motor corre ≤1 vez por run | ✅ |
| Doble dispatch | `dispatchRun` solo incrementa si sigue `queued` (un claim no cobra intento) ⇒ idempotente | ✅ `lib/torneos/dispatch.ts:97-110` |
| Worker sin claim | 409 `not_claimed` idempotente, sin trabajo de solver | ⏳ F3b |

### 4.3 Auditoría del worker

⚠️ **A corregir en F3b-parte2**: `finishRun` (`lib/db/queries/torneos/runs.ts:261`) **no** inserta auditoría y el worker aún no existe. La fila `tournament_runs` (status terminal, métricas, `error.code`, `slotsCount`) es el rastro principal, pero el cierre de un run es una mutación sensible (genera agenda). **Fix exacto**: en `app/api/internal/tournament-worker/route.ts`, tras `finishRun(...)` exitoso, `await auditUpdate("tournament_run", runId, { status: "running" }, { status: terminal, slotsCount, timeMs, error: error?.code ?? null }, { userId: run.requestedBy ?? undefined, ...extractRequestContext(request) })`, envuelto en try/catch (patrón §3). Usa `run.requestedBy` que ya viene en la fila reclamada — no inventar actor.

## 5. Validación de entrada (Zod / loader)

| Superficie | Validación | Estado |
|---|---|---|
| `POST /api/torneos` body | `parseTournamentInput` (Zod + 4 reglas + R0/R6 con `path` por campo); `importTournament` revalida (defensa en profundidad) | ✅ `route.ts:84-102`, `loader.ts` |
| JSON malformado en import | `request.json()` catch ⇒ **400** `invalid_json` | ✅ `route.ts:74-82` |
| `POST …/agenda` body | `generateAgendaSchema` (Zod; `mipRelGap` 0..1, `force` boolean, `timeLimitMs` clampeado) | ✅ `agenda/route.ts:54-56` |
| `POST …/agenda` body malformado | ⚠️ `request.json().catch(() => ({}))` ⇒ un JSON roto se trata como body vacío y **genera el run** (202). **Archivo:línea**: `app/api/torneos/[id]/agenda/route.ts:54`. **Fix exacto**: replicar el patrón del import — `let body: unknown; try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido", code: "invalid_json" }, { status: 400 }) }` y luego parsear con Zod. Severidad **baja** (no es bypass de validación, el clamp sigue aplicando; es contrato). |
| `GET …/runs/[runId]` query | `runQuerySchema` (`include` enum) + `runParamsSchema` (`id`, `runId` uuid) | ✅ `runs/[runId]/route.ts:14-16, 38-42` |
| `[id]` params | `padelIdParamsSchema` (uuid) en las 5 rutas dinámicas | ✅ |
| `GET /api/torneos` paginación | `paginationQuerySchema` (limit 1..50, cursor ISO) | ✅ `route.ts:31-33` |
| Inyección SQL | 100% Drizzle con binds parametrizados; cero `sql.raw` con input de usuario | ✅ |

⚠️ **Tamaño de body**: ningún sitio del repo limita el body antes de `request.json()` (patrón global), y el import puede recibir un JSON arbitrariamente grande antes de que R6 lo rechace (`MAX_CELLS` se evalúa post-parse). **Archivo:línea**: `app/api/torneos/route.ts:76`. **Fix exacto (F3b-parte2, 4 líneas)**: antes del parse, `const declared = Number(request.headers.get("content-length") ?? 0); if (declared > 2 * 1024 * 1024) return NextResponse.json({ error: "Payload demasiado grande", code: "payload_too_large" }, { status: 413 })`. Severidad **baja** (solo ADMIN autenticado + Vercel ya limita ~4.5 MB).

## 6. Rate limiting

| Endpoint | Requerido por §6.0 | Estado |
|---|---|---|
| `POST /api/torneos/[id]/agenda` | **sí** (`guardAdmin` + rate limit) | ⚠️ **faltante** |
| `POST /api/torneos` (import, CPU+DB pesado) | recomendado | ⚠️ faltante |
| Resto (`GET`) | no | ✅ |

**Archivo:línea**: `app/api/torneos/[id]/agenda/route.ts:32-35` (sin bloque de rate limit tras el guard).
**Fix exacto (F3b-parte2, patrón `academy-invite`)**:
```ts
import { checkPublicRateLimit, extractIP, rateLimitedResponse, ACADEMY_INVITE_MAX, ACADEMY_INVITE_WINDOW_MS } from "@/lib/rate-limit";
const ip = extractIP(request);
const rate = checkPublicRateLimit(`torneos-agenda:${ip}`, { max: ACADEMY_INVITE_MAX, windowMs: ACADEMY_INVITE_WINDOW_MS });
if (!rate.allowed) return rateLimitedResponse(rate.resetTime, ACADEMY_INVITE_MAX);
```
Idem para `POST /api/torneos` con key `torneos-import:${ip}`. El patrón ya tolera `NODE_ENV=test` (límite alto) ⇒ no rompe los specs existentes. Nota: el rate limit es IP-based y **detrás del guard**, así que solo frena la cuenta ADMIN comprometida / abuso de un solo coach; el tope real de concurrencia sigue siendo el índice parcial + clamp.

## 7. Cookies, CSRF y caché

| Control | Estado |
|---|---|
| CSRF | ✅ Los 6 endpoints son `POST/PUT` con body JSON: un formulario cross-site no puede enviar `content-type: application/json` sin preflight; `SameSite=Lax` de Auth.js bloquea el envío de la cookie en POST cross-site. El worker no usa cookies ⇒ no es objetivo de CSRF. |
| Cookie de sesión | ✅ Sin cambios en `auth.ts`: JWT en cookie HTTP-only (`SameSite=Lax`, `Secure` en prod) gestionada por Auth.js. Nada de token en `localStorage`. |
| `Cache-Control` / fuga vía CDN | ✅ Respuestas privadas con `auth()`; ningún endpoint devuelve `public` ni `revalidate`. El worker responde datos mínimos y **no** es cacheable por CDN (POST). ℹ️ no se añade `Cache-Control: no-store` explícito porque el patrón del repo no lo hace en APIs autenticadas. |
| `dynamic = 'force-dynamic'` donde hay cookies | ⚠️ **Inconsistente dentro del propio módulo**: `[id]`, `agenda`, `runs/[runId]` y `archive` lo declaran; **`app/api/torneos/route.ts:10` y `app/api/torneos/[id]/instancia/route.ts:8` no** (solo `runtime='nodejs'`). `auth()` lee cookies ⇒ Next los evalúa dinámicamente igual, pero la declaración explícita evita que un refactor futuro introduzca caché sobre datos de sesión. **Fix (F3b-parte2)**: añadir `export const dynamic = "force-dynamic";` en ambos archivos. Severidad **baja**. |

## 8. Fugas de información en respuestas y logs

- Errores 500 devuelven `{ error: "Error interno del servidor" }` sin stack ni mensaje de driver. ✅ (`route.ts:52-55`, `[id]/route.ts:87-90`, `agenda:131-134`, `archive:67-70`, `runs:85-88`)
- 400/422 devuelven `details` del loader: son errores **del propio input** del coach (con `path`), no de infraestructura. ✅ fidelidad necesaria para UX de import.
- `console.error` en handlers y en `dispatch.ts` loguea `runId`/`error` — sin secretos, sin tokens de sesión, sin payloads completos. ✅ (`dispatch.ts:117-120, 143-146`)
- El secreto **nunca** se loguea ni se devuelve, ni siquiera en el 401/503 (los mensajes son códigos). ⏳ verificar al implementar (§4.1).
- `TOURNAMENT_WORKER_SECRET` es server-only: **no** hay var `NEXT_PUBLIC_*` en el módulo. ✅ `.env.example:96-106`

## 9. OWASP Top 10 (2021) — síntesis del módulo

| Categoría | Evaluación |
|---|---|
| A01 Broken Access Control | ✅ `guardAdmin` en las 6 rutas + ownership SQL + 404 anti-IDOR + reaper después del check. ⚠️ el worker añade una superficie de autenticación por secreto: se implementa en §4.1 con fail-closed. |
| A02 Cryptographic Failures | ⏳ secreto comparado con `sha256` + `timingSafeEqual` (digests). Sin hashes débiles ni cifrado propio. |
| A03 Injection | ✅ Zod + Drizzle parametrizado; cero SQL crudo con input. |
| A04 Insecure Design | ✅ 1 run activo por torneo (índice parcial DB, no lógica) + clamp de tiempo + R6 + reaper idempotente ⇒ el peor caso ABUSIVO ya está acotado. |
| A05 Security Misconfiguration | ⚠️ falta `dynamic` en 2 handlers y rate limit en 2 POST (§6, §7). El resto (runtime `nodejs`, `maxDuration`) correcto. |
| A06 Vulnerable Components | ℹ️ única dependencia nueva `highs` (WASM): verificar licencia MIT y que el `.wasm` no se sirva públicamente (gestionado por `serverExternalPackages`, gate de @qa-release). |
| A07 Auth Failures | ✅ guards globales sin cambios; worker sin sesión ni fallback abierto (503 fail-closed). |
| A08 Integrity Failures | ✅ imports validados + transacción atómica (`importTournament`), `finishRun` en 1 tx (nunca agenda parcial). |
| A09 Logging Failures | ✅ `audit_logs` en las 3 mutaciones de API. ⚠️ cierre del run sin auditoría (§4.3) y no atomicidad del audit (§3). ⏳ worker. |
| A10 SSRF | ⚠️ ℹ️ `dispatchRun` hace `fetch` a `TOURNAMENT_WORKER_URL ?? NEXT_PUBLIC_BASE_URL` — **ambas de entorno, no del usuario**, y `baseUrl` cae a `request.nextUrl.origin` (mismo origen, controlado por el proxy). No hay URL de input ⇒ sin SSRF explotable. Aun así: al implementar el worker, **no** aceptar URL/`callbackUrl` desde el body. |

## 10. Hallazgos accionables para F3b-parte2 (@app-engineer)

| # | Severidad | Archivo:línea | Fix |
|---|---|---|---|
| H1 | **Media** | `app/api/torneos/[id]/agenda/route.ts:32-35` | Rate limit `torneos-agenda:{ip}` tras el guard (§6) |
| H2 | **Media** | `app/api/torneos/route.ts:70-72` | Rate limit `torneos-import:{ip}` tras el guard (§6) |
| H3 | **Media** | `app/api/internal/tournament-worker/route.ts` (nuevo) | Secreto: 503 fail-closed, sha256 + `timingSafeEqual`, secreto primero, Zod `{runId: uuid}` antes del claim, logs sin secreto (§4.1) |
| H4 | **Media** | `app/api/internal/tournament-worker/route.ts` (nuevo) | `auditUpdate('tournament_run', …)` tras `finishRun` exitoso, actor `run.requestedBy`, try/catch (§4.3) |
| H5 | Baja | `app/api/torneos/[id]/agenda/route.ts:54` | JSON malformado ⇒ 400 `invalid_json` en vez de `{}` (§5) |
| H6 | Baja | `app/api/torneos/route.ts:76` | Pre-check `content-length` > 2 MB ⇒ 413 (§5) |
| H7 | Baja | `app/api/torneos/route.ts:10`, `app/api/torneos/[id]/instancia/route.ts:8` | `export const dynamic = "force-dynamic"` (§7) |
| H8 | Baja | `app/api/torneos/route.ts:113`, `agenda:109`, `archive:50` | `try/catch` alrededor de `auditCreate/auditUpdate` para no devolver 500 tras mutación commiteada (§3) |

**Sin hallazgos críticos ni altos.** Los 8 son endurecimiento; ninguno bloquea el release salvo H3 (es la razón de existir del worker y sin él el endpoint queda sin autenticación — por eso es parte del alcance F3b, no un fix posterior).

## 11. Verificación de registro

- `lib/auth/protected-routes.ts`: 8 entradas nuevas (7 `guardAdmin` + 1 `worker-secret`), sin tocar entradas existentes ni `guardAdmin`/`auth.ts`. ✅
- `.env.example`: 3 variables documentadas, sin `NEXT_PUBLIC_*`, `.env.local` intacto. ✅
- Tests esperados (F5b): `tests/api/torneos/worker-guard.spec.ts` 401 sin header / 401 secreto inválido / 409 `not_claimed` / 503 sin env; `torneos-guard.spec.ts` 401/403/404/409/422/400. ⏳
