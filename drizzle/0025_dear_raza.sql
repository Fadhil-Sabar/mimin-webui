CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"user_message_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pending_browser_actions" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"turn_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"turn_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "history_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_browser_actions" ADD CONSTRAINT "pending_browser_actions_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_browser_actions" ADD CONSTRAINT "pending_browser_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_turns_request_idx" ON "conversation_turns" USING btree ("conversation_id","request_id");--> statement-breakpoint
CREATE INDEX "conversation_turns_conversation_idx" ON "conversation_turns" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "turn_events_turn_idx" ON "turn_events" USING btree ("turn_id","id");