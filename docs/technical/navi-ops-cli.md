# navi-ops CLI — Technical Reference

**Added:** 2026-02-20
**Author:** navi-ops doc-updater

## Architecture
The repo’s navi-ops workflow is implemented as shell-based operational commands and Git hooks:

- Regression suite (`scripts/regression-test.sh`)
- Pre-release orchestration (`scripts/pre-release-check.sh`)
- Pre-push policy gate (`.git/hooks/pre-push`)

This acts as the CLI control plane for release readiness in this codebase.

## Key files
- `scripts/pre-release-check.sh` — orchestrates release checks (regression, git state, TS, env checks, infra checks)
- `scripts/regression-test.sh` — broad integration suite (build, DB, pages, auth/API behavior, billing webhook, OpenAPI checks)
- `.git/hooks/pre-push` — blocks direct main pushes and invokes pre-release checks on main-bound merges
- `package.json` — exposes helper commands (`stripe:setup`, `test:billing`, etc.)
- `scripts/test-billing.sh` — targeted billing API regression checks

## Database
No dedicated CLI table. Scripts validate DB availability and required schema (for example `tasks`, `events`, `agent_stats`, `waitlist`, `subscriptions`, `tenants`, `memberships`).

## API / command surface
Operational commands in this repo:
- `bash scripts/regression-test.sh [--prod|--base <url>]`
- `bash scripts/pre-release-check.sh [--fix-coolify]`
- `bash scripts/test-billing.sh`

Related npm entrypoints:
- `npm run stripe:setup`
- `npm run test:billing`

## Tenant isolation
The CLI scripts do not bypass API tenant controls. Their API probes verify expected auth behavior (public endpoints not 401; protected endpoints return 401 when unauthenticated), reinforcing tenant-scoped route contracts.

## Implementation notes
- `pre-release-check.sh` runs `regression-test.sh` first as a mandatory gate.
- `regression-test.sh` checks endpoint classes: public, auth-protected, webhook behavior, and content integrity.
- Pre-push hook enforces merge-only main promotion and aborts push if pre-release checks fail.

## Extension points
- Consolidate shell scripts into a versioned Node CLI binary for portable install.
- Emit machine-readable JSON reports for CI dashboards.
- Standardize command names to align one-to-one with `status`, `plan`, `release`, `run` verbs if/when a dedicated `navi-ops` binary is introduced.