# ENGINE — the phase-4 layer programs (day-1 contracts)

2026-07-08. The five engine layers the migration must shape from day 1 —
each with its **major contracts** (cheap to set now, brutal to retrofit),
its growth path (every stage keeps every contract), and its open studies
(named, instrumented, NOT decided). The model semantics are proven
([`MODEL.md`](./MODEL.md), 114 tests); this document is about the engine
that grows around them. Browser and game-engine technique is adopted
deliberately, not by vibe: the pipeline staging and damage discipline
are the browser's; the storage, spatial, and replay discipline are the
game engine's.

**Validity rule (standing, H13-style).** A claim enters this document
only under one of five tags — anything untagged is refused:

- `[MEASURED]` — a number from this workbench (lab, spike, E4 bench) or
  a mechanism that exists in the lab today, cited.
- `[PRIOR]` — a finding from the legacy render-opt loop. Transfers as a
  **hypothesis** — it was measured on the legacy engine and MUST
  re-measure on this model before it binds.
- `[PEER]` — verified browser/game-engine precedent, stated coarsely
  enough to be uncontroversial.
- `[CONTRACT]` — normative, testable, binds phase 4. The point of this
  document.
- `[OPEN]` — a study question with a named instrument. Decides nothing.

Decision hygiene: nothing here pre-empts the register — DEC-4/5/6/7/9
stay owner calls; the contracts below are **decision-independent
sockets** any answer plugs into.

## The layer map

| layer | one line                                      | precedent                                         | day-1 contracts | grows into                            |
| ----- | --------------------------------------------- | ------------------------------------------------- | --------------- | ------------------------------------- |
| ENG-0 | stage purity + the oracle law                 | browser pipeline staging                          | 0.1–0.4         | everything below                      |
| ENG-1 | incremental resolve & damage                  | dirty bits / query memoization                    | 1.1–1.4         | dirty-scope → memoized resolve        |
| ENG-2 | retained paint: drawlist → tiles → compositor | display lists, damage rects, layers               | 2.1–2.4         | damage-driven partial paint           |
| ENG-3 | spatial read tier                             | game broadphase (BVH/LBVH)                        | 3.1–3.4         | indexed pick/cull/snap at 100k        |
| ENG-4 | deterministic content oracles                 | Figma's own text stack; lockstep float discipline | 4.1–4.5         | pinned shaper, pathops-in-measure     |
| ENG-5 | time as data: journal, replay, CRDT seam      | input-log replay; per-field LWW multiplayer       | 5.1–5.5         | op history → replay rig → multiplayer |

---

## ENG-0 · the meta-layer: stage purity and the oracle law

The one asset every layer below trades on: **the pipeline is a chain of
pure stages**. `document → resolve → drawlist → raster/composite`, plus
the read tier (`pick`, spatial queries) off the resolved columns. The
lab already holds the first link (`resolve(document, fonts, resources,
viewport) → Resolved` is a pure function `[MEASURED]`); phase 4 extends
the chain, never breaks it.

- **ENG-0.1 · stage purity** `[CONTRACT]` — every stage is a pure
  function of the previous stage plus declared inputs. No stage reads
  downstream state; no stage writes upstream. (Law 1's "derivable ⇒ not
  encodable" is the document-side special case of this.)
- **ENG-0.2 · the oracle law** `[CONTRACT]` — every optimization
  (incremental resolve, cache, spatial index, batching, tiling) ships
  WITH a differential test against the unoptimized pure stage:
  `optimized(input) ≡ reference(input)`, bit-for-bit, over the
  conformance scenes and the replay corpus (ENG-5.3). An optimization
  without its differential test does not merge. The reference paths are
  never deleted — they are the permanent test oracles.
- **ENG-0.3 · order-determinism** `[CONTRACT]` — stages are
  deterministic including iteration order (no hash-map-order-dependent
  math; SOA columns indexed by NodeId already are `[MEASURED]`).
  Determinism is what upgrades every differential test from ε-tolerance
  to bit-equality — ε hides real bugs.
- **ENG-0.4 · this document's own gate** `[CONTRACT]` — additions to
  ENGINE.md carry a validity tag or are rejected; `[PRIOR]` entries
  must name their re-measurement before binding.

**Never.** No layer may introduce hidden mutable state "for
performance" without routing it through ENG-0.2. A cache that cannot be
differential-tested is a bug factory with a speedup attached.

---

## ENG-1 · incremental resolve & damage

**Precedent.** Browsers keep style/layout/paint validity per phase with
dirty bits and scoped relayout `[PEER]`; rust-analyzer's salsa
demonstrates query-memoization as the alternative shape `[PEER]`; game
engines propagate dirty transforms through subtrees with change
detection `[PEER]`.

**Evidence on file.** Resolve-per-frame is the proven baseline: starter
scene 0.008 ms resolve / 0.17 ms frame; 10k nodes 0.35–0.47 ms resolve
`[MEASURED]`. Locality is bounded — a leaf edit re-resolves to the
nearest fixed-extent ancestor, ~18 µs per card subtree under clean
parent boxes `[MEASURED]`. The lab's per-container hug chain is
2^depth — phase 4's single-tree layout removes it structurally
`[MEASURED]` (LIMITS cost note). The incremental engine is an
**optimization to add, not an architecture to build first** — that
ordering is itself the day-1 decision, already made and proven by the
spike.

**Major contracts.**

- **ENG-1.1 · the full resolver is the eternal oracle** `[CONTRACT]` —
  incremental resolve must produce a resolved tier bit-identical to
  from-scratch resolve, for every edit, forever. CI runs the
  differential over the conformance scenes + replay corpus. (This is
  ENG-0.2 applied; it is listed separately because it is the contract
  most engines break first.)
- **ENG-1.2 · ops declare their dirty class** `[CONTRACT]` — the op
  layer already enumerates typed write-sets (write counts are law
  `[MEASURED]`); extend each op with a declared invalidation scope:
  which phases (M/L/T/B) × which extent (self · subtree ·
  measure-chain-to-fixed-ancestor · bounds-only). Day 1 the enum merely
  exists and the engine ignores it (full resolve); the incremental
  engine consumes it later without re-auditing every op. CSS
  containment is the browser's version of making damage scope explicit
  `[PEER]`.
- **ENG-1.3 · viewport is root context only** `[CONTRACT]` — resolved
  output for a node never depends on scroll/zoom/culling. Culling is a
  paint/read concern (ENG-2, ENG-3). Violating this makes every pan a
  full invalidation and poisons ENG-1.1.
- **ENG-1.4 · caches are a separate, keyed tier** `[CONTRACT]` — any
  memoized value lives outside the document and the resolved tier,
  keyed by generational identity (ENG-2.3). The document and Resolved
  stay plain values.

**Growth path.** full-per-frame (today, proven) → dirty-scope
re-resolve consuming ENG-1.2 (the 18 µs bound is the promised payoff)
→ memoized sub-queries where profiling justifies.

**Open studies.** OS-1a: dirty-bit propagation vs salsa-style
memoization vs hybrid — instrument: the E4 bench harness + replay
corpus, measured at 10k/100k `[OPEN]`. OS-1b: does Taffy's tree API
admit subtree-scoped relayout cleanly, or does the flex phase stay
whole-tree longer than M/T/B? — instrument: prototype on the lab's flex
scenes `[OPEN]`.

---

## ENG-2 · retained paint — display list, damage, tiles, compositor

**Precedent.** The browser pipeline: paint produces a display list;
raster consumes it in tiles; a compositor owns layers and frame pacing;
damage rects flow forward `[PEER]`. Game render graphs contribute
batching/culling vocabulary `[PEER]`.

**Evidence on file.** The spike is paint-bound, not resolve-bound: 10k
nodes = 0.35 ms resolve vs ~9 ms paint `[MEASURED]` — paint is where
the next order of magnitude lives, which is precisely why this layer
exists. The legacy loop's findings transfer as hypotheses only
`[PRIOR]`: unstable-full-draw suppression won big (−71%), analytic
mask-filter shadows halved stable full draws, and **naive layer
promotion/demotion was falsified twice** — re-measure all three on this
model before adopting.

**Major contracts.**

- **ENG-2.1 · drawlist is a pure stage** `[CONTRACT]` —
  `resolved → drawlist` is deterministic and diffable, exactly like
  resolve (ENG-0.1). Paint reads the resolved tier and the drawlist —
  never the document.
- **ENG-2.2 · damage flows forward only** `[CONTRACT]` — op → dirty
  class (ENG-1.2) → resolved-tier diff → drawlist diff → screen rects.
  No stage invents damage; no stage widens it silently. Damage is data,
  loggable and assertable per frame.
- **ENG-2.3 · generational cache keys** `[CONTRACT]` — cache identity
  is `(slot, generation)`, never the bare NodeId. The lab arena
  tombstones deleted slots but does not yet promise non-reuse
  `[MEASURED]` — day 1: add the generation counter (or an explicit
  append-only promise) so a reused slot can never alias another node's
  cached raster/layout artifacts.
- **ENG-2.4 · the compositor owns pacing** `[CONTRACT]` — one frame
  entry point schedules input → resolve → paint → present; hosts adapt
  to it, not vice versa. The legacy `FrameLoop` unification is the
  in-repo precedent `[PRIOR]` — its lesson (fragmented tick/redraw
  paths rot) binds; its implementation does not.

**Growth path.** immediate paint from SOA (today) → display list +
damage rects (partial repaint) → tiled raster (infinite canvas at deep
zoom) → composited layers, promotion by measured policy only.

**Open studies.** OS-2a: tile scheme for an unbounded, deeply-zoomable
canvas — zoom-pyramid vs single-scale re-raster; instrument: `--bench`
scenes at extreme zoom `[OPEN]`. OS-2b: layer promotion heuristics —
re-run the legacy falsification on this engine before shipping any
promotion `[PRIOR→OPEN]`. OS-2c: text raster caching interaction with
ENG-4 versioning (glyph atlas keyed by oracle version) `[OPEN]`.

**Never.** Paint must not become a second place where model semantics
live — a drawlist item renders what the resolved tier says, or the
resolved tier is wrong.

---

## ENG-3 · the spatial read tier — one query API over a broadphase

**Precedent.** Game engines split broadphase (index over AABBs) from
narrowphase (exact tests) and rebuild LBVHs per frame via morton sort
at large N `[PEER]`. Browsers hit-test by paint-order tree walk — the
editor case (marquee, snap, cull, minimap) outgrows that quickly
`[PEER]`.

**Evidence on file.** The read tier is already SOA: `world_aabb` is a
flat column indexed by NodeId `[MEASURED]` — literally the input array
a broadphase wants. `pick` exists as a model concern (oriented
inverse-world test, lens post-ops, transparent-select promotion to the
outermost derived) with a linear walk `[MEASURED]` — correct, and the
permanent narrowphase + oracle.

**Major contracts.**

- **ENG-3.1 · one query API** `[CONTRACT]` — point-hit, rect
  (marquee), viewport cull, and nearest-edge/center (snap candidates)
  are one API family. Consumers (HUD, marquee, snapping, culling,
  minimap, pick) never hand-roll tree traversals. Day 1 the API fronts
  the linear walk; the index slots in behind it unchanged.
- **ENG-3.2 · the walk is the oracle** `[CONTRACT]` — every index
  answer is differential-tested against the linear reference (ENG-0.2).
  Broadphase may over-approximate (candidates), never under-approximate
  (misses).
- **ENG-3.3 · model laws live in the query layer** `[CONTRACT]` —
  paint-order topmost, transparent-select promotion, lens post-ops
  hit-testing, hairline slop: these are semantics, and they stay in the
  narrowphase (today's `pick.rs`), NOT in consumers and NOT in the
  index. An index swap must never change what gets selected.
- **ENG-3.4 · spatial reads read the read tier only** `[CONTRACT]` —
  the index is built from resolved columns (`world_aabb`), never from
  intent. It rebuilds/refits from a resolve diff (ENG-2.2's damage
  feed), so it can never disagree with what was resolved.

**Growth path.** linear walk behind the API (today, correct) →
per-frame rebuilt BVH over the SOA column (morton/LBVH — the column
layout makes the sort nearly free `[PEER]`) → refit-vs-rebuild policy
at scale.

**Open studies.** OS-3a: rebuild-vs-refit threshold at 10k/100k under
resolve-per-frame — instrument: bench scenes + the replay corpus
`[OPEN]`. OS-3b: snap-candidate query shape (k-nearest edges vs range
query + filter) measured against real gesture traces `[OPEN]`.

---

## ENG-4 · deterministic content oracles — text, pathops, images

**Precedent.** Browsers are deliberately NOT cross-platform
deterministic in text; Figma ships its own text stack precisely to be
`[PEER]` (already cited as evidence in DEC-4). Lockstep game
simulations pin float operation order and instruction choices to keep
replicas bit-identical `[PEER]`.

**Evidence on file.** The seam already exists: oracles are explicit
resolve inputs (`fonts`, `resources` in the signature) `[MEASURED]`.
The lab text metric is a stub and the spike renders real glyphs against
stub measurement — the mismatch is deliberately visible `[MEASURED]`.
B-1 (wrap decisions are discrete; no ε absorbs a line-height jump) and
B-5 (bool needs pathops inside measure) are the two blockers this layer
services `[MEASURED]` (LIMITS).

**Major contracts** (decision-independent: DEC-4 picks the shaper,
DEC-5 the numbers, DEC-6 the bool posture — these sockets hold under
any answer):

- **ENG-4.1 · oracles are explicit inputs** `[CONTRACT]` — nothing
  inside resolve reaches for ambient fonts/resources/platform metrics.
  Already true; stays true.
- **ENG-4.2 · oracles are versioned** `[CONTRACT]` — the oracle version
  is document-visible; an oracle upgrade is a format event, never a
  silent drift. Golden corpora per version; CI pins each version's
  outputs.
- **ENG-4.3 · bit-exact within a version** `[CONTRACT]` — same oracle
  version + same inputs ⇒ same outputs on every platform (one Rust
  codebase across native/wasm is the enabling asset). This is what
  makes ENG-1.1 and ENG-5.2 testable as bit-equality.
- **ENG-4.4 · the numeric profile is declared** `[CONTRACT]` — there IS
  a documented profile (precision, range, operation-order rules) the
  resolver and oracles conform to; DEC-5 fills in the numbers. Bugs
  against the profile are bugs; drift outside it is undefined, not
  quietly tolerated.
- **ENG-4.5 · measure-phase oracles are budgeted and cacheable**
  `[CONTRACT]` — phase-M oracle calls (shaping, pathops) are keyed by
  `(content, constraints, oracle version)` for memoization under
  ENG-1.4, and their cost is measured per frame — the phase-M budget is
  a number, not a hope.

**Growth path.** stub metric (today, declared) → pinned shaper behind
ENG-4.1–4.3 (unblocks B-1/T-3 as INV-per-version) → pathops in
phase M with an ENG-4.5 budget (unblocks B-5/bool) → image/decode
metrics under the same versioning.

**Open studies.** OS-4a: shaper candidates under the ENG-4.3 constraint
— instrument: cross-platform golden corpus diff (feeds DEC-4, does not
make it) `[OPEN]`. OS-4b: pathops-in-measure cost at realistic bool
nesting — instrument: E9's corpus counts + bench `[OPEN]`.

**Never.** Oracle output never enters the document (law 1 already
forbids it); an oracle upgrade never rewrites stored intent.

---

## ENG-5 · time as data — transactions, journal, replay, CRDT seam

**Precedent.** Game engines treat the input log as a first-class
artifact: deterministic replay for repro, regression, and benchmarks
`[PEER]`. Figma's published multiplayer write-ups describe per-property
last-writer-wins and client-local undo `[PEER]`.

**Evidence on file.** The op layer is already journal-shaped: typed,
delta-form, enumerated write-sets, "a drag ends as if written once" is
law `[MEASURED]`. The spike ships snapshot undo (documents are values)
`[MEASURED]`. The C-matrix demonstrated field-level merges in tests but
has NEVER met a real replicated backend — named in the REPORT lose
column `[MEASURED]`. Stable identity is the named gap: NodeId is a
session-stable arena slot; format/IR stable ids are open (a.md §12)
`[MEASURED]`.

**Major contracts.**

- **ENG-5.1 · transaction = gesture** `[CONTRACT]` — the journal's unit
  is the typed op; a gesture groups ops into one transaction with
  all-or-nothing history semantics. The existing write-count law is the
  enforcement instrument.
- **ENG-5.2 · replay determinism** `[CONTRACT]` — a replay file is
  `(initial document, op log)`; playing it back yields a bit-identical
  document AND resolved tier (stands on ENG-0.3 + ENG-4.3/4.4). This is
  the property that turns "it crashed once" into a fixture.
- **ENG-5.3 · one corpus, four consumers** `[CONTRACT]` — the replay
  format is THE shared artifact: bug repro, perf bench input, fuzz seed
  (structure-aware op fuzzing), and conformance fixture. No parallel
  bespoke trace formats.
- **ENG-5.4 · stable identity precedes distribution** `[CONTRACT]` —
  ops address nodes by stable id. Session-local slot ids suffice for
  in-process history; the format-level id story (a.md §12) must lock
  BEFORE any cross-session replay, persistence-of-history, or
  multiplayer claim. Until then those features are walled, not fudged.
- **ENG-5.5 · snapshots are the honest floor** `[CONTRACT]` — history =
  invertible op log where proven, document snapshots where not (the
  spike's posture). An op is only "invertible" once its inverse is
  property-tested (`apply(op); apply(inverse(op)) ≡ identity` — the
  E-A14 out-and-back test is the template `[MEASURED]`).

**Growth path.** snapshot undo (today) → op journal + transactions →
replay rig wired into CI (ENG-0.2's corpus) → CRDT seam: run the
C-matrix against a real backend; only then multiplayer semantics
(undo-locality etc.) become design work.

**Open studies.** OS-5a: journal-vs-snapshot memory/latency crossover
at real document sizes — instrument: replay corpus + bench `[OPEN]`.
OS-5b: C-matrix vs a real backend — which merge rows survive contact
`[OPEN]`. OS-5c: multiplayer undo semantics — study Figma's
client-local model against the op journal `[PEER→OPEN]`.

---

## The cross-cutting instrument — the conformance rig

Every layer above is only cheap because ENG-0 holds; the rig is how it
keeps holding: differential tests (incremental vs full, index vs walk,
optimized paint vs reference), structure-aware op fuzzing over the
replay format, golden corpora per oracle version, and WPT-style
external pinning where a peer is the oracle (flex conformance pins to
Chromium, never to Taffy — the E4 lesson `[MEASURED]`; `grida_wpt`
is the in-repo precedent for the discipline `[MEASURED]`).

## Scope fence (named, not silent)

- **Above Skia.** Raster stays Skia; this document pioneers the
  architecture above it. No custom GPU path rendering, no rasterizer
  replacement — the differentiation is in the five layers, not under
  them.
- **Not ECS.** The arena/SOA is a storage layout, not a component
  model. Nodes keep their typed header+payload shape (the model's
  strict-states law); nothing here licenses arbitrary
  component attachment.
- **Relation to the register.** ENG-4 services DEC-4/DEC-5/DEC-6
  without deciding them; ENG-5.4 depends on the a.md §12 stable-id
  item; ENG-2's `[PRIOR]` entries cite the legacy render-opt loop and
  bind only after re-measurement here.
