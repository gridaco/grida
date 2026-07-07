# Phase-2 finale — `anchor` vs `sheet`

Status: **DECIDED — `anchor`** (owner triage, 2026-07-07; see
[`triage.md`](./triage.md)). The deciding question was answered from both
sides without naming a model: _the web is wrong when it disagrees with the
canvas_ (triage #1), and _the adopt-CSS path already exists in the product
as the `htmlcss` engine — the new taxonomy exists to introduce a new,
editor-first standard_ (triage #6). `anchor` proceeds to phase 3 carrying
five triage amendments (no serialized switch-memory; strict states +
lenient writes; the agent text IR as a first-class surface; familiar
vocabulary; SVG-import ≈100%). The rotation-in-flow fork stays open with a
recorded tilt, to be decided by measured prototype.

The record below is preserved as written before the decision.

---

Previously: **finalists locked** (owner decision, 2026-07). The main-model
race reduces to two, and the axis between them is not technical shape but
provenance: **invent vs adopt**.

## The finalists, restated precisely

### `anchor` — invent the right model

[models/a.md](./models/a.md) as written: intent-canonical bindings,
XYWH-first, layout as a feature, layout-visible rotation, set-means-set.
The Figma/SVG lineage, done without their legacies. **We author the
normative spec, prove it, and teach it.**

### `sheet` — adopt the proven model, top to bottom

**Not** the model H12 eliminated. The re-reading: we invent _nothing_ —
CSS semantics wholesale. Insets, auto, percentages, flex (grid later),
post-layout transforms with center origin, specified-vs-computed values.

- **Normative text**: the CSSWG specs. We write zero layout spec — we cite.
- **Oracle**: Chromium. The repo already runs Chromium-parity loops for its
  `htmlcss` renderer; the conformance methodology exists in-house today.
- **Implementations**: Taffy speaks these semantics natively; the DOM canvas
  backend renders them _identically by construction_; web export is the
  identity function.
- **Write discipline**: H12's arbitration hazard is answered at the editor
  layer, not the model layer — the editor is the only writer and never
  produces over-constrained sheets except deliberately (switch-memory).
- **Existence proof**: Webflow — a successful design tool whose IR _is_
  CSS properties under editor discipline. This path is proven not just by
  browsers but by a design-tool peer.

### Eliminated, on record

- **`bake`** — after scoring rule T1, its intrinsic residue (snapshot
  coherence, trivial conformance spec) lost to its intrinsic costs (intent
  loss, write amplification, coarse merges). Runner-up, retired.
- **`wire`** — real, priced, deferred; re-enters `anchor` additively
  (`Pin.to`) if the product ever demands cross-node attachment. Under
  `sheet`, its equivalent is CSS Anchor Positioning — also additive.

## What each finalist concedes — the honest bill

| concern                    | `anchor` pays                                                                                    | `sheet` pays                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| spec authorship            | **full** — normative text, conformance corpus, teaching burden, novel-model risk                 | ~zero — cite CSSWG, test against Chromium                                                       |
| rotation × layout          | wins: rotated flow child makes room (canvas truth)                                               | **unrepresentable, period** — CSS has no layout-visible rotation; rotated flex children overlap |
| geometry-first authoring   | wins: XYWH + bindings native                                                                     | geometry is layout _output_; "what you define is not what you get"                              |
| set-means-set (H12)        | model-level pass, typed errors                                                                   | model-level **fail standing**; mitigated by editor-only writes (Webflow-style)                  |
| founding judgments         | consistent with WG feat-layout §1 and the schema's own "Why not just the CSS Box Model" doctrine | **consciously reverses both** — allowed, but it must be signed for, not slid into               |
| web/site-builder alignment | lossless _transpile_ to CSS (a projection, maintained by us)                                     | **identity** — the DOM backend and tenant sites render the model natively                       |
| conformance/oracle         | we build the oracle (reftests, corpus)                                                           | Chromium is the oracle; WPT-style method already in-house (`htmlcss` parity loops)              |
| ecosystem/familiarity      | new vocabulary to learn                                                                          | every web developer already knows it                                                            |
| CRDT                       | atoms designed for merge                                                                         | property-LWW workable; dormancy interacts with merge (a merged-in key can flip arbitration)     |
| animation                  | two-lane by design                                                                               | CSS animation model 1:1 — the best story of any candidate                                       |

## The deciding question

Both are coherent. The tie-breaker is product identity, not a scorecard:

> **When the canvas and the web disagree — rotation-in-flow is the crispest
> case — which one is lying?**

- If the canvas is the truth and the web is a _projection_ of it, the model
  must say things CSS cannot (layout-visible rotation, geometry-first
  intent) → **`anchor`**, and the site-builder surface consumes a
  transpilation.
- If the web is the truth and the canvas is a _preview_ of it, inventing
  semantics the deploy target cannot honor manufactures permanent
  mismatch → **`sheet`**, and the graphics canvas accepts CSS's limits.

Secondary form of the same question: is the Rust engine's document model a
**graphics engine's** model (mission statement: "high performance
interactive graphics engine") that also exports web, or a **web renderer's**
model that also draws shapes?

## Decision procedure

1. Owner answers the deciding question (this is not delegable to harnesses).
2. Run the finalists through the worked probes (H1 quartet, H3 concurrency
   matrix, H4 definedness answers) — as confirmation, not as the decider.
3. Winner proceeds to phase 3: normative spec + `grida.fbs` draft; loser's
   file stays as the record of the road not taken and the bill it would
   have paid.
