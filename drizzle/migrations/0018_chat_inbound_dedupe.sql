-- Make inbound relays idempotent (e.g. Telegram JSONL tail retries)
-- Unique per (tenant_id, source, external_id) for externalId-bearing messages.

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_source_external_id_uniq
  ON chat_messages (tenant_id, source, external_id)
  WHERE external_id IS NOT NULL;
