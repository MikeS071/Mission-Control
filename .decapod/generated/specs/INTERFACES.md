# Interfaces

## Contract Principles
- Prefer explicit schemas over implicit behavior.
- Every mutating interface defines idempotency semantics.
- Every failure path maps to a typed, documented error code.

## API / RPC Contracts
| Interface | Method | Request Schema | Response Schema | Errors | Idempotency |
|---|---|---|---|---|---|
| `/api/admin/audit-log` | `GET` | Query: `tenantId?: number`, `page?: number`, `limit?: number` | `{ items, page, limit, total, totalPages }` where items include tenant name, changed_by, diff summary, reason, timestamp, old/new JSON | `400` invalid query, `401` unauthenticated, `403` non-admin, `500` server error | Read-only; deterministic pagination for identical dataset |

## Event Consumers
| Consumer | Event | Ordering Requirement | Retry Policy | DLQ Policy |
|---|---|---|---|---|
| `admin audit viewer` | `policy change audit rows` | reverse-chronological by `created_at` | n/a (pull read) | n/a |

## Outbound Dependencies
| Dependency | Purpose | SLA | Timeout | Circuit-Breaker |
|---|---|---|---|---|
| `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |

## Inbound Contracts
- API / RPC entrypoints:
  - `GET /api/admin/audit-log` (global admin-only policy audit listing)
- CLI surfaces:
  - none for this feature slice
- Event/webhook consumers:
  - none for this feature slice
- Repository-detected surfaces: npm

## Data Ownership
- Source-of-truth tables/collections:
  - `policy_audit_logs` for policy-change history
  - `tenants` for tenant name join in admin read models
- Cross-boundary read models:
  - Admin UI table view in `/admin/audit-log`
- Consistency expectations:
  - Append-only audit rows, eventual visibility with read-after-write consistency from primary DB

## Error Taxonomy Example (service_or_library)
```ts
export enum ApiErrorCode {
  Validation = "validation_failed",
  UpstreamTimeout = "upstream_timeout",
  Conflict = "conflict"
}
```

## Failure Semantics
| Failure Class | Retry/Backoff | Client Contract | Observability |
|---|---|---|---|
| Validation | No retry | 4xx typed error | warn log + metric |
| Dependency timeout | Exponential backoff | 503 with retryable code | error log + alert |
| Conflict | Conditional retry | 409 with conflict detail | info log + metric |

## Timeout Budget
| Hop | Budget (ms) | Notes |
|---|---|---|
| Client -> Edge/API | 500 | Includes auth + routing |
| API -> Domain | 300 | Includes validation |
| Domain -> Store/Dependency | 200 | Includes retry overhead |

## Interface Versioning
- Version strategy (`v1`, date-based, semver):
  - Internal admin APIs are path-versioned by stability contract and currently treated as `v1` at `/api/admin/*`.
- Backward-compatibility guarantees:
  - New optional query params are additive and backward-compatible.
  - Existing fields in successful responses are not removed without deprecation notice.
- Deprecation window and removal policy:
  - Deprecated response fields or params must remain for at least one release cycle after notice in changelog and specs.
