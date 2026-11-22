---
title: Grida bindings
description: Grida tool surfaces and agent contracts, from the earlier embedded tool proposal to the native host and document tools.
keywords: [grida, ai, tools, canvas, image, bindings]
format: md
tags:
  - internal
  - wg
  - ai
  - grida
---

# Grida bindings

These docs describe Grida's tool surfaces and design proposals. The
[agent RFC](../agent/index.md) defines shared invocation, capability,
session, and authority contracts. Each host selects tools for the
environment it supports.

The [Rust/Electron tool-host contract](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/tool-host-contract.md)
defines shared Grida capabilities exposed directly and through MCP, including
live editor ownership and headless execution. The pages below also retain
current implementation evidence and earlier domain-tool proposals.

## Pages

| Page                                                                  | Covers                                                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Architecture** (start here for implementation)](./architecture.md) | Grida's implementation blueprint: native agent host, retained media sidecar, Desktop process ownership, capacity providers, anti-goals.                                               |
| [Workspace Surfaces](./workspace-surfaces.md)                         | Current product model for repository-backed workspaces and visible artifacts: canvas-first policy, agnostic surface tools, host interactivity, user authority, and reopen continuity. |
| [Embedded Agent Tool Proposal](./tools-fundamentals.md)               | Earlier Web agent design for virtual filesystems and hosts that mediate file access.                                                                                                  |
| [Canvas Tools](./tools-canvas.md)                                     | The canvas-only tool surface: scene-graph search and selection, specialized inserts, canvas exec / lint / format, resource lookup. Requires an active editor instance.                |
| [Image Tools](./tools-image.md)                                       | Image-generation tools: text-to-image and image-to-image, provider-agnostic abstraction, credit-aware operations, canvas-image-node integration.                                      |
| [Built-in subagents](./agents-builtin.md)                             | Grida's specialized internal agents (chat titles and compaction), with their provider and cost bounds.                                                                                |

## See also

- [Agent RFC](../agent/index.md) — the protocol these bindings ride on.
