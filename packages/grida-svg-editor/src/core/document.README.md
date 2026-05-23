# SVG Document Layer

The **SVG-spec respecting, surgical update machine.**

This document describes the layer that `SvgDocument` (in `document.ts`)
anchors. It is one of three layers in the svg-editor core; the other
two are `policy-class/` (the class-level intent-policy tables) and the
per-class handlers that compose both.

See [`docs/wg/feat-svg-editor/glossary/policy-class.md`](../../../../docs/wg/feat-svg-editor/glossary/policy-class.md)
(the **Layering** section) for the full architectural picture.

## What this layer owns

Anything that reads or writes the authored SVG, parses spec-defined
structure, or resolves spec-defined attribute values.

Concretely:

- **AST storage and round-trip serialisation** — `document.ts` itself.
  Source-position trivia, attribute order, quote styles, whitespace,
  comments, prolog/epilog, doctype, namespace prefixes. The
  byte-equal round-trip invariant (P1) lives here.
- **The single write chokepoint** — `SvgDocument.set_attr` is the only
  function in the package that mutates an attribute. `GEOMETRY_ATTRS`
  membership drives the `_geometry_version` bump.
- **Read-side attribute resolution** — `properties.ts` (`compute_known`,
  `resolve_declared`). The "resolved value" frame the rest of the
  editor assumes is produced here.
- **Transform-string parsing and classification** — `transform/parse.ts`
  and `transform/classify.ts`. Turning `"translate(3 4) rotate(30 50 60)"`
  into a typed op list and verdict.
- **Structural-fact predicates** — atomic yes/no queries about an
  element's authored content. Listed in the next section.
- **Defs and references** — `defs.ts`. Gradients, patterns, `<use>`
  targets.
- **Parsing** — `@grida/svg/parser` (consumed) plus `parser.ts` (the
  initial SVG → AST step).

## What this layer does NOT own

- **Intent dispatch.** `apply_resize` / `apply_translate` / `apply_rotate`
  are _consumers_ of this layer; they live in `intents.ts` today and
  move to `policy-class/<class>/<intent>.ts` after the wiring refactor.
- **Class-level policy.** `policy_class_of`, `chosen_policy`,
  `legal_solutions` — all live in `policy-class/`. This layer never
  asks "what should we do with this circle on resize"; it answers
  "what does this circle's authored SVG say."
- **Gesture pipelines.** `resize-pipeline/`, `translate-pipeline/`,
  `rotate-pipeline/` orchestrate gesture lifecycle. They consume both
  this layer and Policy Class; they belong to neither.
- **HUD / DOM surface.** `dom.ts` and the HUD package live above the
  core layers and consume them. Any per-tag knowledge in `dom.ts` that
  this layer could answer (e.g. `bbox_source_for(id)`) is a refactor
  candidate.

## Structural-fact predicates

Atomic yes/no queries about an element's authored SVG content. Each
answers one question, has no intent-awareness, and is composed by
callers into intent-specific verdicts.

| Predicate                         | Question it answers                                                               |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `has_glyph_rotate(id)`            | Does this `<text>` / `<tspan>` carry a non-empty `rotate=""` per-glyph attribute? |
| `has_inline_css_transform(id)`    | Does this element's `style=""` declare a `transform:` CSS property?               |
| `has_animate_transform_child(id)` | Does this element have a direct `<animateTransform>` child?                       |

The first three exist today (added when the SVG Document layer was
named). More will follow as the editor encounters new spec corners.

**Anti-pattern**: composing these inside this layer.
`is_rotatable(doc, id)` is _not_ a method on `SvgDocument` because it
composes facts into an intent verdict — that composition belongs in
the layer above. `SvgDocument` provides facts; callers decide what to
do with them.

## The contract

Three rules, enforced by review:

1. **Reads return resolved values.** When a method returns a numeric
   attribute, percentages, units, and `currentColor` are already
   resolved (or the method is named with `_raw` / `_authored` suffix
   to make the unresolved nature explicit). Callers do not re-resolve.
2. **Writes go through `set_attr`.** Period. New write helpers
   (`set_style`, `set_text`, `insert`, `remove`) all funnel into
   `set_attr` or the equivalent AST mutation that triggers `notify()`.
   No direct AST mutation from outside.
3. **No intent vocabulary.** This layer does not mention `Intent`,
   `Solution`, `PolicyClass`, or any concept from `policy-class/`. If
   a method needs to know about intents, it doesn't belong here.

## Adding a new predicate / capability

1. Identify the question as a structural fact about authored SVG (not
   an intent decision, not a policy choice).
2. Add a method to `SvgDocument` (or a sibling helper module in
   `core/` if the predicate is genuinely independent).
3. Write tests in `__tests__/document-structural-predicates.test.ts`
   (or a dedicated file for larger feature areas).
4. If the predicate replaces an inline check elsewhere in the package,
   migrate the call site in the same change — the layer is the home,
   not a parallel surface.
