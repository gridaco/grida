# The anchor text IR — pocket grammar & resolution semantics

An anchor document is XML. The root element is a `<frame>`. Every element
is a node; nesting is the scene tree. This document is **complete**: an
agent holding only this file can compute the resolved geometry of any
document in the subset by hand.

## Elements

| element                              | children          | box                                              |
| ------------------------------------ | ----------------- | ------------------------------------------------ |
| `<frame>`                            | yes               | declared (`w`/`h`), `auto` = hug children        |
| `<shape kind="rect\|ellipse\|line">` | no                | declared (`w`/`h` required)                      |
| `<text>`                             | no (text content) | measured from content                            |
| `<group>`                            | yes               | derived = union of children                      |
| `<lens ops="…">`                     | yes               | derived; `ops` apply to paint only, never layout |

## Common attributes

- `name` — identifier (used to report results).
- `x`, `y` — position binding, only effective when the parent does **not**
  lay the node out (see flex). Forms:
  - `"12"` → offset 12 from parent's left/top edge (start pin)
  - `"end 24"` → node's right/bottom edge sits 24 from parent's right/bottom
  - `"center"` / `"center 6"` → centered in parent (+ optional offset)
  - `"span 30 50"` → both edges bound: starts at 30, ends 50 from the far
    edge; **the span owns the size on that axis** (w/h ignored there)
- `w`, `h` — `"120"` (fixed px) or `"auto"` (text: measured; frame: hug).
- `rotation` — degrees, clockwise, y-down. See §Rotation.
- `flow="absolute"` — opt out of a flex parent's layout; x/y bindings
  apply against the parent box instead.
- `grow` — flex main-axis growth factor (default 0).
- `align` — per-child cross-axis override: `start|center|end|stretch`.
- Frame only: `layout="flex"`, `direction="row|column"` (default row),
  `gap="G"`, `padding="P"` (all four sides; or `"t r b l"`),
  `main="start|center|end|space-between|space-around|space-evenly"`,
  `cross="start|center|end|stretch"` (default start).
- Text only: `size="16"` — font size (default 16).

## Resolution — how to compute geometry by hand

Report a node's **box** as `(x, y, w, h)` in its **parent's coordinate
space**, _before_ rotation is applied. Rotation never changes the box; it
changes where the node paints (its world AABB).

### 1. Text measurement (exact, deterministic)

- character advance = `0.6 × size`; every character counts (spaces too)
- line height = `1.2 × size`
- unconstrained (auto width): one line — `w = chars × 0.6 × size`,
  `h = 1.2 × size`
- constrained to width `W` (fixed or stretched): greedy word wrap:
  max chars per line = `floor(W / (0.6 × size))`; words (split on single
  spaces) are packed left to right; a joining space costs 1 char; a word
  never breaks. `w = widest line's chars × 0.6 × size`,
  `h = lines × 1.2 × size`. (Reported w may be smaller than W only when
  width is `auto`; a fixed or stretched width reports that width.)

### 2. Free placement (parent has no `layout`, or `flow="absolute"`)

With parent box extent `E` on an axis and the node's resolved extent `s`:

| binding       | resolved start                |
| ------------- | ----------------------------- |
| `"o"` (start) | `o`                           |
| `"end o"`     | `E − o − s`                   |
| `"center o"`  | `(E − s)/2 + o`               |
| `"span a b"`  | start `a`, extent `E − a − b` |

### 3. Flex (`layout="flex"`)

Standard flexbox, simplified and exact:

- content box = frame box minus padding.
- each in-flow child contributes its **basis** on the main axis: its
  resolved size (text: measured per §1; frames: hug per §5; rotated: §4).
- children are placed in order from the content box start, separated by
  `gap`. `main` alignment distributes leftover space like CSS
  justify-content.
- `grow`: leftover = content main extent − (Σ bases + gaps). Each grower
  gets `leftover × grow/Σgrow` **added** to its basis. Leftover only
  exists when the container's main size is fixed — an `auto` (hug)
  container has none, so grow adds nothing there. Nothing ever shrinks.
- cross axis: default each child sits at content-box start (`cross`/its
  `align` may center/end it: offset by `(C − s)` or `(C − s)/2` with `C`
  the content cross extent). Stretch, two flavors:
  - the container's `cross="stretch"` stretches only children whose cross
    size is `auto` (a stretched text re-wraps at the stretched width; a
    shape with a fixed cross size keeps it);
  - a child's own `align="stretch"` means **fill** — it overrides even a
    fixed cross size (this is the format's only cross-axis fill).
- x/y attributes on in-flow children are **ignored** (layout owns them).

### 4. Rotation

- Pivot: the **box center**. The box `(x,y,w,h)` is unchanged by rotation.
- World AABB of a rotated w×h box:
  `w' = |w·cosθ| + |h·sinθ|`, `h' = |w·sinθ| + |h·cosθ|`, **concentric
  with the box** (same center).
- **In flex flow (the locked rule):** a rotated child participates with
  its AABB: its main/cross contribution is `(w', h')` instead of `(w, h)`.
  It gets a `(w', h')`-sized slot like any other child, and its **box
  center is placed at the slot center**. Siblings make room; nothing
  overlaps.

### 5. Hug (`w="auto"`/`h="auto"` on a frame)

- main axis: `padding + Σ child contributions + gaps + padding`
  (grow adds nothing — there is no leftover space in a hug axis).
- cross axis: `padding + max child contribution + padding`.
- free (non-flex) frame hug: `padding + max(child start offset + child
AABB extent) + padding`.

### 6. Groups (derived box)

- A group has no size of its own. Its children resolve **in group space**
  at their own x/y offsets (start pins).
- union = the smallest rect containing all children's local AABBs
  (rotation included). The union's origin may be negative (a child at
  `x="-12"` puts the union's left at −12).
- The group's `x`/`y` place the group-space **origin** in the parent —
  not the union. The group's reported box is
  `(x + union.x, y + union.y, union.w, union.h)`.
  (Consequence: moving a child changes the group's reported box, but
  never moves the other children in world space.)

### 7. Lens

Like a group, but carries `ops` (skew/matrix/…). Ops affect painting
only: the reported box and all layout participation use the pre-ops
union. (Consequence: a skewed lens never pushes its flex siblings.)

## Worked micro-example

```xml
<frame w="300" h="100" layout="flex" gap="10" padding="10">
  <shape name="s" kind="rect" w="50" h="50"/>
  <text name="t" size="10">hi there</text>
</frame>
```

- `t` measured: 8 chars × 6 = 48 wide, 12 tall (one line, auto width).
- `s` box = (10, 10, 50, 50); `t` box = (70, 10, 48, 12).
