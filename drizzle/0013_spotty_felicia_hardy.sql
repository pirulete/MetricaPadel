CREATE TYPE "public"."block_enrollment_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."class_block_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "block_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "block_enrollment_status" DEFAULT 'scheduled' NOT NULL,
	"attended" boolean,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"weekly_slot_id" uuid,
	"block_date" date NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "class_block_status" DEFAULT 'scheduled' NOT NULL,
	"max_capacity" integer,
	"label" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"label" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_enrollments" ADD CONSTRAINT "block_enrollments_block_id_class_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."class_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_enrollments" ADD CONSTRAINT "block_enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_blocks" ADD CONSTRAINT "class_blocks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_blocks" ADD CONSTRAINT "class_blocks_weekly_slot_id_weekly_slots_id_fk" FOREIGN KEY ("weekly_slot_id") REFERENCES "public"."weekly_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_slots" ADD CONSTRAINT "weekly_slots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "block_enrollments_block_student_idx" ON "block_enrollments" USING btree ("block_id","student_id");--> statement-breakpoint
CREATE INDEX "block_enrollments_student_status_idx" ON "block_enrollments" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "block_enrollments_student_attended_idx" ON "block_enrollments" USING btree ("student_id","attended");--> statement-breakpoint
CREATE UNIQUE INDEX "class_blocks_slot_date_idx" ON "class_blocks" USING btree ("weekly_slot_id","block_date") WHERE "weekly_slot_id" is not null;--> statement-breakpoint
CREATE INDEX "class_blocks_course_date_idx" ON "class_blocks" USING btree ("course_id","block_date");--> statement-breakpoint
CREATE INDEX "class_blocks_date_status_idx" ON "class_blocks" USING btree ("block_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_slots_course_day_time_idx" ON "weekly_slots" USING btree ("course_id","day_of_week","start_time");--> statement-breakpoint
CREATE INDEX "weekly_slots_course_active_idx" ON "weekly_slots" USING btree ("course_id","is_active");