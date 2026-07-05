---
title: HUD
description: The canvas chrome and its interaction machine — a pure, intent-emitting state machine over two host queries; the host commits, interprets, and paints.
tags:
  - internal
  - wg
  - editor
format: md
---

The **HUD** is the non-content visual chrome on the canvas — selection
outlines, transform handles, hover indication, the marquee — and the
interaction machine that drives it. Blender calls this "Overlays",
Unity calls it "Gizmos"; we use HUD, matching the web implementation
[`@grida/hud`](https://github.com/gridaco/grida/tree/main/packages/grida-canvas-hud),
whose README is the doctrine this document binds natively. Its most
advanced host, `@grida/svg-editor`, proves the host pattern this
document requires.

[architecture.md](./architecture.md) already names the seam: the
surface layer "emits intents; it never mutates directly." This
document specifies the machine that honors that sentence.

## The one law

**The HUD emits intent, and intent only.**

The HUD's single content-bearing output is a stream of intents —
`select`, `translate`, `resize`, `rotate`, `marquee`, `enter content
edit`, `cancel`. It never mutates the document, never opens a history
frame, never reads a node property, and never knows what an intent
_means_. The host commits.

Rotation is the canonical demonstration. The document has no
first-class rotation: "rotation" is a derived reading of a 2×3 affine,
valid only in a patch domain that excludes scale and skew, and some
node kinds refuse it outright. The HUD knows none of this. It measures
an angle from gesture geometry — pointer positions around the
selection shape's center — and emits `rotate { ids, angle, phase }`.
What θ means to the document — recompose the affine, compensate the
position so the visual pivot holds, refuse the kind — is the host's
interpretation, written once, in one module. A HUD that understood
rotation would eventually have to understand every target: rotated
resize, image fills, multi-node pivots. Purity here is what keeps the
chrome reusable and the interpretation auditable.

## The failure being replaced

The first reference shell drove interaction through the engine's
built-in surface, and that machine predates the law:

- **It owns a selection.** The host must run an _adoption_ choke point
  after every dispatch to copy the machine's selection into the
  editor — authority inverted, reconciled by discipline.
- **It emits nothing.** Gestures are internal state; the host
  _scrapes_ state transitions (diffing `prev_canvas` between events)
  to reconstruct a translate delta. Resize and rotate handles are
  painted and hit-tested — and their drags reach no channel at all;
  the host cannot even learn they happened.
- **It has no phases.** Commit timing is re-derived by watching for
  gesture-end transitions, per call site.

Each of these is the same defect: interaction truth trapped inside a
machine whose only outputs are pixels and state to scrape. The HUD
inverts it — the machine's whole job is to _say what the user meant_.

## The machine

A pure state machine, dispatchable headlessly, engine-free.

**Owns** (single source of truth, nothing else needs it): the gesture
state machine, the pending pointer-down (deferred-selection anchor),
hover, the multi-click tracker, the cursor value, live modifiers, the
hit-region registry, a readonly flag.

**Mirrors** (host pushes, HUD never writes): the selection, the camera
transform (canvas ↔ screen). The mirror is rendering and routing
input, not authority — the editor stays the only selection owner.

**Queries** (the only two things the HUD may ask the scene):

- `pick(canvas_point) → Option<Id>` — topmost content node at a point;
- `shape_of(id) → Option<SelectionShape>` — a node's selection shape:
  an axis-aligned rect, or `local rect × matrix` for transformed nodes.

**Emits**: intents, _returned_ from dispatch rather than pushed
through a callback — the host drains them at the same event tail where
it drains damage ([frame.md](./frame.md)); pull, not push, is this
system's idiom.

### Routing

Pointer-down routing implements the golden [selection-intent
router](../../../docs/wg/canvas/ux-surface/selection-intent.md) exactly: tier 1
routes by overlay type over the HUD's own hit registry (resize/rotate
handles commit on-down; the translate body defers), tier 2 falls back
to the scene pick with the would-select/would-deselect asymmetry, and
the drag threshold is the sole click-vs-drag discriminator. The
scenario catalog there is the HUD's conformance test index. Hover
always reflects `pick`; the cursor always reflects what pointer-down
would do.

## Intents

| Intent               | Payload                                 | Phase                  |
| -------------------- | --------------------------------------- | ---------------------- |
| `select`             | ids, mode (`replace` / `toggle`)        | — (instantaneous fact) |
| `deselect_all`       | —                                       | —                      |
| `marquee`            | canvas rect, additive                   | preview·N → commit     |
| `translate`          | ids, (dx, dy) from gesture anchor       | preview·N → commit     |
| `resize`             | ids, anchor direction, new shape        | preview·N → commit     |
| `rotate`             | ids, angle (radians) from gesture start | preview·N → commit     |
| `enter_content_edit` | id                                      | —                      |
| `cancel`             | —                                       | ends any phased stream |

Phase discipline: a mutating gesture emits zero or more `preview`
intents followed by **exactly one** `commit` or **exactly one**
`cancel` — the interaction-side face of the widget binding contract
(UI-4), and the host maps it onto history framing mechanically:
first preview opens the editor's gesture frame and captures baselines,
every preview applies silent patches, commit closes the frame as one
entry, cancel aborts it leaving nothing (HISB-2/4 by construction).

Two payloads are deliberately _less_ resolved than they could be:

- **Marquee carries the rect, not ids.** Which nodes a rect selects is
  scene knowledge (z-order, containment policy); the host resolves it
  per preview and the editor's selection updates live — SURF-7's
  guarantee with the polarity fixed.
- **Deltas, not absolutes, for translate.** The host holds the
  baselines; cumulative deltas from the anchor keep previews
  drift-free and replayable.

## Two backends: render and hit

Inherited verbatim from the `@grida/hud` doctrine: every frame the HUD
produces a **draw list** and a **hit registry**, and they deliberately
disagree. The renderer optimizes for legibility (small, crisp chrome);
the hit-tester optimizes for Fitts'-law reach (fat targets, virtual
regions, priority ladders). Neither reads from the other.

| Family      | Visual            | Hit region                 | v1 example                |
| ----------- | ----------------- | -------------------------- | ------------------------- |
| Paired      | drawn shape       | same shape, padded         | corner resize knob        |
| Virtual     | none              | invisible reachable region | rotate halo, edge strip   |
| Decorative  | drawn shape       | none                       | hover outline, size badge |
| Body-region | selection outline | interior claims translate  | selected body             |

Guidance carried over: decide hit geometry first, visual second; a
virtual affordance omits render rather than drawing a stand-in; pad
the hit region, never the visual. Overlap resolves by a deterministic
priority ladder owned by the HUD (handles beat body, body beats
nothing — content pick is tier 2, not a region).

## Chrome and painting

The v1 chrome inventory: hover outline, per-node selection outlines,
the multi-select union box, 4 corner resize knobs + 4 virtual edge
strips + 4 virtual rotate halos, the marquee rectangle, and a size
badge. The HUD _builds_ this as data — a draw list of dumb primitives
(doc-space rects/polylines, screen-sized rects anchored at doc points,
label pills) — and the host paints it on the window canvas between
content and panels. The HUD is not a renderer.

Chrome is a pure function of (machine state, mirrors, `shape_of`):
rebuilding against equal inputs yields an identical draw list, which
is SURF-5 made mechanically checkable. Because the host applies
preview patches to the real document, chrome derived from `shape_of`
tracks a live gesture with no separate preview geometry; transform
handles hide while a gesture is active.

**Compositing rule — every present recomposes.** Chrome and panels
composite over the content buffer; there is no separate overlay
layer. And the window surface is a **double-buffered swapchain**: the
buffer a frame draws into holds the frame from _two_ presents ago,
not the last one — so partial redraws ("only the panel changed",
"opaque strips cover themselves") are unsound at the root; they
alternate stale buffers into view. The rule that survives this:
**every present is a full recomposition** — restore the content base,
flush any pending content frame, then rebuild chrome and panels on
top. The base restore is cheap: the renderer captures a full-surface,
content-only snapshot mid-flush (before any host overlay), exactly so
overlay-bearing presents can blit it back instead of re-rendering the
scene; with no cache, one synchronous plan-path frame stands in.
Overlay changes (a marquee preview, a hover move, a selection change
that re-shapes chrome or unmounts a panel, a tool switch flipping
chrome dormancy) accrue no _document_ damage — the frame ledger
([frame.md](./frame.md)) rightly schedules nothing — they are
**overlay damage**, and all they schedule is a present. One trap is
named and forbidden: the present pass must never _queue_ an engine
frame — a queue that finds nothing pending notifies the host to
redraw, and a paint pass that queues re-triggers itself into a
permanent repaint loop. Quiescence holds: no event, no damage, no
present.

## What the HUD is not

- **Not a selection store.** Mirror in, intents out. The adoption
  choke point of the first shell is retired, not relocated.
- **Not a document interpreter.** Intent → mutation mapping (including
  refusals) lives in exactly one host module, beside the editor.
- **Not the tool machine.** [tool.md](../../../docs/wg/canvas/tool.md) owns the tool rung of
  the SURF-1 ladder; while a non-cursor tool is armed the HUD is
  dormant (no chrome, no routing).
- **Not the text-edit session.** The engine's session is authoritative
  during editing; the HUD's part ends at `enter_content_edit`.
- **Not the camera.** Pan/zoom are host view state; the HUD receives
  the transform.
- **Not a snapping engine.** Snapping adjusts _interpretation_
  (host-side, gesture-time — [snap.md](../../../docs/wg/canvas/snap.md)); snap guides and
  the [measurement](../../../docs/wg/canvas/measurement.md) readout ride the draw list as
  host-fed extras, decorative only.

Deferred, named: lasso, vector/path sub-selection chrome, padding and
corner-radius handles, resize of rotated nodes (local-frame resize —
rotated selections get outline, body-translate, and rotate halos, but
no resize knobs in v1), clickable frame titles, the tap outcome
channel, hover pushes from the hierarchy panel. Snapping guides,
formerly deferred here, are specified with the other overlay systems
([snap.md](../../../docs/wg/canvas/snap.md), [measurement.md](../../../docs/wg/canvas/measurement.md),
[ruler.md](../../../docs/wg/canvas/ruler.md), [pixel-grid.md](../../../docs/wg/canvas/pixel-grid.md)); the
ruler's guide intent extends the intent table per
[ruler.md](../../../docs/wg/canvas/ruler.md).

## Contracts

- **HUD-1** Intent purity: the HUD module depends on no document,
  editor, history, or renderer type. Its inputs are events, the two
  mirrors, and the two scene queries; its only content-bearing output
  is the intent stream. Every content effect of canvas interaction is
  attributable to an emitted intent the host committed.
- **HUD-2** Phase discipline: every mutating gesture emits zero or
  more previews followed by exactly one commit or exactly one cancel,
  never interleaved; selection facts (`select`, `deselect_all`) are
  unphased. The host maps preview/commit/cancel onto one history
  frame (SURF-2 by construction).
- **HUD-3** Mirror, not owner: no HUD dispatch mutates the selection
  mirror; it changes only by host push. The editor remains the single
  selection authority, and by the end of any dispatched event the
  editor's selection and the HUD's rendered selection agree — SURF-7's
  guarantee with intents flowing up and the mirror flowing down.
- **HUD-4** Router conformance: pointer-down routing satisfies the
  golden selection-intent router's conformance clauses; every named
  scenario in v1 scope has a test asserting classification, commit
  timing, and drag-promotion cancelling the deferred select
  (discharges SURF-3).
- **HUD-5** Two backends: every affordance declares hit and render
  independently; virtual affordances register hit regions with no
  render primitive; conformance asserts each side separately and,
  where they differ, that they differ in the intended direction.
- **HUD-6** Pure chrome: the draw list and hit registry are a pure
  function of machine state, mirrors, and `shape_of` — equal inputs,
  identical output (refines SURF-5).
- **HUD-7** Host interpretation: intent interpretation is one host
  module; replaying an intent stream against the same document
  produces the same mutations, and an intent the document refuses
  (e.g. `rotate` on a kind outside the rotation patch domain) is
  refused there without the HUD holding or needing any knowledge of
  the refusal.
- **HUD-8** Hover/cursor decoupling: hover reflects `pick` on every
  move regardless of overlays; the cursor reflects what pointer-down
  would do at that point. Neither is suppressed by chrome.
