# Improvement Notes — 2026-09-21-gaps-user-flows

Validación post-flight: **PASS** (21/21 gates, 0 failed, 2 warnings no bloqueantes).

## Observaciones

### 1. FEATURES.md referencia archivos inexistentes (warning `features_check`)
El gate `--features` reportó 11 referencias a archivos que no existen en disco:
- `lib/db/queries/padel/{rubrics,evaluations,admin-users}.ts` — las queries viven en archivos con otros nombres (ej. `promote.ts`, `enrollments.ts`); actualizar referencias en FEATURES.md.
- `lib/api-docs/{paths,schemas}/padel.ts` — los docs viven en `paths/courses.ts` + `paths/padel.ts`; consolidar o corregir rutas.
- `tests/unit/db/{rubrics,evaluations,admin-users}.test.ts` — existen `admin-users.test.ts` y `enrollments.test.ts`; faltan `rubrics`/`evaluations` o corregir nombres.
- `tests/api/padel/{admin-users,rubrics,evaluations,student}-happy.spec.ts` — los happy-path reales usan sufijos `-happy.spec.ts` con otros nombres (ej. `promote-happy`, `course-leave-happy`); alinear FEATURES.md con los nombres reales.

**Acción sugerida:** revisar la sección de archivos de la entrada de esta feature en FEATURES.md y corregir las rutas para que coincidan con el disco.

### 2. Loop metrics sin archivo (info `loop_metrics`)
No existe `.validation/loop-timers.json` ni registro de métricas del loop para este change_id. Registrar con `node scripts/loop-metrics.js --record 2026-09-21-gaps-user-flows --iterations N --gates-failed 0` para alimentar la tendencia.

### 3. Archivos > 500 líneas (warning `file_size`)
- `components/preview/etapa1-core-evaluativo.tsx` (648 líneas) y `components/preview/etapa3-dashboard-management.tsx` (843 líneas) superan el límite. Son mockups efímeros de `components/preview/` que se eliminan al implementar la feature — excepción aceptable, pero considerar dividirlos si persisten.

## Conclusión
Ninguna observación bloqueante. El release puede proceder.