# Improvement Notes — Mutation testing (Stryker) v0.13

> change_id: `2026-11-09-mutation-testing` · generado por @qa-validator · 2026-11-10T02:28:57Z
> Ninguna observación es bloqueante: `overall = pass`, `gates_failed = 0`.

## 1. Build delegado (nota requerida en `91-gate-results.json`)

`npx next build` **no fue ejecutado** por @qa-release (delegado por alcance al harness `--all`, step 7b). El campo `build` se marca `pass` con base en: (a) último build verde del harness el 2026-11-04, (b) el change no modifica `app/`, `lib/`, `components/`, `hooks/`, `next.config.mjs` ni dependencias de runtime — solo devDeps de desarrollo (`@stryker-mutator/*@10.1.1`, `jest-environment-node@^30.4.1`).
**Acción del orquestador:** confirmar el gate `--build` en la corrida `--all` y, si falla, degradar este manifest a `fail`.

## 2. Riesgos abiertos que el manifest no puede expresar

| # | Riesgo | Naturaleza | Mitigación vigente |
|---|---|---|---|
| R1 | `ignoreStatic: true` deja `lib/validations/torneos.ts` con **6/6 mutantes `Ignored`** | Limitación de diseño, no fallo | Documentado en `ARCHITECTURE.md` + triage §6; los schemas Zod siguen cubiertos por asserts de la suite normal |
| R2 | **22 mutantes `excluded (coste)`** en `solver.ts` (ramas límite HiGHS) → solver 54.2% | Ceguera parcial en el tramo más frágil | Contados como sobrevivientes por la fórmula v10; excluirlos requeriría mock del WASM (D8) |
| R3 | Corrida completa **45–99 min y opt-in** → nadie la corre sin disciplina | Proceso | `--all` intacto; `test:mutation:phase-b` para el tramo WASM; threshold con margen −5 |
| R4 | CompileError 30.6% (570) > guía 5% de EC-07 | Ruido del checker TS | No entra al denominador v10; revisar `tsconfig` del runner si supera 50% |

## 3. Deuda documental (no bloqueante)

- **BUG-03**: `change-map.md` §1 sigue con el criterio histórico "10 suites exactas"; el criterio vigente es pertenencia al scope (13 suites, AC-02 enmendado). Limpiar en el próximo change.
- **BUG-04 / desviación semántica AC-06**: los 22 `excluded (coste)` son decisiones a nivel mutante, no exclusión de archivo con `// EXCLUDED:`. Registrado en `mutation-triage.md` §5.

## 4. Lección de proceso (BUG-01)

12 claims "killed" de un triaje previo resultaron falsos (la corrida real daba 83.89%): fixtures que hacían `return` antes del mutante. La reconciliación `file:line` contra `mutation.json` debe ser **automatizada y obligatoria** antes de publicar cualquier score. Si se repite, el mutation score pierde valor probatorio.

## 5. Siguiente foco (fuera de v0.13)

`bracket.ts` (75.3%) y `calendar.ts` (76.1%) están sobre el `break` global (81.9) pero muy por debajo del global (86.9). Candidatos a M2 si se itera el umbral por archivo.
