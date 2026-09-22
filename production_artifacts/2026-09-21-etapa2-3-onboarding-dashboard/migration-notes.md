# Migration Notes — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: etapa2-3-onboarding-dashboard
> release: v0.2
> date: 2026-09-21
> module: db
> tags: [db, migration]
> status: in-progress

## Migración generada

- **Archivo**: `drizzle/0005_goofy_charles_xavier.sql`
- **Comando**: `pnpm run db:generate` (drizzle-kit generate) — nunca SQL a mano.
- **Snapshot**: `drizzle/meta/0005_snapshot.json` actualizado automáticamente.
- **Journal**: `drizzle/meta/_journal.json` — entrada `idx: 5`, `tag: "0005_goofy_charles_xavier"`. Orden cronológico verificado: `0000 → 0001 → 0002 → 0003 → 0004 → 0005`.

## Contenido del SQL (verificado)

1. `CREATE TYPE` × 2: `course_level` (`iniciacion|intermedio|avanzado`), `course_status` (`active|archived`).
2. `CREATE TABLE` × 3: `course_enrollments`, `course_rubrics`, `courses`.
3. `ALTER TABLE evaluations ADD COLUMN course_id uuid` (nullable, aditivo — D1).
4. `ALTER TABLE ADD CONSTRAINT` × 7 FKs:
   - Cascade: `course_enrollments.course_id → courses`, `course_rubrics.course_id → courses`.
   - No action: `course_enrollments.student_id → users`, `course_rubrics.rubric_id → rubrics`, `course_rubrics.assigned_by_id → users`, `courses.owner_id → users`.
   - Set null: `evaluations.course_id → courses`.
5. Índices: 3 UNIQUE (`course_enrollments_course_student_idx`, `course_rubrics_course_rubric_idx`, `courses_invite_code_idx`) + 3 B-tree (`course_enrollments_course_idx`, `course_enrollments_student_idx`, `course_rubrics_course_idx`, `courses_owner_idx`).

## Estado de ejecución

### ✅ Migración ejecutada contra DB local

```
DATABASE_URL="postgresql://padel:padel_dev_2026@localhost:5432/padel_evaluation?sslmode=disable" pnpm run db:migrate
[v0] ✓ Migration completed successfully
```

### ✅ Verificación post-migración (checklist)

- [x] `drizzle/meta/_journal.json` orden cronológico (idx 5 último)
- [x] 2 enums creados — `SELECT enum_range(NULL::course_level)` → `{iniciacion,intermedio,avanzado}`; `course_status` → `{active,archived}`
- [x] 3 tablas creadas con columnas correctas:
  - `courses.invite_code` → OK
  - `courses.days` → OK
  - `course_enrollments.course_id` → OK
  - `course_rubrics.rubric_id` → OK
- [x] `evaluations.course_id` → OK (columna aditiva)
- [x] 7 FKs con cascade/no-action/set-null correctos
- [x] 3 UNIQUE + 4 índices B-tree
- [x] `npx tsc --noEmit` 0 errores

## Notas

- No se requirió custom SQL (DO blocks / data migrations) — solo DDL generado por drizzle-kit.
- No se editó `_journal.json` manualmente.
- La migración es aditiva; no rompe endpoints existentes (retrocompatibilidad sección 4.6 del technical-design).
- `days` jsonb default `'[]'::jsonb` verificado en el SQL generado (D3).
- Pendiente: unit tests `tests/unit/db/courses.test.ts` (mapeado en technical-design §9, se implementa junto con API en @app-engineer).