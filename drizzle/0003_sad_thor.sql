ALTER TABLE "conversations" ALTER COLUMN "enabled_tools" SET DEFAULT '["web_search"]'::jsonb;
UPDATE "conversations" SET "enabled_tools" = '["web_search"]'::jsonb WHERE "enabled_tools" = '[]'::jsonb;