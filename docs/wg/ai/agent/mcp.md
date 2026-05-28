---
title: MCP and Connectors
description: How user-plugged MCP servers and other external connectors compose with the locked tool set. The bulk problem, tool_search, OAuth, dynamic refresh, and trust policy for untrusted MCP servers.
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

The [Model Context Protocol](https://modelcontextprotocol.io/) (MCP)
is a transport for tools published by external servers. From the
agent's perspective an MCP tool has the same shape as any other tool
([`tools / tool contract`](./tools.md#tool-contract)) — name,
description, JSON Schema parameters, an execute function. MCP is
where those tools come from, not what they are.

A "connector" in this guide is any user-plugged source of tools
(MCP servers, plugin tools defined in a host config, ad-hoc tool
imports). MCP is the dominant transport; the discipline below applies
to any connector that adds tools at runtime.

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

The host writes the config (per project, per user, per workspace —
host's choice). The agent system reads it at session start.

## Lazy materialization

The runtime MUST NOT eagerly load tools from every configured MCP
server. The cost shape:

- One MCP server can publish 30+ tools. Three servers, 100+.
- Including every tool in the system prompt makes the model dumber
  (longer prompt, more attention spread, more "which tool fits"
  confusion).
- Skipping them makes them invisible.

The runtime SHOULD connect to MCP servers lazily, materializing each
server's tool list only when the agent might need it.

**Tool name namespacing.** Each MCP tool's id MUST be namespaced
with its client id — `<client>_<tool>` — unconditionally, not only
on collision. The prefix MUST be applied at registration time before
the tool name reaches the model's system prompt or `tool_search`
index. The `_` separator is conventional; the prefix MUST be sanitized
to id-safe characters (letters / digits / `_`). Unconditional
namespacing avoids the "first-write-wins" race where adding a second
server retroactively shadows tools the model already learned.

## The bulk problem and `tool_search`

When the total tool count exceeds a threshold (the recommended
default is **20**, including locked + agent-specific + MCP), the
runtime SHIFTS to **search-then-call**:

- Locked tools and agent-specific tools stay in the system prompt
  always.
- MCP tools live in an in-memory **index** of name + one-line
  description.
- The locked `tool_search` tool is included; the model uses it to
  find tools by description.
- A matched tool is **auto-registered** into the session's available
  tools for the rest of the conversation.

### `tool_search` shape

```ts
tool_search({ query: string }) → {
  matches: { id, description }[]
}
```

Behavior:

- Scoring SHOULD be BM25 / keyword over the description corpus. Vector
  search is overkill for tool catalogs in the hundreds.
- Returns up to ~10 best matches.
- **Side effect:** matched tools are registered into the session's
  active tool list for the rest of the conversation. The model can
  call them on the next turn without re-searching.

Side-effect-on-search reduces a two-turn dance ("search → call") to
one. The model rarely needs to know "I searched for X and got these";
it needs to call the matched tool.

### Host config

```jsonc
{
  "tool_search": {
    "enabled": "bool", // default true if mcp tool count > threshold
    "threshold": "int", // default 20 (total active tools)
    "max_matches": "int", // default 10
  },
}
```

## Connection lifecycle

A connection to an MCP server progresses through:

1. **Resolution.** The runtime reads the config entry, resolves
   local commands or remote URLs.
2. **Authentication.** Remote servers MAY require OAuth, static
   bearer tokens, or mTLS. The runtime delegates to the host's
   credential store.
3. **Handshake.** The runtime calls MCP's `initialize` and receives
   the server's capability declaration.
4. **Tool list fetch.** The runtime calls `tools/list` and stores
   the result in the session's tool index.
5. **Steady state.** Tool calls flow through `tools/call`; the
   runtime translates the result into the standard
   [tool result envelope](./tools.md#tool-result-envelope).
6. **Teardown.** On session close or server disconnect, the runtime
   releases the connection.

## Authentication

Two regimes:

| Regime     | Token storage                                                      | Refresh                                               |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| **Static** | Bearer token / API key in the host's secrets store.                | None; expires when revoked.                           |
| **OAuth**  | Refresh token in the secrets store; access token cached in memory. | Runtime refreshes on `401` and retries the call once. |

The runtime MUST NOT log access tokens, refresh tokens, or
authorization headers. Token errors that surface to the model SHOULD
be sanitized — the model sees "authentication failed", not the raw
401 body.

## Transient disconnect

A connected MCP server MAY disconnect mid-session (process crash,
network blip, remote restart). The runtime MUST:

- Mark the server's tools **unavailable** for the duration of the
  disconnect. The model sees a tool error if it calls one
  (`error_text: "mcp server <name> is unavailable"`).
- Retry the connection on an exponential backoff (recommended:
  1s, 2s, 5s, 15s, 60s, then steady at 60s).
- Restore the tools on successful reconnect. The next turn sees
  them available again; in-flight turns do not.
- Never reconnect within a single tool call's timeout window — a
  call that fired against a now-disconnected server returns a tool
  error rather than blocking on reconnect.

OAuth refresh and transient transport disconnect are independent.
A failed `401` triggers a refresh ([Authentication](#authentication));
a failed TCP connection triggers a reconnect.

## Dynamic refresh

MCP servers MAY emit a `ToolListChangedNotification`. The runtime
MUST re-fetch the server's tool list and re-register without
restarting the session.

Constraints:

- A tool-list change MUST NOT affect an **in-flight** turn. The
  current turn sees the tool list captured at its start; the new
  list takes effect on the next turn.
- The model is not notified of the change. The next turn's tool list
  simply differs; the model adapts.

## Trust policy

MCP servers MUST be treated as **untrusted by default**. A user who
installs an unknown MCP server has not vouched for its quality or
safety.

The default policy:

| Surface                            | Policy for unknown MCP servers                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Filesystem writes via MCP tool     | `ask`                                                                                                     |
| Outbound network via MCP tool      | `ask` (unless the tool's declared host matches an allowlist)                                              |
| Shell execution via MCP tool       | `ask` (most MCP servers should not expose `shell.run`-equivalent surface; if they do, treat as untrusted) |
| Tool descriptions in system prompt | Truncated to `max_description_length` (default 200 chars); the full description loads via `tool_search`   |

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

The pattern shape is the runtime's choice; the contract is that
host-defined trust profiles for MCP servers MUST be expressible.

## Tool registration discipline

Tools registered from MCP servers MUST share the same contract as
locked tools:

- Self-describing parameters (JSON Schema).
- Validated input before execute.
- The standard [result envelope](./tools.md#tool-result-envelope).
- Truncation when output exceeds the per-tool max.

The runtime is responsible for these guarantees; the MCP server is
not trusted to enforce them. The runtime validates input against
the schema the server published, truncates the server's output to
the host's max, and wraps the server's errors into the standard
error envelope.

## What MCP servers SHOULD NOT do

- **Reuse locked tool ids.** An MCP server publishing a tool called
  `read` or `bash` creates a collision the runtime resolves with
  sanitization (`<server>_read`), but the agent's model will see
  the sanitized name and the locked-name behavior simultaneously —
  a recipe for confusion. MCP servers SHOULD pick unique names.
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
