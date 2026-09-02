CREATE TABLE "model_preferences" (
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"thinking_level" text DEFAULT 'off' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_preferences_user_id_model_pk" PRIMARY KEY("user_id","model")
);
--> statement-breakpoint
ALTER TABLE "model_preferences" ADD CONSTRAINT "model_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "model_preferences_user_idx" ON "model_preferences" USING btree ("user_id");
