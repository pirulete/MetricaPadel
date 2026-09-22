# DB Plan — Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso (G6 + G7 + G12)

> status: in-progress
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: db
> tags: [padel, evaluations, versions, evolution, courses, enrollment, migration]

---

## 1. Cambios de Esquema (`lib/db/schema.ts`)

### 1.1 `evaluations` — columna `version`

| Campo | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `version` | `integer` | **SÍ** (a propósito) | — | Solo publicadas tienen 1..N por (studentId, rubricId); drafts quedan `null`. NOT NULL rompería la creación de borradores (la versión se asigna en publish). |

- Índice nuevo: `evaluations_student_rubric_status_idx` sobre `(studentId, rubricId, status)` — acota el cómputo `MAX(version)` en publish y las series de evolución (G6/G7).

### 1.2 Sin cambios en otras tablas

- `course_enrollments` ya tiene UNIQUE(courseId, studentId) → respalda `addStudentToCourse` (409).
- `evaluations.courseId` FK set null ya existe → remover alumno de curso conserva historial (G12).

## 2. Migración `0007_nostalgic_dagger.sql`

Generada con `pnpm run db:generate` (regla AGENTS.md: nunca SQL a mano). Contenido:

1. `ALTER TABLE evaluations ADD COLUMN version integer` (nullable).
2. `CREATE INDEX evaluations_student_rubric_status_idx ON evaluations (student_id, rubric_id, status)`.
3. **Custom SQL backfill** (agregado post-generación, snapshot re-generado):
   ```sql
   UPDATE "evaluations" SET "version" = sub.rn FROM (
     SELECT id, row_number() OVER (PARTITION BY student_id, rubric_id ORDER BY published_at ASC) AS rn
     FROM "evaluations"
     WHERE status = 'published' AND published_at IS NOT NULL
   ) sub WHERE "evaluations".id = sub.id;
   ```
   - Asigna 1..N por (studentId, rubricId) ordenado por `published_at ASC` (más estable que `created_at` para versiones legacy).
   - Drafts quedan `null` (G6: solo publicadas tienen versión).

## 3. Queries Nuevas/Modificadas

### `lib/db/queries/padel/evaluations.ts`

| Función | Tipo | Descripción |
|---|---|---|
| `publishEvaluation` | MOD | Dentro de la transacción, antes del UPDATE: `SELECT COALESCE(MAX(version),0)+1 WHERE studentId=? AND rubricId=? AND status='published'` → setea `version` en el UPDATE. Cómputo transaccional evita carreras (publish single-user por coach, riesgo aceptado sin UNIQUE parcial). |
| `listEvaluationSeries(teacherId, studentId, rubricId)` | NEW | Serie coach (draft + published) con scores enriquecidos (criterionName/levelName), ordenada por `version ASC NULLS LAST` luego `publishedAt`. Scoped teacherId (anti-IDOR → [] si ajeno). |
| `listStudentEvaluationSeries(studentId, rubricId)` | NEW | Serie publicada del alumno, ordenada por `version ASC`. Scoped studentId + status published (anti-IDOR). |
| `listStudentEvolution(studentId)` | NEW | Publicadas con rubricTitle, category, version, totalScore, maxScore, publishedAt, readAt + scores enriquecidos, ordenadas por `publishedAt ASC` (alimenta G7). |

### `lib/db/queries/padel/enrollments.ts`

| Función | Tipo | Descripción |
|---|---|---|
| `addStudentToCourse(courseId, studentId, addedById)` | NEW | Transaccional: curso existe + activo + ownerId=addedById (404), alumno existe + role USER + status ACTIVE (400), no es el coach (400), no ya inscrito (409). UNIQUE respalda. |
| `searchCourseCandidates(courseId, q)` | NEW | Usuarios role USER + status ACTIVE no inscritos al curso, ILIKE por email/firstName/lastName, `limit 20`, excluye coach (ADMIN ya filtrado por role USER). Usa `notExists` de drizzle-orm. |

### `lib/db/queries/padel/courses.ts`

| Función | Tipo | Descripción |
|---|---|---|
| `removeStudentFromCourse(courseId, studentId)` | NEW | Delete scoped (404 si no inscrito). Guard de ownership del curso en el handler. Evaluaciones conservan courseId (historial intacto). |

## 4. Verificación Post-Migración (ejecutada)

```sql
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='evaluations' AND column_name='version';
-- → version, YES ✓

SELECT indexname FROM pg_indexes WHERE tablename='evaluations' AND indexname='evaluations_student_rubric_status_idx';
-- → evaluations_student_rubric_status_idx ✓

SELECT count(*) FILTER (WHERE status='published' AND version IS NULL) AS published_no_version,
       count(*) FILTER (WHERE status='draft' AND version IS NOT NULL) AS draft_with_version
FROM evaluations;
-- → 0 / 0 (consistencia backfill) ✓
```

- `drizzle/meta/_journal.json`: `0007_nostalgic_dagger` después de `0006_handy_proemial_gods` (orden cronológico ✓).

## 5. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Backfill incorrecto en legacy | `row_number() OVER (PARTITION BY student_id, rubric_id ORDER BY published_at)` + verificación SQL post-migración (0 publicadas sin version). |
| Carrera en publish (2 publishes simultáneos) | Cómputo dentro de la transacción; índice (studentId, rubricId, status) acota el MAX. Sin UNIQUE parcial (aceptado: publish single-user). |
| NOT NULL rompería drafts | Columna nullable a propósito; versión se asigna solo en publish. |