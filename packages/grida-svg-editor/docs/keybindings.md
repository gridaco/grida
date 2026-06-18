# @grida/svg-editor — Keybindings status

Source list copied verbatim (in structure) from `docs/editor/shortcuts/index.md`
(main editor). This file tracks which shortcuts apply to `@grida/svg-editor`,
which command id they invoke, and what still needs to ship.

**This is an internal tracker, not a public doc.** It lives next to package
source for design discussion and is expected to shrink to nothing as the
system fills in.

Status legend:

- `[x]` shipped in svg-editor
- `[ ]` planned for V1 / next
- `[~]` applies but the command doesn't exist yet (gap noted)
- `[-]` N/A — main-editor-only concept (no tool model, no auto-layout, no boolean ops, no text formatting, no brush, no zoom infra)
- `[?]` open question / undecided

Where the system is added: see `src/commands/defaults.ts` (handlers) and
`src/keymap/defaults.ts` (key→command bindings). Both files are the single
source of truth for what svg-editor ships out of the box.

---

## Tools

| Action          | macOS          | Windows/Linux  | Status | Command    | Notes                                                       |
| --------------- | -------------- | -------------- | ------ | ---------- | ----------------------------------------------------------- |
| Cursor (Select) | `V`            | `V`            | [x]    | `tool.set` | shipped — sets `state.tool` to `{ type: "cursor" }`         |
| Hand tool       | `H` or `Space` | `H` or `Space` | [-]    | —          | hand-tool is a Space-drag gesture (see Modifier Keys below) |
| Zoom tool       | `Z`            | `Z`            | [-]    | —          | no tool concept                                             |
| Scale tool      | `K`            | `K`            | [-]    | —          | no tool concept                                             |
| Lasso tool      | `Q`            | `Q`            | [-]    | —          | no tool concept                                             |
| Rectangle tool  | `R`            | `R`            | [x]    | `tool.set` | shipped — `args: { type: "insert", tag: "rect" }`           |
| Ellipse tool    | `O`            | `O`            | [x]    | `tool.set` | shipped — `args: { type: "insert", tag: "ellipse" }`        |
| Polygon tool    | `Y`            | `Y`            | [-]    | —          | no tool concept                                             |
| Text tool       | `T`            | `T`            | [-]    | —          | deferred — see TODO.md (no intrinsic size; needs UX design) |
| Line tool       | `L`            | `L`            | [x]    | `tool.set` | shipped — `args: { type: "insert", tag: "line" }`           |
| Arrow tool      | `⇧ + L`        | `⇧ + L`        | [-]    | —          | no tool concept                                             |
| Container tool  | `A` or `F`     | `A` or `F`     | [-]    | —          | no container model                                          |
| Tray tool       | `⇧ + F`        | `⇧ + F`        | [-]    | —          | no tray model                                               |
| Path tool       | `P`            | `P`            | [-]    | —          | no tool concept                                             |
| Pencil tool     | `⇧ + P`        | `⇧ + P`        | [-]    | —          | no tool concept                                             |
| Brush tool      | `B`            | `B`            | [-]    | —          | no brush model                                              |
| Eraser tool     | `E`            | `E`            | [-]    | —          | no eraser model                                             |
| Paint bucket    | `G`            | `G`            | [-]    | —          | bitmap-only                                                 |
| Variable width  | `⇧ + W`        | `⇧ + W`        | [-]    | —          | vector mode only                                            |
| Eye dropper     | `I` or `⌃ + C` | `I`            | [?]    | —          | host-owned (provider)                                       |

## Selection & Navigation

| Action                  | macOS               | Windows/Linux       | Status | Command              | Notes                                                                              |
| ----------------------- | ------------------- | ------------------- | ------ | -------------------- | ---------------------------------------------------------------------------------- |
| Select all siblings     | `⌘ + A`             | `Ctrl + A`          | [x]    | `selection.all`      | shipped — replaces selection with element-children of current scope (or root)      |
| Select children         | `Enter`             | `Enter`             | [x]    | `hierarchy.enter`    | shipped — returns false on leaves so a future content-edit binding can chain ahead |
| Select parent           | `⇧ + Enter` or `\`  | `⇧ + Enter` or `\`  | [x]    | `hierarchy.exit`     | shipped (`⇧+Enter` only; `\` alias pending)                                        |
| Select next sibling     | `Tab`               | `Tab`               | [x]    | `selection.sibling`  | shipped (`args: "next"`); wraps; from no selection picks scope's first child       |
| Select previous sibling | `⇧ + Tab`           | `⇧ + Tab`           | [x]    | `selection.sibling`  | shipped (`args: "prev"`); wraps; from no selection picks scope's last child        |
| Escape/Clear            | `Escape` or `Clear` | `Escape` or `Clear` | [x]    | `selection.deselect` | shipped; chain-ready for future cancel-gesture                                     |

## Editing

| Action      | macOS                   | Windows/Linux               | Status | Command               | Notes                                                                                                                                                                                                                                          |
| ----------- | ----------------------- | --------------------------- | ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo        | `⌘ + Z`                 | `Ctrl + Z`                  | [x]    | `history.undo`        | shipped                                                                                                                                                                                                                                        |
| Redo        | `⌘ + ⇧ + Z`             | `Ctrl + ⇧ + Z`              | [x]    | `history.redo`        | shipped                                                                                                                                                                                                                                        |
| Redo (alt)  | `⌘ + Y`                 | `Ctrl + Y`                  | [x]    | `history.redo`        | shipped (alias)                                                                                                                                                                                                                                |
| Cut         | `⌘ + X`                 | `Ctrl + X`                  | [x]    | `clipboard.cut`       | shipped — via native clipboard events, deliberately NO keymap row (a keymap claim would `preventDefault` the keystroke and suppress the native event); command id serves menu/RPC hosts. See `docs/wg/feat-svg-editor/clipboard.md` §Transport |
| Copy        | `⌘ + C`                 | `Ctrl + C`                  | [x]    | `clipboard.copy`      | shipped — same native-event routing as Cut                                                                                                                                                                                                     |
| Copy as PNG | `⌘ + ⇧ + C`             | `Ctrl + ⇧ + C`              | [-]    | —                     | host-owned (rasterizer)                                                                                                                                                                                                                        |
| Paste       | `⌘ + V`                 | `Ctrl + V`                  | [x]    | `clipboard.paste`     | shipped — same native-event routing; command id reads the provider (else internal buffer)                                                                                                                                                      |
| Duplicate   | `⌘ + D`                 | `Ctrl + D`                  | [x]    | `selection.duplicate` | shipped — in-place subtree clone (no defs closure, ids verbatim; Tidy dedups). See `docs/wg/feat-svg-editor/subtree-clone.md`                                                                                                                  |
| Delete      | `Delete` or `Backspace` | `Delete` or `Backspace`     | [x]    | `selection.remove`    | shipped; future routing inside the handler                                                                                                                                                                                                     |
| Flatten     | `⌘ + E` or `⌥ + ⇧ + F`  | `Ctrl + E` or `Alt + ⇧ + F` | [-]    | —                     | no flatten command yet                                                                                                                                                                                                                         |

## Transformation

| Action                    | macOS            | Windows/Linux    | Status | Command                      | Notes                                                                                                  |
| ------------------------- | ---------------- | ---------------- | ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Nudge                     | `Arrow Keys`     | `Arrow Keys`     | [x]    | `transform.nudge`            | 1 doc-unit per press; `args: { dx, dy }`                                                               |
| Nudge (large)             | `⇧ + Arrow Keys` | `⇧ + Arrow Keys` | [x]    | `transform.nudge`            | 10 doc-units per press                                                                                 |
| Nudge resize (right/up/…) | `⌃ + ⌥ + …`      | `Ctrl + Alt + …` | [x]    | `selection.nudge_resize`     | per-element, each around its own NW; ±1 / ±10 with Shift; refused on non-resizable/transformed members |
| Move to front             | `]`              | `]`              | [x]    | `reorder` (`bring_to_front`) | shipped                                                                                                |
| Move to back              | `[`              | `[`              | [x]    | `reorder` (`send_to_back`)   | shipped                                                                                                |
| Move forward              | `⌘ + ]`          | `Ctrl + ]`       | [x]    | `reorder` (`bring_forward`)  | shipped                                                                                                |
| Move backward             | `⌘ + [`          | `Ctrl + [`       | [x]    | `reorder` (`send_backward`)  | shipped                                                                                                |

## Alignment & Distribution

| Action                  | macOS          | Windows/Linux    | Status | Command           | Notes                                                     |
| ----------------------- | -------------- | ---------------- | ------ | ----------------- | --------------------------------------------------------- |
| Align left              | `⌥ + A`        | `Alt + A`        | [x]    | `selection.align` | shipped (`args: "left"`); multi → union, single → parent  |
| Align right             | `⌥ + D`        | `Alt + D`        | [x]    | `selection.align` | shipped (`args: "right"`)                                 |
| Align top               | `⌥ + W`        | `Alt + W`        | [x]    | `selection.align` | shipped (`args: "top"`)                                   |
| Align bottom            | `⌥ + S`        | `Alt + S`        | [x]    | `selection.align` | shipped (`args: "bottom"`)                                |
| Align horizontal center | `⌥ + H`        | `Alt + H`        | [x]    | `selection.align` | shipped (`args: "horizontal_centers"`); matches X centers |
| Align vertical center   | `⌥ + V`        | `Alt + V`        | [x]    | `selection.align` | shipped (`args: "vertical_centers"`); matches Y centers   |
| Distribute horizontally | `⌥ + Ctrl + V` | `Alt + Ctrl + V` | [-]    | —                 | no distribute command yet                                 |
| Distribute vertically   | `⌥ + Ctrl + H` | `Alt + Ctrl + H` | [-]    | —                 | "                                                         |

## Grouping & Layout

| Action               | macOS       | Windows/Linux    | Status | Command             | Notes                                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------- | ---------------- | ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group                | `⌘ + G`     | `Ctrl + G`       | [x]    | `selection.group`   | wraps selection in `<g>`                                                                                                                                                                                                                                                                                  |
| Ungroup              | `⌘ + ⇧ + G` | `Ctrl + ⇧ + G`   | [x]    | `selection.ungroup` | dissolves a plain structural `<g>` (clean-structural subset only — refuses groups with `opacity` / `filter` / `clip-path` / `mask` / `class` / `style` / `fill`, `<defs>` / `<use>`-referenced / animation-bearing groups; bakes the group transform into children); see `grouping.md` §Ungrouping policy |
| Group with Container | `⌘ + ⌥ + G` | `Ctrl + Alt + G` | [-]    | —                   | no container model                                                                                                                                                                                                                                                                                        |
| Auto-layout          | `⇧ + A`     | `⇧ + A`          | [-]    | —                   | no AL model                                                                                                                                                                                                                                                                                               |

## Text Formatting

| Action                    | macOS   | Windows/Linux | Status | Command | Notes                             |
| ------------------------- | ------- | ------------- | ------ | ------- | --------------------------------- |
| Bold/italic/underline/etc | various | various       | [-]    | —       | delegated to `@grida/text-editor` |

(All text-formatting keys are owned by `@grida/text-editor` when a text node
is in edit mode. They never reach the svg-editor keymap.)

## Object Properties

| Action               | macOS       | Windows/Linux  | Status | Command                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------- | -------------- | ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toggle active        | `⌘ + ⇧ + H` | `Ctrl + ⇧ + H` | [-]    | —                       | no visibility model                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Toggle locked        | `⌘ + ⇧ + L` | `Ctrl + ⇧ + L` | [-]    | —                       | no lock model                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Remove fill          | `⌥ + /`     | `Alt + /`      | [~]    | `paint.remove_fill`     | needs new command                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Remove stroke        | `⇧ + /`     | `⇧ + /`        | [~]    | `paint.remove_stroke`   | needs new command                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Swap fill and stroke | `⇧ + X`     | `⇧ + X`        | [~]    | `paint.swap`            | needs new command                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Opacity 0/10/…/100%  | digits      | digits         | [ ]    | `selection.set_opacity` | command shipped (`editor.commands.set_opacity`, clamped, one history step); digit **bindings deferred by decision** — not in the default keymap (silent failure mode + discoverability; issue #850). Intended semantics when a host wires them (match Grida Canvas, single-digit, no two-digit accumulation): `1`–`9` → 10%–90%, `0` single → 100%, `0` double (<300ms) → 0%. The `0` single/double needs a stateful handler (the V1 keymap dispatcher skips multi-chunk sequences). |

## View & Zoom

| Action             | macOS   | Windows/Linux | Status | Command | Notes                            |
| ------------------ | ------- | ------------- | ------ | ------- | -------------------------------- |
| All view/zoom keys | various | various       | [-]    | —       | no viewport model (host concern) |

## Brush Tools

| Action                       | macOS     | Windows/Linux | Status | Command | Notes          |
| ---------------------------- | --------- | ------------- | ------ | ------- | -------------- |
| Increase/decrease brush size | `]` / `[` | `]` / `[`     | [-]    | —       | no brush model |

## Modifier Keys (While Pressed)

Held-modifier signals are NOT keymap bindings — they're polled by gesture
handlers from `hud.modifiers()` (canvas gestures) or read from the raw
event (selection decision, wheel, keyboard shortcuts). Adding a new
modifier effect means a gesture/handler edit, not a keymap row.

| Modifier   | macOS  | Windows/Linux | Status | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------ | ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift      | `⇧`    | `⇧`           | [x]    | Multiple effects, all wired: <br>• marquee in empty space → additive (`hud/event/decision.ts:235`) <br>• click on hover → add / toggle selection (`hud/event/decision.ts:253–257, 277–281`) <br>• drag → axis-lock translate, `by_dominance` (`dom.ts:2071`) <br>• corner **or edge** resize → uniform / aspect-lock (`dom.ts:2080`); a side-edge drag scales the perpendicular axis about the opposite-edge center (`compute_factors` edge arms) <br>• rotate → 15° angle snap (`dom.ts:2123`) <br>• pointerdown inside text-edit → extend selection (`dom.ts:1689`) <br>Modifier reads via `hud.modifiers().shift` or `e.shiftKey` at boundary. |
| Alt/Option | `⌥`    | `Alt`         | [x]    | Two disjoint effects: <br>• drag a resize handle → resize-from-center (symmetric, bbox-anchored — both opposite edges move, center stays put; composes with Shift for uniform-about-center). Mapped from `hud.modifiers().alt` by `dom.ts:current_resize_modifiers`; live mid-drag toggle via the `sync_modifiers` resize redrive. <br>• idle (no gesture) → measurement overlay — distance / position chips between selection and hover target while held, conditional on idle gesture + non-empty selection (`dom.ts:1108–1129`). <br>(Alt-drag _translate_ is clone, a third gesture-disjoint role.)                                           |
| Meta/Cmd   | `⌘`    | (n/a)         | [x]    | macOS wheel + keyboard zoom: `Cmd+wheel` → zoom at cursor (`gestures/defaults.ts:33`); `Cmd+=` / `Cmd+-` → keyboard zoom (`gestures/defaults.ts:181`). No selection-mode toggles (no deepest-pick yet).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Control    | `Ctrl` | `Ctrl`        | [x]    | Cross-platform wheel + keyboard zoom: `Ctrl+wheel` → zoom (also catches native trackpad pinch, which reports `ctrlKey=true` on macOS — `gestures/defaults.ts:4, 33`); `Ctrl+=` / `Ctrl+-` → keyboard zoom on Win/Linux (`gestures/defaults.ts:181`). No `Ctrl`-bound force-disable-snap (the `force_disable_snap` modifier exists on the resize / translate pipelines, but no key toggles it yet).                                                                                                                                                                                                                                                |
