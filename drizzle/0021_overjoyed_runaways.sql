ALTER TABLE "messages" ADD COLUMN "turn_state" text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "completed_at" timestamp with time zone;