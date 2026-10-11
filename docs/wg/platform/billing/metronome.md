---
title: Metronome billing integration
description: Platform financial ownership, durable provider operations, and retained Grida webhook custody.
keywords: [Metronome, billing, platform, webhooks]
tags: [wg, platform, billing]
format: md
---

# Metronome — Billing Infrastructure

Platform owns Metronome provisioning, contracts, commits, usage delivery, credit
projection refresh, reload configuration, and reconciliation. Stripe supplies
processor money evidence. Grida retains identity, product execution custody,
display integration, and the published source webhook URLs.

## Payments and credit

Payments, credit settlement, and the displayed balance are separate facts. A
Checkout return alone does not prove payment or credit availability. Platform
billing presents the account's purchases, invoices, and credit status through
the Console.

Native AI credit remains separate from Gateway wallet accounting. Historical
subscriptions and accepted purchases remain tied to their original identities;
retiring an old application writer does not erase customer obligations.
See [AI-credit custody](./ai-credits.md), [the commercial contract](./plans.md),
and [plans and billing](../../../platform/billing.mdx).

## Retained source webhook boundary

`/webhooks/stripe` and `/webhooks/metronome` remain signature-verified capture and
forwarding endpoints. The source archives exact raw bytes and original signature
headers, forwards durable capture to Platform, and acknowledges only after target
custody. Failure invokes no retired Grida financial processor. See the
[webhook security contract](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-001--ingest-trust-boundary)
for signature verification and delivery guarantees.

Ordinary Grida development uses
[local insiders auth and optional contributor BYOK](../../../contributing/billing.md)
without Stripe/Metronome accounts or a billing tunnel.

Earlier terminology, measurements, and designs remain in this page's revision
history. Old editor commands are retired. Historical observations are not a
provider SLA or proof of current hosted behavior.
