CREATE TYPE "public"."notification_category_enum" AS ENUM('system', 'account', 'billing', 'marketing', 'social', 'custom');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('inbox', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_priority_enum" AS ENUM('P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."notification_type_enum" AS ENUM('info', 'success', 'warning', 'error', 'action');--> statement-breakpoint
CREATE TYPE "public"."push_subscription_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"category" "notification_category_enum" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type_enum" NOT NULL,
	"priority" "notification_priority_enum" DEFAULT 'P2' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"cta_url" varchar(500),
	"cta_label" varchar(50),
	"read" integer DEFAULT 0 NOT NULL,
	"group_id" uuid,
	"category" "notification_category_enum" DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" text NOT NULL,
	"url" varchar(500),
	"event_type" varchar(50),
	"clicked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device_type" varchar(20) DEFAULT 'desktop' NOT NULL,
	"browser" varchar(50),
	"os" varchar(50),
	"status" "push_subscription_status" DEFAULT 'active' NOT NULL,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_click_events" ADD CONSTRAINT "push_click_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_channel_category_idx" ON "notification_preferences" USING btree ("user_id","channel","category");--> statement-breakpoint
CREATE INDEX "notifications_user_deleted_idx" ON "notifications" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "notifications_category_idx" ON "notifications" USING btree ("category");--> statement-breakpoint
CREATE INDEX "push_click_events_user_clicked_idx" ON "push_click_events" USING btree ("user_id","clicked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_idx" ON "push_subscriptions" USING btree ("user_id","endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_status_idx" ON "push_subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "push_subscriptions_status_idx" ON "push_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");