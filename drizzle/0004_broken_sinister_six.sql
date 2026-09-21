CREATE TYPE "public"."evaluation_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."rubric_category" AS ENUM('tecnica', 'tactica', 'fisica', 'actitud');--> statement-breakpoint
CREATE TYPE "public"."rubric_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "evaluation_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"criteria_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"rubric_id" uuid NOT NULL,
	"status" "evaluation_status" DEFAULT 'draft' NOT NULL,
	"total_score" integer,
	"max_score" integer,
	"global_comment" text,
	"published_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_descriptors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criteria_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"score" integer NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" "rubric_category" NOT NULL,
	"status" "rubric_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_criteria_id_rubric_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."rubric_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_level_id_rubric_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."rubric_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_descriptors" ADD CONSTRAINT "rubric_descriptors_criteria_id_rubric_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."rubric_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_descriptors" ADD CONSTRAINT "rubric_descriptors_level_id_rubric_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."rubric_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_levels" ADD CONSTRAINT "rubric_levels_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_scores_evaluation_criteria_idx" ON "evaluation_scores" USING btree ("evaluation_id","criteria_id");--> statement-breakpoint
CREATE INDEX "evaluations_student_idx" ON "evaluations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "evaluations_teacher_idx" ON "evaluations" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "evaluations_rubric_idx" ON "evaluations" USING btree ("rubric_id");--> statement-breakpoint
CREATE INDEX "rubric_criteria_rubric_idx" ON "rubric_criteria" USING btree ("rubric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rubric_descriptors_criteria_level_idx" ON "rubric_descriptors" USING btree ("criteria_id","level_id");--> statement-breakpoint
CREATE INDEX "rubric_levels_rubric_idx" ON "rubric_levels" USING btree ("rubric_id");--> statement-breakpoint
CREATE INDEX "rubrics_owner_idx" ON "rubrics" USING btree ("owner_id");