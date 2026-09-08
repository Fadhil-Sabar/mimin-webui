CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "project_file_chunks" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "project_file_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "project_file_chunks" USING hnsw ("embedding" vector_cosine_ops);
