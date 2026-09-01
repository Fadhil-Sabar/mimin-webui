CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"model" text DEFAULT 'openai/gpt-4o-mini' NOT NULL,
	"enabled_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_citations" (
	"message_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "message_citations_message_id_source_id_pk" PRIMARY KEY("message_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_file_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"content" text NOT NULL,
	"page" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"file_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_chunks" ADD CONSTRAINT "project_file_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_chunks" ADD CONSTRAINT "project_file_chunks_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "conversations_updated_idx" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chunks_project_idx" ON "project_file_chunks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id");