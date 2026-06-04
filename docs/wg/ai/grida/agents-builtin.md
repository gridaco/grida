---
title: Built-in subagents
description: Grida's specialized subagents (titler, compactor, planner) — concrete bindings of the RFC's specialized-subagent pattern with the Grida-specific tier, model, sentinel, and cost discipline.
keywords:
  [agent, subagent, titler, compactor, planner, grida, specialized-subagent]
format: md
tags:
  - internal
  - wg
  - ai
  - grida
---

# Built-in subagents

This page is the **Grida binding** of the agent RFC's specialized
subagent pattern ([`../agent/subagents.md#specialized-subagents`](../agent/subagents.md)).
The RFC names the shape (a `subagent`-mode agent the runtime invokes
internally, with a constrained system prompt and bounded cost). This
page records what Grida ships, and the product-shape decisions for each.

For the abstract `task` tool, the `subagent` agent mode, and permission
inheritance, read the RFC. What follows is delta: which subagents Grida
runs, on which tier, against which provider, with which sentinel.

## Catalog

| Id          | Status  | Triggers when                                                                        | Output                                                    |
| ----------- | ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `titler`    | shipped | Every `/agent/run` against a session with default title                              | Updates `chat_sessions.title`                             |
| `compactor` | shipped | Context window exceeds usable threshold (auto) or user-fired `/sessions/:id/compact` | A `data-compaction` part on a synthetic assistant message |
| `planner`   | future  | Agent asks for plan/build workflow exit                                              | A plan document the parent agent reads as a tool result   |

## titler — auto-titling sessions

**Trigger.** The agent host's `/agent/run` route fires title generation on
**every** turn, in parallel with the chat stream.

**Idempotency.** `maybeGenerateTitle()` reads the row; bails when the
title is anything other than the sentinel `"New Chat"` (`session_title.DEFAULT`).
Re-firing on every turn is safe because the sentinel changes after the
first successful run.

**Provider.** Same provider the chat itself is using. V1 is BYOK-only:
OpenRouter or AI Gateway. The titler never silently swaps to a different
provider. Any future hosted provider must preserve this rule.

**Tier.** Cheapest the provider exposes (`nano` tier in
[`@grida/ai-models`](https://github.com/gridaco/grida/tree/main/packages/grida-ai-models)).
Hard ceiling for any future provider: a tier explicitly marked
"low-cost / low-latency."

**Bounded cost discipline.**

| Knob              | Value                                            |
| ----------------- | ------------------------------------------------ |
| `maxOutputTokens` | `32`                                             |
| `temperature`     | `0.3`                                            |
| `abortSignal`     | `AbortSignal.timeout(15_000)` — 15s hard cap     |
| Input             | First user message text only — no system context |
| Tools             | None                                             |

**Output constraints.** System prompt requires `≤ 8 words AND
≤ 50 chars`, same language as the user. The sanitizer strips quotes,
`<think>` blocks, trailing punctuation, and caps at a 60-char hard
ceiling. If the cleaned output is empty (e.g. the model emitted only a
`<think>` block) the title is left as the sentinel.

**Race-safe persistence.** Re-read the session row after `generateText`
resolves, before persisting; abort if the title changed in the
meantime. A user rename always wins.

**Fire-and-forget.** Title gen never blocks the SSE response. Any
thrown error is logged via `console.warn` (not surfaced to the
renderer); the sentinel stays as the fallback.

**Source.** [`packages/grida-ai-agent/src/sessions/titler.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/sessions/titler.ts).

## compactor — context-window compaction (shipped)

**Status.** Shipped. Realizes the abstract contract in
[`../agent/session.md#compaction`](../agent/session.md) as a Grida
`compactor` subagent under the same cost discipline as `titler`.

**Shape.** A cheap-tier, single-shot `generateText` call with bounded
`maxOutputTokens`, low temperature, no tools, and a constrained
system prompt (Goal / Progress / Decisions / Next steps) that produces
the `data-compaction` part on a synthetic assistant message.

**Cost discipline.**

| Knob              | Value                          |
| ----------------- | ------------------------------ |
| Tier              | `nano` (matches `titler`)      |
| `maxOutputTokens` | `1024` (default; configurable) |
| `temperature`     | `0.2`                          |
| `abortSignal`     | `AbortSignal.timeout(30_000)`  |
| Tools             | None                           |

**Trigger.** Both modes ship:

- **Auto** — `AgentRuntime.run` checks `context_window_used >= usable`
  (`usable = context_limit − reserve`, per-model) before each turn and
  blocks the turn on the summarizer when over.
- **Manual** — `POST /sessions/:id/compact` (`auto: false`).

**Tail + recovery.** Keeps the last `tail_turns` (default 2, capped at
25% of usable, drops to 1 when over budget) verbatim; the head is
summarized and soft-hidden. The failure ladder is: transient retry →
proceed uncompacted; spec-limit → tool-output prune → chunked summarize
→ drop-middle. A separate `pruneToolOutputs` pass can run at a lower
threshold.

**Model view.** The summary lives on a synthetic _assistant_ message in
the DB (for inspection) but is **folded into the next user turn** in the
model view, so the prompt stays user-led (Anthropic requires user-first).

**Source.**
[`packages/grida-ai-agent/src/session/compaction.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/session/compaction.ts)

- [`compactor.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/session/compactor.ts).

## planner — plan/build workflow (future)

**Status.** Future. Plan/build is an opinionated subagent pattern named
in [`../agent/subagents.md#plan--build-mode`](../agent/subagents.md);
when Grida ships it, the planner agent lives here.

Until shipped, agents that want a plan step use the locked `todo` tool
inline.

## Adding a new built-in subagent

Bar: would every Grida agent want this, regardless of host
environment? If yes, it's a built-in subagent. Examples that pass:
titling, compaction, plan generation, summary, summarize-tool-output.
Examples that fail: SVG-shape extraction (Grida-canvas-specific),
form-builder helpers (form-specific).

Process:

1. Confirm the RFC carries the pattern shape — if not, propose it to
   [`../agent/subagents.md`](../agent/subagents.md) first.
2. Drop the implementation under `packages/grida-ai-agent/src/sessions/`
   (titler-shaped helpers) or
   `packages/grida-agent/src/<name>.ts` (full agent definitions).
3. Add a row to the [catalog](#catalog) and a per-agent section here.
4. Document the cost discipline knobs (tier, output cap, temperature,
   timeout) explicitly. Specialized subagents are a place runaway cost
   compounds silently if left unbounded.

## See also

- [Agent system RFC / Subagents](../agent/subagents.md) — abstract
  contract for specialized subagents.
- [Agent system RFC / Session lifecycle / compaction](../agent/session.md#compaction)
  — the compaction shape `compactor` will implement.
- [Fundamental tools (Grida binding)](./tools-fundamentals.md) — how
  the locked-tool RFC lands in Grida.
- [`@grida/ai-models`](https://github.com/gridaco/grida/tree/main/packages/grida-ai-models)
  — the tier / model / pricing catalog these subagents resolve against.
