---
title: "Grida XML durable addressing"
description: "RFD for durable authored node and component-occurrence addresses, typed property targets, and immutable effective values before animation semantics are introduced."
keywords:
  - grida xml
  - durable identity
  - component instances
  - property addressing
  - effective values
  - scene graph
tags:
  - internal
  - wg
  - format-schema
  - canvas
  - authoring
  - collaboration
format: md
---

# Grida XML durable addressing

**Status:** Accepted direction for a Version 4 proving implementation.

This RFD defines the identity and typed-value boundary that must exist before
declarative animation can be specified. It does not define animation syntax,
time, timelines, keyframes, interpolation, easing, composition, playback, or
scheduling.

The decision is:

1. authored identity, component occurrence, property identity, compiled
   runtime identity, and effective frame values are five different facts;
2. Grida XML Version 4 gives every authored render node and every `use` a
   durable owner-local `id`;
3. a materialized node address combines its authored owner and member with an
   ordered path of durable use occurrences;
4. a property address adds one key from a closed typed property registry;
5. a runtime may compile that durable address to a generation-checked handle;
6. an immutable sparse value map may override registered base values for one
   evaluation without mutating authored content; and
7. an empty map is exactly the existing static scene.

These decisions also serve inspection, durable diagnostics, previews, future
cross-session operations under a stable canonical source-identity contract,
and other evaluated-state systems. Animation is one future producer of
effective values, not the owner of identity or the property registry.

## Why one `id` is not the whole answer

A component member can be authored once and materialized many times. The same
member `label` under uses `first-card` and `second-card` must therefore retain
one definition-local identity while producing two distinct occurrences. The
materialized engine slot for either occurrence can also be deleted and reused.
Finally, `opacity` and `width` on that occurrence have different types and
invalidate different stages.

Collapsing those facts into one string or integer makes at least one lifetime
dishonest. The format instead keeps the following tiers separate:

| Tier                    | Lifetime                                            | Example                                   | May be serialized as authored intent?                      |
| ----------------------- | --------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Authored owner/member   | Across parse, print, and unrelated edits            | component `card`, member `label`          | Yes                                                        |
| Use occurrence path     | Across parse, print, and unrelated edits            | `[Use(SceneOwner(S), first-card)]`        | Yes, as the individual `id` values on each `use`           |
| Property key            | Across implementations of the same language version | `opacity`                                 | Yes, when a later source construct needs a property target |
| Compiled runtime target | One materialization generation                      | scene A, slot 42, generation 3, `opacity` | No                                                         |
| Effective value         | One declared evaluation                             | `opacity = 0.6`                           | No                                                         |

Source spans, sibling indexes, element paths, human-readable `name` values,
arena slots, hashes of property strings, and generated draw commands belong to
none of the durable tiers.

## Prior-art constraints

The separation is a synthesis of browser and game-engine practice rather than
a new all-purpose identifier:

- Blink keeps a live target element and a typed property/attribute identity,
  then writes sampled SVG values into a separate animated slot before style,
  layout, and paint. The [Chromium SVG animation
  study](../research/chromium/svg/animation-and-smil) records that pipeline.
- Unity's
  [`GenericBindingUtility`](https://github.com/Unity-Technologies/UnityCsReference/blob/979bc204a0c6506d87595a02fc89452687ed820d/Modules/Animation/ScriptBindings/GenericBinding.bindings.cs)
  compiles hierarchy/type/property descriptors into
  [`BoundProperty`](https://github.com/Unity-Technologies/UnityCsReference/blob/979bc204a0c6506d87595a02fc89452687ed820d/Modules/Animation/ScriptBindings/BoundProperty.bindings.cs)
  handles whose runtime identity is an index plus version. Transient float,
  integer, and object-reference values are supplied separately to `SetValues`.
  The versioned index accelerates a binding; it does not make the authored
  hierarchy path durable.
- Unreal's
  [`FMovieSceneObjectBindingID`](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/MovieScene/FMovieSceneObjectBindingID)
  combines persistent binding identity with sequence-instance context, while
  [`FMovieScenePropertyBinding`](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/MovieScene/FMovieScenePropertyBinding)
  keeps property identity separate.

The useful common shape is durable authored target, instance context, typed
property, replaceable runtime handle, and transient value storage. None of
these systems justifies serializing a runtime slot or using a hierarchy string
as the only identity.

## Scope

This RFD specifies:

- the Version 4 `id` grammar and uniqueness scopes;
- component-root, member, use-occurrence, nested-use, and identity preservation
  through slot projection;
- the abstract node and property address forms;
- the contract for a closed typed property registry;
- nullability and sparse effective-value semantics;
- compilation to replaceable generation-checked runtime targets;
- strict validation and canonical-writing requirements; and
- the static-equivalence law.

It does not specify:

- a textual selector or URI syntax for addresses;
- paint-layer, stroke-layer, gradient-stop, text-run, or lens-operation member
  identity;
- mutation, collaboration, or merge protocols;
- archive encoding;
- animation or event semantics; or
- incremental evaluation and compositor optimization.

The abstract address is intentionally decided before a compact spelling. A
later syntax can serialize the structure without forcing every processor to
parse an opaque path string.

## Version 4 source contract

Version 4 inherits the complete Version 3 language: source modules, components,
typed scalar parameters, and named slot projection. Its only new authored
vocabulary is durable `id` on render elements and `use`.

```xml
<grida version="4">
  <component id="profile-card" width="320" height="96">
    <rect id="avatar" width="64" height="64"/>
    <text id="display-name">Ada River</text>
    <slot name="actions"/>
  </component>

  <container id="feed" layout="flex" direction="column">
    <use id="first-card" href="#profile-card">
      <text id="first-action" slot="actions">Follow</text>
    </use>
    <use id="second-card" href="#profile-card">
      <text id="second-action" slot="actions">Message</text>
    </use>
  </container>
</grida>
```

### Required IDs

In Version 4:

- every authored render element has exactly one `id`;
- every `use` has exactly one `id`;
- `id` is a literal and cannot be supplied by a component parameter;
- `id` uses the existing lowercase-kebab identifier grammar;
- `name` remains an optional human label and is never an identity fallback;
- `tspan`, `prop`, `arg`, `slot`, paints, strokes, and gradient stops do not
  gain `id` from this RFD; and
- the generated host viewport node has no authored identity.

A `component` is a definition construct rather than an authored render
element. Its existing `id` remains the module-local export symbol that
qualifies the component owner; it is not copied or reused as a render-node ID.
The root member is the tagged member variant `Root`; descendants use the
tagged variant `Node(authored-id)`. The tag keeps `Root` distinct from a legal
descendant `id="root"`.

Versions 0 through 3 retain their exact grammar. They neither require nor
accept render-node or use-occurrence `id`, and processors must not synthesize
durable addresses for them.

### Uniqueness scope

One lexical owner owns one identity namespace:

- the scene tree in one source unit is one owner; and
- each component definition is a separate owner.

Within an owner, render-element IDs and use IDs share one namespace and must be
unique across the complete lexical subtree, including caller-authored slot
assignments. Component export IDs remain in the source unit's component-export
namespace and may coincide with a member ID without ambiguity.

Sharing the render/use namespace guarantees unambiguous owner-local lookup and
prevents two differently typed authored sites from claiming the same token.
Refactoring `Node(card)` into `Use(card)` still changes identity and must be an
explicit edit. Allowing IDs to repeat in different components keeps
definition-local names concise and is safe because the owner is part of every
address.

Version 4 source units link only Version 4 component sources. A processor must
not claim a complete Version 4 address space while expanding an older
definition whose members and uses have no durable IDs. Older callers likewise
cannot link a newer Version 4 definition.

This deliberately tightens the earlier monotone link pattern:

| Caller    | Version 1 target             | Version 2 target   | Version 3 target           | Version 4 target      |
| --------- | ---------------------------- | ------------------ | -------------------------- | --------------------- |
| Version 1 | Static use                   | Invalid            | Invalid                    | Invalid               |
| Version 2 | Static use / empty interface | Scalar-capable use | Invalid                    | Invalid               |
| Version 3 | Static use                   | Scalar arguments   | Scalar arguments and slots | Invalid               |
| Version 4 | Invalid                      | Invalid            | Invalid                    | Identity-complete use |

Versions 1 through 3 remain unchanged. Version 4 trades backward linking for
the stronger invariant that every authored node in its materialized closure
has a durable address; partial identity would make target validity depend on
which dependency happened to be older.

### Stability and editing

An ID survives parsing, canonical writing, reformatting, sibling insertion,
reordering, reparenting within the same owner, and unrelated property edits.
Changing an ID changes identity. A tool may rename and retarget references in
one transaction, but a reader never guesses that two different IDs denote the
same object.

That is authored-member stability, not unconditional occurrence-address
stability. Reparenting through a different component use or slot projection
changes the ordered occurrence path. Changing canonical source identity,
renaming a component export, changing a member/use ID, or changing an enclosing
use path likewise changes the corresponding address.

Moving a subtree within one owner preserves its IDs. Copying a subtree into an
owner where any copied ID already exists must mint non-conflicting IDs before
the copy becomes valid. The source language does not prescribe an editor's ID
generation algorithm; it only requires the committed result to satisfy the
grammar and uniqueness rules.

## Address model

### Authored owner

An authored owner is one of:

```text
scene-owner     = (canonical source identity, scene)
component-owner = (canonical source identity, component export id)
```

Canonical source identity is supplied by the source-resolution environment,
as already required by the module RFD. A relative `href`, source bytes, or
working-directory path is not substituted for it.

### Authored member

An authored member is a tagged variant:

```text
Root
Node(authored render-element id)
```

The pair `(owner, member)` identifies authored definition intent but not one
materialized component instance.

### Use occurrence

A use occurrence is:

```text
(caller owner, authored use id)
```

The referenced component, source span, `href`, and `name` remain valuable
provenance, but none replaces the caller-owned use identity.

### Materialized node address

A materialized node address is:

```text
(authored owner, authored member, ordered use-occurrence path)
```

The path is outermost first. An ordinary scene node has an empty path. A member
inside one component use has one segment. A member inside nested uses has one
segment per expansion boundary.

For the example above, let `S` be the entry's canonical source identity. The
two component roots and avatars differ only by their typed occurrence path:

```text
(ComponentOwner(S, profile-card), Root,         [Use(SceneOwner(S), first-card)])
(ComponentOwner(S, profile-card), Node(avatar), [Use(SceneOwner(S), first-card)])
(ComponentOwner(S, profile-card), Root,         [Use(SceneOwner(S), second-card)])
(ComponentOwner(S, profile-card), Node(avatar), [Use(SceneOwner(S), second-card)])
```

The scene root's `id="feed"` is its member ID; it is not a use-path segment.

Caller-authored slot content retains its caller owner and member. Its path
still includes the receiving use and every enclosing use through which that
caller content was materialized. Projection changes placement and painter
context; it does not transfer authorship to the callee.

One logical materialized node occurrence has one canonical node address.
Distinct canonical addresses must never resolve to the same logical
occurrence except where a future RFD explicitly defines an aliasing construct;
Version 4 defines none. An implementation may still share immutable backing
data for repeated component definitions, as long as each occurrence retains a
distinct address and observable instance behavior.

## Typed property addresses

A property address is exactly:

```text
(materialized node address, registered property key)
```

Property keys come from one closed, versioned registry rather than arbitrary
field paths. Each registry entry defines:

- its canonical semantic key;
- its exact value type, including any property-specific optional state;
- the node kinds on which it applies;
- how to read the authored base value;
- validation of an effective value;
- a conservative set of affected stages: measure, layout, transform, bounds,
  paint, and resource; and
- deterministic equality.

The initial registry is exactly the following. Keys are semantic property
identities, not necessarily XML attribute spellings. `active`, for example,
is the positive runtime value projected from the inverse `hidden` source
attribute; `layout`, `fills`, and `strokes` are whole model values assembled
from their compact or structured source syntax before this boundary.

Impact legend: M = measure, L = layout, T = transform, B = bounds, P = paint,
and R = resource.

| Semantic key               | Exact value type      | Applicability                                                | Authored base projection                                    | Impact      |
| -------------------------- | --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ----------- |
| `x`, `y`                   | `AxisBinding`         | Every node                                                   | Materialized axis binding                                   | M/L/T/B/P   |
| `width`                    | `SizeIntent`          | Frames, rectangles, ellipses, lines, paths, and text         | Materialized fixed/auto width intent                        | M/L/T/B/P   |
| `height`                   | `SizeIntent`          | Frames, rectangles, ellipses, paths, and text; never lines   | Materialized fixed/auto height intent                       | M/L/T/B/P   |
| `min-width`, `max-width`   | `OptionalNumber`      | Frames, rectangles, ellipses, lines, paths, and text         | Materialized optional width constraint                      | M/L/T/B/P   |
| `min-height`, `max-height` | `OptionalNumber`      | Frames, rectangles, ellipses, paths, and text; never lines   | Materialized optional height constraint                     | M/L/T/B/P   |
| `aspect-ratio`             | `OptionalAspectRatio` | Rectangles, ellipses, and paths                              | Materialized optional width/height ratio                    | M/L/T/B/P   |
| `active`                   | `Boolean`             | Every node                                                   | Positive activity value; inverse of source `hidden`         | M/L/T/B/P/R |
| `rotation`                 | `Number`              | Every node                                                   | Clockwise degrees                                           | M/L/T/B/P   |
| `flip-x`, `flip-y`         | `Boolean`             | Every node                                                   | Native mirror flags                                         | M/L/T/B/P   |
| `flow`                     | `Flow`                | Every node                                                   | In-flow or absolute participation                           | M/L/T/B/P   |
| `grow`                     | `Number`              | Every node                                                   | Main-axis growth factor                                     | M/L/T/B/P   |
| `self-align`               | `SelfAlign`           | Every node                                                   | Per-child alignment projected from source `align`           | M/L/T/B/P   |
| `opacity`                  | `Number`              | Every node                                                   | Node/subtree compositing opacity                            | P           |
| `layout`                   | `Layout`              | Frames                                                       | Complete normalized layout behavior                         | M/L/T/B/P   |
| `clips-content`            | `Boolean`             | Frames                                                       | Content-clip flag projected from source `clips`             | B/P         |
| `corner-radius`            | `CornerRadius`        | Frames and rectangles                                        | Complete four-corner elliptical radius value                | B/P         |
| `corner-smoothing`         | `Number`              | Frames and rectangles                                        | Smoothing factor                                            | B/P         |
| `fills`                    | `Paints`              | Fill-paintable frames, rectangles, ellipses, paths, and text | Complete ordered fill paints after shorthand normalization  | P/R         |
| `strokes`                  | `Strokes`             | Stroke-paintable frames, shapes, and text                    | Complete ordered stroke geometries and their ordered paints | B/P/R       |

`Number` is not one universal numeric domain. Rotation is any finite number;
growth is finite and non-negative; opacity and corner smoothing are finite in
`[0, 1]`. Fixed sizes and present optional constraints are finite and
non-negative. A present aspect ratio contains two finite positive numbers.
Layout, corner, paint, gradient-stop, image-resource, and stroke values retain
the validation rules of their static model and renderer contracts. Validation
checks the complete effective node state, not only each replacement in
isolation: for example, smoothing plus elliptical corner radii and per-side
strokes plus smoothing must be rejected regardless of which member came from
authored state. An aggregate paint or stroke that the renderer cannot
materialize is invalid rather than silently omitted. Applicability and domain
validation happen before evaluation.

That shared authored-state fence includes finite, mathematically invertible
gradient transforms and, for a linear gradient, a binary32 unit-space endpoint
distance greater than `2^-15`. Authored source, canonical writing, and a
replacement `Paints` value therefore cannot disagree about malformed gradient
intent or a ramp that would be replaced with a degenerate color.

Backend representability is a later, resolved-value question. A conforming
evaluator composes each visible gradient transform with its actual resolved
paint box using the backend's numeric representation, verifies that the
resulting local matrix is invertible, and proves that its selected gradient
implementation can construct the shader before publishing or drawing the frame.
A very small or large authored transform may fail for one box and succeed for
another; the paint box can worsen or rescue its conditioning. Failure must
identify the owning node and whether the paint came from a fill, stroke, or
text run, and must occur before any frame pixels are emitted. This evaluation-
time failure does not make the mathematically valid authored aggregate invalid.

The registry does not, by itself, make a property animatable. A later
animation specification must select a subset and define interpolation,
composition, boundary, and resource rules for every selected key.

Source spelling and semantic property identity are related but not required to
be byte-equal. For example, compact `fill="#fff"` and an expanded `fill`
element both project the same ordered fills property. The source-level
`hidden` spelling projects a visibility value rather than creating a second
runtime concept. A processor must not create separate effective-value keys for
compact and expanded syntax.

Structural facts are outside this registry: node kind, parent, child order,
component reference, use path, slot assignment, text-run partition, and path
command topology cannot be changed by an effective-value entry.

The first registry is deliberately node-level. Whole ordered fills and strokes
are aggregate typed values because the current scene model owns those values at
the node. Replacing either aggregate may change its internal list length;
addressing one paint, stroke, stop, run, or lens operation remains invalid
until that subobject has a durable identity contract.

## Nullability and absence

There is no universal overlay `null`. Two states must not collapse:

1. **No effective-value entry** — read the authored base value.
2. **One exact registered value** — use that validated typed value for this
   evaluation.

When the model property itself is optional, optionality belongs inside its
registered type—for example, `OptionalNumber(None)` versus
`OptionalNumber(Some(24))`. That typed `None` is a real property value and is
still distinct from an absent map entry. It is never encoded as an empty
string, zero, false, NaN, a generic null token, or a magic enum member.

Source omission remains governed by the static property grammar. It may mean a
default, inheritance, automatic sizing, or an absent optional value depending
on that property. It is not automatically equivalent to effective-map
absence.

## Materialization and compilation

Materialization produces an ordinary scene plus a checked bidirectional
relationship between canonical node addresses and live scene nodes. It must
reject an address collision rather than select one node by traversal order.

A runtime may compile a property address to the equivalent of:

```text
(runtime scene incarnation, arena slot, slot generation, property key)
```

That compiled target is a replaceable acceleration artifact. It is valid only
for the materialization generation against which it was checked. Deletion,
slot reuse, rematerialization, identity edits, or relevant component-link
changes require validation or recompilation. A stale target must fail closed;
it must never affect a new node that happens to reuse the same slot.

Slot generation alone is insufficient: two freshly materialized scenes can
both contain slot 7 at generation zero. An implementation must therefore
include a non-authored runtime-scene/incarnation scope or make applying a
compiled target to any scene other than the exact borrowed scene
unrepresentable. That scope remains a runtime lifetime guard and is not a
sixth authored identity tier.

Cloning or replacing a scene likewise requires rebinding unless the runtime
can prove both values share one non-divergent arena identity. Slot generations
must never wrap and revive an ancient target; exhaustion fails explicitly or
retires the slot permanently.

Neither the compiled target nor a hash derived from it may be written as the
authored address. Conversely, a renderer does not resolve source strings or
walk component definitions for every frame; it consumes compiled targets.

## Immutable effective values

An effective-value input is an immutable sparse map:

```text
compiled property target -> typed property value
```

Before evaluation it validates that every target is live and generation
correct, every key applies to the target node, and every value has the declared
type and domain. Duplicate targets are errors unless a later producer defines
composition before constructing the map.

The reference evaluation is:

```text
materialized ordinary scene + effective values + declared environment
  -> measure and layout
  -> transforms and bounds
  -> draw list
  -> raster and spatial queries
```

Every downstream consumer observes the same effective values. Layout-affecting
values are available before measurement and layout. Paint-affecting values are
not sampled independently by the painter. Queries use the resolved result of
the same evaluation; query-relevant traversal and clip state must be captured
there rather than supplied later through another independently pairable base or
effective-value view. Damage includes draw-list changes so paint-only value
changes cannot produce empty damage.

The declared resource environment is a separate immutable input. A logical
image reference can retain the same identifier while its decoded bytes or
readiness changes, so equality of resolved geometry and draw-list commands is
complete only under the same resource-environment snapshot. The resolved
result, ordered draw list, and environment identity form one immutable frame
product; complete visual comparison accepts two such products rather than
separately pairable parts. A snapshot change must invalidate retained raster
state and produce conservative damage for resource-backed items, or for the
complete scene when affected items cannot be identified. Evaluation still
performs no resource I/O. Rastering a retained frame product against a different
resource-environment incarnation or revision must fail before drawing; a raw
unchecked draw-list replay cannot claim complete-frame semantics.

Evaluation never mutates the authored scene, writes effective values into
source, emits document operations, performs source or resource I/O, or reads a
clock.

### Static-equivalence law

The empty map is the permanent static oracle:

```text
effective-values = empty
  => authored base values at every registered property
  => identical resolved geometry and content
  => identical draw list
  => identical queries
  => identical pixels
```

This law is exact, not approximate. The existing static entry point may remain
as a thin call using the empty map. It must not become a separate semantic
pipeline.

## Validation and diagnostics

A strict Version 4 processor rejects at least:

- a render element or `use` without `id`;
- an empty, malformed, bound, or duplicate `id`;
- a Version 4 source linking a component source of another version;
- a materialized address collision or a materialized node without one address;
- an unknown property key;
- a property key inapplicable to the target kind;
- a value of the wrong registered type;
- a generic null token instead of the key's exact registered value type;
- a non-finite or out-of-domain numeric value;
- an aggregate paint, stroke, corner, or layout value outside the renderer's
  declared capability;
- a valid replacement that forms an invalid complete node state with the
  remaining authored values;
- a stale runtime scene or slot generation;
- two effective entries for the same compiled target; and
- an attempt to address an unregistered subobject or structural field.

Diagnostics identify the authored source and owner, member ID, complete use
path, property key when present, and the immediate violated rule. Useful forms
include:

- `Version 4 <rect> requires a lowercase-kebab id`;
- `duplicate id "avatar" in component "profile-card"; first declared on <ellipse>`;
- `member "label" through scene use "second-card" has no registered property "font-family"`;
- `property "max-width" expects OptionalNumber, received Number`;
- `property "fills" contains an image fit that this renderer cannot materialize`;
- `corner-smoothing cannot be nonzero with elliptical corner radii`;
- `compiled target for use "first-card", member "avatar" belongs to a replaced scene`; and
- `compiled target for use "first-card", member "avatar" is stale: expected generation 2, found 3`.

Source spans may enrich those messages. They do not become address fields.

## Canonical writing

A canonical Version 4 writer:

- emits `version="4"`;
- emits every required render and use ID unchanged at the semantic level;
- never substitutes `name`, source position, or a generated path for a missing
  ID;
- preserves component export ID separately from member IDs;
- writes the existing canonical static property forms;
- never serializes occurrence paths, runtime handles, generations, effective
  values, or resolved output as duplicate authored state; and
- refuses to write an invalid identity graph rather than silently renaming it.

An editor may generate or repair IDs as an explicit authored edit before
calling the canonical writer. The writer itself is not an identity policy.

## Current model compatibility

The current scene contract distinguishes a stable string user-node ID from an
ephemeral numeric runtime node ID, which is the correct lifetime split for an
ordinary flat scene. Its lookup namespace is scene-global, however, and one
string does not preserve Version 4's definition-local member plus ordered use
path. Repeating one component member would either collide or require a
flattened generated string whose segments and escaping become an accidental
second address grammar.

Version 4 therefore keeps its structured address in the linked/materialized
program above the ordinary scene. A runtime that requires one flat user-node
key may lower each logical occurrence to a collision-free opaque key, but it
must preserve the structured source address for inspection, diagnostics,
recompilation, and source writing. The opaque key is not the canonical authored
address and must not be reconstructed by splitting a concatenated string.

This is a declared incompatibility with representing live component
occurrences through the current flat ID field alone. The RFD does not change
the scene paint, ordered-paint, stroke, layout, or runtime-slot models, and it
does not require the ordinary materialized scene to become component-aware.

## Considered alternatives

| Alternative                                       | Decision              | Reason                                                                                              |
| ------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `name` as identity                                | Rejected              | Human labels are optional, duplicate, and routinely edited.                                         |
| Source span, sibling index, or element path       | Rejected              | Reformatting, insertion, reorder, and reparenting change them.                                      |
| Arena `NodeId` as authored identity               | Rejected              | Runtime storage identity has the wrong lifetime and may be reused.                                  |
| One globally flattened instance/member string     | Rejected              | It obscures owner and occurrence boundaries and weakens diagnostics and refactoring.                |
| Generated IDs for Versions 0–3                    | Rejected              | Structural generation cannot promise stability across ordinary source edits.                        |
| Optional IDs in Version 4                         | Rejected              | A processor could not promise a complete durable address space or canonical writer.                 |
| Reflective string property paths                  | Rejected              | Type, applicability, nullability, invalidation, and diagnostics would become late and inconsistent. |
| Clone and patch the authored scene per evaluation | Rejected              | It creates a second mutation path and loses authored/effective separation.                          |
| Identify paint list members by index now          | Deferred              | Reordering and insertion would retarget values; subobject identity needs its own RFD.               |
| Introduce animation syntax with identity          | Rejected for this RFD | Timing and interpolation decisions are independent and remain open.                                 |

## Conformance

A conforming Version 4 reader and materializer:

1. **MUST** enforce required owner-local render and use IDs and the exact
   version-link rule.
2. **MUST** preserve owner/member identity and ordered occurrence paths across
   component expansion and slot projection.
3. **MUST** expose a one-to-one canonical address for every authored
   materialized node and reject collisions.
4. **MUST NOT** treat provenance, source spans, names, runtime slots, or
   generations as authored identity.
5. **MUST** validate typed property targets through one closed registry.
6. **MUST** distinguish sparse absence from an optional state inside an exact
   registered value type and **MUST NOT** define a universal overlay null.
7. **MUST** reject stale compiled targets and invalid typed values before
   evaluation.
8. **MUST** keep authored state immutable and make an empty effective-value
   input observationally identical to static evaluation.
9. **MUST** feed one effective evaluation to layout, draw-list construction,
   query, damage, and rendering.
10. **MUST** treat resource-environment revision as frame identity for cache
    and damage even when logical resource identifiers are unchanged.
11. **MUST NOT** claim that registration makes a property animatable.

## Deferred work

Native animation grammar is explicitly deferred by the [Grida XML animation
RFD](./grida-xml-animation). Any future proposal must state its time model,
source placement, target-reference spelling, keyframes, interpolation, easing,
composition, event posture, static processing, resource behavior, and playback
boundary.

Durable identity for paint layers, strokes, gradient stops, text runs, path or
vector members, and lens-operation parameters is also deferred. Until each
domain has stable member identity, a cross-target property address may name
only the registered node-level value. A later RFD may add structured member
segments without changing the five-tier separation accepted here.
