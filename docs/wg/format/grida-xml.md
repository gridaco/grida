---
title: "Grida XML — authored scene language"
description: "Open RFD for Draft 0 of .grida.xml, an inspectable XML source language for responsive 2D presentations and modern user interfaces."
keywords:
  - grida xml
  - scene language
  - intermediate representation
  - 2d graphics
  - layout
  - text
  - paint stacks
  - gradients
  - image fills
  - multiple strokes
tags:
  - internal
  - wg
  - format-schema
  - canvas
  - authoring
  - layout
  - text
format: md
---

# Grida XML — authored scene language

**Status:** Open RFD — Draft 0.

**Authored file suffix:** `.grida.xml` — provisional.

**Originating request:** [gridaco/grida#957](https://github.com/gridaco/grida/issues/957).

## Thesis

Grida XML is an authored, inspectable scene language for dynamic 2D content.
It combines a small primitive-first graphics vocabulary with explicit box,
binding, text-flow, and layout intent. Its target range includes both
responsive presentations and modern user-interface designs.

The language is XML because a tree is the scene's natural structure, XML is
widely inspectable, and its element/attribute boundary is predictable for both
human authors and language models. Grida XML borrows useful ideas from SVG,
HTML/CSS, and widget trees without inheriting any one of their object models.
It is its own vocabulary, not an SVG profile or an HTML serialization.

Draft 0 is deliberately small. It establishes the document boundary, the box
and nesting model, a minimal primitive set, ordered typed paint, multiple
stroke geometries, text boxes, free bindings, and flex layout. Later drafts
can add effects, vector geometry, resource declarations, typography, and
reuse facilities without changing the central tree model.

## Design requirements

1. **One obvious tree.** Outside explicitly typed property subtrees such as
   `fill` and `stroke`, element nesting is scene nesting. Source order is
   painter order among sibling nodes, stroke geometries, and paints within a
   channel. A node's children live in that node's local coordinate space.
2. **Composition instead of combined node kinds.** Every Draft 0 render
   element except `text` can contain children. A rectangle containing text is
   written as a `rect` containing a `text` element, not as a special
   `ShapeWithText` kind.
3. **A minimal primitive vocabulary.** One primitive has one semantic job.
   Equal width and height make an ellipse a circle; there is no separate
   `circle` kind.
4. **Intent survives responsiveness.** Bindings, auto sizes, text constraints,
   and layout relationships remain authored intent. They are not flattened to
   the coordinates produced by one render.
5. **Predictable authoring.** A current-version reader rejects unknown or
   contradictory syntax. It never guesses, silently drops, or silently
   reinterprets an authored construct.
6. **Inspectable by default.** Canonical names are descriptive, values are
   textual, and the file can be read or repaired without proprietary tooling.
7. **Typed paint, not a parallel style language.** Fill channels and typed
   paint values project the ordered Grida paint model directly. `solid`,
   `gradient`, and `image` are semantic paint elements; structured values
   remain structured. Each stroke geometry owns the same ordered paint value,
   while repetition is a declared extension to the current production
   single-geometry scene model.

## File identity

`.grida.xml` identifies the authored XML language defined here. The compound
suffix is provisional, but it is intentionally distinct from `.grida`, the
packed binary scene/archive format. The two files may describe equivalent
scene intent, but they are different representations with different goals:

| Representation | Primary property                           |
| -------------- | ------------------------------------------ |
| `.grida.xml`   | Authored, inspectable, diffable XML source |
| `.grida`       | Packed binary storage and interchange      |

Changing or packing one representation into the other is a conversion. A
processor must not infer Grida XML merely from a `.grida` suffix, nor infer the
binary format from `.grida.xml`.

## Document model

A Draft 0 document has this shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<grida version="0">
  <container width="960" height="540">
    <!-- one scene tree -->
  </container>
</grida>
```

The XML declaration is optional; when present, it appears once and before all
other content, declares XML `version="1.0"`, may declare only
`encoding="UTF-8"`, and carries no other fields. The `grida` element is
required and is only a document envelope: it has no box, paint, transform, or
layout behavior. It must carry exactly `version="0"` and exactly one element
child. That child must be a `container` and is the document's render root.
Comments and formatting whitespace do not count as render roots.

Because the render root has no visual parent, it must omit the parent-relative
attributes `x`, `y`, `flow`, `grow`, and `align`.
At resolution, a non-painting viewport parent places the render root's local
origin at viewport `(0, 0)`. A fixed root extent is not scaled to the viewport;
it may be smaller than or overflow that environment.

Draft 0 defines no XML namespace and no extension namespace. Namespace-based
extensions require a later version rather than being accepted as inert data.
Comments are allowed. CDATA sections, document types, and processing
instructions are not; text uses ordinary escaped XML character data.

### Core node taxonomy

| Element     | Box source                      | Children | Meaning                                             |
| ----------- | ------------------------------- | -------- | --------------------------------------------------- |
| `container` | Declared; `auto` may hug        | Yes      | Boxed composition and the sole flex-layout owner    |
| `rect`      | Declared                        | Yes      | Parametric rectangle realized in its box            |
| `ellipse`   | Declared                        | Yes      | Parametric ellipse realized in its box              |
| `line`      | Declared width; zero-height box | Yes      | Horizontal local line, orientable by rotation       |
| `text`      | Measured under box constraints  | No       | Unicode text flowed into an auto or fixed text box  |
| `group`     | Derived from child bounds       | Yes      | Logical subtree with an explicit local origin       |
| `lens`      | Derived from child bounds       | Yes      | Group whose ordered operations affect painting only |

`text` is the only leaf in Draft 0. Every other node accepts an ordered list
of render-node children, including each primitive element. A paintable parent
paints its fill first, then its children in document order, then its own
strokes. Later siblings paint above earlier siblings.

`shape` is a reserved element name, not a Draft 0 render element. It is held
for a possible future custom-shape definition. This reservation assigns no
box, paint, child, definition, or reuse behavior. A Draft 0 reader **MUST**
reject `<shape>`, including historical `<shape kind="…">`. The bounded
`kind` discriminator belongs only to the `gradient` paint family; it is not a
render-node attribute.

The nesting contract is normative. This is a regular rectangle with a text
child:

```xml
<rect width="240" height="64" fill="#7C3AED">
  <text x="center" y="center" size="18" fill="#FFFFFF">Continue</text>
</rect>
```

The text is positioned in the rectangle's local 240 by 64 box. No combined
shape-with-text node exists or is implied.

## Scalar and coordinate conventions

- Numbers are finite decimal values with no unit suffix. Geometry numbers are
  logical pixels.
- The local origin is the top-left of a boxed node. Positive x points right;
  positive y points down.
- Widths and heights are non-negative. Binding offsets may be negative.
- Angles are degrees, increasing clockwise in the y-down coordinate system.
- Boolean values are exactly `true` or `false`.
- Authored colors use `#RGB` or `#RRGGBB`; a canonical writer emits uppercase
  `#RRGGBB`. Alpha belongs to `opacity`, not to the color token. Richer color
  spaces are future work.

## Property registry

The [Grida XML property registry](./grida-xml-properties) is the canonical
cross-draft inventory of element and property names, their valid targets, and
production-backed placeholders. This RFD remains the normative Draft 0
grammar. A property marked Placeholder or Design in the registry is therefore
still unknown syntax to a Draft 0 reader.

## Common authored attributes

Only attributes applicable to a node may appear on that node.

| Attribute                 | Value                                     | Default    | Contract                                                         |
| ------------------------- | ----------------------------------------- | ---------- | ---------------------------------------------------------------- |
| `name`                    | XML string                                | none       | Human-readable label; it is not durable node identity            |
| `x`, `y`                  | position binding                          | `0`        | Places a free-positioned node in its parent's local box          |
| `width`, `height`         | finite number or `auto`, where applicable | by element | Declares a fixed extent or requests element-specific measurement |
| `min-width`, `min-height` | non-negative finite number                | none       | Sets a lower bound on a non-derived box axis                     |
| `max-width`, `max-height` | non-negative finite number                | none       | Sets an upper bound on a non-derived box axis                    |
| `aspect-ratio`            | positive finite `width:height` pair       | none       | Resolves one otherwise under-specified box axis                  |
| `rotation`                | finite number                             | `0`        | Visual rotation about box center; about origin for derived kinds |
| `flip-x`, `flip-y`        | `true` or `false`                         | `false`    | Reflects paint horizontally or vertically before rotation        |
| `fill`                    | `#RGB` or `#RRGGBB`                       | none       | Canonical compact form for one ordinary solid fill               |
| `opacity`                 | finite number in `[0, 1]`                 | `1`        | Composites the node and its descendants                          |
| `hidden`                  | `true` or `false`                         | `false`    | Removes the subtree from layout and painting                     |
| `flow`                    | `in` or `absolute`                        | `in`       | Opts a child into or out of a flex parent's flow                 |
| `grow`                    | non-negative finite number                | `0`        | Flex main-axis growth factor                                     |
| `align`                   | `start`, `center`, `end`, or `stretch`    | none       | Per-child flex cross-axis override                               |

`width` and `height` are the only Draft 0 spellings. The same rule applies to
`min-width`, `max-width`, `min-height`, `max-height`, and `aspect-ratio`.
Short experimental spellings such as `w`, `h`, `min-w`, and `aspect` are not
Grida XML. Likewise, `container` is the node name; `frame` is not a Grida XML
alias. Historical `<shape kind="…">` is TextIr syntax, not a Grida XML alias.
A host may support that import dialect separately, but a conforming Draft 0
writer never emits it and a strict Grida XML reader does not confuse it with
this language.

Rotation is visual-only intent. It does not change a node's layout box, flex
contribution, or a container's hug size; the resolved visual bounds do include
the rotated paint. Flips have the same visual-only status and use the same
pivot rule as rotation. A node's local paint is reflected first and then
rotated; neither operation writes a matrix or negative extent into source.

`fill="#fff"` means exactly one visible, fully opaque, normal-blend solid
paint. It is not legacy syntax: it is the canonical compact form for the most
common fill. It cannot coexist with the structured `<fill>` channel. `fill` is
valid on `container`, `rect`, `ellipse`, and `text`; it is invalid on `line`,
`group`, and `lens`.

## Paint channels and vocabulary

The XML topology separates where paint is applied from what the paint is:

```text
render node
├─ fill attribute or fill channel → ordered Paint*
└─ stroke geometry*               → ordered Paint*

Paint := solid | gradient(kind) | image
```

`fill` is the node's single fill channel. `stroke` is a repeatable stroke
geometry, and each occurrence owns one paint channel. Neither is a render node
or an extra compositing layer. Typed paint children are ordered bottom to top:
the first is painted first, and each later paint composites above the
accumulated result.

This is the canonical expanded form for a rich fill:

```xml
<rect width="320" height="180">
  <fill>
    <solid color="#101828"/>

    <gradient kind="linear" from="0 0" to="1 1" opacity="0.8">
      <stop offset="0" color="#7C3AED"/>
      <stop offset="1" color="#2563EB"/>
    </gradient>

    <image src="./noise.png" fit="cover" opacity="0.15"/>
  </fill>

  <text fill="#FFFFFF">Example</text>
</rect>
```

A node's structural paint children must precede character data and render-node
children. When both channels occur, the optional `fill` element comes first,
followed by zero or more `stroke` elements. `container`, `rect`, `ellipse`, and
`text` accept fills and strokes. `line` accepts strokes only. `group` and
`lens` accept neither.

The direct paint vocabulary is:

| Element    | Paint value                                                                |
| ---------- | -------------------------------------------------------------------------- |
| `solid`    | One color with alpha carried by paint opacity                              |
| `gradient` | A structured stop ramp with `linear`, `radial`, `sweep`, or `diamond` kind |
| `image`    | A referenced image placed into the node's paint box                        |

The element name carries the paint type. `gradient` is one bounded paint
family whose required `kind` selects the existing gradient variant; this is
not a generic `<paint kind="…">` design. `<color>`, `<paint>`,
`<fill kind="…">`, and the four kind-specific gradient element names are not
aliases. `solid` and `image` are empty elements. `gradient` is non-empty
because its direct children are the structured stop ramp.

### Fill defaults, emptiness, and canonical shorthand

Omitting both the `fill` attribute and the `<fill>` child element applies the
element's language default:

| Element                   | Default fill paint stack            |
| ------------------------- | ----------------------------------- |
| `container`               | empty                               |
| `rect`, `ellipse`, `text` | one opaque normal-blend black solid |
| `line`, `group`, `lens`   | not fillable                        |

`<fill/>` differs from omission on primitives and text: it suppresses the
default black paint. A reader also accepts a structured one-solid channel, but
there is one canonical writer representation. The writer applies these rules
in order:

1. If the fill stack equals the element default, omit both forms.
2. If it is exactly one visible, fully opaque, normal-blend solid, emit the
   `fill="#RRGGBB"` attribute.
3. For every other non-empty stack, emit one `fill` element with typed paint
   children in bottom-to-top order.
4. If the stack is empty but omission would restore a non-empty default, emit
   `<fill/>`.

The two fill forms are mutually exclusive. A processor must never interpret
the attribute as an implicit bottom paint beneath an expanded channel.

### Multiple stroke geometries

One stroke paint stack and multiple stroke geometries are different
capabilities. Multiple paints within one `stroke` share one coverage mask:
they have the same width, alignment, cap, join, and dash pattern. Repeated
`stroke` elements generate independent coverage masks over the same underlying
node outline, and each mask has its own ordered paint stack.

This distinction solves designs that a single SVG stroke cannot represent
directly: road casings, double borders, concentric keylines, focus rings plus
borders, and decorative inner and outer outlines. SVG or CSS authors commonly
duplicate geometry, nest wrappers, combine `border` and `outline`, introduce
pseudo-elements, or approximate an outline with shadows. Those workarounds
split one semantic path across several scene objects, make geometry edits
drift, and often disagree at joins, dashes, transforms, or hit bounds. Native
multi-stroke keeps one shape, one layout identity, and one editable outline.

```xml
<rect width="320" height="180" fill="#101828">
  <stroke width="12" align="outside" join="round">
    <solid color="#111827"/>
  </stroke>

  <stroke width="3" align="inside">
    <solid color="#2563EB"/>
    <gradient kind="linear" from="0 0" to="1 1" opacity="0.8">
      <stop offset="0" color="#A78BFA"/>
      <stop offset="1" color="#60A5FA"/>
    </gradient>
  </stroke>
</rect>
```

The uniform Draft 0 stroke geometry is:

| Attribute     | Value                                      | Default                      | Valid targets                          |
| ------------- | ------------------------------------------ | ---------------------------- | -------------------------------------- |
| `width`       | non-negative finite logical pixels         | `1`                          | every `stroke`                         |
| `align`       | `inside`, `center`, or `outside`           | `inside`; `center` on `line` | every `stroke`; line must be `center`  |
| `cap`         | `butt`, `round`, or `square`               | `butt`                       | `line`                                 |
| `join`        | `miter`, `round`, or `bevel`               | `miter`                      | `container`, `rect`                    |
| `miter-limit` | positive finite number                     | `4`                          | `container`, `rect`                    |
| `dash-array`  | space-separated non-negative finite values | absent, meaning solid        | `container`, `rect`, `ellipse`, `line` |

When present, `dash-array` contains at least one value and is not all zero.
Odd-length arrays repeat once to make an even dash-gap cycle. An attribute on a
target outside this table is an error rather than dormant state. A `line` is an
open path and accepts only `align="center"`, because inside and outside are not
defined for it. Per-side widths, variable-width profiles, dash offset, and
endpoint markers are later vocabulary.

Stroke width is distributed relative to the source outline. `center` places
half the width on each side; `inside` places the full width toward the filled
region; `outside` places it away from the filled region. For text, that region
is each shaped glyph's filled outline, including the inverse direction around
counters. Line caps and rectangular joins use the declared `cap`, `join`, and
`miter-limit` values.

Dash traversal begins at the line's local start point, at a rectangle's
top-left corner moving clockwise, and at an ellipse's rightmost point moving
clockwise. The first dash begins at that origin because Draft 0 has no dash
offset. Each distinct contour restarts the pattern.

Stroke elements are ordered in painter order: the first stroke is bottommost
and the last is topmost. Paints within each stroke are independently ordered
bottom to top. A node paints its fill stack, then its render-node children, then
all stroke geometries. Thus children remain below their parent's border-like
strokes. Each stroke is derived independently from the same original outline;
a later stroke is not offset from, clipped by, or inherited from an earlier
stroke.

Omitting all `stroke` elements means no strokes. A stroke normally contains at
least one typed paint child. An empty stroke is valid only when it carries at
least one geometry value that differs from that target's defaults; it preserves
dormant geometry that the current model can distinguish. A default empty
`<stroke/>` is invalid because the model has no presence bit that distinguishes
it from omission. A zero-width or wholly invisible painted stroke likewise
remains authored intent and must not be deleted or reordered by a canonical
writer.

#### Accepted model extension: stroke geometry multiplicity

The current production Grida scene model has one ordered stroke `Paints` value
plus one shared stroke geometry per node. One XML `stroke`, when its attributes
apply to the target node, projects that pair directly. Two or more stroke
elements cannot: merging their paint lists would erase geometry, while
duplicating the scene node would erase the one-shape semantic contract.

Draft 0 therefore deliberately widens this part of the scene contract to an
ordered list of stroke geometries, each owning `Paints`. The language contract
is accepted ahead of that production scene/archive change; it is a declared
required model extension, not permission to retain a permanent XML-only list.
Until a materializer's target model can represent the list, it must reject the
second stroke with an unsupported-model diagnostic; it must not keep only one,
merge them, or create hidden duplicate nodes.

### Coverage and paint boxes

Paint coverage and paint coordinates are separate. Coverage determines which
pixels a channel may affect; the paint box supplies the local coordinate space
for gradients and image placement.

| Target              | Fill coverage                       | Stroke source outline              | Paint box                                     |
| ------------------- | ----------------------------------- | ---------------------------------- | --------------------------------------------- |
| `container`, `rect` | rectangular interior                | rectangular perimeter              | resolved local layout box                     |
| `ellipse`           | elliptical interior                 | elliptical perimeter               | resolved local layout box                     |
| `line`              | none                                | authored local line segment        | resolved segment box with degenerate fallback |
| `text`              | shaped glyph interiors, not its box | shaped glyph contours, not its box | resolved local text layout box                |

The paint box is resolved after bindings, flex sizing, constraints, and text
measurement, but before the node's visual rotation or flips. Children do not
change their parent's coverage, outline, or paint box. A zero-length paint-box
axis is replaced for paint-coordinate mapping only by a one-logical-pixel
interval centered on that axis; the node's actual geometry and layout extent
remain zero. For the resulting effective box `(x, y, width, height)`, unit paint
coordinates map through
`translate(x,y) × scale(width,height) × paint-transform`.

Stroke paints use the same box as fills, so changing stroke width does not
rescale a gradient or image. Paint is evaluated in that box and then clipped by
the individual stroke coverage. A solid extends throughout that coordinate
space. Gradient samples outside the unit box follow the gradient kind's tile or
clamp rule. An image is transparent outside the image rectangle produced by
its `fit`, so an outside-aligned stroke may sample transparency beyond the node
box.

Strokes do not grow layout bounds. Resolved visual bounds conservatively include
the coverage of effective strokes: a stroke must have positive width and at
least one visible, non-zero-opacity paint. Those bounds may contain transparent
image or gradient samples; exact non-transparent pixel bounds are not required.
Centered and outside-aligned effective strokes may extend the conservative
visual bounds beyond the layout box.

#### Conformance on degenerate paint boxes

Draft 0's one-pixel paint-space fallback is required for rich paint on
degenerate geometry. A materializer that lacks this mapping must report the
case as unsupported rather than silently substitute a different gradient or
image mapping.

### Common paint properties

Every typed paint accepts the same compositing properties:

| Attribute    | Value                              | Default  | Meaning                                     |
| ------------ | ---------------------------------- | -------- | ------------------------------------------- |
| `visible`    | exactly `true` or `false`          | `true`   | Whether this paint participates in painting |
| `opacity`    | finite number in `[0,1]`           | `1`      | Alpha applied to this paint only            |
| `blend-mode` | one of the paint blend modes below | `normal` | How this paint composites over paints below |

Visibility is stored intent. A false paint remains in the ordered list but
does not draw. Zero opacity likewise has no visual contribution; neither case
authorizes a writer to delete or reorder the paint.

Paint opacity is distinct from node opacity. Paint opacity affects only that
entry while the node's `opacity` composites the node and its descendants as a
group. Moving a value between these two levels is not a semantic-preserving
normalization.

Paint blend modes are `normal`, `multiply`, `screen`, `overlay`, `darken`,
`lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`,
`difference`, `exclusion`, `hue`, `saturation`, `color`, and `luminosity`.
`pass-through` is a layer mode, not a paint blend mode. Each paint's blend mode
applies while that paint composites over the accumulated paints below it; it
does not retroactively alter an earlier paint.

#### Conformance on stack compositing

Collapsing a paint stack into one shader is not equivalent to the ordered model
for every stack. For example, a bottom `multiply` paint followed by a
translucent normal paint must multiply only the bottom entry; applying
`multiply` to a combined result also changes the later entry.

Draft 0 follows the `Paints` model: each visible entry composites in order with
its own blend mode against the actual accumulated result. An implementation
may collapse the operations only when it proves the result equivalent. This is
a quarantined renderer incompatibility, not grounds to change paint order,
move blend metadata, or fork the paint model.

### Solid colors and alpha quantization

`solid` requires `color`. Its authored `opacity` is represented as an 8-bit
color alpha in the common paint model, so parsing quantizes opacity to the
nearest alpha byte:

```text
stored opacity = round(authored opacity × 255) / 255
```

When a canonical writer emits a structured solid or stop opacity, it emits that
stored value. For example, authored `0.5` normalizes to `128/255`, approximately
`0.5019608`. This is an intentional projection of the common paint model, not
an independent floating-point solid opacity. A stop's optional `opacity` uses
the same 8-bit quantization for its color alpha. A gradient or image paint's
own opacity remains independent of the colors or pixels it modulates.

### Structured gradients

Every `gradient` requires exactly one `kind`, one of `linear`, `radial`,
`sweep`, or `diamond`. These values map one-for-one to the existing Grida paint
variants; the family element does not collapse them into a new runtime type.
The element contains at least two empty `stop` children. It permits comments
and formatting whitespace, but no other element or non-whitespace character
data. A stop requires a finite `offset` in `[0,1]` and a color, and may carry
`opacity`; it does not accept paint-level visibility or blend attributes. Stops
appear in nondecreasing offset order. Equal adjacent offsets are valid and
express a hard transition; a reader must preserve their source order and must
not sort, merge, or deduplicate them.

The gradient-kind attribute boundary is strict:

| Attribute    | `linear` | `radial` | `sweep`  | `diamond` |
| ------------ | -------- | -------- | -------- | --------- |
| `kind`       | required | required | required | required  |
| `transform`  | yes      | yes      | yes      | yes       |
| `from`, `to` | yes      | no       | no       | no        |
| `tile-mode`  | yes      | yes      | no       | no        |

Changing `kind` preserves stops, `transform`, and the common paint properties.
Attributes that do not apply to the new kind must be removed; they never remain
as dormant state. The discriminator edit is localized, but a kind switch with
variant-specific attributes also requires that explicit cleanup, and switching
back does not restore discarded state.

All gradient geometry is defined in the unit paint box `[0,1] × [0,1]`, with
`(0,0)` at top-left and `(1,1)` at bottom-right. The optional
`transform="a b c d e f"` is a finite affine transform in that unit space,
represented as:

```text
[ a c e ]
[ b d f ]
```

It defaults to identity. The effective paint-box mapping defined above composes
its translation and scale with this transform, including the declared
degenerate-axis fallback, so gradient geometry remains independent of the
node's pixel size.

A linear gradient additionally carries `from="u v"` and `to="u v"`. They
default to `0 0.5` and `1 0.5`. Each requires exactly two finite values; values
outside `[0,1]` are allowed to place an endpoint outside the paint box, but the
two endpoints must differ. They are first-class linear-kind state, not a
second spelling of the transform.

The remaining base geometries are fixed before the transform:

| Type    | Unit-space ramp domain                                                      |
| ------- | --------------------------------------------------------------------------- |
| radial  | center `(0.5,0.5)`, radius `0.5`; `t` grows from center to radius           |
| sweep   | center `(0.5,0.5)`; `t=0` points right and grows clockwise through one turn |
| diamond | `t = min(1, 2 × (abs(u-0.5) + abs(v-0.5)))`, the Manhattan/L1 distance ramp |

Linear and radial gradients accept `tile-mode`, one of `clamp`, `repeated`,
`mirror`, or `decal`, defaulting to `clamp`. Sweep and diamond gradients are
clamped and reject that attribute in Draft 0.

| Tile mode  | Samples outside the gradient domain                   |
| ---------- | ----------------------------------------------------- |
| `clamp`    | extend the nearest edge color                         |
| `repeated` | repeat the ramp in the same direction                 |
| `mirror`   | repeat the ramp, reversing every alternate repetition |
| `decal`    | become transparent                                    |

#### Linear endpoint numeric seam

The common paint model stores linear endpoints as binary32 centered-normalized
alignments. The Draft 0 boundary evaluates the authored UV conversion
`alignment = 2 × uv - 1` in binary64 and then stores binary32; a canonical
writer computes the inverse in binary64 and verifies that reparsing recovers
the exact binary32 model value. This preserves ordinary arbitrary model values,
including centered-normalized values such as `0.1`, without redefining the
paint model.

A microscopic subset of finite binary32 alignments too close to centered zero
cannot survive that binary64 UV conversion. The smallest positive binary32
subnormal is one example: adding its inverse UV delta to `0.5` rounds back to
exactly `0.5`. A canonical writer must reject such an endpoint with a precise
representability error rather than normalize it to center. This is an explicit
format/model compatibility limit, not a restriction on `Paint`; a future
arbitrary-precision source-number boundary may remove it without changing the
paint model or XML vocabulary.

#### Compatibility quarantine: unconstrained gradient model state

The current paint data types can hold gradient values that Draft 0 deliberately
rejects: fewer than two stops, out-of-range or descending stop offsets, and
coincident linear endpoints. Those states have no valid Grida XML spelling. A
canonical writer must report the failed invariant and must not invent stops,
sort or clamp offsets, or perturb an endpoint. Complete model-to-XML round-trip
requires these invariants to be established in the common paint model first.

#### Compatibility quarantine: gradient editing model

The current paint contract and the
[Gradient Session](../canvas/paint-session/gradient.md) RFD disagree in two
places that are not safe to average:

- Grida XML and the paint contract store a linear gradient's endpoints
  explicitly, while the session RFD says all non-trivial orientation belongs
  only in the transform.
- Grida XML and the paint contract define diamond by Manhattan/L1 distance,
  while the session RFD describes an L-infinity distance field.

For Draft 0 files, the definitions in this RFD are normative. A processor must
not silently rewrite explicit endpoints into a transform or substitute the
other diamond metric. The session model remains quarantined at this seam until
the two documents are reconciled together; changing either serialized meaning
requires an explicit compatibility decision.

### Image paints and resources

`image` directly inside `fill` or `stroke` is an image paint. It requires a
non-empty `src`, which is an authored resource identifier, and accepts
`fit="cover|contain|fill|none"`. The default is `cover`; `contain` preserves
aspect ratio within the box, `cover` preserves aspect ratio while covering and
cropping, `fill` stretches to both box axes, and `none` retains intrinsic image
size. Draft 0 centers the placed image and defines no image-paint syntax for
orientation, filters, free-transform placement, or tiling.

`src` materializes as a logical resource ID (RID), preserving the authored
string. Draft 0 does not author content-hash resource references through
`image`; adding another resource-identity form requires explicit syntax rather
than guessing from the string's shape.

Syntactic parsing preserves `src` and performs no file, network, or decode
operation. Resource resolution belongs to the explicit resolution environment:

- a relative identifier such as `./noise.png` resolves against the document's
  base location;
- an absolute logical resource identifier is looked up as authored;
- the authored string is not rewritten merely because a host found its bytes;
- a missing, unreadable, or undecodable image is a resource-resolution failure,
  not malformed XML.

A strict materializer reports the failing authored identifier and, when one
exists, its resolved location. It must not silently discard the image paint and
claim a complete resolved result. An interactive host may display a diagnostic
placeholder while keeping the unresolved state explicit.

The meaning of `image` is contextual. Inside `fill` or `stroke` it is always a
paint. Outside those channels it occupies the scene-element namespace, where a
later version may define an image node. Draft 0 defines no scene-image node and
therefore rejects an out-of-context `image` rather than confusing it with a
paint.

### Inline definitions and future reuse

Typed paint elements are canonical inside an expanded channel, with the
singleton ordinary-solid `fill` attribute as the compact exception. Draft 0
defines no reusable paint definition, reference, identifier, or lookup scope.
Paint definitions and references are future work and are not required to
express any current fill or stroke.

### Considered syntax alternatives

1. **Direct typed paint children under `fill` and `stroke` — accepted.** Paint
   type and painter order remain visible in ordinary XML structure.
2. **`<gradient kind="…">` — accepted.** The four current variants share stops,
   transform, visibility, opacity, and blend behavior. The bounded discriminator
   localizes a geometry switch while keeping `gradient` a semantic paint type;
   incompatible kind-specific attributes still require removal.
3. **Four gradient element names — rejected for Draft 0.** They duplicate the
   shared family grammar and make a geometry switch replace the wrapper. A
   structurally different future gradient, such as a mesh, should receive its
   own semantic element instead of being forced into this family.
4. **A generic paint or repeated fill-layer envelope — deferred unless layer
   metadata becomes independent from its source.** Common visibility, opacity,
   and blend properties currently belong to the typed paint itself, so
   `<paint><solid/></paint>` would add a level without representing a distinct
   model concept.
5. **Plural `<fills>`/`<strokes>` or `<paints target="…">` channels — rejected.**
   Singular `fill` names the one fill channel, while repeatable `stroke` names
   one geometry with its paints. The hierarchy already supplies the target;
   repeating it in a generic container costs clarity and tokens.
6. **CSS-like functional attributes — rejected as canonical.** Encoding ramps
   and image placement inside attribute strings creates a second nested
   grammar, produces poorer diagnostics, and is less reliably authorable by
   language models.

### Position bindings

`x` binds the horizontal axis and `y` binds the vertical axis. For a boxed or
measured node with parent extent `E` and resolved child extent `s`, the value
forms are:

| Form             | Meaning                             | Resolved start            |
| ---------------- | ----------------------------------- | ------------------------- |
| `n` or `start n` | Offset from the parent's start edge | `n`                       |
| `end n`          | Offset from the parent's end edge   | `E - n - s`               |
| `center`         | Center in the parent                | `(E - s) / 2`             |
| `center n`       | Center, then apply an offset        | `(E - s) / 2 + n`         |
| `span a b`       | Bind both edges                     | start `a`, extent `E-a-b` |

The bare number is the canonical spelling for a start binding. `span` owns
the size on its axis, so `width`, `min-width`, and `max-width` must be omitted
when `x` is a span; the corresponding height attributes must be omitted when
`y` is a span. End, center, and span bindings require a resolvable parent
extent; using one against an unresolved auto or derived parent axis is a
resolution error, not an invitation to guess.

If a resolved span would have negative extent because `a + b > E`, its extent
is clamped to zero at start `a` and the resolver reports that clamp. This is a
valid resolved boundary case, not a negative box and not a source rewrite.

For `group` and `lens`, bindings place the node's local origin rather than the
top-left of its derived union. Their start, end, and center formulas are `n`,
`E - n`, and `E / 2 + n`, respectively; child-union size `s` is not
subtracted. `span` is invalid on a derived-box node because there is no
authored axis extent for it to own.

An in-flow child of a flex container is positioned by flex and must omit
`x`/`y`. `flow="absolute"` removes it from flex participation and restores
its bindings against the container's local box. `flow` is valid only on a
child of a flex container; `grow` and `align` are valid only while that child
remains in flow.

### Size constraints and aspect ratio

Minimum and maximum constraints apply to `container`, `rect`, `ellipse`,
`line`, and `text`. They are invalid on `group` and `lens`, whose boxes are
derived. Resolution first obtains an axis from its binding, declared intent,
measurement, or layout, then clamps it to the applicable maximum and minimum.
The minimum wins when a minimum exceeds its paired maximum. If constraining a
text width changes its wrapping width, text is measured again before its final
height is chosen. Because a line's height is definitionally zero,
`min-height` and `max-height` are invalid on `<line>`.

In Draft 0, `aspect-ratio="w:h"` applies only to `rect` and `ellipse`. It
contains two positive numbers and supplies exactly one otherwise
under-specified axis from the other. It never distorts two extents that are
already determined and never invents a scale transform. Using an aspect ratio
where neither axis can provide the other, or redundantly declaring it when
both axes are already supplied, is an error.

## Box semantics by element

### Container

A container is a rectangular composition box. Each of `width` and `height`
accepts either a non-negative number or `auto`. On an auto axis, the local
start edge remains fixed and the extent grows through the greatest positive
child far edge plus padding; auto sizing never shifts the local origin.
Consequently, a child with a sufficiently negative start offset may overflow
the start side rather than moving the container. A fixed value remains
authored intent even when a parent layout gives the node a different resolved
extent. Both dimensions default to `auto`.

Without `layout="flex"`, children are free-positioned by their bindings. On
an auto axis, free children must be start-bound; an end, center, or span
binding would require the extent it is trying to determine and is therefore a
resolution error. Their bindings resolve against the padding-inset content
box, then add the container's left and top padding; therefore `x="0"` and
`y="0"` start at the padded content origin.

A container may carry a fill and repeated strokes and may clip descendant
paint with `clips="true"`. Its fill is painted first. Its children are then
painted under the descendant clip, if enabled; after that clip is removed, the
container's strokes are painted last. The default container fill is empty and
the default stroke list is empty.

### Primitive elements

Draft 0 recognizes the direct primitive elements `rect`, `ellipse`, and
`line`. They do not accept a `kind` attribute.

- `rect` and `ellipse` require each axis to be supplied by either a fixed
  numeric size or a `span` binding. `aspect-ratio` may supply exactly one
  otherwise-unsupplied axis.
- `line` requires either fixed numeric `width` or an x-axis `span`. Its
  authored and resolved height is zero, so `height` and a y-axis `span` are
  invalid. It is the horizontal segment from local `(0, 0)` to `(width, 0)`
  and can be oriented with `rotation`. It has no fill; each authored `stroke`
  independently strokes that segment. With no strokes it contributes no
  pixels.
- An unresolved `auto` axis is invalid on a primitive because these elements
  have no content-based natural size. `aspect-ratio` is invalid on `line`.

An ellipse whose width equals its height is a circle. A `circle` kind or
element is invalid: it would duplicate rather than extend the primitive
model.

The primitive and its children share the primitive's local box, but are
otherwise independent. Changing a child does not rewrite the primitive, and
resizing the primitive does not rewrite a child's authored bindings.

### Text

The character data directly inside `text` is its content. `text` cannot
contain render elements. It may begin with the structural `fill` property and
zero or more `stroke` properties, which are neither character content nor
render children. Formatting whitespace before and between those leading
properties is ignored. After the final property closes—or immediately after
the opening tag when there is no property—every character is text content,
including whitespace. A canonical writer therefore places the first intended
character immediately after the final property's closing tag, rather than
pretty-printing an unintended newline. Entity references are decoded as XML
character data.

Text accepts `size`, a positive font size in logical pixels. Draft 0 leaves
font selection to the declared resolution environment; a resolved artifact
records the result of shaping with that environment rather than writing it
back into the source.

Text is a box, not a point label:

| Width intent | Height intent | Behavior                                                 |
| ------------ | ------------- | -------------------------------------------------------- |
| `auto`       | `auto`        | Measure natural lines; do not introduce soft wrapping    |
| fixed        | `auto`        | Wrap to the fixed width and measure the resulting height |
| fixed        | fixed         | Wrap to the fixed width inside the fixed-height text box |
| `auto`       | fixed         | Measure natural width inside the fixed-height text box   |

Both attributes default to `auto`. A span-resolved width is a fixed wrapping
constraint. Text wraps at the legal break opportunities provided by the
declared text-resolution environment. Explicit line breaks are preserved in
every mode. Draft 0 does not define truncation or ellipsis; fixed height
constrains the box but does not silently alter the text content. Text paint may
overflow that box unless an ancestor container clips it.

### Group

A group has no declared width or height and no visual content of its own. Its
box is the union of its children's untransformed local layout boxes. Child
rotation, flips, and lens operations affect visual bounds but do not enlarge
that sizing-tier union. The group's `x` and `y` place the group's local origin,
not the top-left of that union; consequently, a child may extend into negative
local coordinates without moving its siblings.

### Lens

A lens has the same derived-box and origin rules as a group. Its `ops`
attribute is an ordered, space-separated list drawn from:

```text
translate(x,y)
rotate(degrees)
scale(s)
scale(x,y)
skew-x(degrees)
skew-y(degrees)
skew(x-degrees,y-degrees)
matrix(a,b,c,d,e,f)
```

Operations compose in source order and affect descendant painting and
resolved visual bounds. They do not change flex contribution, hug sizing, or
sibling placement. A lens is therefore explicit picture-transform intent,
not a place to store a matrix produced by layout.

## Flex layout

Only `container` may own flex layout in Draft 0. Its `layout` value is `none`
or `flex`, defaulting to `none`; a canonical writer omits the default. Nesting
children under a primitive element, group, or lens remains free placement;
those elements do not acquire layout behavior merely because they can contain
children.

`layout="flex"` enables a one- or multi-line, CSS-inspired flow with this
surface:

| Attribute   | Values                                                                    | Default |
| ----------- | ------------------------------------------------------------------------- | ------- |
| `direction` | `row`, `column`                                                           | `row`   |
| `wrap`      | `true`, `false`                                                           | `false` |
| `gap`       | one non-negative number, or main/cross numbers                            | `0`     |
| `padding`   | one non-negative number, or top/right/bottom/left numbers                 | `0`     |
| `main`      | `start`, `center`, `end`, `space-between`, `space-around`, `space-evenly` | `start` |
| `cross`     | `start`, `center`, `end`, `stretch`                                       | `start` |

`padding` applies to both free-positioned and flex containers. The other
attributes in this table are valid only when `layout="flex"` is present.

In-flow children participate in source order. Their resolved size is their
flex basis. Positive remaining main-axis space is divided in proportion to
`grow`; Draft 0 does not shrink children. `main` distributes remaining space,
while `cross` and a child's `align` place or stretch it on the cross axis.
Container-level `cross="stretch"` stretches only children whose authored
cross size is `auto`; a fixed cross size remains fixed. Child-level
`align="stretch"` is an explicit fill override and stretches even a fixed
cross size. Wrapping forms additional lines when enabled. An absolute child
does not consume a flex slot, gap, or growth share.

Layout owns resolved placement, never source geometry. Re-resolving at a new
container extent may move or resize children without writing those results
into the document.

## Canonical example

This slide exercises flex layout, constrained text, an ellipse used as a
circle, and text nested directly under a primitive element:

```xml
<grida version="0">
  <container name="slide" width="960" height="540" layout="flex" direction="column" padding="48" gap="24" fill="#101828">
    <ellipse name="badge" width="72" height="72" fill="#7C3AED">
      <stroke width="8" align="outside">
        <solid color="#312E81"/>
      </stroke>
      <stroke width="2" align="inside">
        <gradient kind="linear" from="0 0" to="1 1">
          <stop offset="0" color="#DDD6FE"/>
          <stop offset="1" color="#60A5FA"/>
        </gradient>
      </stroke>
      <text x="center" y="center" size="18" fill="#FFFFFF">01</text>
    </ellipse>
    <text width="520" height="auto" size="40" fill="#FFFFFF">Design responsive 2D content that wraps predictably.</text>
  </container>
</grida>
```

Formatting and attribute order are not semantic. The element names,
`version`, `width`/`height` spellings, value grammars, and child order are.

## Source intent and resolved output

The `.grida.xml` document is the authored-intent tier. It stores the facts an
author chose: node kinds, hierarchy, bindings, size intent, text, paint,
layout relationships, and explicit lens operations.

A resolver combines that source with an explicit environment—viewport,
fonts, and resources—to produce a separate resolved scene. Resolved boxes,
world transforms, measured glyph runs, visual bounds, materialized vector
points, and paint commands belong to that derived output. They are not fields
of Grida XML merely because a renderer can compute them.

This separation has three consequences:

1. Reading or rendering a file must not rewrite responsive intent into the
   values observed in one environment.
2. A canonical writer serializes source intent, not a resolved snapshot.
3. Tools may expose a materialized view for inspection or editing, but any
   source edit must deliberately retarget the appropriate intent rather than
   copying every resolved value back into the document.

## Strict parsing and versioning

Draft 0 uses strict current-version parsing. A reader either produces the
declared Draft 0 scene or reports a typed failure. It must reject:

- malformed XML;
- CDATA sections, document types, or processing instructions;
- an envelope other than `grida`;
- a missing version or any version other than exactly `0`;
- no render root, more than one render root, or a root other than `container`;
- unknown elements, attributes, enum values, or lens operations;
- the reserved `<shape>` element or `kind` on a render node;
- attributes used on a node kind where they do not apply;
- a typed paint outside `fill` or `stroke`, a `stop` outside `gradient`, a
  nested `fill` or `stroke`, a duplicate `fill`, or a structural paint child
  placed after text or render children;
- simultaneous use of the `fill` attribute and `fill` element on one node;
- unknown paint tags or paint attributes, a generic `paint` envelope, an
  invalid paint blend mode, or a non-boolean paint visibility value;
- a gradient with a missing or unknown `kind`, an attribute not valid for its
  kind, fewer than two stops, a stop outside `[0,1]`, descending stop offsets,
  coincident linear endpoints, or a malformed gradient affine;
- an empty image `src` or unsupported image fit;
- a fill on `line`, any fill or stroke on `group` or `lens`, an empty stroke
  whose geometry equals its target defaults, a stroke attribute invalid for its
  target, invalid stroke geometry, a non-centered line stroke, or a malformed
  dash array;
- non-finite numbers, negative dimensions, or malformed colors;
- non-positive font sizes or aspect-ratio terms, negative growth, gap, or
  padding values, or opacity outside `[0, 1]`;
- render elements inside `text`, or non-whitespace character data inside a
  non-text node;
- contradictory geometry such as a fixed width alongside an x-axis span.

Unsupported future versions must fail as unsupported versions. A Draft 0
reader must not attempt best-effort interpretation, preserve unknown semantic
fields as inert bags, or drop unknown nodes. Such tolerance would make a file
appear valid while changing its design.

Diagnostics should identify the offending element and attribute or child,
state the expected grammar, and distinguish syntax, semantic validation, and
resource resolution. For example, a misplaced image should say that image
paints belong directly under `fill` or `stroke`; a gradient without `kind`
should list the four accepted values; a descending stop should identify the
two offsets; an unsupported second stroke should identify the target model's
single-geometry limit; and a missing image file should report its authored
`src` rather than presenting the failure as malformed XML.

## Conformance

The normative terms in this section define Draft 0 conformance.

### Reader

A conforming reader:

1. **MUST** enforce the document envelope, version, single-container root,
   vocabulary, value grammar, attribute applicability, and child rules in
   this RFD.
2. **MUST** preserve node order, text content, and authored intent exactly at
   the semantic level, including stroke order, paint order, inactive paints,
   equal-offset stops, empty fill stacks where omission changes semantics, and
   empty strokes with non-default geometry.
3. **MUST NOT** accept an unknown construct by ignoring or coercing it.
4. **MUST** distinguish a parse failure from a resolution failure. A
   well-formed intent document can still fail to resolve in an insufficient
   environment.

### Writer

A conforming writer:

1. **MUST** emit `grida version="0"` with exactly one `container` child.
2. **MUST** emit the canonical Draft 0 node and attribute names, including
   `container`, `rect`, `ellipse`, `line`, `width`, and `height` rather than
   historical aliases.
3. **MUST** apply the canonical fill partition: omit the default, use the
   `fill` attribute for one ordinary solid, and use the `fill` element for all
   other non-empty stacks or required explicit emptiness.
4. **MUST** normalize a default empty stroke pair to omission, preserve an
   empty stroke with non-default geometry, and emit every remaining stroke in
   bottom-to-top order with its typed paints in bottom-to-top order.
5. **MUST** emit a gradient's required `kind`; it **MUST NOT** emit the four
   kind-specific gradient element names, `<shape>`, or a generic `paint`
   envelope.
6. **MUST** encode XML text and attribute values correctly and emit only
   finite, valid values.
7. **MUST NOT** serialize resolved-only values as if they were source intent.
8. **SHOULD** produce stable, human-readable indentation and stable attribute
   ordering, although neither is semantic in Draft 0.

### Resolver and renderer

A conforming resolver and renderer:

1. **MUST** resolve child coordinates in their parent's local space,
   including children of primitive elements.
2. **MUST** apply free bindings, text measurement, auto sizing, and flex
   ownership according to this RFD, including size constraints and aspect
   ratios.
3. **MUST** preserve source order in painting, with the node's fill first,
   children in document order, and repeated parent strokes from first to last.
4. **MUST** derive each stroke independently from the node's original outline
   and composite that stroke's visible paints in bottom-to-top order. It must
   not merge distinct stroke geometries into one paint stack.
5. **MUST** composite every visible paint in its declared bottom-to-top order,
   applying each paint's opacity and blend mode to that paint only.
6. **MUST** evaluate gradient geometry in the declared unit paint space and
   map it to the resolved paint box without rewriting source coordinates.
7. **MUST** resolve image identifiers through the declared resource
   environment and surface missing or undecodable resources as resolution
   failures rather than silently dropping their paint layers.
8. **MUST** include every effective stroke in resolved visual bounds without
   changing the node's layout box.
9. **MUST** apply rotation and native flips as visual-only transforms and
   apply clipping and opacity to the declared subtree.
10. **MUST NOT** mutate the source document as a side effect of resolving or
    rendering it.
11. **MUST** make the resolution environment explicit enough that a resolved
    result can be attributed to a viewport, font set, and resource set.

A processor that intentionally supports only part of Draft 0 may describe
itself as a Draft 0 subset, but it cannot claim full Draft 0 conformance and
must not silently discard the unsupported remainder.

## Deferred requirements

Draft 0 does not define paths or vector networks, per-side or variable-width
strokes, dash offset, endpoint markers, effects, scene image nodes, resource
declaration or packaging syntax, advanced image placement, image filters, rich
color spaces, rich text runs, grid layout, animation, or durable node identity.
Their eventual addition must preserve the one-tree, local-space, intent-only
model established here.

Reusable paint definitions and references are also deferred. Inline paint
values remain sufficient and canonical; a later reference system must define
identity, scope, failure behavior, and override semantics without creating a
second canonical spelling for the same inline value.

Reusable author-defined widgets/components are a required future capability.
A later version must define both component definition and use/instantiation,
including identity, scoping, overrides, and resolution behavior. Draft 0
defines neither a `component` nor a `use` element; a current-version reader
must reject both rather than inventing premature semantics.

The reserved `shape` name may support custom-shape definitions in a later
version, but Draft 0 does not decide whether it names a definition or an
instance, where definitions live, how geometry is expressed, or how reuse
works. Adding any such behavior is a versioned language change.

## Open questions before Draft 1

- Which advanced stroke geometries and effects are small enough to become
  stable source vocabulary without weakening the typed-paint model?
- How are fonts and external image resources declared or packaged so that
  resolution remains portable while relative identifiers remain authorable?
- What durable identity contract supports agent edits and component
  instances without turning transient runtime handles into file facts?
- Which resolved inspection form should accompany the intent source without
  being mistaken for it?
- Does the compound `.grida.xml` suffix remain the best long-term authored
  file identity?
