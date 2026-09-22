# Change Map — Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso (G6 + G7 + G12)

> status: in-progress
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: api+db+ui
> tags: [padel, evaluations, versions, evolution, courses, enrollment, migration, api, ui]

---

## Resumen

- **DB**: 1 migración (`0007_*` — NOTA: `0006_handy_proemial_gods.sql` ya existe, el spec decía 0006_* pero el número real es 0007_*). Columna `evaluations.version` + índice `(studentId, rubricId, status)` + backfill.
- **API**: 6 endpoints nuevos + 1 modificado.
- **UI**: 1 página nueva + 6 componentes (1 nuevo, 5 modificados).
- **Tests**: 6 unit (2 nuevos, 3 modificados... ver tabla), 6 API (4 nuevos, 2 guard), 3 E2E nuevos.
- **Auth**: sin cambios. **Env vars**: ninguna.

## Archivos por Feature

### G6 — Versiones de evaluación

| Archivo | Acción | Líneas est. | Split |
|---|---|---|---|
| `lib/db/schema.ts` | MOD | 669 → ~680 | No (excepción schema) |
| `drizzle/0007_*.sql` | NEW | ~30 | No |
| `drizzle/meta/0007_snapshot.json` | NEW (db:generate) | — | No |
| `lib/db/queries/padel/evaluations.ts` | MOD | 229 → ~400 | No (cohesivo, <500) |
| `lib/validations/padel.ts` | MOD | 131 → ~160 | No |
| `app/api/evaluations/[id]/publish/route.ts` | MOD | 69 → ~75 | No |
| `app/api/evaluations/series/route.ts` | NEW | ~70 | No |
| `app/api/student/evaluations/series/route.ts` | NEW | ~65 | No |
| `components/padel/scoring-canvas.tsx` | MOD | 347 → ~390 | No |
| `components/padel/evaluation-card.tsx` | MOD | 70 → ~85 | No |
| `lib/api-docs/paths/padel.ts` | MOD | 314 → ~400 | No |
| `lib/api-docs/schemas/padel.ts` | MOD | 256 → ~330 | No |
| `tests/unit/db/evaluations.test.ts` | MOD | ~250 → ~330 | No |
| `tests/api/padel/evaluation-version-happy.spec.ts` | NEW | ~120 | No |
| `tests/api/padel/evaluation-version.spec.ts` | NEW | ~60 | No |
| `tests/e2e/evaluation-version.spec.ts` | NEW | ~90 | No |

### G7 — Vista de evolución alumno

| Archivo | Acción | Líneas est. | Split |
|---|---|---|---|
| `lib/padel/evolution.ts` | NEW | ~80 | No |
| `app/api/student/evolution/route.ts` | NEW | ~60 | No |
| `app/(app)/evolucion/page.tsx` | NEW | ~45 | No |
| `components/padel/evolution-view.tsx` | NEW | ~220 | No |
| `components/padel/bottom-nav.tsx` | MOD | 59 → ~70 | No |
| `app/(app)/evaluaciones/page.tsx` | MOD | ~120 → ~135 | No |
| `lib/api-docs/paths/padel.ts` | MOD | (G6) → ~430 | No |
| `lib/api-docs/schemas/padel.ts` | MOD | (G6) → ~380 | No |
| `tests/unit/padel/evolution.test.ts` | NEW | ~110 | No |
| `tests/api/padel/student-evolution-happy.spec.ts` | NEW | ~130 | No |
| `tests/e2e/student-evolution.spec.ts` | NEW | ~80 | No |

### G12 — Gestión de alumnos por curso

| Archivo | Acción | Líneas est. | Split |
|---|---|---|---|
| `lib/db/queries/padel/enrollments.ts` | MOD | 256 → ~360 | No (cohesivo, <500) |
| `lib/validations/padel.ts` | MOD | (G6) → ~190 | No |
| `app/api/courses/[id]/students/route.ts` | NEW | ~110 | No |
| `app/api/courses/[id]/students/[studentId]/route.ts` | NEW | ~70 | No |
| `app/api/courses/[id]/students/search/route.ts` | NEW | ~60 | No |
| `components/padel/course-detail.tsx` | MOD | 160 → ~280 | No |
| `lib/api-docs/paths/courses.ts` | MOD | 198 → ~300 | No |
| `lib/api-docs/schemas/courses.ts` | MOD | 175 → ~230 | No |
| `tests/unit/db/enrollments.test.ts` | MOD | ~200 → ~300 | No |
| `tests/api/padel/course-students-happy.spec.ts` | NEW | ~150 | No |
| `tests/api/padel/course-students.spec.ts` | NEW | ~70 | No |
| `tests/e2e/course-students.spec.ts` | NEW | ~90 | No |

### Documentación

| Archivo | Acción | Líneas est. |
|---|---|---|
| `ARCHITECTURE.md` | MOD (sección v0.4) | +~25 |
| `FEATURES.md` | MOD (entrada al cerrar) | +~30 |
| `production_artifacts/2026-09-21-etapa4-evolution-management/technical-design.md` | NEW (este) | ~200 |
| `production_artifacts/2026-09-21-etapa4-evolution-management/change-map.md` | NEW (este) | ~90 |

## Totales

- **Archivos nuevos**: 17 (1 migración + 6 route handlers + 1 página + 2 componentes/lib + 7 tests + 2 artifacts)
- **Archivos modificados**: 18
- **Total**: ~35 archivos
- **Ningún archivo supera 500 líneas** (máximo estimado: `lib/api-docs/paths/padel.ts` ~430).

## Orden de Implementación

1. **@db-engineer**: schema → migración 0007 → queries → unit tests db.
2. **@app-engineer**: G6 (validaciones → routes → docs → UI) → G7 (evolution.ts → route → UI) → G12 (queries → routes → docs → UI) → tests API/E2E.
3. **@ponytail-reviewer** → **@qa-release**.

## Gates a Verificar

- [ ] `pnpm run db:migrate` + `SELECT column_name FROM information_schema.columns WHERE table_name='evaluations' AND column_name='version'`
- [ ] `_journal.json` cronológico (0007 después de 0006)
- [ ] typecheck 0, lint 0, build OK
- [ ] unit + API happy (SQL real) + E2E pasando
- [ ] `lib/api-docs/spec.ts` compone los paths/schemas nuevos
- [ ] cobertura módulo padel sin regresión >3%
- [ ] auditoría en publish + add/remove student
- [ ] anti-IDOR 404 en los 3 gaps