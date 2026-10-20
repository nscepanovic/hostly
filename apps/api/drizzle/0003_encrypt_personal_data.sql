CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
DROP INDEX "customers_phone_uq";--> statement-breakpoint
DROP INDEX "customers_name_idx";--> statement-breakpoint
DROP INDEX "users_email_uq";--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "before" SET DATA TYPE text USING "before"::text;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "after" SET DATA TYPE text USING "after"::text;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "birthday" SET DATA TYPE text USING "birthday"::text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "phone_bidx" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email_bidx" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "search_tokens" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Filled (and set NOT NULL) by the encryption backfill that runs right after the SQL migrations.
ALTER TABLE "users" ADD COLUMN "email_bidx" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_bidx_uq" ON "customers" USING btree ("guest_book_id","phone_bidx");--> statement-breakpoint
CREATE INDEX "customers_email_bidx_idx" ON "customers" USING btree ("guest_book_id","email_bidx");--> statement-breakpoint
CREATE INDEX "customers_search_idx" ON "customers" USING gin ("search_tokens");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_bidx_uq" ON "users" USING btree ("email_bidx");