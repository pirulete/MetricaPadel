CREATE TYPE "public"."tournament_match_round" AS ENUM('grupo', '16vos', '8vos', '4tos', 'semi', 'final');--> statement-breakpoint
CREATE TYPE "public"."tournament_phase" AS ENUM('previa', 'final');--> statement-breakpoint
CREATE TYPE "public"."tournament_run_status" AS ENUM('queued', 'running', 'succeeded', 'infeasible', 'failed', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('draft', 'agenda_draft', 'archived');--> statement-breakpoint
CREATE TABLE "tournament_agenda_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"block_idx" integer NOT NULL,
	"court" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"day_label" varchar(3) NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"phase" "tournament_phase" NOT NULL,
	"is_extension" boolean DEFAULT false NOT NULL,
	"capacity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"sex" varchar(1) NOT NULL,
	"level" integer,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"size" integer NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"phase" "tournament_phase" NOT NULL,
	"round" "tournament_match_round" NOT NULL,
	"group_id" uuid,
	"team_a_id" uuid,
	"team_b_id" uuid,
	"source_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feeders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code" varchar(60) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"document_id" varchar(50) NOT NULL,
	"sex" varchar(1),
	"display_name" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "tournament_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "tournament_run_status" DEFAULT 'queued' NOT NULL,
	"params" jsonb NOT NULL,
	"engine_status" varchar(32),
	"objective" numeric,
	"mip_gap" numeric,
	"time_ms" integer,
	"diagnostics" jsonb,
	"error" jsonb,
	"slots_count" integer DEFAULT 0 NOT NULL,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"last_dispatch_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tournament_team_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"block_idx" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "tournament_status" DEFAULT 'draft' NOT NULL,
	"block_minutes" integer DEFAULT 75 NOT NULL,
	"courts" integer DEFAULT 8 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_agenda_slots" ADD CONSTRAINT "tournament_agenda_slots_run_id_tournament_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tournament_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_agenda_slots" ADD CONSTRAINT "tournament_agenda_slots_match_id_tournament_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."tournament_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_blocks" ADD CONSTRAINT "tournament_blocks_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_categories" ADD CONSTRAINT "tournament_categories_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_category_id_tournament_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tournament_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_category_id_tournament_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tournament_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_group_id_tournament_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tournament_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_team_a_id_tournament_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_team_b_id_tournament_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_persons" ADD CONSTRAINT "tournament_persons_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_runs" ADD CONSTRAINT "tournament_runs_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_runs" ADD CONSTRAINT "tournament_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_availability" ADD CONSTRAINT "tournament_team_availability_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_members" ADD CONSTRAINT "tournament_team_members_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_members" ADD CONSTRAINT "tournament_team_members_person_id_tournament_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."tournament_persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_category_id_tournament_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tournament_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_group_id_tournament_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tournament_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_agenda_slots_run_match_uq" ON "tournament_agenda_slots" USING btree ("run_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_agenda_slots_run_block_court_uq" ON "tournament_agenda_slots" USING btree ("run_id","block_idx","court");--> statement-breakpoint
CREATE INDEX "tournament_agenda_slots_run_block_idx" ON "tournament_agenda_slots" USING btree ("run_id","block_idx");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_blocks_tournament_idx_uq" ON "tournament_blocks" USING btree ("tournament_id","idx");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_categories_tournament_code_uq" ON "tournament_categories" USING btree ("tournament_id","code");--> statement-breakpoint
CREATE INDEX "tournament_categories_tournament_sort_idx" ON "tournament_categories" USING btree ("tournament_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_groups_category_code_uq" ON "tournament_groups" USING btree ("category_id","code");--> statement-breakpoint
CREATE INDEX "tournament_groups_tournament_idx" ON "tournament_groups" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_matches_tournament_code_uq" ON "tournament_matches" USING btree ("tournament_id","code");--> statement-breakpoint
CREATE INDEX "tournament_matches_tournament_phase_idx" ON "tournament_matches" USING btree ("tournament_id","phase");--> statement-breakpoint
CREATE INDEX "tournament_matches_category_idx" ON "tournament_matches" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_persons_tournament_document_uq" ON "tournament_persons" USING btree ("tournament_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_runs_active_uq" ON "tournament_runs" USING btree ("tournament_id") WHERE status in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "tournament_runs_tournament_created_idx" ON "tournament_runs" USING btree ("tournament_id","created_at");--> statement-breakpoint
CREATE INDEX "tournament_runs_tournament_status_idx" ON "tournament_runs" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_team_availability_team_block_uq" ON "tournament_team_availability" USING btree ("team_id","block_idx");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_team_members_team_person_uq" ON "tournament_team_members" USING btree ("team_id","person_id");--> statement-breakpoint
CREATE INDEX "tournament_team_members_person_idx" ON "tournament_team_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_teams_tournament_code_uq" ON "tournament_teams" USING btree ("tournament_id","code");--> statement-breakpoint
CREATE INDEX "tournament_teams_group_idx" ON "tournament_teams" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tournament_teams_tournament_idx" ON "tournament_teams" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournaments_owner_updated_idx" ON "tournaments" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "tournaments_owner_status_idx" ON "tournaments" USING btree ("owner_id","status");