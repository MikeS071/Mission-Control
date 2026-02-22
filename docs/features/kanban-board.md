---
title: "Kanban Board"
description: "Kanban task board with drag-and-drop columns, agent triggers, and real-time status updates."
---

# Kanban Board

The kanban board is the core of Mission Control. It gives you and your agents a shared view of all work, what's pending, in progress, under review, and done.

---

## Columns and statuses

Tasks flow left to right through four columns:

| Column | Meaning |
|--------|---------|
| **Backlog** | Defined but not yet started |
| **In Progress** | Actively being worked on |
| **Review** | Work complete, awaiting human or automated review |
| **Done** | Completed and accepted |

Drag cards between columns or use the card menu (⋯ → Move to…).

---

## WIP limits

Each column has a work-in-progress limit. When a column is at capacity:
- The column header turns amber
- Dragging a new card into it is blocked
- You must move or close an existing task first

WIP limits are intentional friction. They prevent the board from becoming a dumping ground and keep focus on finishing over starting.

**Default limits:** Backlog (unlimited) · In Progress (3) · Review (3) · Done (unlimited)

Adjust limits in board settings.

---

## Task cards

Each card shows:
- **Title**: truncated to two lines; full title on hover
- **Priority badge**: colour-coded: 🔴 Critical, 🟠 High, 🟡 Medium, ⚪ Low
- **Goal tag**: the project goal this task belongs to
- **Agent avatar**: which agent owns this task (if assigned)
- **Labels**: custom colour-tagged labels
- **Activity indicator**: pulse animation when a task was recently updated

---

## Creating tasks

### From the board
Click **+** in any column header, or press `N` anywhere on the dashboard. The new task modal opens pre-filled with the column's status.

### From the API
Agents and external tools can create tasks via the REST API:

```bash
curl -X POST https://archonhq.ai/api/tasks \
  -H "Authorization: Bearer <your-api-secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement rate limiting",
    "priority": "high",
    "status": "backlog",
    "goal": "goal-api-hardening",
    "agent": "code-agent"
  }'
```

Tasks created via API appear on the board immediately (no refresh needed, the board polls every 30 seconds).

---

## Filtering

The filter bar above the board lets you narrow the view:

| Filter | Options |
|--------|---------|
| **Search** | Full-text match on title and description |
| **Priority** | Critical, High, Medium, Low |
| **Goal** | Any configured goal |
| **Agent** | Any agent name |
| **Labels** | One or more labels |

Filters combine with AND logic. Active filters are shown as chips, click × on any chip to remove it.

---

## Task detail

Click any card to open the detail panel (slides in from the right without navigating away).

### Fields
All fields are editable inline. Changes save automatically on blur.

| Field | Notes |
|-------|-------|
| Title | Plain text |
| Description | Markdown, rendered in read mode, raw in edit mode |
| Status | Dropdown, changes reflected on board immediately |
| Priority | Critical / High / Medium / Low |
| Goal | Links to a project goal |
| Agent | Assigns ownership |
| Labels | Multi-select, colour-coded |

### Activity timeline
Below the fields, a full chronological log of every event on this card:
- Status changes (who changed it, when)
- Field edits (what changed)
- Comments
- API-sourced updates (agent name)

The timeline is append-only and cannot be edited.

---

## Labels

Labels are free-form tags with colour coding. Create any label you need:
- `bug` (red)
- `feature` (blue)
- `blocked` (orange)
- `sprint-1` (purple)

Labels are workspace-scoped, create them once, use them on any task.

---

## Drag and drop

Cards can be dragged between columns and reordered within a column. The board uses optimistic updates, the move happens visually immediately, and the API call confirms in the background.

If the API call fails (network issue, WIP limit violation), the card snaps back to its original position and a toast notification explains why.

---

## Collapsing columns

Click the column header chevron to collapse a column to a slim indicator strip. Useful when you want to hide Done or focus on In Progress only. Collapse state persists in your browser.

---

## API access

Full CRUD is available via the REST API. See [API Reference: Tasks →](/docs/api-reference/tasks)
