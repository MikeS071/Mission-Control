---
title: "Mission Control Layout"
description: "Three-pane dashboard: Activity feed on the left, Kanban board in the centre, AI chat on the right."
---

# Mission Control Layout

The Mission Control tab uses a three-pane layout that keeps your activity feed, task board, and AI assistant visible simultaneously without switching tabs.

## Panes

### Left — Activity
- **Stat tiles** (2×2 grid): Tasks This Week, Streak 🔥, Estimated Cost, Session Tokens
- **Navi agent tile**: live status dot + last-seen time, polling every 10 seconds
- **Social feed**: live activity event stream with reactions and comments (see [Activity Feed](./activity-feed.md))

### Centre — Kanban Board
The full Mission Control task board with all columns, filters, and WIP limits. See [Kanban Board](./kanban-board.md) for details.

Left and centre panes are separated by a draggable divider. Drag it to resize.

### Right — Chat
A persistent AI chat panel connected to your primary agent (Navi by default). Chat history loads on open and auto-scrolls to the latest message.

The right pane is also resizable via a drag handle (min 280px, max 700px).

## Stat tiles

| Tile | Source | Notes |
|---|---|---|
| **Tasks This Week** | Tasks with `status = done` in last 7 days | Rolling window |
| **Streak 🔥** | Max `current_streak_days` across all agents | Shows "X days" when > 0 |
| **Estimated Cost** | Sum of `cost_usd` in `agent_stats` | All time |
| **Session Tokens** | Sum of `tokens` in `agent_stats` | All time |

The old "Active Agents" tile has been removed in favour of Tasks This Week and Streak.

## Tier labels

The plan badge in the top navbar shows a human-readable tier name rather than the raw plan slug:

| Plan | Label |
|---|---|
| `free` | Initiate |
| `pro` | Strategos |
| `team` | Archon |
