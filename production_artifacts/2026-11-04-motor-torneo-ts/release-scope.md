# Release Scope — Módulo Torneos: motor de agenda en TypeScript (v0.12 · Milestone 1)

> change_id: `2026-11-04-motor-torneo-ts`
> status: `proposed`
> release objetivo: `v0.12` (a confirmar por @architect/@qa-release al cierre)
> date: `2026-11-04`
> module: `torneos`
> feature-spec: `./feature-spec.md`
> milestone: `M1 de 3` (M2 = publicación + edición manual · M3 = re-planificación)

---

## 1. Qué entra

| # | Item | Valor | Evidencia de aceptación |
|---|---|---|---|
| 1 | Schema DB independiente del torneo (10 tablas, sin FK a courses/academies) | El torneo deja de ser un archivo Python y pasa a ser dato | AC-01 (migración `0014_*` + verificación de columnas) |
| 2 | Cargador real (`loader.ts`) desde el JSON de `OPERACION.md` §6 | Reemplaza `instancia.py`; datos reales, no inventados | AC-02 (unit + API SQL real, 4 reglas del cargador) |
| 3 | Estructura deportiva derivada y materializada (grupos + cuadros con pases libres) | 247 partidos del caso de referencia, auditables | AC-03 (snapshots por categoría) |
| 4 | Instancia canónica desde DB (`buildInstance`) + endpoint espejo | Se puede auditar qué datos entraron al motor | AC-04 (round-trip) |
| 5 | Port TS del modelo MILP (`modelo.ts`), canchas (`canchas.ts`), verificador (`verificar.ts`), diagnóstico (`diagnostico.ts`) | Motor productivo sobre HiGHS WASM | AC-05/AC-06/AC-07 |
| 6 | Agenda **borrador** persistida e inmutable por corrida | El resultado es consultable y comparable entre corridas | AC-06 (0 errores del verificador, 247 slots) |
| 7 | Worker asíncrono en background function (`time_limit` ≤ 240 s, `maxDuration` 300) + reaper | No bloquea el servidor web (1–5 min de CPU) | AC-08/AC-09 |
| 8 | API de torneos con `guardAdmin`, anti-IDOR 404 y auditoría | Sólo el coach dueño opera su torneo | AC-10 |
| 9 | UI mínima: lista, import, generar, grilla canchas × bloques, diagnóstico | El coach ve el resultado sin abrir una terminal | AC-11 (E2E navegable, 375 px) |
| 10 | Docs (`lib/api-docs`, `protected-routes`, `.env.example`) + `FEATURES.md` | Cumplimiento de gates del repo | AC-12 |

## 2. Qué NO entra (explícito)

- **Re-planificación día-T** (fijar jugados/inminentes, penalizar mover lo publicado).
- **Modo relajado BR-04 avanzado** (publicar violando disponibilidades + listar violaciones + `getIis()` / núcleo mínimo en conflicto). M1 sólo reporta `infeasible` con causa probable.
- **Publicación con edición manual de slots** (mover partido a mano, congelar, publicar).
- **Inscripción self-service de alumnos** (crear parejas, declarar `no_disponible` desde su cuenta).
- **Re-planificación durante el torneo** (tras cada ronda, WO o retiro) y captura de resultados.
- Vista de la agenda para `USER` (`guardUser`): **no existe ruta de alumno** en M1 porque no hay publicación.
- CRUD fino de la estructura (mover pareja de grupo, re-sembrar cuadro), edición de calendario/canchas desde UI.
- CP-SAT/OR-Tools, tuning adaptativo del solver, análisis de infactibilidad vía IIS.
- Export `agenda.csv` / `grilla.html` / PDF, iCal, notificaciones push/inbox, recordatorios, cron.
- Vínculo con `courses`, `academies`, cuotas, ranking, puntos, premiación, multi-tenant por academia.
- Migración o borrado de `motor_torneo/` (queda como referencia; no se importa desde producción).

## 3. Fases de ejecución

| Fase | Contenido | Agente | Gate de salida |
|---|---|---|---|
| **F0 · Schema** | 10 tablas + 4 enums + índices + migración `0014_*`; verificación de columnas con `information_schema` | @db-engineer | `db:generate` + `db:migrate` + columnas confirmadas + unit de queries |
| **F1 · Spike + núcleo puro** | **Spike obligatorio**: HiGHS WASM resolviendo el caso de referencia dentro de una función (≤240 s, memoria real). En paralelo: `types.ts`, `modelo.ts`, `canchas.ts`, `verificar.ts`, `PARAMS` | @architect + @app-engineer | Caso de referencia resuelto y verificado (0 errores) + decisión Vercel vs contenedor |
| **F2 · Cargador y estructura** | `loader.ts`, `bracket.ts`, `instancia.ts`, `diagnostico.ts`, import API + persistencia transaccional | @app-engineer + @db-engineer | AC-02/AC-03/AC-04 + API happy con SQL real |
| **F3 · Run + worker** | `POST .../agenda` (202), worker con secreto, estados, reaper, persistencia transaccional de slots, auditoría, guards | @app-engineer + @auth-security | AC-06/AC-08/AC-09/AC-10 |
| **F4 · UI mínima** | `/torneos`, `/torneos/[id]`, grilla, semáforo, diagnóstico, polling, empty/loading/error | @app-engineer | E2E navegable 375 px |
| **F5 · Tests & docs** | Unit/API/E2E completos, `lib/api-docs`, `protected-routes`, `.env.example`, `FEATURES.md` | @qa-release | `tsc`=0, lint=0, build OK, cobertura sin regresión >3 % |

**Bloqueo**: si F1 no logra correr el caso de referencia en la función de Vercel, el workflow se detiene y se re-spec (plan B: contenedor separado). No se avanza a F2/F3 sin ese gate.

## 4. Impacto por agente

| Agente | Impacto | Archivos esperados |
|---|---|---|
| @db-engineer | Alto | `lib/db/schema.ts`, `drizzle/0014_*`, `lib/db/queries/torneos/*.ts` ✨, `tests/unit/db/tournament-*.test.ts` ✨ |
| @architect | Alto | Cierre de Q1–Q3, contrato del worker, config de función (`maxDuration`/`memory`), `change-map.md` con `split` |
| @auth-security | Medio | Guards en 7 rutas, secreto de worker, anti-IDOR 404, auditoría de import/generate/archive; sin cambios en `auth.ts` |
| @app-engineer | Muy alto (partir en chunks ≤5 archivos) | `lib/motor-torneo/*` ✨, `app/api/torneos/**` ✨, `hooks/use-tournament-*.ts` ✨, `app/(app)/torneos/**` ✨, `components/torneos/*` ✨, tests |
| @admin-engineer | Nulo | El coach (`ADMIN`) opera en `app/(app)`; no hay back-office nuevo |
| @ponytail-reviewer | Alto | El port arrastra 1372 líneas Python: riesgo de sobre-port (clases por `_nueva_var`, nombres, abstracciones). Debe exigir el mínimo viable |
| @ui-designer | Opcional | Mockup efímero de la grilla si el orquestador lo invoca |
| @qa-release | Alto | Gates, cobertura, API docs, E2E, `FEATURES.md`, release-report |

## 5. Riesgos de release

- **Tamaño**: change-map superará ampliamente **5 archivos** (schema + lib pura + API + worker + UI + tests) ⇒ `split` obligatorio en chunks ≤5 y **Cross-Agent Review** antes de F2.
- **Viabilidad Vercel (bloqueante)**: WASM + 240 s + `maxDuration` 300. Si F1 falla, el release cambia de arquitectura a contenedor (más alcance de infra, fuera de v0.12).
- **Fidelidad del port**: las R5 acumuladas (`sum_{b<=t} x[m,b] <= sum_{b<=t-sep} x[f,b]`) son la parte más fácil de portar mal; mitigado con verificador independiente + tests por regla.
- **Migración**: patrón conocido del repo — el migrador reporta éxito sin ejecutar ⇒ verificar columnas antes de F2. `0013_*` ya está tomada: la nueva **debe** ser `0014_*`.
- **Cobertura**: el módulo puro (modelo/verificador/diagnóstico) es fuertemente testeable; la UI es el riesgo del gate `--coverage` ⇒ extraer semáforo/indicadores a funciones puras + 1 E2E.
- **Sobre-port**: tentación de traducir `instancia.py` (generador de datos falsos) a TS. **Prohibido**: `loader.ts` es el reemplazo, no un port del generador.
- **DoS por CPU**: un endpoint que corre 240 s de CPU es superficie de abuso ⇒ sólo `guardAdmin` + 1 run activo por torneo + límite de tamaño.

## 6. Dependencias y bloqueos

- **Nueva dependencia npm**: `highs` (WASM) — decisión cerrada D1; pasa por `audit_deps` y revisión de tamaño de bundle/runtime `nodejs`.
- **Variables de entorno nuevas**: `TOURNAMENT_WORKER_SECRET`, `TOURNAMENT_MAX_TIME_LIMIT_MS` (default 240000) → documentar en `.env.example`; **no** reescribir `.env.local`.
- **Migración**: `0014_*` (siguiente libre tras `0013_spotty_felicia_hardy.sql`).
- **Depende de**: `users` (ownerId), `guardAdmin` (v0.7), patrón G15 de cursor, `lib/audit/helpers.ts`, motor de docs OpenAPI. Ninguna dependencia de `courses`/`academies` (D2).
- **No bloquea** ninguna feature en curso; es módulo nuevo y aislado.
- **Referencia**: `motor_torneo/` (Python) se mantiene congelado; si se toca, se re-ejecuta la comparación de indicadores.

## 7. Criterio de cierre del release

Los 13 AC de `feature-spec.md` verificados: migración `0014_*` con 10 tablas y 0 FK a courses/academies; import del caso de referencia (8/50/155/247/38) con las 4 reglas del cargador; agenda borrador con **0 errores del verificador independiente**; diagnóstico completo persistido; `POST .../agenda` asíncrono con 202/409 y worker con secreto; reaper operativo; `tsc`=0, `lint`=0 errores, `build` OK; unit + ≥1 happy-path SQL real por endpoint + guards 401/403/404 + 1 E2E navegable; cobertura sin regresión >3 %; `lib/api-docs/spec.ts`, `lib/auth/protected-routes.ts`, `.env.example` y `FEATURES.md` actualizados; `motor_torneo/` intacto y no importado desde producción.
