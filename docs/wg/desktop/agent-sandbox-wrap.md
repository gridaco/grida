---
title: Desktop agent authority
description: The Desktop delta for host containment, native host networking, and confined raw agent execution.
keywords: [desktop, agent-sidecar, sandbox, network, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Desktop agent authority

Desktop adds no exception to the agent system's
[Execution authority](../ai/agent/execution-authority.md) model. It has three
host-specific constraints:

1. the renderer is URL-loaded and receives only a path-scoped bridge;
2. the native shell can use the operating system's effective network route;
   and
3. macOS, Linux, and Windows offer different confinement primitives.

The Desktop binding therefore keeps four roles separate:

| Role                   | Authority                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Host control           | Records user-originated grants, owns windows and process lifetime, and exposes no raw fetch or spawn capability to the renderer.       |
| Contained agent host   | Owns sessions, structured file capabilities, and the agent loop under a coarse filesystem/process backstop.                            |
| Native network service | Performs registered host-service operations through the effective OS route while preserving destination grants and credential custody. |
| Confined workers       | Run shell commands, external agents, extension code, and install-time executables under one attributable authority each.               |

This split is necessary because a static process-wide destination list cannot
represent host providers, extensions, and concurrent agents without sharing
authority. It is also necessary because merely unwrapping a Node process does
not make that process consult system proxy/PAC or platform trust.

The native network service is a designed provider surface, not a generic
URL-and-headers broker. A confined worker uses the native route only through a
destination-bound capability. If its opaque client cannot consume a compatible
route or trust configuration, network is withheld or the user selects a
separate, explicitly unmanaged extension posture.

Desktop also keeps local daemon reachability capability-shaped. Electron main
owns the exact loopback listener and transfers only already-accepted connected
sockets to the socketless agent host; the agent host receives no listener,
target selector, or generic local bind/connect authority. Provider operations
use a separate bounded framed channel, so daemon ingress and provider egress do
not become one ambient IPC/network permission.

The current macOS/Linux outer profile has no direct external destinations and
no generic local binding. On Windows that profile is not yet enabled: shell and
external ACP are withheld, while structured local filesystem capabilities
remain exposed as a known nonconformance with the fail-closed target.

The existing `accept-edits` and `auto` modes remain permission-interaction
choices above confinement. Neither mode changes a principal's kernel authority
or converts missing enforcement into sandboxed execution.

The implementation-specific process map, migration gates, Windows posture, and
verification contract live beside the Desktop code in
[`desktop/docs/agent-authority.md`](https://github.com/gridaco/grida/blob/main/desktop/docs/agent-authority.md).

## See also

- [Execution authority](../ai/agent/execution-authority.md) — the principal,
  grant, route, and confinement model.
- [Sandbox Runtime (`srt`)](../ai/agent/srt.md) — reference primitive and its
  host-route/global-policy limits.
- [Agent security](./agent-security.md) — the current `GRIDA-SEC-004` landing.
- [Process model](./process-model.md) — the Desktop process roles.
