# ArchonHQ

**AI agent coordination dashboard with smart LLM routing.**

Live at [archonhq.ai](https://archonhq.ai) · [Docs](https://archonhq.ai/docs) · [Roadmap](https://archonhq.ai/roadmap)

Built on [OpenClaw](https://openclaw.ai) — the AI agent operating system.

---

## What it does

ArchonHQ is the command layer for teams running AI agents. It connects to your local [OpenClaw](https://openclaw.ai) gateway and gives you:

- **Kanban board** with drag-and-drop, WIP limits, per-card activity timelines, and full API access
- **Smart LLM routing** via AiPipe — scores each request on complexity and routes to the cheapest model that can handle it. Simple tasks go to `gpt-4o-mini`, complex reasoning to Claude Sonnet. Typical saving: ~50% vs using a single frontier model
- **Multi-provider support** — OpenAI, Anthropic, xAI, Google Gemini, OpenRouter, MiniMax, Kimi; per-tenant key isolation
- **Agent monitoring** — see active agents, their costs, token usage, and current tasks in real time
- **Telegram notifications** when tasks are created, updated, or reach a critical state
- **Connection Wizard** — 8-step setup for gateway, provider keys, smart routing, agent roles, and notifications
- **Billing** — Strategos ($39/mo) and Archon ($99/mo) via Stripe

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Drizzle ORM · PostgreSQL · Go (AiPipe)

## Quick start (self-hosted)

See the [self-hosting guide →](https://archonhq.ai/docs/guides/self-hosting)

```bash
# 1. Clone and install
git clone https://github.com/MikeS071/Mission-Control
cd Mission-Control
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in: DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_SECRET,
#          NEXTAUTH_URL, AIPIPE_URL, AIPIPE_ADMIN_SECRET

# 3. Run DB migrations
npm run migrate

# 4. Start dev server
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (port 3000) |
| `npm run build` | Production build |
| `npm run migrate` | Run Drizzle schema migrations |
| `npm run test` | Run unit tests |
| `bash scripts/regression-test.sh` | Full 87-test regression suite |
| `bash scripts/pre-release-check.sh` | Pre-merge gate (TS, Stripe, Coolify, infra) |

## Repository structure

```
src/app/              Pages and API routes
src/components/       UI components (KanbanBoard, AiPipeWidget, etc.)
src/db/               Drizzle schema and migrations
src/lib/              Shared utilities, DB client, AiPipe client
docs/                 User docs (served at /docs via Fumadocs)
  guides/             Getting started, how-to-use, self-hosting
  features/           Feature deep-dives
  technical/          Architecture and implementation references
  api-reference/      REST API docs
scripts/              Regression tests, pre-release checks
```

## OpenClaw ecosystem

ArchonHQ is part of the [OpenClaw](https://openclaw.ai) ecosystem. OpenClaw is the agent operating system that ArchonHQ connects to via the gateway. If you're running OpenClaw locally, the gateway is already running at `http://localhost:18789` and ArchonHQ will discover it automatically.

## License

Apache 2.0
