---
title: Developer Onboarding Guide
description: Everything you need to start working on ArchonHQ.
---

# Developer Onboarding Guide

You can use this guide to start working on ArchonHQ quickly. It assumes you can read a terminal and have done software development before. Skip to whatever section you need.

## 1. System Overview

ArchonHQ is a SaaS dashboard built on top of OpenClaw, an agentic AI runtime. The product gives teams a browser UI to manage AI agents, sprints, billing, and deployments. The backend is Next.js with Drizzle ORM against Postgres.

### Component Map

**ArchonHQ (this repo)** is the web application. It runs as a Docker container on the production server, exposed via Traefik reverse proxy. The dev instance runs as a raw Node process on separate ports.

**OpenClaw** is the AI gateway. It handles agent orchestration, cron scheduling, message routing, and the Telegram bot. Navi (described below) runs inside OpenClaw.

**AiPipe** is the LLM router that proxies model API calls. It sits between the application and providers like Anthropic and OpenAI, handling key rotation, cost tracking, and fallbacks.

**tls-proxy** is a small Node.js TLS termination proxy (`tls-proxy.js`). It listens on port 3000 (HTTPS) and forwards to the container on port 3002. A watchdog script (`start-proxy.sh`) keeps it alive. It gets restarted automatically at the end of every deploy.

**Cloudflare Tunnel** (`cloudflared`) creates an encrypted tunnel from Cloudflare's edge to the server. Public traffic hits Cloudflare, passes through the tunnel to tls-proxy on port 3000, then to the Docker container on port 3002. The tunnel token lives in `pass` at `apis/cloudflare-tunnel-token`.

**Postgres** runs locally on the server via a Unix socket. Connection string: `postgresql://openclaw@/mission_control?host=/var/run/postgresql`.

**Traefik** handles routing and TLS inside the Coolify network. The production container connects to the `coolify` Docker network and registers with Traefik via labels.

### Key Repos

- `openclaw-mission-control`: the web app (this repo)
- `navi-ops`: the Go CLI that drives autonomous DevOps operations
- `openclaw-starter`: one-command VPS installer for getting your own OpenClaw instance

### URL Reference

- Production: `https://archonhq.ai`
- Dev preview: `https://dev.archonhq.ai`
- Dev local HTTP: `http://127.0.0.1:3003`
- Dev local HTTPS: `https://<tailscale-host>:3004`
- Container health: `http://127.0.0.1:3002/api/health`

## 2. Working with Navi

Navi is the DevOps brain of this project. It is not a chatbot you prompt occasionally. It is an autonomous agent that reads `sprint.json` every 30 minutes, classifies work items, dispatches sub-agents for safe work, and pings Telegram when it needs a decision.

The primary interface is Telegram (chat ID configured in your OpenClaw workspace). Most operational communication happens there, not in Slack or email.

### What Navi Actually Does

Every 30 minutes, `navi-ops run` fires via OpenClaw cron. The loop is:

1. Load `workflow/sprint.json`
2. Classify every item as AUTO, NEEDS_USER, or BLOCKED
3. Dispatch sub-agents for AUTO items in parallel via the dispatcher at `http://127.0.0.1:7070`
4. Send Telegram alerts for NEEDS_USER items
5. Log everything to `/home/openclaw/.openclaw/workspace/navi-ops.log`

### The Three States

**AUTO** means Navi executes without asking. All of these must be true: the epic is `in_progress` or `active`, the item is `todo`, the item type is `Quick`, all dependencies are `done`, `autoMergeToDev` is `true`, and the CONFIDENCE_SCORE after implementation reaches 95 or above.

**NEEDS_USER** means Navi sends a Telegram message and waits. Any one of these triggers it: the epic is still `backlog`, the item type is `Standard` or `Split`, `autoMergeToDev` is `false`, CONFIDENCE_SCORE is below 95, or the work touches public posting, secrets, OAuth, or a production deploy.

**BLOCKED** means a dependency is unresolved. Navi logs it and moves on silently.

### Common Request Patterns

To start a new feature, describe what you want in Telegram. Navi will write a pre-flight spec (Phase 0) and ask for approval before writing any code.

To check the current sprint state: `navi-ops plan`

To see system health: `navi-ops status`

To manually trigger the autonomous loop: `navi-ops run`

To preview what the loop would do without executing: `navi-ops run --dry-run`

### Getting Your Own Navi Clone

See Section 10.

## 3. Sprint and Feature Request Workflow

Work flows through six phases. Understanding this prevents confusion about why something is not deployed yet.

### Phase 0: Pre-flight Spec

Before any code is written, Navi (or you) writes a spec covering assumptions, success criteria, and explicit scope exclusions. This is not optional. It is the contract that lets CONFIDENCE_SCORE mean something.

Write a feature request by messaging Navi in Telegram with what you want, in plain language. Navi will draft the spec and ask you to approve it. Once you approve, the item enters the sprint.

### Phase 1: Stories

Complex items (type `Split`) get broken into sub-items. Navi uses the `architect` agent (Claude Sonnet) to design the decomposition, then the `planner` agent to write individual specs.

Simple items (type `Quick`) skip this and go straight to implementation.

### Phase 2: Readiness Check

Before implementation, a readiness check runs to verify the spec is complete enough to execute. CONFIDENCE_SCORE is evaluated here. Below 95, the item becomes NEEDS_USER and you get a Telegram message with the score breakdown.

### Phase 3: Implementation

The `code-agent` (gpt-5.3-codex in Development Mode) writes the code. The `tdd-guide` writes tests in parallel where possible. Changes are committed to a `feature/*` branch.

### Phase 4: Quality Contract

The `code-reviewer` agent reviews the implementation. If the item touches auth, tenant logic, file handling, or user input, the `security-reviewer` also runs. Both must pass before merge.

### Phase 5: Docs Gate

This is a hard gate before any feature reaches production. For items where `docsRequired: true` in sprint.json, the following must exist:

- `docs/features/<docSlug>.md`
- `docs/technical/<docSlug>.md`
- Roadmap entry moved to Delivered
- Landing page reviewed for accuracy

`navi-ops release check` fails without these. If gaps exist, the `doc-updater` agent (Claude Opus) is dispatched automatically.

### Production Release

Mike reviews `dev.archonhq.ai`, then says "merge to main" in Telegram. Navi runs `navi-ops release check` (which runs regression tests, `pre-release-check.sh`, and the docs gate). If everything passes with ALL CLEAR, Navi does the merge and push. GitHub Actions deploys from there.

### sprint.json as Source of Truth

Everything lives in `workflow/sprint.json`. The sprint ID is the ISO week (e.g. `2026-W08`). Epics have phases, statuses, and items. Items have types, dependencies, `autoMergeToDev` flags, `docsRequired` flags, and `docSlug` values.

Mike approves three things and only three things: the Monday sprint plan, the production release (dev to main), and items that come back with CONFIDENCE_SCORE below 95.

## 4. Development Setup

### Prerequisites

- Node.js 22 (check with `node --version`)
- pnpm or npm (the repo uses npm scripts but pnpm works fine)
- Go 1.22 or later (for building navi-ops)
- Postgres running locally
- Tailscale (recommended for accessing the dev preview URL)

### Clone and Install

```bash
git clone git@github.com:<org>/openclaw-mission-control.git
cd openclaw-mission-control
npm install
```

### Environment Variables

Copy the key list below into `.env.local` at the repo root. All values come from the `pass` store or the team's shared secret manager. Do not hardcode any values.

Required keys:

```
DATABASE_URL
NEXTAUTH_URL
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GATEWAY_URL
WORKSPACE_PATH
SSL_CERT
SSL_KEY
API_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
RESEND_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRO_PRICE_ID
STRIPE_TEAM_PRICE_ID
STRIPE_PRO_REGULAR_PRICE_ID
STRIPE_TEAM_REGULAR_PRICE_ID
AIPIPE_URL
AIPIPE_ADMIN_SECRET
ANTHROPIC_API_KEY
DEPLOY_WEBHOOK_SECRET
COOLIFY_API_TOKEN
COOLIFY_APP_UUID
ENCRYPTION_KEY
GITHUB_PAT
```

For local dev, `NEXTAUTH_URL` should be `https://dev.archonhq.ai`. Never set it to a localhost URL in `.env.local` since the pre-release check will flag that as an env leak.

### Database details Setup

The database runs as the local `openclaw` Postgres user via Unix socket:

```bash
psql "postgresql://openclaw@/mission_control?host=/var/run/postgresql"
```

To apply schema migrations:

```bash
DATABASE_URL="postgresql://openclaw@/mission_control?host=/var/run/postgresql" npx drizzle-kit push
```

### Running the Dev Server

```bash
bash start-dev.sh
```

This kills any existing dev instance, sources `.env.local`, and starts Next.js via `tsx server.ts` on:

- HTTP: `http://127.0.0.1:3003`
- HTTPS: `https://<tailscale-host>:3004`

Logs go to `/tmp/mc-dev.log`. The server compiles on demand, so no pre-build is needed. Code changes are live on the next page load.

To stop the dev server cleanly:

```bash
kill $(cat /tmp/mc-dev.pid)
```

Do not use `pkill -f next`. It will kill the exec shell. Always use the PID file.

## 5. Build, Test, and Debug

### TypeScript Check

Before committing anything, run:

```bash
npx tsc --noEmit
```

Zero errors is the standard. The pre-release check enforces this and will block a merge if TS errors exist.

### Regression Suite

The regression suite covers build, database, public API, auth enforcement, pages, newsletter, Stripe, middleware, infrastructure, and content integrity.

Run against the local dev server:

```bash
bash scripts/regression-test.sh
```

Run against production to verify a deploy:

```bash
bash scripts/regression-test.sh --prod
```

Run against a specific URL:

```bash
bash scripts/regression-test.sh --base http://localhost:3003
```

Exit code 0 means all pass. Exit code 1 means failures. The output includes a Results summary line you can read at a glance.

### Pre-Release Check

This script must pass before every dev to main merge. It runs automatically from the pre-push hook, but you can run it manually at any point:

```bash
bash scripts/pre-release-check.sh
```

It checks (in order):

1. Regression suite (runs the full regression test as its first gate)
2. Git branch and unpushed commits
3. Changed files scanned for env-specific values baked into source
4. TypeScript errors
5. Coolify env var audit for duplicates and required keys
6. `NEXTAUTH_URL` set correctly for production
7. Active Stripe prices
8. Production and dev returning HTTP 200
9. Infrastructure running (Cloudflare tunnel, tls-proxy, Postgres)

Run with `--fix-coolify` to automatically delete Coolify env duplicates:

```bash
bash scripts/pre-release-check.sh --fix-coolify
```

### Dev Server Logs

```bash
tail -f /tmp/mc-dev.log
```

For production server logs, check the Docker container:

```bash
docker logs archonhq --tail 100 -f
```

For tls-proxy logs:

```bash
tail -f /tmp/tls-proxy.log
```

For navi-ops autonomous loop logs:

```bash
navi-ops log --n 50
```

Or read the raw file:

```bash
tail -f /home/openclaw/.openclaw/workspace/navi-ops.log
```

### Common Error Patterns

**Server fails to start:** Check `/tmp/mc-dev.log` for the first error. Usually a missing env var or port conflict. Make sure nothing is already using 3003/3004.

**Auth redirect loops:** `NEXTAUTH_URL` is wrong. For dev it must be `https://dev.archonhq.ai`, not localhost.

**Database connection errors:** Postgres may not be running, or the Unix socket path is wrong. Try `psql "postgresql://openclaw@/mission_control?host=/var/run/postgresql"` directly.

**TypeScript errors after pulling:** Run `npm install` first. A dependency may have updated its types.

**Coolify env duplicates:** Run `bash scripts/pre-release-check.sh --fix-coolify`. Duplicate env vars in Coolify cause silent config problems.

## 6. Git Workflow

### Branch Model

```
feature/<story-id>-short-description  →  dev  →  main
```

All feature work happens on `feature/*` branches cut from `dev`. PRs target `dev`, not main. The `dev` branch deploys to `dev.archonhq.ai` for review. `main` is production only.

Never commit directly to `dev` or `main`. Always use a branch.

### Conventional Commits

Every commit message follows this format:

```
<type>: <short description>

<optional body with evidence: test count, build status>
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`

One commit per story. Do not mix unrelated cleanup with behavior changes. For significant changes, include verification evidence in the commit body (test counts, build status, what was checked).

Examples:

```
feat: add team billing portal with Stripe customer portal redirect

Regression: 47 pass, 0 fail. TypeScript: 0 errors. Tested locally against Stripe test mode.
```

```
fix: correct NEXTAUTH_URL env leak in checkout route fallback
```

```
docs: add Phase 5 docs gate documentation to technical guide
```

### Auto-merge to Dev

When a `Quick` item meets all AUTO conditions (CONFIDENCE_SCORE ≥ 95, build passes, zero test failures, scope matches the pre-flight spec), Navi merges automatically:

```bash
git checkout dev && git merge feature/xxx --no-ff && git push
```

Navi then sends a one-line passive notification to Telegram. No action needed.

### Merge to Main

This requires Mike's explicit approval. Always. Not for hotfixes, not at CONFIDENCE_SCORE 100, not for anything "trivial". The pre-push hook enforces this: direct pushes to main (non-merge commits) are blocked.

The hook also runs `pre-release-check.sh` automatically when you push a merge commit to main. If the check fails, the push is rejected.

To bypass in a genuine emergency (requires Mike's explicit say-so):

```bash
git push --no-verify
```

### PRs and Review

Open PRs against `dev`. The `code-reviewer` agent reviews automatically as part of the sprint workflow. For security-sensitive changes (auth, tenancy, file handling, input validation), the `security-reviewer` also runs.

## 7. Deploy and Monitor

### Full Deploy Pipeline

1. Mike approves "merge to main" in Telegram
2. `navi-ops release check` runs: regression tests + `pre-release-check.sh` + Phase 5 docs gate
3. ALL CLEAR: Navi runs `git checkout main && git merge dev --no-ff && git push`
4. GitHub Actions triggers on push to `main`
5. Actions SSH into the production server
6. Server pulls latest code and builds a new Docker image (`archonhq:new`)
7. New container starts on port 3005 for a health check (`/api/health`)
8. Health check passes: old container is stopped and removed, new container starts on port 3002 as `archonhq`
9. `start-proxy.sh` restarts tls-proxy to restore the CF path
10. Old images are pruned

The full sequence takes about 3 to 5 minutes. There is a brief gap (around 2 seconds) during container swap when the CF tunnel path is interrupted.

### Checking Deploy Status

Watch GitHub Actions in the repo's Actions tab, or check the container directly:

```bash
docker ps | grep archonhq
curl -sf http://127.0.0.1:3002/api/health && echo "healthy"
```

### navi-ops Release Commands

Run the full release gate before merging:

```bash
navi-ops release check
```

If Phase 5 gaps exist, dispatch the doc-updater:

```bash
navi-ops release docs
```

Execute the dev to main merge (only after ALL CLEAR):

```bash
navi-ops release deploy
```

### Alert Conditions

Navi sends Telegram alerts automatically for:

- Production returning non-200: CRITICAL, message says "URGENT: prod is {code}"
- Cloudflare tunnel process not running: CRITICAL
- Regression test failure: HIGH
- Gateway RSS above 1000 MB: HIGH
- Available RAM below 400 MB: HIGH
- NEEDS_USER item ready for decision: INFO
- CONFIDENCE_SCORE below 95: INFO with score breakdown

If you get a CRITICAL alert, check the tls-proxy and cloudflared processes first. Most production outages are one of those two.

### Log Locations

| What | Where |
|---|---|
| Dev server | `/tmp/mc-dev.log` |
| Prod container | `docker logs archonhq` |
| tls-proxy | `/tmp/tls-proxy.log` |
| navi-ops loop | `/home/openclaw/.openclaw/workspace/navi-ops.log` |
| OpenClaw gateway | `openclaw gateway status` then check its log path |

## 8. DevOps Tools Reference

### navi-ops

The Go CLI for autonomous DevOps. Binary at `/home/openclaw/.local/bin/navi-ops`.

```bash
navi-ops status                  # full system snapshot: git, health, board, regression, docs gate
navi-ops plan                    # classify all sprint items as AUTO/NEEDS_USER/BLOCKED/DONE
navi-ops plan --filter AUTO      # show only AUTO items
navi-ops run                     # execute autonomous work loop
navi-ops run --dry-run           # preview what the loop would do without executing
navi-ops release check           # full release gate (regression + pre-release-check + docs)
navi-ops release docs            # dispatch doc-updater for Phase 5 gaps
navi-ops release deploy          # execute dev to main merge (requires ALL CLEAR)
navi-ops log                     # show recent run log entries
navi-ops log --n 100             # show last 100 entries
navi-ops cron install            # install the 30-min heartbeat cron job
navi-ops cron status             # check cron job status
```

### openclaw CLI

Manages the OpenClaw gateway, agents, and cron jobs.

```bash
openclaw gateway status          # check gateway health and memory
openclaw gateway start           # start the gateway
openclaw gateway stop            # stop the gateway
openclaw gateway restart         # restart the gateway
openclaw agent --agent main -m "your message"   # send a message to the main agent
openclaw agent --agent code-agent -m "..."      # invoke a specific sub-agent
```

### AiPipe

The LLM router. Check health:

```bash
curl $AIPIPE_URL/healthz
```

Admin endpoint (requires `AIPIPE_ADMIN_SECRET`):

```bash
curl -H "Authorization: Bearer $AIPIPE_ADMIN_SECRET" $AIPIPE_URL/admin/stats
```

### Cloudflare Tunnel

Check if `cloudflared` is running:

```bash
pgrep -a cloudflared
```

Restart if down:

```bash
cloudflared tunnel run <tunnel-name> &
```

The tunnel token is in `pass` at `apis/cloudflare-tunnel-token`.

### pass Store

All secrets live in the `pass` store. Never put them in files.

```bash
pass show apis/cloudflare-tunnel-token
pass show anthropic/api-key
```

For scripts, use `bash automation/secrets.sh <path>` which wraps `pass show` safely.

### Agent Roles

These sub-agents are dispatched by the autonomous loop or manually via `openclaw agent`:

- `architect`: designs story decomposition for complex Split items (Sonnet, Research Mode)
- `planner`: writes specs for Standard and Split items (Sonnet, Research Mode)
- `code-agent`: all implementation work (gpt-5.3-codex, Development Mode)
- `tdd-guide`: writes tests alongside implementation (gpt-5.3-codex, Development Mode)
- `code-reviewer`: reviews implementation before merge (Sonnet, Review Mode)
- `security-reviewer`: reviews auth, tenant, file, and input changes (Sonnet, Review Mode)
- `build-error-resolver`: fixes build failures, max 5 runs (gpt-5.3-codex, Development Mode)
- `doc-updater`: fills Phase 5 documentation gaps, auto-spawned (Claude Opus, Development Mode)
- `e2e-runner`: runs regression-test.sh and smoke tests (Sonnet, Development Mode)
- `refactor-cleaner`: cleanup pass after feature work (gpt-5.3-codex, Development Mode)

Agent role definitions live in `/home/openclaw/.openclaw/workspace/workflow/agents/*.md`.

## 9. Hard Rules

These are non-negotiable. They exist because someone (or some agent) learned the hard way.

**Never push or merge to main without Mike's explicit approval.** Not for hotfixes. Not at CONFIDENCE_SCORE 100. Not for "trivial" docs changes. The pre-push hook blocks direct pushes. If it ever needs bypassing, Mike must say so explicitly. Bypassing without that is a breach of the process.

**Never hardcode secrets.** All config goes in `.env.local` (gitignored) or the `pass` store. If a value is sensitive, it does not go in source. No exceptions.

**Never use `pkill -f next`.** This kills the exec shell, not just the server. Always use the PID file: `kill $(cat /tmp/mc-dev.pid)` for dev or `kill $(cat /tmp/mc.pid)` for prod.

**Never re-enable `mission-control.service`.** The systemd service is permanently disabled. The server is managed via PID files and Docker. If you see instructions to `systemctl enable mission-control`, they are outdated.

**Never auto-post to social media.** All tweets and LinkedIn posts require Mike's explicit review and approval. Navi will never post automatically. Any workflow that could post publicly must have a manual gate.

**Never skip Phase 5 docs gate.** If `navi-ops release check` fails on the docs gate, do not bypass it. Run `navi-ops release docs` to dispatch the doc-updater, or write the docs yourself.

**Karpathy coding standards apply to all code.** Target 200 to 400 lines per file, never exceed 800. Explicit error handling everywhere, no silent catch blocks. Validate all external input at API boundaries. Surgical changes only: touch only files that are in scope for the current story. No mixing unrelated cleanup with behavior changes.

**One hypothesis at a time.** When debugging, change one thing, verify, then move to the next. Do not stack speculative changes.

**Max 2 research note emails per day** to the work email address. Cron handles these. Do not send extras during heartbeats or ad-hoc sessions.

## 10. Getting Your Own Navi Clone

This section is for contributors who want to run the same autonomous DevOps workflow on their own infrastructure, separate from Mike's instance.

### What It Means

Your own Navi clone is a separate OpenClaw instance running on a separate VPS, with its own `SOUL.md`, `AGENTS.md`, `USER.md`, and `IDENTITY.md` configured for you. It shares the same workflow structure (sprint phases, WORKFLOW_AUTO.md, agent roles) but operates completely independently. It talks to your Telegram, not Mike's.

### Install OpenClaw on a Fresh VPS

```bash
curl -fsSL https://raw.githubusercontent.com/MikeS071/openclaw-starter/main/vps-install.sh | sudo bash
```

This handles: OpenClaw install and systemd user service, UFW firewall, Fail2ban, Tailscale VPN, structured workspace files, and the `ocl` management CLI. Requires Ubuntu 22.04 or 24.04. Takes about 5 minutes.

If you already have OpenClaw installed:

```bash
git clone https://github.com/MikeS071/openclaw-starter.git
cd openclaw-starter
bash install.sh
```

### Configure Your Persona

After install, edit these files in `~/.openclaw/workspace/`:

- `SOUL.md`: your working principles, autonomy rules, coding standards
- `USER.md`: who you are, your preferences, context Navi needs to know
- `AGENTS.md`: session rules, memory protocol, group chat behavior
- `IDENTITY.md`: Navi's name and personality for your instance

These files are loaded into every session. They are the core of how your Navi behaves. Spend time on `SOUL.md` in particular. A vague `SOUL.md` means an inconsistent agent.

### Configure the LLM Provider

```bash
openclaw onboard --non-interactive --accept-risk --auth-choice anthropic
```

Or for OpenAI:

```bash
openclaw onboard --non-interactive --accept-risk --auth-choice openai-api-key
```

### Start the Gateway

```bash
nohup openclaw gateway run > /tmp/openclaw-gateway.log 2>&1 &
```

On a properly installed VPS this runs automatically via the systemd user service on reboot.

Test it:

```bash
openclaw agent --agent main -m "Say hello"
```

### Connect to ArchonHQ Dashboard

Once your OpenClaw gateway is running, you can connect it to an ArchonHQ dashboard in BYO (Bring Your Own) mode. In the dashboard, go to Settings and select "Connect your own OpenClaw instance". You will need your gateway URL and API secret.

### Use the Same Workflow Structure

Copy `WORKFLOW_AUTO.md` from this repo's workspace to your own instance. This gives your Navi the same phase discipline: pre-flight specs before code, CONFIDENCE_SCORE gates, Phase 5 docs requirement, and the same release rules. The workflow is designed to be persona-agnostic. Your Navi and Mike's Navi will follow the same process even though they are separate instances that never talk to each other.

### Manage Your Installation

```bash
ocl status     # check gateway health
ocl logs       # view recent logs
ocl restart    # restart the gateway
ocl backup     # backup your config
ocl update     # update to latest OpenClaw
ocl harden     # restrict SSH to Tailscale only
```

### One Important Note

Your instance is completely separate. It will not interfere with Mike's Navi, and Mike's Navi will not affect yours. They share no state, no crons, no databases. The only shared artifact is the workflow protocol documented here.
