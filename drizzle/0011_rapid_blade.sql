CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text NOT NULL,
	"enabled_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "active_skill_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "active_skill_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "skill_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skills_user_idx" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skills_project_idx" ON "skills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "skills_user_project_idx" ON "skills" USING btree ("user_id","project_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_skill_id_skills_id_fk" FOREIGN KEY ("active_skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;