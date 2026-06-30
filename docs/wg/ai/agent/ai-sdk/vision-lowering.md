---
title: Visual perception lowering (AI SDK)
description: Why a tool-result image must be hoisted into a user-message image part on the OpenAI-compatible wire, and how to do it as an AI SDK consumer. The Chat Completions tool role is text-only, so the SDK stringifies a tool-output media block to base64 text the model cannot decode. The fix is a prepareStep transform that re-attaches the image as a user message — the SDK-specific realization of the neutral vision RFC's stage-and-reattach strategy.
keywords:
  [
    agent-system,
    ai-sdk,
    vision,
    perception,
    view-image,
    tool-result,
    image,
    prepareStep,
    openai-compatible,
    lowering,
    multimodal,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Visual perception lowering (AI SDK)

This is an **SDK-specific implementor note**, not part of the neutral
RFC. It exists because we take the [adapter path](../foundations.md#native-vs-adapter-path)
— we _consume_ the AI SDK and do not own the provider wire conversion.
The neutral contract is [`vision`](../vision.md); this page is how its
"stage-and-reattach" strategy is realized on this substrate.

## The defect it documents

[`vision / result-to-image lowering`](../vision.md#result-to-image-lowering)
offers two ways to get a tool-produced image in front of the model:

1. **Tool-output media** — the tool's `toModelOutput` returns a media
   block; the substrate carries it in the tool result.
2. **Stage-and-reattach** — the runtime re-injects the image as a normal
   user-message attachment; the tool result stays a small descriptor.

Strategy 1 reads as the simpler default, and it **works on Anthropic-native**
(a `tool_result` block carries image content). But it is **non-functional
on the OpenAI Chat Completions / openai-compatible wire** — the dominant
BYOK path (OpenRouter, Ollama, custom endpoints).

The reason is the wire format, not the SDK: a Chat Completions
`role:"tool"` message's content is **text-only** — there is no image slot.
So `@ai-sdk/openai-compatible`, converting a tool result whose
`toModelOutput` produced `{type:"content", value:[{type:"media", …}]}`,
**`JSON.stringify`s** the media block. The base64 lands in the prompt as
an undecodable string. The model cannot see pixels; it guesses. The same
string is counted as text-input tokens (≈ length ÷ 4), so a turn that
views several large images also **overflows the context**.

This shipped undetected because the unit tests verified the media-block
_shape_ and the retention pass — never that a real model _perceives_ the
image through a real provider. The stringify happens one layer below, in
provider message conversion, which the unit tests do not exercise.

## How the wire format decides — two peers

The wire format, not the agent, decides whether a tool result can carry
an image:

- A coding agent on the OpenAI **Responses API** keeps the image **in the
  tool output** — `function_call_output.output` is an array that may hold
  `input_image` items. This works _only_ because the Responses API carries
  structured content in tool outputs. Chat Completions has no such slot.
- A coding agent on **Chat Completions** **hoists** the image out of the
  tool result into a synthetic `role:"user"` image message (tool message
  keeps text only), and keeps it native for Anthropic — precisely to avoid
  stringifying base64 into the prompt.

So: **structured-tool-output wires** (Responses API, Anthropic-native) can
carry the image in the tool result; **Chat Completions / openai-compatible
cannot → hoist to a user message.**

## The fix: a `prepareStep` hoist

A peer that owns its provider-protocol layer branches at the wire
boundary. We don't own that layer — the SDK's provider adapter is where
the stringify happens, and it's downstream of us. Our injection point is
[`prepareStep`](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent),
the in-loop hook that can rewrite the `ModelMessage` array sent to the
model **for each step**, upstream of the adapter.

A single pure transform, `hoistToolResultImages(messages) → messages`:

1. For each `role:"tool"` message, find `tool-result` parts whose
   `output.type === "content"` and whose `value` carries image items
   (`media` / `image-data` / `file-data` with an `image/*` mediaType).
2. **Neutralize** the tool result — replace the image item(s) with a short
   text part (`[image shown in the following message]`), preserving the
   tool-call ↔ tool-result pairing the protocol requires.
3. **Re-attach** — insert a `{role:"user", content:[{type:"image", image,
mediaType}]}` message immediately after, so the bytes go through the
   provider's **image encoder** (tiled, ~1.5k tokens) instead of the text
   tokenizer.

Two properties make `prepareStep` the right seam:

- **One transform, both cases.** `prepareStep` receives
  `[...initialMessages, ...responseMessages]` — the rebuilt history **and**
  the in-loop steps. So the same transform fixes a _cross-turn_ perception
  (image viewed a prior turn) and a _same-turn_ one (view-and-reason in one
  turn) without two code paths.
- **The bytes are still structured.** At `prepareStep` time `toModelOutput`
  has already run (the tool result is a `{type:"content"}` media block) but
  the provider's `JSON.stringify` has **not** — so the image is intact and
  matchable. The hoist runs in the window between the two.

### Why universal, not provider-branched

The transform is applied on **every** provider, not gated to
openai-compatible. A user-message image part is the universal vision input
— it is equally valid on Anthropic-native — so hoisting everywhere is
correct and keeps the agent core free of provider detection (the package's
core is deliberately "not a provider router"). The cost is a benign
structural change on Anthropic, where the tool-result block would also have
worked. If we ever drive the OpenAI **Responses API** through the SDK, the
in-tool-output image becomes available for that path and the hoist can be
skipped there — at which point provider-awareness would be worth its
weight; until then, universal is simpler and correct.

### Why it is shape-keyed, not tool-keyed

The transform matches the **media-block shape**, not a tool name, so any
image-producing tool result is hoisted — robust to future tools and not
coupled to `view_image`. (`generate_image` is generate-only today, so it
produces no media block and is untouched; if it ever re-adds perception it
inherits the fix for free.)

## Composition with retention — no double-handling

The transform does **not** replace the neutral retention contract
([`vision / retention`](../vision.md#retention-keep-recent-elide-old)); it
sits below it. The server-authoritative rebuild already strips the bytes
from stale perceptions (they lower to a text descriptor) and keeps them on
the live window. So by the time `prepareStep` runs, only **live-window**
images still carry a media block; stale ones are already text and the hoist
skips them. The hoist is a pure view transform, **never persisted** — the
durable record keeps the original tool-result shape, so the lowering
reproduces from storage on every turn, exactly as
[`session`](../session.md) requires.

This is also why the fix resolves the context-overflow symptom: a live
image becomes ~1.5k vision tokens instead of ~1M text tokens, and stale
ones carry no bytes at all.

## Verification

The defect is invisible to shape-level unit tests, so the regression guard
must be **end-to-end through a real openai-compatible provider**:

- A guess-proof controlled image (e.g. four quadrants, a **non-obvious**
  palette the model cannot guess from priors) viewed via the perception
  tool, asserting the model names every region **exactly**. A plausible-
  sounding description is not acceptance.
- A turn that views several large images completing **without** a context
  overflow.

A pure unit test pins the transform shape (media block → neutralized tool
result + a following user image message; already-elided and non-image
results untouched; idempotent), but it is the live test that would have
caught the original bug.

## See also

- [Visual perception](../vision.md) — the neutral contract: the read/view
  split, the perception-tool contract, retention, and the two lowering
  strategies this page realizes.
- [AI SDK (reference substrate)](./index.md) — why the adapter path leads
  here.
- [Compositor](../compositor.md) — the user-message attachment-lowering
  path the hoist re-attaches into.
