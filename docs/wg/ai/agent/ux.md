---
title: UX Patterns
description: UX patterns that ride on top of the compositor and push back into the protocol. Queued sends, sidecar chat as ephemeral fork, and memory as a built-on-top layer. The compositor itself, file refs, attachments, mentions, commands, editor context, and the user-view-vs-model-view lowering rules live in compositor.md.
keywords: [agent-system, ux, queued-sends, sidecar, memory]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# UX Patterns

The agent system core does not own UI. It does own the **interaction
patterns** that change the protocol — when a turn fires, how a side
question is forked, where durable memory lives, what is inspectable.
This page specifies those.

The **user-intent representation** — the multipart user message,
file refs vs attachments, inline commands, mentions, editor context,
and the user-view-vs-model-view lowering rules — lives in
[`compositor`](./compositor.md). The compositor is foundational, not
UX; the same shape holds whether the surface is a rich editor, a
TUI, a CLI flag, or a voice transcription. This page is what rides
on top.

## Queued sends

The user submits another message while the assistant is still
streaming. The behavior MUST be **queue and process on idle**: the
new message appears immediately, **visually distinguished from settled
history** (it has not been answered yet), and fires on its own when
the session next goes idle.

A submit queues whenever the session is **busy**, and "busy" spans
more than a streaming turn: a maintenance operation that holds the
turn slot — e.g. an in-flight [compaction](./session.md#compaction) —
also makes the next submit queue, so it fires **after** that operation
finishes rather than racing a fresh turn against a session that is
mid-change. The surface decides what counts as busy from the run
state; the [run-state machine](./queue.md#the-run-state-machine) is
the authority on when the next turn may fire.

Affordances a conforming surface SHOULD provide:

- **Cancel per item.** Each queued message is individually removable
  before it fires. This is the user's escape hatch and the only way
  to stop the
  [drain cascade](./queue.md#operating-on-queued-messages).
- **Edit.** Optional. A surface that does not build dedicated edit can
  let the user cancel and resubmit for the same result.
- **Reorder.** Optional. Without it, queued messages fire in the
  order they were queued.

**Stopping with a queue.** The stop control aborts the **current**
turn. Because an abort is a clean turn-end, the queue then drains its
next batch — stop does **not** clear the queue. To stop everything the
user cancels the queued messages first (a surface MAY combine the two
into one "stop and clear" control). See
[`queue / stopping with a queue`](./queue.md#stopping-with-a-queue).

**When a turn fails.** A clean abort drains the next item (above), but
a turn that **hard-fails** — a provider or network error, not a user
stop — **pauses** the drain: the queued messages keep their place and
wait. The drain resumes on the next fired turn (the user's retry or
edit-and-resend), which clears the error. This is the run-state
machine's rule, not a surface choice; see
[`queue / the run-state machine`](./queue.md#the-run-state-machine).

Parallel turns on the same session are a footgun — the second turn
would race with the first on context, on tools, on the session's run
state. Queueing makes the conversation deterministic.

Where the queued messages render (a tray above the composer, inline
ghosts, a count badge), how they are styled, and whether the surface
shows a list at all are **host decisions**. The mechanism behind them
— `queued_at`, the single-flight run-state machine, the drain
discipline, and the rule that the queue lives in the core rather than
the client — is the [Turn Queue](./queue.md) contract, which the same
queue serves for non-compositor sources (scheduled wakeups, webhooks,
API calls, MCP-pushed events, agent self-schedules) as well. See
[`triggers`](./triggers.md) for those sources' envelope and per-source
semantics.

## Sidecar chat

A "sidecar" is a temporary fork. The user wants to ask a side
question without polluting the main thread, then come back.

Shape:

1. The host opens a sidecar pane.
2. The host calls `fork(parent_session_id, from_message_id)` with
   an `ephemeral: true` metadata flag. The fork is a real session
   row, hidden from the picker by the host's filter.
3. The user chats in the sidecar. The main chat is unaffected; the
   sidecar inherits the parent's history up to the fork point.
4. On sidecar close:
   - Default: the sidecar is **kept** as an ephemeral session.
     Inspection and re-open are possible from a sidecars tab.
   - Option: the sidecar is hard-deleted on close (host choice).

What the protocol adds: the `ephemeral` metadata flag on the session
row, and the `fork(parent, from_message_id)` API. The hide /
re-open UX is the host's.

A fork (not a separate thread) is the right primitive because the
sidecar usually needs the main thread's context to answer the side
question. Forking gives it the parent's history up to the fork
point for free.

## Memory

A memory is a piece of text the agent (or the user) keeps across
sessions. The protocol exposes a **built-on-top layer**:

- A **memory tool**: `memory_write({ scope, name, body })`,
  `memory_delete({ name })`, `memory_list()`.
- A **memory skill** that teaches the agent when to use the tool.
- A **persistence layer** — local files keyed by user / project, or
  a per-user / per-project DB — that the memory tool reads and
  writes.

Memory is intentionally distinct from project instructions
([`skills`](./skills.md#project-instructions)) — instructions are
committed-to-repo files; memory is a structured, indexed, mutable
store the agent itself writes to.

### Two scopes

| Scope     | Lifetime                          | Storage                                                                              |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| `user`    | Across every session for the user | A user-level store (e.g. `~/.agents/memory/`).                                       |
| `project` | Across sessions in this project   | A project-level store (commit-able in version control, or local-only — host choice). |

A memory entry has:

```ts
{
  scope: "user" | "project",
  name: <kebab-case>,
  description: <one-line — the loader's index>,
  type: "user" | "feedback" | "project" | "reference" | "…",
  body: <markdown>,
}
```

### How memories enter context

Memories are **not all loaded every turn**. They are an indexed
catalog (filename + one-line description) injected at session start,
exactly like skills. The agent reads what is relevant via a
`memory_read` tool, or via the loader pre-loading a small set of
high-priority items.

The size discipline matches skills: an index sentence per memory,
body on demand. A bag of dozens of entries does not balloon the
system prompt.

### When the agent writes memories

The memory skill teaches the agent to write a memory when:

- The user shares a preference, role, or constraint that matters
  beyond this conversation.
- The user corrects the agent on an approach.
- The user references an external resource (a dashboard, a
  project-tracker URL, a Slack channel) the agent should remember.

The agent MUST NOT memorize the contents of every file it read.
Memory is for what would not be obvious from re-reading the code.

### Memory and rewind / fork

A memory written during a turn that gets rewound STAYS written.
Memories are **persistent intent**, not part of the prompt-rewind
unit. To un-write a memory, the user deletes it via the memory
tool.

## Implementor checklist

A conforming UX layer MUST:

- Queue user submissions when the session is busy; never start a
  parallel turn on the same session. The queue is core state, not
  client state ([Turn Queue](./queue.md)).
- Render queued submissions distinctly from settled history and offer
  per-item cancellation; the stop control aborts the current turn, not
  the queue.
- Support the sidecar / ephemeral-fork flow via `fork()` with
  the `ephemeral` metadata flag.
- Carry a `session_status` indicator the user can use to know
  whether the session is `idle`, `busy`, `retrying`, or `errored`.
- Treat memory as a tool-driven layer — not as a bag the host
  prepends to every prompt.

The compositor's own conformance items live in
[`compositor / implementor checklist`](./compositor.md#implementor-checklist).

## What this guide does not specify

- **A memory marketplace.** Memory storage layout is local; sharing
  memories across users is a host-built layer.
- **Multi-user collaborative editing of a single session.** One user
  per session; concurrent editing is outside the scope.
- **The hide / re-open UX for sidecars.** Tab, drawer, panel, modal
  — all conformant. The protocol contributes the `ephemeral` flag
  and the fork primitive; the rest is host territory.

## See also

- [Compositor](./compositor.md) — user-intent representation, file
  refs, attachments, mentions, commands, editor context, and the
  user-view-vs-model-view lowering rules.
- [Turn Queue](./queue.md) — the contract behind queued sends:
  ingestion, ordering, the run-state machine, and the core-vs-surface
  boundary.
- [Session Lifecycle](./session.md) — what happens when the queued
  message fires, when rewind soft-truncates, when a fork is taken.
- [Skills](./skills.md) — project instructions vs skills vs memory.
- [Persistency](./persistency.md) — the `queued_at` and `ephemeral`
  metadata fields.
- [Debugging](./debugging.md) — the canonical inspection format
  that records what every layer emitted.
