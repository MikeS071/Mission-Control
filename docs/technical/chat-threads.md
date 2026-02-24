---
title: "Chat Threads: Technical Reference"
description: "Data model, API routes, and runtime behavior for thread-scoped chat in Mission Control."
---

# Chat Threads: Technical Reference

## Data model

- `chat_threads`
  - `id` (serial PK)
  - `tenant_id` (FK)
  - `title`
  - `created_at`, `updated_at`
- `chat_messages.thread_id`
  - nullable integer FK → `chat_threads(id)`

A default thread ("Main") is created per tenant when needed.

## API routes

### Threads

- `GET /api/chat/threads`
  - Returns all threads for the current tenant, ordered by `updated_at DESC`.
- `POST /api/chat/threads`
  - Body: `{ "title"?: string }`
  - Creates a thread.
- `PATCH /api/chat/threads/[id]`
  - Body: `{ "title": string }`
  - Renames a thread (tenant ownership enforced).
- `DELETE /api/chat/threads/[id]`
  - Deletes thread + its messages (tenant ownership enforced).

### Messages

- `GET /api/chat/history?threadId=<id>&limit=<n>&beforeId=<id>`
  - Returns thread-scoped history.
- `GET /api/chat/stream?threadId=<id>`
  - Server-sent events (thread-scoped).
- `POST /api/chat/gateway`
  - Body includes `threadId`; messages are stored and context/history is scoped to that thread.

## WebSocket payload

WebSocket broadcasts include `threadId` when available. The client filters messages to the selected thread.

## Race handling / de-duplication

The client can receive the same message via both:

1) the HTTP response (after sending), and
2) the WebSocket broadcast (immediately after DB insert)

To avoid duplicate renders, the UI:

- replaces the optimistic local user message with the server message when it arrives,
- de-dupes by final DB message id,
- uses a near-duplicate heuristic as a fallback.
