---
title: Session Lifecycle
description: How a session is born, grows, survives interruption, is compacted, rewound, or forked, and how it switches models per turn. The loop semantics, the chunk stream, the abort path, the run-state machine, the permission-scope layering, and the session-status back-channel.
keywords:
  [
    agent-system,
    session,
    context,
    tokens,
    compaction,
    rewind,
    forking,
    model-switch,
    streaming,
    interruption,
    status,
    permission-scopes,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Session Lifecycle

A session is the unit of state. Everything an agent does — read,
write, call a tool, switch model, fork, restart — lands here. This
page covers the **lifecycle** (what happens between session-open and
session-close) and the **runtime mechanics** (streaming, abort,
status). The storage shape lives in [`persistency`](./persistency.md);
the structures referenced here are detailed there.

## Sessions, messages, parts

A session contains messages; a message contains parts. The shape is
the AI SDK v6 message + part model. See
[`persistency / three-table schema`](./persistency.md#the-three-table-schema)
for the column-level shape.

The two properties this guide relies on:

- **Messages are append-only.** A user turn is a new row; an
  assistant reply is a new row. Existing messages are never
  rewritten.
- **Parts are upserted while the stream lands.** Text grows; tool
  calls transition `input-streaming → input-available →
output-available` on the same row keyed by `tool_call_id`. An
  aborted run leaves the partial state truthful on reload.

When the agent is fronted by an [ACP](./acp.md) adapter, the session
`id` is the same handle ACP returns from `session/new` and accepts
on `session/load` / `session/resume` / `session/close` — one
identifier across both layers.

## Context window tracking

Tokens are tracked **per role on every assistant message** and rolled
up to the session row:

```ts
chat_messages.metadata_json: {
  usage: {
    input,        // user + system tokens this step consumed
    output,       // tokens the model produced this step
    reasoning,    // thinking-token charge, when the model emits one
    cache_read,   // tokens served from the provider's prompt cache
    cache_write,  // tokens written to the provider's prompt cache
  }
}
```

Session-level token rollups (`prompt_tokens`, `completion_tokens`,
`reasoning_tokens`, `cache_read`, `cache_write`, `total_tokens`) are
sums of the above across the assistant messages that currently count
toward the model context.

### Why the breakdown

- **Compaction needs `input + output + cache_read + cache_write`**
  to decide whether the next turn will overflow. Cache reads still
  count against the context window; only the **charge** for them is
  lower.
- **Cost reporting needs `reasoning` separate.** Providers price
  reasoning tokens at the output rate but report them separately;
  rolling them into `output` hides cache-vs-thinking ratios that
  matter for picking a tier.
- **Cache write vs cache read tells the picker how much of the
  conversation is hot.** A session at 80% cache hit can sustain ten
  more turns; one at 5% cannot.

### Source of truth

The AI SDK's per-step `onStepFinish` callback delivers a `usage`
object per turn. The recorder bumps the session row from there,
NEVER from `finish-step` chunks on the wire — keeping one source of
truth avoids double-counting when an SDK update starts emitting
both.

The SDK's `inputTokens` field already **includes** the cache-read
and cache-write counts. The recorder MUST subtract them out before
persisting `prompt_tokens`, or the cache columns get double-counted
in the session rollup. See
[`ai-sdk / token usage`](./ai-sdk/index.md#token-usage-the-cache-normalization-rule)
for the exact formula and the per-component mapping.

### Cost

Cost is a derived view over per-turn `{ model, usage }`, not
authoritative session state. An implementation MAY keep a legacy or
cached cost column for compatibility, but the canonical cost input is
the assistant message metadata plus the current model catalog pricing.
Cost is cumulative spend: it includes assistant turns that were later
hidden by rewind or excluded from the live context by compaction,
because those turns were still charged.

The recorder MUST NOT hard-code pricing. It records provider usage and
the model that produced the turn; the pricing table lives with the
model catalog.

### What "the context window" means here

The number compared against the model's limit is:

```text
context_window_used =
    chat_sessions.prompt_tokens +
    chat_sessions.completion_tokens +
    chat_sessions.reasoning_tokens +
    chat_sessions.cache_read +
    chat_sessions.cache_write
```

Not the wall-clock total tokens billed (that includes per-turn
re-reads). Not just `input + output` (that misses reasoning and
cache).

## Rewinding

A user MUST be able to rewind to a prior **user message** and edit
or resend it. The unit is the user message because:

- Assistant turns are non-deterministic; "rewind to the assistant's
  word 47" is meaningless when the next run produces different
  words.
- The user message is the only deterministic checkpoint the user
  controls.
- A turn-pair (user, assistant) is the unit of rollback in every
  chat product the user has used.

### What happens on rewind

1. The user picks a prior `user` message. The UI shows the message
   body in the editor; the user edits or accepts.
2. The system **soft-truncates** the conversation: every message and
   part after the chosen one is marked invisible to the next LLM
   call.
3. The user submits. A new turn appends after the chosen message;
   the model sees the conversation as if everything after the
   rewind point never happened.
4. The hidden messages remain in the DB for inspection, un-rewind,
   and audit. They are NOT deleted.

### Soft-truncate vs delete

Soft-truncate (a `hidden_at` per message) is the required shape. It
preserves history for inspection and lets a user un-rewind by moving
the pointer back. An implementation that hard-deletes on rewind
trades inspection for storage, and SHOULD document the loss.

### Side-effect rewind

A rewound turn MAY have created files, run a shell command, or hit
the network. The agent system does NOT undo side effects on rewind.
Rewind is a **prompt rewind**, not a **world rewind**.

A host that wants world-rewind (a code agent that restores the
workspace to its state at message N) ships a workspace-snapshot
layer that hooks on user messages and tags the snapshot id into the
message metadata. The contract:

- A user-message metadata field `snapshot_id?: string` that hosts
  populate when they snapshotted the world at submission time.
- A hook point (`message.user`, the same hook permission rules use)
  fires before the message lands, giving the host's snapshot layer
  a place to attach.
- On rewind, the host reads `snapshot_id` off the target message
  and restores. The guide is silent on **how** (git patches, VM
  snapshots, copy-on-write filesystems are all valid).

Without a snapshot layer, rewind is prompt-only. With one, the same
flow restores both.

### Rewinding past a compaction

A compaction does not hide the turns it summarized — they stay in the
linear log, and the model boundary is read-time (`tail_start_id`). The
summary marker sorts at the bottom (stamped at invocation time), so
rewinding to any earlier message naturally hides the marker along with
everything after the target. That **removes the boundary**, re-exposing
the full pre-target history to the model — no special un-hide step is
needed. Nothing is deleted, so an un-rewind restores it. Implementations
that hard-delete on compaction lose this property; they MUST NOT.

## Forking

A **fork** is a new session whose `parent_id` points back to the
parent and whose `parent_message_id` points to the fork point. The
new session starts with a copy of the parent's messages up to and
including the fork point; new turns append only to the fork.

### `fork` API

```ts
fork({
  parent_session_id: string,
  from_message_id: string,    // a chat_messages.id reachable from parent_session_id
  metadata?: object,          // merged into the new session's metadata_json
}) → ChatSessionRow            // the newly created session
```

Behavior:

- The runtime MUST reject the call if the parent session has a run
  in flight (`SessionStatus.state != "idle"`); a 4xx-equivalent
  error is returned.
- The runtime MUST copy every non-hidden message up to and
  including `from_message_id` into the new session with new ids.
  Parts are copied verbatim.
- Token rollups MUST be recomputed from the copied messages, not
  copied from the parent's row.
- The `metadata` blob is merged into the new session's
  `metadata_json`. `metadata.ephemeral = true` is the convention
  for sidecar forks; see [`ux / sidecar`](./ux.md#sidecar-chat).
- The new session's title is **derived, not copied**: the parent's
  title with a ` (copy)` suffix, so the duplicate is distinguishable
  in the picker. If the parent is still untitled (`New Chat`), the
  fork stays untitled so the auto-titler names it from its own
  first turn. The title is only a _starting_ value — there is no
  maintained link to the parent (lineage lives in `parent_id` /
  `parent_message_id`). One source of truth: `session/title.ts`
  (`session_title.forFork`).

### Why a new session and not a tree on one session

- Each fork needs its own running stream, its own token rollup,
  its own model selection. A session is the natural unit.
- Two forks MUST be inspectable side by side. Two rows are
  easier to render than one row with a tree shape.
- The picker shows forks as siblings under the parent without
  schema gymnastics — `SELECT * FROM chat_sessions WHERE parent_id
= ?`.

### What gets copied on fork

- Every message and part up to and including the fork point. The
  copies have new ids; their `data_json` is verbatim from the
  source.
- The session row's settings (agent, model, workspace, metadata).
- Token rollups for the copied turns. The fork starts with the
  same `total_tokens` the parent had at the fork point.

### What does NOT get copied

- Side effects the parent took. A fork copies the conversation,
  not the workspace. If the host wants a workspace-snapshot fork,
  it layers it on the message metadata (same hook as
  side-effect rewind).
- The parent's in-flight run, if any. A fork CANNOT be taken off a
  running turn; the user MUST wait for the parent's turn to finish
  or abort.

### Sidecar = ephemeral fork

A sidecar chat (the "ask the model a side question without messing
up the main thread") is exactly a fork — same wire, same shape —
with one UX twist: the host marks the fork _ephemeral_, hiding it
from the picker. The schema gains nothing; the host filters on a
metadata flag. See [`ux / sidecar`](./ux.md#sidecar-chat).

## Compaction

Compaction is the act of replacing a stretch of conversation history
with a summary, freeing tokens for the next turn. It is **not
optional** above the model's context window. An implementation that
ships a "the chat just stops working" failure mode is shipping a
bug.

### Threshold

Compaction fires when **usable** context is exceeded:

```text
usable = model.context_limit - reserve
context_window_used >= usable  →  fire compaction
```

`reserve` is the headroom kept for the next turn's output and
reasoning. Default: `min(20k tokens, model.max_output)`.
Implementors tune for product shape (a code agent that emits long
diffs needs a larger reserve; a chat agent does not).

The threshold is **per-model**. A 200k model and a 1M model fire at
different absolute token counts. A session that switches model
mid-conversation (see [Per-turn model switch](#per-turn-model-switch))
re-evaluates against the new model's limit before the next turn.

### Auto vs manual

- **Auto-compaction** is the default. The system fires it before the
  next overflow and replays seamlessly. It keeps a **rolling verbatim
  tail** of `N = tail_turns` (default 2) recent turns and summarizes
  everything older — it fires mid-conversation, so it must keep recent
  context intact.
- **Manual compaction** lets the user fire it on demand (a slash
  command, a button). It is **not threshold-gated** — it fires
  regardless of how full the context is — and it **summarizes everything
  up to the invocation point** (no verbatim tail held back): the user
  asked, so compact what's there. The model then continues from the
  summary alone.

Both produce the same artifact and place the marker the same way (see
[What compaction produces](#what-compaction-produces)); the trigger and
the verbatim-tail depth (auto keeps `N`, manual keeps none) are the only
differences.

### What compaction produces

A **compaction part** (`type: "data-compaction"`) on a synthetic
assistant message. The part's `data_json` carries:

```ts
{
  summary: string,            // Markdown body, sectioned (Goal / Progress / Decisions / Next Steps is a reasonable shape)
  tail_start_id: string|null, // chat_messages.id of the first message kept verbatim; null when nothing is kept (manual)
  auto: boolean,              // true for auto-compaction, false for user-fired
  summary_tokens: int,        // token count of `summary`, for the next rollup
}
```

The marker is **stamped at the moment of compaction**, so it sorts
**last** in creation order — at the bottom of the transcript, where
compaction was invoked.

The summarized head is **not hidden or deleted** — the log stays linear
and complete. What the _model_ sees is resolved at **read-time** from the
latest marker's `tail_start_id`: the summary plus every message from
`tail_start_id` onward (or just the summary, when `tail_start_id` is
`null`). The user-facing transcript keeps the full history with the
marker rendered inline as a divider; only the model view collapses.

### Tail preservation

**Auto** compaction keeps the **N most recent turns** verbatim. Default
`N = 2` (one user message + one assistant response). The tail budget
caps at ~25% of `usable`. If the tail at N=2 exceeds the budget, the
implementor either:

- Drops to N=1 (last turn only).
- Splits the last turn (keep the last user message and the
  assistant's final text; drop intermediate tool calls and reasoning).

Default: "drop to N=1 and warn". "Split the last turn" is for agents
that habitually run long tool chains.

**Manual** compaction keeps **no verbatim tail** — it summarizes the
whole conversation up to the invocation point (see
[Auto vs manual](#auto-vs-manual)).

### Summarizer cost discipline

The summarizer is a **specialized subagent** running the same loop.
See [`subagents / specialized subagents`](./subagents.md#specialized-subagents).

Required discipline:

- Cheapest model the provider exposes (`nano` / `small` tier).
- Low temperature.
- Hard `maxOutputTokens` cap.
- Short timeout.
- A specialized system prompt that constrains output format.
- No tools.
- `mode: "subagent"`, `inspectable: false`.

The summarizer's input is the soft-hidden history; its output lands
in the CompactionPart. One model call, one shot.

### Failure modes

| Failure                                  | Trigger                                              | Recovery                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Transient (network, provider 5xx)        | Summarizer call failed once                          | Retry with backoff. The main session blocks on retry up to N seconds, then proceeds without compaction (warning logged). |
| Spec limit (history > model's input cap) | Sum of soft-hidden history exceeds the model's input | **Hard failure.** Surface to the user; suggest a new session or a tool-output prune first.                               |
| Best-effort prune                        | Spec-limit failure, prune is on                      | Run a tool-output prune pass: erase `output` of completed tool calls (keep input + result-truthy state), then retry.     |
| Soft / smart fallback                    | Spec-limit failure, prune still insufficient         | Split soft-hidden history into chunks; summarize each; concatenate. Or drop the middle and keep head + tail.             |

The implementor's compaction config:

```jsonc
{
  "reserve_tokens": "int", // headroom for next turn (default 20000)
  "tail_turns": "int", // recent turns to keep verbatim (default 2)
  "tail_budget_pct": "float", // tail token budget as fraction (default 0.25)
  "retry_on_transient": "int", // retry count on transient failure (default 2)
  "smart_recovery": {
    "prune_tool_outputs": "bool", // try output prune before chunked summarize
    "chunked_summarize": "bool", // summarize in chunks if one-shot won't fit
    "drop_middle": "bool", // last-resort: keep head + tail, drop middle
  },
}
```

The shape is normative; the defaults are reasonable starting points.

### Tool-output pruning vs compaction

Tool-output pruning is a **separate, cheaper pass** that runs before
a real compaction is attempted:

- Walk backwards through completed turns.
- For each completed tool call, if its output is large and not
  referenced in the current task (a "protected" tool — `todo`,
  `task` state, the model's most recent files), drop the output
  and keep the tool's input + a stub like `<output pruned, N
tokens>`.
- Stop once enough tokens are reclaimed.

Pruning preserves the conversation's logical structure; the model
still sees "I called `read` on file X" without re-reading X's
contents. A code agent that ran 30 `read`s usually only needs the
last 5 in context.

Pruning MAY be triggered:

- Automatically before compaction (cheap, often enough).
- Manually by the user ("free some space").
- Periodically on a token threshold lower than the compaction
  threshold (e.g. at 60% context prune; at 90% compact).

## Per-turn model switch

The model is **per-message, not per-session**. A user MAY pick a
different model on any turn, and the new model carries forward
until they pick again.

**Shape.** The user message metadata carries `{ provider_id,
model_id, variant? }` for that turn. The session row's `model_json`
is the **most recent** active model — a denormalization for the
picker so it can render "Currently using X." Historical use is
queryable from the messages.

**Why per-message and not per-session.**

- Users push the same prompt through cheap and premium models to
  compare. Forcing a new session for each pin is hostile.
- Compaction uses a cheap model. If model were a session attribute,
  compaction would swap and swap back, racing with the user's own
  swap.
- Variants (reasoning mode, JSON mode, thinking depth) are per-turn
  by their nature. A reasoning-mode toggle that lasts the session
  is a bug.

### Compaction interacts with model switch

| Scenario                                              | Behavior                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New model has **larger** context than current usage   | No-op. Conversation proceeds.                                                                                                                                     |
| New model has **smaller** context, but next turn fits | No-op. Conversation proceeds.                                                                                                                                     |
| New model's context cannot fit the **current** rollup | **Force compaction before the turn proceeds.** The next user message blocks on the summarizer.                                                                    |
| After compaction, history still does not fit          | The model swap fails. Surface to the user: "Switching to a model with a smaller context window would lose the conversation; consider forking with the new model." |

Forking is the escape hatch for the last case: a fork with the
new model has only the parent's tail in scope (or the user manually
picks the slice).

## System prompt assembly

Every turn assembles a fresh system prompt from these sections, **in
this order**, top to bottom:

1. **Agent manifest prompt** — the agent's intrinsic system prompt.
2. **Project instructions** — concatenated `AGENTS.md` /
   `CLAUDE.md` / `CONTEXT.md` content, walked from the outermost
   file inward (nearest-last, so the project root has the final
   word). See [`skills / project instructions`](./skills.md#project-instructions).
3. **Skill index** — names + one-line descriptions of every
   discovered skill. Bodies load on demand. See
   [`skills`](./skills.md).
4. **Environment context** — platform, workspace root, git status,
   current date, resolved model + variant.
5. **Tool catalog** — JSON Schema for every active tool (locked,
   agent-specific, materialized MCP).

The order is normative; implementors MUST NOT shuffle the sections.
Two implementations that follow this order produce digest-comparable
prompts for the same inputs.

Optional `system_prompt_digest` storage MAY persist a SHA-256 of the
assembled prompt on each assistant message; see
[`persistency / metadata conventions`](./persistency.md#chat_messages).

## Streaming and layering

The core emits **AI SDK chunks** to a transport the host owns. The
core does NOT render anything.

```text
┌─ Agent system core ──────────────────────────────────────────────┐
│  run(session, input, model)                                      │
│  → AsyncIterable<UIMessageChunk>                                 │
│                                                                  │
│  one universal LLM loop:                                         │
│   - assemble system prompt (see above)                            │
│   - call model (native runtime or AI SDK adapter)                │
│   - emit chunks                                                  │
│   - on tool call: validate args, capability check, watchdog,     │
│     execute, emit tool-output chunks                             │
│   - loop until no tool calls or abort                            │
└──────────────┬───────────────────────────────────────────────────┘
               │  same chunk shape, two consumers
               │
       ┌───────┴────────┐
       ▼                ▼
   recorder         host transport
   (writes parts    (SSE / IPC / WS / in-memory)
    to the DB)              │
                            ▼
                       client / renderer
                       (drops chunks into the AI SDK reducer;
                        renders to user)
```

### Strict layering

- The core MUST NOT know whether the host transport is SSE, IPC,
  WebSocket, gRPC, or in-memory.
- The host MUST NOT know how the chunks were produced (native
  runtime vs AI SDK adapter).
- The client / renderer MUST NOT know about the recorder.

### The renderer's only job

The renderer renders. It does NOT own the recorder. It does NOT
own model selection. It does NOT own permission state. These
belong to the core because they survive the renderer being closed.

### Resume across renderer disconnect

A renderer that closes its connection mid-stream (page refresh, OS
sleep, window close) MUST NOT cancel the upstream model call. The
required behavior:

- The core keeps the model call alive while at least one consumer
  is attached. The recorder is always attached for the run's
  lifetime.
- A reconnect endpoint, given the session id, replays the chunk log
  from the start and live-tails until the upstream finishes.
- Replay starts from index 0 (not from a cursor). The AI SDK
  reducer rejects `text-delta` for a part it has not seen
  `text-start` for; cursor-based resume would require chunk
  rewriting and is not worth the complexity.

**Lifespan of the live stream registry.** In-process, in-memory,
keyed by session id. A host restart drops every entry; the renderer
falls back to hydrating from the DB. **Cross-restart resume is out
of scope** — the upstream provider has no notion of "your previous
request."

**Orphaned in-flight tool calls on restart.** A `tool-input-available`
part with no matching `tool-output-*` companion MUST be finalized as
a tool-error envelope (`"aborted by host restart"` or equivalent)
before the next run on that session is allowed. Without finalization
the assembled prompt would contain an unresolved tool call and the
loop could not proceed. The rule applies to every tool — `bash`,
`web_fetch`, MCP calls, `task` — uniformly.

**Multi-replica deployments.** The in-memory registry assumes one
process owns the session. A horizontally-scaled deployment (multiple
replicas behind a load balancer) MUST swap the in-memory map for a
pubsub layer so any replica can subscribe to a stream another
replica is producing. [`vercel/resumable-stream`](https://github.com/vercel/resumable-stream)
is one option that matches this shape (Redis-backed pubsub, same
chunk vocabulary). The protocol does not change — replay still
walks the DB, live resume still hooks the registry — only the
registry's storage moves out of process.

**ACP mapping.** An ACP-fronted host exposes two resume-style
methods: `session/load` (replay every past message as a
`session/update` notification — used after a host restart) and
`session/resume` (rejoin without replay — used by a reconnecting
client that already has the history). Both map onto this layer;
`load` walks the DB rows and `resume` hooks into the in-memory
registry. See [ACP integration](./acp.md#stream-resume-semantics).

## Interruption

The user MUST be able to abort the assistant mid-turn. The abort
path:

1. The host's UI surfaces an abort button.
2. The host calls `abort(session_id)`.
3. The core's per-session run state holds an `AbortController`. The
   controller's signal is the one passed to the model call and to
   every tool's `execute`.
4. `abort()` calls `controller.abort()`. The model call cancels at
   the next chunk boundary; tools that watch the signal cancel
   themselves; tools that do not watch finish naturally.
5. The recorder finalizes the in-flight assistant message. Tool
   calls in `input-streaming` or `input-available` stay frozen in
   that state. Text in flight stops where it stopped.

### Abort vs TCP close

A renderer that closes its TCP connection has **not** aborted; it
has **detached**. The model call keeps going; the recorder keeps
writing. Only an explicit abort (its own endpoint) cancels.

"TCP close" here is shorthand for **any transport-level stream
teardown** — a TCP FIN, a WebSocket close, an IPC channel drop, or a
consumer cancelling the chunk stream it was reading. None of these is
an abort. A transport that wires stream teardown to the abort endpoint
collapses the two and silently re-introduces this loss: the run dies
because the client stopped reading it, not because the user asked it
to stop.

The cost of distinguishing the two is one endpoint. The cost of
collapsing them is a user who refreshed mid-stream and lost every
already-spent token.

### Subagent abort

Aborting the parent's run aborts every subagent spawned by that
run. The signal propagates through the `task` tool's
implementation: a child session running on the parent's abort
signal sees the abort, stops, and its tool call returns an "aborted
by parent" error.

## Session status

The streaming layer is one-directional (core → transport → client).
**Session status is the back-channel** — what a client uses to know
whether the session is currently running, retrying, or idle,
without subscribing to the chunk stream.

Shape:

```ts
SessionStatus = {
  state: "idle" | "busy" | "retrying" | "error",
  attempt?: int,         // current retry attempt, when state="retrying"
  message?: string,      // human-readable status, when state="retrying" | "error"
  started_at?: int,      // epoch ms; present when state="busy" | "retrying"
}
```

**Where it lives.**

- **Authoritative source:** an in-memory map keyed by session id,
  owned by the core, mutated by the run-state machine (the machine
  itself — states, single-flight, and the drain — is specified in
  [Turn Queue](./queue.md)).
- **Subscription transport:** an event stream on the host's bus.
  The event payload is the `SessionStatus` shape.
- **Read API:** `get_status(session_id) → SessionStatus` for
  consumers that join late.

**Not persisted.** Status is volatile. On host restart, every
session reads as `idle` — correct, because no run is in flight after
a restart.

**One run per session at a time.** The state machine never runs two
turns on one session in parallel. A turn-triggering message that
arrives while `state != "idle"` is **queued, not rejected** — the
core persists it and fires it when the session next goes idle, per
the [Turn Queue](./queue.md) contract. A host MAY read status to
surface "you have a turn already running," but it does not have to
gate submission on it; the queue handles the busy case. `error` is
not terminal — it clears on the next fired turn (a user retry, an
edit-and-resend, or an explicit resume), at which point the machine
transitions to `busy` and follows the normal lifecycle. A hard error
pauses the queue drain rather than firing queued turns into a broken
session; see [Turn Queue](./queue.md).

**Retry visibility.** When the model call fails transiently (rate
limit, provider 5xx) and the loop backs off, status transitions to
`retrying` with the current `attempt` count and a `message` sourced
from the error (e.g. "rate limited, retry in 12s"). The client
renders this directly; the user understands the delay is not their
fault.

## Permission scopes

Permissions evaluated at tool-call time come from a layered ruleset.
Three scopes that compose:

| Scope    | Lifetime                     | Set by                                                                                                       |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Manifest | Compile-time, immutable      | The agent author. Describes the agent's intrinsic policy.                                                    |
| Session  | This session only            | User replies to a watchdog `ask` with "always for this session". Stored on `chat_sessions.permissions_json`. |
| Project  | All sessions in this project | User replies to a watchdog `ask` with "always". Or pre-configured by the host.                               |

Evaluation walks the layers in order; the **most specific matching
rule wins** (manifest deny is overridden by a more recent session
allow if and only if the manifest did not pin it; project rules
override manifest defaults but never manifest pins; and so on). An
implementation MAY flatten the layers into a single ranked ruleset
at evaluation time.

The session row carries a `permissions_json` blob for the session
scope. The project scope's storage is up to the host (a project-level
config file, a per-user DB, both); the guide only requires it exists
separately from session scope.

**Three scopes, not one.** A single ruleset elides the difference
between "I trust this for this conversation" and "I trust this
everywhere in this project." Collapsing them forces every "ask"
reply into a project-permanent commitment.

## Persistence

The default policy: save on every chunk. Detailed in
[Persistency / save policy](./persistency.md#save-policy).

## See also

- [Foundations](./foundations.md) — AI SDK + locked tools + sandbox
  placement.
- [Persistency](./persistency.md) — the schema, save policy, ID
  strategy.
- [Tools](./tools.md) — what the loop invokes.
- [Subagents](./subagents.md) — the specialized compaction subagent
  this page references.
- [Turn Queue](./queue.md) — the run-state machine that drives
  `SessionStatus`, and how turn-triggering messages are queued and
  drained.
- [Cost Optimization](./cost-optimization.md) — the billing-side
  doctrine: what compaction thresholds, pruning, and the usage
  breakdown cost (or save) per step, and why window / threshold /
  price tier are one decision.
- [UX Patterns](./ux.md) — compositor, queued sends, sidecar,
  memory.
- [Debugging](./debugging.md) — inspection format and DX checklist.
- [ACP integration](./acp.md) — the outward wire.
