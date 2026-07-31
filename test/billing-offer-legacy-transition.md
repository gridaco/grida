---
id: TC-BILLING-OFFER-002
title: Legacy paid subscription can move only to Pro monthly
module: billing
area: offer
tags: [stripe, portal, legacy, team, annual]
status: untested
severity: high
date: 2026-07-31
updated: 2026-07-31
automatable: false
covered_by:
  - editor/lib/billing/offers.test.ts
---

## Behavior

An organization with a historical Team or annual subscription keeps an
accurate view of that subscription. Its upgrade surface labels the offer as
legacy and provides one transition target: Pro at $20 per month. Moving through
Stripe's confirmation flow must update the existing subscription rather than
creating a second subscription.

## Steps

1. In the test-only billing environment, provision an organization with an
   active annual Pro or Team subscription and project its webhook state.
2. Open the organization's billing settings.
3. Expected: the current legacy plan, interval, price, renewal state, and
   invoices remain readable.
4. Open the plan-change surface.
5. Expected: it explains that Team and annual billing are legacy and offers
   only **Move to Pro monthly** at $20 per month.
6. Complete the Stripe test portal confirmation.
7. Expected: the existing subscription now uses Pro monthly, no second active
   subscription exists, and the webhook-projected billing row remains linked
   to the same organization.

## Notes

Run only with Stripe test-mode credentials. Cancellation and invoice history
must continue to work for a legacy subscription even before it is moved.
