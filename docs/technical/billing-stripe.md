---
title: "Stripe Billing: Technical Reference"
description: "Stripe Checkout, Customer Portal, webhook signature verification, and subscription state."
---

# Stripe Billing: Technical Reference

**Author:** navi-ops doc-updater

## How it works
Billing is implemented as authenticated Next.js API routes plus a webhook endpoint:

- Client: `BillingClient.tsx` calls checkout/portal APIs.
- Server routes: create checkout sessions, return subscription status, open portal sessions.
- Webhook: handles Stripe lifecycle events and upserts tenant subscriptions.
- Billing library: shared plan/status helpers and DB upsert/cancel logic.

## Key files
- `src/app/dashboard/billing/BillingClient.tsx`, billing UI and calls to `/api/billing/*`
- `src/app/dashboard/billing/page.tsx`, server page; loads initial subscription
- `src/app/api/billing/checkout/route.ts`, creates Stripe checkout session
- `src/app/api/billing/portal/route.ts`, creates Stripe customer portal session
- `src/app/api/billing/status/route.ts`, returns tenant subscription snapshot
- `src/app/api/billing/webhook/route.ts`, processes Stripe webhook events
- `src/lib/billing.ts`, plan ranking, placeholder mode, upsert/cancel helpers
- `src/lib/validate.ts`, `BillingCheckoutSchema`
- `src/db/schema.ts`, `subscriptions` table

## Database details
**subscriptions** table:
- `tenant_id` (unique FK)
- `stripe_customer_id`
- `stripe_subscription_id`
- `plan` (`free`|`pro`|`team`)
- `seats`
- `status` (`active`/`past_due`/`canceled`/`trialing`)
- `current_period_end`
- timestamps

## API endpoints
- `POST /api/billing/checkout` (auth), body `{ plan }`, creates Stripe Checkout URL
- `POST /api/billing/portal` (auth), returns Stripe billing portal URL
- `GET /api/billing/status` (auth), returns `{ plan, status, seats, currentPeriodEnd }`
- `POST /api/billing/webhook` (public), handles:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

## Tenant isolation
Authenticated billing routes resolve tenant via `getTenantId(req)` and read/write only that tenant’s subscription row (`subscriptions.tenant_id = tenantId`). Webhook tenant resolution uses Stripe metadata (`tenantId`) and fallback lookup by `stripeSubscriptionId` when metadata is absent.

## Implementation notes
- `BillingCheckoutSchema` accepts `strategos|archon|pro|team`; server logic maps `pro/team` to Stripe price IDs.
- `isStripePlaceholderMode()` bypasses Stripe API calls for test/degraded envs.
- Webhook signature validation is enforced unless webhook secret is placeholder/missing.
- Team seats are normalized using `getTeamSeatCount()` and minimum constraints in webhook handler.

## Ways to extend this
- Add yearly billing and explicit seat selection UX.
- Track billing audit events in a dedicated table.
- Harden plan-key mapping to remove dual naming between marketing labels and internal enums.