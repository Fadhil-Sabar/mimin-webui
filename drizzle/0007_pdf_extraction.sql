ALTER TABLE "message_attachments" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "extraction_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "extraction_error" text;