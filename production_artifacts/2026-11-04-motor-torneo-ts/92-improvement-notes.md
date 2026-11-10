# Improvement Notes — 2026-11-04-motor-torneo-ts

> Generado por @qa-validator tras @qa-release (Step 6). Observaciones de validación, no bloqueantes.

## 1. Gates heredados de la corrida previa (`.validation/status.json`, 2026-11-04T15:40:43Z)

En esta pasada @qa-release **no** re-ejecutó `build`, `secrets`, `sast`, `coverage_check`, `audit_deps` (regla anti-loop: no `next build`). En `evidence-manifest.json` quedan en `"pass"` porque la última corrida completa del harness los reportó en pass (19 gates pass / 0 fail / 4 warnings).

| Gate | Fuente del `pass` | Re-confirmación |
|---|---|---|
| `build` | `.validation/status.json` 15:40 (19/0) | Harness del orquestador (Step 7) |
| `secrets` | `.validation/status.json` 15:40 | Harness del orquestador |
| `sast` | `.validation/status.json` 15:40 | Harness del orquestador |
| `coverage_check` | `.validation/status.json` 15:40 + medición del módulo en `release-report.md` §2.3 (lines 95.94 % vs baseline 88.6 %) | Harness del orquestador |
| `audit_deps` | `.validation/status.json` 15:40 | Harness del orquestador |

Warnings históricos no bloqueantes: `e2e_tests`, `api_integration`, `env_vars`, `file_size`.

## 2. Inconsistencias de datos detectadas

- **`risk_level`**: `.validation/status.json` reporta `HIGH` (módulo nuevo con WASM + worker + migración); este manifest usa `MEDIUM` (per instrucción del orquestador). Si el gate `risk_policy` recalcula, puede volver a `HIGH` — no es un fallo.
- **`files_changed = 61`**: `change-map.md` §10 declara 56 archivos (46 ✨ + 8 ✏️ + 1 ⚙️ + 1 revisión) + 5 fixtures (§9). §12 agrega 20 filas, casi todas re-cortes de archivos ya contados; se usa 56 + 5 = 61 como mejor estimación. El conteo exacto sale de `git status` (release-report.md §8 menciona **76 entradas**, incluye migración 0013 de v0.11 y `pnpm-lock.yaml`).
- **`unit_test_count = 1094`**: 1093 passed + 1 skipped (paridad L2 lenta opt-in `RUN_SLOW_PARITY=1`, aunque `release-report.md` §6 confirma que esa corrida PASÓ con `EXIT=0`). `tests_added = 15` = 10 unit (motor 8 + validations 1 + db 1) + 4 API specs + 1 E2E; es estimación, no conteo de casos individuales.

## 3. Riesgos abiertos que el manifest NO cubre

- **R-01 (bloqueante de `main`)**: GATE F1 solo validado en modalidad local aproximada; requiere re-validación en invocación real de Vercel. El manifest acredita `rama-preview`, no producción.
- **R-04 (producto, M1.1)**: `bloqueFinalObjetivo = 33` hard-codeado ⇒ torneos chicos resultan `infeasible`.
- **R-07 / O-m8**: `hooks/use-tournament-run.ts` sin unit tests (cubierto solo por E2E).
