---
title: "svg-editor Intent × Element Matrix — Current State"
tags:
  - internal
  - research
  - svg-editor
  - intents
---

# svg-editor Intent × Element Matrix

> Current-state inventory. No design content here. This doc records what
> the implementation does TODAY when each public command on
> `@grida/svg-editor` is invoked on each SVG element type. It is the
> input to the IR redesign that follows.
>
> "TODAY" here is an **in-flight implementation not yet on `main`**.
> Source paths under `packages/grida-svg-editor/src/` describe the
> forthcoming implementation slice. Verdicts are the design's pre-redesign
> baseline; the redesign target is `element-ir.md`.

## 1. Method

The matrix below was built by reading the public API surface in
`packages/grida-svg-editor/README.md` (the v0 command vocabulary),
then walking every per-element branch in the implementation
(`src/core/intents.ts`, `src/core/editor.ts`, `src/dom.ts`,
`src/core/rotate-pipeline/`, `src/core/transform/classify.ts`).
Each cell records the **implemented** verdict, not the README's
aspirational surface; the v0.0.0 status disclaimer
([README §Status](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md))
warns that nothing here is stable. Verdicts use this fixed
vocabulary:

| Verdict                | Meaning                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native`               | Writes geometry / presentation attrs directly in the element's local frame; faithful by construction.                                                   |
| `transform-only`       | Writes the `transform=` attribute; geometry attrs are left untouched.                                                                                   |
| `geometry-rewrite`     | Rewrites `d=`, `points=`, etc. (lossless but heavy; only affects `<path>` / `<polyline>` / `<polygon>`).                                                |
| `mixed`                | Combines two of the above in one command (e.g. rotated-rect resize writes geometry AND would need a transform-pivot rewrite that doesn't happen today). |
| `refused (essential)`  | Refused because attempting it would violate P1 round-trip; the editor correctly refuses.                                                                |
| `refused (accidental)` | Refused only because the code path isn't written, OR because of a bug (e.g. the `is_resizable_node` typo at `intents.ts:800`).                          |
| `n/a`                  | The command doesn't apply to this element type (e.g. `set_text` on `<rect>`).                                                                           |
| `unimplemented`        | The command exists in the public API but the per-element arm is missing.                                                                                |

For every cell that is not `n/a` or trivially `native`, §5 records a
one-line note citing `file:line` and the user-observable behaviour.

## 2. Commands

The full closed set from the README's
[Commands](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)
section, in source order. Each command is the addressable
`editor.commands.{…}` member; keymap chord ids (`history.undo` etc.)
in `src/commands/defaults.ts` are not separate commands — they delegate
to these.

> **v0.0.0 caveat.** The README header bills the package as "selection
> only, no mutation." In source, mutation commands exist and are
> wired through the headless `editor.commands` surface and the DOM
> surface's gesture handlers. The matrix reflects the source; the
> README v0 status warning still stands.

| Group     | Command                                                                                                                       | README spec                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| selection | `select`, `deselect`, `select_all`, `select_sibling`, `enter_scope`, `exit_scope`                                             | [§Commands](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)                     |
| mode      | `set_mode`                                                                                                                    | [§Modes](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#modes)                           |
| property  | `set_property`, `preview_property`                                                                                            | [§Properties](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#observation--properties)    |
| paint     | `set_paint`, `preview_paint`, `set_paint_from_gradient`                                                                       | [§Paint](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#observation--paint-fill--stroke) |
| transform | `translate`, `nudge`, `resize_to`, `rotate`, `rotate_to`, `flatten_transform`, `align`                                        | [§Commands — transforms](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)        |
| structure | `reorder`, `remove`, `group`, `insert`, `insert_preview`                                                                      | [§Commands — structure](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)         |
| content   | `set_text`, `enter_content_edit`                                                                                              | [§Commands — content](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)           |
| file      | `load_svg`, `serialize_svg`                                                                                                   | [§External control](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#external-control)     |
| cleanup   | `tidy`                                                                                                                        | [§Commands — cleanup](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)           |
| history   | `undo`, `redo`                                                                                                                | [§Commands — history](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#commands)           |
| defs      | `defs.gradients.{list,get,upsert,remove,subscribe}` and `patterns / symbols / markers / clip_paths / masks / filters` mirrors | [§Defs](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/README.md#observation--defs-resources)      |

Counted commands carried into the matrix below: **26 public
`editor.commands.{…}` members** (selection: 6, mode: 1, property: 2,
paint: 3, transform: 7, structure: 5, content: 2, file: 2, cleanup: 1,
history: 2 — minus `enter_content_edit` which is a mode flip with no
per-element arm). Commands with no per-element variance — `undo`,
`redo`, `load_svg`, `serialize_svg`, `set_mode`, `enter_scope`,
`exit_scope`, `select*`, `deselect`, `tidy`, `defs.*`,
`preview_property`, `preview_paint` — are not crossed against the
element axis below; they are listed for completeness and called out
in §6.

## 3. Elements

The element types the implementation knows about, harvested by
enumerating `case "<tag>":` arms in `capture_translate_baseline`
(`intents.ts:42–86`), `is_resizable` (`intents.ts:280–296`),
`capture_resize_baseline` (`intents.ts:298–380`), and `apply_resize`
(`intents.ts:499–555`), and by checking `is_text_edit_target`
(`document.ts:413`), `default_paint_attrs_for` (`editor.ts:1471`),
and `InsertableTag` (`types.ts:25`).

Grouped per the spec's broad categories:

| Group           | Tags                                                               | Coverage                                                              |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Shapes          | `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path` | full per-element arms in translate / resize                           |
| Refs / raster   | `image`, `use`                                                     | full per-element arms in translate / resize                           |
| Text            | `text`, `tspan`                                                    | translate arm; resize arm only on `<text>`; `set_text` on either      |
| Containers      | `g`, `svg`, `symbol`, `defs`, `switch`                             | `g` translates `viaTransform`; others have no per-element handler     |
| Paint servers   | `linearGradient`, `radialGradient`, `pattern`                      | no per-element handler — fall through `unsupported`                   |
| Refs / glyphs   | `marker`                                                           | no per-element handler — fall through `unsupported`                   |
| Clip / mask     | `clipPath`, `mask`, `filter`                                       | no per-element handler — fall through `unsupported`                   |
| Foreign content | `foreignObject`                                                    | no per-element handler — fall through `unsupported`                   |
| Styling         | `style`                                                            | no per-element handler — `set_property` would still write attrs on it |

## 4. The matrix

Three tables, grouped by command class. Verdicts are from §1. Hints
in parens point to the local-frame attribute(s) the command writes
(or the reason for a refusal).

### 4.1 Transform commands

These are where per-element divergence is highest. Columns are
ordered so `translate` and `nudge` (same code path) are first,
then `resize_to`, then `rotate` / `rotate_to`, then the catch-alls.

| Element          | `translate` / `nudge`              | `resize_to`                                    | `rotate` / `rotate_to`                 | `flatten_transform` | `align`                         |
| ---------------- | ---------------------------------- | ---------------------------------------------- | -------------------------------------- | ------------------- | ------------------------------- |
| `rect`           | native (`x`, `y`)                  | native (`x`, `y`, `width`, `height`)           | transform-only                         | transform-only      | native (via translate)          |
| `circle`         | native (`cx`, `cy`)                | native (`cx`, `cy`, `r`; uniform `min(sx,sy)`) | transform-only                         | transform-only      | native                          |
| `ellipse`        | native (`cx`, `cy`)                | native (`cx`, `cy`, `rx`, `ry`)                | transform-only                         | transform-only      | native                          |
| `line`           | native (`x1`,`y1`,`x2`,`y2`)       | native (all four endpoints scaled)             | transform-only                         | transform-only      | native                          |
| `polyline`       | native (`points`)                  | geometry-rewrite (`points` rescaled)           | transform-only                         | transform-only      | native                          |
| `polygon`        | native (`points`)                  | geometry-rewrite (`points` rescaled)           | transform-only                         | transform-only      | native                          |
| `path`           | geometry-rewrite (`d` translated)  | geometry-rewrite (`d` matrix-transformed)      | transform-only                         | transform-only      | native (via translate)          |
| `image`          | native (`x`, `y`)                  | native (`x`, `y`, `width`, `height`)           | transform-only                         | transform-only      | native                          |
| `use`            | native (`x`, `y`)                  | native (`x`, `y`, `width`, `height`)           | transform-only                         | transform-only      | native                          |
| `text`           | native (`x`, `y`)                  | mixed (corner-only; uniform font-size scale)   | refused (essential) when `rotate=` set | transform-only      | native                          |
| `tspan`          | native (`x`, `y`)                  | unimplemented (no `tspan` arm)                 | refused (essential) when `rotate=` set | transform-only      | native (only if surface bounds) |
| `g`              | transform-only (`viaTransform`)    | refused (essential) — `is_resizable` false     | transform-only                         | transform-only      | native (via translate)          |
| `svg` (nested)   | transform-only when `transform=`   | refused (essential) — `is_resizable` false     | transform-only                         | transform-only      | n/a (viewport)                  |
| `symbol`         | transform-only when `transform=`   | refused (essential) — no handler               | transform-only                         | transform-only      | n/a                             |
| `defs`           | n/a (not selectable as artwork)    | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `switch`         | transform-only when `transform=`   | refused (essential) — no handler               | transform-only                         | transform-only      | n/a                             |
| `linearGradient` | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `radialGradient` | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `pattern`        | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `marker`         | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `clipPath`       | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `mask`           | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `filter`         | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |
| `foreignObject`  | unimplemented (no per-element arm) | refused (accidental) — no handler              | transform-only                         | transform-only      | unimplemented                   |
| `style`          | n/a                                | n/a                                            | n/a                                    | n/a                 | n/a                             |

**Additional cross-cutting refusal**: any element whose own
`transform=` classifies as `single_rotate_only` is refused by
`is_resizable_node` due to the typo at `intents.ts:800` — listed
in §7.1. Affects every shape-row in the `resize_to` column when the
element carries a single rotation.

### 4.2 Property / paint / content commands

| Element                    | `set_property`                         | `set_paint` (`fill`/`stroke`)           | `set_text`                          | `enter_content_edit`         |
| -------------------------- | -------------------------------------- | --------------------------------------- | ----------------------------------- | ---------------------------- |
| `rect`                     | native (cascade-aware carrier)         | native (cascade-aware carrier)          | n/a                                 | n/a                          |
| `circle`                   | native                                 | native                                  | n/a                                 | n/a                          |
| `ellipse`                  | native                                 | native                                  | n/a                                 | n/a                          |
| `line`                     | native                                 | native                                  | n/a                                 | n/a                          |
| `polyline`                 | native                                 | native                                  | n/a                                 | n/a                          |
| `polygon`                  | native                                 | native                                  | n/a                                 | n/a                          |
| `path`                     | native                                 | native                                  | n/a                                 | n/a                          |
| `image`                    | native                                 | n/a (no paint on raster content)        | n/a                                 | n/a                          |
| `use`                      | native                                 | native (`fill` on `<use>` is inherited) | n/a                                 | n/a                          |
| `text`                     | native                                 | native                                  | native (only when text-edit target) | native (mode flip)           |
| `tspan`                    | native                                 | native                                  | native (only when text-edit target) | native (delegates to parent) |
| `g`                        | native                                 | native                                  | n/a                                 | n/a                          |
| `svg`                      | native                                 | native                                  | n/a                                 | n/a                          |
| `symbol`                   | native                                 | native                                  | n/a                                 | n/a                          |
| `defs`                     | native (writes attr; rarely useful)    | n/a                                     | n/a                                 | n/a                          |
| `switch`                   | native                                 | native                                  | n/a                                 | n/a                          |
| paint-server tags          | native (raw attr write)                | n/a                                     | n/a                                 | n/a                          |
| `marker`                   | native                                 | native (`fill`/`stroke` inside)         | n/a                                 | n/a                          |
| `clipPath`/`mask`/`filter` | native (raw attr write)                | n/a                                     | n/a                                 | n/a                          |
| `foreignObject`            | native                                 | native                                  | n/a                                 | n/a                          |
| `style`                    | native (would write attr on `<style>`) | n/a                                     | n/a                                 | n/a                          |

`set_property` and `set_paint` do not branch per-tag in
`editor.ts:642` (`set_property`) / `editor.ts:717` (`set_paint`) —
they delegate to the `choose_write_carrier` cascade logic in
`core/properties.ts`. They write to whatever element is selected,
so every row is `native`.

### 4.3 Structure commands

| Element                    | `reorder`              | `remove`                                                  | `group`                                                 | `insert` / `insert_preview`            |
| -------------------------- | ---------------------- | --------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `rect`                     | native                 | native                                                    | native (wrap in `<g>`; subject to `grouping.md` policy) | native (with default paint attrs)      |
| `ellipse`                  | native                 | native                                                    | native                                                  | native (with default paint attrs)      |
| `circle`                   | native                 | native                                                    | native                                                  | unimplemented (no `InsertableTag` arm) |
| `line`                     | native                 | native                                                    | native                                                  | native (with default paint attrs)      |
| `polyline`                 | native                 | native                                                    | native                                                  | unimplemented                          |
| `polygon`                  | native                 | native                                                    | native                                                  | unimplemented                          |
| `path`                     | native                 | native                                                    | native                                                  | unimplemented                          |
| `image`                    | native                 | native                                                    | native                                                  | unimplemented                          |
| `use`                      | native                 | native                                                    | native                                                  | unimplemented                          |
| `text`                     | native                 | native                                                    | native                                                  | unimplemented (no `<text>` insert UX)  |
| `tspan`                    | native                 | native                                                    | refused (essential) — not a valid group parent member   | unimplemented                          |
| `g`                        | native                 | native                                                    | native                                                  | unimplemented                          |
| `svg`                      | native                 | native                                                    | refused (essential) per `plan_group`                    | unimplemented                          |
| `symbol`                   | native                 | native                                                    | refused (essential)                                     | unimplemented                          |
| `defs`                     | native (low-value)     | refused (essential) — would dangle refs                   | refused (essential)                                     | unimplemented                          |
| `switch`                   | native                 | native                                                    | refused (essential)                                     | unimplemented                          |
| paint-server tags          | n/a (live in `<defs>`) | unimplemented (no ref-count check today on direct remove) | refused (essential)                                     | unimplemented                          |
| `marker`                   | n/a                    | unimplemented                                             | refused (essential)                                     | unimplemented                          |
| `clipPath`/`mask`/`filter` | n/a                    | unimplemented                                             | refused (essential)                                     | unimplemented                          |
| `foreignObject`            | native                 | native                                                    | native                                                  | unimplemented                          |
| `style`                    | native                 | native                                                    | refused (essential)                                     | unimplemented                          |

`reorder` and `remove` operate on the IR's tree structure
(`editor.ts` reorder / remove paths), not on the element's
geometry, so every selectable row is `native`. `defs.*` resource
APIs are the only sanctioned way to manage paint-server / marker /
clipPath / mask / filter / symbol resources today
(`defs.gradients.remove` rejects when `ref_count > 0` per
README §Defs).

## 5. Per-cell notes

One line per non-trivial cell, with `file:line` citation and the
observable behaviour. Trivial `native` cells in §4.2 and §4.3 are
not repeated.

### 5.1 Transform cells

- **`translate` / `nudge` — `rect`/`image`/`use`/`text`/`tspan`** —
  `intents.ts:227–234`. Sets `x`/`y` directly from baseline + delta.
  Observable: NW anchor moves by `(dx, dy)`.
- **`translate` — `circle` / `ellipse`** — `intents.ts:235–239`. Sets
  `cx`/`cy`. Observable: center moves; bounding box follows.
- **`translate` — `line`** — `intents.ts:240–245`. Sets all four
  endpoints. Observable: both endpoints translated together.
- **`translate` — `polyline` / `polygon`** — `intents.ts:246–248`
  via `shift_points_string` (`intents.ts:175`). Each `x,y` pair in
  the `points` string is rewritten. Observable: lossless point shift;
  trivia between points is rebuilt.
- **`translate` — `path`** — `intents.ts:249–252` via `shift_path_d`
  (`intents.ts:201`) which calls `SVGPathDataTransformer.TRANSLATE`.
  Observable: `d=` is fully re-encoded (heavy diff; not minimal).
- **`translate` — `g` and any element with a `transform=`** —
  `intents.ts:43–45`, applied in `intents.ts:220–225` via
  `compose_leading_translate` (`intents.ts:183`). Composes a leading
  translate into the existing transform list, preserving the
  remainder. Observable: `transform=` gains or absorbs a
  `translate(...)` head; rest of list intact.
- **`resize_to` — `rect`/`image`/`use`** — `intents.ts:509–516`.
  Writes `x`/`y`/`width`/`height` (clamps to ≥ 0.001). Observable:
  faithful local-frame resize. **Known follow-up**: rotated rect's
  `rotate(θ cx cy)` pivot is not re-normalised — see
  [feedback-transform.md §BLOCKER 1](feedback-transform.md).
- **`resize_to` — `circle`** — `intents.ts:517–523`. Uses
  `min(sx, sy)` for uniform `r`; corner drags on a non-uniform
  bbox produce a circle that doesn't fill the bbox.
- **`resize_to` — `ellipse`** — `intents.ts:524–529`. Independent
  `rx`/`ry`. Faithful.
- **`resize_to` — `line`** — `intents.ts:530–535`. Endpoints
  rescaled around origin.
- **`resize_to` — `polyline` / `polygon`** — `intents.ts:536–539`
  via `scale_points_string`. Lossless but every coordinate moves.
- **`resize_to` — `path`** — `intents.ts:540–542` via `scale_path_d`
  which applies `SVGPathDataTransformer.MATRIX(sx, 0, 0, sy, e, f)`.
  Observable: `d=` is fully re-encoded; the diff is the entire path
  string.
- **`resize_to` — `text`** — `intents.ts:543–551`. Refuses
  edge-only drags (`!isCorner` early-returns). For corner drags,
  uses uniform `min(sx, sy)` and updates `font-size`. `<tspan>`
  has no arm — falls through to `unsupported` (refused).
- **`resize_to` — `g`/`svg`/`symbol`/`switch`/`foreignObject`** —
  refused at `is_resizable` (`intents.ts:280–296`), which only
  returns `true` for the nine concrete shape/raster/text tags.
  Observable: command is a no-op (`editor.ts:818` skips members).
- **`rotate` / `rotate_to` — every element** — handled by the
  rotate orchestrator (`core/rotate-pipeline/apply.ts:74–109`)
  which writes `transform="rotate(θ cx cy)"` via `apply_rotate`
  (`intents.ts:742–771`). There is no per-tag dispatch; rotation
  is always `transform-only`. `is_rotatable` (`intents.ts:627–659`)
  refuses for four reasons (essential, see §7.2). The pivot is
  fixed at gesture start by the orchestrator and not re-computed
  after resize (see `intents.ts:735` apply doc and
  [feedback-transform.md §BLOCKER 1](feedback-transform.md)).
- **`rotate` — `text` / `tspan` with `rotate=`** — refused
  essential by `is_rotatable` (`intents.ts:641–645`), reason
  `"text-with-glyph-rotate"`. Observable: orchestrator emits
  a refusal toast (`dom.ts:2252–2278`).
- **`rotate` — any element with `style="transform: …"`** —
  refused essential (`intents.ts:647–651`), reason
  `"css-property-transform"`.
- **`rotate` — any element with `<animateTransform>` child** —
  refused essential (`intents.ts:652–657`), reason
  `"animated-transform"`.
- **`rotate` — any element whose `transform=` classifies as
  `mixed`** — refused essential (`intents.ts:636–639`), reason
  `"non-trivial-transform"`. Flatten Transform is the documented
  escape valve.
- **`flatten_transform`** — `editor.ts` flatten path delegates
  to `parse_transform_list` / `emit_transform_list` from
  `core/transform/`. Always writes `transform="matrix(...)"`,
  collapses the entire transform list to one affine. Observable:
  one-token diff per element; subsequent rotate gestures
  re-pass `is_rotatable` (since `matrix(...)` classifies as
  `mixed` it would actually be refused — see §7.3).
- **`align`** — `core/align.ts` + `editor.ts` align path
  computes per-member deltas and uses the same `apply_translate`
  intent, so cell verdict equals the row's `translate` verdict.
  Refuses on <2 members or no surface (essential — undefined
  geometry).

### 5.2 Property / paint / content cells

- **`set_property` / `set_paint`** — `editor.ts:642`,
  `editor.ts:717`, with cascade carrier choice in
  `core/properties.ts choose_write_carrier`. Writes to whichever
  carrier won the cascade for that node (presentation attribute,
  inline style, or stylesheet rule promotion). Verdict is `native`
  on every element type, including non-renderable ones — the
  command does not gate on tag.
- **`set_text` — `text` / `tspan`** — `editor.ts:1478–1496`.
  Refuses unless `is_text_edit_target` (`document.ts:413`) returns
  true, which requires the node to be `text` or `tspan` AND every
  child to be a CDATA text node (no inline `<tspan>` mixed
  content). Observable: when refused, command is a silent no-op.
- **`set_text` — every other element** — refused essential at
  `editor.ts:1481`. The command doesn't apply.
- **`enter_content_edit`** — surface-bound mode flip; per-element
  routing decision lives in the host (see README §Modes / §Surface
  contract). Not a mutation; no per-element data path.

### 5.3 Structure cells

- **`reorder`** — operates on the IR tree (`SvgDocument` move
  operations); no per-tag arm. The only refusal is the keymap-level
  guard requiring exactly one selected node (`commands/defaults.ts:189`).
- **`remove`** — `editor.ts` remove path is tag-agnostic. **Known
  gap**: removing a paint-server / marker / clipPath / mask /
  filter via this command bypasses the `defs.*` ref-count check
  (which only runs through the resource registry's `remove`).
  Listed as `unimplemented` for those tags in §4.3 to flag the
  hole, not because the call is rejected.
- **`group`** — `core/group.ts plan_group` (referenced in
  `editor.ts:21`). Policy lives in
  [grouping.md](grouping.md).
  Refuses (essential) on: empty selection, cross-parent
  selection, paint-server / resource members, and `<defs>` /
  `<svg>` / `<symbol>` / `<switch>` parents.
- **`insert` / `insert_preview`** — `editor.ts insert` /
  `insert_preview`. Gate is `default_paint_attrs_for`
  (`editor.ts:1471`) which only knows about `rect | ellipse | line`
  for paint defaults; the public API accepts any tag string but
  the bundled tool surface (`types.ts:25 InsertableTag`) restricts
  to those three. Observable: passing other tags works through
  the headless API but with no default paint.

## 6. Hot zones

Branch-count census of the implementation files, in descending
order. These are the cells the IR most needs to consolidate.

| Site                                       | `case`/branch count                                        | What it dispatches                    |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------- |
| `intents.ts:46 capture_translate_baseline` | 11 (incl. default)                                         | per-tag baseline shape for translate  |
| `intents.ts:219 apply_translate`           | 8 baseline kinds                                           | per-tag attribute write for translate |
| `intents.ts:305 capture_resize_baseline`   | 10 (incl. default)                                         | per-tag baseline shape for resize     |
| `intents.ts:508 apply_resize`              | 8 attr-kinds                                               | per-tag attribute write for resize    |
| `intents.ts:119 baseline_anchor`           | 8 baseline kinds                                           | per-tag anchor for snap alignment     |
| `intents.ts:280 is_resizable`              | 9-tag whitelist                                            | tag-gate on resize                    |
| `intents.ts:627 is_rotatable`              | 4 essential refusals                                       | doc-state gate on rotate              |
| `core/transform/classify.ts:34 classify`   | 5 verdicts                                                 | transform-list shape                  |
| `dom.ts:1489 shape_of`                     | 4 branches (line / no-ctm / translate-scale / transformed) | HUD shape kind                        |
| `dom.ts:2174 handle_resize`                | 2 branches (transformed / AABB)                            | local-frame vs zoom-AABB decision     |
| `editor.ts:818 resize_to` member loop      | 1 tag gate (`is_resizable`)                                | drops non-resizable selection members |

Three sites carry the bulk of the per-tag knowledge — the two
baseline + apply pairs in `intents.ts` (translate, resize). Every
new element type touches all four. Rotate is the opposite extreme:
one universal `transform-only` write, gated by four document-state
checks. `set_property` / `set_paint` carry zero per-tag knowledge
(they delegate entirely to the cascade-carrier resolver).

## 7. Known typos and refusals

Surfaced by building the matrix.

### 7.1 `is_resizable_node` typo — `single_rotate` vs classifier's `single_rotate_only`

`intents.ts:800`:

```ts
return (
  cls === "identity" ||
  cls === "leading_translate_only" ||
  cls === "single_rotate" || // <-- typo
  cls === "leading_translate_then_single_rotate"
);
```

The classifier (`core/transform/classify.ts:19`) returns
`"single_rotate_only"`, never `"single_rotate"`. Effect: any
element whose `transform=` is a bare `rotate(...)` falls through
to `false` and is refused for resize, despite the comment
("Allow identity, leading-translate, single rotation, and the
combined translate-then-rotate form") explicitly stating it
should pass. Maps to "verify single-rotated elements are
resizable" — every `resize_to` cell in §4.1 is silently
`refused (accidental)` for elements carrying a pure
`rotate(...)`.

This is the only refusal in the matrix tagged `(accidental)` with
a code-citation backing it; the other "no per-element arm exists"
refusals are tracked as `unimplemented` because they were never
written, not broken.

### 7.2 `is_rotatable` essential refusals (correct, but documented for completeness)

Four reasons, all `refused (essential)`:

| Reason                   | `intents.ts` | Why essential                                                  |
| ------------------------ | ------------ | -------------------------------------------------------------- |
| `non-trivial-transform`  | 633–639      | `transform=` carries matrix / scale / skew / multi-rotate.     |
| `text-with-glyph-rotate` | 641–645      | `<text rotate>` is per-glyph; semantics ambiguous on compose.  |
| `css-property-transform` | 647–651      | `style="transform: …"` interacts with `transform-box`/cascade. |
| `animated-transform`     | 652–657      | `<animateTransform>` makes static `transform=` ambiguous.      |

Listed for completeness; these are not bugs.

### 7.3 Flatten Transform → rotate refusal pipeline gap

`flatten_transform` collapses each member's transform list to a
single `matrix(...)` token. Per the classifier
(`core/transform/classify.ts:51–59`), `matrix(...)` is `mixed`.
Per `is_rotatable` (`intents.ts:636–639`), `mixed` refuses with
reason `"non-trivial-transform"`. Net effect: an element flattened
via the documented "escape valve" for accumulated drift becomes
**non-rotatable** until the user manually re-extracts the rotation.
Documented in
[feedback-transform.md §2 RotateBaseline parse-classify dance](feedback-transform.md).

### 7.4 Two parallel resize paths

`commands.resize_to` (headless) reads world-space AABB via
`geometry_provider.bounds_of(id)` and writes through `apply_resize`
in local frame — no `intent.shape` opt-in. The gesture path
through `dom.ts:handle_resize` consumes `intent.shape.local`
when the shape is `transformed`. For rotated rects the two paths
**diverge**: headless uses AABB, gesture uses local frame. See
[feedback-transform.md §Structural flaw 1](feedback-transform.md).

### 7.5 Rotate pivot drift on resize

`apply_resize` writes new `width`/`height` but does not re-write
the `transform="rotate(θ cx cy)"` pivot to the new local centre.
Sequential resize → rotate → resize on a rotated rect drifts the
artwork. Tracked as the headline blocker in
[feedback-transform.md §BLOCKER 1](feedback-transform.md).
In the matrix this is recorded as a `native` resize on rotated
shape-tag rows (§4.1) — the write succeeds; the side-effect on
the rotation pivot is the bug.

---

**Inventory complete.** The matrix is the input; the IR design is
the output, and lives in the follow-up doc.
