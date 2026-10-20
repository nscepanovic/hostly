-- Prevents two active reservations from holding the same table for overlapping windows.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservation_tables"
  ADD CONSTRAINT "reservation_tables_no_overlap"
  EXCLUDE USING gist ("table_id" WITH =, "during" WITH &&) WHERE ("active");
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_window_chk" CHECK ("departure_at" > "arrival_at");
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_covers_chk" CHECK ("covers" > 0);
