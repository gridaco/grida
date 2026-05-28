---
title: Subagents
description: How an agent delegates to a child running the same loop. Agent modes, the task tool, blocking vs background, recursion, permission inheritance (deny rules always win), inspectability, awareness, specialized subagents (title / summary / compaction), and plan/build mode as an opinionated pattern hosts may layer.
keywords:
  [
    agent-system,
    subagents,
    task,
    modes,
    recursion,
    permissions,
    inspectability,
    awareness,
    plan-mode,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Subagents

A **subagent** is a child agent run, spawned by a parent via the
locked `task` tool. The child runs the same loop, against the same
runtime, against a child session. The parent's `task` call returns
when the child finishes — or returns immediately and notifies on
completion, if spawned in background mode.

Subagents are a primitive, not a feature. The decision to spawn a
child agent for parallel work, scoped context, or specialization is
core to how an agent does real work without inflating its parent's
context window.

## Agent modes

Every agent manifest MUST declare a `mode` that gates who can invoke
the agent:

| Mode       | Meaning                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primary`  | User-facing. Appears in the host's agent picker. The user can switch to it on any turn.                                                                                |
| `subagent` | System-facing. Invoked only via the `task` tool by another agent. Never appears in the picker. Used for specialized helpers (title, summary, compaction, exploration). |
| `all`      | Both. Reserved for general-purpose agents the user picks directly AND that other agents also fan out to.                                                               |

Mode is **agent-manifest metadata**, not session state. A `primary`
agent and a `subagent` agent share the loop; the field gates
discoverability, not capability.

Mode is **distinct from inspectability** (see
[Inspectability](#inspectability) below). An inspectable subagent is
still a subagent — only `task` can call it — it just gets its own
session row when invoked.

## The `task` tool

`task` is the locked subagent-spawning tool. Shape:

```ts
task({
  subagent_type: string,    // an agent id whose mode is "subagent" or "all"
  prompt: string,           // the user message handed to the child
  background?: boolean,     // default false
  metadata?: object,        // host-defined; carried to the child's session
}) → {
  // when background=false:
  output: <child's final assistant message>,
  // when background=true:
  session_id: string,       // the child's session, completion arrives as a synthetic message
}
```

Calling `task` MUST:

1. Resolve `subagent_type` against the host's agent registry. Unknown
   → tool error.
2. Compute the child's effective permissions as
   `parent_permissions ∩ child_manifest_permissions` (see
   [Permission inheritance](#permission-inheritance)).
3. Create a child session row whose `parent_id` points to the parent
   session and whose `parent_message_id` points to the user message
   the parent was processing.
4. Run the child loop with the child's manifest, the parent's
   workspace root, and the inherited capabilities.
5. Return per the run mode (blocking returns the final output;
   background returns a handle).

## Blocking vs background

The `task` tool has two run modes:

| Mode               | Parent behavior                                                       | Child completion                                                                  |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Blocking (default) | Parent's turn waits; the call resolves with the child's final output. | Returned synchronously as the tool result.                                        |
| Background         | Parent's turn continues immediately; the call resolves with a handle. | Injected into the parent session **as a synthetic assistant message** when ready. |

The synthetic-message shape on background completion is the
load-bearing detail: the parent agent sees the child's result as if
a tool had returned it, so the loop's reasoning state stays
consistent. The host's UX MAY render the synthetic message
differently (a callout instead of inline), but the protocol shape is
unchanged.

Background mode is the right choice when:

- The child's work is expected to take long enough that blocking the
  parent's turn is hostile (a multi-minute deep code review, a
  research run, a long file pass).
- The parent has independent work it can do in parallel.
- The user wants the parent agent to remain interactive while the
  child runs.

Background subagents share the parent's abort signal: aborting the
parent's run aborts every background child.

On host restart, a background subagent's run is no longer in flight;
the runtime MUST inject the **failure variant** of the
synthetic-completion message into the parent's session so the
message graph stays consistent. This is the subagent-specific
counterpart to the general orphaned-tool-call cleanup rule in
[`session / resume across renderer disconnect`](./session.md#resume-across-renderer-disconnect).

Background subagents are **not** the right primitive for "wake me
up in 5 minutes" — a child waiting on a clock is delay, not work.
Use the sibling primitive in [`triggers`](./triggers.md) for time-
or event-driven turns; the two compose (a triggered turn MAY then
spawn background subagents from inside its body).

## Recursion

Subagents MAY be recursive. A subagent MAY itself call `task` and
spawn a grand-child. The guide allows recursion because:

- Real workflows need it. A research agent fans out to readers; each
  reader fans out to grep-ers.
- The cost of refusing is zero benefit and high friction.

The runtime MUST enforce a **recursion depth limit** as host policy.
Recommended default: **5**. Hitting the limit returns a tool error
to the caller; it MUST NOT throw at the model.

The depth limit counts blocking and background calls equally. A
background child at depth N is still depth N for recursion purposes
even after the parent's turn returns.

## Permission inheritance

A subagent's effective permissions are the **intersection** of the
parent's permissions and the subagent's declared permissions. The
load-bearing rule:

> **A deny in the parent CANNOT be turned into an allow by the
> child.** A child can only be stricter than its parent, never
> looser.

Consequences:

- A parent with `fs.write` denied CANNOT spawn a child that has it.
- A parent without `shell.run` CANNOT spawn a child that has it.
- A parent restricted to `{workspace}/docs/**` CANNOT spawn a child
  with broader file scope.

The opposite direction does not propagate — a child's _narrower_
permissions are local to the child. The grand-child inherits from
the child, not from the grand-parent.

This is the safety property that makes recursion safe. If a future
optimization were to relax it ("trusted parent can hand a child a
broader scope"), the whole tree would have to be re-audited at every
spawn point. The cost is not worth a speculative use case.

## Inspectability

A subagent's session is either **opaque** or **session-backed**, set
by the subagent's manifest flag `inspectable`:

| Flag                           | Behavior                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspectable: false` (default) | The child runs without its own session row. Its messages and parts live as nested data inside the parent's `task` tool output. The user sees the result, not the loop.         |
| `inspectable: true`            | The child gets its own session row, its own message and part rows, its own picker entry (if the host renders one). The parent's `task` result is a pointer (`{ session_id }`). |

**Why the opt-in.** If subagents are _always_ opaque, the schema
stays small but the user cannot see a long-running research agent
at work. If they are _always_ sessions, every title-gen call
litters the picker. The opt-in defaults to opaque (the right choice
for short, structured calls) and elevates to inspectable for
long-running, transcript-worthy work.

### When to mark `inspectable: true`

- The child runs for more than a few seconds and the user benefits
  from seeing progress.
- The child's transcript is itself a deliverable (a code review, a
  research summary).
- The user might want to interrupt or correct the child mid-run.

### When to leave `inspectable: false`

- The child's output is consumed programmatically (a title generator,
  a structured-data extractor).
- The child runs sub-second and a separate session row would be
  noise.
- The child is part of an internal optimization (compaction,
  summarization).

## Awareness

A subagent is **not told that its caller is also an agent** by
default. From the subagent's perspective, it has a user (the
caller's prompt) and a system. This keeps the subagent loop
identical to the top-level loop.

If a host wants the subagent to know it's a subagent (e.g. to skip
explanatory chit-chat that's useful only to humans), the subagent's
manifest sets `caller: "agent"`. The only effect is to inject a
single line into the system prompt:

> Your caller is another agent; return structured output.

The flag is most useful for opaque subagents whose output is consumed
programmatically. Inspectable subagents whose transcripts a human
will read usually leave it off.

## Specialized subagents

The "title" subagent, the "summary" subagent, the "compaction"
subagent — these are not a separate framework. They are agents whose
config differs from the user-facing agent:

- Cheap-tier model (`nano`, `small`).
- Low temperature.
- Hard `maxOutputTokens` cap.
- No tools, or a minimal toolset.
- `mode: "subagent"` so the user picker never sees them.
- `inspectable: false` so they don't litter the session list.
- A **custom, task-specific system prompt** that constrains output
  format (e.g. "return only the title, no preamble"; "summarize in
  these four sections"; "return one of these JSON shapes").

They run through the same `task` tool path. The unified loop is the
load-bearing decision; specialization is **config — system prompt
included**.

Common specialized subagents:

| Name         | Job                                                       | Trigger                                            |
| ------------ | --------------------------------------------------------- | -------------------------------------------------- |
| `title`      | Generate a short title from the first user message        | On first user message, fire-and-forget             |
| `summary`    | Generate a PR-style summary of what happened in a session | On session close, or on user request               |
| `compaction` | Summarize soft-hidden history during compaction           | Triggered by [compaction](./session.md#compaction) |
| `explore`    | Read-only codebase exploration                            | Spawned by user-facing agents that need grounding  |

## Opinionated patterns hosts MAY layer

The locked subagent primitive supports patterns the guide intentionally
does not specify as core. Hosts MAY adopt them; doing so does not
change the protocol.

### Plan / build mode

A common product workflow: the user wants the agent to **plan**
before it touches anything, then **build** once the plan is approved.
Common shape:

- A `plan` agent with `shell.run` and `fs.write` denied — it can
  read, search, and reason but cannot change the world.
- A `build` agent with the writes enabled.
- A `plan_exit` tool the plan agent calls when the plan is ready.
  The host shows the plan to the user; on approval, the active agent
  swaps to `build` for the same session.

The guide does **NOT** define `plan_exit` or "plan mode" as
fundamental. It is a product workflow built on top of:

- Agent-as-data (declare two agents with different permission sets).
- Per-message agent override (the host writes the new agent id into
  the next user message's `metadata_json.agent`; the loop reads the
  override and runs the build agent for that turn and onward. See
  [Persistency / metadata conventions](./persistency.md#chat_messages)).
  `chat_sessions.agent` stays as opened-with for picker semantics.
- Hooks (a `message.user` or `model.resolve` hook can implement the
  swap policy).

Implementors who ship this pattern SHOULD be aware that:

- It is a UX/workflow decision, not a protocol one. Two
  implementations may ship plan/build pairs with different prompts
  and tool sets and both be conformant.
- The "exit-plan" tool, if shipped, belongs in the plan agent's
  agent-specific tools — NOT in the locked set.
- The user-approval gate is a host responsibility (a dialog, a
  slash command, a `question` tool call); the guide does not require
  any particular UI.

### Other opinionated patterns

Tree-of-thought (fan-out + vote), review-then-merge (background
review gates the next user turn), critic loop (parent iterates with
a critic subagent), and other multi-subagent workflows all compose
the same primitives — `task`, subagent permissions, synthetic-message
background completion — without new protocol.

## Implementor checklist

A conforming subagent implementation MUST:

- Resolve `subagent_type` against the agent registry.
- Compute child permissions as the intersection of parent and child;
  deny rules in the parent are unconditional.
- Create a child session row with `parent_id` and `parent_message_id`
  set.
- Run the child loop on the same code path as the parent loop.
- Enforce the recursion depth limit (default 5).
- Honor `background: true` by returning a handle and injecting a
  synthetic message on completion.
- Honor `inspectable: true` by creating a queryable session row;
  honor the default `false` by nesting the child's transcript in the
  parent's `task` tool output.

## What this guide does not specify

- **Multi-agent orchestration graphs.** Subagents fan out and
  return. No DAGs, no chains, no shared cross-session state at the
  guide level.
- **Subagent pools.** Reusing a long-lived subagent for many calls
  is a host optimization. The protocol shape is per-call spawn.
- **Cross-host subagent calls.** A subagent that runs in a different
  process or on a different machine is host territory.

## See also

- [Tools](./tools.md) — the `task` tool's locked-set contract.
- [Session Lifecycle](./session.md) — compaction and how the
  compaction subagent fits.
- [Foundations](./foundations.md) — the universal loop subagents
  share.
- [Persistency](./persistency.md) — the `parent_id` /
  `parent_message_id` columns.
- [ACP integration](./acp.md) — how subagent transcripts MAY surface
  to an ACP client.
