# Design Review F4 — Cross-Agent Review UI ↔ API ↔ Contrato

> change_id: `2026-11-04-motor-torneo-ts` · release `v0.12` · module `torneos` · fecha `2026-11-04`
> revisor: @app-engineer (modo revisión de viabilidad, **solo lectura + este artifact**)
> alcance: F4a (`page.tsx`, `tournament-list`, `tournament-import-modal`) + F4b (`[id]/page.tsx`, `agenda-grid`, `diagnostics-panel`, `use-tournament-run`)
> fuentes: `technical-design.md` §6/§7/§9, `technical-design-v2.md` §a.3/§a.9/§b.3, `change-map.md` #40–#46, `design-review.md` (F2b), `app-notes.md` §F4a/§F4b, árbol de trabajo
> veredicto: **VIABLE para cerrar F4** — 0 bloqueantes, 4 mayores, 13 menores. Los 4 mayores son deuda de release/higiene, **no** desalineaciones UI↔API.

---

## 0. Método

1. Contraste campo por campo: cada valor que consumen `tournament-list`, `[id]/page.tsx`, `agenda-grid`, `diagnostics-panel` y `use-tournament-run` contra la respuesta real de los 7 route handlers y de los queries que los alimentan.
2. Traza de códigos de estado del hook contra los `status`/`code` que devuelven `POST .../agenda`, `GET .../runs/[runId]` y `guardAdmin`.
3. Verificación de reutilización de UI kit, colores, guards server-side y estados vacío/loading/error.
4. No-regresión: `git status --short`, `git diff --stat`, `git diff` de `lib/db/schema.ts`, `package.json`, `pnpm-lock.yaml`, `_journal.json`, y de los archivos de v0.11.
5. Verificación mecánica: `npx tsc --noEmit` → **0 errores**; `npx eslint app/(app)/torneos components/torneos hooks/use-tournament-run.ts` → **0 errores / 0 warnings**.
6. No se modificó código ni se ejecutaron build, Playwright, migraciones ni servidores.

---

## (a) Tabla UI ↔ API por campo

### a.1 `GET /api/torneos` → `TournamentList`

Fuente: `app/api/torneos/route.ts:51-54` · `lib/db/queries/torneos/tournaments.ts:41-51,112-145`.

| Campo consumido | Tipo UI (`tournament-list.tsx:22-32`) | Existe en la respuesta | Evidencia |
|---|---|---|---|
| `id`, `name`, `status`, `startDate`, `endDate`, `courts`, `blockMinutes`, `updatedAt` | ✅ idénticos | ✅ | `listTournaments` select |
| `counts.categories`, `counts.teams`, `counts.matches` | ✅ | ✅ | `attachCounts` (3 agregados) |
| `nextCursor` | ✅ `string \| null` | ✅ | `PaginatedResult` |
| **último run** (change-map #41) | — | ❌ **no existe** en `TournamentSummary` | `app-notes.md` §F4a "Decisiones" lo justifica (evita N+1) ⇒ **desviación documentada**, no bug |

`updatedAt` viaja como `Date` y JSON lo serializa a ISO (`new Date(...)` en la card ✅).

### a.2 `POST /api/torneos` → `TournamentImportModal`

| Campo | Uso UI | Existe | Evidencia |
|---|---|---|---|
| 201 `{ tournamentId, counts.matches }` | toast `Torneo importado · N partidos` | ✅ | `route.ts:146-149` |
| 400/422 `{ error, code, details[] }` con `details[].{code,path,message}` | bloque `role="alert"` con `path` + mensaje | ✅ (`LoaderError` y issues Zod comparten forma) | `route.ts:110-137`; `normalizeErrors` |
| 413 `{ error }` | mensaje | ✅ | `route.ts:92-98` |
| 429 | `{ error }` | ✅ | `rateLimitedResponse` |
| Límite 2 MB | `MAX_IMPORT_BYTES` cliente = `MAX_IMPORT_BYTES` servidor | ✅ | `modal:23` vs `route.ts:21` |

### a.3 `GET /api/torneos/[id]` → `[id]/page.tsx`

Fuente: `app/api/torneos/[id]/route.ts:57-91` · `getTournamentDetail`.

| Campo | Uso UI | Existe | Evidencia |
|---|---|---|---|
| `tournament.{name,status,startDate,endDate,courts,blockMinutes}` | header + badge | ✅ | `route.ts:58-68` |
| `counts.{categories,groups,teams,blocks,matches,matchesPrevia,matchesFinal}` | `dl` de instancia (`page.tsx:100-106`) | ✅ | `getTournamentDetail` |
| `counts.courts` | **no se consume** (correcto) | ❌ por contrato v2 §a.3 | UI usa `tournament.courts` ✅ |
| `blocks[].{idx,dayLabel,startTime,phase,isExtension,capacity}` | `summarizeBlocks` + `AgendaGrid` | ✅ | `route.ts:78-87` |
| `activeRun`, `currentRun` | elección del `initialRun` | ✅ | `route.ts:71-77` |
| `status` enum `draft\|agenda_draft\|archived` | `STATUS_META` | ✅ exacto | `schema.ts:948-950` |
| `startDate`/`endDate` string `YYYY-MM-DD` | `formatDate` | ✅ (`date mode:"string"`, notNull) | `schema.ts:978-979` |

### a.4 `POST /api/torneos/[id]/agenda` → `useTournamentRun.generate`

| Respuesta | Uso hook | Veredicto |
|---|---|---|
| `202 { runId, status:'queued' }` (`route.ts:141-144`) | `emptyQueuedRun(runId)` + `pollUntilTerminal` | ✅ |
| `409 { code:'run_active', activeRunId }` (`:121-128`) | mensaje + polling del activo | ✅ (ver b.2) |
| `409 { code:'archived' }` (`:61-66`) | `MESSAGES.archived` | ✅ (botón además deshabilitado si `archived`) |
| `422 { code:'infeasible_occupancy', semaforo }` (`:92-102`) | mensaje + `needsForce` → CTA *Generar de todos modos* | ⚠️ `semaforo` del body **se descarta** (O-m2) |
| `404 { error }` (`:55-59`, `:82-86`) | `body.error` | ✅ |
| `401/403` (`guardAdmin`) | `body.error` ("No autenticado"/"No autorizado") | ✅ |
| `429` | `body.error` | ✅ |
| `500 { error }` | `body.error` | ✅ |

### a.5 `GET /api/torneos/[id]/runs/[runId]?include=slots` → panel + grilla

Fuente: `route.ts:67-76` · `getRun` (`runs.ts:348-395`) · `RunSummary` (`runs.ts:109-137`) · `RunSlot` (`runs.ts:141-155`).

| Campo | Consumidor | Existe | Evidencia |
|---|---|---|---|
| `run.runId`, `status`, `slotsCount`, `timeMs` | banners/indicadores | ✅ | `toRunSummary` |
| `run.engineStatus` | `timeLimitReached` (`panel:179`) | ✅ `varchar(32)` | `finishRun` |
| `run.error.{code,message}` | banner `failed` | ✅ | `run.error` jsonb |
| `run.startedAt/finishedAt` | tipo `Date \| string` (RSC vs JSON) | ✅ | `page.tsx:68` |
| `slots[].{matchId,code,categoryCode,phase,round,blockIdx,court}` | grilla (celda, color, tooltip, ocupación) | ✅ | `runs.ts:375-384` |
| `slots[].{dayLabel,startTime}` | solo violaciones de disponibilidad | ✅ | join `tournament_blocks` |
| Numeración de canchas `1..N` | grilla itera `1..courts` (`grid:121`) | ✅ `assignCourts` usa `i+1` | `lib/motor-torneo/courts.ts:36` |
| `blockIdx` 0-based | celda `court:blockIdx` ↔ `blocks[].idx` | ✅ (mismo join de la query) | `runs.ts:379-383` |
| `slots` vacío si no terminal | estado inicial / cola | ✅ `route.ts:71-72` | |

### a.6 `diagnostics` (panel)

Persistido por el worker como **`DiagnosisReport`** (`lib/motor-torneo/diagnostics.ts:76-82`), no como `Diagnosis` a secas.

| Campo | Consumidor | Existe en runtime | Declarado en §6.6 |
|---|---|---|---|
| `status`, `timeMs`, `objective`, `mipGap` | header del panel | ✅ | ✅ |
| `extensionMatches` | "Partidos en extensión" | ✅ | ✅ |
| `gruposComoUnidad/gruposMismoDia/gruposMismaCancha` `.count/.total` | 3 indicadores | ✅ | ✅ |
| `parejasUnDia.{count,total}`, `parejasDosDias` | indicador parejas | ✅ | ✅ |
| `maxBloquesSeguidos`, `partidosHorarioLaboral` | indicadores | ✅ | ✅ |
| `verificationErrors[].{code,matchId?,message?}` | lista + banner `invalid` | ✅ | ✅ |
| **`semaforo.{previa,final}.{phase,matches,capacity,color}`** | `SemaphoreRow` | ✅ (`diagnostics.ts:440`) | ❌ **no está en `Diagnosis`** |
| **`availabilityViolations[].{matchId,dayLabel,startTime,teams[]}`** | bloque ámbar | ✅ (`:444`, `:67-73`) | ❌ **no está en `Diagnosis`** |
| `occupancyByTramo[].{dayLabel,phase,isExtension,matches,capacity}` | "Ocupación por tramo" | ✅ | ✅ |
| `doubleCategoryClashes` | **no se pinta** | ✅ | ✅ (no exigido por #45) |
| `scheduledMatches`, `finals`, `bracketFirstMatch` | no se pintan | ✅ | ❌ extra persistidos |

⇒ La UI **no rompe** (los campos existen en el JSONB), pero el contrato §6.6 y el DTO `RunSummary.diagnostics` están **incompletos**; el hook los re-añade a mano (`RunDiagnostics`, `use-tournament-run.ts:43-51`). F5a debe documentar `DiagnosisReport`, no `Diagnosis` (O-m3).

**Resultado (a): 0 desalineaciones de nombre/campo que rompan en runtime.** Todo lo que la UI lee existe en la respuesta real de los routes que la alimentan.

---

## (b) Manejo de códigos en `use-tournament-run`

### b.1 Camino `generate()` → `POST .../agenda`

| Código | Rama | Estado final | Visible | Veredicto |
|---|---|---|---|---|
| 202 | `hook:223-228` | `run=queued`, `phase=queued`, polling | banner cola | ✅ |
| 409 `run_active` | `:233-235` | `phase=error` + mensaje + polling `activeRunId` (puede ser `null`) | mensaje ≤1 tick, luego progreso | ✅ aceptable |
| 409 `archived` | `MESSAGES.archived` | `phase=error` | banner destructivo | ✅ |
| 422 `infeasible_occupancy` | `:232` | `phase=error`, `needsForce=true` | mensaje + CTA force | ✅ (⚠️ semáforo descartado, O-m2) |
| 404 | fallback `body.error` | `phase=error` | banner | ✅ |
| 401 / 403 | fallback `body.error` | `phase=error` | banner | ✅ |
| 429 / 500 | fallback `body.error` | `phase=error` | banner | ✅ (sin `retryAfter`, inocuo) |
| red caída | `:236-238` | `phase=error` | banner | ✅ |

### b.2 Camino `pollUntilTerminal()` → `GET .../runs/[runId]`

| Situación | Rama | Comportamiento | Veredicto |
|---|---|---|---|
| 200 estado no terminal | `:176-184` | reemplaza run, `phase=queued\|running` | ✅ |
| 200 terminal (`succeeded\|infeasible\|failed\|invalid`) | `:180-182` | `phase=done`, **detiene** | ✅ (los 4 terminales del enum) |
| **401/403/404/500 persistente** | catch `:185-191` | `setError(...)` **pero no cambia `phase`** ⇒ `RunBanner` sigue en la rama "Corrida en cola…" y **el error no se ve**; reintenta cada 5 s **indefinidamente** | ⚠️ **[mayor] O-M2** |
| error de red transitorio | ídem | no aborta (diseño) pero tampoco muestra el error | ⚠️ mismo hallazgo |
| desmontaje | cleanup `:136-142` | cancela timer y loop | ✅ |

`refresh()` sí expone el error (mantiene `phase` actual y `RunBanner` lo oculta si está en cola/progreso) — mismo efecto.

### b.3 Códigos que la UI nunca recibe (no es bug)

- `503 worker_not_configured` es del **worker interno**, no de `/agenda` ⇒ la entrada `MESSAGES.worker_not_configured` es código muerto (O-m4).
- `409 already_archived` de `/archive`: el endpoint no tiene entry point en la UI (#43 no lo pide) (O-m9).

---

## (c) Observaciones clasificadas

### 🔴 Bloqueantes — 0

Ninguna desalineación UI↔API. `tsc` y `eslint` limpios sobre los 7 archivos nuevos.

### 🟠 Mayores — 4

| # | Observación | Evidencia | Acción |
|---|---|---|---|
| **O-M1** | **`serverExternalPackages: ['highs']` sigue sin declararse** y el worker ya importa `runEngine → solver → highs` (`lib/motor-torneo/solver.ts:10`). `next.config.*` no lo menciona (grep vacío). change-map #10 lo dejó "si el bundler intenta empaquetar el `.wasm`"; con el worker ya existente el riesgo es real: emscripten resuelve `highs.wasm` por `locateFile`/`readFileSync` sobre el directorio del paquete y el bundle lo mueve ⇒ `engine_unavailable` en prod. | `app/api/internal/tournament-worker/route.ts:9`; `next.config.mjs` | Verificar `next build` + invocación real del worker en el gate `--build`. Si falla: añadir `serverExternalPackages: ['highs']` (una línea). **Si el gate falla, asciende a bloqueante de release** (junto a O-B1 ya registrado). |
| **O-M2** | Polling: 401/403/404/500 y red persistente setean `error` sin cambiar `phase` ⇒ el banner muestra "Corrida en cola…" y **oculta el fallo**, reintentando para siempre cada 5 s. No hay tope de reintentos ni parada por código de cliente. | `hooks/use-tournament-run.ts:185-191`, `diagnostics-panel.tsx:94-102` | Parar el loop en 401/403/404 y pasar a `phase:"error"`; mostrar `error` también en la rama de progreso. |
| **O-M3** | `diagnostics` persistido es `DiagnosisReport` (semaforo + availabilityViolations + 3 campos extra) pero §6.6 y `RunSummary` declaran `Diagnosis`. La UI accede a `semaforo` porque el hook ensancha el tipo a mano. | `diagnostics.ts:76-82,440,444`; `runs.ts:109-137`; `hook:43-51` | F5a: documentar `DiagnosisReport` en OpenAPI y ajustar el tipo del DTO (sin cambiar la respuesta). |
| **O-M4** | **`/torneos` no tiene entrada de navegación**: `lib/constants/navigation.ts` y `bottom-nav.tsx` intactos y `app-notes.md` (§F4a) difiere el link a "el chunk que edite la navegación", **chunk que no existe en el change-map**. La feature es alcanzable solo por URL directa. | `lib/constants/navigation.ts:3-20`; `app-notes.md:353` | Asignar en F5 una fila al change-map (`ADMIN_NAV_ITEMS` + FAB/`canShowTransitionFab` si aplica) o aceptar explícitamente que v0.12 sale sin enlace. |
| **O-M5** | Higiene de repo: `motor_torneo/.venv` = **153 MB** + `__pycache__` + `.DS_Store` raíz `untracked`, y `.gitignore` no tiene `DS_Store`/`venv`/`__pycache__`. Un `git add -A` en `/supercommitpre` mete 153 MB al repo. | `du -sh motor_torneo`; `grep -n "DS_Store\|venv" .gitignore` (vacío) | Añadir a `.gitignore`: `.venv/`, `__pycache__/`, `.DS_Store`; commitear solo `motor_torneo/*.py` + `README.md` + `OPERACION.md` (referencia, §14). |

> Nota: O-M1 y O-M3 son deuda de F3b/F5a reconocida por el plan; se listan como mayores porque F4 ya depende de ellas para que el flujo completo funcione en release.

### 🟡 Menores — 13

| # | Observación | Evidencia |
|---|---|---|
| O-m1 | AC-11 dice "a 375 px **sin scroll horizontal**", pero la grilla es `overflow-x-auto` + `min-w-max` (con `sticky` en cancha). Es correcto per change-map #44 ("`overflow-x` controlado"), pero el E2E F5c **no debe** asumir "sin scroll"; corregir AC-11 o el criterio del test. | `agenda-grid.tsx:125-126`; `feature-spec.md:137` |
| O-m2 | El `semaforo` del 422 pre-check (calculado `sin escribir`) se descarta: solo se muestra tras una corrida real. El coach no ve ρ por fase antes de forzar. | `agenda/route.ts:92-102`; `hook:229-235` |
| O-m3 | Último run en card de lista (change-map #41) no implementado; `TournamentSummary` no lo expone. Desviación documentada en `app-notes.md` §F4a. | `tournament-list.tsx:145-156` |
| O-m4 | `MESSAGES.worker_not_configured` nunca llega a la UI (el 503 es del worker interno, no de `/agenda`). Código muerto. | `hook:84,231` |
| O-m5 | Tras un run `failed`/`infeasible`, recargar la página pierde el motivo: `getCurrentRun` solo devuelve `succeeded\|invalid` (correcto según §6.3) y `initialRun = activeRun ?? currentRun`. | `[id]/page.tsx:65-69`; `runs.ts:423-445` |
| O-m6 | El badge de estado del torneo no se refresca al terminar la corrida: vive en el RSC y el island no re-renderiza el servidor (sigue "Borrador" hasta recargar). | `[id]/page.tsx:72,90` |
| O-m7 | Sin `loading.tsx`/`error.tsx` en `/torneos` ni `/torneos/[id]`: el "loading" del detalle es el default de Next; la lista sí tiene loading/error/empty propios. | `ls app/(app)/torneos` |
| O-m8 | Sin unit tests para `isTerminalRunStatus`/`useTournamentRun` ni tests de componentes; F5 solo planifica API + E2E. AGENTS exige unit tests para hooks/lógica de negocio. | `tests/unit/torneos` = solo `limits.test.ts` |
| O-m9 | `POST /api/torneos/[id]/archive` sin entry point en UI (no requerido por #43/feature-spec), por lo que tampoco tendrá cobertura E2E. | `archive/route.ts` |
| O-m10 | `.env.local` no define `TOURNAMENT_WORKER_SECRET` (`.env.example` sí lo documenta) ⇒ el worker responde 503 en local y el run queda `failed(dispatch_failed)`; F5b/F5c necesitan la var. | `grep TOURNAMENT .env.local` (vacío) |
| O-m11 | Ruta #40 dice "lista **server-driven**"; implementada como fetch client (loading/error/empty locales) + `router.refresh()` redundante con el evento `torneos:updated`. Funciona, pero el wording del change-map y el refresh doble no reflejan la implementación. | `page.tsx:25`; `tournament-list.tsx:93-99`; `modal:123-124` |
| O-m12 | El semáforo del panel hace `capitalize` sobre `previa|final` y no muestra ρ numérico (solo `matches/capacity` y color) — suficiente, pero el dato `occupancy` del contrato no se usa. | `diagnostics-panel.tsx:36-52` |
| O-m13 | `doubleCategoryClashes` (persistido) no se pinta en el panel; no exigido por #45, pero es diagnóstico perdido. | `diagnostics-panel.tsx:239-267` |

---

## (d) Regresiones encontradas

### d.1 Dentro del change-map (correcto)

| Archivo | Cambio | Veredicto |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | **solo** `highs@1.15.4` (+9 líneas) | ✅ dependencia autorizada (§8) |
| `lib/db/schema.ts` | aditivo; único `-` es la línea de import de `pg-core` | ✅ |
| `drizzle/0014_*`, `_journal.json` | `idx 14`, `when` > 0013 | ✅ |
| `lib/auth/protected-routes.ts` | 7 entradas `torneos` + worker documentado | ✅ F3b |
| `.env.example` | `TOURNAMENT_WORKER_SECRET`, `TOURNAMENT_MAX_TIME_LIMIT_MS`, `TOURNAMENT_WORKER_URL` (comentada) | ✅ §7 |
| `ARCHITECTURE.md`, `FEATURES.md`, `lib/api-docs/spec.ts` | v0.11 / F5a; **`spec.ts` no contiene entradas `torneos`** (pendiente F5a) | ✅ sin romper nada |

### d.2 Fuera del change-map / riesgos

| Archivo | Situación | Veredicto |
|---|---|---|
| `motor_torneo/` (154 MB, `.venv` 153 MB, `__pycache__`) | Referencia congelada, no es deliverable; sin `.gitignore` | ⚠️ **O-M5** |
| `.DS_Store` (raíz) | untracked, sin regla en `.gitignore` | ⚠️ O-M5 |
| `scripts/torneo-verify-with-python.py` (#13) | **no existe** | ❌ entregable faltante (opcional/manual, documentar) |
| `tests/fixtures/torneo/reference/*`, `python-run.json`, `mini.json`, `instance-seed3.json` (#11) | **no existen** (`tests/fixtures/torneo/` solo tiene `instance.json`, `structure.json`, `model-stats.json`) | ❌ bloquea F5b/F5c (`mini.json` es dependencia dura del happy-path y del E2E) |
| `tests/api/torneos/*`, `tests/e2e/torneo-agenda.spec.ts` | no existen (F5b/F5c) | ✅ deuda planificada |
| `lib/api-docs/{paths,schemas}/torneo*` | no existen (F5a) | ✅ deuda planificada |

### d.3 v0.11 (agenda de clases) — **sin contaminación**

`git diff` de `components/padel/{course-detail,student-course-detail,student-dashboard}.tsx`, `lib/db/queries/padel/{courses,index}.ts`, `tests/unit/db/courses.test.ts` y `drizzle/0013_*` **no contiene ninguna aparición de `tournament`/`torneo`** ⇒ esta iniciativa no tocó v0.11 ni features existentes. Tampoco hay cambios en `bottom-nav.tsx`, layouts, `middleware` ni endpoints previos.

---

## (e) Veredicto

**VIABLE para cerrar F4.** La UI consume exactamente los campos que los routes devuelven: `counts` (sin `courts`, alineado con v2 §a.3), `status` del enum real, `blocks[].{idx,dayLabel,startTime,phase,isExtension,capacity}`, `slots[].{court,blockIdx,categoryCode,code,round,phase,dayLabel,startTime}` (canchas 1..N y `blockIdx` 0-based verificados contra `assignCourts` y el join de la query) y `diagnostics` con semáforo/indicadores/verificador. **No hay ningún nombre de campo desalineado que rompa en runtime.**

Ambas páginas son server components con `validateAdmin()` (`page.tsx:11`, `[id]/page.tsx:58`), anti-IDOR vía `getTournamentDetail(id, ownerId)` + `notFound()`; cero lógica de auth en cliente. La UI reutiliza `Section`, `Card`, `Badge`, `Button`, `Dialog`, `Input`, `Label`, `Textarea`, `EmptyState`, `sonner` y `lucide` existentes; estados empty/loading/error presentes en lista, panel y grilla. Paleta de categorías en hex es la del prototipo autorizada por change-map #44; `emerald`/`amber` ya tienen precedente en `scoring-canvas`/`evolution-view`/`create-user-form`.

**Condiciones para release v0.12 (no bloquean cerrar F4, sí el release):**
1. O-M1: verificar `next build` con `highs` en el worker; añadir `serverExternalPackages: ['highs']` si el gate falla.
2. O-M2: parar el polling y mostrar el error en 401/403/404.
3. O-M4: decidir entrada de navegación a `/torneos` (asignar a F5 o aceptar explícitamente).
4. O-M5: `.gitignore` para `.venv/`, `__pycache__/`, `.DS_Store` antes de `/supercommitpre`.
5. F5: `mini.json` + fixtures `reference/*`, OpenAPI de torneos (incluido `DiagnosisReport`), API happy/guard y E2E (sin asumir "sin scroll horizontal" en 375 px).
