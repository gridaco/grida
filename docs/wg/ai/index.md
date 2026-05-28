---
title: AI (WG)
description: Working group hub for AI-related docs. Two layers — the implementation-agnostic agent system RFC, and the Grida-specific bindings (canvas tools, image tools, host tool surface) that ride on top of it.
keywords: [ai, agent, rfc, grida, tools, canvas, image]
format: md
tags:
  - internal
  - wg
  - ai
---

# AI (WG)

Two sibling layers live here:

- **[`agent/`](./agent/index.md)** — the implementation-agnostic
  agent system RFC. RFC 2119 normative tone. No product-specific
  references. Plays a role similar to
  [ACP](https://agentclientprotocol.com/) or
  [LSP](https://microsoft.github.io/language-server-protocol/): the
  contract a conforming implementation MUST honor.
- **[`grida/`](./grida/index.md)** — Grida-specific bindings of the
  RFC. The canvas-tool catalog, the image-generation surface, and
  how Grida's host wires the locked-tool set. These docs describe
  what Grida ships; they reference the RFC for the shapes.

## Reading order

If you're trying to understand the system end-to-end:

1. Start at [`agent/index.md`](./agent/index.md) for vocabulary and
   the cross-cutting invariants.
2. Read [`agent/foundations.md`](./agent/foundations.md) for the
   bedrock (AI SDK v6 chunk shape, the locked-tool set summary,
   the watchdog, the directory-rooted execution model).
3. Skim the locked-tool spec in
   [`agent/tools.md`](./agent/tools.md) and the storage shape in
   [`agent/persistency.md`](./agent/persistency.md).
4. Pick the surface that matches your work — sessions, subagents,
   skills, MCP, environments — from the `agent/` sidebar.
5. Cross over to [`grida/`](./grida/index.md) for the bindings,
   the Grida-canvas tool surface, and the image-generation tools.

## Scope

This WG focuses on the agent protocol and Grida's bindings.
Provider auth and credentials are out of scope (host territory).
The hosted billing / model-seam architecture lives in
[`../platform/`](../platform/index.md).
