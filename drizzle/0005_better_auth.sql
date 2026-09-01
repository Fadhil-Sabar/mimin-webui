-- Better Auth cutover. This migration is intentionally ordered so every legacy
-- password is copied before the obsolete users.password_hash column is removed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_expires" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_issuer_account_idx" ON "accounts" ("issuer", "account_id");
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "accounts" ("user_id");

CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"identifier" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" ("identifier");

-- Copy credentials before removing the legacy password/session columns.
INSERT INTO "accounts" ("provider_id", "issuer", "account_id", "user_id", "password")
SELECT 'credential', 'local:credential', "id"::text, "id", "password_hash"
FROM "users"
ON CONFLICT ("issuer", "account_id") DO UPDATE SET "password" = EXCLUDED."password", "updated_at" = now();

-- Existing bearer tokens are from the removed custom auth implementation.
DELETE FROM "sessions";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_token_hash_unique";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "token_hash";
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "token" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonated_by" text;
ALTER TABLE "sessions" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" ("token");

UPDATE "users" SET "email_verified" = true, "role" = 'admin'
WHERE lower("email") = 'admin@mimin.local';
UPDATE "users" SET "role" = 'user' WHERE "role" IS NULL;

ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
