-- Prevent duplicate Telegram messages from being inserted when webhooks retry.
-- Enforces idempotency when external_id is present.

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_tenant_source_external_id_uniq
  ON chat_messages (tenant_id, source, external_id)
  WHERE external_id IS NOT NULL;
