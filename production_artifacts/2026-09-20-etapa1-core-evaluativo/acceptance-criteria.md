# Acceptance Criteria — Etapa 1: Core Evaluativo

> change_id: `etapa1-core-evaluativo` | date: 2026-09-20
> Fuente: `feature-spec.md` (AC 1-8) + edge cases del spec.

## Estado por criterio

| # | Criterio | Evidencia | Estado |
|---|----------|-----------|--------|
| 1 | ADMIN crea usuario USER vía `POST /api/admin/users`; queda ACTIVE y puede loguearse | unit Zod+query, admin-users-happy.spec.ts, guard.spec.ts | ✅ |
| 2 | Editor de rúbrica P03: título, categoría, 4 niveles, matriz de descriptores (≥1 criterio); persiste levels/criteria/descriptors | unit rubrics, rubrics-happy.spec.ts | ⚠️ sin E2E |
| 3 | Biblioteca P02: tabs Activas/Archivadas, crear, archivar (soft) | rubrics-happy.spec.ts | ⚠️ sin E2E |
| 4 | Evaluar P09: alumno+rúbrica, nivel por criterio, score en vivo, notas, borrador y publicar | unit score, evaluations-happy.spec.ts | ⚠️ sin E2E |
| 5 | Detalle alumno A03: evaluaciones publicadas, score, comentario, desglose, marcar leído idempotente, empty state | student-happy.spec.ts | ⚠️ sin E2E |
| 6 | Guards y ownership: 401 sin sesión, 403 cross-role, 404 IDOR | guard.spec.ts (18 tests) | ✅ |
| 7 | API docs: todos los endpoints en `lib/api-docs/spec.ts` | paths/padel.ts (10 paths) + schemas/padel.ts | ✅ |
| 8 | Calidad: tsc 0, lint 0, build ok, cobertura sin regresión >3% | ejecutado 2026-09-20 | ✅ |

## Edge cases validados (spec §Edge Cases)

| Edge case | Estado |
|-----------|--------|
| Rúbrica sin criterios → 400 | ✅ (validations/padel.ts 100%) |
| Publicar evaluación con criterio sin nivel → 400 | ✅ |
| Rúbrica con 0 descriptores en un nivel → 400 | ✅ |
| Alumno sin evaluaciones → empty state A03 | ⚠️ requiere E2E |
| Biblioteca sin rúbricas → empty state P02 | ⚠️ requiere E2E |
| Evaluación borrador invisible para alumno | ✅ (student-happy) |
| Marcar leído repetido → idempotente | ✅ (student-happy) |
| Archivar rúbrica usada → soft, historial intacto | ✅ (unit rubrics) |
| Títulos duplicados permitidos | ✅ |
| Score en vivo recalcula totalScore | ✅ (unit score) |
| Categoría inválida → 400 | ✅ |

## Estados sensibles (TEMPORARY / ACTIVE / LOCKED / ADMIN)

| Estado | Verificación | Estado |
|--------|--------------|--------|
| Sin sesión → 401 | guard.spec.ts | ✅ |
| USER en endpoints coach → 403 | guard.spec.ts | ✅ |
| ADMIN en endpoints alumno → 403 | guard.spec.ts | ✅ |
| LOCKED nunca permitido en rutas privadas | guard.spec.ts + protected-routes.ts | ✅ |
| IDOR: recurso ajeno → 404 | guard.spec.ts | ✅ |

## Conclusión

AC 1, 6, 7, 8 ✅. AC 2-5 ⚠️ pendientes de E2E navegable. **No aprobar release** hasta crear los 3 E2E specs.