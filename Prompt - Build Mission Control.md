You are my expert full-stack dev agent. Enhance self-hosted "Mission Control" dashboard for OpenClaw in ~/projects/openclaw-mission-control: Next.js 14+ App Router, TypeScript, Tailwind, shadcn/ui.

Features summary:
- Dark mode
- Proxy OpenClaw gateway (http://127.0.0.1:18789 or env) for status/sessions/logs
- Tabs/sections: Status, Sessions table, Logs feed, Kanban board, Workspace Files
- Kanban: Columns (Backlog → Assigned → In Progress → Review → Done); cards (title, desc, agent, priority); drag-drop (@hello-pangea/dnd) w/ auto-scroll; persist to Postgres
- Workspace Files: List .md in workspace dir; edit w/ @uiw/react-md-editor; save to disk
- Real-time tasks: SSE (/api/tasks/stream) pushes updates to Kanban; fallback 5-10s polling
- Database: Locally hosted PostgreSQL via Docker Compose; use Drizzle ORM for tasks table (id, title, desc, status, agent, priority, created/updated timestamps); migrate schema, CRUD ops

Steps — execute sequentially, report progress:

1. Init if needed: create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"; shadcn-ui init; add card button table badge dialog tabs accordion toast
2. Install deps: npm i @hello-pangea/dnd @uiw/react-md-editor drizzle-orm pg drizzle-kit
3. Add Docker Compose: Create docker-compose.yml at root with Postgres service (image: postgres:16, env POSTGRES_USER=mc_user, POSTGRES_PASSWORD=mc_pass, POSTGRES_DB=mission_control, ports:5432:5432, volume for data); add depends_on for web if containerizing app later
4. Env setup: Add .env.local with DATABASE_URL=postgresql://mc_user:mc_pass@localhost:5432/mission_control?sslmode=disable
5. Drizzle setup: Create drizzle.config.ts (dialect: postgresql, schema: ./src/db/schema.ts, out: ./drizzle/migrations); define tasks table in schema.ts; add scripts: "migrate": "drizzle-kit generate && drizzle-kit push", "studio": "drizzle-kit studio"
6. DB connection: lib/db.ts → drizzle(pg.Pool({ connectionString: process.env.DATABASE_URL }))
7. API routes:
   - /api/gateway/[...]/route.ts (proxy)
   - /api/tasks/route.ts (CRUD w/ Drizzle: get all, create, update status, delete)
   - /api/tasks/stream/route.ts (SSE: poll DB every 5s or use change detection; send JSON updates)
   - /api/workspace/files & /api/workspace/file (fs-based .md)
8. Components:
   - KanbanBoard.tsx: Fetch tasks via API/SWR or fetch; EventSource for SSE → live refresh; onDragEnd update via API (optimistic)
   - FileExplorer.tsx + MdEditor.tsx (as before)
9. Migrate & seed: Run npm run migrate; optional seed script for sample tasks
10. Final: git commit "Mission Control: Add local Postgres + Drizzle for tasks + real-time SSE"; npm run dev (start docker-compose up -d first); confirm http://localhost:3000

Focus tightly. Use best practices: server actions/routes for DB, client interactive parts, relative paths. If Docker not installed/blocked, suggest manual Postgres install + pg CLI. If path/token/perms/SSE/DB connect fails, ask specifically.

Build it — upgrade to real DB persistence! 🦞🗄️