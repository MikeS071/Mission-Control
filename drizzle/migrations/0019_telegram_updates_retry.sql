-- Telegram updates reliability: store payload + retry metadata

ALTER TABLE "telegram_updates"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" bigint,
  ADD COLUMN IF NOT EXISTS "telegram_message_id" bigint,
  ADD COLUMN IF NOT EXISTS "text" text,
  ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "locked_by" text;

CREATE INDEX IF NOT EXISTS "telegram_updates_next_attempt_idx" ON "telegram_updates" ("next_attempt_at")
  WHERE "next_attempt_at" IS NOT NULL;
