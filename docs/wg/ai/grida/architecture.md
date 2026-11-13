---
title: Architecture — Grida's agent system implementation
description: How Grida composes its local agent system — the native agent host, the retained media sidecar, and Desktop — and which process owns which authority.
keywords:
  [grida, agent, architecture, blueprint, daemon, native host, media sidecar]
format: md
tags:
  - internal
  - wg
  - ai
  - architecture
---

# Architecture — Grida's Agent System Implementation

This page records how Grida composes its local agent system. The behavior,
policy, and component contracts are [the agent RFC](../agent/index.md).

## Composition

| Process                | Owns                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native agent host      | Chat execution: the master, runtime, durable sessions, tools, permissions, confinement, and the ACP client protocol. Desktop supervises it over private stdio; headless runs use it directly. |
| Retained media sidecar | Image, video, and audio generation, provider custody for those operations, and host capabilities such as files, recents, and workspaces, behind the loopback daemon perimeter. No chat.       |
| Desktop main           | Supervision, UI and IPC routing, editor endpoint registration, the supervised provider transport, and the subscription sign-in ceremony.                                                      |
| Desktop renderer       | Presentation of chat state received through main.                                                                                                                                             |

Native chat reaches model providers either directly or through main's
supervised transport, which owns Gateway grants and subscription credentials.
The [native client protocol](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-client-protocol.md)
and the [tool-host contract](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/tool-host-contract.md)
bind the native host to Desktop. Package and crate inventories live in each
package's or crate's README.

## Capacity providers

Native providers supply model capacity to the same Grida-owned loop. BYOK,
[Grida Gateway (GG)](../../platform/hosted-ai.md), configured endpoint/local
capacity, and the experimental
[ChatGPT Subscription native provider](../agent/chatgpt-subscription-provider.md)
remain distinct provider-qualified surfaces. A provider supplies capacity
only; it never owns sessions, tools, approvals, or the loop. ACP is an
external-agent boundary, not a native provider.

A chat keeps the provider authority it was created under. Continuation,
retry, compaction, and recovery refuse rather than move a chat onto another
credential or cost boundary; changing provider is an explicit user selection.
The [provider selection](../agent/chatgpt-subscription-provider.md#provider-selection)
section owns the ordering for new chats.

## Host and tenant split

The retained sidecar is a general **daemon**: a loopback HTTP server, the
[GRIDA-SEC-004](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-004--desktop-daemon-trust-boundary)
perimeter, and the host capability route groups (files, recents, workspaces,
the secrets store). Media generation is one **tenant** mounted through a
static, typed tenant list — deliberately not a plugin registry. Dependency
direction is one-way: the tenant imports the daemon; the daemon knows no
tenant. A non-AI host capability targets the daemon and never touches an AI
package.

Every route, tenant routes included, passes the same perimeter: per-spawn
Basic Auth carried only in the `Authorization` header, `Referer`, and
`Origin`. There is no `secrets/get`; key material never returns to the
renderer.

## Shared contracts and host capabilities

Agent lifecycle behavior belongs to the native host and is exercised through
its headless executable. Editor-specific capabilities execute in the owning
editor process. Controlled headless adapters prove protocol and lifecycle
contracts, while real editor document behavior and rendering require Desktop
checks. The tool-host contract separates those responsibilities.

## Anti-goals

- No renderer-owned provider credentials or OAuth lifecycle.
- No native-provider shortcut through ACP.
- No model-name-only provider inference.
- No silent provider failover during a turn.
- No window/UX framework — hosts render; the agent host stores and runs.
- No plugin/extension registry — tools and capabilities are fixed by the RFC,
  and the daemon's tenant list is static.
- No free process spawning — commands go through the host's confined
  command authority.

## Reading order

1. This doc.
2. [agent/foundations.md](../agent/foundations.md).
3. [agent/tools.md](../agent/tools.md) and [agent/persistency.md](../agent/persistency.md).
4. [tools-fundamentals.md](./tools-fundamentals.md).
5. [desktop/process-model.md](../../desktop/process-model.md).
6. [GRIDA-SEC-004](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-004--desktop-daemon-trust-boundary).

## See also

- [Agent RFC](../agent/index.md)
- [Grida bindings](./index.md)
- [Desktop](../../desktop/index.md)
- [Grida Gateway (GG)](../../platform/hosted-ai.md)
- [Built-in subagents](./agents-builtin.md)
