CREATE TABLE "guest_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Every existing restaurant gets its own private guest book (same id as the restaurant).
INSERT INTO "guest_books" ("id", "name") SELECT "id", "name" FROM "restaurants";--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "guest_book_id" uuid;--> statement-breakpoint
UPDATE "restaurants" SET "guest_book_id" = "id";--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "guest_book_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "guest_book_id" uuid;--> statement-breakpoint
UPDATE "customers" SET "guest_book_id" = "restaurant_id";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "guest_book_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "customers_phone_uq";--> statement-breakpoint
DROP INDEX "customers_name_idx";--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_guest_book_id_guest_books_id_fk" FOREIGN KEY ("guest_book_id") REFERENCES "public"."guest_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_guest_book_id_guest_books_id_fk" FOREIGN KEY ("guest_book_id") REFERENCES "public"."guest_books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_uq" ON "customers" USING btree ("guest_book_id","phone");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("guest_book_id","last_name");
