# API Reference

This document describes the current API routes implemented in OpenClaw Mission Control (`src/app/api`) for multi-agent workloads.

## Authentication

### `GET/POST /api/auth/[...nextauth]`

NextAuth route handlers for Google OAuth session login.

Required env:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`

## Gateway Proxy

### `GET /api/gateway/[...path]`

Forwards a GET request to:

`{GATEWAY_URL}/{path}`

Behavior:

- Returns upstream body/status/content-type
- Returns `502` JSON when upstream is unreachable

Example:

`/api/gateway/status` -> `${GATEWAY_URL}/status`

## Tasks

### `GET /api/tasks`

Returns all tasks ordered by `createdAt`.

### `POST /api/tasks`

Creates a task from JSON body.

Expected fields:

- `title` (required)
- `description`
- `status`
- `agent`
- `priority`

### `PATCH /api/tasks`

Updates a task by `id` with partial fields.
Also updates `updatedAt`.

### `DELETE /api/tasks`

Deletes task by `id`.

## Task Stream (SSE)

### `GET /api/tasks/stream`

SSE endpoint that publishes full task list snapshots every 5 seconds.

Headers:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

Behavior:

- Sends initial state immediately
- Polls every 5 seconds
- Closes after 5 minutes

## Workspace Files

### `GET /api/workspace/files`

Returns all `.md` files in `WORKSPACE_PATH`.

### `GET /api/workspace/file?name=<file>`

Returns raw file contents from `WORKSPACE_PATH`.
Filename is sanitized via `path.basename`.

### `POST /api/workspace/file`

Writes markdown content to file.

Body:

```json
{
  "name": "example.md",
  "content": "# Updated content"
}
```

## Google Callback (Legacy)

### `GET /api/gog-callback`

Exchanges OAuth code and writes token JSON to a local config path.

Important:

- This route currently uses hardcoded client credentials and redirect URI in source.
- Treat this route as legacy/dev-only until refactored to env-driven config.
