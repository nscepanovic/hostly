CREATE TABLE "restaurant_images" (
	"restaurant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"data" bytea NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_images_restaurant_id_kind_pk" PRIMARY KEY("restaurant_id","kind")
);
--> statement-breakpoint
ALTER TABLE "restaurant_images" ADD CONSTRAINT "restaurant_images_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Booking page look: Hostly defaults until the owner changes them.
UPDATE "restaurants"
SET "online_settings" = "online_settings" || '{"theme": {"backgroundColor": null, "accentColor": null, "font": "modern"}}'::jsonb
WHERE NOT ("online_settings" ? 'theme');
