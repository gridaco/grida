---
title: FAQ
description: Question-and-answer index over the Agent System guide. Doubles as an entry point (read the question, jump to the page) and as a conformance test (if a Q cannot be answered from the RFC, the RFC owes a clarification). Answers are normative and derived from the linked page; they do not invent policy beyond what the guide says.
keywords: [agent-system, faq, q-and-a, entry-point, conformance]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# FAQ

This page is a question-and-answer index over the Agent System guide.
It exists for two reasons:

1. **As an entry point.** Scan the questions; jump to the page that
   carries the answer in normative form.
2. **As a conformance test.** Every answer here MUST be derivable from
   a linked RFC page. If a question cannot be answered from the guide,
   the guide owes a clarification — that is the signal to revise the
   page, not to invent a policy in the FAQ.

The FAQ is **not** a place to extend the protocol. When a question
surfaces a real gap, the resolution lands on the relevant page first;
the FAQ records the settled answer and points to it.

## How to read this

- Questions are grouped by topic. Within a topic, order is rough
  (foundational first, edge-cases later).
- Each answer ends with a **see** link to the authoritative section.
- A question marked **(unresolved)** is recorded but not yet decided —
  see the linked page for context.

## Questions

<!--
  Maintainer note: when adding entries, keep answers short and
  declarative. If the answer needs more than ~4 lines, the linked
  page is doing the heavy lifting — link, don't paraphrase.
-->

### Agents and patterns

#### How do I design a "plan mode"?

Plan mode is **not** a protocol concept. The guide treats it as an
opinionated pattern hosts MAY layer, built on three primitives the
RFC already locks:

1. **Agent-as-data, two manifests.** A `plan` agent with `shell.run`
   and `fs.write` denied; a `build` agent with them allowed. Same
   loop, different config.
2. **Per-turn agent override.** Set `metadata_json.agent` on the next
   user message; the loop reads the override and runs that agent for
   the turn and onward. `chat_sessions.agent` stays as opened-with
   for picker semantics.
3. **Optional agent-specific exit tool.** A `plan_exit`-style tool,
   if shipped, lives in the plan agent's agent-specific tools —
   **NOT in the locked set**. The user-approval gate is a host UI
   responsibility.

Hooks (`message.user`, `model.resolve`) MAY automate the swap. Two
conformant implementations MAY ship different plan/build pairs and
both be conformant.

See: [`mode-plan`](./mode-plan.md) — the dedicated treatment of this
pattern and its transition contract;
[`subagents / plan-build-mode`](./subagents.md#plan--build-mode);
[`persistency / chat_messages`](./persistency.md#chat_messages) for
the override field.

#### When a user clicks "approve and auto mode" on a plan, does that fire a trigger or a user message?

A **user message**. Triggers are explicitly **non-human-originated**
turns (schedule, webhook, API, self-schedule, MCP-event). A button
click in the active UI is foreground human action — the surface is a
button instead of a textarea, but the actor is still the user.

Pattern:

1. The host synthesizes a user message. Body can be empty, a short
   literal (`"Approved, continue."`), or whatever the host's render
   policy chooses — the compositor's user-view vs model-view split
   keeps that flexible.
2. The host sets `metadata_json.agent = "build"` on that message
   (per-turn agent override).
3. It enters the **same queue** as any typed user message
   (`queued_at` semantics apply if the session is busy — see
   [`queue`](./queue.md)).
4. The loop reads the override and runs `build` for that turn and
   onward.

So: the button is UI; the wire is the same user message a typed
"approved, continue" would produce. No trigger envelope.

See: [`subagents / plan-build-mode`](./subagents.md#plan--build-mode),
[`compositor`](./compositor.md) for user-view vs model-view,
[`triggers`](./triggers.md) for what does and does not qualify as a
trigger.

#### Can the agent put itself into — or take itself out of — plan mode?

No. The agent MAY **propose** a transition; it MUST NOT **effect** one. An
agent in plan mode cannot promote itself to writing, and an agent in build
mode cannot move itself into plan unilaterally — the agent proposes, the
host disposes, and a human gates. "It switched to planning when I asked for
a plan" is one of two host-owned paths: the agent **proposed** the switch
and the user confirmed, or a host **router** set the regime before the turn
ran. Neither is the model flipping its own mode; a design that let it would
dissolve the read-only guarantee.

See: [`mode-plan / who-may-initiate-a-transition`](./mode-plan.md#who-may-initiate-a-transition),
[`mode-plan / the-transition-contract`](./mode-plan.md#the-transition-contract).

#### Is "plan mode" a state the model holds?

No — mode is **conversation context the host owns**, not model state. The
agent reads which regime is active from injected instruction, re-asserted
while the regime holds; it has no mode flag of its own to set. Plainly:
**mode is a message, not a flag.** Every transition is therefore a fresh
host-injected message that re-scopes the agent and announces the change,
carried as the [per-message agent override](./persistency.md#chat_messages).

See: [`mode-plan`](./mode-plan.md),
[`mode-plan / what-a-mode-is`](./mode-plan.md#what-a-mode-is).

#### When the agent asks me to pick from options (and I may add free-text follow-up), how does the pick come back?

Different question from the click-to-approve case above: here the
**agent** structured the ask. Two paths, depending on how it asked:

**Path A — structured `question`-style tool (host-shipped, not in
the lock).** The agent calls the tool mid-turn; the tool yields
control to the user; the picked option (+ any free-text follow-up)
becomes the **tool result**. The loop continues in the **same turn**.
Right when the agent strictly needs an answer before its next action.

**Path B — UI-rendered chips inferred from assistant prose.** The
assistant text lists options; the host's UI parses or heuristically
renders chips. User pick → new **user message** (body = picked
option text; follow-up appended). **New turn.** Same path as
"approve and auto mode" above.

Free-text follow-up doesn't change the path — it rides along in the
same response carrier (tool result in A, message body in B).

| Aspect         | Path A (tool result)      | Path B (user message)   |
| -------------- | ------------------------- | ----------------------- |
| Turn count     | One turn                  | Two turns               |
| Pick lives as  | Tool-result chunk         | User message + parts    |
| Cancellability | Bound to the waiting tool | Whatever the queue says |
| Locked by RFC? | No (host-shipped)         | Yes                     |

The RFC does not mandate either. `question`-style tools are **host
territory** (mentioned in subagents.md as an option for the
plan-approval gate, not in the locked tool set). What IS locked is
the user-message + queue semantics in Path B; what isn't is whether
or how to ship Path A.

See: [`subagents / plan-build-mode`](./subagents.md#plan--build-mode)
for the "host responsibility" framing,
[`tools`](./tools.md) for the locked-vs-host-shipped boundary.

### Sessions and lifecycle

#### If the user closes their laptop mid-turn and reconnects later, can the turn resume without a new message?

**Yes for the in-flight turn — no new message needed.** Closing the
laptop is the "page refresh, OS sleep, window close" case the RFC
calls out by name.

Required behavior:

1. **Renderer disconnect MUST NOT cancel the upstream model call.**
   The recorder is always attached for the run's lifetime; the model
   keeps streaming and the recorder keeps writing chunks even with
   no renderer.
2. **Reconnect = replay + live-tail.** Given the session id, the
   reconnect endpoint replays the chunk log from index 0 and
   live-tails until the upstream finishes. No cursor; the reducer
   rebuilds from index 0 every time.
3. **TCP close ≠ abort.** Only an explicit `abort(session_id)`
   cancels.

The hard edge — **cross-restart resume is out of scope**: the
upstream provider has no notion of "your previous request." After a
host restart, partial output is persisted but the run is no longer
in flight; orphaned in-flight tool calls are finalized as error per
the [orphan-cleanup rule](./session.md#resume-across-renderer-disconnect),
and a new user message is required to continue.

Non-foreground sources also "resume without new message" by
construction: background subagents keep running and inject their
synthetic completion on the parent session when ready (failure
variant on host restart); triggers (schedule, webhook, MCP-event)
queue against `queued_at` and drain on host resume.

See:
[`session / resume across renderer disconnect`](./session.md#resume-across-renderer-disconnect),
[`session / abort vs tcp close`](./session.md#abort-vs-tcp-close),
[`acp / stream resume semantics`](./acp.md#stream-resume-semantics).

#### Can a user rewind past a compaction back to a turn the compaction summarized?

**Yes — required by spec.** The RFC is explicit:

> A compaction does not hide the turns it summarized … rewinding to any
> earlier message naturally hides the marker along with everything after
> the target. That removes the boundary … Nothing is deleted …
> Implementations that hard-delete on compaction lose this property; they
> MUST NOT.

How the persistency model makes it work:

- Compaction does **not** hide the summarized turns — they stay in the
  linear log, and the model boundary is read-time (`tail_start_id`). The
  summary marker is stamped at invocation time, so it sorts last.
- Rewinding to an earlier message hides everything after the target
  (including the marker) via `hidden_at` — which removes the compaction
  boundary and re-exposes the full pre-target history to the model.
- Nothing is deleted. Inspection, un-rewind, audit stay possible.

| Layer       | Guarantee                                                                             |
| ----------- | ------------------------------------------------------------------------------------- |
| Persistency | Compacted messages stay in the DB (not hidden) — they exist and are addressable.      |
| Rewind      | The user MUST be able to rewind to any prior user message, including summarized ones. |
| Compaction  | An implementation that hard-deletes on compaction violates the spec.                  |

The rewind picker SHOULD include compacted user messages as valid
targets — filtering them out would silently break the MUST.

See:
[`session / rewinding past a compaction`](./session.md#rewinding-past-a-compaction),
[`session / soft-truncate vs delete`](./session.md#soft-truncate-vs-delete),
[`persistency / chat_messages`](./persistency.md#chat_messages) for the
`hidden_at` field.

#### How is a compaction stored in the DB, and how does it support UIs that show a divider or the summary?

One new synthetic assistant message + one new part — no special
"compaction marker" beyond a reserved part type, and **nothing else
changes**: the summarized rows are untouched (not hidden, not deleted).

```text
chat_messages:
  + INSERT one new row   → role="assistant", synthetic, created_at = now()
                           (stamped at invocation time → sorts LAST)

chat_parts:
  + INSERT one new row on the synthetic message
    → type = "data-compaction"
    → data_json = {
        summary: string,            // Markdown body
        tail_start_id: string|null, // first kept-verbatim message id; null = nothing kept (manual)
        auto: boolean,              // auto vs manual trigger
        summary_tokens: int,        // for the next rollup
      }
```

The model sees the `summary` text + every message from `tail_start_id`
onward (or just the summary, when `tail_start_id` is `null`) — resolved
at read-time. The summarized head stays visible and linear; only the
model view skips it.

| UI pattern                     | How it falls out of the schema                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Marker / divider**           | Render the `data-compaction` part as a divider. The `auto` flag drives phrasing.                                                                            |
| **Show the compacted message** | Render `data_json.summary` inline or behind a fold.                                                                                                         |
| **Show the summarized turns**  | They're already in the transcript — the rows ordered before the marker (and `tail_start_id`); no separate query, the divider sits at the marker's position. |

Auto vs manual produce the **same artifact**; only the trigger and the
verbatim-tail depth differ.

See:
[`session / what compaction produces`](./session.md#what-compaction-produces),
[`persistency / chat_parts`](./persistency.md#chat_parts) for the reserved
`data-compaction` type,
[`session / rewinding past a compaction`](./session.md#rewinding-past-a-compaction).

#### How should errors be designed — what auto-retries, what hard-fails, and is a hard-failed session dead forever?

Four buckets, organized by who recovers and how:

| Bucket             | Examples                                                                                                    | Recovery                           | Surfaces as                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Tool errors        | schema validation, watchdog `deny`, capability refusal, sandbox refusal, in-tool failure, aborted-by-parent | **Model decides next turn**        | `{ type: "error", error_text }` envelope          |
| Transient provider | rate limit, provider 5xx, network blip                                                                      | **Loop auto-retries with backoff** | `SessionStatus.state = "retrying"` with `attempt` |
| Spec-limit (hard)  | compaction overflow after fallbacks; model swap to too-small context; fork on busy                          | **User takes action**              | `SessionStatus.state = "error"`                   |
| Loop abort         | user cancel; parent abort cascade                                                                           | Not an error — a signal            | Partial result / `"aborted by parent"` tool error |

Normative rules from the RFC:

- Tools MUST NOT throw. Schema validation, watchdog deny, capability
  refusal, sandbox refusal, runtime failure — all use the uniform
  envelope.
- The model is the retry policy for tool errors; the loop is the
  retry policy for transient provider errors.
- Spec-limit failures attempt recovery (pruned tool-outputs →
  chunked summarize → drop-middle) before hard-failing.
- Headless hosts MUST treat `ask` as `deny`.

**A hard-failed session is not dead.** `SessionStatus` has no
terminal state. `error` clears on the next submission attempt — the
state machine transitions to `busy` for that run and follows the
normal lifecycle. Recovery for the underlying cause is user-driven
(prune, fork, switch model).

See:
[`session / session status`](./session.md#session-status) for the
state machine and the `error` → `idle` transition,
[`session / failure modes`](./session.md#failure-modes) for
compaction recovery,
[`session / compaction interacts with model switch`](./session.md#compaction-interacts-with-model-switch),
[`tools / tool result envelope`](./tools.md#tool-result-envelope),
[`tools / the watchdog`](./tools.md#the-watchdog).

#### Can the main agent re-prompt a finished subagent? Can parent and subagent have a multi-turn conversation?

**No, by spec.** The RFC nails this on three fronts:

1. **Per-call spawn.** Every `task` MUST "create a child session row"
   — there is no API to re-enter an existing child.
2. **Subagent pools are host optimization, not protocol.** "Reusing a
   long-lived subagent for many calls is a host optimization. The
   protocol shape is per-call spawn."
3. **No shared cross-session state at the guide level.** No DAGs, no
   chains.

The child runs its loop to completion; the parent sees the final
result (or the synthetic completion for background). The child
cannot address the parent at all — even its caller-is-agent status
is hidden unless the manifest sets `caller: "agent"`.

**Pattern that approximates multi-turn:** multiple `task` calls,
with context carried in each prompt. The "conversation" lives in
the parent's loop; the child is stateless across calls.

See:
[`subagents / the task tool`](./subagents.md#the-task-tool),
[`subagents / implementor checklist`](./subagents.md#implementor-checklist),
[`subagents / what this guide does not specify`](./subagents.md#what-this-guide-does-not-specify),
[`subagents / awareness`](./subagents.md#awareness) for the
`caller: "agent"` framing.

### Tools and filesystem

#### When an agent edits a document the user has open, does the open view stay in sync?

**Depends on who owns the filesystem — both modes are already
specified.** The agent runtime owns `fs` by default, but a client MAY
provide `fs/read_text_file` / `fs/write_text_file`, and the locked
`read` / `write` / `edit` tools delegate to it when that capability is
negotiated:

- **Client-delegated fs** — the write round-trips _through_ the client,
  so an open view updates by construction (the write _is_ a client
  operation).
- **Runtime-owned fs** — the agent writes to the runtime's filesystem;
  the client sees the write as a `tool-output` chunk (carrying the path)
  and refreshes as host UI, or re-reads. No server→client
  "document-changed" event is owed — view-sync is UI, and the system
  decides protocol while the host decides UI.

The two common styles — a client owning the live document model vs. a
host writing to disk and refreshing on reopen — are these two sanctioned
modes, not a gap.

See:
[`acp / filesystem authority`](./acp.md#filesystem-authority),
[`acp / capability matrix`](./acp.md#capability-matrix) for runtime-owned
vs client-delegated `fs`;
[`session / streaming and layering`](./session.md#streaming-and-layering)
for tool-output reaching the client.

## See also

- [Index](./index.md) — page map and cross-cutting invariants.
- [Foundations](./foundations.md) — the bedrock the rest of the guide
  builds on.
- [Debugging](./debugging.md) — when a real run disagrees with the
  guide, this is where the inspection format lives.
