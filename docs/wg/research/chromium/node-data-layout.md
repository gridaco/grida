---
title: "Chromium Node Data Layout for Rendering"
format: md
tags:
  - internal
  - research
  - chromium
  - rendering
  - performance
  - data-layout
---

# Chromium Node Data Layout for Rendering

How Chromium stores and accesses per-node data across its rendering
pipeline, with focus on data layout strategies that determine cache
locality and iteration cost during compositing and property propagation.

See [property-trees.md](./property-trees.md) for the full property tree
structure. This document focuses on **why** the data is split that way
and how the pattern extends to DOM/SVG storage and mutation.

---

## Three Storage Tiers

Chromium uses three distinct tiers of per-node storage, each optimized
for different access patterns:

### Tier 1: DOM Objects (Blink) — Monolithic with RareData

DOM nodes (`Element`, `SVGElement`, `LayoutObject`) are heap-allocated
objects. Each contains all properties for that node type. To manage size,
Blink factors rarely-used properties into lazily-allocated `RareData`
objects:

```
SVGElement (always allocated):
  class_name_: Member<SVGAnimatedString>
  svg_rare_data_: Member<SVGElementRareData>  // null until needed
  + inherited Element fields (~100+ bytes)

SVGElementRareData (allocated on demand):
  animated_sms_style_properties_
  presentation_attribute_style_
  ...
```

The same pattern appears in `LayoutObject` (`LayoutObjectRareData`) and
`LayerImpl` (`RareProperties`).

Source: `third_party/blink/renderer/core/svg/svg_element.h`,
`third_party/blink/renderer/core/layout/layout_object.h`

**Key insight:** Blink tolerates monolithic objects at the DOM layer
because DOM operations are infrequent relative to compositor-driven
rendering. The performance-critical path is in the compositor, which
uses a different layout.

### Tier 2: Compositor Layers — Thin Index Carriers

Each compositor layer (`LayerImpl`) stores minimal data plus four integer
indices into the property trees:

```
LayerImpl (~100 bytes hot data):
  bounds_: gfx::Size                           // 8 bytes
  offset_to_transform_parent_: gfx::Vector2dF  // 8 bytes
  transform_tree_index_: int                    // 4 bytes
  effect_tree_index_: int                       // 4 bytes
  clip_tree_index_: int                         // 4 bytes
  scroll_tree_index_: int                       // 4 bytes
  draw_properties_: DrawProperties              // computed cache
  element_id_: ElementId                        // 16 bytes
  + bitfields (~4 bytes)
  rare_properties_: unique_ptr<RareProperties>  // cold, heap-allocated
```

A layer does not own its transform, effect, or clip data. It references
shared property tree nodes. Multiple sibling layers with the same
transform parent share a single `TransformNode`.

Source: `cc/layers/layer_impl.h`

### Tier 3: Property Trees — SoA by Domain

Properties are stored in four flat `std::vector<T>` arrays, one per
domain:

| Array                   | Element Type    | Approx Size/Element | What Iterates It        |
| ----------------------- | --------------- | ------------------- | ----------------------- |
| `TransformTree::nodes_` | `TransformNode` | ~200 bytes          | `UpdateAllTransforms()` |
| `EffectTree::nodes_`    | `EffectNode`    | ~120 bytes          | `ComputeEffects()`      |
| `ClipTree::nodes_`      | `ClipNode`      | ~80 bytes           | `ComputeClips()`        |
| `ScrollTree::nodes_`    | `ScrollNode`    | ~60 bytes           | Scroll handling         |

Plus a parallel cache vector for computed results:

| Array                         | Element Type              | Approx Size/Element | Purpose                    |
| ----------------------------- | ------------------------- | ------------------- | -------------------------- |
| `TransformTree::cached_data_` | `TransformCachedNodeData` | ~136 bytes          | `to_screen`, `from_screen` |

Each rendering pipeline step walks **one** property tree contiguously.
`UpdateAllTransforms()` reads `TransformNode.local`/`to_parent` and
writes `TransformCachedNodeData.to_screen` — both are sequential vector
accesses. This is cache-friendly: the working set is one input vector +
one output vector.

Source: `cc/trees/property_tree.h`, `cc/trees/transform_node.h`

---

## Why This Layout Works

### Transform Propagation

Before property trees, Chromium stored all properties on layers and walked
the layer tree to propagate transforms. The `CalculateDrawProperties()`
function was one of the largest performance bottlenecks because each layer
had 50+ fields but transform propagation only needed 3-4.

After the property tree refactor:

| Metric                  | Layer-Walk (old)             | Property Tree (current)    |
| ----------------------- | ---------------------------- | -------------------------- |
| Data per node           | ~500 bytes (full layer)      | ~200 bytes (TransformNode) |
| Working set (1K layers) | ~500 KB                      | ~200 KB                    |
| Cache lines touched     | ~8 per node                  | ~3 per node                |
| Other properties loaded | All (paints, clips, effects) | None                       |

The key: **separation by access pattern**. Transform propagation never
touches effect data. Effect computation never touches clip data. Each
stage loads only what it needs.

### Shared Nodes

Property trees have **fewer nodes** than the layer tree. Common case:

- 1000 layers might reference only 200 transform nodes (sibling groups
  share parents)
- An opacity change on a container creates one `EffectNode` referenced by
  all descendant layers, not N copies

This sharing reduces both storage and propagation cost.

---

## Mutation and Incremental Update

Property trees are **persistent across frames** and support efficient
single-node mutation.

### Mutation Flow

1. **Mutate**: Write to the property node field + set dirty flag

   ```
   TransformNode:
     needs_local_transform_update: bool  // dirty flag
     transform_changed_: bool            // change tracking
     damage_reasons_: DamageReasonSet    // why it changed
   ```

2. **Propagate**: Next frame, `UpdateAllTransforms()` walks the flat
   vector top-down. For each node:
   - If `needs_local_transform_update`: recompute `to_parent` from
     `local`, `origin`, `scroll_offset`, `post_translation`
   - Always recompute `to_screen = parent.to_screen * to_parent` (cached)
   - If `transform_changed_`: propagate change flag to descendants for
     damage tracking

3. **Damage**: Changed flags feed into `DamageTracker` which determines
   which render surfaces need redraw.

### Compositor-Thread Animations

For animated properties (transform, opacity), Chromium avoids the main
thread entirely:

```
Main Thread → commit → Pending Tree → activation → Active Tree
                                                     ↑
                                            MutatorHost drives
                                            animations directly
```

The compositor thread mutates `TransformNode.local` and
`EffectNode.opacity` directly on the active tree. Scroll offsets are
similarly dual-tracked via `SyncedScrollOffsetMap` (main-thread value +
impl-thread value).

### Single-Node Mutation Cost

| Operation                 | Cost            | Notes                       |
| ------------------------- | --------------- | --------------------------- |
| Set transform on one node | O(1)            | Write field + set dirty bit |
| Propagate transforms      | O(tree_size)    | Sequential vector walk      |
| Re-propagate only subtree | Not implemented | Chromium walks full tree    |
| Add/remove property node  | O(1) amortized  | Vector push/pop             |

Chromium does not implement subtree-scoped propagation because web page
property trees are typically small (100-500 nodes). For scenes with
significantly larger property trees (tens of thousands of nodes),
subtree-scoped propagation would be a worthwhile extension.

Source: `cc/trees/transform_node.h` (lines 26-183),
`cc/trees/property_tree.h` (`UpdateAllTransforms`)

---

## Blink SVG: Where Monolithic Storage Hurts

SVG elements store all properties on the DOM object. Each `SVGElement`
inherits from `Element` (which inherits from `Node`) and adds SVG-specific
data. An SVG `<rect>` carries:

- Transform (presentation attribute or CSS)
- Geometry (`x`, `y`, `width`, `height`, `rx`, `ry`)
- Paint (fill, stroke, opacity)
- Effects (filter, clip-path, mask)
- Layout state

During SVG rendering, Blink resolves styles and paints for each element,
touching all fields even when only a subset is needed. Blink mitigates
this via:

1. **Style sharing**: Resolved styles are shared between elements with
   identical computed values (`ComputedStyle` is reference-counted)
2. **Paint invalidation**: Only elements with changed properties are
   re-painted (invalidation rect tracking)
3. **Hardware acceleration**: SVG elements with `will-change: transform`
   or CSS animations are promoted to compositor layers, which then use
   the property tree architecture

For SVG without compositor promotion, Blink does pay the monolithic-object
cost. This is a known performance issue for complex SVG content.

Source: `third_party/blink/renderer/core/svg/svg_element.h`,
`third_party/blink/renderer/core/layout/svg/`

---

## Comparison: ECS vs Property Trees

Game engines (Bevy, Unity DOTS) use Entity-Component-System (ECS) as an
alternative data layout strategy. Both ECS and property trees achieve
SoA-style access, but with different tradeoffs.

| Aspect                | Property Trees (Chromium)               | ECS (Bevy)                                        |
| --------------------- | --------------------------------------- | ------------------------------------------------- |
| Storage               | Flat `Vec<T>` per property domain       | Archetype tables (SoA within archetype)           |
| Access                | Direct integer index into vector        | Query over matching archetypes                    |
| Hierarchy             | `parent_id` field in each node          | `ChildOf` component + `Children`                  |
| Node sharing          | Siblings share property nodes           | No sharing; each entity owns components           |
| Mutation              | Write field + dirty flag                | Write component (change detection)                |
| Adding properties     | Insert into the relevant vector         | Archetype migration (entity moves between tables) |
| Removing properties   | Remove from the relevant vector         | Archetype migration                               |
| Transform propagation | Sequential top-down vector walk         | Parallel DFS with work-stealing                   |
| Sparse data           | Dense vector (unused slots waste space) | Sparse: only entities with component are stored   |
| Complexity            | Low (flat arrays + indices)             | High (archetype bookkeeping, query resolution)    |

### ECS Archetype Migration

When a component is added or removed from an entity in ECS, the entity
must migrate between archetype tables (because the storage layout
changes). This involves copying all component data to the new table.
For example, adding a drop shadow to a shape would trigger archetype
migration (moving the entity from `[Transform, Style, Geometry]` to
`[Transform, Style, Geometry, Effects]`).

Property trees avoid this: adding an effect to a node creates an
`EffectNode` in the effect tree and sets `effect_tree_index_` on the
layer. No data movement for other properties.

### Suitability

Property trees are better suited for rendering engines with:

- Stable component shapes (most nodes have the same set of properties)
- Tree-structured hierarchical propagation
- Frequent single-property mutations (animation, interaction)
- Need for property sharing between nodes

ECS is better suited for:

- Highly heterogeneous entities (wildly different component sets)
- Flat iteration over specific component combinations
- Dynamic component addition/removal as a core operation

For scene graphs that resemble a design tool or document renderer —
stable node types, tree-structured transforms, frequent interactive
edits — the property tree model is a better fit.

---

## Key Takeaways

1. **Split by access pattern, not by identity.** Transform propagation
   should only touch transform data. Effect computation should only touch
   effect data. Storing all properties in one object forces every pipeline
   stage to load irrelevant data.

2. **Flat contiguous arrays.** Property trees store each domain in a
   dense `std::vector<T>` with O(1) index access. Sequential top-down
   walks get full benefit of hardware prefetching.

3. **Shared property nodes reduce tree size.** Sibling layers with the
   same transform parent share a single `TransformNode`. The property
   tree is often 5-10x smaller than the layer tree.

4. **Persistent trees with dirty flags.** Trees are not rebuilt from
   scratch each frame. Single-node mutation is O(1) (write + dirty bit),
   propagation is O(tree_size) via sequential vector walk.

5. **Monolithic objects are tolerated only where iteration is rare.**
   Blink's DOM objects are monolithic because style resolution and paint
   are per-element operations with invalidation. The compositor, which
   must walk all layers every frame, uses split property trees.

6. **RareData factoring is a partial mitigation.** Lazily-allocated
   cold-data objects reduce the base object size but do not help with
   iteration cost — the hot-data portion is still interleaved with
   pointers and padding in the base object.

---

## Source Files Referenced

- `third_party/blink/renderer/core/svg/svg_element.h`
- `third_party/blink/renderer/core/layout/layout_object.h`
- `cc/layers/layer_impl.h`
- `cc/trees/property_tree.h`
- `cc/trees/transform_node.h`
- `cc/trees/effect_node.h`
- `cc/trees/clip_node.h`
- `cc/trees/scroll_node.h`
- `cc/trees/draw_property_utils.h`
- `cc/trees/draw_property_utils.cc`
