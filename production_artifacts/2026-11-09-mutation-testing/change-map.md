# Change Map — Mutation testing con Stryker (v0.13)

> change_id: `2026-11-09-mutation-testing` · module: `infra` · date: `2026-11-09`
> technical-design: `./technical-design.md` · feature-spec: `./feature-spec.md`
> Regla: **ningún agente recibe >5 archivos ni >400 líneas estimadas**. Sin `split` requerido.

---

## 1. Chunk 1 — Configuración (1 agente, 5 archivos)

| # | Archivo | Acción | Agente | LOC est. | Notas |
|---|---|---|---|---|---|
| 1 | `stryker.conf.mjs` | crear | @app-engineer | ~55 | Contenido exacto en technical-design §2. `thresholds` = placeholder hasta baseline |
| 2 | `jest.config.mutation.js` | crear | @app-engineer | ~25 | technical-design §3. Excluye `purity.test.ts`; **no** toca `jest.config.js` |
| 3 | `package.json` | editar | @app-engineer | +8 | 2 scripts (`test:mutation`, `test:mutation:phase-b`) + 4 devDeps (3× `10.1.1` + `jest-environment-node@^30.4.1`) |
| 4 | `.gitignore` | editar | @app-engineer | +2 | `reports/mutation/` (`.stryker-tmp/` ya existe) |
| 5 | `tests/unit/torneos/dispatch.test.ts` | crear | @app-engineer | ~110 | EC-04: `jest.mock("@/lib/db")`, cubre `resolveWorkerUrl` (4 ramas) y `dispatchRun` (`not_queued`/`no_worker_url`/`dispatch_error`/ok) |

**Criterio de salida:** `npx jest -c jest.config.mutation.js --listTests` ⇒ **10 suites exactas**; `npx stryker run --dryRun` ⇒ solo archivos del scope, 0 `CompileError`.

---

## 2. Chunk 2 — Baseline (orquestador, no implementador)

| Artefacto | Acción | Responsable |
|---|---|---|
| `production_artifacts/2026-11-09-mutation-testing/mutation-baseline.md` | crear | orquestador (background, 40–60 min) |
| `reports/mutation/{mutation.json,mutation.html}` | generar (gitignored) | orquestador |

Dos corridas para determinismo (|Δ| ≤ 0.5, EC-09). **Ningún implementador ejecuta Stryker** (límite 15 min/task).

---

## 3. Chunk 3 — Triaje (sub-chunks ≤5 test files cada uno, @app-engineer)

| Sub-chunk | Archivos | Hipótesis a matar | LOC est. |
|---|---|---|---|
| **3a** | `tests/unit/motor-torneo/model.test.ts` · `tests/unit/motor-torneo/diagnostics.test.ts` | Literales de `DEFAULT_PARAMS.W_*` (EC-08) + umbrales de semáforo | +70 |
| **3b** | `tests/unit/motor-torneo/bracket.test.ts` · `tests/unit/motor-torneo/calendar.test.ts` | Pases libres, no-solape, límites de bloque | +40 |
| **3c** | `tests/unit/motor-torneo/loader.test.ts` · `tests/unit/motor-torneo/verify.test.ts` | Códigos/mensajes que hoy solo se comparan por longitud | +40 |
| **3d** | `tests/unit/motor-torneo/solver-parity.test.ts` | `engine`/`courts`/`solver`: asserts de validez, **nunca** solución exacta (EC-10) | +30 |
| **3e** | `tests/unit/validations/torneo.test.ts` · `tests/unit/torneos/limits.test.ts` · `tests/unit/torneos/dispatch.test.ts` | Probablemente 0 cambios (ya asertean literales) | +20 |

**Criterio de salida por sub-chunk:** `pnpm test:unit` verde + `--mutate <archivos>` re-corrido y sobrevivientes de ese sub-chunk con decisión. **Prohibido tocar `lib/**`** (AC-08).

---

## 4. Chunk 4 — Cierre

| # | Archivo | Acción | Agente | LOC est. |
|---|---|---|---|---|
| 1 | `stryker.conf.mjs` | editar (`thresholds` = score−5 / score−5 / score, `// EXCLUDED:` si aplica D8) | @app-engineer | ±5 |
| 2 | `production_artifacts/.../mutation-triage.md` | crear (1 fila por sobreviviente, 0 sin decisión) | orquestador | ~150 |
| 3 | `production_artifacts/.../ponytail-review-report.md` | crear | @ponytail-reviewer | ~40 |
| 4 | `ARCHITECTURE.md` | editar (§"Mutation testing (Stryker)" con números reales) | @architect | +25 |
| 5 | `FEATURES.md` | editar (entrada v0.13, metadata) | @architect | +30 |
| 6 | `production_artifacts/.../{release-report.md,evidence-manifest.json}` | crear | @qa-release | ~120 |

`AGENTS.md`, `.env.example`, `lib/api-docs/spec.ts`, `scripts/validate-harness.js`, `jest.config.js`: **sin cambios** (ver technical-design §12).

---

## 5. Orden de ejecución y gates

```
/app-engineer (chunk 1: 5 archivos)
      │  gate: --listTests = 10 suites + --dryRun scope OK
      ▼
orquestador (chunk 2: baseline ×2, background)
      │  gate: mutation-baseline.md con score global + por archivo + conteos
      ▼
/app-engineer (chunk 3a…3e, ≤5 test files por sub-chunk)
      │  gate: pnpm test:unit verde · sin cambios en lib/**
      ▼
orquestador (re-corridas + thresholds + mutation-triage.md)
      │  gate AC-06: 0 sobrevivientes sin decisión
      ▼
/ponytail-reviewer (sin helpers ni asserts duplicados)
      │
      ▼
/architect (ARCHITECTURE.md + FEATURES.md con cifras medidas)
      │
      ▼
/qa-release (--typecheck --lint --tests --build, AC-08/09/10, evidence-manifest)
```

**No intervienen:** @auth-security, @db-engineer, @admin-engineer, @ui-designer, @pm (spec ya cerrada).

---

## 6. Resumen de archivos tocados

| Tipo | Cantidad | Archivos |
|---|---|---|
| Nuevos (config) | 2 | `stryker.conf.mjs`, `jest.config.mutation.js` |
| Editados (config) | 2 | `package.json`, `.gitignore` |
| Nuevos (test) | 1 | `tests/unit/torneos/dispatch.test.ts` |
| Editados (test) | ≤10 | suites de `tests/unit/motor-torneo/*` + `torneos/limits` + `validations/torneo` |
| Docs | 2 | `ARCHITECTURE.md`, `FEATURES.md` |
| Artifacts | 6 | `mutation-baseline.md`, `mutation-triage.md`, `ponytail-review-report.md`, `release-report.md`, `evidence-manifest.json`, (estos 2 docs) |
| Producción (`lib/`, `app/`, `components/`, `hooks/`) | **0** | — |

---

## 7. Ajustes post Cross-Agent Review (v2 — 2026-11-09)

> Fuente: `design-review.md` (veredicto APROBADO CON CAMBIOS) · delta documentado en `technical-design-v2.md`.
> **Ninguna fila anterior se elimina**; aquí van las filas ajustadas/nuevas. D1–D9 intactas.

### 7.1 Chunk 1 — filas ajustadas y agregadas

| # | Archivo | Acción | Agente | LOC est. | Notas |
|---|---|---|---|---|---|
| 1 | `stryker.conf.mjs` | crear | @app-engineer | **~75** (era 55) | **B1**: `ignorePatterns` = lista cerrada de 15 patrones (`node_modules`, `.git`, `.next`, `coverage`, `reports`, `test-results`, `playwright-report`, `.unlighthouse`, `.validation`, `.engram`, `production_artifacts`, `motor_torneo`, `drizzle`, `.stryker-tmp`, `*.tsbuildinfo`). **M3**: `cleanTempDir: "always"`. **N2**: comentario de `mutate` sin `synthetic.ts`/`index.ts`. **N3**: sin `// @ts-check` ni `@type import(...)` |
| 4 | `.gitignore` | editar | @app-engineer | **+3** (era +2) | `reports/mutation/` + `.stryker-tmp-*/` (`.stryker-tmp/` ya existe) |
| 5 | `tests/unit/torneos/dispatch.test.ts` | crear | @app-engineer | ~110 | **N4**: mock **factory obligatorio** — `jest.mock("@/lib/db", () => ({ db: { update: jest.fn(), insert: jest.fn(), select: jest.fn(), execute: jest.fn() } }))`. Prohibido el automock (instancia `new Pool`) |
| **6** | `pnpm-lock.yaml` | **generar** | **@app-engineer** (misma sub-task que la fila 3) | 0 authored | **M1**: ejecutar `pnpm install` tras editar `package.json` y commitear el lockfile. Budget: **5 archivos escritos a mano + 1 generado** (excepción documentada, no cómputa contra el límite de 5) |

**Criterio de salida del chunk 1 (actualizado):** `npx jest -c jest.config.mutation.js --listTests` ⇒ **10 suites exactas** · `npx stryker run --dryRun` ⇒ solo archivos del scope, 0 `CompileError`, **sandbox < 100 MB** (B1) · `pnpm test:unit` verde · `git status` muestra `pnpm-lock.yaml` modificado.

### 7.2 Chunk 2 — ajuste de responsabilidad

| Artefacto | Acción | Responsable |
|---|---|---|
| (sin re-instalación) | `npx stryker --version` = `10.1.1` (deps + lockfile ya resueltos en chunk 1) | orquestador |

### 7.3 Chunk 4 — artifact agregado

| # | Archivo | Acción | Agente | LOC est. |
|---|---|---|---|---|
| 7 | `production_artifacts/.../{90-metrics.json,91-gate-results.json}` | crear (los exige `artifact_completeness`) | @qa-release | ~40 |

### 7.4 Contingencia (no asignada a chunk, dueño @architect)

| Archivo | Disparador | Acción | LOC |
|---|---|---|---|
| `eslint.config.mjs` | `--lint` reporta rutas bajo `.stryker-tmp` (residuo por `SIGKILL`) | agregar `".stryker-tmp/**"` a `ignores` y anotarlo en `release-report.md` | +1 |

### 7.5 Inventario de artifacts corregido (N5, reemplaza la fila `Artifacts` de §6)

| Tipo | Cantidad | Archivos |
|---|---|---|
| Docs del diseño | 4 | `feature-spec.md`, `technical-design.md`, **`technical-design-v2.md`**, **`design-review.md`** (+ `change-map.md` que es la spec de ejecución) |
| Artifacts de ejecución | 6 | `mutation-baseline.md`, `mutation-triage.md`, `ponytail-review-report.md`, `release-report.md`, `evidence-manifest.json`, **`90-metrics.json` + `91-gate-results.json`** |
| Config | 3 | `stryker.conf.mjs`, `jest.config.mutation.js`, **`pnpm-lock.yaml`** |
| Docs de producto | 2 | `ARCHITECTURE.md`, `FEATURES.md` |
| Producción (`lib/`, `app/`, `components/`, `hooks/`) | **0** | — |
