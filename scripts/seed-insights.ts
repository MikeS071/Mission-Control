/**
 * Seed script: insert sample Insights articles into the DB.
 * Run once: npx tsx scripts/seed-insights.ts
 *
 * Uses DATABASE_URL from .env.local (loaded via dotenv).
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { insights } from '../src/db/schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const articles = [
  {
    slug: 'why-llm-routing-matters',
    title: 'Why LLM Routing Matters More Than Model Selection',
    description:
      'Choosing the right model for every task — not just the biggest one — is the key to sustainable AI operations. Here\'s how intelligent routing cuts costs without sacrificing quality.',
    contentMd: `# Why LLM Routing Matters More Than Model Selection

When teams first adopt LLMs they often pick a single flagship model — Claude Opus, GPT-4o — and route everything through it. It feels safe. The model is capable, the results are good.

But this approach is expensive and brittle.

## The Hidden Cost of One-Size-Fits-All

A simple task like extracting a date from a user message doesn't need a 200B-parameter model. It needs a fast, cheap inference call. Routing that through Opus or GPT-4o is the equivalent of hiring a senior architect to fix a typo.

**The math is stark:**
- Flagship models cost $15–$75 per million output tokens
- Smaller, task-specific models cost $0.10–$2 per million output tokens
- That's a 10–100× cost difference for equivalent task quality

## What Intelligent Routing Looks Like

AiPipe — our LLM router built into Mission Control — classifies each inference request by:

1. **Task complexity** — is this a short retrieval, a reasoning chain, or a multi-step plan?
2. **Context size** — how many tokens is the prompt?
3. **Latency budget** — does the agent need a sub-second reply or is async fine?
4. **Quality floor** — what's the minimum acceptable output quality for this task type?

Based on these signals it routes to the optimal provider: Anthropic, OpenAI, Gemini, or a locally-hosted model via Ollama.

## Savings in Practice

Teams using AiPipe report 25–40% reduction in monthly LLM spend within the first 30 days — without changing a single agent prompt.

The saved budget gets redirected to higher-value inference: deeper research tasks, longer context windows, and multi-agent planning chains.

## Start Routing Today

Mission Control's AiPipe integration is available on all plans. Connect your provider keys in Settings → LLM Router and let the router take over.

The best model is the right model at the right time — not the biggest one.
`,
    publishedAt: new Date('2025-12-15T09:00:00Z'),
  },
  {
    slug: 'multi-agent-ops-lessons',
    title: '5 Lessons from Running Multi-Agent Systems in Production',
    description:
      'After months of running OpenClaw in production across multiple teams, we\'ve learned what breaks, what scales, and what operators actually need to stay sane.',
    contentMd: `# 5 Lessons from Running Multi-Agent Systems in Production

Running a single AI agent is manageable. Running 10 concurrently — each with memory, tool calls, and cross-agent dependencies — is a different discipline entirely.

Here's what we've learned running Mission Control in production.

## 1. Observability Comes First

Before you scale to multiple agents, instrument everything. You need to know:

- Which agent fired which tool call
- How long each step took
- Where the token budget went
- What failed and why

Mission Control's activity feed gives you a per-task timeline with agent attribution. Without this, debugging a 10-agent system is guesswork.

## 2. Heartbeats Are Non-Negotiable

Agents silently stop. It happens more than you'd expect — network partitions, process crashes, memory exhaustion. If you don't have a heartbeat mechanism you won't know until a user complains.

The OpenClaw Gateway sends a heartbeat every 60 seconds. Mission Control monitors it and alerts via Telegram if it goes stale. This has caught dozens of silent failures before they became incidents.

## 3. Token Budgets Prevent Runaway Costs

Without a monthly token ceiling, a single poorly-prompted agent in a loop can blow your monthly budget in hours. Set per-tenant token limits. Alert at 80%. Hard-stop at 100%.

We ship this as a configurable setting in Mission Control: \`tokenLimitMonthly\` in tenant settings.

## 4. Sub-Agent Names Matter for Debugging

When 10 agents are running and something fails, "Agent 7" is useless. Mission Control assigns deterministic human-readable names (Navi, Kira, Ryzen, etc.) so logs and activity feeds are immediately understandable.

## 5. Separate Orchestration from Execution

The agent that plans shouldn't also be the agent that writes code. Separation of concerns makes each agent simpler, cheaper to run, and easier to replace or upgrade.

Mission Control models this with role assignments: architect, planner, codeAgent, reviewer. Each has its own model setting and prompt scope.

---

Running agents in production is an ops discipline. Treat it like one.
`,
    publishedAt: new Date('2026-01-08T09:00:00Z'),
  },
  {
    slug: 'mission-control-v2-release',
    title: 'Mission Control v2: Billing, Insights, Gamification & More',
    description:
      'The biggest release yet: Stripe subscription billing, a public Insights blog, XP & streaks gamification, multi-tenancy improvements, and a new Kamal-based deploy pipeline.',
    contentMd: `# Mission Control v2: What's New

Mission Control v2 is the biggest release since the initial launch. Here's what shipped.

## Stripe Subscription Billing

Teams can now subscribe to Strategos ($39/mo) or Archon ($99/mo) directly from the dashboard. The billing portal handles plan changes, seat management, and invoice history.

We're on Stripe test keys for now — live keys roll out in the next sprint.

## Insights Blog

You're reading it right now. The Insights section is built directly into Mission Control — no external CMS, no third-party dependency. Articles are stored in the DB and rendered with full MDX support.

We'll publish weekly articles on AI agent coordination, routing patterns, and product updates.

## Gamification: XP, Streaks, and Challenges

The Archon tier now includes gamification mechanics:

- **XP Ledger** — earn points for completing tasks, maintaining streaks, and shipping
- **Streaks** — consecutive-day activity tracking with longest-streak records
- **Challenges** — time-boxed goals with XP rewards
- **Leaderboard** — per-tenant ranking

It's a small thing that makes daily agent ops feel like progress rather than maintenance.

## Kamal Deploy Pipeline

We replaced Coolify with a Kamal + GitHub Actions pipeline. Pushes to \`main\` trigger a workflow dispatch that builds, tests, and deploys to the production server in under 3 minutes.

## AiPipe LLM Router (GA)

AiPipe is now generally available. Connect your provider keys in Settings and let the router handle model selection based on task complexity and cost.

---

The v2 release closes out Goal 6 of the Archon ops roadmap. Goal 7 — real-time chat with agent routing — is next.
`,
    publishedAt: new Date('2026-02-01T09:00:00Z'),
  },
];

async function seed() {
  console.log('Seeding insights...');
  for (const article of articles) {
    try {
      const [inserted] = await db
        .insert(insights)
        .values(article)
        .onConflictDoNothing({ target: insights.slug })
        .returning({ id: insights.id, slug: insights.slug });
      if (inserted) {
        console.log(`  ✓ Inserted: ${inserted.slug} (id=${inserted.id})`);
      } else {
        console.log(`  ~ Skipped (already exists): ${article.slug}`);
      }
    } catch (err) {
      console.error(`  ✗ Failed to insert ${article.slug}:`, err);
    }
  }
  console.log('Done.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
