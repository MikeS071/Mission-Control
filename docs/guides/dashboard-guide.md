---
title: "Mission Control: Dashboard Guide"
description: "Tour of the Mission Control dashboard — all tabs, panels, and features explained."
---

# Mission Control: Dashboard Guide

_Last updated: 2026-02-19_

## What this does

The dashboard is a 3-pane resizable layout:

```
[ Agent Team ] | [ Kanban + Filters ] | [ Chat ]
```

Drag either divider to resize panes to suit your workflow.

## Agent Team Panel (left)

Shows your primary agent (Navi by default) and any active sub-agents. Each tile displays:
- **Name**: primary agent uses your configured `primaryAgentName`; sub-agents get fun short names (Spark, Pixel, Drift, …) assigned deterministically
- **Status**: Active (green) / Idle (yellow) / Offline (grey) with animated activity lights
- **Last seen**: how long ago the agent was active

Configure `primaryAgentName` via Settings API (`PATCH /api/settings`).

## Kanban Board (middle)

Three columns: **Todo → In Progress → Done**

### Cards
- **Drag** cards between columns
- **Click** a card to edit title, description, tags, priority, checklist
- **Spinning bot icon** (top-right) = agent is actively working this card
- **Priority selector** inline on the card, no need to open the edit dialog
- **Checklist progress** shown as `X/Y` badge

### Blocked labels
Two quick-toggle buttons on every card:
- **⚠️ Blocked**: marks the card with a red glow and `BLOCKED` badge
- **↗ Needs you**: marks with `NEEDS YOU` badge, escalates to human

Tags `blocked` / `needs-human` are stored in the existing tags field, no schema migration needed.

### Column controls
- **▾ / ▸**: collapse / expand a column
- **✏️**: rename the column label (saved to localStorage)
- **⚙️**: set a WIP limit (amber warning when exceeded)
- **+**: add a card directly into that column

### Filters
Compact filter bar above the board: search, priority, goal, agent, tag. Active filters dim hidden cards and show a count. **✕ Clear** resets all.

## Stat Tiles (top)

| Tile | Source |
|------|--------|
| Session Tokens | Cumulative from `agent_stats` |
| Estimated Cost | Sum of `agent_stats.cost_usd` |
| Saved via Routing | `cost × savingsRatePct` (default 30%) |
| Active Agents | Count from `/api/agents/active` |
| % Complete | Done tasks ÷ total tasks |

Configure `savingsRatePct` and `tokenLimitMonthly` via Settings API.  
When `tokenLimitMonthly` is set, the Tokens tile shows `X% of limit` as a sub-label.

## Chat Pane (right)

Single-agent chat with your primary agent (Navi).

- **Thread sidebar** (narrow, left side of chat pane), switch between topic threads
- **+** at the bottom of the sidebar, start a new thread
- **Input** is always pinned to the bottom, scrolls messages above it
- Title bar shows `Navi · <thread name>` so you always know context

> Chat connects to the OpenClaw gateway via real-time SSE. Messages are stored per tenant and displayed chronologically.

## Settings API

`GET /api/settings`, fetch current tenant settings  
`PATCH /api/settings`, update any of:

```json
{
  "primaryAgentName": "Navi",
  "savingsRatePct": 30,
  "tokenLimitMonthly": 5000000
}
```

All fields optional; partial updates supported.

## Gateway Indicator

The green dot in the nav bar reflects live gateway connectivity (polls `/api/gateway` every 30s). Red = no connected gateway sessions.
