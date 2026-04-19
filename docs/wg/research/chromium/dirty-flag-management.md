---
title: "Chromium Dirty-Flag Management"
tags:
  - internal
  - research
  - chromium
  - invalidation
  - dirty-flags
---

# Chromium Dirty-Flag Management

Research document describing the mechanisms Chromium/Blink uses to mark
work as needed between frames. Organized by **category** (what kind of
work is dirty) and by **shape/granularity** (how much of the tree is
affected).

This document is a pure survey of upstream mechanisms. All file paths
refer to `third_party/blink/renderer/` and `cc/` in the Chromium source
tree.

## Table of contents

1. [Pipeline overview](#pipeline-overview)
2. [Categories of dirty state](#categories-of-dirty-state)
3. [Shapes/granularity of invalidation](#shapesgranularity-of-invalidation)
4. [Cross-category index by change type](#cross-category-index-by-change-type)

---

## Pipeline overview

Chromium's rendering runs as a fixed sequence of phases per frame:

```
DOM mutation / animation tick / style-sheet change
  │
  ▼
┌─────────────────────────┐
│ Style invalidation      │  mark which elements *might* need style recalc
├─────────────────────────┤
│ Style recalc            │  compute new ComputedStyle, produce StyleDifference
├─────────────────────────┤
│ Layout                  │  NeedsLayout bits drive LayoutNG re-run
├─────────────────────────┤
│ Pre-paint               │  paint-property-tree updates + paint-invalidation walk
├─────────────────────────┤
│ Paint                   │  produce DisplayItemList / PaintArtifact
├─────────────────────────┤
│ Commit → cc             │  property trees + layer list shipped to compositor
├─────────────────────────┤
│ Damage + draw           │  cc computes per-surface damage rect and draws
└─────────────────────────┘
```

Each phase has its own family of dirty flags, its own propagation rules,
and its own reset point. A phase reads flags set by the previous phase
(or by the previous frame's draw) and writes flags consumed by the next
phase.

---

## Categories of dirty state

Chromium does not have one "dirty flag" — it has roughly seven distinct
families, each stored and propagated differently.

### 1. Style invalidation (selector-driven, subtree-scoped)

Marks which elements _might_ have a style change because a DOM mutation,
class-attribute change, or attribute change could match or stop matching
some selector.

**Storage.** Invalidation sets live on `RuleInvalidationData` inside the
style engine and are keyed by feature (class name, id, attribute,
pseudo-class). When a change happens, the engine looks up the sets
triggered by that feature and either applies them directly or schedules
them on ancestors.

**The InvalidationSet class hierarchy.**
See `core/css/invalidation/invalidation_set.h`.

```cpp
enum InvalidationType {
  kInvalidateDescendants,
  kInvalidateSiblings,
  kInvalidateNthSiblings,
};
```

A single `InvalidationSet` describes the work a selector implies when
one of its features changes. Subclasses `DescendantInvalidationSet`,
`SiblingInvalidationSet`, and `NthSiblingInvalidationSet` specialize the
base class.

Each set carries:

- `classes_`, `ids_`, `tag_names_`, `attributes_` — element features
  to match as the set walks the tree.
- `invalidation_flags_` — a `InvalidationFlags` bitfield (see below).
- Scope bits: `InvalidatesSelf`, `InvalidatesNth`.

**Invalidation flags bitfield.**
See `core/css/invalidation/invalidation_flags.h`. Seven single-bit
fields on every `InvalidationSet`:

| Flag                         | Meaning                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `invalidate_custom_pseudo_`  | Invalidates custom pseudo-elements of a shadow host        |
| `whole_subtree_invalid_`     | "Give up and invalidate everything" — worst-case fallback  |
| `tree_boundary_crossing_`    | Crosses shadow DOM boundaries                              |
| `insertion_point_crossing_`  | Crosses shadow insertion points                            |
| `invalidates_slotted_`       | Invalidates slotted children in ::slotted selectors        |
| `invalidates_parts_`         | Invalidates `::part()`-matched elements                    |
| `invalidates_tree_counting_` | Invalidates selectors using `:nth-*` tree-counting pseudos |

**Walk driver.** `StyleInvalidator` walks the tree pushing and popping
pending invalidation sets at each node. At each element it checks
whether accumulated sets match, and if so sets the appropriate
`StyleChangeType` on the element.

**StyleChangeType.**
See `core/dom/node.h` (bit values start at `1 << 16` in a node
bitfield):

```cpp
kNoStyleChange                   = 0
kInlineIndependentStyleChange    = 1 << 16   // only inherited properties changed
kLocalStyleChange                = 2 << 16   // this element needs recalc
kSubtreeStyleChange              = 3 << 16   // this + all descendants need recalc
```

Plus `ChildNeedsStyleRecalc` — a single bit that propagates **up** from
any dirty descendant so the style engine can skip clean subtrees during
recalc.

```cpp
// Sets kLocalStyleChange + propagates ChildNeedsStyleRecalc up the chain:
element->SetNeedsStyleRecalc(kLocalStyleChange, ...);
```

### 2. Style recalc propagation (`StyleRecalcChange`)

Once style invalidation has marked elements, the recalc phase walks the
tree and at each element carries a `StyleRecalcChange` value that
describes what to do for children.

See `core/css/style_recalc_change.h`.

**`Propagate` enum** (how children should be handled):

```cpp
enum Propagate {
  kNo,                  // do nothing for children
  kUpdatePseudoElements,// only pseudo-elements of this element
  kIndependentInherit,  // inherited property changed — propagate value directly
  kRecalcChildren,      // full recalc for direct children
  kRecalcDescendants,   // full recalc for whole subtree
};
```

**Twelve flags** carried alongside `Propagate`:

| Flag                                     | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `kRecalcSizeContainer`                   | Re-evaluate size-container queries in this container |
| `kRecalcDescendantSizeContainers`        | Same, including nested containers                    |
| `kRecalcStyleContainerChildren`          | Style-container query re-eval                        |
| `kRecalcStyleContainerDescendants`       | Style-container, nested                              |
| `kRecalcScrollStateContainer`            | Scroll-state container query                         |
| `kRecalcDescendantScrollStateContainers` | Scroll-state, nested                                 |
| `kRecalcAnchoredContainer`               | Anchor positioning container                         |
| `kRecalcDescendantAnchoredContainers`    | Anchor positioning, nested                           |
| `kRecalcDescendantContentVisibility`     | Content-visibility descendants                       |
| `kReattach`                              | Layout tree must be rebuilt for this element         |
| `kSuppressRecalc`                        | Skip recalc for the passed node only                 |
| `kMarkReattach`                          | Flag reattach even if style didn't change            |

`StyleRecalcChange` is transient — it lives on the recalc call stack,
not on nodes. The `ForChildren(element)` method derives the child
version from the parent version.

### 3. Style diff (per-property bitmask, per-element)

The output of style recalc. After a new `ComputedStyle` is produced,
`ComputedStyle::VisualInvalidationDiff()` compares old vs. new and
returns a `StyleDifference` packed into exactly 32 bits.

See `core/style/style_difference.h`.

**Paint-invalidation type (2 bits).**

```cpp
enum class PaintInvalidationType { kNone, kSimple, kNormal };
```

`kSimple` lets the diff skip the PrePaintTreeWalk and invalidate
`DisplayItemClient`s directly during style update.

**Layout type (2 bits).**

```cpp
enum LayoutType { kNoLayout, kPositionedMovement, kFullLayout };
```

`kPositionedMovement` lets an absolutely/fixed-positioned object move
without re-running layout for siblings.

**PropertyDifference bitmask (11 bits).** Set on the element when
specific properties changed:

| Bit                              | Property                                           |
| -------------------------------- | -------------------------------------------------- |
| `kTransformPropertyChanged`      | `transform`                                        |
| `kOtherTransformPropertyChanged` | individual transform properties, motion path, etc. |
| `kOpacityChanged`                | `opacity`                                          |
| `kZIndexChanged`                 | `z-index`                                          |
| `kFilterChanged`                 | `filter`                                           |
| `kCSSClipChanged`                | `clip`                                             |
| `kTextDecorationOrColorChanged`  | text decoration or color-dependent properties      |
| `kBlendModeChanged`              | `mix-blend-mode`                                   |
| `kMaskChanged`                   | `mask`                                             |
| `kBackgroundColorChanged`        | `background-color`                                 |
| `kClipPathChanged`               | `clip-path`                                        |

**Additional single-bit flags.**

| Flag                                        | Meaning                                  |
| ------------------------------------------- | ---------------------------------------- |
| `needs_reshape_`                            | Text needs inline-shape recomputation    |
| `recompute_visual_overflow_`                | Visual overflow rect may have changed    |
| `scroll_anchor_disabling_property_changed_` | Scroll anchoring must be disabled        |
| `compositing_reasons_changed_`              | Compositing promotion reasons differ     |
| `compositable_paint_effect_changed_`        | Paint Worklet composited effect changed  |
| `border_radius_changed_`                    | Border radius differs                    |
| `border_shape_changed_`                     | Border shape differs                     |
| `transform_data_changed_`                   | Transform data (not just matrix) differs |

`Merge()` combines two diffs by taking the max of enums and the union
of bit flags. The total is exactly 32 bits (enforced by
`static_assert(sizeof(StyleDifference) == 4)`).

### 4. Layout dirty bits (per `LayoutObject`)

Control whether a layout object needs to re-run layout.

See `core/layout/layout_object.h:1381-1470` and `1838-1863`.

**Individual layout bits.**

| Bit                                  | Meaning                                             |
| ------------------------------------ | --------------------------------------------------- |
| `SelfNeedsFullLayout`                | This object must re-run full layout                 |
| `ChildNeedsFullLayout`               | Some descendant needs full layout (propagated flag) |
| `NeedsSimplifiedLayout`              | Simplified layout (subset of full layout) suffices  |
| `SelfNeedsScrollableOverflowRecalc`  | Recompute scrollable overflow for this object only  |
| `ChildNeedsScrollableOverflowRecalc` | Some descendant needs scrollable overflow recalc    |
| `IntrinsicLogicalWidthsDirty`        | Cached min/max content widths are stale             |

The composite predicate `NeedsLayout()` returns true if any of
`SelfNeedsFullLayout`, `ChildNeedsFullLayout`, or `NeedsSimplifiedLayout`
is set.

**Marking APIs.**

```cpp
void MarkContainerChainForLayout(bool schedule_relayout = true,
                                 SubtreeLayoutScope* = nullptr);
void SetNeedsLayout(LayoutInvalidationReasonForTracing,
                    MarkingBehavior = kMarkContainerChain,
                    SubtreeLayoutScope* = nullptr);
void SetNeedsLayoutAndFullPaintInvalidation(...);
void SetChildNeedsLayout(MarkingBehavior = kMarkContainerChain, ...);
void SetNeedsSimplifiedLayout();
void SetIntrinsicLogicalWidthsDirty(MarkingBehavior = kMarkContainerChain);
```

`MarkingBehavior` controls upward propagation:

- `kMarkContainerChain` (default) — walks the container chain setting
  `ChildNeedsFullLayout` on each ancestor until a node already marked
  or the root is reached.
- `kMarkOnlyThis` — set only on `this`, don't propagate.

**Layout reason enum (tracing only).**
See `core/layout/layout_invalidation_reason.h`. `LayoutInvalidationReason`
is a string-convertible enum (`kUnknown`, `kSizeChanged`, `kAncestorMoved`,
`kStyleChange`, `kDomChanged`, `kTextChanged`, `kAttributeChanged`,
`kChildChanged`, `kFontsChanged`, `kAddedToLayout`, `kRemovedFromLayout`,
`kPaddingChanged`, etc.). The reason is used for devtools tracing only
— it does not affect which layout path runs.

### 5. Paint invalidation (per `LayoutObject`, per-property bits + reason)

Paint invalidation is the richest and most granular dirty-flag family
in Blink.

**PaintInvalidationReason enum.**
See `platform/graphics/paint_invalidation_reason.h`. A single `uint8_t`
reason per `LayoutObject` / `DisplayItemClient`:

```cpp
enum class PaintInvalidationReason : uint8_t {
  kNone,
  kIncremental,      // mere size change — invalidate only the changed strip
  kHitTest,          // hit-test change, no raster invalidation needed
  kNonFullMax = kHitTest,

  // Non-layout full invalidation
  kStyle, kOutline, kImage, kBackplate, kBackground, kSelection, kCaret,
  kNonLayoutMax = kCaret,

  // Layout-related full invalidation
  kLayout, kAppeared, kDisappeared, kScrollControl,
  kSubtree, kSVGResource, kDocumentMarker,
  kLayoutMax = kDocumentMarker,

  // Raster-only reasons (used by the compositor-side invalidator)
  kJustCreated, kReordered, kChunkAppeared, kChunkDisappeared,
  kChunkUncacheable, kChunkReordered, kPaintProperty, kFullLayer,
  kUncacheable,
  kMax = kUncacheable,
};
```

The helpers `IsFullPaintInvalidationReason`,
`IsNonLayoutFullPaintInvalidationReason`,
`IsLayoutFullPaintInvalidationReason`, and
`IsLayoutPaintInvalidationReason` classify reasons by numeric range.
`kIncremental` is deliberately last in the non-full range so that "any
other reason" upgrades it to full. `kUncacheable` is last overall so
that `DisplayItemClient::Invalidate()` can override everything else.

**Paint dirty bitfields on `LayoutObject`.**
See `layout_object.h:3768-3840`. The following single-bit flags are
packed into the object's bitfield block:

| Bit                                               | Purpose                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `ShouldCheckForPaintInvalidation`                 | This object should be visited in PrePaintTreeWalk |
| `SubtreeShouldCheckForPaintInvalidation`          | Force-check this object + entire subtree          |
| `ShouldDelayFullPaintInvalidation`                | Defer full invalidation until animation completes |
| `SubtreeShouldDoFullPaintInvalidation`            | Force full invalidation on this + entire subtree  |
| `MayNeedPaintInvalidationAnimatedBackgroundImage` | Background-image animation running                |
| `ShouldInvalidateSelection`                       | Selection boundaries changed                      |
| `ShouldCheckLayoutForPaintInvalidation`           | Re-check paint based on layout result             |
| `DescendantShouldCheckLayoutForPaintInvalidation` | Propagated version of the above                   |
| `NeedsPaintPropertyUpdate`                        | Paint-property node for this object is stale      |
| `DescendantNeedsPaintPropertyUpdate`              | Some descendant needs paint-property update       |
| `BackgroundNeedsFullPaintInvalidation`            | Background layer alone needs full invalidation    |
| `OutlineMayBeAffectedByDescendants`               | Descendant may affect outline rect                |
| `ScrollAnchorDisablingStyleChanged`               | Changed a property that disables scroll anchoring |

Unlike layout bits (which are tri-state self/child/simplified), paint
bits are mostly per-reason: separate bits exist for background,
selection, subtree, animation etc., and they are combined during the
PrePaintTreeWalk.

**SubtreeFlag on `PaintInvalidatorContext`.**
See `core/paint/paint_invalidator.h`. The walk carries a per-subtree
flag:

```cpp
enum SubtreeFlag {
  kSubtreeInvalidationChecking,
  kSubtreeFullInvalidation,
  kSubtreeFullInvalidationForStackedContents,
  kSubtreeNoInvalidation,
};
```

These control whether paint invalidation descends into the subtree and
whether to force-invalidate every item encountered.

**Simple vs normal paint invalidation.**
The style diff carries `PaintInvalidationType::kSimple` vs
`kNormal`. `kSimple` bypasses PrePaintTreeWalk entirely — the style
update directly invalidates the affected `DisplayItemClient`s. Used for
cheap property changes like color-only updates to painted chunks.

### 6. Paint properties (pre-paint tree update)

Paint-property trees (transform, effect, clip, scroll) are rebuilt
during the pre-paint phase. Two dedicated bits gate the walk:

| Bit                                  | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `NeedsPaintPropertyUpdate`           | This object's paint-property node is stale  |
| `DescendantNeedsPaintPropertyUpdate` | A descendant's paint-property node is stale |

`PrePaintTreeWalk` skips subtrees with neither bit set. When style diff
reports a property that affects a paint-property node (transform,
opacity, filter, clip, clip-path, mask, etc.), it sets
`NeedsPaintPropertyUpdate` on `this` and propagates
`DescendantNeedsPaintPropertyUpdate` up the chain.

**Paint chunks and cacheability.** `DisplayItemClient` has per-client
`kUncacheable` state. Once a client is uncacheable, every paint chunk
containing it is also uncacheable, which disables raster caching of
that chunk.

### 7. Compositor property-tree change tracking (`cc/`)

Once Blink commits, the compositor side takes over. This layer is
covered in depth by existing research documents:

- [`property-trees.md`](./property-trees.md) — `transform_changed_` on
  TransformNode, `effect_changed` on EffectNode, the `PropertyTrees`
  state (`needs_rebuild`, `changed`, `full_tree_damaged`,
  `sequence_number`), and `ResetAllChangeTracking` at draw time.
- [`damage-tracking.md`](./damage-tracking.md) — `DamageAccumulator`,
  `DamageReason` enum, per-layer damage rects, per-surface damage rects,
  filter expansion, render-pass skipping, and reset-after-draw
  semantics.

Key per-node bits on the compositor side:

| cc property-tree bit | Location                    | Meaning                                 |
| -------------------- | --------------------------- | --------------------------------------- |
| `transform_changed_` | `cc/trees/transform_node.h` | This transform differs from last commit |
| `effect_changed`     | `cc/trees/effect_node.h`    | This effect differs from last commit    |
| `needs_rebuild`      | `cc::PropertyTrees`         | Entire tree must be rebuilt             |
| `changed`            | `cc::PropertyTrees`         | Any node changed — damage walk required |
| `full_tree_damaged`  | `cc::PropertyTrees`         | Damage entire root render surface       |
| `sequence_number`    | `cc::PropertyTrees`         | Monotonic commit counter                |

`cc::DamageAccumulator` collects per-layer and per-surface dirty rects
each commit, then `LayerTreeHostImpl` unions them and produces the
frame's damage rect. After draw, `ResetAllChangeTracking` clears every
change bit on every node.

---

## Shapes/granularity of invalidation

A cross-cutting view: for a given change, _how much of the tree does
Chromium mark dirty?_ Chromium's design consistently picks the minimum
shape the correctness rules allow.

### Self-only

**Examples.**

- `kIncremental` paint invalidation: a `LayoutBox` grew — only the new
  strip is invalidated.
- `kHitTest` paint invalidation: the hit region changed but pixels
  didn't — raster is skipped entirely.
- `kPositionedMovement` layout: an absolutely/fixed-positioned object
  moves without re-laying-out siblings.
- `kSimple` paint invalidation: direct `DisplayItemClient` invalidation
  with no PrePaintTreeWalk.
- `StyleChangeType::kInlineIndependentStyleChange`: only inherited
  values propagate, no rule-matching needed.

**Shape.** One element / one object. No descent, no sibling visit, no
ancestor propagation beyond a single up-walk to mark the parent-chain
"child dirty" bit (which is different from invalidating ancestors).

### Ancestor-chain up-propagation (mark-only)

Used by **every** Blink dirty flag: when a node is dirtied, a single
bit is set on each ancestor up to the root so the next walk can skip
clean branches.

**Examples.**

- `ChildNeedsStyleRecalc` — propagates up from every style-dirty node.
- `ChildNeedsFullLayout` — propagates up from every layout-dirty
  LayoutObject (via `MarkContainerChainForLayout`).
- `ChildNeedsScrollableOverflowRecalc`.
- `DescendantNeedsPaintPropertyUpdate`.
- `DescendantShouldCheckLayoutForPaintInvalidation`.

**Shape.** O(depth) bits flipped, not O(subtree) work scheduled. The
actual work stays self-only or child-only; the ancestor bits only exist
to let the next walk prune clean branches in O(depth) time.

### Direct children only

**Examples.**

- `StyleRecalcChange::Propagate::kRecalcChildren` — recalc direct
  children only, not grandchildren.
- `StyleRecalcChange::Propagate::kUpdatePseudoElements` — only the
  pseudo-elements of this element.

**Shape.** One level below self. Grandchildren are reached only via
their own dirty bits.

### Whole subtree

**Examples.**

- `StyleChangeType::kSubtreeStyleChange`.
- `StyleRecalcChange::Propagate::kRecalcDescendants`.
- `SubtreeShouldDoFullPaintInvalidation` bit.
- `SubtreeShouldCheckForPaintInvalidation` bit.
- `PaintInvalidationReason::kSubtree`.
- `InvalidationSet::whole_subtree_invalid_` flag.
- `PaintInvalidatorContext::kSubtreeFullInvalidation`.
- cc `PropertyTrees::full_tree_damaged`.

**Shape.** Every descendant is walked and invalidated. The worst-case
fallback used when a change's exact impact can't be computed cheaply
(e.g. a rule using `*` changed, or a stacking-context change alters
paint order).

### Container-scoped (bounded subtree)

**Examples.**

- `kRecalcSizeContainer` — walk only children inside _this_ size
  container; do not enter nested containers.
- `kRecalcDescendantSizeContainers` — walk this container and all
  nested size containers.
- `kRecalcStyleContainerChildren` / `kRecalcStyleContainerDescendants`.
- `kRecalcScrollStateContainer` / `kRecalcDescendantScrollStateContainers`.
- `kRecalcAnchoredContainer` / `kRecalcDescendantAnchoredContainers`.
- `kRecalcDescendantContentVisibility` (scoped to content-visibility
  regions).

**Shape.** A subtree bounded by container-query containers. Each
container-query type has paired "this container only" and "this + all
nested containers" flags so the recalc can stop precisely at the
nesting level where re-evaluation is unnecessary.

### Sibling / nth-sibling

**Examples.**

- `SiblingInvalidationSet`, `NthSiblingInvalidationSet`.
- `InvalidationType::kInvalidateSiblings`, `kInvalidateNthSiblings`.
- `InvalidationSet::InvalidatesNth` flag.

**Shape.** A contiguous set of siblings (and their subtrees, per the
sibling set's descendant data), rather than parent / child. Driven by
selectors using `+`, `~`, `:nth-*`.

### Per-property-bit on one element

**Examples.**

- `StyleDifference::PropertyDifference` bitmask: transform vs opacity
  vs filter vs z-index etc.
- Individual paint-invalidation dirty bits on `LayoutObject`
  (`BackgroundNeedsFullPaintInvalidation`, `ShouldInvalidateSelection`,
  etc.).
- cc `transform_changed_` on a single TransformNode,
  `effect_changed` on a single EffectNode.

**Shape.** One element, one property class. Cheapest form: the next
phase reads the specific bits set and performs only the work those bits
imply (e.g. repaint background layer but not text, update transform
node but not effect node, invalidate selection layer but not the
element's paint chunk).

### Shadow / scope boundary

**Examples.**

- `invalidate_custom_pseudo_` — custom pseudo-elements of a shadow host.
- `tree_boundary_crossing_` — selector crosses shadow boundaries.
- `insertion_point_crossing_` — crosses shadow insertion points.
- `invalidates_slotted_` — `::slotted()` selectors.
- `invalidates_parts_` — `::part()` selectors.

**Shape.** Follows shadow DOM composition boundaries. Without these
flags, invalidation stops at the shadow host; with them, it crosses
into the shadow tree (or vice versa).

### Rect-based (compositor damage)

**Examples.**

- `cc::DamageAccumulator` per-layer and per-surface rects.
- `viz::DrawQuad` damage_rect.
- Filter-expanded damage rects (blur, shadow).

**Shape.** A screen-space rectangle, not a tree shape. Used exclusively
post-commit on the compositor side. Many small dirty rects are unioned
into larger rects; filters expand rects by their support radius;
surfaces with no damage are skipped entirely.

### Full-frame fallback

**Examples.**

- cc `PropertyTrees::full_tree_damaged` → damages the entire root
  render surface.
- Initial frame after layer tree creation (everything is
  `kJustCreated`).
- Window resize or device-scale change.

**Shape.** Everything. Every surface, every layer, every paint chunk.

---

## Cross-category index by change type

A lookup of which categories fire for common change types. For each
row, X = bits set in that category.

| Change                          | Style-inval  | Style-recalc | Style-diff           | Layout              | Paint-inval                   | Paint-prop | cc change                               |
| ------------------------------- | ------------ | ------------ | -------------------- | ------------------- | ----------------------------- | ---------- | --------------------------------------- |
| `class` attribute added/removed | X            | X            | —                    | —                   | —                             | —          | —                                       |
| `color` property                | —            | X (inherit)  | `kTextDecorOrColor`  | —                   | `kStyle`                      | —          | —                                       |
| `background-color`              | —            | X            | `kBackgroundColor`   | —                   | `kBackground`                 | —          | —                                       |
| `transform`                     | —            | X            | `kTransformChanged`  | —                   | `kNone` (if composited)       | X          | `transform_changed_`                    |
| `opacity`                       | —            | X            | `kOpacityChanged`    | —                   | `kNone` (if composited)       | X          | `effect_changed`                        |
| `filter`                        | —            | X            | `kFilterChanged`     | —                   | `kNone` (if composited)       | X          | `effect_changed`                        |
| `z-index`                       | —            | X            | `kZIndexChanged`     | —                   | `kStyle`                      | X          | `effect_changed`                        |
| `width`/`height`                | —            | X            | `layout_type=Full`   | SelfNeedsFull       | `kIncremental` (or `kLayout`) | —          | —                                       |
| Absolute-positioned move        | —            | X            | `layout_type=PosMov` | Positioned mov      | `kLayout`                     | X          | `transform_changed_`                    |
| Selection boundary              | —            | —            | —                    | —                   | `kSelection` bit              | —          | —                                       |
| Text content                    | —            | X            | `needs_reshape_`     | SelfNeedsFull       | `kLayout`                     | —          | —                                       |
| DOM insertion                   | X            | X            | —                    | Ancestor-chain      | `kAppeared`                   | X          | —                                       |
| DOM removal                     | X            | X            | —                    | Ancestor-chain      | `kDisappeared`                | X          | —                                       |
| Image load complete             | —            | —            | —                    | Maybe SelfNeedsFull | `kImage`                      | —          | —                                       |
| Animation tick (composited)     | —            | —            | —                    | —                   | —                             | —          | `transform_changed_` / `effect_changed` |
| Scroll                          | —            | —            | —                    | —                   | (scroll node)                 | X (scroll) | scroll offset                           |
| Resize                          | X (viewport) | X            | `layout_type=Full`   | Whole subtree       | `kLayout` (root)              | X          | `full_tree_damaged`                     |

Notes:

- `kNone` under paint-inval for composited transform/opacity/filter
  means no paint raster is needed — the change flows through paint
  properties directly to cc.
- Paint-invalidation rows also always set the walk bits
  (`ShouldCheckForPaintInvalidation` on self, its propagated variant up
  the chain); only the reason differs.
- The "ancestor-chain" entries for DOM insertion/removal refer to the
  layout container chain being marked with `ChildNeedsFullLayout`, not
  the inserted/removed object's own layout.

---

## Source references

### Style invalidation

- `third_party/blink/renderer/core/css/invalidation/invalidation_set.h`
- `third_party/blink/renderer/core/css/invalidation/invalidation_flags.h`
- `third_party/blink/renderer/core/css/invalidation/style_invalidator.h`
- `third_party/blink/renderer/core/css/invalidation/rule_invalidation_data.h`

### Style recalc

- `third_party/blink/renderer/core/css/style_recalc_change.h`
- `third_party/blink/renderer/core/dom/node.h` (StyleChangeType)
- `third_party/blink/renderer/core/style/style_difference.h`
- `third_party/blink/renderer/core/style/computed_style.h`
  (`VisualInvalidationDiff`)

### Layout

- `third_party/blink/renderer/core/layout/layout_object.h`
  (NeedsLayout bitfields + `MarkContainerChainForLayout`,
  `SetNeedsLayout`, `SetChildNeedsLayout`, `SetNeedsSimplifiedLayout`)
- `third_party/blink/renderer/core/layout/layout_invalidation_reason.h`

### Paint invalidation

- `third_party/blink/renderer/platform/graphics/paint_invalidation_reason.h`
- `third_party/blink/renderer/core/paint/paint_invalidator.h`
  (`PaintInvalidatorContext::SubtreeFlag`)
- `third_party/blink/renderer/core/paint/pre_paint_tree_walk.h`
- `third_party/blink/renderer/core/layout/layout_object.h:3768-3840`
  (paint dirty bitfields)

### Paint properties

- `third_party/blink/renderer/core/paint/paint_property_tree_builder.h`
- `layout_object.h:3022-3129` (`NeedsPaintPropertyUpdate` +
  `DescendantNeedsPaintPropertyUpdate`)

### Compositor (cc/) — covered in dedicated research docs

- [`property-trees.md`](./property-trees.md) —
  `cc/trees/property_tree.h`, `transform_node.h`, `effect_node.h`
- [`damage-tracking.md`](./damage-tracking.md) —
  `cc/trees/damage_tracker.h`, `cc/layers/layer_impl.h`
