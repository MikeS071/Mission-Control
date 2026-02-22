---
title: "Billing: Technical Reference"
description: "Stripe integration, subscription lifecycle, webhook handling, and plan enforcement."
---

# Billing: Technical Reference

See [Stripe Billing](./billing-stripe) for the Stripe-specific implementation details, webhook events, and checkout flow.

## Plans and Internal Keys

| UI Label | Internal Key | Description |
|----------|-------------|-------------|
| Initiate | `free` | Default; BYO OpenClaw gateway |
| Strategos | `pro` | Hosted OpenClaw included |
| Archon | `team` | Dedicated provisioned OpenClaw |

Plans are stored in `tenants.plan` as the internal key (`free`, `pro`, `team`).

## Database Schema (billing-relevant columns)

```sql
-- tenants table (billing fields)
plan                text    NOT NULL DEFAULT 'free',
stripe_customer_id  text,
stripe_sub_id       text,
stripe_plan_key     text,
seats               integer NOT NULL DEFAULT 1,
sub_status          text,   -- 'active' | 'canceled' | 'past_due' | ...
sub_period_end      timestamp,
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/billing/checkout` | POST | Create Stripe Checkout session |
| `/api/billing/portal` | POST | Create Stripe Customer Portal session |
| `/api/billing/webhook` | POST | Receive Stripe lifecycle events |
| `/api/billing/status` | GET | Current subscription status for tenant |

## Plan Enforcement

Plan gates are enforced at the API layer via `resolveTenantId()` + plan check. Feature flags derived from plan:

| Feature | Initiate | Strategos | Archon |
|---------|----------|-----------|--------|
| Agent slots | 1 | 3 | 8 |
| AiPipe routing | ✅ | ✅ | ✅ |
| ContentAI | ❌ | ❌ | ✅ |
| CoderAI | ❌ | ❌ | ✅ |
| Provisioned gateway | ❌ | ✅ | ✅ |

## Webhook Events Handled

- `checkout.session.completed` — set `stripe_customer_id`, `stripe_sub_id`, update plan
- `customer.subscription.updated` — update plan, status, period end
- `customer.subscription.deleted` — downgrade to `free`
- `invoice.payment_failed` — set `sub_status = 'past_due'`

Webhook signature verification uses `STRIPE_WEBHOOK_SECRET` env var.
