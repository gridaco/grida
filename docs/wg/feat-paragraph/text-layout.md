---
title: Universal Shaped Text Layout
description: "Open RFD for one versioned text-resolution contract shared by measurement, painting, hit testing, editing, and export."
keywords:
  - text layout
  - text shaping
  - typography
  - glyph runs
  - line breaking
  - rich text
tags:
  - internal
  - wg
  - typography
  - text
  - fonts
  - layout
format: md
---

# Universal Shaped Text Layout

**Status:** Open RFD.

## Thesis

Text resolution must happen once.

Attributed Unicode text, paragraph intent, box constraints, an explicit font
and language environment, and a text-oracle version resolve to one immutable
text-layout artifact. Measurement, painting, hit testing, editing geometry,
damage calculation, and faithful export all consume that same artifact. None
of those consumers may independently estimate widths, choose line breaks,
select fallback fonts, or reshape the text.

This is the **single text-resolution contract**:

```text
attributed text
+ paragraph properties
+ box constraints
+ explicit resolution environment
+ text-oracle version
    -> resolved text layout | typed resolution failure
```

The contract does not require every host to use one global typography
implementation forever. It requires every resolved result to identify the
oracle and environment that produced it, and every consumer of that result to
agree on its geometry.

## Problem

Text is not a sequence of independently sized characters. Font selection,
shaping, bidirectional ordering, glyph substitution, cluster formation, line
breaking, alignment, and truncation jointly determine its geometry. A width
estimate made before shaping is therefore not a weaker version of the final
answer; it may be a different answer.

If measurement and painting resolve text separately, they can disagree on:

- which font renders a source range;
- how source characters combine into glyphs and clusters;
- glyph advances and offsets;
- legal break opportunities and final line breaks;
- line metrics and baseline positions;
- the width and height reported to surrounding layout;
- caret stops, hit results, and selection geometry;
- truncation and the placement of an ellipsis or other marker;
- logical bounds versus the bounds of visible ink.

These disagreements compound. A different measured width changes a parent
layout; that new layout changes wrapping; the new wrapping changes height,
paint bounds, hit testing, and export. The system must remove the split at its
source rather than make each downstream consumer imitate the others.

## Meaning of universal

“Universal” describes **consumption**, not unlimited feature support.

- One resolved artifact is universal across all geometry-sensitive consumers
  of one text node.
- The contract is independent of a particular scene language, renderer,
  operating system, or programming language.
- Script, writing-mode, feature, and font coverage may grow by oracle version.
  Unsupported input fails explicitly; it does not receive approximate layout.
- A different constraint, font manifest, language policy, or oracle version
  produces a different resolution. It is not another view of the old result.

Universal does not mean that rasterized pixels must be identical across every
graphics backend. It means the selected fonts, glyphs, positions, lines,
baselines, mappings, and base bounds are already fixed before rasterization.

## Vocabulary

| Term                       | Meaning                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Source text**            | The exact Unicode content presented to resolution, addressed by UTF-8 byte offsets at Unicode-scalar boundaries.               |
| **Shaping text**           | The derived character sequence presented to shaping after any explicit source transformation, with a mapping back to source.   |
| **Attributed text**        | Source text plus complete, non-overlapping style coverage and stable associations to any paint-only run data.                  |
| **Paragraph intent**       | Direction, writing mode, alignment, spacing, wrapping, line limit, truncation, and other line-level choices.                   |
| **Resolution environment** | The complete external facts needed to resolve text, including exact font resources, fallback policy, language data, and scale. |
| **Text oracle**            | The versioned shaping, segmentation, bidirectional, breaking, metrics, and numeric policy that turns the inputs into geometry. |
| **Shaping cluster**        | A unit emitted by shaping that relates a shaping-text range to zero or more positioned glyphs and back to authored source.     |
| **Caret stop**             | A legal editing boundary with a visual position and affinity; it is not assumed to exist at every UTF-8 or glyph boundary.     |
| **Logical bounds**         | Typographic layout extents, including advances and line boxes even where no ink is drawn.                                      |
| **Ink bounds**             | The tight base drawing extents of resolved glyphs and layout-owned marks before node paints, strokes, filters, or effects.     |
| **Resolved text layout**   | The immutable, inspectable result described by this RFD.                                                                       |

A grapheme cluster, a shaping cluster, a glyph, and a caret stop are distinct
concepts. They often align for simple Latin text and often do not align for
ligatures, combining sequences, emoji sequences, or complex scripts. The
resolved artifact must not collapse them into one index space.

## Input contract

Resolution begins only after authoring syntax has been parsed and defaults
have been made complete. An authoring format may expose a compact subset of
these inputs, but it must not make omitted values depend on undeclared host
state.

### Attributed source

The attributed source supplies:

1. the exact source string;
2. complete style coverage of that string;
3. character-boundary run ranges in UTF-8 byte coordinates; and
4. any explicit language, script, direction, or shaping overrides attached to
   those ranges.

For non-empty text, style ranges are ordered, contiguous, non-overlapping, and
cover the complete source string. An empty string carries a complete default
style without inventing a source character.

Layout-affecting style includes at least the requested font families or faces,
size, weight, width, posture, variable axes, OpenType features, optical sizing,
letter spacing, word spacing, baseline shift, and language or script hints
when exposed. Paint-only values may remain associated with source ranges, but
they do not change shaping or invalidate layout unless their semantics alter
geometry.

Authored source is not Unicode-normalized by default. If a source feature
transforms text before shaping—for example case transformation—the
transformation policy is an explicit input and the result retains a complete
mapping back to the original UTF-8 source ranges.

### Paragraph intent

Paragraph intent is complete before resolution. It includes, when supported:

- base direction and writing mode;
- horizontal and vertical alignment within the assigned box;
- line-height policy and paragraph spacing;
- soft-wrap and legal-break policy;
- tab and whitespace handling;
- locale-sensitive line or word breaking;
- hyphenation policy and dictionary identity;
- a maximum line count; and
- overflow and truncation-marker policy.

Explicit source line breaks are source content. A soft break chosen by the
oracle is derived geometry. The result distinguishes the two.

### Box constraints

Constraints describe the available inline and block extents in logical units.
Each axis may be unconstrained, exact, or bounded by a finite minimum and
maximum. Values are finite and non-negative, and minima do not exceed maxima.

The constraint input and the final assigned text box are both retained in the
result. The assigned box is distinct from the logical content bounds and ink
bounds. Fixed block extent alone does not imply clipping, truncation, or an
ellipsis; those are explicit paragraph policies.

### Resolution environment

The environment is a manifest, not an ambient promise. It identifies every
external fact capable of changing layout:

| Environment part  | Required identity                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Font resources    | Exact content identity, face index for collections, declared family metadata, and availability state.                       |
| Font selection    | Ordered candidates, family and fallback rules, synthesis policy, and permitted missing-glyph behavior.                      |
| Language services | Unicode, bidirectional, segmentation, and line-breaking data versions, plus locale and hyphenation resources when relevant. |
| Coordinate policy | Logical-unit scale and any text scale applied before layout. Device-pixel rounding is not part of text resolution.          |
| Safety limits     | Declared bounds on input length, glyph count, line count, or work, when a host imposes them.                                |

A family name, file name, URL, or operating-system font handle is not a
sufficient font identity. The same name may resolve to different bytes. A
portable result identifies the exact font content and face used, together with
the effective variation coordinates, features, and any declared synthesis.

There is no silent “system fallback.” A host may offer system fonts, but their
resolved identities and order become part of the environment before a result
is considered complete.

### Text-oracle version

The oracle version identifies the complete geometry-producing policy:
shaping, bidirectional resolution, cluster construction, line breaking,
alignment, truncation, font-metric interpretation, and numeric behavior.

Any change that can alter a glyph choice, glyph position, line, baseline,
mapping, or reported bound requires a new oracle version. Changing font bytes
or a hyphenation dictionary changes the environment identity instead; changing
how the oracle interprets those resources changes the oracle version.

The resolved result records both identities. “Latest” is not a valid durable
oracle version.

## Resolution rules

### Source preservation and preprocessing

Resolution never rewrites authored text. Any transformed shaping text is a
derived sequence in its own character coordinate space, with a complete,
possibly many-to-many mapping back to source UTF-8 ranges.
Controls that draw no glyph, explicit line terminators, and characters hidden
by truncation still retain source mappings.

Every source-backed layout unit is traceable to one or more complete source
scalar ranges. Synthetic units such as an inserted hyphen or truncation marker
have no source byte range and instead record the source boundary and policy
that introduced them. A synthetic unit must never masquerade as authored
content during copy, editing, or accessibility traversal.

### Font selection and shaping

Font fallback is resolved at the smallest source unit the oracle can shape
correctly; it is not required to follow authored run boundaries. A paint-only
run boundary may remain transparent to shaping only when every resulting
cluster still has unambiguous paint ownership. Otherwise that boundary is a
declared shaping boundary. This boundary policy is part of the oracle version
and its cache identity; it cannot vary between measurement and painting.

Each shaped run records the exact resolved face and shaping state. Glyph
identifiers are meaningful only together with that face identity. Consumers
must not reinterpret glyph identifiers against another version of a font.

The oracle preserves fractional advances and offsets in logical units. Pixel
snapping and raster-device hinting may affect final coverage, but they do not
change the resolved line breaks, caret geometry, or base bounds.

### Line construction

Lines are ordered in block progression. Within a line, visual glyph order may
differ from logical source order. The result therefore records both orders
rather than assuming source byte offsets increase from left to right.

Each line identifies:

- the source ranges it covers, including any consumed line terminator;
- whether its end is explicit, soft, terminal, or truncated;
- its origin, baseline, ascent, descent, leading, advance, and line box;
- the ordered shaped runs and clusters it displays; and
- its logical and ink bounds.

Every non-truncated paragraph has exactly one terminal line. An empty source
therefore resolves to one empty terminal line carrying the default style's
line metrics without inventing a source character. When the source ends in an
explicit line terminator, the preceding line ends explicitly and the empty
line after it is terminal. A terminal line is distinct from both a soft break
and an explicit break.

Trailing whitespace, zero-ink controls, and explicit terminators may affect
logical coverage or caret placement without contributing ink. They remain
represented.

### Truncation

Truncation occurs only when paragraph intent requests it. A line limit or box
extent does not silently select a marker policy.

When truncation is active, the marker is shaped in the same explicit
environment and participates in fitting the final visible line. The result
records:

- that truncation occurred;
- every omitted source range;
- the source boundary to which the marker is anchored;
- the marker's shaped glyphs, font identity, clusters, and bounds; and
- caret and hit behavior at the truncation boundary.

The marker is synthetic: copying the visible result does not insert it into
source text unless a separate conversion explicitly asks for that behavior.
The artifact must not assume omitted content is always one logical suffix;
bidirectional presentation can make the visual omission more complex.

### Coordinates

All geometry is expressed in the text node's local logical coordinate space.
The inline and block axes, line progression, and baseline direction are
explicit. Fractional values are preserved. A parent transform maps the
resolved local artifact into scene or device space; it does not cause text to
be reshaped.

## Resolved artifact

The resolved text layout is immutable and self-identifying. At minimum it
contains the following information.

### Resolution identity

- a fingerprint of every layout-affecting input;
- the exact constraint input and final assigned text box;
- the resolution-environment identity;
- the text-oracle version; and
- a record of fallback, synthesis, transformation, and replacement decisions
  exercised during resolution.

### Paragraphs and lines

- paragraph boundaries and base-direction results;
- lines in block order;
- line origins, baselines, metrics, advances, and break kinds;
- logical and ink bounds per line; and
- alignment and vertical-placement results.

### Shaped font and glyph runs

- exact font-content and face identity;
- effective size, axes, features, synthesis, script, language, and direction;
- glyph identifiers in paint order;
- per-glyph positions, advances, offsets, and base ink bounds; and
- stable associations back to effective source style and paint selection.

### Clusters and UTF-8 mapping

- each cluster's shaping-text range, mapped source UTF-8 ranges, or explicit
  synthetic status;
- the glyph span, line, direction, advance, and logical bounds for that
  cluster;
- mappings from every source scalar boundary to its cluster and line;
- mappings from every glyph and cluster back to source ranges;
- legal caret stops, positions, visual order, and upstream/downstream
  affinity; and
- enough geometry to derive discontiguous selection regions in bidirectional
  text.

An offset inside a multi-byte UTF-8 scalar is invalid input to source-mapping
queries; it is not rounded silently. A source range that produces no glyph
still maps to a line and editing boundary where the text policy permits one.

### Bounds

The artifact keeps three extents separate:

| Extent                 | Meaning                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Assigned text box      | The box obtained from authored size intent and constraints; surrounding box layout uses this extent.                     |
| Logical content bounds | The union of typographic line boxes and advances, including layout space without glyph ink.                              |
| Base ink bounds        | The union of glyph, truncation-marker, inserted-hyphen, and layout-owned decoration ink before external paint expansion. |

Node strokes, shadows, filters, and other paint effects expand visual bounds
after text resolution. They must use the artifact's base geometry and must not
feed altered measurements back into shaping. Color-glyph intrinsic drawing
bounds are base ink; device antialiasing fringe is not.

### Completeness invariants

A complete result satisfies all of these conditions:

1. Every visible glyph belongs to exactly one shaped run, line, and cluster.
2. Every source scalar range has a defined source-to-layout disposition:
   visible, zero-ink control, explicit break, transformed, or omitted by an
   explicit policy.
3. Non-synthetic clusters cover the represented shaping text without
   accidental gaps or overlap. Their authored-source mapping may be
   many-to-many only when an explicit transformation requires it; synthetic
   clusters are labeled separately.
4. Font identity and effective shaping state are complete for every glyph.
5. Line, cluster, caret, logical-bound, and ink-bound geometry share one local
   coordinate space.
6. The environment and oracle recorded by the artifact are exactly those used
   to produce it.
7. No resource remains pending and no fallback decision remains implicit.

## One result, many consumers

The resolved artifact is the authority for every geometry-sensitive use:

| Consumer              | Required projection of the one result                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Surrounding layout    | Uses the assigned box and logical metrics; it does not estimate character widths.                                                          |
| Painting              | Uses the recorded faces, glyphs, positions, lines, and layout-owned marks; it does not reshape or rebreak.                                 |
| Hit testing           | Uses line, cluster, and caret geometry, including visual order and affinity.                                                               |
| Editing and selection | Uses UTF-8 mappings and legal caret stops; it does not infer positions from glyph count or code-point count.                               |
| Bounds and damage     | Starts from base ink bounds and applies known paint expansion; it does not substitute the assigned box for ink.                            |
| Faithful export       | Preserves recorded line breaks and glyph placement, embedding the resolved fonts or outlining when the target cannot express them exactly. |

Measurement is therefore a query over the resolved artifact, not a parallel
text operation. Likewise, painting is a realization of already resolved
glyph geometry, not a second chance to select fonts or line breaks.

An export whose purpose is semantic reflow may intentionally resolve the
source again under a target environment. That is a conversion with a new
resolution identity, not faithful consumption of the existing result.

## Determinism, versioning, and caching

For the same canonical layout-affecting inputs, environment identity, safety
limits, and oracle version, resolution produces the same semantic artifact.
This includes font choices, glyphs, line breaks, positions, mappings, and
bounds under the oracle's declared numeric policy.

Determinism does not extend across undeclared system fonts, mutable font URLs,
different font bytes with the same family name, different Unicode or
hyphenation data, or different oracle versions. Those are different inputs.

Every cache key must account for every fact capable of changing layout,
including:

- source bytes and all layout-affecting attributes;
- paragraph intent and constraints;
- exact font-content identities and fallback order;
- language, segmentation, breaking, and hyphenation data identities;
- text scale and numeric policy; and
- oracle version and declared safety limits.

Paint-only changes need not invalidate the geometry artifact. A cache that
also stores painted output must key that output on the paint state separately.
The arrival or replacement of a font resource creates a new environment
identity and a new resolved artifact; a supposedly immutable result is never
patched in place by a late font swap.

Incremental resolution and internal cache reuse are permitted only when the
published artifact is equivalent to a complete fresh resolution under the
same identity. Partial internal state is not a second public layout contract.

## Validation and failure behavior

The resolver returns either one complete artifact or a typed failure. It does
not return plausible metrics with unresolved glyphs and let painting silently
choose a different answer later.

### Input validation failures

These include:

- malformed UTF-8 or a range boundary inside a UTF-8 scalar;
- style ranges that overlap, leave gaps, reverse, or exceed the source;
- incomplete layout-affecting style or paragraph state;
- non-finite or contradictory constraints;
- invalid font sizes, spacing, line limits, feature tags, or variation values;
  and
- a requested policy not supported by the selected oracle version.

### Resolution failures

These include:

- a required font resource that is missing, pending, or has a different
  content identity;
- no permitted face for a source cluster;
- no permitted glyph fallback for a cluster;
- missing language, segmentation, or hyphenation resources required by the
  declared policy;
- an unsupported script, writing mode, or shaping feature; and
- an exceeded declared safety limit.

Diagnostics identify the source byte range and relevant style or paragraph
property, state the failed policy, and name the resource identities or
candidates involved. A missing-font diagnostic reports the requested family
and resolved resource identity rather than presenting the failure as malformed
source text.

The default portable policy is strict: absent fonts and unresolved glyph
coverage fail resolution. An environment may explicitly permit a particular
missing-glyph face or replacement policy. If so, that policy and the exact
replacement face become inputs, and the resulting replacement clusters remain
fully represented. Silent tofu, silent font substitution, and silent feature
dropping are never conforming behavior.

An interactive host may display an explicitly diagnostic placeholder while a
resource loads. That placeholder is not a resolved text-layout artifact and
must not be cached, measured, exported, or presented as the final result.

## Defaults

Defaults at this boundary are deliberately independent of ambient platform
state:

| Input                   | Default                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Unicode normalization   | None; preserve the authored sequence.                                                           |
| Source language         | Undetermined (`und`) unless declared; no host locale is inferred.                               |
| Base direction          | Automatic from content, with left-to-right for a paragraph containing no strong character.      |
| Writing mode            | Horizontal lines progressing top to bottom.                                                     |
| Inline alignment        | Start.                                                                                          |
| Soft wrapping           | Enabled at legal opportunities when the inline axis has a finite limit; otherwise no soft wrap. |
| Line height             | Normal font-metric line height under the selected oracle version.                               |
| Maximum lines           | Unbounded.                                                                                      |
| Truncation              | None.                                                                                           |
| Missing fonts or glyphs | Strict resolution failure.                                                                      |
| Device-pixel rounding   | None in the resolved artifact.                                                                  |

There is no universal default font face, font size, or fallback list in this
RFD. The authoring language or enclosing document model supplies a complete
default style, and the resolution environment supplies exact font resources.
For example, Grida XML owns its own authored typography defaults; this RFD
owns what happens after those defaults become complete inputs.

## Conformance

### Resolver

A conforming resolver:

1. **MUST** validate attributed source, paragraph intent, constraints,
   environment completeness, and oracle support before claiming a result.
2. **MUST** resolve font choice, shaping, clusters, bidirectional order, line
   breaks, baselines, alignment, and requested truncation exactly once into a
   complete immutable artifact.
3. **MUST** retain exact font identities, source mappings, logical and visual
   order, and the three distinct bound classes.
4. **MUST** preserve fractional logical geometry and keep device rounding out
   of the result.
5. **MUST** expose the exact environment identity and oracle version used.
6. **MUST NOT** silently substitute resources, drop shaping requests, repair
   invalid ranges, or publish a partial artifact as complete.

### Consumer

A conforming geometry-sensitive consumer:

1. **MUST** use the resolved artifact for measurements, glyph placement,
   lines, hit testing, and source mapping relevant to its task.
2. **MUST NOT** independently shape, wrap, select fallback fonts, or infer
   caret positions for the same resolution.
3. **MUST** request a new resolution when layout-affecting source,
   constraints, environment, or oracle version changes.
4. **MUST** treat semantic reflow under another target as a new resolution,
   not as faithful rendering of the old artifact.

## Relationship to authored formats

This RFD owns shaped text resolution. An authored format owns its source
syntax, defaulting rules, and mapping into the inputs above.

[Grida XML](../format/grida-xml) stores Unicode content, flat attributed
`tspan` runs, and text-box intent. Its format defaults and supported or future
paragraph attributes project into paragraph intent. It does not serialize
glyph identifiers, fallback choices, line breaks chosen by the oracle,
baselines, caret positions, or measured bounds. Those are derived output.

The relationship is one-way:

```text
authored Grida XML text
    -> attributed source + paragraph intent + constraints
    -> universal shaped text resolution
    -> immutable resolved text layout
```

Writing a resolved artifact back into `.grida.xml` as if it were source intent
would destroy responsiveness and bind the document to one font environment.
A separate inspection or cache representation may persist the artifact only
if it preserves its resolution identity and never claims to be canonical
authored source.

## Non-goals

- Defining Grida XML's `text` or `tspan` syntax. The XML RFD owns that grammar.
- Changing the scene paint model or introducing a text-specific paint model.
- Defining font discovery, distribution, networking, licensing, or packaging.
  The resolution environment identifies fonts after those concerns resolve.
- Requiring identical raster coverage across graphics backends.
- Persisting glyph positions as canonical authored document state.
- Defining arbitrary scene nodes or widgets embedded inside text. A future
  inline-object model must extend the input and artifact explicitly.
- Defining editor commands, selection policy, or accessibility semantics. The
  artifact supplies source and geometry mappings those systems may consume.
- Claiming every oracle version supports every script, writing mode, text-on-a
  path behavior, or typographic feature. Unsupported input fails explicitly.

## Considered alternatives

1. **One versioned resolved artifact — accepted.** It makes the actual shaping
   result inspectable and gives every consumer the same lines, glyph geometry,
   font choices, mappings, and bounds.
2. **Fast approximate measurement followed by real shaping during paint —
   rejected.** The approximation can choose a different box and different
   lines, so every later correction occurs after surrounding layout has
   already consumed the wrong geometry.
3. **Let each consumer call the same shaping service independently —
   rejected.** Equal algorithms are insufficient when constraints, font
   availability, resource timing, defaults, or versions differ. It also turns
   caret and export drift into cache-coordination problems.
4. **Make the renderer's native paragraph object the contract — rejected.**
   An opaque backend result does not guarantee inspectable UTF-8 mappings,
   stable font identity, complete logical and ink bounds, or portability to a
   second renderer and exporter.
5. **Persist resolved glyphs and lines in authored source — rejected.** It
   would freeze one environment's output into responsive intent, duplicate the
   source string's authority, and create conflicting canonical
   representations.
6. **Use ambient operating-system text layout as the environment — rejected.**
   Font aliases, fallback sets, language data, and versions vary across hosts.
   Ambient behavior can participate only after it is resolved into an explicit
   environment identity.
