---
title: Billing known issues
description: Retained billing issue identities, original history, and Platform or Grida producer ownership.
keywords: [billing, known issues, platform, AI credit]
tags: [wg, platform, billing]
format: md
---

# Billing — Known Issues

Platform owns shared billing triage; Grida retains its product pricing and receipt
obligations. These IDs and headings preserve the existing public issue links.
Retiring the former financial engine does not itself close an economic issue.
Earlier discovery, behavior, mitigation, planned work, and code/PR/manual-case
references remain in this page's revision history.

## KI-BILL-001 — Silent auto-recharge runs at-cost (markup gap)

The historical automatic-reload and manual-purchase fee policies differed.
That economic issue belongs to the billing service; removing application code
does not by itself establish its resolution.

Platform now owns reload economics and the retained paid obligations. Actual
current fee handling and provider outcomes must be reconciled before changing
the issue's disposition. Removing the former editor actions is not closure.

## KI-BILL-002 — Concurrent subscribe Checkouts can produce orphan subscription

The original source risk was two concurrent subscription Checkouts before the
first subscription projected locally (manual case `TC-BILLING-SUB-059`). A local
projection rejecting the second subscription did not reverse the external charge.
The original disposition was accepted with manual support/refund responsibility.

Platform has durable purchase and operation custody. Hosted concurrency and
unexpected duplicate-payment reconciliation need proof before this ID is closed;
historical customer/provider identities and obligations remain retained.

## KI-BILL-004 — Image-cost fallback does not reconcile token usage

**M2 status:** migrated generation is rated and settled by GG; Grida's catalogue
is a display estimate, not a fallback charge. This issue remains relevant to
accepted pre-transition receipts and any retained native consumer.

Token-priced images can vary by input, cache, quality, size, and output usage.
The Grida producer prefers a valid provider response cost; a fixed fallback cannot
reconstruct missing receipt detail. [PR #1031](https://github.com/gridaco/grida/pull/1031)
records the original mitigation.

Receipt coverage and fallback accuracy remain producer obligations. Platform
migration does not establish them. Current implementation references are the
[AI seam](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts) and
[image pricing](https://github.com/gridaco/grida/blob/main/editor/lib/ai/image-cost.ts).

## KI-BILL-005 — Tripo jobs without an observed terminal receipt need reconciliation

**M2 status:** new migrated work uses GG's durable original-job observation and
financial recovery. Accepted native jobs retain their historical obligation;
the migration does not invent a terminal receipt for them or resubmit them.

Provider execution can outlive a synchronous invocation. An observed terminal
receipt can be billed independently of later asset delivery, but process death or
an unobserved terminal state leaves usage unknown.

Claim/dispatch custody prevents blind duplicate dispatch and preserves original
execution identity. It does not observe a missing terminal receipt. Durable
observation/reconciliation still requires its own implementation and proof.
See the [Tripo adapter](https://github.com/gridaco/grida/blob/main/editor/lib/ai/gg-three-d.ts)
and [shared AI seam](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts).

## Resolved

### KI-BILL-003 — Unsupported plan-included credit promise

Resolved by removing unsupported recurring Free/Pro/Team AI-credit promises in
[PR #1010](https://github.com/gridaco/grida/pull/1010). The
current commercial contract purchases AI credit separately and
promises no recurring grant. A future grant requires an approved offer and an
implemented lifecycle before it is advertised.

## Adding a new entry

Use the next sequential `KI-BILL-NNN` ID. Retain discovery/context, cause, actual
current behavior, mitigation, planned fix, acceptance rationale, current owner,
and evidence references. Status changes require proof addressing the original
economic or producer obligation; preserve its history and public anchor.
