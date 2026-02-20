# Kanban Board

**Added:** 2026-02-20
**Tier:** All plans

## Overview
The Kanban Board is the main operating surface in Mission Control. It lets you create, organize, and complete goals in three columns (Todo, In Progress, Done), with drag-and-drop updates, inline priority controls, and per-card metadata such as tags, assigned agent, and checklist state.

The board is designed for active operations: it combines task editing, lightweight workflow controls (blocked / needs-you flags), and card history so teams can move work without leaving the dashboard.

## How to use

### Step 1 — Open the Kanban tab
Go to **Dashboard → Kanban**.

### Step 2 — Create a goal card
Use the **+** button in Todo or In Progress. Fill in title, description, tags, priority, optional parent goal, and checklist items.

### Step 3 — Move work across columns
Drag cards between **Todo**, **In Progress**, and **Done**. If you move a card to Done with incomplete checklist items, the UI asks for confirmation.

### Step 4 — Update cards inline
On each card you can:
- change priority,
- toggle **Blocked**,
- toggle **Needs you** (human intervention),
- open **History** to view related events.

### Step 5 — Filter and tune board behavior
Use search and filters (priority, goal, agent, tag) at the top. You can also:
- rename column labels,
- collapse columns,
- set per-column WIP limits.

## Key concepts
- **Goal ID**: Auto-generated identifier (for example `G001`) used for tracking.
- **Blocked / Needs you**: Tag-driven state flags to surface work needing attention.
- **WIP limit**: Optional cap per column; over-limit columns are visually highlighted.
- **Checklist completion guard**: Confirmation prompt when moving incomplete work to Done.

## Limitations
- Real-time updates are SSE with server polling every 5 seconds, not instant push from DB triggers.
- Column labels, collapse state, and WIP limits are browser-local (saved in localStorage).
- Task deletion is immediate from the edit dialog; there is no recycle bin/undo in the UI.