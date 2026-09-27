CREATE TYPE "public"."academy_membership_role" AS ENUM('OWNER', 'ADMIN', 'COACH');--> statement-breakpoint
CREATE TYPE "public"."academy_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."rubric_scope" AS ENUM('personal', 'institutional');--> statement-breakpoint
CREATE TABLE "academies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"logo_url" varchar(5000),
	"primary_color" varchar(7) DEFAULT '#3b82f6' NOT NULL,
	"status" "academy_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "academies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "academy_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "academy_membership_role" DEFAULT 'COACH' NOT NULL,
	"invited_by" uuid,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rubrics" ADD COLUMN "academy_id" uuid;--> statement-breakpoint
ALTER TABLE "rubrics" ADD COLUMN "scope" "rubric_scope" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academies_owner_idx" ON "academies" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_memberships_academy_user_idx" ON "academy_memberships" USING btree ("academy_id","user_id");--> statement-breakpoint
CREATE INDEX "academy_memberships_academy_idx" ON "academy_memberships" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "academy_memberships_user_idx" ON "academy_memberships" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rubrics_academy_idx" ON "rubrics" USING btree ("academy_id");