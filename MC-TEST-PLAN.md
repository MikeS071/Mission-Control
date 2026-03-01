# MC Test Backfill Plan

Test framework: Jest + ts-jest, test dir: `src/__tests__/`
Existing: 6 suites, 39 tests (billing, crypto, streak, tenant, xp, arena-reactions)

## Tickets (20 tickets, ~3 days at 7 concurrent agents)

### Phase 1: Core lib (5 tickets, parallel)
- **tc-01**: Auth lib — `lib/auth.ts`, `lib/auth.config.ts`
- **tc-02**: Chat lib — `lib/chat-threads.ts`, `lib/chat-system.ts`, `lib/openclaw-chat.ts`
- **tc-03**: Gateway lib — `lib/gateway.ts`, `lib/openclaw-gateway-cli.ts`, `lib/ws-manager.ts`, `lib/openclaw-ws-client.ts`
- **tc-04**: AI lib — `lib/prd-ai.ts`, `lib/checklist-ai.ts`, `lib/kanbanTrigger.ts`
- **tc-05**: Util lib — `lib/utils.ts`, `lib/markdown.ts`, `lib/source.ts`, `lib/prd-files.ts`, `lib/telegram-ingress.ts`

### Phase 2: API routes — high priority (5 tickets, parallel)
- **tc-06**: Auth routes — `api/auth/*`, `api/signup`
- **tc-07**: Chat routes — `api/chat/*` (8 routes)
- **tc-08**: Task routes — `api/tasks/*` (8 routes)
- **tc-09**: Admin routes — `api/admin/*` (5 routes)
- **tc-10**: Billing routes — `api/billing/*` (4 routes)

### Phase 3: API routes — medium priority (5 tickets, parallel)
- **tc-11**: Activity routes — `api/activity/*` (5 routes)
- **tc-12**: Arena/Gamification routes — `api/arena/*`, `api/gamification/*` (11 routes)
- **tc-13**: Telegram routes — `api/telegram/*` (5 routes)
- **tc-14**: Gateway/AiPipe routes — `api/gateway/*`, `api/aipipe/*` (7 routes)
- **tc-15**: Misc routes — remaining routes

### Phase 4: DB + Middleware (2 tickets, parallel)
- **tc-16**: DB schema validation
- **tc-17**: Middleware tests

### Phase 5: Integration (3 tickets, sequential)
- **tc-18**: Full suite integration pass
- **tc-19**: Coverage report + gap analysis
- **tc-20**: Final commit
