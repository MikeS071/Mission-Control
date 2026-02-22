---
title: "Activity Feed"
description: "Chronological audit log of system and task events, available as a dashboard tab and per-card history."
---

# Activity Feed

## Overview
Activity Feed gives a chronological view of system and task activity so teams can audit what changed and when. It is available as a dedicated dashboard tab and also appears as per-card history inside the Kanban board.

Each event shows relative time, exact timestamp, actor (`agentName` or `system`), event type, task title, and optional payload details.

## How to use

### Step 1: Open Activity tab
Go to **Dashboard → Activity** to see the most recent events.

### Step 2: Read timeline entries
Each entry includes:
- timestamp,
- task context,
- event type badge,
- source actor badge,
- payload text when available.

### Step 3: Inspect a single card timeline
In Kanban, open a card and click **History** to load only that card’s events.

## Key concepts
- **Event type**: Common values include `created`, `status_change`, `deleted`, `comment`.
- **System vs agent activity**: Events may come from system automation or named agents.
- **Per-card timeline**: Filtered event view for a specific task (`taskId`).

## Limitations
- Feed refreshes on polling intervals (30s in Activity tab), not real-time event streaming.
- Event types are open text values; the UI colors known values and falls back for unknown types.
- Payload content is plain text and may require conventions for richer audit detail.