# Mission Control Docs System — Proposal

## Recommendation: Mintlify (fast path) → Fumadocs (long term)

### The two real options

---

### Option A: Mintlify — ship today, zero infra

[mintlify.com](https://mintlify.com)

Mintlify syncs directly from a GitHub folder (`/docs`), hosts at a custom subdomain (`docs.archonhq.ai`), and generates a beautiful, searchable docs site with no build step on our end.

**Pros:**
- Live in under an hour — point it at the repo, set up `docs.archonhq.ai` CNAME, done
- Beautiful out-of-the-box — used by Linear, Resend, Loops, Anthropic
- Built-in AI search (asks questions, gets answers from your docs)
- Analytics: page views, search queries, 404s
- Free tier: unlimited pages, custom domain, GitHub sync
- Zero maintenance on our side — Mintlify handles hosting, CDN, search indexing
- `mint.json` config file in the repo controls nav, colours, logo

**Cons:**
- External dependency — if Mintlify goes down, docs go down
- Less integrated with the MC dashboard UI (separate site, not `/docs` on archonhq.ai)
- AI search requires paid plan ($80/mo) for high volume

**Verdict: fastest path to polished public docs. Recommended for Phase 1.**

---

### Option B: Fumadocs — built into MC, matches design system

[fumadocs.vercel.app](https://fumadocs.vercel.app)

Fumadocs is a Next.js docs framework built on shadcn/ui and Radix. It reads from the existing `/docs` folder, renders at `/docs` on archonhq.ai, and looks identical to the rest of the dashboard.

**Pros:**
- Served at `archonhq.ai/docs` — one domain, one codebase, one deploy
- Matches MC's existing shadcn/ui design system exactly
- Full-text search via Orama (built-in, free, no external dependency)
- MDX support — React components inside docs (live API playgrounds possible)
- No external service — zero monthly cost, no vendor lock-in
- Can embed live MC components (e.g. a live routing demo) inside docs pages

**Cons:**
- 2–4 hours of setup (install Fumadocs, configure file-system routing, wire nav)
- Search indexing must be rebuilt on each deploy (automated via Coolify)
- More maintenance if Fumadocs API changes

**Verdict: right long-term home. Do this in Phase 2 once content is stable.**

---

### Option C: Docusaurus — not recommended

Meta's OSS docs framework. Excellent, but React-based with its own design system. Would look different from MC and require building a custom theme to match. Too much work for the return.

---

### Option D: GitBook — not recommended

Nice UI but lacks MDX, has limited customisation, and the GitHub sync workflow is less clean than Mintlify.

---

## Recommended Path

| Phase | What | Timeline |
|-------|------|---------|
| **1 (now)** | Set up Mintlify, point at `/docs` in repo, configure `docs.archonhq.ai` | 1–2h |
| **2 (next sprint)** | Migrate to Fumadocs at `archonhq.ai/docs`, add search + nav | 4–6h |
| **3 (later)** | Add MDX components: live routing demo, API playground, cost calculator | ongoing |

---

## Mintlify Quick-Start

1. Sign up at mintlify.com, connect `MikeS071/Mission-Control` repo
2. Add `mint.json` to `/docs` folder (see template below)
3. Add CNAME: `docs.archonhq.ai → mintlify.app` (or use Cloudflare proxied)
4. Done — Mintlify auto-deploys on every push to main

### `mint.json` (starter config)

```json
{
  "name": "Mission Control",
  "logo": { "light": "/public/logo.png", "dark": "/public/logo-dark.png" },
  "favicon": "/public/favicon.ico",
  "colors": { "primary": "#6366f1", "light": "#818cf8", "dark": "#4f46e5" },
  "topbarLinks": [{ "name": "Dashboard", "url": "https://archonhq.ai" }],
  "topbarCtaButton": { "name": "Get Started", "url": "https://archonhq.ai" },
  "tabs": [
    { "name": "Guides", "url": "guides" },
    { "name": "Features", "url": "features" },
    { "name": "API Reference", "url": "api-reference" }
  ],
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["guides/introduction", "guides/getting-started", "guides/how-to-use"]
    },
    {
      "group": "Features",
      "pages": [
        "features/kanban-board",
        "features/ai-routing",
        "features/aipipe-routing-benchmark",
        "features/connection-wizard",
        "features/notifications",
        "features/billing",
        "features/workspace-files",
        "features/agent-stats"
      ]
    },
    {
      "group": "API Reference",
      "pages": ["api-reference/overview", "api-reference/tasks", "api-reference/events", "api-reference/settings"]
    },
    {
      "group": "Self-Hosting",
      "pages": ["guides/self-hosting", "guides/configuration"]
    }
  ],
  "footerSocials": { "github": "https://github.com/MikeS071/Mission-Control" }
}
```

---

## Content Checklist

All files in `/docs` — mapped to Mintlify navigation above.

### Guides (user-facing)
- [x] `guides/introduction.md` — what MC is, who it's for
- [ ] `guides/getting-started.md` — create account, connect gateway, first task
- [ ] `guides/how-to-use.md` — day-to-day workflow overview
- [ ] `guides/self-hosting.md` — Docker, env vars, Postgres, gateway
- [ ] `guides/configuration.md` — all environment variables reference

### Features (deep-dives)
- [ ] `features/kanban-board.md` — user guide
- [x] `features/aipipe-routing-benchmark.md` — routing benchmark (done)
- [ ] `features/ai-routing.md` — simple user-facing AiPipe guide
- [ ] `features/connection-wizard.md` — step-by-step wizard walkthrough
- [ ] `features/notifications.md` — Telegram setup and alerts
- [ ] `features/billing.md` — plans, Stripe, upgrade/downgrade
- [ ] `features/workspace-files.md` — file upload, tenant isolation
- [x] `features/agent-stats.md` — internal (already exists)

### API Reference
- [ ] `api-reference/overview.md` — auth, base URL, rate limits
- [ ] `api-reference/tasks.md` — CRUD endpoints
- [ ] `api-reference/events.md` — event log endpoints
- [ ] `api-reference/settings.md` — settings read/write
