CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_bidx" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_email_bidx_uq" ON "platform_admins" USING btree ("email_bidx");