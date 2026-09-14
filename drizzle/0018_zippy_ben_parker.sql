CREATE TABLE IF NOT EXISTS "canvas_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'css' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canvas_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"viewport" text DEFAULT 'desktop' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"js" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canvases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"conversation_id" uuid,
	"title" text DEFAULT 'New Canvas' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"style_guideline" jsonb NOT NULL,
	"active_scene_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "style_guideline" jsonb DEFAULT '{"tokens":{},"rules":[],"avoidances":[],"direction":""}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "active_scene_id" uuid;
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "canvases" ALTER COLUMN "title" SET DEFAULT 'New Canvas';
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_name = 'canvases' AND column_name = 'scene' AND is_nullable = 'NO'
	) THEN
		ALTER TABLE "canvases" ALTER COLUMN "scene" DROP NOT NULL;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'canvas_assets_canvas_id_canvases_id_fk'
	) THEN
		ALTER TABLE "canvas_assets" ADD CONSTRAINT "canvas_assets_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'canvas_scenes_canvas_id_canvases_id_fk'
	) THEN
		ALTER TABLE "canvas_scenes" ADD CONSTRAINT "canvas_scenes_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'canvases_user_id_users_id_fk'
	) THEN
		ALTER TABLE "canvases" ADD CONSTRAINT "canvases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'canvases_project_id_projects_id_fk'
	) THEN
		ALTER TABLE "canvases" ADD CONSTRAINT "canvases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'canvases_conversation_id_conversations_id_fk'
	) THEN
		ALTER TABLE "canvases" ADD CONSTRAINT "canvases_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_assets_canvas_idx" ON "canvas_assets" USING btree ("canvas_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_scenes_canvas_idx" ON "canvas_scenes" USING btree ("canvas_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_scenes_canvas_order_idx" ON "canvas_scenes" USING btree ("canvas_id","order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvases_user_idx" ON "canvases" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvases_project_idx" ON "canvases" USING btree ("project_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "canvases_conversation_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canvases_conversation_idx" ON "canvases" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvases_user_updated_idx" ON "canvases" USING btree ("user_id","updated_at","id");