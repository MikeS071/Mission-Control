---
title: "Setup Guide"
---

# Setup Guide

This guide gets OpenClaw Mission Control running locally in a reproducible way for multi-agent workloads.

## Prerequisites

- Node.js 20+ (project is currently using Next.js 16)
- npm 10+
- PostgreSQL 16+
- A Google OAuth app (for login)

Optional:

- Docker (if you want to run Postgres in a container)

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

Create `.env.local` in repo root:

```bash
DATABASE_URL=postgresql://mc_user:mc_pass@localhost:5432/mission_control?sslmode=disable
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=replace_with_a_long_random_secret
GATEWAY_URL=http://127.0.0.1:18789
WORKSPACE_PATH=/absolute/path/to/your/workspace
```

Notes:

- `WORKSPACE_PATH` must point to an existing directory containing markdown files.
- `GATEWAY_URL` is used by the status proxy route (`/api/gateway/[...path]`).

## 3. Start PostgreSQL

### Option A: Local Postgres Service

Create DB + user:

```sql
CREATE USER mc_user WITH PASSWORD 'mc_pass';
CREATE DATABASE mission_control OWNER mc_user;
```

### Option B: Docker

If you prefer Docker, run your own Postgres container with matching credentials and port `5432`.

## 4. Run Migrations

```bash
npm run migrate
```

This uses:

- `drizzle.config.ts`
- `src/db/schema.ts`

## 5. (Optional) Seed Demo Tasks

```bash
npx tsx src/db/seed.ts
```

## 6. Start the App

```bash
npm run dev
```

Open:

`http://localhost:3000`

## HTTPS Dev Mode (Optional)

The project includes a custom HTTPS server (`server.ts`):

```bash
npm run dev:https
```

This requires valid cert paths via:

- `SSL_KEY`
- `SSL_CERT`

If unset, hardcoded defaults are used in `server.ts`.

## Common Setup Errors

- `DATABASE_URL` missing or invalid:
  - task endpoints fail with DB connection errors.
- `WORKSPACE_PATH` missing:
  - workspace file APIs fail immediately.
- Google OAuth env vars missing:
  - sign-in flow cannot initialize.
- `NEXTAUTH_SECRET` missing:
  - session/auth behavior may break.
