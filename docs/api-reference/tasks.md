---
title: "Tasks API"
description: "Tasks API reference — create, update, list, and delete task resources."
---

# Tasks API

Create, read, update, and delete tasks on the ArchonHQ board.

## Task object

```json
{
  "id": 42,
  "title": "Implement rate limiting",
  "description": "Add per-IP rate limiting to all public API endpoints.",
  "status": "in_progress",
  "priority": "high",
  "goal": "api-hardening",
  "agent": "code-agent",
  "labels": ["backend", "security"],
  "createdAt": "2026-02-20T09:15:00Z",
  "updatedAt": "2026-02-20T14:32:00Z"
}
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `id` | integer | Auto-assigned, read-only |
| `title` | string | Required. Max 500 chars |
| `description` | string | Optional. Markdown supported |
| `status` | enum | `backlog` `in_progress` `review` `done` |
| `priority` | enum | `critical` `high` `medium` `low` |
| `goal` | string | Optional. Goal slug |
| `agent` | string | Optional. Agent name |
| `labels` | string[] | Optional. Array of label names |
| `createdAt` | ISO 8601 | Read-only |
| `updatedAt` | ISO 8601 | Read-only |

## List tasks

```
GET /api/tasks
```

Returns all tasks in the workspace, sorted by `updatedAt` descending.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `priority` | string | Filter by priority |
| `agent` | string | Filter by agent name |
| `goal` | string | Filter by goal |
| `limit` | integer | Max results (default 100, max 500) |

**Example:**
```bash
curl https://archonhq.ai/api/tasks?status=in_progress&priority=high \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
[
  { "id": 42, "title": "...", "status": "in_progress", ... },
  { "id": 38, "title": "...", "status": "in_progress", ... }
]
```

## Create a task

```
POST /api/tasks
```

**Request body:**
```json
{
  "title": "Implement rate limiting",
  "description": "Add per-IP rate limiting to all public API endpoints.",
  "status": "backlog",
  "priority": "high",
  "goal": "api-hardening",
  "agent": "code-agent",
  "labels": ["backend", "security"]
}
```

Only `title` is required. All other fields default to:
- `status` → `backlog`
- `priority` → `medium`
- `goal`, `agent`, `labels` → null/empty

**Response: `201 Created`**
```json
{
  "id": 43,
  "title": "Implement rate limiting",
  "status": "backlog",
  "priority": "high",
  ...
}
```

A Telegram notification is sent to your configured chat on task creation.

## Get a task

```
GET /api/tasks/:id
```

**Example:**
```bash
curl https://archonhq.ai/api/tasks/42 \
  -H "Authorization: Bearer <token>"
```

**Response: `200 OK`**
```json
{
  "id": 42,
  "title": "Implement rate limiting",
  ...
}
```

## Update a task

```
PATCH /api/tasks/:id
```

Partial update, send only the fields you want to change.

**Example, move to Done:**
```bash
curl -X PATCH https://archonhq.ai/api/tasks/42 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

**Example, escalate priority:**
```bash
curl -X PATCH https://archonhq.ai/api/tasks/42 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"priority": "critical", "labels": ["backend", "security", "urgent"]}'
```

**Response: `200 OK`**: returns the full updated task object.

Every update is logged in the task's activity timeline with a timestamp.

## Delete a task

```
DELETE /api/tasks/:id
```

**Example:**
```bash
curl -X DELETE https://archonhq.ai/api/tasks/42 \
  -H "Authorization: Bearer <token>"
```

**Response: `200 OK`**
```json
{ "success": true }
```

Deletion is permanent. The activity log entry for the deletion is retained for audit purposes.

## Agent usage pattern

Agents typically follow this lifecycle via the API:

```bash
# 1. Create task when work starts
TASK=$(curl -s -X POST https://archonhq.ai/api/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Refactor auth module", "status": "in_progress", "priority": "high", "agent": "code-agent"}')

TASK_ID=$(echo $TASK | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Update status as work progresses
curl -X PATCH https://archonhq.ai/api/tasks/$TASK_ID \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "review", "description": "Refactored. Tests pass. Awaiting human review."}'

# 3. Mark done when approved
curl -X PATCH https://archonhq.ai/api/tasks/$TASK_ID \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```
