---
title: "How to Use ArchonHQ"
description: "Day-to-day usage guide for managing agents, tasks, and AI routing in ArchonHQ."
---

# How to Use ArchonHQ

A practical guide to the daily workflow, managing tasks, working with agents, monitoring costs, and keeping work moving.

## The dashboard layout

The main dashboard has four areas:

**Kanban board (centre)**: your work, organised into columns: Backlog → In Progress → Review → Done. Tasks move left to right as work progresses.

**Activity feed (right panel)**: a real-time log of every task mutation, agent action, and system event. Collapse it with the arrow if you need more board space.

**Agent sidebar**: shows connected agents, their current status, and session cost. Appears when agents are active.

**Top nav**: search, filters, notifications, and settings.

## Managing tasks

### Creating tasks

Press `N` or click the **+** button in any column. Every task has:

- **Title**: required
- **Priority**: Critical, High, Medium, Low
- **Goal**: links the task to a project goal for filtering
- **Agent**: assigns ownership to a specific agent
- **Labels**: free-form tags for custom filtering
- **Description**: markdown-supported notes

### Moving tasks

Drag cards between columns. The board enforces WIP limits, if a column is at capacity, it highlights and blocks the drop. Adjust WIP limits in board settings.

The four columns and their meaning:
- **Backlog** — work not yet started; default landing zone for new tasks
- **In Progress** — actively being worked on by an agent or human
- **Review** — card is complete and awaiting human sign-off before closing
- **Done** — work accepted and closed

You can also change status from the card menu (⋯) without dragging.

### Filtering and search

Use the filter bar above the board to narrow by:
- Search text (matches title + description)
- Priority
- Goal
- Assigned agent
- Labels

Filters combine with AND logic. Clear all filters with the × button.

### Task detail and timeline

Click any card to open its detail view. You'll see:
- Full description (editable)
- Complete activity timeline, every status change, edit, and comment with timestamps
- Assigned agent and goal
- Creation and last-modified dates

## Working with agents

### Viewing active agents

The **Agents** tab shows all agents currently connected via the gateway. For each agent:
- Current status (idle, working, blocked)
- Session start time
- Token usage and estimated cost for the session
- Last action

### Agent cost tracking

The **Agents** tab includes a cost chart. Costs are reported by agents when they complete API calls. If you're using AiPipe, costs are tracked per model and visible in the Router tab.

### The Router tab

Shows AiPipe routing statistics:
- Requests per provider (OpenAI, Anthropic, etc.)
- Model distribution, what percentage of requests went to each model
- Total cost and per-model cost breakdown
- Success rate per provider
- Queue depth (real-time)

Use this to understand where your LLM spend is going and whether routing is working as expected.

## Monitoring activity

### Activity feed

Every event that happens in your workspace is logged in the activity feed:
- Task created / updated / moved / deleted
- Agent connected / disconnected
- Comments added
- API calls made

Events are timestamped and attributed (agent name or "you").

### Roadmap view

The **Roadmap** tab shows your goals and the tasks attached to them. Drag tasks between goals or mark goals as delivered.

## Keyboard shortcuts

| Action | Shortcut |
|--------|---------|
| New task | `N` |
| Search | `/` |
| Close modal | `Esc` |
| Move task left | `←` (on focused card) |
| Move task right | `→` (on focused card) |

## Tips

**Keep WIP tight.** The default WIP limit is 3 per column. Resist the urge to raise it, it's there to prevent context-switching overload.

**Use goals for filtering.** If you're running multiple projects, assign every task to a goal. The goal filter makes it trivial to switch context between projects.

**Let agents create their own tasks.** Agents with API access can POST to `/api/tasks` directly. You review what they've created on the board rather than micromanaging their backlog.

**Check the Router tab weekly.** If most of your requests are going to `gpt-4o` for simple tasks, it means some agents aren't sending enough context for the scorer to classify correctly. A short system prompt describing task complexity helps routing accuracy.

## Next steps

- [Kanban board reference →](/docs/features/kanban-board)
- [AiPipe routing guide →](/docs/features/ai-routing)
- [Set up notifications →](/docs/features/notifications)
- [API reference →](/docs/api-reference/overview)
