# Layout Model - `layout`

> Universal positioning, dimensions, layout management with anchors, flex and grid.

| feature id | status | description            | PRs                                               |
| ---------- | ------ | ---------------------- | ------------------------------------------------- |
| `layout`   | draft  | Universal Layout Model | [#437](https://github.com/gridaco/grida/pull/437) |

---

## Abstract

The Grida Layout Model (`layout`) introduces a unified, geometry-first foundation for all 2D layout and positioning scenarios.  
It merges the conceptual clarity of **anchors**, the flexibility of **flexbox**, and the structure of **grid**—forming a single, coherent system that scales from freeform graphics design to complex UI composition.

Unlike traditional rule-based layouts, this model prioritizes **direct manipulation, predictability, and composability**, aligning deeply with designer-first workflows and visual editing metaphors.  
The result is a layout system that remains **ergonomic for creators**, **precise for engineers**, and **interoperable with web standards**, bridging the gap between WYSIWYG design and production-grade layout semantics.

---

## 1. Existing Solutions and Their Problems

### CSS Inset `ltrb`

**Pros:**

- Intuitive, simple, battle tested, de facto standards
- Easy to write in code

**Cons:**

- Not predictable
- Layout-centric, not graphics friendly (non XYWH centric)
- What you define is NOT what you get
- Fundamentally conflicts with the sizing (left + width + right => one will get dropped)

### Constraint Layout (Android)

Android's ConstraintLayout uses a constraint-based system that allows complex layouts with a flat view hierarchy.

**Pros:**

- Powerful and flexible constraint relationships (chains, barriers, guidelines)
- Flat layout hierarchy improves performance
- Rich constraint model supports complex positional relationships
- Good visual editor tooling in Android Studio

**Cons:**

- View-based rather than graphics-centric (not XYWH oriented)
- Difficult to translate to web standards (CSS)
- Verbose XML definitions, not concise for programmatic use
- Dangerous — when the target is removed the link becomes orphaned or error-stated
- Can't be mix-used with flex-like layout

### XY + Constraints (Figma)

Figma uses XY + constraints, which is designer friendly and intuitive.

**Pros:**

- Designer friendly
- Graphics schema friendly — the XY values are actually defined/computed with the XY field, making the API `node.x = 10` (graphics centric)
- Graphics-first, layout as feature (good)
- Can represent "center" alignment, where the position basis is center, even while not actually center positioned
- 100% works with CSS inset => Figma

**Cons:**

- What user sets is NOT ALWAYS what they get — if under a layout (Auto Layout), the XY will be ignored, readonly
- When you pin a node to right only, it still gets defined by `x + x_constraints = right` (where what user does is "this is right = 10", the schema does not contain the 'right is 10' but rather the current 'state' x)
- Lacks easy mapping from Figma => CSS when constraints are center

---

These existing models each address parts of the layout challenge but fall short of providing a unified, intuitive, and interoperable solution. While no model can solve all problems at once—and ours will share some of the same challenges—a combined anchor + flex + grid approach bridges these gaps through a strongly-typed SDK, comprehensive documentation, and well-crafted examples that guide users toward correct usage patterns.

---

## 2. Alignment with Editor

The anchor-based layout model is designed to closely align with direct manipulation in a designer-first WYSIWYG editor:

- **Ergonomic mapping:** Anchors correspond to intuitive "pinning" points on elements (edges, corners, centers), making positioning and resizing natural.
- **Pinning:** Users can "pin" one or more edges or centers to parent or sibling anchors, reflecting common design intentions.
- **Centering and snapping:** Anchors support easy centering and snapping behaviors without complex calculations.
- **Visual clarity:** The model exposes explicit anchor relationships, reducing guesswork and improving user comprehension.

This approach provides a seamless bridge between visual editing and layout semantics, enabling precise, predictable control.

---

## 3. Following Standards

While conceptually new, the anchor model aligns with emerging web standards:

- It is consistent with the CSS Anchor Positioning Working Draft (2024–2025), which introduces anchor-based layout primitives.
- The model remains fully transpile-compatible with traditional CSS inset, flexbox, and grid layouts.
- This ensures that adopting anchors does not isolate designs from existing CSS ecosystems or tooling.

By building on standards, the model facilitates future-proof, interoperable layout workflows.

---

## 4. Transpilation & Interoperability

The relationship between CSS inset and anchor positioning is fundamentally lossless:

- **CSS inset ↔ Anchor translation:** Conversion between inset properties and anchors can be performed without loss of layout semantics.
- **Production exports:** Anchor-based layouts can be transpiled into either CSS Anchors (where supported) or legacy inset/flex/grid code for maximum compatibility.
- This dual-path transpilation supports diverse deployment targets and progressive enhancement strategies.

Interoperability ensures that anchor adoption integrates smoothly into existing pipelines.

---

## 5. Alignment with Core Use Cases

The anchor model comprehensively covers key layout scenarios:

- **Free-form/graphics design:** Anchors naturally implement absolute XY positioning with respect to parent anchors, matching typical graphic design workflows.
- **UI design:** Anchors combine seamlessly with flex and grid layouts to support responsive, component-based interface design.
- **Game or 3D-parallel models:** Anchors correspond to constraint-based positioning systems used in game engines and 3D UI frameworks, enabling consistent paradigms across domains.

This universality makes anchors a foundational primitive bridging multiple design disciplines.

---

## 6. Auxiliary Use Cases

Beyond core layout, anchors enable advanced features:

- **Comment bubbles:** Anchors provide stable attachment points for annotations that track element movement.
- **Link lines:** Anchors facilitate dynamic connections between UI components or diagram nodes.
- **Attached annotations:** Anchors support overlays and badges that remain positioned relative to their targets.

These auxiliary use cases demonstrate the extensibility and versatility of the anchor model.

---

## 7. Conclusion (TL;DR)

- The combined anchor + flex + grid model covers every 2D layout scenario.
- It bridges the gap between free-form graphics and structured UI design.
- It is ergonomically aligned with a designer-first, direct manipulation paradigm.
- It is standards-aligned, losslessly transpile-compatible, and interoperable.
- Anchors provide a universal, intuitive foundation for modern layout management in Grida.

---

## 8. Implementation Levels

To ensure stability and gradual adoption, the layout system will be rolled out in progressive implementation levels:

### Level 1 — Practical Foundation (MVP)

- **Parent-only anchors:** Support anchors referencing only the parent node (identical semantics to inset + relative positioning).
- **Flex foundations:** Initial flexbox layout support for basic responsive layouts.

### Level 2 — Stronger, Production-Ready (Beta)

- **Conflict resolution:** Formalize deterministic resolution rules for over-constrained anchor configurations.
- **Schema soundness:** Enforce predictable, schema-safe layout definitions for reliable serialization and round-tripping.

### Level 3 — Grid Expansion

- **Grid support:** Introduce grid layout capabilities alongside flex, providing full 2D layout composition.

### Level 4 — Full Anchor Model (Advanced)

- **User-defined anchors:** Allow anchoring to arbitrary nodes (siblings, ancestors, or named anchors).
- **Safe fallbacks:** Implement robust fallback strategies for missing or invalid anchor targets.
- **Inter-element constraints:** Enable rich relational layouts beyond parent-only anchoring.

---

## 9. References

- **CSS Anchor Positioning Module Level 1** — W3C Working Draft (2024–2025)  
  https://www.w3.org/TR/css-anchor-position-1/
- **Chrome Developers: Anchor Positioning API** — Overview and examples  
  https://developer.chrome.com/blog/anchor-positioning-api/
- **MDN Web Docs: CSS Anchor Positioning** — Syntax and browser support  
  https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning
- **OddBird Blog: Anchor Positioning Updates (2025)** — Practical insights from spec contributors  
  https://www.oddbird.net/2025/10/13/anchor-position-area-update/

---

### Cross‑Domain Anchoring & Constraint Examples

- **Unity UI Anchors & RectTransform** — Unity's `RectTransform` component supports parent‑relative anchors and stretching behavior similar to inset and anchor models, forming the foundation of its responsive UI system.  
  https://docs.unity3d.com/Manual/UIBasicLayout.html

- **Godot Control Nodes** — Godot's `Control` nodes implement an anchor/margin system that allows constraint‑based UI placement in both 2D and 3D scenes.  
  https://docs.godotengine.org/en/stable/tutorials/gui/gui_containers.html

- **Figma Auto Layout & Constraints** — Figma's constraint model (top, left, right, bottom, center) operates on the same principle as anchors, enabling adaptive, rule‑based positioning in a 2D design environment.  
  https://help.figma.com/hc/en-us/articles/360039957734-Apply-constraints-to-define-how-layers-resize

- **CAD / Parametric Modeling** — Tools like AutoCAD and SolveSpace use constraint graphs to define positional relationships between points, edges, and objects—an abstract yet mathematically identical anchor system.  
  https://en.wikipedia.org/wiki/Constraint_(computer-aided_design)

These references illustrate that anchor‑style positional constraints are not unique to CSS—they represent a universal paradigm across 2D, 3D, and CAD domains.

## 10. Performance Considerations

The new layout engine is designed to maintain parity or exceed performance compared to existing layout paradigms:

- **Anchor model efficiency:**  
  When used in simple parent-only configurations (equivalent to inset-based layouts), the anchor system introduces negligible computational overhead.  
  It can be optimized to perform **as fast or faster** than the traditional inset model by leveraging direct parent geometry caching and simplified constraint resolution.

- **Flex and grid alignment:**  
  Flex and grid layouts are implemented following the same logical rules and constraints as CSS specifications, allowing predictable and efficient layout computation.  
  Flex performance should match existing browser and UI engine implementations due to similar evaluation stages and data structures.

- **Incremental recomputation:**  
  Layout changes are diff-based — only affected nodes and their dependents are recomputed, minimizing the cost of updates during design or animation.

- **Predictable scaling:**  
  Anchor relationships are localized; the absence of global dependency graphs ensures linear-time layout resolution in typical use cases.

This ensures that while the model expands flexibility and expressiveness, it does not compromise runtime or editing performance.
