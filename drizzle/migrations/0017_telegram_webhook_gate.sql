-- Telegram webhook ingress + linking tables
-- Adds chat_messages.source + chat_messages.external_id

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'mc';

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "external_id" bigint;

CREATE TABLE IF NOT EXISTS "telegram_links" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "telegram_user_id" bigint NOT NULL UNIQUE,
  "telegram_chat_id" bigint NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
  "token" text PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "telegram_updates" (
  "update_id" bigint PRIMARY KEY,
  "tenant_id" integer REFERENCES "tenants"("id") ON DELETE SET NULL,
  "telegram_user_id" bigint,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'ignored',
  "error" text
);
