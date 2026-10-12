---
title: AI credit and product custody
description: Platform owns native AI credit; Grida retains verified product execution and durable usage receipts.
keywords: [AI credit, platform, billing, receipts]
tags: [wg, platform, billing]
format: md
---

# AI credits and execution ownership

Platform owns the organization AI-credit balance, payments, subscriptions,
automatic top-ups, financial reservations and reconciliation. Grida owns identity,
organization membership, product entry points and product assets.

Text, image, video and selected Tripo generation/rigging execute through Grida
Gateway using server-only organization-scoped authority. A user does not need a
personal Gateway key. GG owns provider dispatch, original job identity, observed
usage and shared-credit settlement; Grida must not also create a native usage
receipt for those calls. Public/native Grida DTOs and authorization remain Grida's
responsibility. Grida downloads/persists product results; failed asset delivery
never triggers a second paid generation or undoes known usage.

Replicate-backed interactive tools/music retain the native Platform admission
and source claim/dispatch/completion receipt seam. Accepted pre-transition native
work also retains that custody and outbox until reconciled. Its existing SQL
receipts remain permanent. Repeating an equal receipt is safe; conflicting
terminal evidence is not another charge. Removing a provider call does not erase
its accepted obligations or permit redispatch through GG.

GG and retained native admission share one reservation authority. Current balance
is a display observation, not permission to dispatch. Unknown usage remains
unknown and held for reconciliation. Grida displays settled GG charge metadata
when available and labels a fallback catalogue estimate; it never represents a
pending charge as free. Subscription, payment, funding settlement and browser
return are independent facts.

Contributor text BYOK charges the contributor's own provider and bypasses
customer billing while retaining authentication and organization resolution.
Library embeddings remain unbilled. Tripo upload preparation remains in Grida;
its server key must belong to GG's Tripo account, and signed input ownership is
verified independently of credit admission. See [contributor setup](../../../contributing/billing.md)
and the [known issues](./known-issues.md).
