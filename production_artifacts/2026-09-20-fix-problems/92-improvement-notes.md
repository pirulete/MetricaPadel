# Improvement Notes — 2026-09-20-fix-problems

Validación: `node scripts/validate-harness.js --all` (2026-09-20T21:47Z)

## Bloqueante
- **evidence_check (FAIL)**: falta `evidence-manifest.json` en `production_artifacts/2026-09-20-fix-problems/`. Generarlo con la plantilla `.agents/templates/evidence-manifest.template.json` (responsable: @qa-release / orquestador del workflow).

## No bloqueantes
- **features_check (warning)**: FEATURES.md referencia archivos inexistentes:
  - `tests/unit/init-project.test.ts`
  - `production_artifacts/2026-08-23-push-notifications/feature-spec.md`
  - `production_artifacts/2026-08-21-streetmove-sync-port/feature-spec.md`
  - `production_artifacts/2026-08-02-harness-improvements/sync-report.md`
- **loop_metrics (warning)**: no hay archivo de métricas del loop para este change_id. Ejecutar `node scripts/loop-metrics.js --record 2026-09-20-fix-problems --iterations <n> --module <mod>`.
- **file_size (warning)**: `components/preview/etapa1-core-evaluativo.tsx` tiene 648 líneas (>500). Es un mockup efímero; se eliminará al implementar la feature.
- **artifact_completeness (warning)**: `2026-09-20-rubricas-blueprint` tiene 0/3 artifacts esperados (change_id distinto, no bloquea este fix).