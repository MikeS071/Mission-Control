---
title: "navi-ops CLI"
---

# navi-ops CLI

**Added:** 2026-02-20
**Tier:** Internal operator workflow

## Overview
In Mission Control, the operational CLI workflow is represented by the release/check scripts and Git hook safeguards used for dev→main promotion. This provides a repeatable command-line path for status checks, regression gates, and release safety checks.

The current repository integration is script-first (`scripts/pre-release-check.sh`, `scripts/regression-test.sh`) and hook-enforced (`.git/hooks/pre-push`) rather than a standalone binary stored in this repo.

## How to use

### Step 1 — Run regression gate
Execute:
`bash scripts/regression-test.sh`

### Step 2 — Run pre-release gate
Execute:
`bash scripts/pre-release-check.sh`

### Step 3 — Push with branch protections
When pushing merges to `main`, the pre-push hook blocks direct pushes and runs pre-release checks automatically.

### Step 4 — Use npm helpers where needed
For related workflows, package scripts provide commands like billing setup and billing test runs.

## Key concepts
- **Script-based CLI surface**: Operational checks are shell scripts in `scripts/`.
- **Gate before merge**: Pre-release checks are mandatory for safe promotion.
- **Hook enforcement**: Direct pushes to `main` are blocked unless bypassed intentionally.
- **Environment validation**: Checks include TypeScript, DB, API health, and deployment env sanity.

## Limitations
- No single `navi-ops` executable is implemented in this repository.
- Some checks require local infrastructure and environment variables to be configured.
- Hook behavior depends on local Git hook installation in the working clone.