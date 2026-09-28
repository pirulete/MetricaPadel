# Change Map — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> status: proposed

## 1. Archivos a Crear

| # | Archivo | Líneas est. | Agente | Propósito |
|---|---------|-------------|--------|-----------|
| 1 | `lib/db/queries/padel/pair.ts` | ~200 | @db-engineer | `createPairDrafts`, `savePairEvaluationScores`, `publishPairEvaluation` (transaccionales, versionado por alumno, audit en tx) |
| 2 | `lib/padel/pair.ts` | ~120 | @app-engineer | Lógica pura: categorías compartidas/individuales, sync, totals, audit counts |
| 3 | `app/api/evaluations/pair/route.ts` | ~150 | @app-engineer | POST create + PUT save de pareja (guardAdmin + Zod + anti-IDOR) |
| 4 | `app/api/evaluations/pair/publish/route.ts` | ~120 | @app-engineer | POST publish de pareja (guardAdmin + Zod + anti-IDOR) |
| 5 | `components/padel/pair-student-picker.tsx` | ~120 | @app-engineer | Selección de exactamente 2 alumnos inscritos del curso |
| 6 | `components/padel/pair-scoring-canvas.tsx` | ~400 | @app-engineer | Canvas 2 columnas + conmutador por criterio + score en vivo |
| 7 | `app/(app)/evaluar/pareja/page.tsx` | ~60 | @app-engineer | Página de evaluación en pareja |
| 8 | `tests/unit/padel/pair.test.ts` | ~150 | @app-engineer | Unit tests de lógica pura (R4) |
| 9 | `tests/unit/db/pair-queries.test.ts` | ~150 | @db-engineer | Unit tests de queries transaccionales (rollback, versionado) |
| 10 | `tests/api/padel/pair-evaluations-happy.spec.ts` | ~180 | @app-engineer | Happy-path SQL real: 2 filas, versiones, auditoría, independencia alumno |
| 11 | `tests/api/padel/pair-evaluations-guard.spec.ts` | ~120 | @app-engineer | Guards 401/403/400/404 (CA-07) |
| 12 | `tests/e2e/pair-evaluation.spec.ts` | ~100 | @app-engineer | E2E navegable del flujo dupla |

## 2. Archivos a Modificar

| # | Archivo | Cambio | Líneas est. | Agente |
|---|---------|--------|-------------|--------|
| 1 | `lib/db/queries/padel/evaluations.ts` | Extraer `saveEvaluationScoresTx(tx, ...)` y `countMissingCriteria(tx, ...)` (refactor puro, comportamiento idéntico) | 422→~450 | @db-engineer |
| 2 | `lib/validations/padel.ts` | +`pairEvaluationCreateSchema`, `pairEvaluationSaveSchema`, `pairEvaluationPublishSchema` | 145→~185 | @app-engineer |
| 3 | `components/padel/course-detail.tsx` | +botón "Evaluar en Pareja" (link `/evaluar/pareja?courseId=X`) | 247→~262 | @app-engineer |
| 4 | `lib/audit/helpers.ts` | +constante `PAIR_EVALUATION_PUBLISHED` + helper `auditPairEvaluationPublished` (excepción >500 líneas documentada) | 539→~559 | @auth-security |
| 5 | `lib/api-docs/paths/padel.ts` | +3 paths (pair create/save/publish) | 346→~426 | @app-engineer |
| 6 | `lib/api-docs/schemas/padel.ts` | +4 schemas (PairEvaluationCreateInput/SaveInput/PublishInput/Response) | 306→~366 | @app-engineer |
| 7 | `tests/unit/validations/padel.test.ts` | +tests de schemas de pareja | — | @app-engineer |
| 8 | `FEATURES.md` | +entrada `pair-evaluation-2v2` (v0.8) | — | @qa-release |
| 9 | `ARCHITECTURE.md` | +sección "Padel Evaluativo — Evaluación en Pareja (v0.8)" | — | @architect |

## 3. Archivos NO Modificados (explícito)

- `lib/db/schema.ts` — sin migración (D1/D2)
- `components/padel/scoring-canvas.tsx` — 1v1 intacto (D12)
- `components/padel/student-picker.tsx` — intacto (el picker de pareja es componente nuevo)
- `lib/auth/admin-guard.ts`, `auth.ts` — sin cambios (se reutiliza `guardAdmin`)
- `.env.example` — sin nuevas variables (D11)
- `lib/padel/score.ts`, `lib/padel/coverage.ts` — intactos (se reutilizan)

## 4. Orden de Ejecución por Agente

```
1. @db-engineer
   ├── Refactor evaluations.ts (helpers tx-scoped)          [bloqueante para 2]
   ├── Crear pair.ts (queries transaccionales)
   ├── tests/unit/db/pair-queries.test.ts
   └── Verificar: sin migración (schema suficiente)

2. @app-engineer  (depende de 1)
   ├── lib/padel/pair.ts + tests/unit/padel/pair.test.ts
   ├── lib/validations/padel.ts + tests/unit/validations
   ├── app/api/evaluations/pair/route.ts
   ├── app/api/evaluations/pair/publish/route.ts
   ├── components/padel/pair-student-picker.tsx
   ├── components/padel/pair-scoring-canvas.tsx
   ├── app/(app)/evaluar/pareja/page.tsx
   ├── components/padel/course-detail.tsx (botón)
   ├── lib/api-docs/paths/padel.ts + schemas/padel.ts
   ├── tests/api/padel/pair-evaluations-happy.spec.ts
   ├── tests/api/padel/pair-evaluations-guard.spec.ts
   └── tests/e2e/pair-evaluation.spec.ts

3. @auth-security  (depende de 2 — revisa endpoints)
   ├── lib/audit/helpers.ts (constante + helper)
   ├── auth-impact.md
   └── security-checklist.md

4. @ponytail-reviewer  (depende de 2, 3)
   └── ponytail-review-report.md

5. @qa-release  (depende de 4)
   ├── Regresión 1v1 + CA-01..CA-08
   ├── test-matrix.md, acceptance-criteria.md, release-report.md
   └── FEATURES.md (entrada v0.8)
```

## 5. Dependencias entre Cambios

| Dependencia | Tipo | Detalle |
|-------------|------|---------|
| pair.ts queries ← evaluations.ts refactor | Bloqueante | `savePairEvaluationScores` y `publishPairEvaluation` reutilizan `saveEvaluationScoresTx` y `countMissingCriteria` |
| Route handlers ← pair.ts queries | Bloqueante | Los endpoints llaman las queries transaccionales |
| UI canvas ← route handlers | Bloqueante | `pair-scoring-canvas` consume los 3 endpoints |
| API tests ← route handlers | Bloqueante | Happy-path y guards ejercitan los endpoints |
| @auth-security ← endpoints | Bloqueante | Revisa guards/anti-IDOR/auditoría de los 3 endpoints |
| api-docs ← contratos (sección 4 del technical-design) | Paralelo | Puede escribirse junto con los endpoints |

## 6. Gates a Validar al Cerrar

- `--typecheck`, `--lint`, `--build` — 0 errores
- `--unit` — tests de `pair.ts`, `pair-queries`, validations
- `--api` — happy-path SQL real + guards
- `--e2e` — flujo dupla navegable
- `--coverage` — sin regresión >3% en módulos afectados (scoring-canvas NO se toca; módulos nuevos cubiertos por tests)
- `--api-docs` — 3 paths + 4 schemas en `lib/api-docs/spec.ts`
- `--features` / `--docs` — FEATURES.md y ARCHITECTURE.md actualizados
- `--secrets`, `--sast` — sin hallazgos

## 7. Métricas de Loop

```bash
node scripts/loop-metrics.js --start pair-evaluation-2v2 --module dashboard
# ... al cerrar:
node scripts/loop-metrics.js --finish pair-evaluation-2v2 --iterations <n> --gates-failed <n> --module dashboard
```