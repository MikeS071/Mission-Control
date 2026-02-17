# OpenClaw Mission Control

OpenClaw Mission Control is a self-hosted dashboard for running and supervising multi-agent workloads.

Current implementation includes:

- Google-authenticated dashboard shell
- Gateway status view
- Kanban board with PostgreSQL persistence
- Task CRUD APIs + SSE updates
- Workspace markdown file explorer/editor

The app is built with Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Drizzle ORM, and PostgreSQL.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Set required environment variables in `.env.local`:

```bash
DATABASE_URL=postgresql://mc_user:mc_pass@localhost:5432/mission_control?sslmode=disable
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=generate_a_strong_secret
GATEWAY_URL=http://127.0.0.1:18789
WORKSPACE_PATH=/absolute/path/to/workspace
```

3. Run DB migrations:

```bash
npm run migrate
```

4. Start the app:

```bash
npm run dev
```

5. Open:

`http://localhost:3000`

## Scripts

- `npm run dev` - start local Next.js dev server
- `npm run build` - build production assets
- `npm run start` - run production server
- `npm run lint` - run ESLint
- `npm run migrate` - generate + push Drizzle schema
- `npm run dev:https` - run custom HTTPS dev server (`server.ts`)
- `npm run start:https` - run built HTTPS server

## Repository Structure

- `src/app/` - app entrypoints and API routes
- `src/components/` - UI components (kanban, status, file editor)
- `src/db/` - Drizzle schema + seed script
- `src/lib/` - shared utilities and DB client
- `Prompt - Build Mission Control.md` - build prompt/context for OpenClaw Mission Control

## Documentation

- `docs/SETUP.md` - full local setup and environment
- `docs/API.md` - route-by-route API reference
- `docs/ARCHITECTURE.md` - system design and data flow
- `docs/OPERATIONS.md` - runbook, troubleshooting, and maintenance
- `docs/SECURITY.md` - security notes and hardening checklist

## Current Scope Notes

- Sessions/log feed pages are not fully implemented yet.
- SSE stream is polling-backed (`/api/tasks/stream`, 5s interval).
- Persistence currently covers tasks in PostgreSQL; cache/queue infrastructure is not present.

## License

No license file is currently defined in this repository.
