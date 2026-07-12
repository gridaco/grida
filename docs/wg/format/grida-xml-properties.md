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

Later-version reuse vocabulary is specified by the [modules and static
component reuse](./grida-xml-modules), [component
parameters](./grida-xml-component-parameters), and [component
slots](./grida-xml-component-slots) RFDs. Those rows remain **Design** until
their language versions are accepted; Draft 0 continues to reject them.

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

For paths, the existing contracts do not present one uniform model: one form
stores raw coordinates and derives intrinsic geometry, while another defines a
canonical shape mapped into a layout box. Draft 0 selects the latter and fixes
its reference rectangle to `0 0 1 1`. This is an explicit compatibility choice,
not an attempt to average the two forms or hide a raw-path conversion behind
XML-only state.

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
| **Design**      | Selected or unresolved later-version design; not operative Draft 0 syntax   |
| **Derived**     | Runtime, archive, or resolved data that should not be authored directly     |

Placeholder rows are deliberately non-operative. A Draft 0 reader must still
diagnose them as unknown syntax.

## Element inventory

The table covers the production node set as well as XML-only source constructs.
“Children” means render-node children, not typed property children such as
`fill`, `stroke`, or gradient `stop` elements. “Assigned” means Version 3
direct render roots projected to a component declaration rather than ordinary
children owned by `use`. `tspan` and `slot` are listed explicitly as contextual
source constructs even though neither is a scene node.

| XML element       | Production concept                    | Children  | Status          | Source and use                                                              |
| ----------------- | ------------------------------------- | --------- | --------------- | --------------------------------------------------------------------------- |
| `grida`           | Document envelope                     | One root  | **Draft 0**     | XML; carries only `version`                                                 |
| `component`       | Boxed source definition               | Yes       | **Design**      | Top-level, non-painting definition with `container` semantics               |
| `use`             | Source component instance             | Assigned  | **Design**      | Versioned component reference; Version 3 may carry direct assignment roots  |
| `prop`            | Component scalar declaration          | No        | **Design**      | Leading contextual child of a Version 2 `component`; never renders          |
| `arg`             | Component scalar argument             | No        | **Design**      | Contextual property child of a Version 2 `use`; never a render child        |
| `slot`            | Component insertion marker            | No        | **Design**      | Empty named Version 3 declaration at a render-child position; never renders |
| `container`       | Container                             | Yes       | **Draft 0**     | Flutter/HTML; boxed composition and layout owner                            |
| `group`           | Group                                 | Yes       | **Draft 0**     | SVG `g`; derived bounds, no own geometry                                    |
| `rect`            | Rectangle                             | Yes       | **Draft 0**     | SVG; direct primitive                                                       |
| `ellipse`         | Ellipse, ring, or arc                 | Yes       | **Draft 0**     | SVG base primitive; arc parameters are placeholders                         |
| `line`            | Line                                  | Yes       | **Draft 0**     | SVG; stroke-only primitive with repeatable stroke geometries                |
| `text`            | Text or attributed-text node          | No        | **Draft 0**     | Owns one text box, paragraph/default style, and node paints                 |
| `tspan`           | `StyledTextRun`                       | No        | **Draft 0**     | Flat direct child of `text`; contextual run, never a scene node             |
| `lens`            | Source transform wrapper              | Yes       | **Draft 0**     | Grida source construct; resolves through group/transform semantics          |
| `image`           | Image node outside paint channels     | No        | **Placeholder** | HTML/SVG; contextual with the existing image-paint element                  |
| `path`            | Box-mapped unit-space path            | Yes       | **Draft 0**     | Full SVG path-data grammar in the fixed `0 0 1 1` reference rectangle       |
| `polygon`         | Arbitrary closed polygon              | Yes       | **Placeholder** | SVG; explicit coordinate list                                               |
| `regular-polygon` | Parametric regular polygon            | Yes       | **Placeholder** | Explicit name; point-count grammar still needs validation rules             |
| `star`            | Parametric regular star polygon       | Yes       | **Placeholder** | Familiar design-tool name; inner radius and point count are parametric      |
| `vector`          | Editable vector network               | Yes       | **Design**      | No established XML vocabulary for vertices, handles, and filled regions     |
| `boolean`         | Boolean path operation                | Yes       | **Design**      | Child ownership and live-versus-flattened behavior must be fixed            |
| `markdown`        | Opaque Markdown embed                 | No        | **Design**      | Runtime feature; source escaping, resources, and security need a contract   |
| `html`            | Opaque HTML/CSS embed                 | No        | **Design**      | Runtime feature; embedding HTML inside XML needs an explicit boundary       |
| `tray`            | Canvas/editor organizational tray     | Yes       | **Design**      | Production node, but not yet justified as a portable authored primitive     |
| `shape`           | Future custom-shape definition or use | Undecided | **Design**      | Reserved by the Draft 0 RFD; no current rendering semantics                 |
| _none_            | Initial viewport container            | Root      | **Derived**     | The `grida` envelope and render root materialize this host boundary         |
| _none_            | Error/import placeholder              | No        | **Derived**     | Diagnostic result, never canonical authored content                         |

Attributed text remains one `<text>` node with direct, flat `<tspan>` children.
`tspan` contains exact character data plus an optional literal-first `fill`
property; it has no scene identity, box, transform, opacity, layout, or render
children. `<span>` is not an alias and a reader must never support both
spellings.

## Draft 0 attribute registry

This is the compact applicability index for syntax already defined by the
[Draft 0 RFD](./grida-xml). The RFD remains normative for value grammar,
defaults, contradictions, and resolution behavior.

| Attribute                  | Valid on                                                           | Inspiration          | Purpose                                                    |
| -------------------------- | ------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------- |
| `version`                  | `grida`                                                            | XML                  | Selects the exact language version; currently exactly `0`  |
| `name`                     | All Draft 0 render elements                                        | HTML/SVG             | Human-readable label; not durable identity                 |
| `x`, `y`                   | Draft 0 render elements; omitted for in-flow flex children         | SVG/CSS              | Start/end/center/span binding; root target is the viewport |
| `width`                    | `container`, `rect`, `ellipse`, `line`, `path`, `text`             | CSS/SVG              | Authored width or element-specific `auto`                  |
| `height`                   | `container`, `rect`, `ellipse`, `path`, `text`; never `line`       | CSS/SVG              | Authored height or element-specific `auto`                 |
| `min-width`, `max-width`   | `container`, `rect`, `ellipse`, `line`, `path`, `text`             | CSS                  | Width constraints                                          |
| `min-height`, `max-height` | `container`, `rect`, `ellipse`, `path`, `text`; never `line`       | CSS                  | Height constraints                                         |
| `aspect-ratio`             | `rect`, `ellipse`, `path`                                          | CSS                  | Supplies one otherwise unresolved box axis                 |
| `corner-radius`            | `container`, `rect`                                                | CSS/Flutter          | One or four circular or elliptical corner radii            |
| `corner-smoothing`         | `container`, `rect`                                                | Design tools         | Continuous smoothing of circular rounded corners           |
| `rotation`                 | All Draft 0 render elements                                        | Flutter/design tools | Clockwise visual rotation in degrees                       |
| `flip-x`, `flip-y`         | All Draft 0 render elements                                        | Design tools         | Native visual reflection                                   |
| `opacity`                  | All Draft 0 render elements                                        | CSS/SVG              | Composites the node and descendants                        |
| `hidden`                   | All Draft 0 render elements                                        | HTML                 | Removes the subtree from layout and painting               |
| `fill`                     | `container`, `rect`, `ellipse`, `path`, `text`; contextual `tspan` | SVG                  | One-solid node fill or explicit run-fill override          |
| `d`                        | `path`                                                             | SVG                  | Complete path-data grammar in the fixed unit rectangle     |
| `fill-rule`                | `path`                                                             | SVG/CSS              | `nonzero` or `evenodd`; defaults to `nonzero`              |
| `clips`                    | `container`                                                        | Flutter/design tools | Clips descendant content to the container shape            |
| `font-size`                | `text`, `tspan`                                                    | CSS/SVG              | Positive finite logical-pixel default or run override      |
| `font-weight`              | `text`, `tspan`                                                    | CSS                  | Integer weight from 1 through 1000                         |
| `font-style`               | `text`, `tspan`                                                    | CSS                  | `normal` or `italic`                                       |
| `ops`                      | `lens`                                                             | CSS/SVG              | Ordered 2D transform functions                             |
| `layout`                   | `container`                                                        | CSS                  | Selects `none` or `flex`                                   |
| `direction`                | `container` with `layout="flex"`                                   | CSS                  | Main-axis direction                                        |
| `wrap`                     | `container` with `layout="flex"`                                   | CSS                  | Enables or disables wrapping                               |
| `gap`                      | `container` with `layout="flex"`                                   | CSS                  | Main/cross spacing                                         |
| `padding`                  | `container`                                                        | CSS/Flutter          | Insets the content box                                     |
| `main`                     | `container` with `layout="flex"`                                   | Flutter              | Main-axis distribution                                     |
| `cross`                    | `container` with `layout="flex"`                                   | Flutter              | Cross-axis alignment                                       |
| `flow`                     | Child of a flex container                                          | CSS                  | Selects in-flow or absolute participation                  |
| `grow`                     | In-flow child of a flex container                                  | CSS/Flutter          | Main-axis growth factor                                    |
| `align`                    | In-flow child of a flex container                                  | CSS/Flutter          | Per-child cross-axis override                              |

`font-size`, `font-weight`, and `font-style` default on `text` to `16`, `400`,
and `normal`. The same attributes on `tspan` override the owning `text`
default for that run; omission inherits from `text`, never a preceding run.
`size` and a generic `style` attribute are not Grida XML spellings.

The [rounded box geometry contract](./grida-xml#rounded-box-geometry) defines
the exact grammar. In registry form, `corner-radius` is one or exactly four
non-negative finite horizontal radii, optionally followed by `/` and an
independent one-or-four-value vertical list. Four-value order is top-left,
top-right, bottom-right, bottom-left. `corner-smoothing` is finite in `[0, 1]`.
Both attributes default to zero and apply only to `container` and `rect`.

The canonical writer shortens an all-equal axis list to one value, otherwise
emits all four; it omits the slash when every horizontal and vertical radius
pair is equal. It omits zero defaults, but preserves nonzero smoothing with
zero radii as dormant intent. Oversized ordinary radii use one edge-sum-based
proportional factor; nonzero smoothing uses the production profile's
per-corner half-short-side cap. Neither resolved form is rewritten in source.

For `path`, `d` is required and uses the complete SVG path-data grammar in a
fixed `0 0 1 1` reference rectangle. Validation is against exact tight curve
geometry, which must stay within the closed unit box. The geometry maps
nonuniformly to the resolved declared box before fill and stroke construction;
it is never measured or tight-fitted. `fill-rule` defaults to `nonzero` and
also accepts `evenodd`. Paints use the full resolved box, children remain
box-local and unclipped, and the default fill is black. Path strokes accept
only scalar width; center is the default and is required whenever any contour
is open. Resolution maps the command stream once; bounds and all paint channels
consume that exact mapped geometry. Numeric unrepresentability is a resolution
failure, never permission to clamp, substitute the declared box, or retain
partial path ink.

## Proposed later-version module vocabulary

The [module and component RFD](./grida-xml-modules) proposes this source-only
vocabulary. These rows are not operative Draft 0 grammar.

| Element or attribute    | Valid on                | Proposed contract                                                               |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `component`             | Direct child of `grida` | Non-painting boxed definition with the ordinary `container` grammar             |
| `id`                    | `component`             | Unique lowercase kebab-case export symbol in that source unit                   |
| `use`                   | Render-child position   | One source instance materialized as the referenced ordinary container subtree   |
| `href`                  | `use`                   | Required local or source-relative reference with a component-ID fragment        |
| `name`                  | `use`                   | Optional human-readable instance label; not definition or durable node identity |
| `x`, `y`                | `use` in free placement | Non-span parent-relative binding of the component container                     |
| `flow`, `grow`, `align` | `use` under flex layout | Flex participation of the component container                                   |
| `hidden`                | `use`                   | Instance gate that removes that use from layout and paint when true             |

Component definitions precede an optional one-container scene root. A source
may therefore be a component library, a render entry, or both. Every component
reference requires an explicit fragment, including local references such as
`href="#button"`; there is no default component export or implicit scene-root
export in the proposal.

`use` intentionally does not accept width, height, paints, opacity, transforms,
or arbitrary component properties in the static Draft 1 proposal. The boxed
definition owns those values. The [component-parameter
RFD](./grida-xml-component-parameters) proposes intentional scalar
customization through `prop`/`arg` in Version 2; Version 1 continues to reject
them.

### Proposed Version 2 scalar parameter vocabulary

These rows summarize the [component-parameter
RFD](./grida-xml-component-parameters). They remain non-operative design
syntax until accepted and implemented.

| Element or form      | Valid on or in                                | Proposed contract                                                   |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `prop`               | Leading direct child of Version 2 `component` | Empty typed scalar declaration; no layout or painter position       |
| `name`               | `prop`, `arg`                                 | Lowercase kebab-case component-local API member name                |
| `type`               | `prop`                                        | Required closed scalar category                                     |
| `default`            | `prop`                                        | Optional definition-owned literal; omission makes the prop required |
| `values`             | `prop type="enum"`                            | Required non-empty set of accepted enum tokens                      |
| `arg`                | Direct child of Version 2 `use`               | Empty explicit argument; still not a render child                   |
| `value`              | `arg`                                         | Required literal or exact outer-prop forwarding binding             |
| `{prop-name}`        | Compatible established scalar value position  | Complete-value binding; attributes do not support interpolation     |
| Text binding segment | Direct `text` or `tspan` character content    | Inserts one string value as characters without reparsing            |

Version 2 defines no universal null, expression language, or parameterized
attribute presence. A use may contain `arg` property children but still may
not contain render children. Version 3 projection is specified separately and
does not backport slot declarations, assignment attributes, or render children
into Version 2.

### Proposed Version 3 named slot vocabulary

These rows summarize the [component-slot RFD](./grida-xml-component-slots).
They remain non-operative design syntax until accepted as a stable language
version.

| Element or form     | Valid on or in                                      | Proposed contract                                                            |
| ------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<slot>`            | Render-child position in a Version 3 component      | Empty named projection marker; no layout or painter position                 |
| `name`              | `<slot>`                                            | Required unique component-local lowercase kebab-case slot name               |
| Assignment root     | Direct render child of Version 3 `use` after `arg*` | Caller-authored ordinary root projected at the named marker                  |
| `slot` relationship | Direct assignment root only                         | Required declared target name; consumed by projection and never materialized |

The `slot` assignment relationship is contextual source metadata, not an
ordinary render property. It is invalid on a node outside the direct
assignment position, is absent from the Draft 0 attribute registry, and never
appears in the ordinary materialized scene. Version 3 has no wrapper,
unnamed/default slot, fallback, requiredness, or explicit-empty form. Versions
0, 1, and 2 continue to reject all slot syntax.

## Scene-backed property placeholders

These tables reserve discussion slots for properties in the canonical scene
model. They do not claim the proposed XML spelling is final.

### Identity, compositing, transform, and box geometry

| Candidate XML property | Valid on                                 | Production concept                       | Inspiration  | Status          |
| ---------------------- | ---------------------------------------- | ---------------------------------------- | ------------ | --------------- |
| `id`                   | Every authored render node               | Durable user node identity               | HTML/SVG     | **Design**      |
| `locked`               | Every authored render node, if persisted | Editor lock metadata                     | Design tools | **Design**      |
| `blend-mode`           | Every compositing render node            | Layer blend mode, including pass-through | CSS          | **Placeholder** |
| `mask-type`            | A node that acts as a mask source        | Geometry, alpha, or luminance mask       | CSS/SVG      | **Design**      |
| `transform`            | Render nodes                             | Post-layout 2D affine transform          | CSS/SVG      | **Design**      |
| `transform-origin`     | Boxed render nodes                       | Post-layout transform pivot              | CSS          | **Design**      |

`id` must map to durable authored identity, not the runtime's transient node
handle. `transform` also cannot be admitted until its relationship to native
`rotation`, `flip-x`, `flip-y`, and `lens ops` has one canonical answer.
The proposed `id` on top-level `component` is a separate module-local export
symbol; it does not make `id` valid on render nodes or settle durable node and
instance identity.

### Primitive geometry

| Candidate XML property | Valid on                  | Value direction                                 | Inspiration          | Status          |
| ---------------------- | ------------------------- | ----------------------------------------------- | -------------------- | --------------- |
| `inner-radius`         | `ellipse`, `star`         | Normalized inner radius; exact domains differ   | Design tools         | **Placeholder** |
| `start-angle`          | `ellipse` arc/ring        | Clockwise degrees                               | Flutter/design tools | **Placeholder** |
| `sweep-angle`          | `ellipse` arc/ring        | Clockwise angular extent                        | Flutter              | **Placeholder** |
| `points`               | `polygon`                 | SVG coordinate-pair list                        | SVG                  | **Placeholder** |
| `point-count`          | `regular-polygon`, `star` | Integer count, at least three                   | Design tools         | **Placeholder** |
| `view-box`             | `path`                    | Optional stable non-unit reference rectangle    | SVG                  | **Design**      |
| `fill-rule`            | Future vector regions     | `nonzero` or `evenodd`                          | SVG/CSS              | **Design**      |
| `operation`            | `boolean`                 | `union`, `intersection`, `difference`, or `xor` | Design tools         | **Design**      |
| `marker-start`         | `line`, `path`, `vector`  | Marker preset or future marker reference        | SVG                  | **Placeholder** |
| `marker-end`           | `line`, `path`, `vector`  | Marker preset or future marker reference        | SVG                  | **Placeholder** |

The runtime currently calls the ellipse extent `angle`; `sweep-angle` is the
clearer authored candidate because it states what the number means. Draft 0
already uses SVG's established `d` name for box-mapped path commands rather
than exposing a storage-oriented `data` name.

`view-box` remains deferred. If introduced, it would let imported coordinates
retain a stable non-unit reference rectangle, but that rectangle must be
authored intent with positive extents and must never be re-derived from path
tight bounds after an edit. Its omission, canonical writer behavior, and
interaction with the fixed unit form need one versioned rule before the
attribute can be accepted.

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

| Property element     | Valid parent                                            | Status      | Contract direction                                                                |
| -------------------- | ------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `fill`               | `container`, `rect`, `ellipse`, `path`, `text`, `tspan` | **Draft 0** | Expanded ordered `Paints`; singular and literal-first when under `tspan`          |
| `stroke`             | `container`, `rect`, `ellipse`, `line`, `path`, `text`  | **Draft 0** | Repeatable geometry owning ordered `Paints`; empty only with non-default geometry |
| `solid`              | `fill` or `stroke`                                      | **Draft 0** | Typed solid paint                                                                 |
| `gradient`           | `fill` or `stroke`                                      | **Draft 0** | Typed gradient family with required `kind` and `stop` children                    |
| `image`              | `fill` or `stroke`                                      | **Draft 0** | Contextual image paint                                                            |
| `stop`               | `gradient`                                              | **Draft 0** | Ordered offset/color pair                                                         |
| `effects`            | Effect-capable node                                     | **Design**  | Typed effect values; ordering and multiplicity are unresolved                     |
| `tspan`              | `text`                                                  | **Draft 0** | Flat contextual run with exact non-empty character data and explicit overrides    |
| `network`            | `vector`                                                | **Design**  | Editable vertices, Bézier segments, loops, regions, and region fills              |
| `resources`          | Document-level declaration scope                        | **Design**  | Portable logical IDs and packaged/external resource policy                        |
| `component`          | Direct child of a later-version `grida` envelope        | **Design**  | Named, non-painting boxed definition with ordinary `container` semantics          |
| `use`                | Render-child position in a later-version source         | **Design**  | Source-relative component-ID instance; no independent paint wrapper               |
| `prop`, `arg`        | Version 2 component definition and use                  | **Design**  | Proposed typed scalar API; complete contract lives in the parameter RFD           |
| `slot`               | Render-child position inside a Version 3 component      | **Design**  | Empty named projection marker; complete contract lives in the component-slot RFD  |
| Animation vocabulary | Document, node, or property scope                       | **Design**  | Requires a dedicated timing and addressing RFD                                    |

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

| Attribute     | Value                                      | Valid targets                                    | Purpose                                      |
| ------------- | ------------------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| `width`       | one or exactly four non-negative numbers   | every `stroke`; four only on `container`, `rect` | Uniform or top-right-bottom-left width       |
| `align`       | `inside`, `center`, or `outside`           | every `stroke`; open geometry must be `center`   | Placement relative to the original outline   |
| `cap`         | `butt`, `round`, or `square`               | `line`, `path`                                   | Open-contour endpoint shape                  |
| `join`        | `miter`, `round`, or `bevel`               | `container`, `rect`, `path`                      | Joined-contour corner shape                  |
| `miter-limit` | positive finite number                     | `container`, `rect`, `path`                      | Miter-to-bevel cutoff ratio                  |
| `dash-array`  | space-separated non-negative finite values | `container`, `rect`, `ellipse`, `line`, `path`   | Repeating dash-gap lengths in logical pixels |

The production model already separates one stroke `Paints` stack from one
stroke geometry. One XML `stroke`, using only attributes supported by its
target, projects that pair directly. A default empty pair canonicalizes to
omission; non-default empty geometry remains explicit. Repeatable `stroke`
elements are an accepted extension to an ordered list of those pairs; the
current production model still needs that multiplicity before it can
materialize more than one without loss.

### Per-side width grammar

One `width` number selects uniform stroke width. Exactly four numbers select
rectangular widths in top, right, bottom, left order and are valid only for a
`container` or `rect`. Two- and three-number expansion, commas, units, negative
values, and non-finite values are invalid. The omitted default is uniform `1`.

Four equal positive values normalize to the uniform state; four zeros and a
scalar zero normalize to the no-width state. A canonical writer omits uniform
`1`, uses one number for every other uniform or no-width state, and writes all
four values only when they differ. Applicability is validated before this
normalization, so four values remain invalid on an ellipse, line, path, or
text even when equal.

The four local-side widths produce one outer-minus-inner coverage ring with one
shared ordered paint stack. `inside`, `center`, and `outside` use outward and
inward fractions `(0, 1)`, `(1/2, 1/2)`, and `(1, 0)`, respectively. Each
corner's outer radius adds the outward fraction of its adjacent horizontal and
vertical widths; its inner radius subtracts the inward fractions and clamps
each result to zero. A zero or negative inner-box extent makes the inner
contour empty, saturating coverage to the outer contour without rewriting
source widths.

Ordinary circular and elliptical corner radii and continuous `dash-array`
traversal remain valid. A zero-width side has no coverage but still advances
the dash metric. Per-side widths currently require zero corner smoothing,
`join="miter"`, and `miter-limit="4"`; other combinations are rejected rather
than accepted as state the rectangular renderer cannot honor.

### Deferred stroke geometry

| Candidate XML property | Valid on                       | Production concept                           | Status          |
| ---------------------- | ------------------------------ | -------------------------------------------- | --------------- |
| Width-profile grammar  | Future `vector`                | Ordered normalized-position/half-width stops | **Design**      |
| `dash-offset`          | `stroke`                       | Phase offset into the dash cycle             | **Design**      |
| `marker-start`         | Open path-like stroke geometry | Endpoint marker preset or reference          | **Placeholder** |
| `marker-end`           | Open path-like stroke geometry | Endpoint marker preset or reference          | **Placeholder** |

Variable-width profiles need structured grammar of their own and should not be
forced into an opaque comma-separated attribute merely to look CSS-like.

## Text attributes and property placeholders

`text` owns the paragraph, default text style, and node paints. A direct,
flat `tspan` is only a contextual run and inherits every omitted run property
from the owning `text`, not from its preceding sibling. Draft 0 uses explicit
kebab-case attributes and defines no `style` mini-language.

This registry inventories authored XML properties only. The [Universal Shaped
Text Layout](../feat-paragraph/text-layout) RFD owns their eventual shaping,
font resolution, line construction, UTF-8 mapping, metrics, and resolved
bounds; adding a property here must project into that one resolution contract,
not create a second measurement or rendering path.

| Candidate XML property      | Valid on        | Production concept                        | Inspiration | Status          |
| --------------------------- | --------------- | ----------------------------------------- | ----------- | --------------- |
| `font-family`               | `text`, `tspan` | Font family                               | CSS         | **Placeholder** |
| `font-size`                 | `text`, `tspan` | Positive finite font size                 | CSS/SVG     | **Draft 0**     |
| `font-weight`               | `text`, `tspan` | Integer weight from 1 through 1000        | CSS         | **Draft 0**     |
| `font-stretch`              | `text`, `tspan` | Font width                                | CSS         | **Placeholder** |
| `font-style`                | `text`, `tspan` | `normal` or `italic`                      | CSS         | **Draft 0**     |
| `font-kerning`              | `text`, `tspan` | Kerning switch                            | CSS         | **Placeholder** |
| `font-optical-sizing`       | `text`, `tspan` | Optical sizing mode                       | CSS         | **Placeholder** |
| `font-feature-settings`     | `text`, `tspan` | OpenType feature-tag values               | CSS         | **Design**      |
| `font-variation-settings`   | `text`, `tspan` | Variable-font axis values                 | CSS         | **Design**      |
| `letter-spacing`            | `text`, `tspan` | Letter spacing                            | CSS         | **Placeholder** |
| `word-spacing`              | `text`, `tspan` | Word spacing                              | CSS         | **Placeholder** |
| `line-height`               | `text`, `tspan` | Fixed or proportional line height         | CSS         | **Placeholder** |
| `text-transform`            | `text`, `tspan` | Case transformation                       | CSS         | **Placeholder** |
| `text-align`                | `text`          | Horizontal paragraph alignment            | CSS         | **Placeholder** |
| `text-align-vertical`       | Boxed `text`    | Top, center, or bottom placement          | Flutter     | **Placeholder** |
| `max-lines`                 | `text`          | Paragraph line clamp                      | Flutter     | **Placeholder** |
| `text-overflow`             | `text`          | Clip, ellipsis, or authored marker string | CSS/Flutter | **Design**      |
| `text-decoration-line`      | `text`, `tspan` | Underline, overline, or line-through      | CSS         | **Placeholder** |
| `text-decoration-style`     | `text`, `tspan` | Solid, double, dotted, dashed, or wavy    | CSS         | **Placeholder** |
| `text-decoration-color`     | `text`, `tspan` | Decoration color override                 | CSS         | **Placeholder** |
| `text-decoration-thickness` | `text`, `tspan` | Decoration thickness                      | CSS         | **Placeholder** |
| `text-decoration-skip-ink`  | `text`, `tspan` | Glyph-ink skipping                        | CSS         | **Placeholder** |

The Draft 0 defaults are `font-size="16"`, `font-weight="400"`, and
`font-style="normal"`. `size` is invalid and is never accepted alongside or
as an alias for `font-size`; a canonical writer omits all three defaults on
`text`. Every other style row above remains unknown syntax until its status
advances; production defaults supply those unexposed `TextStyleRec` fields
during materialization.

Character data and direct `tspan` data concatenate in document order into one
production `AttributedString`. Run boundaries are derived as UTF-8 byte
offsets; authors do not spell them. Runs cover the entire string contiguously
and merge when complete style and paint-override state match. Empty `tspan` is
invalid, while an empty `text` uses the production `0..0` default-run special
case.

Run fills project `StyledTextRun.fills` rather than a parallel color field.
Omitted run fill maps to `None` and node-fill fallback. The `fill` attribute
maps to an explicit one-solid stack. A singular literal-first `<fill>` child
uses the existing ordered paint grammar; `<fill/>` maps to an explicit empty
stack, and non-empty typed children remain bottom-to-top. Attribute and child
are mutually exclusive. Gradient and image coordinates use the resolved full
text-node paint box, never a per-`tspan` fragment box.

HTML tags (`b`, `strong`, `i`, `em`, and similar), `<span>`, and SVG `tspan`
positioning are intentionally not aliases. The production run model contains
visual style, not the semantic/accessibility annotation needed to preserve
HTML meaning, and Grida run geometry does not independently position chunks.

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

| Area                          | Production requirement                                       | Questions the syntax must answer                                                    |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Editable vector network       | Vertices, cubic tangents, segments, loops, filled regions    | Stable local IDs or indices; open/closed contours; region fill stacks; validation   |
| Non-unit path reference box   | Stable authored coordinate rectangle                         | Optional syntax; positive extents; normalization; canonical writer behavior         |
| Variable-width stroke         | Ordered `(u, half-width)` samples                            | Nested stops versus compact list; interpolation; endpoints; base-width interaction  |
| Run strokes                   | Per-run stroke paints, width, and alignment                  | Reconcile singular production geometry with repeatable XML stroke topology          |
| Masks                         | Geometry, alpha, and luminance mask nodes                    | Which sibling is the mask; scope; consumption; stacking; clipping interaction       |
| Effects                       | Typed singleton and repeated effect slots                    | Cross-type order; multiplicity; compositing bounds; visibility and blend metadata   |
| Image resources and placement | Logical IDs, hashes, fit, affine placement, tiling           | Packaging; base URI; network policy; intrinsic size; missing-resource behavior      |
| Boolean operations            | Live child geometry and operation enum                       | Ordered operands; child ownership; nesting; flattening; paint inheritance           |
| Transform model               | Native rotation, affine transforms, origin, source lens      | One canonical authored form; layout-versus-paint transform; decomposition stability |
| Components and reuse          | Named definitions, `use`, scalar props, and named projection | Durable use/member identity; deep overrides; archive persistence; animation binding |
| Animation                     | Time-varying values and motion-graphics behavior             | Addressing, interpolation, timelines, expressions, easing, events, serialization    |
| Embedded Markdown/HTML        | Opaque render-only content                                   | Escaping, sanitization, fonts/resources, intrinsic sizing, deterministic rendering  |
| Durable identity              | Stable user IDs distinct from runtime handles                | Uniqueness scope; copy/paste; merge; references; agent-generated IDs                |

The vector-network and width-profile grammars are the clearest examples of
where new syntax must be invented. Treating either as a JSON-shaped `data`
attribute would hide structure, weaken diagnostics, and make hand or LLM
authoring less reliable.

## Current scene-contract seams to reconcile

This registry does not itself change the canonical scene or archive contracts.
The following seams constrain conformance or require the explicit extension
named by the Draft 0 RFD:

| Seam                                                                                                         | Why it matters to Grida XML                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The current scene contract stores one stroke geometry with one ordered `Paints`, while Draft 0 repeats them. | One stroke maps directly; multiple strokes require an ordered list and must not be merged or hidden as duplicate scene nodes.                                 |
| The durable stroke-width boundary collapses four equal sides to a uniform or no-width state.                 | Draft 0 uses the same normalization and never emits an all-equal four-value canonical form.                                                                   |
| Production per-side coverage ignores corner smoothing and non-miter join choice.                             | Draft 0 rejects nonzero smoothing, round or bevel joins, and non-default miter limits on a per-side stroke rather than preserving lossy state.                |
| Production smooth corners circularize elliptical radius pairs.                                               | Draft 0 rejects nonzero smoothing when any `rx` and `ry` differ; smoothed ellipses remain unavailable pending lossless renderer support.                      |
| Production smooth paths begin dash traversal at the top-edge midpoint.                                       | Draft 0 consistently begins every rectangle at the top-left curve's top-edge join; geometry is identical, but dashed smoothed strokes have a different phase. |
| The scene model can hold malformed gradients that Draft 0 deliberately cannot spell.                         | A writer rejects too few stops, invalid or descending offsets, and coincident linear endpoints instead of repairing, sorting, clamping, or perturbing them.   |
| Scene semantics and packed-archive coverage do not yet cover the same node set.                              | An authored element must not promise `.grida` round-trip until both contracts represent it.                                                                   |
| Scene and archive contracts expose both raw intrinsic paths and normalized box-mapped paths.                 | Draft 0 selects the box-mapped form; a raw-only target must gain a stable mapping or reject `path` rather than claim lossy support.                           |
| One durable canonical-shape contract permits non-unit path data to be scaled to its tight fit.               | Draft 0 deliberately rejects that fallback: non-unit geometry is invalid, and no reader may erase padding or remap untouched contours by auto-fitting it.     |
| Path fill-rule persistence is not uniform across scene and archive contracts.                                | Draft 0 requires `nonzero` and `evenodd` to survive reading, rendering, inspection, and rewriting; hard-coding one rule is not conforming.                    |
| Draft 0 `hidden` removes a subtree from layout and paint.                                                    | A materializer must preserve that stronger behavior even when a target model names visibility differently.                                                    |
| Solid-paint alpha is stored in color, while Draft 0 exposes common paint `opacity`.                          | The documented 8-bit quantization is a boundary rule, not a parallel solid-opacity property.                                                                  |
| Production `AttributedString` stores flat contiguous UTF-8 byte ranges.                                      | XML concatenates mixed text in document order and derives ranges at character boundaries; authored offsets and nested runs are neither needed nor accepted.   |
| The packed archive collapses an empty run-fill vector to an absent override.                                 | Draft 0 distinguishes explicit `<fill/>` no ink from omitted node-fill fallback; packing must reject it or preserve presence before claiming round-trip.      |
| Production attributed paint currently resolves run fills against `(width, width)`.                           | Draft 0 requires the resolved full text-node width and height, matching node fills; the square paint box is an implementation bug, not XML semantics.         |
| `StyledTextRun` has one optional stroke stack plus one width and alignment.                                  | It cannot losslessly project repeatable independent XML stroke geometries, so Draft 0 rejects run strokes rather than merging or hiding them.                 |
| Production attributed runs carry visual style but no semantic/accessibility annotation.                      | Draft 0 rejects HTML semantic tags instead of pretending bold or italic styling preserves their meaning.                                                      |
| Responsive bindings and per-child alignment carry more source intent than a resolved Cartesian scene.        | A resolved scene can consume their result but must not be mistaken for a lossless rewrite of the authored source.                                             |
| Names, locks, durable identity, guides, and connections belong to different persistence concerns.            | `id`, `name`, and `locked` need explicit authored-versus-editor rules; a root fill already covers visual background without deciding editor-only metadata.    |
| `lens` operations and native flips may lower through more general transforms.                                | Materialization can preserve pixels without promising a lossless inverse decomposition; source round-trip requires an intent-preserving representation.       |

When the language, runtime, and archive disagree, a processor must limit its
claimed subset or make the model change explicit. It must never create a
parallel XML-only property merely to conceal the incompatibility.
