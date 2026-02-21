-- Migration: 0007_chat
-- Creates the chat_messages table for persistent chat history.
-- DO NOT RUN YET — this migration is prepared for the chat backend sprint.
--
-- When the full chat backend is implemented:
-- 1. Run: npx drizzle-kit migrate
-- 2. Add chat_messages table to src/db/schema.ts
-- 3. Implement WebSocket/SSE transport in /api/chat
-- 4. Route messages through AiPipe with per-tenant model config

CREATE TABLE chat_messages (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient per-tenant history queries
CREATE INDEX idx_chat_messages_tenant_id ON chat_messages (tenant_id, created_at DESC);
