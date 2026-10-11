---
title: AI credit and product custody
description: Platform owns native AI credit; Grida retains verified product execution and durable usage receipts.
keywords: [AI credit, platform, billing, receipts]
tags: [wg, platform, billing]
format: md
---

# AI Credits — Master Plan

Platform owns the native AI-credit account, payments, Metronome funding/rating,
subscription eligibility, reload policy, and reconciliation. Grida owns verified
product execution and permanent claim/dispatch/completion receipt custody.

The [commercial plan contract](./plans.md) includes no recurring plan-credit grant.
AI credit is separately purchased. Native AI credit and the standalone Gateway
wallet are separate economic pools; a Gateway charge cannot also debit native credit.

## Product execution boundary

The [Grida AI seam](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts)
requires verified organization authority and fresh Platform admission for billed
work. A source execution claim commits before dispatch; dispatch grants one
provider attempt. Exact completion and the usage outbox commit before successful
return or stream finish. Identical receipts replay safely; conflicting evidence
is rejected. A dispatched outcome without trustworthy terminal evidence remains
unknown and requires reconciliation before another execution attempt.

Native `cost_mills` remains an exact decimal string rather than a floating-point
estimate or Gateway money. Receipts retain original execution/pricing identity
through retries, deletion, and restoration. Prompts and result bodies are not
financial receipt data. Removing the former financial writer does not remove
producer custody or unknown-outcome obligations.

## Display and funding

Credit indicators read Platform's cached projection and retain unknown versus
zero balance. Display observations do not authorize paid work. Native credit's
existing floor is not an atomic prepaid reserve and cannot promise strict
concurrency enforcement.

Payment, funding settlement, current credit display, and a browser return are
separate facts. Subscription/reload/purchase operations are handled by Platform;
Grida no longer runs the original billing SDKs or Supabase projectors.

Contributor text BYOK spends directly with the contributor provider and bypasses
customer billing while retaining authentication and organization resolution.
Funded media still needs admission. See [local contributor integration](../../../contributing/billing.md)
and the [known issue register](./known-issues.md).

The former master plan remains available in
[its original source revision](https://github.com/gridaco/grida/blob/c39e8d79d845cf60dbad7cbc2ae6fddcb9706bf5/docs/wg/platform/billing/ai-credits.md)
as historical design and research. Its source-writer/CLI recipes are retired.
