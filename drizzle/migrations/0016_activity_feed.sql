-- 0016_activity_feed.sql
-- Activity feed tables: queue, events, reactions, comments
-- Chat thread support: threads table + thread_id on chat_messages

-- ── activity_queue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  payload_json  jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  processed     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS activity_queue_unprocessed_idx
  ON activity_queue (tenant_id, processed, created_at)
  WHERE processed = false;

-- ── activity_events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  display_name  text NOT NULL,
  description   text NOT NULL DEFAULT '',
  icon          text NOT NULL DEFAULT '⚡',
  payload_json  jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_events_tenant_created_idx
  ON activity_events (tenant_id, created_at DESC);

-- ── activity_reactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_reactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  from_tenant_id  integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reaction_type   text NOT NULL CHECK (reaction_type IN ('hype', 'respect', 'tribute')),
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, from_tenant_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS activity_reactions_event_idx
  ON activity_reactions (event_id);

-- ── activity_comments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  tenant_id   integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) <= 500),
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_comments_event_idx
  ON activity_comments (event_id, created_at ASC);

-- ── chat_threads ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_threads (
  id          serial PRIMARY KEY,
  tenant_id   integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New thread',
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_threads_tenant_idx
  ON chat_threads (tenant_id, updated_at DESC);

-- ── chat_messages: add thread_id ───────────────────────────────────────────
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS thread_id integer REFERENCES chat_threads(id) ON DELETE SET NULL;

-- ── Backfill: one default "Main" thread per tenant ─────────────────────────
WITH inserted AS (
  INSERT INTO chat_threads (tenant_id, title)
  SELECT DISTINCT tenant_id, 'Main'
  FROM chat_messages
  ON CONFLICT DO NOTHING
  RETURNING id, tenant_id
)
UPDATE chat_messages cm
SET thread_id = i.id
FROM inserted i
WHERE cm.tenant_id = i.tenant_id
  AND cm.thread_id IS NULL;
