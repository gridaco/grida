---
title: AI (WG)
description: Agent design proposals, user expectations, reusable execution contracts, and existing Grida integration studies.
keywords: [ai, agent, harness, product, components, durability]
format: md
tags: [internal, wg, ai]
---

# AI (WG)

The [agent working group](./agent/index.md) owns the design of the agent system.
Its renewed contract separates reusable components, the master that makes
product decisions, and the product a user should experience. Engineering starts
by establishing component responsibilities and invariants, then tests them
through different masters and concrete experience scenarios.

For product review, read the three proposals in this order.

1. [User experience](./agent/experience.md) describes expected features and
   observable behavior, including Ultra effort and final turn summaries.
2. [Master](./agent/master.md) defines the thin product harness and its control
   over task strategy, context, tools, verification, and performance.
3. [Components](./agent/components.md) defines Messages, Inference, Tools,
   History, Context, Runtime, and Sessions, including their independence,
   execution authority, durability, and failure behavior.

These are the current contracts, with release availability recorded in the
[feature catalog](../../agent/features.md). They are independent of programming
language and transport. The
[agent index](./agent/index.md#topic-contracts-and-studies) also locates the
topic contracts on tools, permissions, workspaces, events, and hosting.

[Grida's existing bindings](./grida/index.md) and
[implementation architecture](./grida/architecture.md) describe the existing
integration. They are useful when investigating that implementation. The
[Desktop working group](../desktop/index.md) owns the application host, and the
[Platform working group](../platform/index.md) owns account, billing, and hosted
service concerns.
