---
id: TC-DESKTOP-SETTINGS-002
title: Desktop billing distinguishes Custom and legacy Team plans
module: desktop
area: settings
tags: [billing, plan, custom, legacy]
status: untested
severity: medium
date: 2026-07-31
updated: 2026-07-31
automatable: partial
covered_by:
  - editor/lib/desktop/billing.test.ts
---

## Behavior

The read-only Credits card uses the organization's commercial classification
when it labels the current plan. An organization with `is_enterprise=true` is
shown as **Custom**, regardless of any underlying Stripe tier. A historical
Team subscription is shown as **Team (legacy)**.

## Steps

1. In the local test environment, open Desktop Settings with an organization
   whose `is_enterprise` flag is true and whose underlying projected plan is
   Pro.
2. Expected: the Credits card plan badge is **Custom** and does not imply a
   fixed price or seat allowance.
3. Repeat with `is_enterprise=false` and a historical Team subscription.
4. Expected: the badge is **Team (legacy)** rather than **Team**.
5. Repeat with ordinary Free and Pro organizations.
6. Expected: their badges remain **Free** and **Pro**, respectively.

## Notes

Custom takes precedence over the projected Stripe tier. Team remains in the
read model only so existing subscriptions and billing history stay legible.
