---
title: "Architecture"
---

# Architecture

## Overview

ArchonHQ is a Next.js app with server-side API routes and a Postgres-backed task model, built for multi-agent workloads.

Major runtime pieces:

1. Next.js UI (Status, Kanban, Workspace Files tabs)
2. API routes for gateway proxy, task CRUD/SSE, and workspace file operations
3. PostgreSQL via Drizzle ORM for task persistence
4. NextAuth Google login

## High-Level Flow

1. User signs in with Google.
2. Home page renders tabs:
   - Status (`GatewayStatus`)
   - Kanban (`KanbanBoard`)
   - Workspace Files (`FileExplorer`)
3. Kanban loads tasks from `/api/tasks` and subscribes to `/api/tasks/stream`.
4. File editor loads and saves markdown files through workspace APIs.
5. Status tab reads proxied gateway output from `/api/gateway/status`.

## Frontend Components

- `src/app/page.tsx`
  - Session gate + tab shell
- `src/components/GatewayStatus.tsx`
  - Fetches and displays gateway payload
- `src/components/KanbanBoard.tsx`
  - Drag-and-drop board with SSE refresh + optimistic status updates
- `src/components/FileExplorer.tsx`
  - Markdown file list + editor + save flow

## Backend/API Structure

- `src/app/api/tasks/route.ts`
  - Task CRUD via Drizzle
- `src/app/api/tasks/stream/route.ts`
  - SSE with periodic DB polling
- `src/app/api/gateway/[...path]/route.ts`
  - Gateway GET proxy
- `src/app/api/workspace/files/route.ts`
  - Markdown file list
- `src/app/api/workspace/file/route.ts`
  - Markdown file read/write
- `src/app/api/auth/[...nextauth]/route.ts`
  - NextAuth Google provider

## Data Model

`tasks` table (`src/db/schema.ts`):

- `id` serial primary key
- `title` text, required
- `description` text
- `status` text (`backlog|assigned|in_progress|review|done`)
- `agent` text
- `priority` text (`low|medium|high`)
- `createdAt` timestamp
- `updatedAt` timestamp

## Real-Time Strategy

Task updates are near-real-time through SSE:

- server pushes full task list every 5 seconds
- client replaces local state on message
- DnD updates are persisted through PATCH requests

This is simple and stable, but not event-delta efficient yet.

## Current Constraints

- No formal service-layer boundaries; logic lives mostly in route handlers/components.
- Workspace file APIs rely directly on local filesystem.
- Gateway proxy currently handles GET only.
- Legacy Google callback route is separate from standard NextAuth flow.
