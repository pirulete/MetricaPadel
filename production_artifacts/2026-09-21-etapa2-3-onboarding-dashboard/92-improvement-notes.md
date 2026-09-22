# Improvement Notes — Etapa 2-3 Onboarding y Dashboard

Validación: 2026-09-21T02:29:02Z — 21 gates passed, 0 failed, 2 warnings (non-blocking).

## 1. FEATURES.md — referencias a archivos inexistentes (warning `features_check`)

11 archivos referenciados en FEATURES.md no existen en disco:

- `lib/db/queries/padel/{rubrics,evaluations,admin-users}.ts`
- `lib/api-docs/{paths,schemas}/padel.ts`
- `tests/unit/db/{rubrics,evaluations,admin-users}.test.ts`
- `tests/api/padel/{admin-users,rubrics,evaluations,student}-happy.spec.ts`

**Acción sugerida:** actualizar FEATURES.md para reflejar la estructura real (queries en `lib/db/queries/padel/index.ts`, specs en `lib/api-docs/spec.ts`, tests en `tests/unit/padel/` y `tests/api/padel/`), o crear los archivos si son parte del plan.

## 2. Loop metrics — sin archivo de métricas (warning `loop_metrics`)

No se registró `node scripts/loop-metrics.js --record/--finish` para este change_id.

**Acción sugerida:** registrar métricas del loop (iterations, gates-failed, module) para alimentar la tendencia.

## 3. File size — 2 archivos > 500 líneas (warning `file_size`)

- `components/preview/etapa1-core-evaluativo.tsx` (648 líneas)
- `components/preview/etapa3-dashboard-management.tsx` (843 líneas)

**Excepción justificada:** son mockups efímeros de `components/preview/` que se eliminan al implementarse la feature; no son código de producción. No requiere acción.