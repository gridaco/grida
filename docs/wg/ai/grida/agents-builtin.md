---
title: Built-in subagents
description: Grida's specialized internal agents (chat titles and context compaction) — concrete bindings of the specialized-subagent pattern with their provider and cost discipline.
keywords: [agent, subagent, titler, compaction, grida, specialized-subagent]
format: md
tags:
  - internal
  - wg
  - ai
  - grida
---

# Built-in subagents

This page is the **Grida binding** of the specialized subagent pattern
([Master / delegation and verification](../agent/master.md#delegation-and-verification)).
The master names the shape: an internal agent the host invokes with a
constrained prompt and bounded cost. This page records what Grida runs and
the product decisions for each.

Every built-in operation stays on the chat's provider authority. Titling and
compaction never move a chat to a different capacity source; if that
provider cannot serve the request, the operation fails without changing
provider.

## Catalog

| Operation  | Triggers when                                                  | Output                                          |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------- |
| Chat title | The first text request of an untitled chat is accepted         | The chat's catalogue label                      |
| Compaction | Context nears the verified window (automatic) or the user asks | A bounded summary that replaces earlier context |

## Chat title

**Opt-in.** A client enables titles at launch, because a title costs one model
request that one-shot runs and scripted providers do not expect. Temporary
hosts — side chats and the titler itself — never title.

**Trigger.** When a chat's first text request is accepted, the title runs in
the background alongside the first turn. Subagent chats and chats that already
have a turn are not titled.

**Shape.** A temporary, in-memory, tool-free conversation under the same
launch's provider execution. Input is the bounded first request text only.

**Bounds.** The request text is capped near 1 KB, the run has a fixed timeout,
and the output is reduced to the first line without quotes, reasoning markup,
or trailing punctuation, then bounded to a short label. Empty output leaves the
chat untitled.

**Race safety.** The title is written only if the chat is still untitled at
the same catalogue revision. A person's rename always wins. Failure is
silent; the chat stays untitled.

## Compaction

**Contract.** Realizes [Master / context and tool design](../agent/master.md#context-and-tool-design)
as one bounded, tool-free summary of portable earlier context.

**Triggers.** Automatic when the assembled context approaches the model's
verified context window, and manual on request.

**Bounds.** The summarized source and the summary have fixed byte ceilings and
the summary a fixed output-token ceiling. A summary that is invalid or does not
reduce context is refused.

**Authority.** Compaction runs on the chat's own model and captured provider
authority. If the live principal, scope, or provider differs during the run or
its recovery, it fails as an authority change instead of continuing elsewhere.

**Outcome.** An installed summary replaces the covered records; every other
outcome (stale, stopped, uncertain, failed, no change) leaves history intact.

## Adding a built-in subagent

Bar: would every Grida agent want this, regardless of host environment? If
yes, it is a built-in. Titling and compaction pass; canvas-specific extraction
or form-builder helpers do not. Planning is an operating regime of the chat
itself ([Plan mode](../agent/mode-plan.md)), not a built-in subagent.

1. Confirm the master carries the pattern shape — if not, propose it to
   [Master / delegation and verification](../agent/master.md#delegation-and-verification) first.
2. Add a row to the [catalog](#catalog) and a section here.
3. State the cost bounds (input, output, timeout, tools) explicitly.
   Specialized subagents are where runaway cost compounds silently.

## See also

- [Fundamental tools (Grida binding)](./tools-fundamentals.md)
