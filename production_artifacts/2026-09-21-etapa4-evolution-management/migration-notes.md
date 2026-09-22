# Migration Notes — Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso (G6 + G7 + G12)

> status: in-progress
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: db
> tags: [padel, migration, evaluations, versions]

---

## Migración: `0007_nostalgic_dagger.sql`

**Fecha ejecución:** 2026-09-21
**Comando:** `DATABASE_URL="postgresql://padel:padel_dev_2026@localhost:5432/padel_evaluation?sslmode=disable" pnpm run db:migrate`
**Resultado:** ✓ Migration completed successfully

### Qué hace

1. `ALTER TABLE "evaluations" ADD COLUMN "version" integer;` — nullable (drafts null, G6).
2. `CREATE INDEX "evaluations_student_rubric_status_idx" ON "evaluations" ("student_id","rubric_id","status");` — series + cómputo MAX(version).
3. Backfill custom (agregado post-`db:generate`, snapshot re-generado):
   ```sql
   UPDATE "evaluations" SET "version" = sub.rn FROM (
     SELECT id, row_number() OVER (PARTITION BY student_id, rubric_id ORDER BY published_at ASC) AS rn
     FROM "evaluations"
     WHERE status = 'published' AND published_at IS NOT NULL
   ) sub WHERE "evaluations".id = sub.id;
   ```

### Decisiones

| Decisión | Detalle |
|---|---|
| `ORDER BY published_at` en backfill | Más estable que `created_at` para versiones legacy (publishedAt es el timestamp semántico de la versión). |
| Columna **nullable** (no NOT NULL) | El technical design §2.1 lo exige: drafts no tienen versión; NOT NULL rompería la creación de borradores. La versión se asigna en `publishEvaluation` (`COALESCE(MAX,0)+1`). |
| Cómputo de versión transaccional | Dentro de la transacción de publish; sin UNIQUE parcial (riesgo de carrera aceptado: publish single-user por coach). |

### Verificación post-migración (regla AGENTS.md)

```sql
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='evaluations' AND column_name='version';
-- → version / YES ✓ (columna existe)

SELECT indexname FROM pg_indexes WHERE tablename='evaluations' AND indexname='evaluations_student_rubric_status_idx';
-- → evaluations_student_rubric_status_idx ✓ (índice creado)

SELECT count(*) FILTER (WHERE status='published' AND version IS NULL) AS published_no_version,
       count(*) FILTER (WHERE status='draft' AND version IS NOT NULL) AS draft_with_version
FROM evaluations;
-- → 0 / 0 ✓ (backfill consistente: toda publicada tiene version, ningún draft tiene version)
```

### Journal

- `drizzle/meta/_journal.json`: entrada `idx: 7` → `0007_nostalgic_dagger` después de `0006_handy_proemial_gods` (orden cronológico ✓).
- Snapshot: `drizzle/meta/0007_snapshot.json` generado por `db:generate`.

### Rollback

```sql
DROP INDEX IF EXISTS "evaluations_student_rubric_status_idx";
ALTER TABLE "evaluations" DROP COLUMN IF EXISTS "version";
```

> Nota: el rollback pierde las versiones asignadas; si se re-aplica, re-ejecutar el backfill.

### Estado de la DB local

- DB: `padel_evaluation` (localhost:5432, user `padel`).
- Migraciones aplicadas: 0000 → 0007 (8 total).
- Sin datos de evaluación en dev (backfill verificado con 0 filas afectadas — consistente).