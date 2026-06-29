---
title: Agent System (WG)
description: A guide for implementing an LLM-driven agent system. Implementation-agnostic, normative, and meant to play the same role for agent runtimes that LSP plays for language tooling or that ACP plays for editor ↔ agent integration. Names the invariants every implementor MUST honor and the policies each implementor picks.
keywords:
  [
    agent,
    agent-system,
    ai-sdk,
    sqlite,
    sessions,
    tools,
    skills,
    subagents,
    compaction,
    mcp,
    sandbox,
    streaming,
    rewind,
    forking,
    spec,
    guide,
    acp,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Agent System (WG)

This is a guide for implementing an LLM-driven agent system —
implementation-agnostic, normative, and meant to play the same role
for agent runtimes that the
[Agent Client Protocol](./acp.md) plays for editor ↔ agent
integration, or that the Language Server Protocol plays for language
tooling.

It answers one question: _what is an agent system that hosts a code
agent, a design agent, or any other task-agnostic agent without
rewriting the core?_

The shape is host-agnostic: it holds for a local AgentHost, a cloud
sandbox runtime, a CLI, an IDE plugin, a hosted multi-tenant
service. UX (window, panel, picker) is out of scope except where a
UX requirement reaches back into the protocol.

## Conventions

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**,
**MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

| Identifier shape                  | Convention used in this guide                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Field, column, and function names | `snake_case`                                                                                                         |
| Path variables                    | `kebab-case` (e.g. `{user-data}`, `{workspace}`)                                                                     |
| Type names                        | `PascalCase` (e.g. `SessionStatus`, `ChatSessionRow`)                                                                |
| ACP wire identifiers              | Carried verbatim from upstream (`camelCase`); translated at the seam. See [ACP / naming seam](./acp.md#naming-seam). |

## Vocabulary

- **Agent** — a config object: a system prompt + a tool list + a
  resolved model. Agent-as-data, not agent-as-class.
- **Session** — one conversation. Carries messages, parts, token
  rollups, and a parent pointer for forks. Persistent; survives the
  client process.
- **Turn** — one round-trip from a user message through assistant
  output (text, reasoning, tool calls, tool outputs) to a finished
  state. The unit a user can rewind to.
- **Tool** — a self-describing capability the agent can invoke. The
  set of fundamental tools is locked across agents; MCP tools and
  skills extend it without changing the contract.
- **Runtime** — the per-run capability surface handed to the agent
  (fs, net, shell, stream). Backed by a sandbox the agent does not
  see.
- **Host** — the process that loads the agent system. Desktop app,
  CLI, server, cloud sandbox. The host decides UI; the system
  decides protocol.
- **Environment** — where the host (and therefore the agent) runs:
  web, cloud sandbox, or computer. See
  [`environments`](./environments.md).

## What this is

A **normative guide**:

- Names the invariants every implementor MUST honor for an agent
  to be portable.
- Names the policies each implementor picks for their product
  shape.
- Specifies the wire-level shapes (session schema, chunk vocabulary,
  result envelope) that two conforming implementations agree on.

## What this is not

- A model-provider router. Provider selection (Anthropic, OpenAI,
  cloud gateways, BYOK) is a sibling concern. The guide only
  requires that whichever provider is picked feeds the same
  AI-SDK-v6 chunk shape.
- A UI framework. Window / tab / sidebar / picker decisions belong
  to the host. The guide touches UX only where UX requirements
  bend the protocol (compositor format, sidecar forking, queued
  sends).
- A billing engine. Usage rollups land on the session row so a
  billing layer can read them; pricing is not the agent system's
  job.
- A multi-agent orchestration graph. Agents call subagents through
  the locked `task` tool; there are no chains, no DAGs, no shared
  cross-run state.

## Pages

The guide is organized as a set of pages. Read [Foundations](./foundations.md)
first; the rest can be read in any order.

| Page                                           | Covers                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Foundations](./foundations.md)                | Bedrock: AI SDK v6 chunk shape, directory-rooted execution, the locked tool set summary, watchdog placement, web search, cross-cutting invariants.                                                                                                                                                                                                                                                                                   |
| [AI SDK (reference substrate)](./ai-sdk.md)    | Implementor's annex to AI SDK's own docs. The token-usage cache normalization rule, where the SDK's tool-loop helper fits, what the RFC adds on top of the substrate.                                                                                                                                                                                                                                                                |
| [Runtime Environments](./environments.md)      | Web / cloud sandbox / computer. Which capabilities each environment exposes; how the locked tool set degrades; sandbox primitives.                                                                                                                                                                                                                                                                                                   |
| [Sandbox Runtime (srt)](./srt.md)              | srt as the reference implementation of the `computer` environment's sandbox primitive. Capability surface, platform support, what the protocol does and does not lock to.                                                                                                                                                                                                                                                            |
| [Session Lifecycle](./session.md)              | Context tracking, rewinding, forking, compaction (auto + manual + failure), per-turn model switch, streaming, interruption, session status, permission scopes.                                                                                                                                                                                                                                                                       |
| [Persistency](./persistency.md)                | Storage engine, the three-table schema, save policy, ID strategy, JSON discipline, event-log opt-in, schema evolution.                                                                                                                                                                                                                                                                                                               |
| [Turn Queue](./queue.md)                       | The single point where competing demands to start a turn on one session are serialized. Turn-ingestion model, `queued_at`, the run-state machine and its drain, drain discipline (serial vs coalescing), stop-with-a-queue semantics, queued-message operations (cancel / edit / reorder), the single-flight / FIFO / no-preemption invariants, drop rules, restart behavior, and the core-vs-surface boundary.                      |
| [Turn Authority](./turn-authority.md)          | The host states what happened; the client renders it. Why a client must not infer which queued message became a turn, the fired-message identity and started/finished/aborted transitions the turn-lifecycle wire must carry, clients-as-pure-renderers, and the migration off a state-only status channel.                                                                                                                          |
| [Lifecycle Events](./events.md)                | The multi-subscriber session-lifecycle event channel: `turn-started` / `turn-finished` / `approval-requested` vocabulary, volatility and ordering semantics, the host-wide projected stream, the notification consumer policy (focus gating, click-to-attend, the anti-drift guards on the when-to-notify table), the obligation a foreign backend adapter (e.g. ACP) takes on, and the boundary against a user-facing hooks system. |
| [Tools](./tools.md)                            | The locked fundamental set, the tool contract, capability requirements, result envelope, truncation, watchdog at the tool boundary, ACP `kind` mapping.                                                                                                                                                                                                                                                                              |
| [MCP and Connectors](./mcp.md)                 | User-plugged MCP servers, lazy materialization, `tool_search` for bulk discovery, OAuth, dynamic refresh, the untrusted-by-default trust policy.                                                                                                                                                                                                                                                                                     |
| [Skills and Project Instructions](./skills.md) | Two layers of knowledge: skills (lazy, advertise-then-load) and project instructions (eager, unconditional). Discovery sources, manifests, decision matrix.                                                                                                                                                                                                                                                                          |
| [Binary file handling](./binary.md)            | Glossary / reference. Three resolution paths (provider-native multimodal, skill-per-format, shell-based conversion), the format matrix (pdf / zip / pptx / psd / fig / …), the scratch-space pattern for archive extraction.                                                                                                                                                                                                         |
| [Visual perception](./vision.md)               | The read/view modality split: why seeing a source as pixels is a separate tool from reading it as text. The perception-tool contract, the input matrix (bitmaps now, rendered svg / text later), result-to-image lowering that reproduces from the persisted record, and the retention policy that evicts only re-viewable perceptions so pixels don't re-fill context every turn.                                                   |
| [Subagents](./subagents.md)                    | The `task` tool, agent modes, blocking vs background, recursion, permission inheritance, inspectability, awareness, specialized subagents, opinionated patterns.                                                                                                                                                                                                                                                                     |
| [Plan Mode](./mode-plan.md)                    | Plan mode as a host-owned operating regime: the plan/build pair, the four-invariant transition contract (mode is injected context not model state; the agent proposes but never effects a switch; transitions are human-gated re-injections; the plan is a reviewed artifact), entry/exit symmetry, who may initiate a transition, and the read-only harness with its single carve-out.                                              |
| [Triggers](./triggers.md)                      | Non-human-originated turns. Schedule / external webhook / programmatic API / agent self-schedule / MCP-pushed event sources. Trigger envelope on `metadata_json.trigger`, queue semantics, interactive-vs-hosted execution, lifecycle bounds, auth and trust.                                                                                                                                                                        |
| [Compositor](./compositor.md)                  | User intent representation. The multipart user-message shape, file refs vs attachments, inline commands, mentions, editor context (host-emitted selection / open / cursor / recent-action), attachment handling, and the user-view-vs-model-view lowering rules.                                                                                                                                                                     |
| [UX Patterns](./ux.md)                         | What rides on top of the compositor: queued sends, sidecar chat as ephemeral fork, memory as a built-on-top layer.                                                                                                                                                                                                                                                                                                                   |
| [Debugging](./debugging.md)                    | The canonical inspection format, export paths, what an inspection tool MUST expose, replay semantics, the DX checklist.                                                                                                                                                                                                                                                                                                              |
| [Local Daemon](./daemon.md)                    | The agent server as a long-lived, discoverable local process. Discovery contract (registration record, persistent credential, atomic publish, single-daemon convergence), the authenticated probe and protocol gate, connect-or-spawn, the browser exception, production shape, browser-engine conformance harness.                                                                                                                  |
| [ACP Integration](./acp.md)                    | The [Agent Client Protocol](https://agentclientprotocol.com/) as the default outward wire. Method mapping, capability matrix, where the protocol and the guide diverge.                                                                                                                                                                                                                                                              |
| [ACP Provider Class](./acp-provider.md)        | Decision/RFD: whether to host an agent-provider class — Grida as ACP consumer driving an external Claude/Codex on the user's own subscription. The forever-cost ledger, the narrow delta over BYOK, and a reversible path. Umbrella over the provider profiles below.                                                                                                                                                                |
| [ACP Provider: Codex](./acp-provider-codex.md) | Provider profile for consuming Codex from an external ACP-consuming agent system. What Codex provides, how to adapt its thread/event surface, and where tool and image-generation control ends.                                                                                                                                                                                                                                      |
| [FAQ](./faq.md)                                | Question-and-answer index over the guide. Doubles as an entry point and as a conformance test — if a Q cannot be answered from the RFC, the RFC owes a clarification.                                                                                                                                                                                                                                                                |

## Cross-cutting invariants

The following hold across every implementor:

| Layer                 | Invariant                                                             | Policy                                                                  |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Loop                  | One universal LLM loop drives any agent                               | Native vs AI SDK runtime path; cancel semantics                         |
| Scheduling            | One turn per session; queued by `queued_at`, FIFO, no preemption      | Status transport; throttle / dedup caps; whether triggers are supported |
| Agent                 | Agent-as-data: `{ manifest, tools, system_prompt }`                   | Where the manifest lives; how it is compiled                            |
| Tools                 | Locked fundamental set; self-describing parameters                    | Which tools beyond the lock; how MCP is surfaced                        |
| Session               | Three-table shape: `chat_sessions` / `chat_messages` / `chat_parts`   | DB engine (SQLite default; alternatives); event-log opt-in              |
| Streaming             | AI SDK v6 chunk shape internally                                      | Transport (SSE / IPC / WS); resume semantics                            |
| Outward protocol      | ACP-conformant when an external client speaks ACP                     | Whether to ship an ACP adapter; which capabilities to advertise         |
| Compaction            | Auto-fire on overflow; user-fire on demand; failure modes named       | Threshold tuning; which model summarizes; tail-budget                   |
| Skills                | Discovered once; names + descriptions injected; body loaded lazily    | Where to look; remote-skill fetch policy                                |
| Subagents             | Same loop, gated by intersected permissions; deny rules unconditional | Recursion limit; whether parent inspects child                          |
| Sandbox               | Capability surface, not free spawn                                    | OS-level enforcement (seatbelt / landlock / VM); per-call sub-policies  |
| Persistence           | Save on every chunk by default                                        | Storage engine; write-buffer trade-off                                  |
| Model switch per turn | Allowed; carries to the next turn                                     | What to do if new model has smaller context (force compaction vs error) |

## Abstract

### What matters most

The single decision that compounds across every other one is whether
the system treats an agent as **data** or as **code**. An
agent-as-data system publishes a config (`{ manifest, tools,
system_prompt, model? }`) and runs one universal loop over it. An
agent-as-code system publishes a function per agent.

This guide picks agent-as-data because:

- Specialization is cheap. A "title" agent, a "summary" agent, a
  "compaction" agent are all the same loop with different config.
- The system is inspectable. Diff two agent configs to see what
  changed.
- The runtime is auditable in one place — one stream loop to read,
  one abort path, one permission gate.

Everything else in the guide follows from that choice.

### Properties that follow

- **Dynamic, task-agnostic workflow.** A code agent and a design
  agent differ only by manifest. Adding a new agent type does not
  rewrite the loop, the session schema, the streaming layer, or
  the tool contract — it adds a config.
- **Parallel workflow.** A subagent is the same agent loop on a
  child session. The parent's loop continues while children run;
  results return as tool outputs. Parallelism is a function call,
  not a new framework. See [`subagents`](./subagents.md).
- **Safety and harness.** The agent never touches the OS directly.
  Every shell call, every file read, every network fetch goes
  through a capability the runtime declared. The runtime sits on
  top of a sandbox the host owns. See
  [`environments`](./environments.md).
- **Watchdog.** A pre-execute hook on every tool call can refuse
  with a reason that goes back to the model. Policy is host
  configuration. See [`tools / watchdog`](./tools.md#the-watchdog).
- **Web search.** Locked tool by frequency, special case by
  implementation (cannot be done in-house). The tool abstracts over
  which provider the host wires up. See
  [`tools / web search`](./tools.md#web-search).

### Stress tests

The guide is task-agnostic, but it pays to test it against the
agents it targets:

- A **code agent** — long-running, file-heavy, shell-heavy,
  occasional web search. Exercises `fs.*`, `shell.run` with
  sub-policies, rewind-to-edit, hour-long session compaction.
- A **design agent** — file-light, model-call-heavy, tool-arg-heavy
  (vector diffs as tool calls). Exercises tool-output streaming,
  fast rewind, per-turn model swaps between cheap and premium tiers.
- A **research / write agent** — web-heavy, low write traffic.
  Exercises web search, subagent fan-out for parallel reading,
  queued sends.
- A **scripted job agent** — runs unattended on a queue.
  Exercises the watchdog, the canonical inspection format,
  permission policies with no human in the loop.

A change that breaks any of these four is a wrong move.

## See also

- [Agent Client Protocol](https://agentclientprotocol.com/) — the
  upstream protocol the [ACP integration](./acp.md) page maps onto.
- [AI SDK v6](https://sdk.vercel.ai/) — the chunk-shape substrate
  the guide pins.
- [Grida bindings](../grida/index.md) — the sibling layer that binds
  this RFC to Grida's actual surfaces (canvas, image tools, fundamentals
  as shipped).
