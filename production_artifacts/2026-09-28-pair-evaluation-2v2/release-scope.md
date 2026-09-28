# Release Scope — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> status: proposed

## Feature a Implementar

Evaluación eficiente de parejas en cancha: selección de dupla (2 alumnos), sincronización de criterios compartidos (`tactica`, `actitud_equipo`), desglose individual (`tecnica_basica`, `tecnica_especifica`, `fisica`), y publicación transaccional de 2 evaluaciones independientes con versionado por alumno + evento de auditoría `pair_evaluation_published`.

## Agentes Requeridos (orden de ejecución)

| # | Agente | Responsabilidad | Deliverable |
|---|--------|-----------------|-------------|
| 1 | @db-engineer | Query transaccional `publishPairEvaluation` (2 inserts + versionado por alumno + auditoría), validación de inscripción de ambos alumnos, tests unit de queries. Sin migración esperada (schema `evaluations` intacto). | `db-plan.md`, `migration-notes.md` (si aplica) |
| 2 | @app-engineer | Refactor `scoring-canvas.tsx` a modo pareja (estado A/B, conmutador por criterio, columnas), wrapper `pair-student-picker`, lógica pura `lib/padel/pair.ts` (sync/desync), schema Zod `pairEvaluationPublishSchema`, endpoint(s) de pareja, API docs, tests unit + API happy-path SQL real + E2E. | `app-notes.md` |
| 3 | @auth-security | Revisión de guards del endpoint de pareja (guardAdmin + ACTIVE), anti-IDOR (ambos alumnos inscritos en el curso → 404), auditoría `PAIR_EVALUATION_PUBLISHED`, rate limit si aplica. | `auth-impact.md`, `security-checklist.md` |
| 4 | @qa-release | Validación de acceptance criteria (CA-01..CA-08), regresión 1v1 (modo individual intacto), test-matrix, release-report. | `release-report.md`, `test-matrix.md`, `acceptance-criteria.md` |

## Dependencias

- **Bloqueantes**: `lib/db/queries/padel/evaluations.ts` (patrón `publishEvaluation` + `isNotDeleted` de G16), `lib/padel/score.ts`, `lib/validations/padel.ts`, `lib/audit/helpers.ts`, `lib/api-docs/spec.ts`.
- **Reutilización**: `student-picker.tsx`, `scoring-canvas.tsx` (modo 1v1 debe seguir funcionando), `evaluation-card.tsx` (badge versión).
- **Sin dependencias externas nuevas**: no se agregan librerías (gate ponytail).

## Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| R1 — Complejidad UI (2 columnas + conmutadores) | Media | Lógica de sync extraída a función pura `lib/padel/pair.ts`; modo 1v1 intacto |
| R2 — Atomicidad 2 inserts + auditoría | Alta | `db.transaction` Drizzle + tests de rollback |
| R3 — Carrera en versionado por alumno | Alta | Cómputo `MAX(version)+1` dentro de la transacción (patrón existente) |
| R4 — Regresión cobertura `scoring-canvas` | Media | Unit tests de `pair.ts` + gate `--coverage` |
| R5 — Decisión abierta dimensión `reglas` | Baja | Confirmar con negocio en technical design; default propuesto: compartida |

## Criterios de Release

1. **CA-01 a CA-08** de `feature-spec.md` verificados (mínimo 3 acceptance criteria + tests).
2. **Tests**: unit (Jest) de `pair.ts` + queries transaccionales; API (Playwright) con happy-path SQL real contra NeonDB (2 filas, versiones, auditoría) + guards 401/403/404; E2E navegable del flujo dupla.
3. **Gates del harness**: `--all` verde (typecheck, lint, unit, API, E2E, build, secrets, SAST, api integration, coverage, api-docs).
4. **Retrocompatibilidad**: evaluación 1v1 sin cambios de comportamiento; endpoints existentes intactos.
5. **Docs**: `lib/api-docs/spec.ts` actualizado; FEATURES.md con entrada `pair-evaluation-2v2` (status released al cerrar); ARCHITECTURE.md sección Padel v0.8.
6. **Auditoría**: evento `pair_evaluation_published` con payload completo registrado en cada publicación.

## Notas de Orquestación

- Este spec es el punto de partida para `/ship-feature pair-evaluation-2v2` (workflow end-to-end: spec → technical-design → db → app → auth → ponytail-review → qa-release).
- Los subagentes @db-engineer, @app-engineer y @auth-security deben ejecutarse en ese orden con los prompts derivados de este release-scope y del feature-spec.
- Al cerrar, registrar métricas de loop: `node scripts/loop-metrics.js --record pair-evaluation-2v2 --iterations <n> --module dashboard`.