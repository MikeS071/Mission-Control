---
title: "Introduction to ArchonHQ"
description: "What ArchonHQ is, who it's for, and how it fits into an agentic AI workflow."
---

# Introduction to ArchonHQ

ArchonHQ is an AI agent coordination dashboard. One place to manage tasks, track what your agents are doing, monitor costs, and keep work moving without constant manual intervention.

It was built for engineering teams and solo founders who run AI agents as part of their workflow and need more than a chat window to stay on top of it.

## What it does

### Task and project management
A full kanban board with drag-and-drop, priority levels, WIP limits, custom labels, and per-card activity timelines. Every status change, comment, and transition is logged automatically so you always have a complete audit trail.

### AI agent coordination
Agents connect to ArchonHQ via the gateway. You can see which agents are active, what they're working on, and their cost and token usage in real time. Agents can create and update tasks directly via the API, keeping the board in sync with actual work.

### Smart LLM routing (AiPipe)
Every AI call made through ArchonHQ goes through AiPipe, a smart routing layer that selects the right model for each request. Simple queries go to cheap fast models. Complex reasoning goes to frontier models. You get better outcomes at lower cost. No per-request configuration needed. [Read the full benchmark →](/docs/features/aipipe-routing-benchmark)

### Notifications
ArchonHQ sends Telegram notifications when tasks are created, updated, or reach a critical state. You stay informed without watching a dashboard.

### Billing and plans
Two tiers: Strategos ($39/mo) for individuals and small teams, Archon ($99/mo) for larger teams. Stripe-powered, cancel any time.

## Who it's for

**AI-first engineering teams** running coding agents, research agents, or workflow automation and needing a central coordination layer.

**Solo founders and indie hackers** who run AI agents as part of their product development workflow and want visibility without overhead.

**Teams evaluating AI spend** who want to understand where their LLM costs are going and apply smart routing to reduce waste.

## How it's built

ArchonHQ is a Next.js 16 application backed by PostgreSQL. The AI routing proxy (AiPipe) is a Go binary that runs alongside the dashboard. The gateway connects your local AI agents to the cloud dashboard over a secure tunnel.

Everything is open source: [github.com/MikeS071/Mission-Control](https://github.com/MikeS071/Mission-Control)

## Start here

<Cards>
  <Card title="Get Started" href="/docs/guides/getting-started" description="Create your account and connect in under 10 minutes." />
  <Card title="Explore the Kanban Board" href="/docs/features/kanban-board" description="Drag-and-drop task management with WIP limits, labels, and activity timelines." />
  <Card title="Understanding AI Routing" href="/docs/features/ai-routing" description="How AiPipe scores requests and picks the right model to cut your LLM spend." />
</Cards>
