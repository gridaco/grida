---
title: "usvg Tree Notes — A Comparative Read for the svg-editor IR"
description: "What resvg's usvg IR normalises away and what an editor IR must refuse — comparative read informing the @grida/svg-editor IR proposal."
keywords:
  - svg
  - svg-editor
  - usvg
  - resvg
  - ir
  - research
tags:
  - internal
  - research
  - svg
format: md
---

# usvg Tree Notes

`usvg` (resvg's "micro SVG") is a normalized, strongly-typed SVG IR built for one purpose: making a downstream renderer's life easy. We are designing an IR for `@grida/svg-editor` with the opposite priority — faithful round-trip and editability of the author's source. This document maps what usvg actually does on the parse path, where its tree intentionally diverges from the input, and which pieces are safe to borrow versus the architectural pivot points we must not copy.

The vendored copy lives at `third_party/usvg/`. Citations below use that prefix.

## What usvg is for

usvg presents itself as a layer "between an XML library and a potential SVG rendering library" that resolves SVG complexity so a caller "can focus just on the rendering part" (`third_party/usvg/README.md:6-13`; `third_party/usvg/src/lib.rs:5-15`). The `ARCHITECTURE.md` opening states the goal as transforming "complex SVG files with mixed styles (CSS, inline attributes, style attributes) into a simplified, strongly-typed tree structure" (`third_party/usvg/ARCHITECTURE.md:9`). The closing summary is even more explicit: "all style resolution happens during XML parsing, before conversion to the final tree. This means the final tree contains only resolved, computed values, making rendering straightforward." (`third_party/usvg/ARCHITECTURE.md:664-666`). See also the "High-Level Pipeline" heading (`third_party/usvg/ARCHITECTURE.md:13`) and "Key Components" (`third_party/usvg/ARCHITECTURE.md:67`).

In one line: usvg is a **lossy compiler from authored SVG to render-ready SVG**. The author's syntactic choices are not preserved; the rendered pixel result is.

## The post-parse pipeline

The pipeline shape is `XML → roxmltree → svgtree::Document (intermediate, CSS resolved) → tree::Tree (final, all references inlined)` (`third_party/usvg/ARCHITECTURE.md:17-25`). The README's "Features" list (`third_party/usvg/README.md:14-37`) doubles as a list of normalization passes. Each pass below: what it does, what it discards. **Every one of these is a discard the editor IR must refuse.**

- **CSS cascade collapse.** `<style>` tags from anywhere in the document are collected up-front by `resolve_css` walking `xml.descendants()` (`third_party/usvg/src/parser/svgtree/parse.rs:624` referenced from `parse.rs:93`; the function body is in the architecture quote at `ARCHITECTURE.md:135-156`). Each matching rule is then written as an individual presentation attribute on the target element via `write_declaration` (`third_party/usvg/src/parser/svgtree/parse.rs:321-374`). The `style="..."` attribute is split the same way (`third_party/usvg/src/parser/svgtree/parse.rs:385-390`). **Discarded:** the `<style>` element itself, the `class` attribute (explicitly dropped at `third_party/usvg/src/parser/svgtree/parse.rs:417-419`), the `style` attribute (also dropped at `:416-417`), selector identity, specificity history, the user's CSS shorthand syntax (`font:`, `marker:` shorthands are expanded into longhand at `:326-367`).

- **Inheritance resolution.** Inheritable properties are walked up the ancestor chain; non-inheritable ones consult parent only (`third_party/usvg/ARCHITECTURE.md:366-385`). The literal value `inherit` is resolved to a copy of the ancestor's value at `parse.rs:429-431` and `:437` (`resolve_inherit`). **Discarded:** the distinction between "value inherited from ancestor" and "value explicitly set"; the `inherit` keyword itself.

- **Presentation-attribute filtering.** Non-presentation attributes parsed from CSS are dropped (`third_party/usvg/src/parser/svgtree/parse.rs:368-372` — only `aid.is_presentation()` survives). A few presentation properties are also force-dropped from element attributes when SVG only allows them via CSS, e.g. `mix-blend-mode`, `isolation`, `font-kerning` (`third_party/usvg/src/parser/svgtree/parse.rs:250-260`). **Discarded:** anything the resolver doesn't know about, including unknown-namespace attrs (the iterator only acts on attributes that map to an `AId` enum variant via `AId::from_str` at `:368`).

- **`<use>` expansion.** Resolved and inlined as a synthesized group; the referenced subtree is cloned in. The dedicated module is `third_party/usvg/src/parser/use_node.rs` (370 lines), dispatched from `converter::convert_element` (`third_party/usvg/src/parser/converter.rs:577-580`). **Discarded:** the `<use>` node, the `href`, the symbol/defs identity (the inlined copy is a fresh group; per `use_node.rs:99` the id is even cleared with `g2.id = String::new();` to "Prevent ID duplication").

- **`<symbol>` and nested `<svg>` flattening.** A nested `<svg>` is routed through `use_node::convert_svg` (`third_party/usvg/src/parser/converter.rs:623-630`); a root `<svg>`'s `viewBox`-to-size transform is baked into a wrapper group at `converter.rs:404-421`. **Discarded:** the `viewBox` as an authored property at every nesting level (it's converted to a `Transform` on a synthetic group), the `<symbol>` element identity.

- **Shapes → paths.** `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<path>` are all funneled through `shapes::convert` which returns an `Arc<tiny_skia_path::Path>` (`third_party/usvg/src/parser/shapes.rs:13-24`). The `convert_element_impl` dispatch lumps all seven primitives into the same branch (`third_party/usvg/src/parser/converter.rs:602-613`). Path-data parsing normalizes arcs, relative segments, and implicit segments away — only absolute `MoveTo`, `LineTo`, `QuadTo`, `CurveTo`, `ClosePath` survive (`third_party/usvg/src/parser/shapes.rs:26-64`; see also `README.md:19-23`). **Discarded:** element kind (`rect` vs `circle` vs `path`), the original shape parameters (`cx`/`cy`/`r`, `x`/`y`/`width`/`height`/`rx`/`ry`), the original `d` string syntax, arc commands.

- **Markers → inlined geometry.** `marker-start`/`mid`/`end` references are resolved and the marker's shapes are inlined as additional path nodes positioned along the host path (`third_party/usvg/src/parser/marker.rs:41-73`). README: "Markers will be converted into regular elements. No need to place them manually" (`third_party/usvg/README.md:34`). **Discarded:** `<marker>` element, `marker-*` attributes on the host.

- **`<switch>` resolution.** `switch::convert` picks the first child whose `requiredFeatures`/`systemLanguage` conditions pass and discards the rest (`third_party/usvg/src/parser/switch.rs:43-58`; condition check at `:61-88`). **Discarded:** the `<switch>` node and all unpicked alternatives. Note also that `requiredExtensions`-bearing elements always fail (`switch.rs:66-68`).

- **`objectBoundingBox` → `userSpaceOnUse`.** Coordinate-system attribute on paint servers, clips, masks, etc. is rewritten to user-space (README: `third_party/usvg/README.md:37`; passes in `paint_server.rs`, `clippath.rs`, `mask.rs`).

- **Unit normalization.** Relative length units (`mm`, `em`, `%`) are converted to user-space numbers using DPI / font-size from `Options` (README: `third_party/usvg/README.md:26`; module: `third_party/usvg/src/parser/units.rs`). **Discarded:** the user's chosen unit.

- **Transform attribute parsing.** Per-group `transform` is parsed via `resolve_transform` and stored as a single `tiny_skia_path::Transform` matrix on the group (`third_party/usvg/src/parser/converter.rs:741`; the `Group` struct stores both relative `transform` and the precomputed absolute `abs_transform`, see `third_party/usvg/src/tree/mod.rs:1022-1023`). **Discarded:** the user's transform-function syntax (`rotate(...)`, `scale(...)`, `translate(...)`). Reconstructible from the matrix only by guessing.

- **Group elision.** A group is only kept if "required" — i.e. has opacity ≠ 1, a clip, a mask, a filter, a non-identity transform, a non-Normal blend mode, isolation, or is itself a `<g>`/`<use>` (`third_party/usvg/src/parser/converter.rs:831-844`). Otherwise its children are spliced into the parent. **Discarded:** purely structural `<g>` wrappers that the author may have used for organization.

- **Image data resolution.** External images are loaded (or refused via `from_data_nested`), base64 is decoded (README: `third_party/usvg/README.md:27-28`; coordinator: `third_party/usvg/src/parser/image.rs`). **Discarded:** the `href` string in favor of inlined bytes.

- **Text → glyph runs (and optionally → paths).** With the `text` feature on, text elements are parsed into chunks/spans (`text::convert` at `third_party/usvg/src/parser/text.rs`, dispatched from `converter.rs:617-622`). The writer can either preserve text or flatten it to a group of paths via `text.flattened()` (`third_party/usvg/src/writer.rs:802-804`), gated by `WriteOptions::preserve_text` (`writer.rs:39-42`). **Discarded (when flattened):** the text content. Even in the preserved path, the tree models text as resolved chunks/spans, not as the original `<text>`/`<tspan>` nesting (see writer at `writer.rs:692-805` — it reconstructs `<text><tspan>` from the chunk/span model).

- **Recursive-reference removal.** Detected and stripped silently (README: `third_party/usvg/README.md:38`; e.g. marker recursion check at `third_party/usvg/src/parser/marker.rs:64-68`).

- **Element-count cap.** Hard limit of 1,000,000 elements (`third_party/usvg/src/parser/svgtree/parse.rs:392-394`; error at `third_party/usvg/src/parser/mod.rs:36-37`).

- **Per-node bounding-box precomputation.** `bounding_box`, `abs_bounding_box`, `stroke_bounding_box`, `abs_stroke_bounding_box`, `layer_bounding_box`, `abs_layer_bounding_box` are computed at parse time and cached on every group/path (`third_party/usvg/src/tree/mod.rs:1032-1038`, `:1276-1279`). Render-side win; editor-side liability (every mutation must invalidate).

The plan for the editor IR is that **none** of these passes runs. Authored CSS stays as CSS. `<use>` stays as `<use>`. A `<rect>` stays a `Rect` node with its own typed fields. Transforms stay as parsed CSS function lists, not collapsed matrices.

## The tree taxonomy

The top-level node enum is exactly four variants:

```rust
// third_party/usvg/src/tree/mod.rs:891
pub enum Node {
    Group(Box<Group>),
    Path(Box<Path>),
    Image(Box<Image>),
    Text(Box<Text>),
}
```

That's it. The seven SVG primitives (`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`) all collapse into `Node::Path` — confirmed by the dispatch at `third_party/usvg/src/parser/converter.rs:602-613` (single arm) and the shapes module dispatch at `third_party/usvg/src/parser/shapes.rs:13-24` (all seven return `Arc<tiny_skia_path::Path>`). `<svg>`, `<symbol>`, `<defs>`, `<use>`, `<switch>`, `<marker>` produce no Node variant — they are absorbed into Group nesting or inlined elsewhere.

Semantic meaning of each variant:

- **`Group`** (`third_party/usvg/src/tree/mod.rs:1020-1039`): a layer node. Carries `transform`, `abs_transform`, `opacity`, `blend_mode`, `isolate`, optional `clip_path`/`mask`, `filters`, and a `children: Vec<Node>`. Survives only if it "matters for rendering" (`converter.rs:831-844`).
- **`Path`** (`third_party/usvg/src/tree/mod.rs:1267-1280`): a drawable shape, with `data: Arc<tiny_skia_path::Path>`, optional `fill: Option<Fill>`, optional `stroke: Option<Stroke>`, `paint_order`, `rendering_mode`, plus the four bounding-box caches.
- **`Image`** (`third_party/usvg/src/tree/mod.rs:1499-1507`): a raster or nested-SVG image with `size`, `kind: ImageKind`, `rendering_mode`.
- **`Text`** (`third_party/usvg/src/tree/text.rs`; constructed at `converter.rs:617-622`): the resolved text model (chunks → spans), not the source `<text>`/`<tspan>` tree.

`Paint` is itself a small enum (`third_party/usvg/src/tree/mod.rs:754-759`):

```rust
pub enum Paint {
    Color(Color),
    LinearGradient(Arc<LinearGradient>),
    RadialGradient(Arc<RadialGradient>),
    Pattern(Arc<Pattern>),
}
```

Note the `Arc`s: paint servers are deduplicated and held by both the using `Fill`/`Stroke` and the `Tree`'s top-level vectors (`third_party/usvg/src/tree/mod.rs:1581-1588`) — they are conceptually a "defs" set, but the original `<defs>` placement and authoring is gone. The same applies to `clip_paths`, `masks`, `filters`.

**Implication for svg-editor.** A four-variant tree is a non-starter. An editor must distinguish `<rect width="10" height="10" rx="2"/>` from a `<path d="M0,0 ..."/>` because:

1. The inspector panel needs typed fields (`width`, `height`, `rx`) — not a path string.
2. Dragging a corner handle on a rectangle should change `width`, not rewrite `d`.
3. Saving must emit the element the user authored, not its path approximation.

The editor IR's `Node` enum needs at minimum one variant per source SVG element (`Rect`, `Circle`, `Ellipse`, `Line`, `Polyline`, `Polygon`, `Path`, `G`, `Use`, `Symbol`, `Defs`, `Svg`, `Text`, `Tspan`, `Image`, `ClipPath`, `Mask`, `Marker`, `Filter`, `LinearGradient`, `RadialGradient`, `Pattern`, `Style`, `Switch`, …) plus a generic "unknown element preserved verbatim" fallback. usvg gives us the opposite shape.

## Constraints usvg enforces

The usvg tree is closed under "renderable, fully resolved." A number of authored states **cannot exist** in it:

- **No `<style>` element, no `class` attribute, no `style` attribute.** Stripped during attribute appending (`third_party/usvg/src/parser/svgtree/parse.rs:417-419`). Resolution happens in `parse_svg_element` at `:377-390`. _Editor must keep the CSS source verbatim and apply it as a cascade at render time, not bake it in._
- **No `<use>`.** Always inlined by `use_node::convert` (`third_party/usvg/src/parser/use_node.rs`), called from `converter.rs:577-580`. _Editor must keep `<use>` as a typed node with a live `href` reference; mutating the referent should update all instances._
- **No `<symbol>`, no `<defs>` as authored.** Promoted to flat `Vec<Arc<…>>` collections on `Tree` (`third_party/usvg/src/tree/mod.rs:1581-1588`). _Editor must keep defs ordering, IDs, and the `<defs>`/`<symbol>` containers themselves; users address them by id from the panel._
- **No `<switch>`.** Branch is picked at parse and rest discarded (`third_party/usvg/src/parser/switch.rs:49-51`). _Editor must keep all branches; only display can choose._
- **No SMIL animation, no scripts, no events, no `<a>`, no `<view>`, no `<cursor>`.** README: "Only static SVG features … no `a`, `view`, `cursor`, `script`, no events and no animations" (`third_party/usvg/README.md:43-44`; `third_party/usvg/src/lib.rs:43-46`). These elements are filtered out at the very entry point in `converter::convert_element`: `if !tag_name.is_graphic() && !matches!(tag_name, EId::G | EId::Switch | EId::Svg) { return; }` (`third_party/usvg/src/parser/converter.rs:569-571`). _Editor must at minimum round-trip these as opaque preserved subtrees; full SMIL editing is out of scope but the elements must survive a save._
- **No `<title>`, no `<desc>`, no `<metadata>`.** Same filter at `converter.rs:569-571` — these are non-graphic and silently dropped. _Editor must preserve._
- **No unknown-namespace attributes (e.g. `inkscape:*`, `sodipodi:*`).** Only attributes that round-trip through `AId::from_str` (the strongly-typed attribute enum) are kept; everything else falls off in the iterator at `parse.rs:240-269` and `:368`. _Editor must keep unknown attributes as raw `(qname, value)` on each node for round-trip._
- **No structural-only `<g>`.** Elided when no rendering effect (`converter.rs:831-844`). _Editor must preserve every `<g>` the author wrote — they are user-meaningful layers/folders._
- **No `viewBox` as a property.** Baked into a synthetic transform (`converter.rs:404-421`). _Editor stores it as an authored attribute on the `<svg>` and on every nested `<svg>`/`<symbol>`._
- **No `objectBoundingBox` units.** Rewritten to user-space (README:37). *Editor preserves the original `*Units` attributes.\*
- **No relative length units in the tree.** `mm`/`em`/`%`/`pt` resolved to user-space (units module). _Editor stores `svgtypes::Length { number, unit }` pairs._
- **No `inherit` keyword in the tree.** Substituted with the resolved value (`parse.rs:429-431`). _Editor preserves the keyword._
- **No CSS shorthand (`font:`, `marker:`).** Expanded into longhands (`parse.rs:326-367`). _Editor preserves shorthand exactly as authored._
- **No `<style>` precedence history.** `!important` is collapsed into the final value at insertion time (`parse.rs:272-319`). The flag survives on `Attribute.important` (`ARCHITECTURE.md:416-421`), but only as the winner-flag, not the per-rule audit trail.
- **No invalid / malformed elements.** Silently dropped (README:25, e.g. invalid rect at `shapes.rs:70-83`). _Editor should keep with a parse-warning, not delete._

## The writer

`Tree::to_string(&WriteOptions)` is defined in `third_party/usvg/src/writer.rs:13-18`:

```rust
impl Tree {
    pub fn to_string(&self, opt: &WriteOptions) -> String {
        convert(self, opt)
    }
}
```

This serializes the **normalized tree**, not the original input. Concretely:

- `convert` always emits a fresh `<svg>` root with `xmlns="http://www.w3.org/2000/svg"` (`writer.rs:148-154`), regardless of the input root.
- It writes a `<defs>` block synthesized from `tree.linear_gradients/radial_gradients/patterns/clip_paths/masks/filters` (`writer.rs:157-159`).
- `write_element` (`writer.rs:650-806`) only handles the four `Node` variants. There is no code to emit `<rect>`, `<circle>`, `<line>`, `<polyline>`, `<polygon>`, `<use>`, `<symbol>`, `<switch>`, `<style>`, `<title>`, `<desc>`, `<metadata>`, or any unknown element — because those don't exist in the IR. Every shape is written as `<path d="...">` via `write_path` (`writer.rs:1193`).
- `<g>` is the only container, emitted by `write_group_element` (`writer.rs:809-897`); it writes `id`, `clip-path`, `mask`, `filter`, `opacity`, `transform`, and a `style="mix-blend-mode:...;isolation:..."` string when needed (`writer.rs:884-892`). Note the comment at `:885`: "For reasons unknown, `mix-blend-mode` and `isolation` must be written as `style` attribute" — a reverse-engineering of the cascade rules they previously erased.
- `WriteOptions::preserve_text` (`writer.rs:39-42`) gates whether `<text>` is reconstructed from the chunk/span model or flattened to a group of paths (`writer.rs:692-804`). Even with `preserve_text: true`, the output is a reconstruction from the resolved model — `xml:space="preserve"` is unconditionally added (`writer.rs:700`), every span becomes an explicit `<tspan>`, text-decoration becomes nested `<tspan>` wrappers (`writer.rs:778-790`). The original whitespace, the original `<tspan>` nesting, and any inherited text properties are lost.

**It is not a round-trip.** It is "re-emit the IR as valid SVG that renders the same." Two confirmations from the source:

1. There is no code path in `writer.rs` that consults the original XML source — `Tree` does not retain it.
2. Any input feature elided by the parser (CSS rules, `<use>`, `<symbol>`, shape-specific elements, unknown elements, comments, processing instructions, namespaces other than svg/xlink, `inkscape:*` extension data) is gone before the writer runs.

For our editor, `to_string` cannot serve as a save path. We need our own serializer that walks an IR which still has all the source structure.

## What we can borrow

Honest, file-level assessment of pieces that solve sub-problems we also have:

- **`svgtypes` crate (external).** usvg leans on `svgtypes` heavily for parsing primitives: `Length`, `Paint`, `Color`, `SimplifyingPathParser`, `PreserveAspectRatio`, `FontShorthand`, etc. (e.g. `shapes.rs:6`, `converter.rs:6`, `parse.rs:331`). Worth depending on directly — same upstream, no fork needed for parsing.
- **`simplecss` crate (external).** Selector matching that usvg drives via the `simplecss::Element` impl on its XML node (`ARCHITECTURE.md:194-223`). If our editor needs to evaluate CSS to _display_ computed styles (without baking them), this is the same library to use.
- **`tiny_skia_path::PathBuilder` / `Path`.** The actual path data structure usvg uses (`shapes.rs:7`, `tree/mod.rs:1274`). For the editor's runtime geometry — for hit testing, bbox, render preview — this is fine. It just must not be the _storage_ form of authored shapes.
- **`AId` / `EId` enums** (`third_party/usvg/src/parser/svgtree/names.rs`). Strongly-typed attribute and element names with `from_str`/`to_str`. A canonical attribute-id table the editor can reuse, especially since unknown attributes still need to round-trip as `(qname, value)` while known ones get typed handling.
- **The CSS specificity / `!important` insertion logic** (`parse.rs:272-319`). The data structure should differ for us (we don't collapse the cascade), but the precedence rules and the resolution of `inherit` are spec-faithful and worth referencing line-by-line.
- **`units.rs`** (`third_party/usvg/src/parser/units.rs`). Length → user-space conversion. Useful at _display time_ (resolve when laying out) without needing to call it at _load time_ (we keep the authored Length).
- **`paint_server.rs` / gradient + pattern attribute interpretation.** Reference for how the spec's many edge cases (default stop colors, `spreadMethod`, `gradientUnits`, `href` chaining between gradients) resolve. Even if we don't pre-resolve, the lookup logic is solid.
- **`marker.rs`** (specifically the orientation math and stroke-scale resolution at `marker.rs:96-150`-ish). Useful as a _render_ helper, not as a parse step. Editor never bakes markers into paths.
- **`switch::is_condition_passed`** (`switch.rs:61-88`) and the feature-string list (`switch.rs:9-41`). The editor will need this to _decide what to display_, while still keeping all branches in the tree.
- **Error and security limits.** The element-count cap (`parse.rs:392-394`) and the gzip-then-utf8 dispatch in `Tree::from_data` (`third_party/usvg/src/parser/mod.rs:98-107`) are sensible patterns.

## What we cannot borrow, and why

The pivot points. Each is structural, not a missing feature:

- **The `Node` enum itself** (`tree/mod.rs:891`). Four variants is one to two orders of magnitude too few. Our IR needs node-per-element with a generic fallback. Trying to layer "remember the original kind" onto usvg's `Node::Path` would be a permanent battle against the rest of the API.
- **The whole `tree/` module's "everything is pre-resolved" stance.** Absolute transforms cached at every node (`tree/mod.rs:1023`, `:1275`), bounding boxes computed at construction (`tree/mod.rs:1032-1037`, `:1276-1279`), paint servers deduplicated by `Arc::ptr_eq` (`tree/mod.rs:761-770`) — all great for a renderer, all wrong for an editor where every mutation invalidates them.
- **`<use>` expansion** (`use_node.rs`). For the editor, `<use>` is a first-class node with reference semantics. Editing the referent should update instances live; saving should emit a single `<use>`, not a duplicated subtree. usvg's pass throws away the very information we need.
- **Shape-to-path conversion** (`shapes.rs`). See the taxonomy section. We need typed shape nodes so inspector controls bind to real fields, drag handles modify real parameters, and save emits the original element.
- **CSS-to-presentation-attribute lowering** (`parse.rs:240-390`). The editor must keep `<style>` blocks, `class` lists, `style` attributes, the user's selectors, and the cascade source as data. Pre-baking the cascade means the user cannot edit their CSS.
- **`<switch>` branch selection at parse** (`switch.rs:43-58`). All branches must persist.
- **Marker inlining** (`marker.rs:41-73`). Marker references must persist; markers are reusable defs.
- **`objectBoundingBox` → `userSpaceOnUse` rewriting.** Authored units are user intent.
- **Length unit normalization** (`units.rs`). Authored units are user intent.
- **The element-name and attribute-name filter at `converter.rs:569-571`.** Non-graphic elements like `<title>`, `<desc>`, `<metadata>` are silently discarded. The editor must surface them in the hierarchy panel.
- **The attribute-name filter at `parse.rs:368` (only `AId::is_presentation()` survives from CSS) and `:240-269` (only attributes with an `AId` variant survive at all).** Unknown attributes (foreign namespaces, vendor extensions) are dropped on the floor. The editor must keep them as raw key/value to round-trip.
- **`writer.rs`.** It writes the normalized tree, which is by construction lossy. Even with `preserve_text: true`, the output diverges from the input in many small ways (added `xml:space`, reconstructed `<defs>` order, transform values re-emitted as serialized matrices, etc.). Round-trip parity requires a writer that walks an IR that still has the source structure.

In short: usvg is an excellent reference for **how SVG is supposed to mean** — the spec interpretation in `parser/` is high quality and lines up with rsvg/Chromium where checked. It is also a counter-example for **what shape an editor IR should take** — we want the union of "what usvg keeps" and "what usvg threw away," organized so that user-authored structure is the unit of storage and rendering-conveniences are computed views.
