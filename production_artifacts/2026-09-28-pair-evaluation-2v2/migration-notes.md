# Migration Notes — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> status: in-progress
> module: db

## Estado: SIN MIGRACIÓN

- **D1**: el schema `evaluations` (baseline `0000_*` + `0007_nostalgic_dagger.sql` para version) ya cubre el caso de pareja: 2 filas independientes con studentId/teacherId/rubricId/courseId/status/version.
- **D2**: no se agrega `pairId` — la relación se infiere del audit log.
- No se ejecutó `pnpm run db:generate` (schema.ts sin cambios).
- `drizzle/meta/_journal.json` intacto (orden cronológico verificado, sin entradas nuevas).

## Impacto en DB existente

| Tabla | Cambio |
|-------|--------|
| `evaluations` | Ninguno (se insertan 2 filas draft/published por pareja) |
| `evaluation_scores` | Ninguno (se reutiliza el patrón de save) |
| `audit_logs` | Ninguno (nuevo actionType `PAIR_EVALUATION_PUBLISHED` en newValues/metadata, sin constraint) |
| `course_enrollments` | Ninguno (se consulta para validar inscripción) |

## Verificación post-cambio

- [x] `pnpm run db:generate` NO ejecutado (sin cambios de schema)
- [x] `drizzle/meta/_journal.json` sin modificaciones (`git status` limpio en drizzle/)
- [x] Tests unit de queries de pareja pasan: `pnpm run test:unit --testPathPatterns=pair` (12/12)
- [x] Suite unit completa: 578 tests / 46 suites pasan

## Nota para próximas iteraciones

Si en el futuro se requiere reconstruir la relación de pareja (dashboard de métricas de pareja), la fuente de verdad es `audit_logs.action_type = 'PAIR_EVALUATION_PUBLISHED'` con `new_values.student_a_id` / `student_b_id`. No se necesita columna nueva (D2, YAGNI).