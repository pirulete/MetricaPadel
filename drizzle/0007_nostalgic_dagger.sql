ALTER TABLE "evaluations" ADD COLUMN "version" integer;--> statement-breakpoint
CREATE INDEX "evaluations_student_rubric_status_idx" ON "evaluations" USING btree ("student_id","rubric_id","status");--> statement-breakpoint
-- Backfill G6: asigna version 1..N por (student_id, rubric_id) a evaluaciones
-- publicadas, ordenado por published_at ASC. Drafts quedan NULL (G6: solo
-- publicadas tienen versión). La columna se mantiene nullable a propósito:
-- NOT NULL rompería la creación de borradores (version se asigna en publish).
UPDATE "evaluations" SET "version" = sub.rn FROM (
  SELECT id, row_number() OVER (PARTITION BY student_id, rubric_id ORDER BY published_at ASC) AS rn
  FROM "evaluations"
  WHERE status = 'published' AND published_at IS NOT NULL
) sub WHERE "evaluations".id = sub.id;