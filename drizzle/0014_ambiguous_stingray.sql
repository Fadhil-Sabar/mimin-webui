CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "conversations_project_updated_idx" ON "conversations" USING btree ("project_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "conversations_title_trgm_idx" ON "conversations" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "messages_content_trgm_idx" ON "messages" USING gin (("content"::text) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "chunks_file_idx" ON "project_file_chunks" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "chunks_content_trgm_idx" ON "project_file_chunks" USING gin ("content" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "tool_calls_message_started_idx" ON "tool_calls" USING btree ("message_id","started_at");
--> statement-breakpoint
CREATE INDEX "tool_calls_call_id_idx" ON "tool_calls" USING btree ("tool_call_id");
--> statement-breakpoint
CREATE INDEX "projects_user_updated_idx" ON "projects" USING btree ("user_id","updated_at","id");
