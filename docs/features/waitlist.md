---
title: "Waitlist"
---

# Waitlist

**Added:** 2026-02-20
**Tier:** Public

## Overview
The Waitlist feature captures early-access signups from the landing page, tracks position count, sends a welcome email, and optionally sends the latest newsletter issue automatically after signup.

It also supports unsubscribe links via a tokenized endpoint and an admin-protected endpoint to export waitlist emails.

## How to use

### Step 1 — Join from landing page
On the public site, enter your email in the waitlist form.

### Step 2 — Receive confirmation
If accepted, your signup position is returned and a welcome email is sent (non-blocking).

### Step 3 — Newsletter follow-up
If a newsletter issue exists in the database, the latest issue is sent automatically after join.

### Step 4 — Unsubscribe (if needed)
Use the unsubscribe link token in emails; this removes the address from waitlist storage.

## Key concepts
- **Position count**: Signup number based on current row count.
- **Duplicate join handling**: Existing emails return `alreadyJoined` (409).
- **Unsubscribe token**: Base64url-encoded email used for one-click unsubscribe endpoint.
- **Admin export auth**: Waitlist email export requires `Authorization: Bearer <API_SECRET>`.

## Limitations
- Unsubscribe token is reversible encoding, not cryptographic signing.
- Email delivery errors are treated as non-fatal (signup still succeeds).
- Waitlist stores unique email only; advanced profile fields are not collected.