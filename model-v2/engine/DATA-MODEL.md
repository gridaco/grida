# DATA-MODEL — anchor's storage, aligned to browser prior art

How the engine lays out its data, decided against how the mature engines
actually do it (Chromium `cc`/Blink, Servo/Stylo, Skia, Flutter — verified in
`docs/wg/research/chromium/**` and the local source clones, not from memory).
Each row carries a validity tag like the ENGINE.md contracts:
**[ALIGNED]** the code already matches the proven shape · **[ADOPTED]** changed
this pass to match · **[SOCKET]** the shape is understood and the seam exists,
the capability is deferred to a named study · **[GAP]** no seam yet.

This is a decisions doc, not a survey — the pure upstream surveys stay in
`docs/wg/research/`. Grida-side reasoning lives only here.

## The one convergent law (and the trap)

Every engine that **retains** a document converges on the cold tier and
_diverges_ on the hot tier:

- **Cold tier — unanimous.** The retained DOM/render tree is **AoS**,
  pointer-linked per-node objects, with rarely-used fields factored into a
  lazily-allocated _rare-data_ pouch: Blink `Node.data_`/`ElementRareDataVector`,
  Servo `rare_data: Box<NodeRareData>`, Flutter `RenderObject.parentData`. Edits
  and queries are per-node and structural, so identity and pointer-reachability
  dominate over iteration locality.
- **Hot tier — divergent, and this is the real invariant.** The perf-critical
  derived data is **never walked through the fat cold node** on the hot path;
  it is re-laid-out and reached by a stable handle. But the _mechanism_ is a
  choice driven by the bottleneck:
  - **Chromium `cc`** → integer index into **domain-separated flat vectors**
    (`TransformTree`/`ClipTree`/`EffectTree`/`ScrollTree` = `std::vector<T>` +
    one parallel `cached_data_` column). Bottleneck = cache-linear iteration.
  - **Stylo** → **`Arc`-shared struct-of-groups** (`ComputedValues` = one
    `Arc<style_structs::X>` per group). Bottleneck = redundant recomputation
    across similar nodes → _share_, don't flatten.
  - **Flutter** → same AoS tree, made cheap by **scoped dirty-propagation**
    (relayout / repaint boundaries).

**The trap: "SOA everywhere" is not the law.** SOA-by-domain is _Chromium's
compositor_ answer, not "the browser" answer. The transferable rule is: keep the
retained scene AoS + rare-data for editing; on the hot path **refuse to touch
the fat node and separate the derived data by access pattern via a handle** —
flat index array _or_ `Arc`-sharing _or_ a relayout boundary, chosen by whether
your cost is iteration or recomputation. (My earlier "the browser shape = hot
SOA" was an overstatement, corrected below.)

## The six details

| detail                    | proven precedent (cited)                                                                                                                                         | anchor now                                                                                                           | decision                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node storage**          | cold = AoS + RareData (Blink `Node`/Servo `Node`); hot = `cc` domain-`Vec`s by int index / Stylo `Arc` groups                                                    | `Document` = index-arena `Vec<Option<Node>>` + `parents`/`generations` columns; `Resolved` = SOA columns by `NodeId` | **[ALIGNED]** — cold AoS-arena (index, not pointers — Servo-ish, _more_ cache-coherent than Blink's GC pointer DOM); hot SOA-by-domain = `cc`'s property-tree shape |
| **Computed tier**         | builder-sealed, **immutable**, structurally-shared snapshot, **cached across frames** (Blink `ComputedStyle`/`LayoutResult`; Stylo `Arc<ComputedValues>`)        | `resolve()` builds a value `Resolved` — but **rebuilt every frame**, not shared/cached                               | **[SOCKET]** immutability is fine; the _persistence_ is incremental-resolve (ENG-1)                                                                                 |
| **Color**                 | never a string — `f32×4` + color-space tag is canonical (`SkColor4f`, `blink::Color`, Stylo `AbsoluteColor`); packed `u32` is interchange only                   | ~~`fill: Option<String>`, re-parsed every build~~ → **`model::Color(u32)`**, read straight                           | **[ADOPTED]** numeric now (packed `u32`); `f32×4`+space = **[SOCKET]** (the color-management gap)                                                                   |
| **Style sharing**         | share **by group** COW + cache **by matched-rule-set**; RAM ∝ distinct group-values, not node count                                                              | every node owns a **full `Header`**; nothing shared (100 identical cards = 100 copies)                               | **[SOCKET]** the memory-scaling move — group-partition + COW, or interning                                                                                          |
| **Caching / incremental** | dirty-scope + one "descendant-dirty" bit up (O(depth) prune); memoize keyed by inputs; **graded** damage descriptor; isolation boundaries; **reset after frame** | **full-resolve every frame**; `DirtyClass` + `damage` exist but unconsumed                                           | **[SOCKET]** the big one (ENG-1/ENG-2). Our `DirtyClass` ≈ the graded descriptor; `damage` ≈ dirty-scope                                                            |
| **Index vs hash**         | dense engine ids → **direct array index, never hashed**; hash only at the sparse _identity seam_ (`cc` `flat_map<ElementId,int>`; Stylo rule-source ptr)         | ~~`HashMap<NodeId, _>` in `resolve`~~ → **`Vec<Option<_>>`** indexed                                                 | **[ADOPTED]** dense-index columns, no hashing                                                                                                                       |

### Landed this pass (both gate-verified, goldens byte-identical)

1. **Color: `String` → `model::Color(u32)`** (`0xAARRGGBB`). The drawlist reads
   the number directly — no per-node heap `String`, no per-build hex parse. The
   text-IR and SVG paths convert at the boundary via `from_hex`/`to_hex`
   (string as parse-input / serialize-output only — the browser rule). Measured:
   `build` −31% at 100k nodes (the parse removal shows at scale). Parse logic is
   byte-identical to the old `resolve_color`, so pixels are unchanged (gate: 4/4
   IDENTICAL).
2. **Resolve caches: `HashMap<NodeId,_>` → `Vec<Option<_>>`** (`union_cache`,
   `ops_cache`). `NodeId` is a dense arena index; hashing it is the exact
   anti-pattern `cc` avoids. Correctness preserved (gate PASS, replays
   deterministic, 121 lab tests). Perf-neutral on the `pages` workload (those
   caches serve derived boxes, which `pages` has none of) — this one is
   principled alignment, not a measured mover here.

## Corrections to the record (honesty)

The grounding pass caught three things I (and one existing doc) had stated
loosely — recorded so the RFC textbook stays honest:

- **"The browser shape = hot SOA"** → overstated. It is the _Chromium-compositor_
  shape; Servo shares, Flutter bounds. See the law above.
- **`DataRef<>`** (the classic Blink COW wrapper) is **removed** from Blink —
  the mechanism is now Oilpan `Member<Subgroup>` + a per-group `access_` flag +
  `Access<T>()→Copy()`. Don't cite `DataRef`.
- **`NGPhysicalFragment`** — the "NG" prefix was dropped once LayoutNG became the
  sole engine; the type is `PhysicalFragment`/`PhysicalBoxFragment`, and the
  immutable cacheable unit is `LayoutResult`. (Also: `docs/wg/research/chromium/
node-data-layout.md`'s "ComputedStyle is reference-counted" is now stale — it
  is `GarbageCollected`.)
- **Canonical color is `f32×4` + color-space**, not packed `u32`; `u32`
  (`SkColor`) is a lossy interchange/accessor form today.

## Ordered next (the sockets, by leverage)

1. **Incremental resolve** (ENG-1) — persistent `Resolved` + dirty-scope
   propagation, keyed reuse, graded `DirtyClass` consumption. This is where the
   nested-scene resolve cost (the `pages` bottleneck) actually falls. **Note we
   should go _past_ `cc` here:** it skips subtree-scoped propagation because web
   trees are 100–500 nodes; a canvas is 10k–100k, the regime where `cc`'s own
   docs say subtree-scoped propagation "becomes worthwhile."
2. **Style/attribute sharing** — partition `Header` into COW groups (or intern
   common values) so 100 identical cards stop costing 100× (the browser
   memory-scaling win). Pairs with a `RareData` cold/hot split on `Header`.
3. **Wide-gamut color** — `Color` → `f32×4` + a color-space tag, folded into the
   color-management day-1 gap (the audit's item).
4. **Damage paint channel** — `damage::diff` is geometry-only; a fill/opacity
   channel is a prerequisite for Win 2 consuming it (already flagged).

## References

- Surveys: `docs/wg/research/chromium/{node-data-layout, property-trees,
blink-rendering-pipeline, dirty-flag-management, paint-recording}.md`.
- Verified in clones: `cc/trees/property_tree.h` (dense-`Vec`, int index),
  Blink `computed_style_base.h.tmpl` (`Member<>`+`Access()` COW),
  `core/layout/layout_result.h` (cached immutable fragment), Stylo
  `properties/properties.mako.rs` (struct-of-`Arc`) + `sharing/mod.rs`
  (LRU sharing cache), Skia `include/core/SkColor.h` (`SkColor4f`) +
  `SkPaint.h` (`fColor4f`).
