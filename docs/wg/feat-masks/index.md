---
title: Masking Model (masks)
---

# Masks — Working Group Draft (`masks`)

| feature id | status | description                                   |
| ---------- | ------ | --------------------------------------------- |
| `masks`    | draft  | Standard masks model & implementation details |

## Goals

- Support a clear, performant, and portable masking model in Grida.
- Cover three mask semantics: **geometry**, **alpha**, **luminance**.
- Provide two authoring/compilation strategies: **Sibling Mask Scopes** and **Explicit MaskingGroup**.
- Align with CSS/SVG where practical; document deliberate divergences.

## Scope

- 2D canvas/editor rendering (Skia backend first).
- Architecture-level decisions (flattening, chunking, effect application), not GPU driver specifics.

---

## Mask Types We Will Support

### 1) Geometry Mask (vector)

**Concept**: Hard, binary shape mask. Resolution‑independent; ignores partial alpha.

**Math**: Clip region C ⊂ ℝ². Output at (x,y) = Source(x,y) if (x,y) ∈ C, else 0.

**Skia**: Prefer geometric clip (no extra layer): `clipPath`/`clipRect`/`clipRRect` with AA. Use saveLayer only when combined with other effects that require isolation.

**CSS/SVG Alignment**:

- ✅ Maps to `clip-path` and SVG `<clipPath>`.
- ❌ Not expressed via `mask-image` (that is alpha/luminance semantics).

**Notes**: Cheapest path; enables early culling. Matches "vector mask"/"clipping path" in many tools.

---

### 2) Alpha Mask (image/alpha)

**Concept**: Per‑pixel alpha controls opacity. A(x,y) ∈ [0,1].

**Math**: Output = Source × A.

**Skia**: `saveLayer(bounds)` → draw content → draw mask with `BlendMode::DstIn` using a shader from the mask image/picture.

**CSS/SVG Alignment**:

- ✅ Maps to `mask-image` (default `mask-mode: alpha`).
- ✅ SVG: mask with alpha.
- ❌ CSS has no sibling-mask concept; requires wrapper element per masked subtree.

**Notes**: Add a pre‑clip (MaskClip) with mask bounds to reduce raster work.

---

### 3) Luminance Mask (image/luma)

**Concept**: Luminance (Y) of mask drives opacity. White=opaque; black=transparent.

**Math**: A(x,y) = Y(R,G,B). Output = Source × A.

**Skia**: Same as alpha, but apply a color filter to the mask shader to convert RGB→A (e.g., luma matrix) before `DstIn`.

**CSS/SVG Alignment**:

- ✅ Maps to `mask-mode: luminance` or SVG `feColorMatrix type="luminanceToAlpha"`.
- ❌ Same wrapper requirement as alpha if expressing sibling masks in CSS.

---

## Alignment With CSS (and Where We Diverge)

| Grida concept         | CSS/SVG analog                                         | Alignment                                      |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Geometry mask         | `clip-path`, `<clipPath>`                              | ✅ direct                                      |
| Alpha mask            | `mask-image` (`mask-mode: alpha`)                      | ✅ direct (per element) / ❌ sibling semantics |
| Luminance mask        | `mask-image` (`mask-mode: luminance`), `feColorMatrix` | ✅ direct (per element) / ❌ sibling semantics |
| Sibling mask scope    | – (no native sibling mask)                             | ❌ requires wrapper/group per scope            |
| Self mask (per-layer) | CSS mask on the element itself                         | ✅ direct                                      |

> Takeaway: CSS aligns with **per-element** masking. Our **sibling scope** authoring model compiles to CSS by inserting wrapper elements that carry the mask for the group.

---

## Options (Authoring & Flattening Models)

We support two complementary models. Both compile to the same Skia primitives.

### Option 1 — **List & Siblings (Topmost is the mask)**

**Policy**: Within a group, the **topmost mask node** defines a scope over its **preceding** consecutive siblings, up to the previous mask or group boundary (Illustrator‑style). Example z (bottom→top):

```
[a, b, c, Mask1, d, e, Mask2]
→ Scopes: Mask1(a,b,c), Mask2(d,e)
```

**Why this model**

- Matches designers’ “stencil on top” instinct.
- Simple group‑local prepass; no global reordering.
- Equivalent to a cheap single pass after partitioning into scopes.

**Flattening algorithm (group‑local prepass)**

```
run := []
scopes := []
for node in children (bottom→top):
  if node is Mask:
    scopes.push( Scope { mask: node, items: run })
    run := []
  else:
    run.push(node)
// optional: if run not empty at group end, emit Scope { mask: None, items: run }
```

**Lowering to draw calls (per scope)**

- Geometry: `clipPath(path)` → draw items → (no extra layer).
- Alpha/Luma: `saveLayer(bounds)` → draw items → draw mask with `DstIn` (luma CF if needed) → `restore`.
- Always pre‑clip to `bounds` for culling.

**Pros**

- Aligns with Illustrator and the stencil mental model.
- Keeps authored z for items; mask is a scope marker, not a drawable.
- Works with nesting (mask inside a scope opens a nested scope).

**Cons**

- Diverges from CSS sibling semantics (needs wrapper on export).
- Slightly more complex prepass than self‑mask.

---

### Option 2 — **Explicit `MaskingGroup` (API or internal)**

**Policy**: An explicit container owning a mask and a child list, independent of sibling order.

```ts
// Schema (TS-ish)
interface MaskingGroup {
  id: NodeId;
  mask: NodeId; // references any node; its visual defines the mask
  mode: "geometry" | "alpha" | "luminance";
  children: NodeId[];
}
```

**Flattening**

- Treat each `MaskingGroup` as a single scope: compile `mask` → build `MaskDef`, then draw `children` in order under that scope.

**Lowering**: same draw sequence as Option 1 per mask type.

**Pros**

- Explicit, serialization‑friendly, stable API for programmatic authors.
- Maps cleanly to CSS/SVG by emitting a wrapper element carrying the mask.
- No ambiguity about which nodes are in scope.

**Cons**

- Heavier authoring object; designers may prefer inline sibling workflows.
- Requires explicit creation when converting from freeform layer lists.

---

## Shared Implementation Details (both options)

### Data Model

```rust
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum LayerMaskType { None, Geometry, Image(ImageMaskType) }

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum ImageMaskType { Alpha, Luminance }
```

### Render Chunks (flattened units)

```rust
pub enum RenderChunk {
  Plain { items: Vec<PainterPictureLayer>, z_anchor: usize },
  MaskScope { mask: MaskDef, items: Vec<PainterPictureLayer>, z_anchor: usize },
}

pub enum MaskDef {
  Geometry { path: skia_safe::Path },
  Alpha { shader: skia_safe::Shader, bounds: skia_safe::Rect },
  Luminance { shader: skia_safe::Shader, bounds: skia_safe::Rect },
}
```

### Painter Application (Skia)

- **Geometry**: `canvas.save(); canvas.clip_path(path, None, true); draw_items(); canvas.restore();`
- **Alpha/Luma**:
  1. `saveLayer(bounds)`
  2. optional `clip_rect(bounds)` for culling
  3. draw items in order
  4. paint mask rect with `BlendMode::DstIn` (for luma: shader with luma matrix)
  5. `restore()`

### Caching & Invalidation

- Cache `MaskDef` shader/picture; key on mask node revision.
- Chunk key = (mask key, item ids + revisions, property state).
- Invalidate chunk on any child/mask change; bounds = union(children, mask bounds).

### Hit‑Testing

- Inside a `MaskScope`, hit‑test items in authored order; mask nodes used purely as scopes are not hit unless explicitly exposed in the UI.

---

## Interop & Export Notes

- **CSS**: sibling scopes compile to wrapper elements:
  - Geometry → wrapper with `clip-path`.
  - Alpha/Luma → wrapper with `mask-image` (and `mask-mode`), positioning mask via `mask-position/size`.
- **SVG**:
  - Geometry → `<clipPath>`.
  - Alpha/Luma → `<mask>` (with optional `feColorMatrix` for luminance).

### Interop Examples

- **React Native Skia `<Mask>`** (wrapper semantics; separate mask tree applied to children):

```tsx
<Mask
  mask={
    <Group>
      <Circle cx={128} cy={128} r={128} opacity={0.5} />
      <Circle cx={128} cy={128} r={64} />
    </Group>
  }
>
  <Rect x={0} y={0} width={256} height={256} color="lightblue" />
</Mask>
```

- **SVG `<mask>`** (define once, then reference from drawables with `mask="url(#id)"`):

```svg
<mask id="myMask" mask-type="luminance">
  <!-- White areas → visible; black → transparent -->
  <rect x="0" y="0" width="100" height="100" fill="white" />
  <path
    d="M10,35 A20,20,0,0,1,50,35 A20,20,0,0,1,90,35 Q90,65,50,95 Q10,65,10,35 Z"
    fill="black" />
</mask>

<polygon points="-10,110 110,110 110,-10" fill="orange" />
<circle cx="50" cy="50" r="50" fill="purple" mask="url(#myMask)" />
```

> SVG: `mask` attribute on a drawable is a reference to a `<mask>` definition (URL form `url(#id)`).

---

## Decision Guideline

- For **designer‑first flows**: prefer **Option 1 (Sibling masks, topmost = mask)** with the prepass partitioner.
- For **API/programmatic** or export‑sensitive flows: prefer **Option 2 (MaskingGroup)**.
- Both options can coexist; the compiler lowers both to the same chunk/effect primitives.

---

## Open Questions

- Do we expose both authoring models in the UI, or choose one and auto‑convert?
- Should geometry masks ever force isolation (saveLayer) when combined with filters/blend?
- Luminance definition: sRGB coefficients vs linear‑RGB (perceptual correctness vs speed).

## Testing Matrix

- Single mask: geometry vs alpha vs luma (with/without transforms).
- Nested masks (geometry inside alpha, etc.).
- Masks + filters (blur, color filters) and blend modes.
- Large masks with small painted regions (culling correctness/perf).
- Export round‑trip to CSS/SVG.

---

## References (conceptual)

- [`SVG#<mask>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/mask)
- Browser pipelines (Blink): separate **Clip** vs **Effect** trees; masks applied in isolated groups via `DstIn`; add a **MaskClip** for culling.
- Design tools: Illustrator uses **topmost object as clipping path** (masking items below). Figma masks apply to **siblings above** (opposite order) — we choose topmost=mask semantics for authoring, but implementation is scope‑based.
- [Masks in Sketch](https://www.sketch.com/docs/designing/shapes/masking-shapes/)
- [Clipping Masks in Photoshop](https://helpx.adobe.com/photoshop-elements/using/clipping-masks.html)
- [Clipping Masks in Illustrator](https://helpx.adobe.com/illustrator/using/clipping-masks.html)
  - [Illustrator Masking Example - Youtube](https://www.youtube.com/watch?v=DlcDVZChWxw&t=325s)
- [Masks in Figma](https://help.figma.com/hc/en-us/articles/360040450253-Masks)
