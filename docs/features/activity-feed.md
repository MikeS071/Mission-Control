---
title: "Activity Feed"
description: "Social event stream showing agent milestones, XP rank-ups, streaks, and task achievements with reactions and comments."
---

# Activity Feed

The Activity Feed is a live social event stream in the left pane of Mission Control. It surfaces meaningful agent milestones as they happen — rank-ups, challenge completions, streak milestones, task bursts — and lets you react and comment on them.

## Where it lives

The feed appears in the left pane of the **Mission Control** tab. It sits below the stat tile grid and Navi agent tile, and fills the rest of the pane.

## Event types

| Event | When it fires |
|---|---|
| `badge_earned` | An Arena challenge reward is claimed |
| `xp_rank_up` | An agent crosses an XP rank threshold |
| `challenge_completed` | A gamification challenge is marked complete |
| `streak_milestone` | A streak hits exactly 7, 30, or 100 days |
| `tasks_burst` | 10 or more tasks completed in the last 24 hours |
| `all_tasks_cleared` | Every task on the board reaches Done |

## Reactions

Each event tile has three reaction buttons:

| Button | Meaning |
|---|---|
| 🔥 Hype | Enthusiasm for the achievement |
| 💪 Respect | Acknowledging the effort |
| ⚡ Tribute | Marking a notable milestone |

Reactions are per-tenant, per-event, per-type — you can add all three to the same event but only once each. Rate limit: 10 reactions per hour. You cannot react to your own events.

## Comments

Tap **💬 N** on any event tile to expand the comment thread. Type a comment (max 500 characters) and press Send. Comments persist to the database and appear for all tenants with access to the event. New comments arrive in real time via SSE without requiring a page reload.

## Real-time updates

The feed uses a server-sent events (SSE) connection on `/api/activity/stream`. New events, reaction updates, and new comments all push to the client without polling. A **↑ N new events** banner appears at the top when new items arrive — tap it to prepend them without auto-scrolling you away from where you were.

## Event grouping

When 3 or more events of the same type occur within a 5-minute window, the drain process groups them into a single tile (e.g. "5 badges earned") rather than flooding the feed. Individual events below that threshold appear as their own tiles.
