---
title: "Agent Stats"
description: "Per-agent token usage and cost tracking with dashboard visualisation and Kanban summary tiles."
---

# Agent Stats

## Overview
Agent Stats tracks token usage and estimated cost per agent, then visualizes that data in the Dashboard **Agents** tab and summary tiles inside Kanban.

It helps operators understand where token spend is coming from, which agents are active, and how close usage is to configured token limits.

## How to use

### Step 1: Record usage
Send usage records to `POST /api/agent-stats` with `agentName` and optional token/cost values.

### Step 2: View trends in dashboard
Open **Dashboard → Agents** to see the per-agent bar/line chart.

### Step 3: Monitor execution context in Kanban
Kanban top tiles use summary metrics derived from agent stats (tokens, cost, saved estimate, active agents).

## Key concepts
- **Latest-per-agent snapshot**: Chart fetches most recent stat row per agent.
- **Active agents**: Distinct agents with activity in the last 24 hours.
- **Saved via routing**: Estimated savings derived from configured savings rate.
- **Token limit utilization**: Percent of configured monthly token budget.

## Limitations
- Cost values are accepted as provided (`costUsd` string); no strict currency normalization.
- Dashboard chart shows latest datapoint per agent, not full historical series.
- Accuracy depends on external systems posting usage consistently.