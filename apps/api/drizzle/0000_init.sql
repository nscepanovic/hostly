CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"email" text,
	"language" text,
	"birthday" date,
	"company" text,
	"type" text DEFAULT 'regular' NOT NULL,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"average_spend" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"template_key" text NOT NULL,
	"language" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_tables" (
	"reservation_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"during" "tstzrange" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reservation_tables_reservation_id_table_id_pk" PRIMARY KEY("reservation_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"customer_id" uuid,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"email" text,
	"covers" integer NOT NULL,
	"arrival_at" timestamp with time zone NOT NULL,
	"departure_at" timestamp with time zone NOT NULL,
	"purpose" text DEFAULT 'food' NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"dietary" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"fix_menu" boolean DEFAULT false NOT NULL,
	"language" text NOT NULL,
	"area_id" uuid,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spend" numeric,
	"decline_reason" text,
	"guest_token" text NOT NULL,
	"seated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_guest_token_unique" UNIQUE("guest_token")
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Belgrade' NOT NULL,
	"default_language" text DEFAULT 'sr' NOT NULL,
	"opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"day_start" text DEFAULT '06:00' NOT NULL,
	"default_duration_min" integer DEFAULT 120 NOT NULL,
	"slot_minutes" integer DEFAULT 15 NOT NULL,
	"max_party_size" integer DEFAULT 20 NOT NULL,
	"pacing_max_reservations_per_slot" integer,
	"pacing_max_covers_per_slot" integer,
	"online_settings" jsonb NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "table_join_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"table_ids" uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"label" text NOT NULL,
	"shape" text DEFAULT 'rect' NOT NULL,
	"x" real DEFAULT 0 NOT NULL,
	"y" real DEFAULT 0 NOT NULL,
	"w" real DEFAULT 80 NOT NULL,
	"h" real DEFAULT 80 NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL,
	"min_seats" integer DEFAULT 1 NOT NULL,
	"max_seats" integer DEFAULT 2 NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiting_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"guest_name" text NOT NULL,
	"phone" text,
	"covers" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_join_groups" ADD CONSTRAINT "table_join_groups_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_entries" ADD CONSTRAINT "waiting_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "areas_restaurant_idx" ON "areas" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_uq" ON "customers" USING btree ("restaurant_id","phone");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("restaurant_id","last_name");--> statement-breakpoint
CREATE INDEX "messages_reservation_idx" ON "messages" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_tables_table_idx" ON "reservation_tables" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "reservations_day_idx" ON "reservations" USING btree ("restaurant_id","arrival_at");--> statement-breakpoint
CREATE INDEX "reservations_customer_idx" ON "reservations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "tables_restaurant_idx" ON "tables" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "tables_area_idx" ON "tables" USING btree ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_uq" ON "tags" USING btree ("restaurant_id","kind","label");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "waiting_restaurant_idx" ON "waiting_entries" USING btree ("restaurant_id","status");