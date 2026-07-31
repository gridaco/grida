---
id: TC-BILLING-OFFER-001
title: New paid checkout offers only Pro monthly
module: billing
area: offer
tags: [stripe, checkout, pro, pricing]
status: untested
severity: critical
date: 2026-07-31
updated: 2026-07-31
automatable: partial
covered_by:
  - editor/lib/billing/offers.test.ts
---

## Behavior

A Free organization can start exactly one self-service recurring offer: Pro at
$20 USD per month for the organization. The application must not expose or
accept a Team or annual checkout, even when an old URL or client submits one.
Stripe Checkout must show the same monthly price before payment is confirmed.

## Steps

1. Use the test-only billing environment and sign in as the owner of a Free
   organization.
2. Open `/_/settings/billing/upgrade` and choose the organization if prompted.
3. Expected: the upgrade page shows one Pro card at $20 per month, with no
   interval switch and no Team offer.
4. Select **Upgrade to Pro**.
5. Expected: Stripe's test checkout shows a $20 recurring monthly charge for
   the organization.
6. Cancel checkout and submit legacy Team-monthly and Pro-annual intents to the
   server action using the test harness.
7. Expected: both fail with `offer_retired` before Stripe or billing state is
   mutated.

## Notes

Run only with Stripe test-mode credentials. The public marketing contract is
covered separately by `editor/lib/billing/marketing-plans.test.ts`.
