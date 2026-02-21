# Contributing to ArchonHQ Mission Control

Read this before you touch anything. It is short. The full guide is at `docs/guides/developer-onboarding.md`.

---

## Quick Start

Requirements: Node 22, npm, Postgres running locally.

```bash
git clone git@github.com:<org>/openclaw-mission-control.git
cd openclaw-mission-control
npm install
cp .env.local.example .env.local   # fill in values from pass store
bash start-dev.sh
```

Dev server starts on:

- HTTP: `http://127.0.0.1:3003`
- HTTPS: `https://<tailscale-host>:3004`

Logs live at `/tmp/mc-dev.log`. To stop the server:

```bash
kill $(cat /tmp/mc-dev.pid)
```

Do not use `pkill -f next`. It kills the shell, not the server.

---

## Git Rules

Branches go `feature/<story-id>-description` to `dev` to `main`. PRs always target `dev`.

```bash
git checkout dev
git checkout -b feature/navi-B1-release-check
# do your work
git push origin feature/navi-B1-release-check
# open PR against dev
```

Conventional commits are required:

```
feat: short description
fix: short description
refactor: short description
docs: short description
test: short description
chore: short description
ci: short description
```

One commit per story. No mixing unrelated cleanup with behavior changes.

The pre-push hook blocks direct pushes to `main` and runs `pre-release-check.sh` automatically on merge commits to `main`. Do not bypass it without Mike's explicit approval.

---

## Running Tests

TypeScript check (run this before every commit):

```bash
npx tsc --noEmit
```

Full regression suite against the local dev server:

```bash
bash scripts/regression-test.sh
```

Against production:

```bash
bash scripts/regression-test.sh --prod
```

Pre-release check (mandatory before every dev to main merge):

```bash
bash scripts/pre-release-check.sh
```

This runs regression first, then checks git state, env leaks in source files, TypeScript, Coolify env vars, Stripe prices, and production HTTP status.

---

## Sprint Workflow

Work follows six phases: pre-flight spec, stories, readiness check, implementation, quality contract, and the Phase 5 docs gate.

Navi drives the autonomous loop every 30 minutes. Quick items (CONFIDENCE_SCORE ≥ 95, all conditions met) auto-merge to `dev`. Standard and Split items come back to you in Telegram for approval.

To see the current sprint state:

```bash
navi-ops plan
```

To see full system health:

```bash
navi-ops status
```

---

## Deploy Process

Only Mike approves production releases. The flow:

1. Mike reviews `dev.archonhq.ai` and says "merge to main"
2. `navi-ops release check` runs (regression + pre-release-check + Phase 5 docs gate)
3. ALL CLEAR: Navi merges `dev` to `main` and pushes
4. GitHub Actions builds a new Docker image on the server
5. New container health-checks on port 3005, then swaps onto port 3002
6. tls-proxy restarts to restore the Cloudflare path
7. Takes 3 to 5 minutes total

To check if a deploy landed:

```bash
curl -sf http://127.0.0.1:3002/api/health && echo "healthy"
docker ps | grep archonhq
```

---

## Hard Rules

**Never push to main without Mike's explicit approval.** The pre-push hook enforces this. Do not bypass it.

**Never hardcode secrets.** All config via `.env.local` (gitignored) or `pass` store.

**Never use `pkill -f next`.** Kill by PID file only.

**Never re-enable `mission-control.service`.** The systemd service is permanently disabled.

**Never auto-post to social media.** Every public post needs a manual review gate.

**Never skip the Phase 5 docs gate.** If `navi-ops release check` fails on docs, run `navi-ops release docs` to fix it.

**File size limit is 800 lines, target 200 to 400.** Explicit error handling everywhere. No silent catch blocks. Validate input at API boundaries. Touch only files in scope for the current story.

---

## Full Documentation

The complete developer guide covers system architecture, working with Navi, all navi-ops commands, environment setup, debug patterns, and how to run your own Navi clone:

[docs/guides/developer-onboarding.md](docs/guides/developer-onboarding.md)
