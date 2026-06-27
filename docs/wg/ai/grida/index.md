---
title: Grida bindings
description: Grida-specific tool surfaces and bindings of the agent RFC. Fundamentals as Grida ships them, canvas tools (scene-graph search, specialized inserts, exec/lint/format, resource lookup), and image-generation tools.
keywords: [grida, ai, tools, canvas, image, bindings]
format: md
tags:
  - internal
  - wg
  - ai
  - grida
---

# Grida bindings

These docs describe how Grida implements and extends the
implementation-agnostic [agent RFC](../agent/index.md). The RFC
specifies shapes (locked tool set, capability surface, session
schema, ACP wire) without dictating product-specific behavior;
this layer binds those shapes to Grida's actual surfaces — the
canvas, the image-generation provider seam, and the host-level
fundamentals as Grida ships them.

## Pages

| Page                                                                  | Covers                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Architecture** (start here for implementation)](./architecture.md) | Grida's master implementation blueprint. Orchestrator god class (`AgentHost`), package map, host landings, sequencing, anti-goals.                                                                                         |
| [Fundamental Tools (Grida binding)](./tools-fundamentals.md)          | How the locked-tool RFC ([`../agent/tools.md`](../agent/tools.md)) lands in Grida — virtual-fs adapter, in-canvas `bash`, the `view_image` perception extension ([`../agent/vision.md`](../agent/vision.md)), host wiring. |
| [Canvas Tools](./tools-canvas.md)                                     | The canvas-only tool surface: scene-graph search and selection, specialized inserts, canvas exec / lint / format, resource lookup. Requires an active editor instance.                                                     |
| [Image Tools](./tools-image.md)                                       | Image-generation tools: text-to-image and image-to-image, provider-agnostic abstraction, credit-aware operations, canvas-image-node integration.                                                                           |
| [Built-in subagents](./agents-builtin.md)                             | Grida's specialized subagents (titler today; compactor + planner future). Concrete tier / model / sentinel / cost-discipline bindings of the RFC subagent pattern.                                                         |

## See also

- [Agent RFC](../agent/index.md) — the protocol these bindings ride on.
