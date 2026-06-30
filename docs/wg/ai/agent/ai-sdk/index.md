---
title: AI SDK (reference substrate)
description: The guide pins AI SDK v6 as the chunk-shape substrate every conforming implementation speaks internally. This page captures the implementor notes that live outside AI SDK's own docs — the token-usage normalization rule, where the SDK's tool-loop helper fits, and the things the RFC adds on top.
keywords:
  [
    agent-system,
    ai-sdk,
    ai-sdk-v6,
    substrate,
    chunk-shape,
    token-normalization,
    cache,
    tool-loop,
    reference,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# AI SDK (reference substrate)

[`ai-sdk`](https://ai-sdk.dev/) is the chunk-shape substrate this
guide pins. The reason the pin exists, and what the SDK provides for
free, is named in [`foundations`](../foundations.md#streaming-substrate-ai-sdk-v6).

This page is the **implementor's annex** to AI SDK's own docs. The
SDK's documentation already covers usage end-to-end; only the
things the RFC needs that aren't (or aren't prominently) in AI SDK's
docs live here. Keep this short on purpose — when the SDK adds a
concept, do not re-document it; link out.

## Token usage — the cache normalization rule

The guide's per-turn token breakdown
([`session / context-window tracking`](../session.md#context-window-tracking))
records five components: `input`, `output`, `reasoning`,
`cache_read`, `cache_write`. The AI SDK's `usage` object surfaces
these via `inputTokens`, `outputTokens`, `reasoningTokens`,
`cachedInputTokens` (read), and the provider-specific cache-write
field.

The non-obvious detail every implementor hits:

> **AI SDK v6's `inputTokens` _already includes_ cache-read and
> cache-write.** To isolate the non-cached input portion the
> recorder MUST subtract:
>
> ```text
> input = inputTokens - cache_read - cache_write
> ```

Without the subtraction, the persisted `prompt_tokens` double-counts
the cached portion and the session's running total drifts from the
provider's billing view. The rule is silent in AI SDK's docs because
the SDK treats `inputTokens` as the unified count; the RFC's
per-component breakdown forces the split.

The other four components map straight through:

| RFC column          | AI SDK source                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `prompt_tokens`     | `inputTokens − cache_read − cache_write` (the rule above)                                        |
| `completion_tokens` | `outputTokens`                                                                                   |
| `reasoning_tokens`  | `reasoningTokens` (`0` when the model has no reasoning channel)                                  |
| `cache_read`        | `cachedInputTokens`                                                                              |
| `cache_write`       | Provider-specific. Anthropic exposes `cacheCreationInputTokens`; OpenAI does not (treat as `0`). |

The recorder taps `onStepFinish` (per the AI SDK API) and applies
the normalization on each step's usage delta.

## Tool-loop helper

AI SDK ships an opinionated tool-loop primitive — see
[`ai-sdk-core / tool-loop-agent`](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent).
Implementors taking the **adapter path** (per
[`foundations / native vs adapter path`](../foundations.md#native-vs-adapter-path))
can lean on it directly: it handles tool calls, stop conditions,
multi-step continuations.

The RFC does not normatively require it. Implementors who take the
**native path** must reproduce the equivalent control flow
themselves (tool-call dispatch, stop-condition evaluation,
multi-step continuation). Both paths emit the same
`UIMessageChunk` stream downstream.

## What the RFC adds on top

A few load-bearing decisions the SDK is deliberately silent on:

- **Persistence.** AI SDK has no opinion on storage. The RFC pins
  the three-table SQLite shape — see
  [`persistency`](../persistency.md).
- **Compaction.** AI SDK does not auto-compact. The RFC's overflow
  / tail / prune machinery lives in
  [`session / compaction`](../session.md#compaction).
- **Subagents.** AI SDK's tool layer does not include a `task` tool.
  The RFC adds it — see [`subagents`](../subagents.md).
- **ACP outward wire.** AI SDK is host-internal. The RFC's outward
  wire is ACP — see [`acp`](../acp.md).
- **Skills, MCP, watchdog, sandbox.** All RFC additions on top of
  the substrate.

When in doubt: AI SDK is the **wire vocabulary**; the RFC is the
**runtime contract** that uses it.

## SDK-specific implementor notes

Workarounds that exist only because we **consume** the SDK rather than
own the provider wire. These are not part of the neutral RFC — they are
the price of the adapter path.

- [Visual perception lowering](./vision-lowering.md) — why a tool-result
  image must be hoisted to a user-message image part at `prepareStep` on
  the OpenAI-compatible wire, and how that composes with the neutral
  [`vision`](../vision.md) retention contract.

## See also

- [Foundations / streaming substrate](../foundations.md#streaming-substrate-ai-sdk-v6) —
  why AI SDK v6 is pinned, what its chunk vocabulary is, what the
  SDK provides for free.
- [Session / context-window tracking](../session.md#context-window-tracking) —
  where the normalized token values land.
- [`ai-sdk.dev`](https://ai-sdk.dev/) — the SDK's own documentation
  (canonical for usage; this page is implementor's annex).
