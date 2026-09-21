ALTER TABLE "rubrics" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
UPDATE "rubrics" SET "category" = 'tecnica_basica' WHERE "category" = 'tecnica';--> statement-breakpoint
UPDATE "rubrics" SET "category" = 'actitud_equipo' WHERE "category" = 'actitud';--> statement-breakpoint
DROP TYPE "public"."rubric_category";--> statement-breakpoint
CREATE TYPE "public"."rubric_category" AS ENUM('reglas', 'tecnica_basica', 'tecnica_especifica', 'tactica', 'fisica', 'actitud_equipo');--> statement-breakpoint
ALTER TABLE "rubrics" ALTER COLUMN "category" SET DATA TYPE "public"."rubric_category" USING "category"::"public"."rubric_category";