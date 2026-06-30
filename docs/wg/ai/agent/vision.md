---
title: Visual perception
description: The read/view modality split. Why a text read and a visual view are separate tools, the perception-tool contract, the input matrix (bitmaps now, rendered sources later), how a tool result becomes a provider image block, and the retention policy that keeps perceived pixels from re-filling context every turn.
keywords:
  [
    agent-system,
    vision,
    perception,
    view-image,
    multimodal,
    read,
    modality,
    retention,
    context,
    tool-output,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Visual perception

A file can be perceived two ways. Read as **text**, an SVG is markup, a
screenshot is undecodable bytes, a chart is a wall of numbers. Seen as
**pixels**, the SVG is a shape, the screenshot is a UI, the chart is a
trend. These are different perceptions of the same source, and an agent
needs both — not interchangeably, but deliberately, one at a time.

This page specifies the **view** half: the tool an agent calls to _see_ a
source as an image, why it is separate from the **read** tool, and the two
things that make it work in practice — turning a tool result into something
the model sees as pixels, and keeping those pixels from drowning the context
on every later turn.

## The read/view split

The fundamental read tool ([`tools`](./tools.md)) returns **text** and
refuses pixels. That refusal is the design, not a limitation. A separate
**view** tool returns a provider-native image block and refuses text. The
verb names the modality:

- **read** → text. The default. Cheap, exact, what you call to inspect or
  edit a file's contents.
- **view** → pixels. On demand. What you call to perceive what a source
  _looks like_.

Two reasons the split is load-bearing, not a stylistic choice:

1. **Perception is not free.** Image tokens are the most expensive thing a
   model can hold. If every `read` of an image-shaped file returned pixels,
   every file listing and every incidental read would burn vision budget. By
   making pixels a distinct, explicit call, the agent pays for perception
   only when it decides it needs to see.
2. **A text source has a real text perception too.** An SVG, a snippet of
   code, a Markdown table — the agent usually wants the _source_, and only
   sometimes the _rendering_. One tool that did both would have to guess
   which the agent meant. Two tools let the agent state it.

A conforming implementation MUST keep these as two tools. It MUST NOT
overload the read tool with a media-returning mode, and MUST NOT make the
view tool also serve text.

## The perception-tool contract

The view tool takes a **reference to a source** (a path in the agent
filesystem; an environment may extend this to other references) and returns
one of:

- **a perception** — the source as a provider-native image block the model
  sees as pixels, plus light metadata (the resolved media type and, where
  cheap to determine, the pixel dimensions and byte size); or
- **a typed refusal** — the source is absent, is not a perceivable type, or
  exceeds the size bound. A refusal is an ordinary result the model reads and
  adapts to, never an exception.

The tool declares a **read capability** over the reference, the same scope
the read tool needs — perceiving a source is a read, not a new privilege. It
adds no write or network surface. (A future rendering path, below, adds a
render capability; bitmap perception does not.)

Perception is **not** a `read` for the read-before-edit contract. Seeing an
image is not reading text you intend to change; it must not satisfy the
freshness token an edit requires.

## The input matrix

What counts as "perceivable" grows over time under the same tool. The verb
is honest across that growth: whatever the source, the _output_ is an image
the model sees.

| Source class                            | How it becomes pixels                               | Status      |
| --------------------------------------- | --------------------------------------------------- | ----------- |
| Raster bitmap (png / jpeg / webp / gif) | Decoded bytes, handed to the provider directly      | **Shipped** |
| Vector / markup (svg)                   | Rendered to a raster, then perceived                | Planned     |
| Text / code / document                  | Rendered to a raster (a "screenshot" of the source) | Planned     |

The first row needs only a byte read. The others need a **renderer** — a
host-supplied capability that rasterizes a source the provider can't see
natively. The contract is designed so adding them is a capability the host
injects, not a new tool and not a renamed one.

> **Boundary against [`binary`](./binary.md).** Binary handling is about
> attachments the model _cannot read at all_ (a `.psd`, a `.zip`) and the
> routes that make them useful. Visual perception is about sources the model
> _could_ read as text but where the agent wants the **rendering** instead
> (an svg, a screenshot). A raster bitmap is the overlap: binary treats a
> pasted image as a native-multimodal attachment; this page is how the agent
> reaches one that lives at a path, by choice, through a tool.

## Result-to-image lowering

The hard part is mechanical, not conceptual: a tool **result** must reach
the model as a provider image block, and the model's view is rebuilt from
the **persisted** record every turn (see [`session`](./session.md),
[`compositor / lowering`](./compositor.md#templating-user-view-vs-model-view)),
not from the live return value. So the lowering must be reproducible from
what was stored.

Two conforming strategies — **which one is viable depends on the wire
format**, not on taste:

1. **Tool-output media.** The tool result carries the image payload, and the
   tool declares a model-output lowering that turns that payload into a media
   block. Because the lowering is a property of the tool — re-applied
   whenever the persisted result is converted to a model message — the
   perception reproduces on every rebuild with no bespoke replay path. This
   is the cleanest fit, **but only on a substrate whose tool output can carry
   structured media** — the OpenAI Responses API (`function_call_output`
   content items) and Anthropic-native (`tool_result` image blocks). It does
   **not** work on the OpenAI Chat Completions / openai-compatible wire,
   where a `role:"tool"` message is text-only: the media block is stringified
   to undecodable base64 text and the model sees nothing (and the text-token
   count overflows context). Do not assume this strategy works just because
   the unit test sees a media block — that is one layer above the provider
   conversion that breaks it.
2. **Stage-and-reattach.** The runtime re-injects the image as a normal
   user-message attachment through the proven attachment-lowering path; the
   tool result itself stays a small descriptor. **Required** when the
   substrate cannot carry media in a tool output (Chat Completions /
   openai-compatible), and always correct since a user-message image is the
   universal vision input. For the AI SDK realization (a `prepareStep`
   hoist), see [`ai-sdk / vision-lowering`](./ai-sdk/vision-lowering.md).

Either way the **persisted result is the durable record** and the lowering
is derived from it — never a side effect that only happened during the live
turn.

## Retention: keep recent, elide old

A perceived image is large and the model view is rebuilt every turn, so
without a bound the same pixels re-encode into every future prompt — the
context fills with a picture the model already described. The retention
policy bounds this.

- **Eviction is a view decision, not a delete.** The image bytes stay in the
  durable record (for inspection, replay, rewind). Retention changes only
  _what the model sees this turn_.
- **Keep the recent window live; elide the rest.** Image pixels stay live
  only within the most recent perception window (the current turn and a
  small, host-tunable number of prior turns — a default of just the current
  turn is reasonable, since vision tokens are the costliest thing in
  context). Older perceptions lower to a short text descriptor that names the
  source so the model knows it was seen.
- **Eviction is safe because re-perception is cheap.** The agent can call the
  view tool again to bring the pixels back. This is the payoff of the
  read/view split plus a durable record: dropping a stale image costs
  nothing, because re-viewing is one explicit, idempotent call. The elided
  descriptor SHOULD say so.

### Asymmetry: only re-viewable perceptions are auto-evicted

A tool-produced perception is **re-viewable** — there is a reference and a
tool to call again. An inline image the user pasted into a message is
**not**: there is no path to re-fetch it, so eliding it is lossy and
irreversible. Retention therefore auto-evicts re-viewable perceptions but
leaves user-attached images in place (they are already bounded by the
attachment-storage policy in [`compositor`](./compositor.md#attachment-storage)).
The unifying rule is **evict only what perception can restore** — not "evict
all images." A host that later gives pasted images a re-view reference can
bring them under the same policy.

## Implementor checklist

A conforming implementation SHOULD:

- Ship perception as a tool distinct from the read tool; keep read text-only.
- Return a typed refusal (absent / unperceivable-type / too-large) rather
  than throwing.
- Bound the perceivable byte size, consistent with the inline-attachment
  bound.
- Lower a perception so it reproduces from the **persisted** result, not just
  the live return.
- Choose the lowering strategy by **wire format**: tool-output media only on
  substrates that carry structured media in a tool output (Responses API,
  Anthropic-native); stage-and-reattach on Chat Completions / openai-compatible.
  Verify perception **end-to-end through a real provider**, not just the
  media-block shape.
- Evict stale **re-viewable** perceptions to a naming descriptor; leave
  non-re-viewable images (pasted attachments) intact.
- Declare only a read capability for bitmap perception; gate the rendered
  (svg / text) path behind a render capability when it lands.

## What this guide does not specify

- **The reference syntax beyond a filesystem path.** Mentions, content-ids,
  environment-specific handles — host territory.
- **The renderer.** Which engine rasterizes an svg or a text source, and at
  what resolution, is the host's call (and out of scope until the render path
  ships).
- **The exact retention window.** One turn, a few turns, a token budget — all
  conformant; the invariant is "evict only what perception can restore."
- **Dimension extraction.** Whether and how the tool reports pixel
  dimensions is best-effort metadata, not part of the contract.

## See also

- [Tools](./tools.md) — the read tool this splits from, the tool contract,
  and the result envelope.
- [Compositor](./compositor.md) — inline image attachments, the
  user-view-vs-model-view lowering chain, attachment storage.
- [Binary file handling](./binary.md) — attachments the model can't read
  natively; the adjacent, non-overlapping problem.
- [Session Lifecycle](./session.md) — why the model view is rebuilt from the
  persisted record every turn (the reason lowering must be reproducible).
