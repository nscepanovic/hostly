CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"vat_label" text,
	"vat_rate" numeric(5, 2),
	"gtin" text
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"reservation_id" uuid,
	"scheme" text DEFAULT 'rs-suf' NOT NULL,
	"invoice_number" text NOT NULL,
	"verification_url" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"transaction_type" text NOT NULL,
	"seller_tin" text,
	"seller_name" text,
	"payments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"journal" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_items_receipt_idx" ON "receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_items_restaurant_idx" ON "receipt_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_invoice_uq" ON "receipts" USING btree ("restaurant_id","invoice_number");--> statement-breakpoint
CREATE INDEX "receipts_restaurant_issued_idx" ON "receipts" USING btree ("restaurant_id","issued_at");--> statement-breakpoint
CREATE INDEX "receipts_reservation_idx" ON "receipts" USING btree ("reservation_id");