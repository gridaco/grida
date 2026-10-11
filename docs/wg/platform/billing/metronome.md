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

## Financial operations

Financial mutations are durable Platform operations bound to the original account,
request hash, idempotency identity, attempt time, and provider evidence. An HTTP
success, accepted intent, current-state equality, or cached balance alone does not
prove economic settlement. Ambiguous outcomes retain their original identity and
require authoritative reconciliation; they are not blindly redispatched after
the safe provider retry window.

Native AI credit remains separate from Gateway wallet accounting. Current
subscriptions, consent/order, pending liabilities, and late evidence survive
organization deletion, migration, and restore. See [AI-credit custody](./ai-credits.md)
and [the commercial contract](./plans.md).

## Retained source webhook boundary

`/webhooks/stripe` and `/webhooks/metronome` remain signature-verified capture and
forwarding endpoints. The source archives exact raw bytes and original signature
headers, forwards durable capture to Platform, and acknowledges only after target
custody. Failure invokes no retired Grida financial processor. Existing source
endpoint signing secrets remain separate from Platform target endpoint secrets
and the sending workload credential.

Provider credentials, private operating procedures, and real signed-delivery
proof belong to Platform's maintained runbooks. Ordinary Grida development uses
[local insiders auth and optional contributor BYOK](../../../contributing/billing.md)
without Stripe/Metronome accounts or a billing tunnel.

The [original integration record](https://github.com/gridaco/grida/blob/c39e8d79d845cf60dbad7cbc2ae6fddcb9706bf5/docs/wg/platform/billing/metronome.md)
preserves external terminology, dated measurements, and design references.
Its old editor commands are retired. Historical observations are not a provider
SLA or proof of current hosted behavior.
