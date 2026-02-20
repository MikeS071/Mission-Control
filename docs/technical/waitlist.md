---
title: "Waitlist — Technical Reference"
---

# Waitlist — Technical Reference

**Added:** 2026-02-20
**Author:** navi-ops doc-updater

## Architecture
The waitlist is a public API flow wired into landing-page UI:

1. `POST /api/waitlist` validates and inserts unique email.
2. It returns join status and position.
3. It triggers Resend API calls for welcome email and optional latest newsletter issue.
4. Unsubscribe is handled by `/api/newsletter/unsubscribe` with token decode + delete.
5. Protected export endpoint `/api/waitlist/emails` returns ordered email list.

## Key files
- `src/app/page.tsx` — landing page waitlist form + fetch calls
- `src/app/api/waitlist/route.ts` — count + create + email send flow
- `src/app/api/waitlist/emails/route.ts` — API_SECRET-protected email export
- `src/app/api/newsletter/unsubscribe/route.ts` — token decode + delete + redirect
- `src/db/schema.ts` — `waitlist` and `newsletter_issues` tables

## Database
- **waitlist**: `id`, unique `email`, `source`, `created_at`
- **newsletter_issues**: latest issue queried by `sent_at` desc for auto-send

## API surface
- `GET /api/waitlist` (public) — returns `{ count }`
- `POST /api/waitlist` (public) — body `{ email, source? }`
  - success: `{ ok: true, position }`
  - duplicate: `{ ok: true, alreadyJoined: true }` with 409
- `GET /api/waitlist/emails` (Bearer API_SECRET) — returns `{ emails, count }`
- `GET|POST /api/newsletter/unsubscribe?token=...` (public) — removes email and redirects

## Tenant isolation
Waitlist endpoints are intentionally public/global and not tenant-scoped. Unlike dashboard routes, they do not use tenant IDs. Data isolation here is by unique email record, not multi-tenant partitioning.

## Implementation notes
- Duplicate detection relies on PostgreSQL unique constraint (`code 23505`).
- Welcome/newsletter sends are non-fatal; failures are swallowed to keep signup responsive.
- Unsubscribe uses base64url decode and validates decoded string contains `@`.
- Redirect base URL prefers `NEXTAUTH_URL` to avoid internal proxy URLs.

## Extension points
- Replace reversible unsubscribe token with signed, expiring token.
- Add double opt-in status and consent metadata.
- Track email delivery outcomes for audit and retries.