---
title: ACP Integration
description: The Agent Client Protocol (https://agentclientprotocol.com/) as the default outward wire of any conforming agent system. The mapping between this guide's internal shapes and ACP's wire vocabulary; method-by-method correspondence; where the protocol and the guide diverge and how the adapter handles each seam.
keywords:
  [
    agent-system,
    acp,
    agent-client-protocol,
    json-rpc,
    editor-integration,
    transports,
    interop,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# ACP Integration

The [Agent Client Protocol](https://agentclientprotocol.com/) is to
agents what LSP is to language tooling: one JSON-RPC vocabulary so
an editor and an agent speak without either knowing the other's
implementation. It exists because the fragmentation it removes —
every editor reimplements every agent's integration; every agent
reimplements every editor's surface — is the same fragmentation LSP
solved.

This guide adopts ACP as the **default outward transport** for any
conforming agent system. Internally the core emits AI SDK v6 chunks
([`foundations / streaming substrate`](./foundations.md#streaming-substrate-ai-sdk-v6));
ACP wraps the chunks for delivery to an external client. A host
that does not need editor interop MAY skip the adapter; a host that
does adopts it without re-shaping the core.

## What ACP is

- **JSON-RPC 2.0** over **stdio** by default; HTTP, WebSocket, or
  SSE for remote agents.
- **Two roles:** the **client** (the editor / IDE / outer host) and
  the **agent** (the AI backend). The client launches and supervises
  the agent as a subprocess, then drives it through JSON-RPC.
- **Capability negotiation** at `initialize` time. Each side
  declares what it can do (loadSession, resumeSession, filesystem
  read/write, terminals, MCP transports). Neither side assumes; both
  check.
- **Distributed authority.** The client typically owns the
  filesystem and the terminal; the agent owns the model loop and
  the conversation state. Either side MAY publish capabilities the
  other consumes.
- **Wire naming convention** is **camelCase for JSON property keys
  and snake_case for discriminator values** — opposite this guide's
  internal convention. See [Naming seam](#naming-seam).

## How the agent system maps to ACP

The agent system core hosts the **agent side** of ACP. The host
process ships an ACP transport that translates between this guide's
internal shapes and ACP messages.

```text
┌─ ACP client (editor) ─────────────────────────────────────────────┐
│  initialize / session/new / session/prompt / session/cancel       │
│         responds to: session/update, session/request_permission,  │
│                       fs/* requests, terminal/* requests          │
└─────────────────────────┬─────────────────────────────────────────┘
                          │  JSON-RPC over stdio (default) /
                          │  HTTP / WebSocket / SSE (remote)
                          ▼
┌─ ACP adapter (in the host) ───────────────────────────────────────┐
│  - dispatches incoming JSON-RPC to core APIs                      │
│  - translates AI-SDK-v6 chunks → session/update notifications     │
│  - translates watchdog `ask` → session/request_permission         │
│  - bridges fs/terminal client-provided capabilities back to       │
│    the core's runtime when negotiated                             │
└─────────────────────────┬─────────────────────────────────────────┘
                          │  internal API (snake_case)
                          ▼
┌─ Agent system core ───────────────────────────────────────────────┐
│  session, message, part / locked tools / loop / runtime           │
└───────────────────────────────────────────────────────────────────┘
```

## Method mapping

| ACP method                            | Guide equivalent                                          | Notes                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize`                          | Capability handshake                                      | Adapter declares which capabilities the core supports.                                                                                                                                                                                |
| `authenticate`                        | Provider credential resolution                            | Adapter forwards to the host's credential store. Out of guide scope.                                                                                                                                                                  |
| `session/new`                         | Create a `chat_sessions` row                              | Adapter creates the row, returns its `id` as ACP's `sessionId`.                                                                                                                                                                       |
| `session/load`                        | Replay messages as `session/update` notifications         | The adapter walks DB rows and re-emits each as the corresponding ACP update type.                                                                                                                                                     |
| `session/resume`                      | Attach to a session without replay                        | Maps to opening an existing session row; the chat panel hydrates from DB on its own.                                                                                                                                                  |
| `session/close`                       | Mark the adapter handle inactive; the session row stays   | The DB row persists; only the in-memory handle goes.                                                                                                                                                                                  |
| `session/prompt`                      | A new user message + a fresh turn through the loop        | Body parts (`text`, `resource`) map to compositor parts. See [`compositor`](./compositor.md#the-user-message-shape).                                                                                                                  |
| `session/cancel`                      | Internal `abort(session_id)`                              | Adapter calls the core's abort; the run-state machine handles the rest.                                                                                                                                                               |
| `session/set_mode`                    | Plan/build agent swap (opinionated pattern)               | The host MAY route ACP modes onto the per-message `agent` override; see [`subagents / plan-build`](./subagents.md#plan--build-mode). If the host has no mode concept, advertise no modes at `initialize` and never receive this call. |
| `session/request_permission`          | Watchdog `ask`                                            | Adapter wraps the watchdog hook; user reply lands as a session-scoped permission rule.                                                                                                                                                |
| `session/update` (notification)       | AI SDK v6 chunks                                          | Adapter translates per-chunk; see [Update mapping](#update-mapping).                                                                                                                                                                  |
| `fs/read_text_file` (agent → client)  | Locked tool `read` when fs delegation is negotiated       | Client-provided filesystem capability; the runtime calls back into the client.                                                                                                                                                        |
| `fs/write_text_file` (agent → client) | Locked tool `write` when fs delegation is negotiated      | Same.                                                                                                                                                                                                                                 |
| `terminal/*` (agent → client)         | Locked tool `bash` when terminal delegation is negotiated | Client owns the shell; agent drives it via the terminal/\* methods.                                                                                                                                                                   |

## Update mapping

ACP's `session/update` notification is a discriminated union over a
`sessionUpdate` field. The adapter translates AI SDK v6 chunks 1:1
where possible:

| AI SDK v6 chunk type                                             | ACP `sessionUpdate`                                     | Notes                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `text-start` / `text-delta` / `text-end`                         | `agent_message_chunk`                                   | Each delta becomes one ACP update with the partial text content block.          |
| `reasoning-start` / `reasoning-delta` / `reasoning-end`          | `agent_thought_chunk` (where supported)                 | When the client cannot render thought, the adapter drops or coalesces.          |
| `tool-input-start` / `tool-input-delta` / `tool-input-available` | `tool_call`                                             | First chunk emits the `tool_call` with `status: "pending"`, then `in_progress`. |
| `tool-output-available`                                          | `tool_call_update` (status `completed`)                 | Carries the tool's output content blocks.                                       |
| `tool-output-error`                                              | `tool_call_update` (status `failed`)                    | Carries the error text in a content block.                                      |
| `file` / `source-url` / `source-document`                        | content blocks inside `agent_message_chunk`             | Mapped per ACP's content block taxonomy.                                        |
| `finish-step` / `finish`                                         | terminates the `session/prompt` reply with `stopReason` | Mapped: `end_turn`, `max_tokens`, `cancelled`, `refusal`.                       |

The adapter is a **translator**, not a buffer. It does not introduce
its own state — every update it emits is sourced from one chunk or
a finalize event the core already produced.

## Tool kind mapping

ACP tags every tool call with a `kind` from a small enum (`read`,
`edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`,
`other`). The kind drives client UI — icon, inline diff renderer,
terminal pane.

| Locked tool   | ACP `kind`                                                |
| ------------- | --------------------------------------------------------- |
| `read`        | `read`                                                    |
| `write`       | `edit`                                                    |
| `edit`        | `edit`                                                    |
| `glob`        | `search`                                                  |
| `grep`        | `search`                                                  |
| `bash`        | `execute`                                                 |
| `todo`        | `other`                                                   |
| `task`        | `other`                                                   |
| `question`    | `other`                                                   |
| `web_search`  | `fetch`                                                   |
| `web_fetch`   | `fetch`                                                   |
| `skill`       | `think`                                                   |
| `tool_search` | `search`                                                  |
| MCP tools     | `kind` from the MCP server's declaration; default `other` |

The `kind` taxonomy is small on purpose. Implementors that want
richer UI hints stash them in ACP's `_meta` field; clients that
understand the host's meta render fancier.

## Capability matrix

The adapter advertises these on `initialize`:

| ACP capability                     | Required when                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `loadSession`                      | Persistence is on (default).                                                                 |
| `sessionCapabilities.resume`       | The implementor ships an in-flight stream registry. Required for renderer-disconnect resume. |
| `sessionCapabilities.close`        | Always.                                                                                      |
| `mcpCapabilities.http`             | The core's MCP layer supports remote HTTP MCP servers.                                       |
| `mcpCapabilities.sse`              | The core's MCP layer supports remote SSE MCP servers.                                        |
| `promptCapabilities.image`         | The provider supports multi-modal image input.                                               |
| `promptCapabilities.audio`         | Audio attachments supported.                                                                 |
| `promptCapabilities.resource_link` | Always; file references are core to this guide.                                              |

The client advertises in return:

| Client capability  | What it means for the adapter                                                       |
| ------------------ | ----------------------------------------------------------------------------------- |
| `fs.readTextFile`  | The client provides `fs/read_text_file`. The core's `read` tool MAY delegate to it. |
| `fs.writeTextFile` | Same for `write` / `edit`.                                                          |
| `terminal`         | The client provides `terminal/*`. The `bash` tool MAY delegate.                     |

Delegation is **opt-in per host**. A daemon-mode host with its own
sandboxed filesystem ignores the client's offers. An
editor-embedded host delegates so the editor's write-tracking and
approval UI is the single source of truth. Both modes are
conformant.

## Where ACP and the guide diverge

Three seams where the protocol's shape and the guide's shape do not
line up 1:1.

### Filesystem authority

The guide assumes the agent runtime owns the filesystem capability
([`foundations / locked tools`](./foundations.md#locked-fundamental-tools)).
ACP allows the client to own it instead. The adapter handles either:

- **Host-owned fs (default):** core's `read` / `write` / `edit`
  execute locally. The adapter emits `tool_call` /
  `tool_call_update` notifications so the client can render
  progress, but does not call `fs/read_text_file` /
  `fs/write_text_file`.
- **Client-delegated fs:** the adapter routes core's `read` /
  `write` / `edit` through `fs/read_text_file` /
  `fs/write_text_file`. The watchdog still runs; capability scopes
  still apply. The client's response becomes the tool's output.

The decision is per-session at `initialize` based on the client's
declared capabilities.

### Permission UX

ACP's `session/request_permission` is **synchronous** — the agent
waits for the client's response with a chosen `optionId`. The
guide's watchdog is more general: a config policy with no human in
the loop. The adapter bridges:

- A watchdog `ask` is emitted as `session/request_permission` with
  the standard option kinds (`allow_once`, `allow_always`,
  `reject_once`, `reject_always`).
- A watchdog `allow` / `deny` outcome is emitted as nothing — the
  client never sees the policy decision.
- The client's reply is recorded as a session-scoped permission
  rule if `allow_always` / `reject_always` (see
  [`session / permission scopes`](./session.md#permission-scopes)).

### Stream resume semantics

ACP's `session/load` replays the conversation history as
`session/update` notifications before returning. The guide's
resume endpoint (see
[`session / resume across renderer disconnect`](./session.md#resume-across-renderer-disconnect))
replays the **live in-flight chunk log** of an in-flight run.
These are different operations:

- `session/load`: rehydrate a finished session by re-emitting every
  past message as an update. The adapter walks the DB rows.
- `session/resume`: rejoin a session without replay. The adapter
  hands the client whatever the in-memory registry has — the
  in-flight chunk log if a run is happening, nothing if it isn't.

The guide's resume and ACP's resume agree on shape (no replay);
ACP's load adds the past-replay path.

## Naming seam

Two conventions to reconcile:

- This guide: snake_case fields, snake_case function names,
  PascalCase type names, kebab-case for path variables.
- ACP wire: **camelCase** for JSON property keys (`sessionId`,
  `toolCallId`, `optionId`), **snake_case** for discriminator values
  (`agent_message_chunk`, `tool_call_update`).

The adapter **owns the translation**. Field rename at the wire
boundary:

```text
internal (guide)        ACP wire
─────────────────────  ─────────────────
session_id          ↔  sessionId
tool_call_id        ↔  toolCallId
provider_id         ↔  providerId
model_id            ↔  modelId
parent_message_id   ↔  parentMessageId
started_at          ↔  startedAt
error_text          ↔  errorText
```

The adapter MUST NOT leak snake_case keys to the wire; the core
MUST NOT receive camelCase keys. One rename table, applied at the
seam, keeps both sides clean.

## What ACP does not cover

The protocol is intentionally narrower than this guide. Where ACP
is silent and the guide speaks:

- **Compaction.** ACP has no notion of summarizing history. The
  agent does it internally; the client sees the effect on the next
  turn's output. See [`session / compaction`](./session.md#compaction).
- **Skills and project instructions.** ACP does not standardize
  system-prompt assembly. Skills, AGENTS.md, memory — all internal
  to the agent. See [`skills`](./skills.md).
- **Subagents.** ACP does not define recursive agent-to-agent
  calls. The `task` tool runs subagents inside the host; the client
  sees one `tool_call` per spawn. Inspectable subagents
  ([`subagents / inspectability`](./subagents.md#inspectability))
  MAY be modeled as separate sessions exposed via ACP — the
  adapter chooses.
- **Per-role token tracking and cost.** ACP's recently-stabilized
  Session Usage and Context Status RFD adds usage; pricing remains
  out of scope on both sides.
- **Memory.** Out of scope; built on top
  ([`ux / memory`](./ux.md#memory)).
- **Watchdog policy.** ACP has the wire
  (`session/request_permission`) but no policy model. The guide's
  watchdog hook is the policy seat; the adapter wires it.

These are not gaps in ACP — they are concerns ACP leaves to the
agent. The guide fills them in.

## What ACP adds for the guide

- **One adapter, many editors.** Wire an ACP transport once and
  any ACP-compliant client (Zed, IDE plugins, third-party tools)
  can drive the agent.
- **Inspection / debug clients for free.** An ACP-aware test
  client can record JSON-RPC traffic — a complementary format to
  the canonical inspection format
  ([`debugging`](./debugging.md#export-formats)).
- **Cross-host portability.** A code agent that ships as an ACP
  server is usable from any host that speaks ACP, not just the
  host it shipped with.
- **A standard for delegated filesystem.** ACP's `fs/*` and
  `terminal/*` give the guide a clean answer for "what if the
  editor wants to own the filesystem?"

## Anti-goals

- **ACP is not the only outward transport.** A host that ships a
  CLI or a daemon MAY not need ACP at all — the AI SDK v6 chunk
  stream over the host's own transport (HTTP+SSE, IPC, in-memory)
  is fully conformant.
- **ACP is not a replacement for AI SDK chunks internally.** The
  core's stream shape stays AI SDK v6
  ([`foundations`](./foundations.md#streaming-substrate-ai-sdk-v6)).
  ACP wraps; it does not replace.
- **Adopting ACP does not adopt all of its RFD surface.** Adopt
  the stable methods listed above; RFD-in-flight pieces (fork,
  multi-workspace roots, telemetry) land when both ACP and this
  guide stabilize the corresponding mechanism.

## See also

- [Agent Client Protocol — official site](https://agentclientprotocol.com/)
- [Foundations](./foundations.md) — the AI SDK v6 chunk shape ACP
  wraps.
- [Session Lifecycle](./session.md) — what `session/new` / `load`
  / `resume` / `close` map onto.
- [Tools](./tools.md) — the locked tools the `kind` taxonomy maps
  to.
- [Debugging](./debugging.md) — the canonical inspection format
  ACP supplements.
