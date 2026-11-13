---
title: MCP and Connectors
description: MCP consumption and Grida capability export, with shared tool contracts, bounded discovery, credential handling, and explicit recovery.
keywords:
  [
    agent-system,
    mcp,
    connectors,
    tool-search,
    bulk,
    oauth,
    dynamic-tools,
    trust,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# MCP and Connectors

The Model Context Protocol exposes capabilities between an application and
agent clients. Two directions matter here.

- A Grida agent consumes tools offered by external servers. They enter its
  ordinary tool inventory with their source identity and authority bounds.
- A Grida tool host exposes reviewed editor, document, and media capabilities
  to independent agents. Native and MCP adapters share the same implementation.

The [Grida tool-host contract](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/tool-host-contract.md)
owns the concrete exporting boundary. This page describes consumer discovery,
registration, and trust. Hosting an external agent's entire lifecycle is a
separate [agent-provider choice](./acp-provider.md).

A connector is a source of tool definitions and execution bindings. Once
adapted, its tools use the same definition, invocation, and outcome contracts as
other tools. The selected MCP version owns wire messages and lifecycle rules.

## User config

MCP servers are declared in host config, not in the agent manifest:

```jsonc
{
  "mcp": {
    "<name>": {
      "type": "local" | "remote",
      "command": ["..."],          // local only
      "url": "https://...",        // remote only
      "headers": { ... },          // remote only
      "oauth": { ... },            // remote only
      "enabled": true,
      "timeout_ms": 30000
    }
  }
}
```

The host stores the config (per project, per user, per workspace — host's
choice), but a stored entry is not authority. Installation, enablement, process
egress, and tool invocation are separate grants under
[Execution authority](./execution-authority.md#a7--extension-grants-are-independent).
An `enabled` transition and every egress change MUST originate from the host's
user-control path; model output cannot write or activate either grant.

Installing a local MCP server means acquiring an inert artifact. A package
resolver, lifecycle script, verification executable, or first launch is raw
execution and receives a separate confined grant before it runs.

## Lazy materialization

The master chooses which tool definitions enter a prepared model request.
A small set can be exposed directly, while a larger catalog can load selected
definitions on demand. Connecting to a source and exposing all its tools are
separate decisions. Neither discovery nor loading grants execution authority.

Adapter-owned identities distinguish tools from different sources even when
their display names collide. Capture source and definition revision before
exposing a callable name. A later source cannot silently replace that binding.

## The bulk problem and `tool_search`

A unified inventory can index native, client-executed, and MCP-backed tools.
Tool search returns bounded matching definitions for subsequent model use.
The master owns ranking, description budgets, and the chosen exposure lifetime.
The current request retains its captured inventory.

### `tool_search` shape

A search accepts a bounded query and returns matching tool identities,
descriptions, definition revisions, and availability. Materializing a selected
definition does not invoke it. Search results cannot silently expand grants or
substitute a similarly named tool from another source.

### Host config

Search thresholds, result counts, ranking algorithms, and eviction policy remain
product choices to establish with measured catalogs. The contract fixes source
identity, bounded output, and captured definitions without requiring a specific
threshold or permanently accumulating every discovered tool.

## Connection lifecycle

A host first resolves source enablement, caller identity, and lifecycle/network
grants. A local process starts only under its declared execution profile. A
remote source uses its authorized endpoint and credentials.

The adapter then applies its pinned MCP revision's initialization or per-request
metadata rules, discovers supported operations, and converts tool results into
the common outcome vocabulary. It releases resources on shutdown or revocation
and reports connection loss with the affected operation's actual disposition.
MCP protocol changes stay in the adapter, outside the neutral runtime.

## Authentication

Two regimes:

| Regime     | Token storage                                                      | Refresh                                                                                                     |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Static** | Bearer token / API key in the host's secrets store.                | None; expires when revoked.                                                                                 |
| **OAuth**  | Refresh token in the secrets store; access token cached in memory. | Host renews credentials within the same principal binding. Retry follows the operation evidence and policy. |

The runtime MUST NOT log access tokens, refresh tokens, or
authorization headers. Token errors that surface to the model SHOULD
be sanitized — the model sees "authentication failed", not the raw
401 body.

## Transient disconnect

A configured server can become unavailable after startup. Expose that
availability change and preserve the affected call's known outcome. Connection
recovery uses bounded, cancellable backoff under host policy. Reconnecting does
not by itself repeat an invocation or prove that a previously dispatched effect
failed.

Credential renewal and connection recovery preserve their distinct reasons and
the selected principal. Retry follows recorded evidence, the operation's
idempotency contract, and current authority. Missing terminal evidence remains
uncertain until reconciled. Transport cancellation follows the pinned MCP
revision and the operation's declared lifetime.

## Dynamic refresh

The selected protocol version defines catalog-change notifications and any
subscription needed to receive them. Refresh updates the host inventory. An
already prepared model request retains its definitions, while later requests
can expose the refreshed catalog. Revocation remains effective at invocation.

Editor focus and selection are resource state. Their changes update context
snapshots, independently of tool definitions and discovery.

## Trust policy

MCP servers MUST be treated as **untrusted by default**. A user who installs an
unknown MCP server has not granted execution, startup egress, or tool side
effects.

A local MCP process is an extension principal before any tool call occurs. Its
filesystem, process, credential, and network authority is enforced by its own
confinement domain. Tool permission rules cannot contain hidden startup work,
background tasks, or private network calls inside that process.

The default policy:

| Surface                                      | Policy for unknown MCP servers                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Installation                                 | Inert acquisition only; no lifecycle execution.                                                                 |
| Enablement / local process start             | Explicit user grant; one confined extension principal.                                                          |
| Local process egress                         | Denied by default; exact destinations or a visible, revocable unmanaged-network posture for that process alone. |
| Filesystem writes via MCP tool               | `ask`.                                                                                                          |
| Outbound side effect declared by an MCP tool | `ask` unless a narrower invocation rule allows it. This is separate from the process egress grant.              |
| Shell execution via MCP tool                 | `ask`; arbitrary shell is raw execution for that surface.                                                       |
| Tool descriptions in system prompt           | Bounded by the product exposure policy; fuller definitions can load on demand.                                  |

The host MAY whitelist specific MCP servers as trusted; trusted servers
follow the same rule layering as built-in tools.

### Pattern-matching watchdog rules

The watchdog ([`tools / watchdog`](./tools.md#the-watchdog)) can
match on patterns like `mcp:<server>:<tool>`:

```ts
{ permission: "mcp:github:*",      pattern: "*",    action: "allow" }
{ permission: "mcp:*:shell_*",     pattern: "*",    action: "ask"   }
{ permission: "mcp:untrusted-*:*", pattern: "*",    action: "deny"  }
```

The pattern shape is the host authorization adapter's choice; the contract is that
host-defined trust profiles for MCP servers MUST be expressible.

## Tool registration discipline

MCP tools use the same invocation contract as native tools:

- Self-describing parameters (JSON Schema).
- Validated input before execute.
- Correlated results preserving domain meaning and failures.
- Enforced output bounds with explicit omission.

The MCP adapter validates declared input, bounds remote output, and maps results
to the [shared result contract](./tools.md#tool-result-envelope). The host and
master choose projection and retention. The adapter treats server data according
to its source trust and authority.

## What MCP servers SHOULD NOT do

- **Create ambiguous tool names.** An MCP server publishing a tool called
  `read` or `bash` creates a collision the runtime resolves with
  explicit namespacing in the host adapter. The master preserves the resolved
  identity in each advertised definition. MCP servers SHOULD pick clear names.
- **Emit arbitrary side effects on description load.** Description
  prose is read at session start, not when a tool is called. A
  description that triggers side effects on read is a bug.
- **Embed credentials in tool descriptions.** Descriptions are
  surfaced to the model and may be inspected; they MUST NOT carry
  secrets.

## What this guide does not specify

- **The MCP protocol itself.** Specified at
  [modelcontextprotocol.io](https://modelcontextprotocol.io/). This
  guide treats MCP as a black-box transport.
- **An MCP marketplace.** MCP servers are listed in user config; how
  the user discovers them is the host's concern.
- **OAuth provider integration.** The credential store is the host's
  layer.

## See also

- [Tools](./tools.md) — the contract MCP tools obey.
- [Skills](./skills.md) — the sibling lazy-discovery layer for
  domain knowledge.
- [Foundations](./foundations.md) — the watchdog the trust policy
  rides on.
- [ACP integration](./acp.md) — capability flags
  (`mcpCapabilities.http`, `mcpCapabilities.sse`) advertised at
  initialize.
