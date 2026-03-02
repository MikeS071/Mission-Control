# MC Test Backfill Wave 2

Target: 80% line coverage (currently 51%)
48 uncovered API routes grouped into 20 tickets.

## Tickets

| ID | Phase | Desc | Routes |
|----|-------|------|--------|
| tc-21 | 1 | Activity routes | activity/comments, activity/events, activity/reactions, activity/drain, activity/stream |
| tc-22 | 1 | Admin provision routes | admin/provision, admin/provision/list, admin/provision/[instanceId]/status |
| tc-23 | 1 | Admin provision trial routes | admin/provision/trial, admin/provision/trial/[instanceId]/revoke |
| tc-24 | 1 | PRD routes | tasks/[id]/prd, tasks/[id]/prd/generate, tasks/[id]/prd/new-version, tasks/[id]/prd/update, tasks/[id]/prd/versions |
| tc-25 | 1 | Settings + tenants routes | settings, tenants/me |
| tc-26 | 2 | Insights route | insights |
| tc-27 | 2 | Waitlist routes | waitlist, waitlist/emails |
| tc-28 | 2 | Events + heartbeats routes | events, heartbeats, heartbeat/alert |
| tc-29 | 2 | Gamification routes | gamification/challenges, gamification/challenges/[id]/complete |
| tc-30 | 2 | Stats + agent routes | stats/summary, agent-stats, agents/active |
| tc-31 | 3 | Workspace routes | workspace/file, workspace/files |
| tc-32 | 3 | OpenClaw chat routes | openclaw/chat/send, openclaw/chat/history |
| tc-33 | 3 | Webhook + newsletter routes | webhook/github, newsletter/unsubscribe |
| tc-34 | 3 | Meta + health routes | meta/diag, meta/health, meta/version, health |
| tc-35 | 3 | Stream + misc routes | tasks/stream, arena/reactions/stream, arena/progress-summary |
| tc-36 | 4 | Chat ws-token + billing status | chat/ws-token, billing/status, aipipe/stats, gateway/[id] |
| tc-37 | 4 | OpenAPI + docs routes | openapi, docs |
| tc-38 | 4 | Feature requests route | feature-requests |
| tc-39 | 5 | Integration pass + coverage | Run full suite, fix conflicts, generate coverage report |
| tc-40 | 5 | Final commit | Merge all test branches, push to dev |

## Config
- max_agents = 5
- max_runtime = 60m
- auto_approve = true
- Phases 1-4 parallel within phase, sequential between phases
- Phase 5 sequential (tc-39 → tc-40)
