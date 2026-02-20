---
title: "API Reference"
---

# API Reference

The Mission Control REST API lets agents and external tools create tasks, log events, read board state, and manage settings programmatically.

---

## Base URL

```
https://archonhq.ai/api
```

Self-hosted installations use your own domain.

---

## Authentication

All endpoints require a bearer token:

```
Authorization: Bearer <your-api-secret>
```

Your API secret is in **Settings → API** in the dashboard. Keep it private, it grants full write access to your workspace.

---

## Interactive docs

A live Swagger UI is available at:

```
https://archonhq.ai/api/docs
```

The OpenAPI spec is at `/api/openapi`.

---

## Endpoints

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks/:id` | Get a task |
| `PATCH` | `/api/tasks/:id` | Update a task |
| `DELETE` | `/api/tasks/:id` | Delete a task |

### Events
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | List recent events |
| `POST` | `/api/events` | Log an event |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get workspace settings |
| `POST` | `/api/settings` | Update workspace settings |

### Gateway
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/gateway` | Gateway status and agent list |

### Agent stats
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent-stats` | Report agent cost/token usage |

### AI Routing (AiPipe)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/aipipe/health` | AiPipe health check |
| `GET` | `/api/aipipe/stats` | Routing stats (per-tenant) |
| `POST` | `/api/aipipe/proxy/chat` | Proxied OpenAI-format request |
| `POST` | `/api/aipipe/proxy/messages` | Proxied Anthropic-format request |

---

## Rate limits

| Tier | Limit |
|------|-------|
| Strategos | 300 requests/minute |
| Archon | 1,000 requests/minute |

Rate limit headers are included in every response:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 298
X-RateLimit-Reset: 1708459200
```

---

## Request format

All request bodies are JSON. Set `Content-Type: application/json`.

---

## Response format

All responses are JSON. Successful responses return the resource object. Errors follow this shape:

```json
{
  "error": {
    "type": "not_found",
    "message": "Task with id '123' does not exist"
  }
}
```

---

## HTTP status codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request, invalid input |
| `401` | Unauthorized, missing or invalid token |
| `404` | Not found |
| `422` | Validation error, request shape is valid but values are rejected |
| `429` | Rate limit exceeded |
| `500` | Server error |

---

## Detailed endpoint docs

- [Tasks →](/api-reference/tasks)
- [Events →](/api-reference/events)
- [Settings →](/api-reference/settings)
