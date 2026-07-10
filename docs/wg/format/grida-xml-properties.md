---
title: "Grida XML property registry"
description: "Cross-draft inventory of Grida XML elements, attributes, applicability, and unresolved property syntax, grounded in the production scene model."
keywords:
  - grida xml
  - property registry
  - scene language
  - xml attributes
  - vector graphics
  - layout
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

# Grida XML property registry

**Status:** Design inventory; companion to the [Grida XML Draft 0
RFD](./grida-xml).

This page is the canonical inventory of XML-facing property names and their
valid targets. It is not, by itself, a grammar extension. Only rows marked
**Draft 0** are accepted by a Draft 0 reader. **Placeholder** and **Design**
rows remain invalid until a later, versioned Grida XML specification defines
their complete syntax and semantics.

Before this registry, Grida had two related documents but no complete XML
applicability crosswalk:

- [Grida IR](./grida) inventories the production scene model.
- [Grida XML](./grida-xml) defines the small normative Draft 0 authored
  language.

This registry connects those views without making the XML spelling mirror
implementation field names.

## Grounding and precedence

This inventory was reconciled against the canonical scene model and the packed
archive contract. The scene model is the source of truth for representable
scene semantics; archive coverage separately determines what `.grida` can
persist. Differences between those contracts are recorded below rather than
being averaged into a third model.

Draft 0's repeatable stroke geometry is the one accepted extension beyond that
current production model. It reuses the existing stroke geometry plus `Paints`
pair but requires the production engine and archive to own an ordered list of
those pairs; the seam is recorded explicitly below.

Grida XML projects that model as an authored language:

1. XML uses familiar, semantic names when CSS, SVG, HTML, or Flutter already
   provide one.
2. When those vocabularies have no equivalent, an established design, motion,
   or photo-tool term is preferable to a Grida-only invention.
3. Multi-word names use kebab-case.
4. Element names carry the primary type. The bounded `gradient` family alone
   uses `kind` to select one of its structurally shared production variants; a
   generic paint or render-node `kind` does not exist.
5. Tree nesting carries parenthood and painter order; `parent`, `children`,
   and archive ordering fields are not authored properties.
6. Resolved bounds, glyph runs, vector materializations, caches, and transient
   runtime identifiers are derived data, not XML properties.
7. One meaning gets one canonical writer spelling. A compact form may own a
   deliberately disjoint canonical domain, as `fill="#RRGGBB"` does for one
   ordinary solid; it never combines with the expanded channel.

### Status key

| Status          | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| **Draft 0**     | Normative syntax accepted by the current RFD                                |
| **Placeholder** | Production concept exists; proposed XML name and target are held for design |
| **Design**      | Capability is required or plausible, but even its XML shape is unresolved   |
| **Derived**     | Runtime, archive, or resolved data that should not be authored directly     |

Placeholder rows are deliberately non-operative. A Draft 0 reader must still
diagnose them as unknown syntax.

## Element inventory

The table covers the production node set as well as XML-only source constructs.
“Children” means render-node children, not typed property children such as
`fill`, `stroke`, or gradient `stop` elements.

| XML element       | Production concept                    | Children  | Status          | Source and use                                                            |
| ----------------- | ------------------------------------- | --------- | --------------- | ------------------------------------------------------------------------- |
| `grida`           | Document envelope                     | One root  | **Draft 0**     | XML; carries only `version`                                               |
| `container`       | Container                             | Yes       | **Draft 0**     | Flutter/HTML; boxed composition and layout owner                          |
| `group`           | Group                                 | Yes       | **Draft 0**     | SVG `g`; derived bounds, no own geometry                                  |
| `rect`            | Rectangle                             | Yes       | **Draft 0**     | SVG; direct primitive                                                     |
| `ellipse`         | Ellipse, ring, or arc                 | Yes       | **Draft 0**     | SVG base primitive; arc parameters are placeholders                       |
| `line`            | Line                                  | Yes       | **Draft 0**     | SVG; stroke-only primitive with repeatable stroke geometries              |
| `text`            | Text span; later, attributed text     | No        | **Draft 0**     | SVG/HTML; nested `span` syntax is not defined                             |
| `lens`            | Source transform wrapper              | Yes       | **Draft 0**     | Grida source construct; resolves through group/transform semantics        |
| `image`           | Image node outside paint channels     | No        | **Placeholder** | HTML/SVG; contextual with the existing image-paint element                |
| `path`            | Raw, render-oriented SVG path         | Yes       | **Placeholder** | SVG; use `d`, not an implementation-shaped `data` attribute               |
| `polygon`         | Arbitrary closed polygon              | Yes       | **Placeholder** | SVG; explicit coordinate list                                             |
| `regular-polygon` | Parametric regular polygon            | Yes       | **Placeholder** | Explicit name; point-count grammar still needs validation rules           |
| `star`            | Parametric regular star polygon       | Yes       | **Placeholder** | Familiar design-tool name; inner radius and point count are parametric    |
| `vector`          | Editable vector network               | Yes       | **Design**      | No established XML vocabulary for vertices, handles, and filled regions   |
| `boolean`         | Boolean path operation                | Yes       | **Design**      | Child ownership and live-versus-flattened behavior must be fixed          |
| `markdown`        | Opaque Markdown embed                 | No        | **Design**      | Runtime feature; source escaping, resources, and security need a contract |
| `html`            | Opaque HTML/CSS embed                 | No        | **Design**      | Runtime feature; embedding HTML inside XML needs an explicit boundary     |
| `tray`            | Canvas/editor organizational tray     | Yes       | **Design**      | Production node, but not yet justified as a portable authored primitive   |
| `shape`           | Future custom-shape definition or use | Undecided | **Design**      | Reserved by the Draft 0 RFD; no current rendering semantics               |
| _none_            | Initial viewport container            | Root      | **Derived**     | The `grida` envelope and render root materialize this host boundary       |
| _none_            | Error/import placeholder              | No        | **Derived**     | Diagnostic result, never canonical authored content                       |

Attributed text should preferably remain `<text>` with familiar HTML/SVG-like
`<span>` children rather than introduce a second top-level text kind. That is
a direction, not grammar: whitespace, run boundaries, inheritance, and
per-run paint must be specified first.

## Draft 0 attribute registry

This is the compact applicability index for syntax already defined by the
[Draft 0 RFD](./grida-xml). The RFD remains normative for value grammar,
defaults, contradictions, and resolution behavior.

| Attribute                  | Valid on                                                            | Inspiration          | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| `version`                  | `grida`                                                             | XML                  | Selects the exact language version; currently exactly `0`     |
| `name`                     | All Draft 0 render elements                                         | HTML/SVG             | Human-readable label; not durable identity                    |
| `x`, `y`                   | Non-root Draft 0 render elements; omitted for in-flow flex children | SVG/CSS              | Local position binding, including start/end/center/span forms |
| `width`                    | `container`, `rect`, `ellipse`, `line`, `text`                      | CSS/SVG              | Authored width or element-specific `auto`                     |
| `height`                   | `container`, `rect`, `ellipse`, `text`; never `line`                | CSS/SVG              | Authored height or element-specific `auto`                    |
| `min-width`, `max-width`   | `container`, `rect`, `ellipse`, `line`, `text`                      | CSS                  | Width constraints                                             |
| `min-height`, `max-height` | `container`, `rect`, `ellipse`, `text`; never `line`                | CSS                  | Height constraints                                            |
| `aspect-ratio`             | `rect`, `ellipse`                                                   | CSS                  | Supplies one otherwise unresolved box axis                    |
| `rotation`                 | All Draft 0 render elements                                         | Flutter/design tools | Clockwise visual rotation in degrees                          |
| `flip-x`, `flip-y`         | All Draft 0 render elements                                         | Design tools         | Native visual reflection                                      |
| `opacity`                  | All Draft 0 render elements                                         | CSS/SVG              | Composites the node and descendants                           |
| `hidden`                   | All Draft 0 render elements                                         | HTML                 | Removes the subtree from layout and painting                  |
| `fill`                     | `container`, `rect`, `ellipse`, `text`                              | SVG                  | Canonical compact form for one ordinary solid fill            |
| `clips`                    | `container`                                                         | Flutter/design tools | Clips descendant content to the container shape               |
| `size`                     | `text`                                                              | Flutter              | Draft 0 font size; see the `font-size` naming issue below     |
| `ops`                      | `lens`                                                              | CSS/SVG              | Ordered 2D transform functions                                |
| `layout`                   | `container`                                                         | CSS                  | Selects `none` or `flex`                                      |
| `direction`                | `container` with `layout="flex"`                                    | CSS                  | Main-axis direction                                           |
| `wrap`                     | `container` with `layout="flex"`                                    | CSS                  | Enables or disables wrapping                                  |
| `gap`                      | `container` with `layout="flex"`                                    | CSS                  | Main/cross spacing                                            |
| `padding`                  | `container`                                                         | CSS/Flutter          | Insets the content box                                        |
| `main`                     | `container` with `layout="flex"`                                    | Flutter              | Main-axis distribution                                        |
| `cross`                    | `container` with `layout="flex"`                                    | Flutter              | Cross-axis alignment                                          |
| `flow`                     | Child of a flex container                                           | CSS                  | Selects in-flow or absolute participation                     |
| `grow`                     | In-flow child of a flex container                                   | CSS/Flutter          | Main-axis growth factor                                       |
| `align`                    | In-flow child of a flex container                                   | CSS/Flutter          | Per-child cross-axis override                                 |

## Scene-backed property placeholders

These tables reserve discussion slots for properties in the canonical scene
model. They do not claim the proposed XML spelling is final.

### Identity, compositing, transform, and box geometry

| Candidate XML property | Valid on                                                   | Production concept                       | Inspiration  | Status          |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------- | ------------ | --------------- |
| `id`                   | Every authored render node                                 | Durable user node identity               | HTML/SVG     | **Design**      |
| `locked`               | Every authored render node, if persisted                   | Editor lock metadata                     | Design tools | **Design**      |
| `blend-mode`           | Every compositing render node                              | Layer blend mode, including pass-through | CSS          | **Placeholder** |
| `mask-type`            | A node that acts as a mask source                          | Geometry, alpha, or luminance mask       | CSS/SVG      | **Design**      |
| `transform`            | Render nodes                                               | Post-layout 2D affine transform          | CSS/SVG      | **Design**      |
| `transform-origin`     | Boxed render nodes                                         | Post-layout transform pivot              | CSS          | **Design**      |
| `corner-radius`        | `container`, `rect`, `image`, polygonal and boolean shapes | Uniform or per-corner radius             | CSS/Flutter  | **Placeholder** |
| `corner-smoothing`     | `container`, `rect`, `image`                               | Continuous/smoothed corners              | Design tools | **Placeholder** |

`id` must map to durable authored identity, not the runtime's transient node
handle. `transform` also cannot be admitted until its relationship to native
`rotation`, `flip-x`, `flip-y`, and `lens ops` has one canonical answer.

### Primitive geometry

| Candidate XML property | Valid on                  | Value direction                                 | Inspiration          | Status          |
| ---------------------- | ------------------------- | ----------------------------------------------- | -------------------- | --------------- |
| `inner-radius`         | `ellipse`, `star`         | Normalized inner radius; exact domains differ   | Design tools         | **Placeholder** |
| `start-angle`          | `ellipse` arc/ring        | Clockwise degrees                               | Flutter/design tools | **Placeholder** |
| `sweep-angle`          | `ellipse` arc/ring        | Clockwise angular extent                        | Flutter              | **Placeholder** |
| `points`               | `polygon`                 | SVG coordinate-pair list                        | SVG                  | **Placeholder** |
| `point-count`          | `regular-polygon`, `star` | Integer count, at least three                   | Design tools         | **Placeholder** |
| `d`                    | `path`                    | SVG path-data grammar                           | SVG                  | **Placeholder** |
| `fill-rule`            | `path` and vector regions | `nonzero` or `evenodd`                          | SVG/CSS              | **Design**      |
| `operation`            | `boolean`                 | `union`, `intersection`, `difference`, or `xor` | Design tools         | **Design**      |
| `marker-start`         | `line`, `path`, `vector`  | Marker preset or future marker reference        | SVG                  | **Placeholder** |
| `marker-end`           | `line`, `path`, `vector`  | Marker preset or future marker reference        | SVG                  | **Placeholder** |

The runtime currently calls the ellipse extent `angle`; `sweep-angle` is the
clearer authored candidate because it states what the number means. Likewise,
raw path data should use SVG's established `d` rather than exposing the
runtime field name `data`.

### Scene image

| Candidate XML property  | Valid on                   | Production concept                           | Inspiration      | Status                                                       |
| ----------------------- | -------------------------- | -------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `src`                   | Scene `image`; image paint | Logical resource identifier                  | HTML/SVG         | **Placeholder** for scene image; **Draft 0** for image paint |
| `fit`                   | Scene `image`; image paint | `cover`, `contain`, `fill`, or intrinsic fit | Flutter/CSS      | **Placeholder** for scene image; **Draft 0** for image paint |
| `object-position`       | Scene `image`; image paint | Alignment inside the paint box               | CSS              | **Design**                                                   |
| `image-orientation`     | Scene `image`; image paint | Quarter-turn/orientation handling            | CSS              | **Design**                                                   |
| `image-transform`       | Image paint                | Free affine image placement                  | SVG/design tools | **Design**                                                   |
| `image-repeat`          | Image paint                | Repeat/tile behavior                         | CSS              | **Design**                                                   |
| `exposure`              | Image paint                | Image color adjustment                       | Design tools     | **Placeholder**                                              |
| `contrast`              | Image paint                | Image color adjustment                       | CSS/design tools | **Placeholder**                                              |
| `saturation`            | Image paint                | Image color adjustment                       | CSS/design tools | **Placeholder**                                              |
| `temperature`, `tint`   | Image paint                | Image color adjustment                       | Photo tools      | **Placeholder**                                              |
| `highlights`, `shadows` | Image paint                | Tonal adjustment                             | Photo tools      | **Placeholder**                                              |

Resource declaration, packaging, network policy, intrinsic size, and missing
resource behavior must be shared by scene images and image paints. The same
`src` must not acquire unrelated identity semantics merely because its
`image` appears in a different context.

## Structural property elements

Some production properties are ordered or structured values and should remain
XML children rather than become mini-languages inside attributes.

| Property element     | Valid parent                                   | Status      | Contract direction                                                                |
| -------------------- | ---------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `fill`               | `container`, `rect`, `ellipse`, `text`         | **Draft 0** | One expanded fill channel; ordered `Paints`, first bottommost                     |
| `stroke`             | `container`, `rect`, `ellipse`, `line`, `text` | **Draft 0** | Repeatable geometry owning ordered `Paints`; empty only with non-default geometry |
| `solid`              | `fill` or `stroke`                             | **Draft 0** | Typed solid paint                                                                 |
| `gradient`           | `fill` or `stroke`                             | **Draft 0** | Typed gradient family with required `kind` and `stop` children                    |
| `image`              | `fill` or `stroke`                             | **Draft 0** | Contextual image paint                                                            |
| `stop`               | `gradient`                                     | **Draft 0** | Ordered offset/color pair                                                         |
| `effects`            | Effect-capable node                            | **Design**  | Typed effect values; ordering and multiplicity are unresolved                     |
| `span`               | `text`                                         | **Design**  | Attributed run with inherited or overridden text properties                       |
| `network`            | `vector`                                       | **Design**  | Editable vertices, Bézier segments, loops, regions, and region fills              |
| `resources`          | Document-level declaration scope               | **Design**  | Portable logical IDs and packaged/external resource policy                        |
| `component`, `use`   | Document definitions and scene                 | **Design**  | Reusable authored widgets and instances                                           |
| Animation vocabulary | Document, node, or property scope              | **Design**  | Requires a dedicated timing and addressing RFD                                    |

### Paint attribute registry

These paint attributes are already normative in Draft 0. Their semantics are
defined in the [paint channels
section](./grida-xml#paint-channels-and-vocabulary).

| Attribute    | Valid on                                    | Purpose                                            |
| ------------ | ------------------------------------------- | -------------------------------------------------- |
| `visible`    | Every typed paint                           | Retains an inactive paint in its ordered stack     |
| `opacity`    | Every typed paint; also optional on `stop`  | Paint alpha, or stop alpha in `stop` context       |
| `blend-mode` | Every typed paint                           | Per-paint compositing mode                         |
| `color`      | `solid`, `stop`                             | Solid or stop color                                |
| `kind`       | `gradient`                                  | Required linear, radial, sweep, or diamond variant |
| `from`, `to` | `gradient kind="linear"`                    | Unit-paint-space endpoints                         |
| `transform`  | `gradient`                                  | Unit-paint-space affine transform                  |
| `tile-mode`  | `gradient kind="linear"` or `kind="radial"` | Sampling outside the ramp                          |
| `offset`     | `stop`                                      | Normalized ramp position                           |
| `src`        | Image paint inside `fill` or `stroke`       | Logical image resource identifier                  |
| `fit`        | Image paint inside `fill` or `stroke`       | Cover, contain, fill, or intrinsic image placement |

`opacity` is contextual: on a gradient or image it remains a floating-point
paint property, while on `solid` and `stop` it materializes through color
alpha as described by the RFD's quantization rule.

## Stroke geometry attribute registry

Each `stroke` is one geometry with direct typed paint children. An empty paint
list is valid only when at least one geometry value differs from the target's
defaults. These scoped attributes are normative in Draft 0:

| Attribute     | Value                                      | Valid targets                          | Purpose                                      |
| ------------- | ------------------------------------------ | -------------------------------------- | -------------------------------------------- |
| `width`       | non-negative finite number                 | every `stroke`                         | Uniform logical-pixel width                  |
| `align`       | `inside`, `center`, or `outside`           | every `stroke`; line must be `center`  | Placement relative to the original outline   |
| `cap`         | `butt`, `round`, or `square`               | `line`                                 | Open-contour endpoint shape                  |
| `join`        | `miter`, `round`, or `bevel`               | `container`, `rect`                    | Joined-contour corner shape                  |
| `miter-limit` | positive finite number                     | `container`, `rect`                    | Miter-to-bevel cutoff ratio                  |
| `dash-array`  | space-separated non-negative finite values | `container`, `rect`, `ellipse`, `line` | Repeating dash-gap lengths in logical pixels |

The production model already separates one stroke `Paints` stack from one
stroke geometry. One XML `stroke`, using only attributes supported by its
target, projects that pair directly. A default empty pair canonicalizes to
omission; non-default empty geometry remains explicit. Repeatable `stroke`
elements are an accepted extension to an ordered list of those pairs; the
current production model still needs that multiplicity before it can
materialize more than one without loss.

### Deferred stroke geometry

| Candidate XML property | Valid on                                    | Production concept                           | Status          |
| ---------------------- | ------------------------------------------- | -------------------------------------------- | --------------- |
| Per-side width grammar | `container`, `rect`, and future image boxes | Rectangular stroke widths                    | **Design**      |
| Width-profile grammar  | Future `vector`                             | Ordered normalized-position/half-width stops | **Design**      |
| `dash-offset`          | `stroke`                                    | Phase offset into the dash cycle             | **Design**      |
| `marker-start`         | Open path-like stroke geometry              | Endpoint marker preset or reference          | **Placeholder** |
| `marker-end`           | Open path-like stroke geometry              | Endpoint marker preset or reference          | **Placeholder** |

Per-side widths and variable-width profiles need nested or shorthand grammar
of their own; neither should be forced into an opaque comma-separated
attribute merely to make it look CSS-like.

## Text property placeholders

Uniform text maps naturally to CSS names. Rich text should use the same names
on future `span` children, with inheritance and override rules defined once.

| Candidate XML property      | Valid on       | Production concept                        | Inspiration | Status          |
| --------------------------- | -------------- | ----------------------------------------- | ----------- | --------------- |
| `font-family`               | `text`, `span` | Font family                               | CSS         | **Placeholder** |
| `font-size`                 | `text`, `span` | Font size                                 | CSS/SVG     | **Design**      |
| `font-weight`               | `text`, `span` | Font weight                               | CSS         | **Placeholder** |
| `font-stretch`              | `text`, `span` | Font width                                | CSS         | **Placeholder** |
| `font-style`                | `text`, `span` | Normal or italic style                    | CSS         | **Placeholder** |
| `font-kerning`              | `text`, `span` | Kerning switch                            | CSS         | **Placeholder** |
| `font-optical-sizing`       | `text`, `span` | Optical sizing mode                       | CSS         | **Placeholder** |
| `font-feature-settings`     | `text`, `span` | OpenType feature-tag values               | CSS         | **Design**      |
| `font-variation-settings`   | `text`, `span` | Variable-font axis values                 | CSS         | **Design**      |
| `letter-spacing`            | `text`, `span` | Letter spacing                            | CSS         | **Placeholder** |
| `word-spacing`              | `text`, `span` | Word spacing                              | CSS         | **Placeholder** |
| `line-height`               | `text`, `span` | Fixed or proportional line height         | CSS         | **Placeholder** |
| `text-transform`            | `text`, `span` | Case transformation                       | CSS         | **Placeholder** |
| `text-align`                | `text`         | Horizontal paragraph alignment            | CSS         | **Placeholder** |
| `text-align-vertical`       | Boxed `text`   | Top, center, or bottom placement          | Flutter     | **Placeholder** |
| `max-lines`                 | `text`         | Paragraph line clamp                      | Flutter     | **Placeholder** |
| `text-overflow`             | `text`         | Clip, ellipsis, or authored marker string | CSS/Flutter | **Design**      |
| `text-decoration-line`      | `text`, `span` | Underline, overline, or line-through      | CSS         | **Placeholder** |
| `text-decoration-style`     | `text`, `span` | Solid, double, dotted, dashed, or wavy    | CSS         | **Placeholder** |
| `text-decoration-color`     | `text`, `span` | Decoration color override                 | CSS         | **Placeholder** |
| `text-decoration-thickness` | `text`, `span` | Decoration thickness                      | CSS         | **Placeholder** |
| `text-decoration-skip-ink`  | `text`, `span` | Glyph-ink skipping                        | CSS         | **Placeholder** |

Draft 0 currently calls font size `size`. Before typography is expanded, the
RFD must either rename it to the more established `font-size` in a versioned
change or explicitly defend `size` as the sole canonical spelling. Accepting
both indefinitely would violate the one-spelling rule.

CSS `vertical-align` is intentionally not proposed for paragraph-box vertical
placement: its web meaning concerns inline/baseline alignment. Flutter's
`textAlignVertical` is the closer semantic precedent.

## Effect placeholders

The canonical scene model includes one layer blur, one backdrop blur, one
liquid-glass effect, multiple shadows, and multiple noise effects. Candidate
typed names are familiar, but the container grammar is not yet decided.

| Candidate typed effect | Core properties                                       | Inspiration        | Status     |
| ---------------------- | ----------------------------------------------------- | ------------------ | ---------- |
| `blur`                 | `radius`; progressive form also needs start/end radii | CSS/Flutter        | **Design** |
| `backdrop-blur`        | `radius` or progressive blur parameters               | CSS/Flutter        | **Design** |
| `drop-shadow`          | `x`, `y`, `blur`, `spread`, `color`, `visible`        | CSS/SVG            | **Design** |
| `inner-shadow`         | `x`, `y`, `blur`, `spread`, `color`, `visible`        | CSS/design tools   | **Design** |
| `noise`                | size, density, octaves, seed, coloring, blend mode    | Motion/photo tools | **Design** |
| `liquid-glass`         | light, refraction, depth, dispersion, blur parameters | Design tools       | **Design** |

An ordered `<effects>` list would be ergonomic, but the production model is
not a single ordered heterogeneous list. The XML must not imply reorderable
effect semantics until either the existing slots and lists receive a defined
cross-type order or the engine model deliberately changes.

## Syntax that needs dedicated design

These are not ordinary missing attributes. Each needs a focused RFD because
its structure, identity, or evaluation rules cannot be made reliable by
choosing a name alone.

| Area                          | Production requirement                                    | Questions the syntax must answer                                                    |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Editable vector network       | Vertices, cubic tangents, segments, loops, filled regions | Stable local IDs or indices; open/closed contours; region fill stacks; validation   |
| Variable-width stroke         | Ordered `(u, half-width)` samples                         | Nested stops versus compact list; interpolation; endpoints; base-width interaction  |
| Per-side box geometry         | Four stroke widths and four elliptical corner radii       | CSS shorthand reuse versus explicit children; normalization; mixed units            |
| Attributed text               | Text plus styled byte ranges and per-run paints           | `<span>` nesting; Unicode offsets; whitespace; inheritance; overlapping runs        |
| Masks                         | Geometry, alpha, and luminance mask nodes                 | Which sibling is the mask; scope; consumption; stacking; clipping interaction       |
| Effects                       | Typed singleton and repeated effect slots                 | Cross-type order; multiplicity; compositing bounds; visibility and blend metadata   |
| Image resources and placement | Logical IDs, hashes, fit, affine placement, tiling        | Packaging; base URI; network policy; intrinsic size; missing-resource behavior      |
| Boolean operations            | Live child geometry and operation enum                    | Ordered operands; child ownership; nesting; flattening; paint inheritance           |
| Transform model               | Native rotation, affine transforms, origin, source lens   | One canonical authored form; layout-versus-paint transform; decomposition stability |
| Components and reuse          | Definitions, instances, overrides, identity               | Definition scope; `use`; slots; overrides; cycles; resource and animation binding   |
| Animation                     | Time-varying values and motion-graphics behavior          | Addressing, interpolation, timelines, expressions, easing, events, serialization    |
| Embedded Markdown/HTML        | Opaque render-only content                                | Escaping, sanitization, fonts/resources, intrinsic sizing, deterministic rendering  |
| Durable identity              | Stable user IDs distinct from runtime handles             | Uniqueness scope; copy/paste; merge; references; agent-generated IDs                |

The vector-network and width-profile grammars are the clearest examples of
where new syntax must be invented. Treating either as a JSON-shaped `data`
attribute would hide structure, weaken diagnostics, and make hand or LLM
authoring less reliable.

## Current scene-contract seams to reconcile

This registry does not itself change the canonical scene or archive contracts.
The following seams constrain conformance or require the explicit extension
named by the Draft 0 RFD:

| Seam                                                                                                         | Why it matters to Grida XML                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The current scene contract stores one stroke geometry with one ordered `Paints`, while Draft 0 repeats them. | One stroke maps directly; multiple strokes require an ordered list and must not be merged or hidden as duplicate scene nodes.                               |
| The scene model can hold malformed gradients that Draft 0 deliberately cannot spell.                         | A writer rejects too few stops, invalid or descending offsets, and coincident linear endpoints instead of repairing, sorting, clamping, or perturbing them. |
| Scene semantics and packed-archive coverage do not yet cover the same node set.                              | An authored element must not promise `.grida` round-trip until both contracts represent it.                                                                 |
| Raw-path fill rules and post-layout transform origins are not uniform across scene and archive contracts.    | `fill-rule`, `transform`, and `transform-origin` remain deferred until one meaning survives both rendering and persistence.                                 |
| Draft 0 `hidden` removes a subtree from layout and paint.                                                    | A materializer must preserve that stronger behavior even when a target model names visibility differently.                                                  |
| Solid-paint alpha is stored in color, while Draft 0 exposes common paint `opacity`.                          | The documented 8-bit quantization is a boundary rule, not a parallel solid-opacity property.                                                                |
| Draft 0 uses `size` for text while established style vocabularies use `font-size`.                           | The language must choose one canonical spelling before expanding typography.                                                                                |
| Responsive bindings and per-child alignment carry more source intent than a resolved Cartesian scene.        | A resolved scene can consume their result but must not be mistaken for a lossless rewrite of the authored source.                                           |
| Names, locks, durable identity, guides, and connections belong to different persistence concerns.            | `id`, `name`, and `locked` need explicit authored-versus-editor rules; a root fill already covers visual background without deciding editor-only metadata.  |
| `lens` operations and native flips may lower through more general transforms.                                | Materialization can preserve pixels without promising a lossless inverse decomposition; source round-trip requires an intent-preserving representation.     |

When the language, runtime, and archive disagree, a processor must limit its
claimed subset or make the model change explicit. It must never create a
parallel XML-only property merely to conceal the incompatibility.
