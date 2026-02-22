---
title: "Stripe Billing"
description: "Stripe Checkout and Customer Portal integration for Strategos and Archon plan upgrades."
---

# Stripe Billing

## Overview
Stripe Billing handles paid plan upgrades from the free Initiate tier to Strategos or Archon. Users can launch checkout from the billing page, complete a Stripe subscription, and later open the Stripe customer portal to manage billing.

Mission Control also tracks subscription status per tenant (plan, seats, status, period end) and syncs updates through the Stripe webhook endpoint.

## How to use

### Step 1: Open billing page
Go to **Dashboard → Billing**.

### Step 2: Choose a plan
Select **Strategos** or **Archon** and click upgrade.

### Step 3: Complete Stripe checkout
You are redirected to Stripe Checkout. After payment, you return to `/dashboard/billing`.

### Step 4: Manage an active subscription
Use **Manage billing** to open Stripe Customer Portal.

## Key concepts
- **Initiate / Strategos / Archon**: Product plan labels in UI.
- **Pro / Team**: Internal plan keys used in API and DB (`pro`, `team`, `free`).
- **Placeholder mode**: If Stripe keys are placeholders/missing, checkout/portal return mock URLs for non-production flows.
- **Webhook sync**: Subscription lifecycle updates are applied from Stripe events.

## Limitations
- Checkout currently uses a single quantity per plan in the checkout route.
- Team seat quantity logic is enforced in webhook processing and helper methods; seat UX is minimal in current billing UI.
- In placeholder mode, no real Stripe transaction occurs.