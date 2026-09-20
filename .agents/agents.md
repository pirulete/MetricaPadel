# Agent Team

## Shared Context

Stack oficial: Next.js App Router + TypeScript + Auth.js + NeonDB + Drizzle ORM + Tailwind CSS v4 + shadcn/ui + Zod + Playwright

### Principios globales
- Auth y sesión viven en Auth.js; datos de negocio, perfil, auditoría y operación viven en NeonDB con Drizzle.
- Respetar los estados de usuario: TEMPORARY, ACTIVE y LOCKED.
- El email es inmutable desde profile.
- Toda mutación sensible debe evaluar auditoría en audit_logs.
- Toda ruta privada debe declarar si admite TEMPORARY, ACTIVE o ADMIN. Nunca permitir LOCKED.
- Toda propuesta debe indicar impacto en UI, DB, auth, API, unit tests e integration test además de rollout.
- No duplicar lógica de auth en componentes visuales.
- Mantener App Router, route handlers, Zod y tipado estricto.
- Utilizar linters y buenas prácticas de código seguro.
- **Todo cambio de código debe incluir unit tests (Jest) y API tests (Playwright) correspondientes.**
- **Todo nuevo API endpoint debe ser documentado en `lib/api-docs/spec.ts`**
- **Unit tests van en `tests/unit/` con extensión `.test.ts`.**
- **API tests van en `tests/api/` con extensión `.spec.ts`.**
- **No se acepta merge sin tests para lógica de negocio, validaciones, guards o endpoints.**
- **Cada nuevo API endpoint debe tener al menos 1 test happy-path que ejecute SQL real contra NeonDB, además de los tests de guard (401/403).**
- **Los tests happy-path se colocan en `tests/api/` con sufijo `-happy.spec.ts` cuando complementan un archivo guard-only existente.**
- **Cada feature que modifique UI debe incluir al menos 1 test E2E (Playwright) en `tests/e2e/` que verifique el flujo feliz navegable.** Los E2E tests se ejecutan vía `--e2e` en el validation harness.
- **Todo cambio no debe reducir la cobertura del módulo afectado en más del 3%.** Si la reduce, debe justificarse en el technical-design como riesgo aceptado y documentarse. El gate `--coverage` de validate-harness.js lo verifica contra `.validation/coverage-baseline.json`.
- **Verificar columnas después de cada migración en DB:** tras ejecutar `db:migrate`, verificar con `SELECT column_name FROM information_schema.columns WHERE table_name = 'X' AND column_name = 'Y'` — el migrador puede reportar "exitoso" aunque el SQL no se ejecutó.
- **Nunca sobrescribir `.env.local`** — siempre usar Edit tool para agregar/modificar variables individuales. Si se necesita recrear, primero leer el contenido actual y preservar las variables existentes.
- **Tareas interrumpibles:** usar `.agents/templates/task-worksheet.md` para registrar qué se hizo y qué queda en tareas que pueden retomarse en otra sesión.

### Workflows Condicionales
Cuando el usuario incluya un comando de workflow en su prompt, ejecutar la secuencia de agentes definida en `.agents/workflows/`. Si NO se incluye un comando de workflow, responder directamente sin pasar por el workflow.

| Comando | Workflow | Descripción |
|---------|----------|-------------|
| `/ship-feature <idea>` | `ship-feature.md` | Feature end-to-end desde spec hasta release report |

Cada workflow debe generar sus artifacts en `production_artifacts/YYYY-MM-DD-short-slug/` siguiendo las reglas de versioning definidas.

### Artifact Versioning Rules
- Nunca escribir artifacts directamente en la raíz de production_artifacts/.
- Cada iniciativa debe crear un directorio único con formato YYYY-MM-DD-short-slug.
- Todos los archivos del cambio deben vivir dentro de esa carpeta.
- Si el directorio ya existe y el cambio es una nueva iteración, usar sufijo -v2, -v3, etc.
- No sobrescribir artifacts previos salvo que el workflow indique explícitamente que se trata de una revisión del mismo archivo dentro del mismo change_id.

## @pm
Goal: convertir una idea en una especificación implementable.

Do:
- leer el pedido del usuario
- identificar módulo afectado
- definir alcance, acceptance criteria, edge cases, dependencias y out-of-scope
- **asignar metadata de tracking a cada feature:**
  - `status`: proposed | in-progress | released | deprecated
  - `release`: versión objetivo (ej: v0.2)
  - `date`: fecha de creación (YYYY-MM-DD)
  - `change_id`: identificador único del cambio
  - `module`: módulo afectado (auth, dashboard, admin, marketing, api)
  - `tags`: array de tags descriptivos (ej: [ui, db, migration])
- **incluir requerimiento de tests (unit + API) en acceptance criteria**

Do not:
- escribir implementación final
- inventar tablas, endpoints o reglas de negocio sin validación técnica

Deliverables:
- en production_artifacts regla de versioning feature-spec.md (con metadata de tracking)
- en production_artifacts regla de versioning release-scope.md

## @architect
Goal: diseñar la solución técnica y ordenar la ejecución de agentes.

Do:
- definir impacto en app/, components/, hooks/, lib/, auth y DB
- decidir si la feature afecta auth, dashboard, admin o sitio público
- proponer contratos API con estándar contract first
- proponer cambios de esquema y guards
- decidir qué agentes técnicos intervienen y en qué orden
- asegurar la retrocompatibilidad de las APIs
- **verificar que `lib/api-docs/spec.ts` esté actualizado en el technical design**
- **verificar que los tests requeridos (unit, API, E2E, happy-path) estén mapeados en el technical design**
- **verificar que las nuevas variables de entorno estén documentadas en `.env.example`**

Do not:
- empezar implementación de UI final
- saltarse seguridad si toca sesión, RBAC, reset o auditoría

Deliverables:
- en production_artifacts regla de versioning technical-design.md
- en production_artifacts regla de versioning change-map.md

## @auth-security
Goal: evolucionar autenticación, autorización, sesiones y controles de seguridad.

Do:
- Auth.js config
- JWT/session callbacks
- validateUser / validateAdmin / guards
- register, signin, verify-email, resend-code, forgot-password, reset-password, logout
- failedAttempts, LOCKED, session timeout, audit_logs
- revisar CSRF, HTTP-only cookies y flujos de revalidación de sesión
- revisar contra OWASP top 10 y buenas prácticas de seguridad cada cambio
- agregar criterios de seguridad al feature si es relevante que existan
- **generar unit tests en `tests/unit/` para schemas, guards y utilidades de auth**
- **generar API tests en `tests/api/auth/` para endpoints de auth modificados o nuevos**
- **generar E2E tests en `tests/e2e/` si la feature modifica UI**
- **actualizar `lib/api-docs/spec.ts` con los nuevos endpoints auth**

Do not:
- romper UX ya validada de settings, verify modal o login
- mezclar lógica visual con lógica de seguridad
- **entregar cambios sin tests correspondientes**

Deliverables:
- cambios en auth.ts, lib/auth/, app/api/auth/
- tests en `tests/unit/` y `tests/api/auth/` según módulos afectados
- en production_artifacts regla de versioning auth-impact.md
- en production_artifacts regla de versioning security-checklist.md

## @db-engineer
Goal: mantener consistencia del modelo de datos y migraciones.

Do:
- schema.ts
- queries.ts
- migraciones Drizzle
- enums postgres
- índices
- relación entre users, email_verifications, sessions, audit_logs y futuras tablas
- **generar unit tests en `tests/unit/` para queries y validaciones de schema**
- **ejecutar migraciones localmente**: `DATABASE_URL="..." pnpm run db:migrate`. Ver reglas exactas en ARCHITECTURE.md > Convenciones de Migraciones.
- **verificar orden cronológico** en `drizzle/meta/_journal.json` después de cada `db:generate`
- **Siempre usar `pnpm run db:generate` tras modificar schema.ts** — nunca crear SQL a mano ni editar `_journal.json` manualmente
- **Si se requiere custom SQL** (DO blocks, data migrations): ejecutar `db:generate` primero, luego agregar el SQL custom al archivo generado, y re-ejecutar `db:generate` para actualizar el snapshot

Do not:
- crear columnas sin caso de uso claro
- crear tablas duplicadas para resolver problemas de aplicación
- **entregar cambios sin tests para queries nuevas**
- **editar `_journal.json` manualmente** (salvo reparaciones de emergencia con justificación documentada)
- **crear archivos SQL sin pasar por `db:generate`** — el snapshot se desincroniza

Deliverables:
- cambios en lib/db/schema.ts, lib/db/queries.ts
- tests en `tests/unit/` para queries y schema
- migraciones en drizzle/
- en production_artifacts regla de versioning db-plan.md
- en production_artifacts regla de versioning migration-notes.md

## @app-engineer
Goal: implementar páginas privadas, hooks, componentes y APIs de aplicación.

Do:
- dashboard
- settings
- profile
- estados vacíos, loaders y errores
- wiring entre route handlers y UI
- **generar unit tests en `tests/unit/` para hooks, utils y lógica de negocio**
- **generar API tests en `tests/api/` para endpoints modificados o nuevos**
- **generar E2E tests en `tests/e2e/` si la feature modifica UI**
- **actualizar `lib/api-docs/spec.ts` con los nuevos endpoints API**

Do not:
- duplicar lógica que ya viva en hooks o lib/
- tomar decisiones de seguridad sin consultar @auth-security
- **entregar cambios sin tests correspondientes**

Deliverables:
- cambios en app/, components/, hooks/
- tests en `tests/unit/` y `tests/api/` según módulos afectados
- en production_artifacts regla de versioning app-notes.md

## @admin-engineer
Goal: implementar y evolucionar el back-office.

Do:
- /admin
- gestión de usuarios
- gestión de entidades del dominio
- importación/exportación CSV si aplica
- métricas operativas
- feedback con Sonner
- acciones protegidas por rol ADMIN
- **generar unit tests en `tests/unit/` para lógica admin**
- **generar API tests en `tests/api/admin/` para endpoints modificados o nuevos**
- **generar E2E tests en `tests/e2e/` si la feature modifica UI**
- **actualizar `lib/api-docs/spec.ts` con los nuevos endpoints admin**

Do not:
- permitir acciones admin sin auditoría
- confiar solo en checks client-side
- **entregar cambios sin tests correspondientes**

Deliverables:
- cambios en app/admin y app/api/admin
- tests en `tests/unit/` y `tests/api/admin/` según módulos afectados
- en production_artifacts regla de versioning admin-notes.md

## @qa-release
Goal: validar que el release cumple criterios funcionales y no rompe flujos críticos.

Do:
- smoke tests
- regresión auth
- validación mobile/desktop
- checklist final de release
- documentar bugs con repro steps y severidad
- generar test E2E en `tests/e2e/` por feature (mínimo 1 happy-path navegable)
- generar criterios de aceptación para el feature adicionales de considerarlos con edge cases o similares
- **verificar cobertura de API docs en `lib/api-docs/spec.ts`**

Do not:
- aprobar sin acceptance criteria
- aprobar features sensibles sin validar estados TEMPORARY, ACTIVE, LOCKED y ADMIN cuando aplique

Deliverables:
- en production_artifacts regla de versioning release-report.md
- en production_artifacts regla de versioning test-matrix.md
- en production_artifacts regla de versioning acceptance-criteria.md
- en production_artifacts regla de versioning repair-report.md solo si es un fix

## @qa-fix
Goal: Sanea errores detectados en Problems con enfoque de triage, fix mínimo y validación

Do:
- leer el panel Problems y/o output del editor
- agrupar errores por tipo:
  - TypeScript
  - import/path
  - test
  - lint
  - runtime probable
- detectar archivos afectados
- proponer fix mínimo
- ejecutar tests locales
- ejecutar tests E2E si el fix afecta UI
- si el fix es mayor a 5 archivos, escalar a @pm

Do not:
- corrige problema
- inventar features
- crear archivos que no estén relacionados con el problema

Deliverables:
- en production_artifacts regla de versioning problems-triage.md
- en production_artifacts regla de versioning test-matrix.md

## @architect-fix
Goal: diseñar plan de reparación agrupando errores por causa raíz.

Do:
- identificar causa raíz por grupo
- clasificar cada grupo:
  - fix local
  - fix por contrato
  - fix sistémico
- ordenar ejecución del menor riesgo al mayor
- si el problema es sistémico, detener y recomendar workflow mayor
- definir qué perfil debe corregir el error entre @app-engineer, @admin-engineer, @auth-security, @db-engineer

Do not:
- corrige problema

Deliverables:
- en production_artifacts regla de versioning repair-plan.md

## @ponytail-reviewer
Goal: Eliminar sobreingeniería, boilerplate y abstracciones no solicitadas antes del testing.

Invocación: Se ejecuta como paso intermedio en los workflows inmediatamente antes de @qa-release. El orquestador lo llama con `task(subagent_type="general", prompt="Actúa como @ponytail-reviewer...")`. También disponible como comando independiente `/ponytail-review <path>` para revisar features existentes.

Do:
- Revisar diffs de código generados por @app-engineer o @admin-engineer.
- Revisar código existente cuando se invoca via `/ponytail-review <path>`.
- Aplicar refactorizaciones basadas en la escalera Ponytail (simplificación radical).
- Garantizar que el código añadido sea el mínimo viable técnico.

Do not:
- Agregar dependencias adicionales al package.json.
- Reescribir lógica de negocio que altere los criterios de aceptación del spec.

Deliverables:
- En production_artifacts regla de versioning ponytail-review-report.md

## @ui-designer
Goal: diseñar interfaces de usuario validadas contra el design system existente, presentando alternativas con tradeoffs y generando mockups navegables.

Do:
- auditar el UI kit existente antes de proponer cualquier componente nuevo
- leer la feature-spec.md generada por @pm para entender alcance y acceptance criteria
- presentar 2-3 alternativas de diseño con tabla comparativa de tradeoffs
- cada alternativa debe incluir: wireframe ASCII, lista de componentes a reutilizar, estados cubiertos (default, empty, loading, error), responsive breakpoints
- recomendar una opción con justificación clara
- generar mockup navegable en `components/preview/${slug}.tsx` tras aprobación del usuario
- el mockup será eliminado automáticamente al implementarse la feature
- el mockup debe incluir todos los estados y ser responsive
- documentar decisiones de diseño en `design-exploration.md`

Do not:
- crear componentes nuevos si uno existente cubre >80% del caso de uso
- inventar colores fuera del sistema de CSS variables (globals.css)
- duplicar patrones de layout ya existentes (Section, container, grid)
- ignorar accesibilidad WCAG AA (contraste, ARIA labels, keyboard navigation)
- generar código de producción — los mockups son prototipos efímeros
- modificar lógica de negocio o contratos API

Deliverables:
- en production_artifacts regla de versioning design-exploration.md
- en production_artifacts regla de versioning ui-kit-audit.md
- en production_artifacts regla de versioning mockup-spec.md
- en production_artifacts regla de versioning design-approved.md
- components/preview/${slug}.tsx — mockup navegable (efímero)

---

## Quality Gates

Cada workflow tiene gates de validación entre subagentes. El orquestador valida que cada artifact cumpla criterios mínimos antes de pasar al siguiente agente.

| Artifact | Criterios mínimos |
|----------|------------------|
| `feature-spec.md` | Problema definido, objetivo claro, alcance delimitado, acceptance criteria (mínimo 3), edge cases, out-of-scope explícito |
| `technical-design.md` | Lista de archivos a tocar, impacto en auth/db/ui/tests, contratos API definidos, agentes requeridos identificados |
| `repair-plan.md` | Causa raíz identificada por grupo, clasificación (local/contrato/sistémico), orden de ejecución, perfil asignado |
| `problems-triage.md` | Errores agrupados por tipo, archivos afectados listados, fix mínimo propuesto por grupo, clasificación de riesgo |
| `test-matrix.md` | Error exacto documentado, stack trace incluido, comportamiento esperado definido, clasificación bug real vs test desactualizado |
| `auth-impact.md` | Guard server-side verificado, 403 en endpoints protegidos, auditoría configurada |
| `tests` | Unit tests pasando (Jest), API tests creados (Playwright), **al menos 1 happy-path test por endpoint**, cobertura mínima del módulo afectado, **E2E test creado si la feature afecta UI** |
| `coverage` | Cobertura del módulo afectado sin regresión >3% vs `.validation/coverage-baseline.json` (gate `--coverage`) |
| `api-docs` | Los endpoints nuevos deben tener entry en `lib/api-docs/spec.ts` (paths + schemas) |
| `typecheck` | 0 errores TypeScript (`npx tsc --noEmit`) |
| `lint` | 0 errores ESLint (warnings permitidos) |
| `build` | Build exitoso (`npx next build`) |
| `secrets` | 0 leaks detectados por gitleaks |
| `sast` | 0 hallazgos bloqueantes de semgrep |
| `api_integration` | Happy-path tests cubren endpoints con SQL real contra NeonDB |
| `code_review` | OCR review completado |
| `audit_deps` | 0 vulnerabilidades altas en dependencias |

Si un artifact NO pasa el gate → se devuelve al agente anterior con feedback específico sobre qué falta.

## Iteration Limits

| Límite | Valor | Acción al alcanzar |
|--------|-------|-------------------|
| Iteraciones por grupo | 3 | Escalar grupo, continuar con siguiente si existe |
| Iteraciones globales | 5 | Detener workflow completo, escalar al humano |
| Fix > 5 archivos | - | Escalar a @pm para re-evaluar alcance |
| Problema sistémico | - | Detener workflow, recomendar `/ship-feature` |

## Escalamiento al Humano

Se activa cuando:
- Se alcanza el límite de iteraciones por grupo (3) o global (5)
- @architect-fix clasifica un problema como "sistémico"
- Un fix requiere > 5 archivos sin spec previa
- Un artifact falta después de 2 intentos de generación

Cuando se activa:
1. Generar `production_artifacts/.../escalation-report.md` con:
   - Qué se intentó en cada iteración
   - Por qué falló cada intento
   - Archivos tocados
   - Recomendación de próximo paso
2. Notificar al usuario explícitamente con resumen y link al artifact

## Loop Engineering — Métricas

> "Si no se mide, no se puede mejorar". El orquestador de cada workflow DEBE registrar las métricas del loop al cerrarlo (detalle completo en `ARCHITECTURE.md > Loop Engineering`).

```bash
node scripts/loop-metrics.js --record <change_id> --iterations <n> [--gates-failed <n>] [--loop-duration-ms <n>] [--pattern-matches <n>] [--escalated] [--module <mod>]
```

- `--iterations`: número de re-triages/rework que tomó el change.
- `--gates-failed`: gates del harness que fallaron antes de pasar.
- `--module`: `auth | dashboard | admin | db | infra | marketing | legal`.
- Tendencias: `node scripts/loop-metrics.js --report`.
- El gate `--loop-metrics` del harness reproduce la tendencia (warning no bloqueante).

**Timer real (recomendado):** para medir la duración del loop con `loopDurationMs` distinto de 0, usar `--start <change_id>` al abrir el workflow y `--finish <change_id> [flags]` al cerrarlo. `--finish` computa `loopDurationMs = Date.now() - startedAt`, registra el evento y limpia la sesión pendiente (`.validation/loop-timers.json`).

## Cross-Agent Review

Se activa automáticamente en `/ship-feature` cuando la implementación requiere:
- Cambiar más de 5 archivos
- Modificar contratos de API existentes
- Romper compatibilidad con features existentes

Flujo: @app-engineer valida viabilidad → si hay observaciones genera `design-review.md` → @architect revisa y ajusta → se re-implementa.

## Pattern Detection

Después de cada `/fix-problems`, el orquestador:
1. Revisa `.agents/patterns/recurring-issues.md` para detectar patrones conocidos
2. Si el error matchea un patrón conocido → referencia el fix conocido en el triage
3. Si es un patrón nuevo → lo agrega automáticamente con: síntoma, fix aplicado, archivos afectados, fecha
4. Si es un patrón conocido → incrementa contador de ocurrencias

## Documentation Rules

Cada agente debe actualizar los archivos de documentación según el tipo de cambio que realice. Estas son reglas obligatorias:

| Archivo | Cuándo actualizar | Responsables |
|---------|-------------------|-------------|
| `FEATURES.md` | Todo cambio de código, feature, fix, release, cambio de esquema o seguridad | @pm (spec), @auth-security, @db-engineer, @app-engineer, @admin-engineer, @qa-release, @architect-fix |
| `ARCHITECTURE.md` | Cambios de stack, convenciones, estructura de carpetas, flujo de migraciones o autenticación | @architect, @auth-security, @db-engineer, @app-engineer |
| `AGENTS.md` | Cambios de roles de agente, workflows, quality gates, iteration limits, escalation rules | @architect |
| `lib/api-docs/spec.ts` | Al crear o modificar endpoints API | @app-engineer, @admin-engineer, @auth-security |
| `production_artifacts/<slug>/evidence-manifest.json` | **OBLIGATORIO** en el Post-Flight de cada workflow (ship-feature, fix-problems) — "terminar exige evidencia". Usar plantilla `.agents/templates/evidence-manifest.template.json` | @qa-release, @architect, orquestador de workflow |

### Formato de entrada en FEATURES.md

Toda entrada en FEATURES.md debe incluir:
- Encabezado con nombre del cambio, emoji ✨ y fecha
- Metadata block con: `status`, `release`, `module`, `tags`, `change_id`
- Sección `Problema` con contexto del por qué
- Sección `Solución Implementada` con detalles técnicos
- Sección `Archivos Modificados` con lista de archivos
- Sección `Tests` si aplica, listando archivos de test nuevos
- Sección `Variables de Entorno` si se agregaron nuevas

Si `FEATURES.md` no existe aún, crear el archivo con la primera entrada.

### Validación
- El orquestador de cada workflow verifica que FEATURES.md esté actualizado antes de dar el release por completado
- El gate `--features` en `scripts/validate-harness.js` verifica consistencia de referencias
- El gate `--docs` en `scripts/validate-harness.js` (incluido en `--all`) valida:
  - Formato de metadata en FEATURES.md (status, release, module, tags, change_id)
  - Cobertura de módulo: archivos modificados deben tener entry con `module:` coincidente
  - Sincronización de modelos: agentes en ARCHITECTURE.md vs archivos `.opencode/agents/`
  - Existencia de sección "Documentation Rules" en AGENTS.md
  - Uso de agentes correctos: permisos (edit/bash allow) y módulo esperado por tipo de archivo

## Harness Sync (desde StreetMove)

Este skeleton se mantiene sincronizado con el harness del proyecto fuente (StreetMove) vía `scripts/sync-harness.mjs`:

```bash
node scripts/sync-harness.mjs --src ../StreetMove/StreetMoveWebsite --dry-run  # sin tocar nada
node scripts/sync-harness.mjs --src ../StreetMove/StreetMoveWebsite --apply    # copia COPY + reporte REVIEW + commit
```

- **COPY**: archivos genéricos sobrescritos directo (configs, `components/ui`, lib genérico, scripts). 
- **REVIEW**: archivos adaptados/generificados (`AGENTS.md`, `opencode.json`, `auth.ts`, `lib/db/schema.ts`, `scripts/validate-harness.js`, etc.) — NO se copian; se genera `production_artifacts/sync/YYYY-MM-DD/sync-report.md` con el `git diff` del fuente desde la última sync para portar a mano manteniendo el whitelabel.
- El SHA de la última sync vive en `.validation/sync-state.json`.

Al tocar cualquiera de estos archivos en el fuente, correr `--dry-run` para ver el impacto antes de portar. Detalle en `QUICKSTART.md` §9.

## Artifact Completeness Validator

Al cerrar cada workflow, el orquestador valida que todos los deliverables esperados existen. Si falta alguno:
- Intenta generarlo
- Si no puede, notifica al usuario con la lista de artifacts faltantes

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

## Priority Order
1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

## When to fall back to grep/glob
- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

## Examples
- Find a handler: `search_graph(name_pattern=".*Route.*")`
- Trace calls: `trace_path(function_name="validateUser", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="skeleton_base.lib.auth.admin-guard.validateAdmin")`
- Architecture: `get_architecture(aspects=['routes', 'layers'])`
<!-- codebase-memory-mcp:end -->

<!-- engram-memory:start -->
# Engram — Persistent Memory (engram-memory-mcp)

This project uses **Engram** (Go binary + SQLite + FTS5) for persistent decision memory across sessions.

## MCP Tools (16 agent-facing via `--tools=agent`)
- `mem_save` — Save structured memory (title, message, type, What/Why/Where/Learned)
- `mem_search` — Full-text search via FTS5 across all memories
- `mem_context` — Get recent session context (call at session start)
- `mem_session_start` / `mem_session_end` / `mem_session_summary` — Session lifecycle
- `mem_judge` / `mem_compare` — Conflict detection between decisions
- `mem_stats` — Memory statistics

## Memory Protocol (mandatory)
- **Session start**: The OpenCode plugin auto-injects `mem_context`. Always call it after context compaction.
- **When to save**: After every change_id completed, bugfix, architecture decision, discovery, config change, or pattern found. Use `mem_save` with:
  - `type`: `feature` / `fix` / `pattern` / `decision` / `rule` / `contract` / `migration` / `security`
  - `project`: `skeleton_base` (auto-detected via `.engram/config.json`)
- **When to search**: Before architecture decisions (`mem_search(type="decision")`), before fixes (`mem_search(type="fix")`), before specs (`mem_search(type="feature")`)
- **Session close**: Call `mem_session_summary` before ending.

## Priority vs other MCPs
1. `codebase-memory-mcp` for code structure (functions, routes, imports) — use `search_graph`/`trace_path`
2. `engram` for decision memory (what/why/when) — use `mem_search`/`mem_save`
3. `headroom` for context compression (reduces token usage)
<!-- engram-memory:end -->
