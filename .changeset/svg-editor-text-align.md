---
"@grida/svg-editor": minor
---

Add `commands.text_align("start" | "middle" | "end")` ([#833](https://github.com/gridaco/grida/issues/833)). Justifies the selected `<text>` block(s) as **one** atomic history step, preserving each block's rendered bbox — the Figma semantic "lines re-justify, the box stays put", expressed in a format with no text box.

The command sets `text-anchor` on each target `<text>` and re-anchors every line's `x` to the block's left / center / right edge (`x = block.left + F·block.width`, `F = {start: 0, middle: .5, end: 1}`). Per-line widths come from the attached geometry provider, so a block whose lines carry **different** `x` (manual indent) re-justifies correctly — not only the shared-`x` deck shape a single block translate handles. Previously a host had to compose `set_property("text-anchor", …)` + `translate(…)`, which is two undo steps and only exact for the shared-`x` case.

A "line" is a `<tspan>` descendant carrying its own `x`; a `<text>` with no such tspans is itself the single line, and a selected `<tspan>` resolves to its enclosing `<text>`. Deltas are projected through the line's frame (`world_delta_to_local`), so blocks under a scaled / nested-viewport ancestor land exactly. Refuses (returns `false`, no history step) on empty selection, when no `<text>` is in range, when no geometry provider is attached, or when every target already has the requested anchor; a block is left untouched (not half-justified) when a line uses a per-glyph `x` list or a unit/percentage `x` (`10px`, `50%`), when a `<tspan>` overrides `text-anchor`, when the block mixes its own direct text run with line-tspans, or when its frame is rotated, skewed, x-reflected (negative scale), or carries an inline CSS `transform`.
