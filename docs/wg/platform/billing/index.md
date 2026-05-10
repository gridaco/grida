---
title: Billing (WG)
tags:
  - internal
  - wg
  - platform
  - billing
---

# Billing (WG)

Working group documents for the Grida billing surface (subscriptions,
AI credit, Stripe ↔ Metronome sync).

## Documents

- [AI Credits — Master Plan](./ai-credits) — design notes for the
  Metronome-backed prepaid credit system, top-up + auto-reload flows,
  drain order, refund pattern, gate primitive.
- [Metronome integration](./metronome) — the integration playbook:
  substrate setup, payment-gate config, webhook event taxonomy.
- [Known issues](./known-issues) — living register of mitigated /
  accepted issues across the billing surface (`KI-BILL-NNN`).

## See also

- [Contributor setup](../../../contributing/billing) — local dev (Stripe
  - Metronome sandbox + cloudflared tunnel).
- User-facing billing copy: [docs/platform/billing.mdx](../../../platform/billing.mdx).
