---
id: TC-BILLING-OFFER-004
title: Custom auto-reload configuration is agreement-managed
module: billing
area: offer
tags: [custom, ai-credit, auto-reload, stripe, metronome]
status: untested
severity: high
date: 2026-07-31
updated: 2026-07-31
automatable: partial
covered_by: []
---

## Behavior

An organization classified as Custom can purchase AI credit manually, but its
auto-reload configuration follows the signed agreement. A projected Stripe
subscription or an existing saved auto-reload setting must not reopen the
standard self-service controls. Forged enable, edit, and disable requests fail
before Stripe or Metronome is mutated.

## Steps

1. In the test-only environment, use a Custom organization with an active
   Stripe subscription and auto-reload disabled.
2. Open billing settings and expand **Auto-reload**.
3. Expected: **Agreement-managed** and **Contact Grida** are shown; the switch
   is disabled. Manual **Buy Credit** remains available.
4. Repeat with a Custom organization that already has auto-reload enabled.
5. Expected: the saved threshold and target remain readable, but the switch,
   inputs, and Save and Cancel controls are disabled.
6. Submit enable, edit, and disable auto-reload actions through the test
   harness.
7. Expected: every action fails with `custom_managed`; no Checkout Session,
   Stripe mutation, or Metronome configuration mutation occurs.
8. Repeat with an active Pro organization.
9. Expected: its standard enable, edit, and disable controls remain available.

## Notes

Manual top-up is intentionally outside this guard because it creates a fresh,
explicit purchase rather than changing an agreement-managed recurring rule.
