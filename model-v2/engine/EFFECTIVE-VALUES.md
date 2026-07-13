# EFFECTIVE VALUES — the pre-animation engine contract

**Status:** Implemented foundation. This contract contains no semantic time,
animation program, track, keyframe, interpolation, composition, scheduling, or
playback behavior.

## Boundary

The model owns one closed typed property registry and one immutable effective
value representation:

```text
authored Document + PropertyValues
                  |
                  v
             validated ValueView
                  |
                  v
      resolve -> drawlist -> raster
          |          |
          +------ query / damage / cache
```

`PropertyValues` maps `PropertyTarget` to one exact `PropertyValue`. A target
is an arena-incarnation-scoped, generation-stamped `NodeKey` plus a closed
`PropertyKey`. Missing means the authored base value. Nullable properties use
their own exact optional type; there is no universal null. Duplicate, stale,
cross-arena, mistyped, inapplicable, and invalid values fail before traversal.

Structural facts—payload kind, parenthood, child order, and nested paint,
stroke, stop, text-run, or lens-operation members—are not node properties.
Those nested objects need durable identity before they can become individual
targets.

## Identity handoff

Version 4 source materialization owns authored owner/member/use-occurrence
addresses. It resolves one address to one live `NodeKey`; pairing that key with
a `PropertyKey` produces the runtime `PropertyTarget`. Engine source does not
import or interpret XML addresses. Runtime keys are never serialized.

The arena incarnation prevents keys from crossing an independent parse or
document clone. The slot generation prevents a deleted occupant from aliasing
a later occupant of the same slot. Both counters fail closed on exhaustion.

## Pipeline laws

- Static resolver, drawlist, frame, and raster entries have exactly the
  `ValueView::base(document)` semantics. Their authored hot path is privately
  monomorphized to direct document reads; it is not a second contract or
  projection algorithm.
- One validated `ValueView` feeds resolution and drawlist construction.
- Resolution snapshots child order, transparent-select behavior, and effective
  descendant-clip geometry. Query accepts only that `Resolved` product, so no
  document or value view can be paired with another frame's hot columns.
- The authored `Document` remains immutable while effective values are read.
- The full resolver, full drawlist, and full raster path remain the permanent
  reference. Property impact flags do not select an optimized path yet.
- Frame construction is fallible after the exact drawlist exists. Every visible
  gradient is revalidated for programmatic-document safety, then its authored
  transform is composed with the actual resolved paint box and checked with
  the raster backend's own matrix inversion, and the selected shader factory
  (including the diamond runtime effect) is actually probed. A complete
  `FrameProduct` is minted only after this preflight succeeds; rendering emits
  no canvas command on failure.

The canonical frame boundary still assumes that its `Document` came through
source parsing or the shared model renderability fence. Gradient revalidation
is repeated here because direct programmatic documents could otherwise reach a
fallible shader factory, and gradient/image contextual checks require resolved
boxes, backend arithmetic, resources, or a final view that authored validation
cannot know. This is not an exhaustive validator for every malformed hand-
built stroke, corner, path, or image-model combination.

## Damage and resources

`damage::diff` compares resolved geometry only and remains a compatibility
primitive. `damage::diff_frame` is the complete visual reference: it compares
two immutable `FrameProduct`s, including paint-only changes, opacity scopes,
strokes, clips, text/path artifacts, painter order, and paint environments.

Host fonts and decoded image bytes are separate declared inputs. `PaintCtx`
exposes an opaque `PaintEnvironmentKey` containing its checked incarnation and
revision. Each `FrameProduct` captures that key, and `damage::diff_frame`
conservatively damages all nodes owning before/after draw items when the keys
differ. This covers resource readiness and replacing bytes under the same
logical RID without pulling `PaintCtx` into damage data.

Complete product execution checks the current `PaintCtx` key before drawing and
returns an explicit mismatch error after any context replacement or resource
revision. It then preflights each evaluated image paint against the exact
requested view: resource presence, supported fit state, shader construction,
and the backend inverse of `view × world × image-fit`. A failure identifies the
node, fill/stroke/text-run context, visible drawlist paint index, RID, and
reason before touching the destination canvas. A singular geometry CTM is
valid collapsed coverage and is not misreported as an image sampling failure.
Raw drawlist replay is named `execute_unchecked`; it remains an explicitly
quarantined structural/internal entry that may omit unsupported or unavailable
image paints.

`SceneCache` keys the runtime document root, resolve options, exact
`PropertyValues`, and `PaintEnvironmentKey`. A changed effective value,
document incarnation, font, or image resource therefore rebuilds the retained
drawlist/raster even without a document-dirty hint. Rebuild is transactional:
a frame-build or checked-execution failure preserves both the destination
canvas and the previous retained image, drawlist, and keys.

## Guarding tests

- `tests/values.rs`: empty static equivalence; layout, rotation, fills,
  opacity, strokes, active state, query, damage, and pixels.
- `tests/ident.rs`: live-only keys and cross-document refusal.
- `tests/damage.rs`: geometry, text artifacts, and painter-order changes.
- `tests/frame.rs`: unchanged-context execution; wrong-context and post-build
  resource-revision refusal; source/effective extreme-gradient acceptance;
  resolved-box capability failures; contextual diagnostics; and no canvas
  mutation on build error.
- `tests/query.rs`: resolved-only query parity and retained traversal/clip
  independence from later authored mutation.
- `tests/cache.rs`: exact values, document replacement, same-RID resource
  replacement, and transactional failure preserving the prior cached frame.
- `tests/grida_xml_source.rs` with
  `rig/fixtures/durable-addressing.grida.xml`: authored occurrence address to
  typed runtime target to evaluated frame output.

The future animation design must produce `PropertyValues`; it must not invent
a parallel sampled-value abstraction. See [ANIMATION.md](./ANIMATION.md).
