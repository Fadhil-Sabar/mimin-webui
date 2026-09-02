ALTER TABLE "project_files" ADD COLUMN "extraction_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "extraction_error" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "chunk_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "project_files" AS "file"
SET
	"chunk_count" = (
		SELECT count(*)::integer
		FROM "project_file_chunks" AS "chunk"
		WHERE "chunk"."file_id" = "file"."id"
	),
	"extraction_status" = CASE
		WHEN EXISTS (
			SELECT 1
			FROM "project_file_chunks" AS "chunk"
			WHERE "chunk"."file_id" = "file"."id"
		) THEN 'extracted'
		ELSE 'not_started'
	END;--> statement-breakpoint
UPDATE "conversations"
SET "enabled_tools" = "enabled_tools" - 'project_knowledge_search'
WHERE "project_id" IS NULL
	AND "enabled_tools" ? 'project_knowledge_search';
