---
title: "Operations Runbook"
---

# Operations Runbook

This runbook applies to ArchonHQ for multi-agent workloads.

## Day-to-Day Commands

Install:

```bash
npm install
```

Migrate DB:

```bash
npm run migrate
```

Run dev app:

```bash
npm run dev
```

Lint:

```bash
npm run lint
```

## Health Checks

Manual checks:

1. Open UI:
   - `http://localhost:3000`
2. Task API:
   - `GET /api/tasks`
3. Task stream:
   - `GET /api/tasks/stream` (verify SSE frames)
4. Workspace:
   - `GET /api/workspace/files`
5. Gateway:
   - `GET /api/gateway/status`

## Troubleshooting

### 1) Login fails

Check:

- Google OAuth env vars are present
- callback URL matches provider config
- `NEXTAUTH_SECRET` exists

### 2) Tasks not loading

Check:

- Postgres is running
- `DATABASE_URL` is valid
- migrations were applied

### 3) Kanban does not refresh live

Check:

- browser EventSource connection for `/api/tasks/stream`
- no proxy buffering in front of SSE route
- DB reads are succeeding in stream handler

### 4) Workspace editor errors

Check:

- `WORKSPACE_PATH` exists and is readable/writable
- directory actually contains `.md` files

### 5) Gateway status unavailable

Check:

- `GATEWAY_URL` set correctly
- upstream service reachable from app runtime

## Release Notes Checklist

Before pushing updates:

1. Confirm migrations are safe and reversible.
2. Confirm auth flow still works in target environment.
3. Validate all API routes manually.
4. Smoke-check Kanban drag + file save + gateway status.
5. Update docs when routes or env vars change.
