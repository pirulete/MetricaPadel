# Migration Notes — Etapa 1: Core Evaluativo

> change_id: etapa1-core-evaluativo
> release: v0.1
> date: 2026-09-20
> module: db
> tags: [db, migration]
> status: in-progress

## Migración generada

- **Archivo**: `drizzle/0004_broken_sinister_six.sql`
- **Comando**: `pnpm run db:generate` (drizzle-kit generate) — nunca SQL a mano.
- **Snapshot**: `drizzle/meta/0004_snapshot.json` actualizado automáticamente.
- **Journal**: `drizzle/meta/_journal.json` — entrada `idx: 4`, `tag: "0004_broken_sinister_six"`, `when: 1789946491008`. Orden cronológico verificado (0000 → 0001 → 0002 → 0003 → 0004).

## Contenido del SQL (verificado)

1. `CREATE TYPE` × 3: `evaluation_status`, `rubric_category`, `rubric_status`.
2. `CREATE TABLE` × 6: `evaluation_scores`, `evaluations`, `rubric_criteria`, `rubric_descriptors`, `rubric_levels`, `rubrics`.
3. `ALTER TABLE ADD CONSTRAINT` × 9 FKs:
   - Cascade: `evaluation_scores.evaluation_id → evaluations`, `rubric_criteria.rubric_id → rubrics`, `rubric_descriptors.criteria_id → rubric_criteria`, `rubric_descriptors.level_id → rubric_levels`, `rubric_levels.rubric_id → rubrics`.
   - No action: `evaluation_scores.criteria_id → rubric_criteria`, `evaluation_scores.level_id → rubric_levels`, `evaluations.student_id/teacher_id → users`, `evaluations.rubric_id → rubrics`, `rubrics.owner_id → users`.
4. Índices: 2 UNIQUE (`evaluation_scores_evaluation_criteria_idx`, `rubric_descriptors_criteria_level_idx`) + 6 B-tree (`rubrics_owner_idx`, `rubric_levels_rubric_idx`, `rubric_criteria_rubric_idx`, `evaluations_student_idx`, `evaluations_teacher_idx`, `evaluations_rubric_idx`).

## Estado de ejecución

### ⚠️ Blocker: `db:migrate` no ejecutado contra DB real

`pnpm run db:migrate` falla con:

```
DrizzleQueryError: Failed query: SELECT 1
cause: error: password authentication failed for user 'user' (code 28P01)
```

La `DATABASE_URL` en `.env.local` apunta a NeonDB (`ep-xxxx.us-east-2.aws.neon.tech`) pero las credenciales rechazan la autenticación (posible rotación de password o branch eliminado). No se modificó `.env.local` (regla: nunca sobrescribir).

**Impacto**: el SQL fue generado y verificado por drizzle-kit (sintaxis y snapshot correctos), pero no se pudo validar contra una DB viva ni verificar columnas post-migración (`SELECT column_name FROM information_schema.columns ...`).

**Acción requerida antes de continuar**:
1. Obtener credenciales NeonDB válidas (rotar password o crear branch).
2. Ejecutar `DATABASE_URL="..." pnpm run db:migrate`.
3. Verificar columnas de las 6 tablas nuevas:
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = 'rubrics' AND column_name = 'owner_id';
   SELECT column_name FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'teacher_id';
   SELECT column_name FROM information_schema.columns WHERE table_name = 'evaluation_scores' AND column_name = 'evaluation_id';
   -- análogas para rubric_levels, rubric_criteria, rubric_descriptors
   ```
4. Verificar enums: `SELECT enum_range(NULL::rubric_status), enum_range(NULL::evaluation_status), enum_range(NULL::rubric_category);`

## Verificación post-migración (checklist)

- [ ] `drizzle/meta/_journal.json` orden cronológico (idx 4 último)
- [ ] 3 enums creados
- [ ] 6 tablas creadas con columnas correctas
- [ ] 9 FKs con cascade/no-action correctos
- [ ] 2 UNIQUE + 6 índices B-tree
- [ ] `npx tsc --noEmit` 0 errores
- [ ] `pnpm run test:unit` 285 tests pasan (23 suites)
- [ ] `pnpm run lint` 0 errores

## Notas

- No se requirió custom SQL (DO blocks / data migrations) — solo DDL generado por drizzle-kit.
- No se editó `_journal.json` manualmente.
- La migración es aditiva; no rompe endpoints existentes (retrocompatibilidad sección 10 del technical-design).