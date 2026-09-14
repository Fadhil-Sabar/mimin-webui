CREATE TABLE IF NOT EXISTS "canvas_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"source_scene_id" uuid NOT NULL,
	"target_scene_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_connections_no_self_reference" CHECK ("source_scene_id" <> "target_scene_id")
);
--> statement-breakpoint
ALTER TABLE "canvas_scenes" ADD COLUMN IF NOT EXISTS "position_x" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_scenes" ADD COLUMN IF NOT EXISTS "position_y" real DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH ranked AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "canvas_id"
			ORDER BY "order", "created_at", "id"
		) - 1 AS "grid_index"
	FROM "canvas_scenes"
)
UPDATE "canvas_scenes" AS scenes
SET
	"position_x" = (ranked."grid_index" % 4) * 460,
	"position_y" = floor(ranked."grid_index" / 4.0) * 360
FROM ranked
WHERE scenes."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "canvas_connections" ADD CONSTRAINT "canvas_connections_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_connections" ADD CONSTRAINT "canvas_connections_source_scene_id_canvas_scenes_id_fk" FOREIGN KEY ("source_scene_id") REFERENCES "public"."canvas_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_connections" ADD CONSTRAINT "canvas_connections_target_scene_id_canvas_scenes_id_fk" FOREIGN KEY ("target_scene_id") REFERENCES "public"."canvas_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_connections_canvas_idx" ON "canvas_connections" USING btree ("canvas_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_connections_source_idx" ON "canvas_connections" USING btree ("source_scene_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_connections_target_idx" ON "canvas_connections" USING btree ("target_scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canvas_connections_direction_idx" ON "canvas_connections" USING btree ("canvas_id","source_scene_id","target_scene_id");
