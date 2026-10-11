---
id: TC-BILLING-OFFER-005
title: Legacy Team keeps auto-reload while transitioning to Pro
module: billing
area: offer
tags: [stripe, legacy, team, ai-credit, auto-reload]
status: untested
severity: medium
date: 2026-07-31
updated: 2026-07-31
automatable: partial
covered_by: []
---

> Platform billing owns shared financial acceptance. This record retains its
> original case IDs, Behavior, status, and history; ownership cleanup is not
> verification. Current billing runs in the shared console/Platform service.
> Verify current billing through the Console with a test-only setup. Former
> Grida harness actions, direct source financial edits, and retired billing
> commands below are historical procedure context, not current setup.
> Grida-specific product display, BYOK, and receipt assertions remain Grida
> consumer obligations.

## Behavior

An active historical Team subscription still satisfies the standard paid-plan
gate for AI-credit auto-reload. Removing Team from sale must not unexpectedly
disable an existing recurring credit rule while the organization transitions
to Pro monthly. This compatibility does not make Team purchasable again.

## Steps

1. In the test-only billing environment, use a non-Custom organization with an
   active historical Team subscription and auto-reload disabled.
2. Open billing settings and expand **Auto-reload**.
3. Expected: the standard controls remain available and do not show **Pro
   required**.
4. Enable auto-reload through Stripe test Checkout, then edit and disable it.
5. Expected: all three operations succeed through the existing standard path.
6. Attempt to purchase a new Team subscription.
7. Expected: the request still fails with `offer_retired`; Pro monthly remains
   the only transition target.

## Notes

Custom takes precedence: a Custom organization remains agreement-managed even
if its projected historical subscription tier is Team.

The former `offers.test.ts` coverage, where listed, was retired with the source
financial engine. No replacement full-case coverage or hosted verification is
claimed by this ownership update. Keep the untested status until actual proof.
