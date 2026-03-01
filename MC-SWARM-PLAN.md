# MC Swarm Execution Plan

## Overview
44 small tickets (5-10 min each for Codex agents), 8 phases, ~40 parallel slots.
Tech stack: Next.js 14, Drizzle ORM, PostgreSQL, Tailwind, shadcn/ui.
Branch base: `dev`. All work merges to `dev` first.

---

## Phase 1: Admin Panel Foundation (6 tickets, parallel)

### mc-01: Admin layout + navigation scaffold
- Create `src/app/dashboard/admin/layout.tsx` with admin sidebar nav
- Links: Overview, Users, Tenants, Policy, Provisioning, System
- Guard with `isAdmin` check (user.role === 'admin' from session)
- Create `src/app/dashboard/admin/page.tsx` — overview dashboard (placeholder cards)

### mc-02: Admin users list page
- Create `src/app/dashboard/admin/users/page.tsx`
- Server component: query all users with Drizzle (`select from users`)
- Table: ID, email, name, role, tenant, createdAt
- Search box (client filter), sort by column headers
- **Deps:** mc-01

### mc-03: Admin tenants list page
- Create `src/app/dashboard/admin/tenants/page.tsx`
- Server component: query tenants with member count, subscription status
- Table: ID, name, tier, members, status, createdAt
- Click row → tenant detail page (mc-04)
- **Deps:** mc-01

### mc-04: Admin tenant detail page
- Create `src/app/dashboard/admin/tenants/[id]/page.tsx`
- Show: tenant info, members list, subscription status, policy JSON viewer
- Action buttons: Edit tier, Edit policy (links to policy editor mc-12)
- **Deps:** mc-03

### mc-05: Admin API — list users endpoint
- Create `src/app/api/admin/users/route.ts`
- GET: return all users with tenant info (admin-only auth guard)

### mc-06: Admin API — list tenants endpoint
- Create `src/app/api/admin/tenants/route.ts` and `[id]/route.ts`
- GET: list/detail. PUT: update tenant tier/name (admin only)

---

## Phase 2: Policy Engine (8 tickets)

### mc-07: Policy schema (Zod + types)
- Create `src/lib/policy/schema.ts`
- Features: browser, nodes, social, arena, chat, aipipe, agents, contentai, coderai
- Limits: max_agents, max_tokens_month, max_storage_mb, max_members

### mc-08: Policy tier templates
- Create `src/lib/policy/tiers.ts`
- 3 tiers: initiate (free), strategos (pro), archon (enterprise)
- **Deps:** mc-07

### mc-09: Policy DB migration
- Add `policy` JSONB + `policy_updated_at` + `policy_updated_by` to tenants table
- **Deps:** mc-07

### mc-10: Policy eval helpers
- Create `src/lib/policy/eval.ts`
- `requireFeature(tenantId, feature)` — 403 if disabled
- `enforceLimit(tenantId, limitKey, currentValue)` — 403 if exceeded
- **Deps:** mc-07, mc-09

### mc-11: Policy admin API
- Create `src/app/api/admin/policy/[tenantId]/route.ts`
- GET/PUT with Zod validation + audit events
- POST apply-tier: apply template
- **Deps:** mc-07, mc-08, mc-09

### mc-12: Policy editor UI
- Create `src/app/dashboard/admin/policy/[tenantId]/page.tsx`
- JSON editor, Zod validation, tier selector, diff preview
- **Deps:** mc-04, mc-11

### mc-13: Policy audit log
- API + component for policy change history
- **Deps:** mc-11

### mc-14: Wire policy to 3 existing features
- Add `requireFeature` guard to: arena, aipipe, chat API routes
- Hide UI elements when feature disabled
- **Deps:** mc-10

---

## Phase 3: Usage-Based Pricing (7 tickets)

### mc-15: Usage ledger schema
- `usage_ledger` table: tenantId, model, tokens, cost, timestamp
- `usage_budgets` table: tenantId, monthly_limit, hard_stop

### mc-16: AiPipe metering middleware
- Write usage_ledger entry after each LLM response
- Cost: model → rate lookup + 20% margin
- **Deps:** mc-15

### mc-17: Budget enforcement
- `checkBudget(tenantId)` — 402 if exceeded, alert at threshold
- **Deps:** mc-15, mc-16

### mc-18: Usage dashboard API
- GET month-to-date breakdown by model, daily totals
- **Deps:** mc-15

### mc-19: Usage dashboard UI
- Cards + bar chart + model breakdown table
- **Deps:** mc-18

### mc-20: Pricing rates config
- Admin API + UI for model pricing rates
- **Deps:** mc-16

### mc-21: Usage alerts
- Budget threshold notifications, daily summary events
- **Deps:** mc-17

---

## Phase 4: Kanban + Provisioning (4 tickets, all parallel)

### mc-22: Kanban bot activation triggers
- Stale task detection (>7 days), empty board detection, daily scan

### mc-23: Kanban stale indicator UI
- Amber badge on stale cards, "Show stale only" filter
- **Deps:** mc-22

### mc-24: Kanban empty board suggestions
- Template tasks panel when board is empty

### mc-25: Provisioning template sync
- archon-starter workspace template, sync script, wire to provision API

---

## Phase 5: ContentAI MC Integration (5 tickets)

### mc-26: Content list page
- Dashboard page + API listing content items from contentai workspace

### mc-27: Content detail + editor page
- MDX preview, meta info, QA status, hero image
- **Deps:** mc-26

### mc-28: Content publish action
- "Publish" button → calls contentai CLI
- **Deps:** mc-27

### mc-29: Content social scheduling
- Schedule UI → calls contentai social/schedule
- **Deps:** mc-27

### mc-30: Content hero image preview
- Show + regenerate hero images
- **Deps:** mc-27

---

## Phase 6: Infrastructure + Monitoring (5 tickets)

### mc-31: System health dashboard
- Admin page: RAM, CPU, disk, services status

### mc-32: Application logs viewer
- Last 100 events, filter, search, auto-refresh
- **Deps:** mc-01

### mc-33: Deployment status panel
- Git SHA, deploy time, environment badge
- **Deps:** mc-01

### mc-34: Error tracking + alerts
- 5xx counting middleware, threshold alerts

### mc-35: Database stats panel
- Table row counts, DB size, connection pool
- **Deps:** mc-31

---

## Phase 7: VPS Migration Tooling (4 tickets)

### mc-36: Migration config schema
- Zod schema: source/target VPS, services, DNS

### mc-37: Migration pre-flight check API
- Verify target VPS SSH, disk, packages
- **Deps:** mc-36

### mc-38: Migration data export
- DB dump, workspace files, env vars manifest
- **Deps:** mc-36

### mc-39: Migration UI wizard
- Configure → Pre-flight → Export → Verify
- **Deps:** mc-37, mc-38

---

## Phase 8: Polish + Integration (5 tickets, all parallel)

### mc-40: Dashboard home redesign
- Cards: agents, usage, tasks, activity. Quick actions.

### mc-41: Mobile responsive pass
- Audit all pages at 375/768/1024px

### mc-42: API rate limiting
- In-memory sliding window, 429 + Retry-After

### mc-43: E2E smoke tests
- Playwright: home, signin, dashboard, API health

### mc-44: README + deployment docs
- Setup instructions, env vars, architecture, deployment guide

---

## Stats
- **44 tickets** across 8 phases
- **~5-10 min per agent** (small, focused scope)
- **Max parallelism:** 6 agents per phase
- **Estimated wall-clock:** ~2-3 hours with 4 concurrent agents
