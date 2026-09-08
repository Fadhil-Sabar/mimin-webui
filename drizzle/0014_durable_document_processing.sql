ALTER TABLE "project_files" ADD COLUMN "processing_status" text NOT NULL DEFAULT 'queued';--> statement-breakpoint
CREATE TABLE "document_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "file_id" uuid NOT NULL REFERENCES "project_files"("id") ON DELETE cascade,
  "status" text NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "available_at" timestamp with time zone NOT NULL DEFAULT now(),
  "lease_until" timestamp with time zone,
  "worker_id" text,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "document_processing_jobs_claim_idx" ON "document_processing_jobs" ("status", "available_at");--> statement-breakpoint
CREATE INDEX "document_processing_jobs_file_idx" ON "document_processing_jobs" ("file_id");
