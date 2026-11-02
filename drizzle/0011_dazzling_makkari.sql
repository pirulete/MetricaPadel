CREATE TYPE "public"."academy_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."academy_request_type" AS ENUM('join_academy', 'create_academy');--> statement-breakpoint
CREATE TABLE "academy_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "academy_request_type" NOT NULL,
	"academy_id" uuid,
	"requested_role" "academy_membership_role" DEFAULT 'COACH' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "academy_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_access_requests" ADD CONSTRAINT "academy_access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_access_requests" ADD CONSTRAINT "academy_access_requests_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_access_requests" ADD CONSTRAINT "academy_access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_requests_user_idx" ON "academy_access_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "academy_requests_status_idx" ON "academy_access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "academy_requests_academy_idx" ON "academy_access_requests" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_requests_pending_join_idx" ON "academy_access_requests" USING btree ("user_id","type","academy_id") WHERE "academy_access_requests"."status" = 'pending' AND "academy_access_requests"."type" = 'join_academy';--> statement-breakpoint
CREATE UNIQUE INDEX "academy_requests_pending_create_idx" ON "academy_access_requests" USING btree ("user_id","type") WHERE "academy_access_requests"."status" = 'pending' AND "academy_access_requests"."type" = 'create_academy';--> statement-breakpoint
-- Data migration: ownership de academias → único SUPER_ADMIN activo (idempotente).
-- Fail-closed: si no hay SUPER_ADMIN activo, la migración completa falla (spec v0.9).
DO $$
DECLARE
  sa_id uuid;
BEGIN
  SELECT id INTO sa_id FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;
  IF sa_id IS NULL THEN
    RAISE EXCEPTION 'No existe SUPER_ADMIN activo; migración de ownership abortada';
  END IF;

  -- 1. ownerId de academias → SUPER_ADMIN
  UPDATE academies SET owner_id = sa_id, updated_at = now() WHERE owner_id IS DISTINCT FROM sa_id;

  -- 2. Membresías OWNER previas (no SUPER_ADMIN) → ADMIN (se conservan activas)
  UPDATE academy_memberships SET role = 'ADMIN', updated_at = now()
  WHERE role = 'OWNER' AND status = 'active' AND user_id <> sa_id;

  -- 3. Upsert membresía OWNER activa del SUPER_ADMIN en cada academia
  UPDATE academy_memberships SET role = 'OWNER', status = 'active', updated_at = now()
  WHERE user_id = sa_id AND academy_id IN (SELECT id FROM academies);

  INSERT INTO academy_memberships (academy_id, user_id, role, status, created_at, updated_at)
  SELECT a.id, sa_id, 'OWNER', 'active', now(), now()
  FROM academies a
  WHERE NOT EXISTS (
    SELECT 1 FROM academy_memberships m WHERE m.academy_id = a.id AND m.user_id = sa_id
  );
END $$;