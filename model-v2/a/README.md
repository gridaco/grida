# `anchor` — phase-3 kick-off & experiments workbench

This directory hosts the experiments, spikes, and spec drafts for
**`anchor`**, the winning model of the model-v2 redesign
(decided 2026-07-07 via the owner triage). This README is written to be
**self-sufficient for session re-entry after context compaction** — read it
top to bottom and you have working state.

> **2026-07-07 — the ledger has been RUN.** E1–E7 and E10 are complete with
> verdicts; the lab implementation lives in [`lab/`](./lab) (**114** conformance-derived tests green). Start at **[`REPORT.md`](./REPORT.md)**
> — win/lose/lessons-learnt and the fourteen spec deltas (E-A1…E-A14 + Taffy
> guards). The consolidated model statement — the phase-3 seed — is
> **[`MODEL.md`](./MODEL.md)**.

## State of decisions (compressed)

| decision      | state                                                                                                                                                                                                                  | where                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Main model    | **`anchor`** — intent-canonical anchored box model                                                                                                                                                                     | [`../models/a.md`](../models/a.md) (the model spec draft)                  |
| How decided   | 32-question model-blind owner triage; deciders: canvas-truth (#1) + "the CSS path already exists as the `htmlcss` engine; the new taxonomy exists to be a new editor-first standard" (#6)                              | [`../triage.md`](../triage.md), instrument: [`../survey.md`](../survey.md) |
| Retired       | `sheet` (adopt-CSS — its domain is the existing htmlcss engine), `bake` (post-T1), `wire` (deferred; re-enters additively via `Pin.to`)                                                                                | [`../finale.md`](../finale.md), [`../models/`](../models/)                 |
| ~~Open fork~~ | rotation-in-flow — **DECIDED: VISUAL-ONLY** (DEC-0 second lock, 2026-07-07; rules in [`dec0-visual-only.md`](./dec0-visual-only.md)); E1's layout-visible arm stays implemented + tested as the documented alternative | [`e1-rotation-in-flow/verdict.md`](./e1-rotation-in-flow/verdict.md)       |

### The five triage amendments (binding on everything here)

1. **No file-carried switch-memory** — toggle-back restoration is editor
   session state; the file holds only current truth.
2. **Strict states, lenient writes** — invalid documents unrepresentable;
   the write/op layer never hard-walls (coerce/redirect, always reported,
   never silent). H12 applies at the op layer as
   "effective-or-coerced-with-report".
3. **Agent text IR is a first-class surface** — an XML-ish textual
   projection that round-trips with the binary format; audience = LLMs
   (must be able to write it and _predict geometry mentally_). H1's
   audience is agents, not human file-readers.
4. **Familiar vocabulary** — `x`, `width`, `rotation`, `flex`, `gap`,
   `padding` wherever semantics coincide; new terms only where the
   correction is the point.
5. **SVG import ≈100%** — hard requirement; exotic-transform carrying
   mechanism open (lens-quarantine default, declared degradation
   acceptable), decided by corpus measurement (E5).

## The model in ten lines (recap of `../models/a.md`)

- Node = **uniform header + typed payload**. Header: `x`/`y` as
  `AxisBinding = Pin{start|center|end, offset} | Span{start, end}`;
  `width`/`height` as `SizeIntent = Fixed | Auto` (no Fill — growth via
  `grow`, stretch via `self_align`/`Span`); `rotation: f32` degrees;
  `flow`, `grow`, `self_align`; layer props. No stored matrices anywhere.
- Kinds: `frame, tray, shape, image, text, embed, vector, group, bool,
lens`. Shape descriptors are size-free, evaluated at the resolved box.
- Box sources: declared / measured (text, vector — intent = constraints) /
  derived (group, bool, lens — never store size).
- Rotation pivot: box center (boxed/measured); own origin + gesture
  compensation (derived). `lens` = sole home for skew/matrix/3D ops.
- Resolution: measure → layout (flex over unrotated boxes — DEC-0
  visual-only; rotation applies in phase T, post-layout) →
  transforms (`from_box_center`) → bounds. One-way; resolved tier never
  serializes ("derivable ⇒ not encodable").

## Experiment ledger

One subdirectory per experiment (`e1-…/`), each with its own README
(question, method, decides-what) and a `verdict.md` when concluded.
Code: small standalone crates/scripts inside the experiment dir, **not**
wired into the workspace; promote into `crates/`/`format/` only at phase 4.

| id                    | experiment                                                                      | status (2026-07-07)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1**                | rotation-in-flow prototype                                                      | **DONE — layout-visible locked** (0 overlap vs 1,830 px²; smooth within analytic bound; breathing confirms two-lane) → [verdict](./e1-rotation-in-flow/verdict.md), [demo.html](./e1-rotation-in-flow/demo.html)                                                                                                                                                                                                                                                                             |
| **E2**                | fbs schema draft + codec round-trip                                             | **DONE — pass** (S-1 byte-fixpoint, H11 structural unset witnessed, M-4 both directions; RMW policy owed) → [verdict](./e2-format/README.md)                                                                                                                                                                                                                                                                                                                                                 |
| **E3**                | agent text IR                                                                   | **DONE — validated** (frontier 22/22 cold prediction ×2; grammar + probes + scorer reusable) → [verdict](./e3-text-ir/verdict.md)                                                                                                                                                                                                                                                                                                                                                            |
| **E4**                | resolver spike                                                                  | **DONE — viable** (10k/5.4 ms; linear; 18 µs locality bound; 2 Taffy findings) → [verdict](./e4-resolver/verdict.md)                                                                                                                                                                                                                                                                                                                                                                         |
| **E5**                | SVG import corpus measurement                                                   | **DONE — quarantine + native-flip amendment** (1M transforms: shear 0.95%, flip 26.1%) → [verdict](./e5-svg-corpus/verdict.md)                                                                                                                                                                                                                                                                                                                                                               |
| **E6**                | pluggable-layout sketch                                                         | **DONE — non-binding** (the contributions→slots seam exists; keep core at two modes) → [sketch](./e6-pluggable-layout/SKETCH.md)                                                                                                                                                                                                                                                                                                                                                             |
| **E7**                | shape-vs-layout / points / two scales (owner question)                          | **DONE — research verdict** (XYWH-vs-shape solved by design; E-A9 vector reference-space; E-A10 two-scales rule; Graphics container rejected-as-requirement) → [findings](./e7-shape-points-scale/README.md)                                                                                                                                                                                                                                                                                 |
| **E-rev**             | pedantic panel (bedrock/UX/eng/market) + edge sweep                             | **DONE** — core survives; 7 MODEL.md corrections applied; E-A11/E-A12 minted (grow/stretch × rotation pops, machine-verified); E8 (CSS projection) + E9 (Figma corpus) opened → [pedantic-review.md](./pedantic-review.md), [edge-cases/](./edge-cases)                                                                                                                                                                                                                                      |
| **GROUP**             | what a group is (owner question)                                                | **DONE** — definition locked (“a named set with a coordinate space — nothing else”); E-A13 proposed (constraint pass-through, acyclic via E-A1); Figma semantics verified from primary sources → [`GROUP.md`](./GROUP.md)                                                                                                                                                                                                                                                                    |
| **E-census**          | edge census across all kinds + import maps                                      | **DONE** — [`LIMITS.md`](./LIMITS.md) (kind×mechanism matrix, 5 bugs found+fixed, 5 blockers, the 🔶 punch list); [`COMPAT.md`](./COMPAT.md) (css/svg/figma → grida maps + harness clause H13); lab at **81 tests** (92 after the flip arm)                                                                                                                                                                                                                                                  |
| **E-flip**            | cross-zero resize + flip semantics (owner red flag)                             | **BUILT** — E-A14: flip live in the lab (pivot per kind, `T·R·F` innermost, layout-invisible, σ-exact ungroup bake, NegativeExtent wall, `resize_drag` out-and-back identity); 11 tests; three-policy demo scene in [`edge-cases/`](./edge-cases); gesture policy = DEC-9                                                                                                                                                                                                                    |
| **DECISIONS**         | the open owner-call register                                                    | **DEC-0 DECIDED: visual-only (owner framing; second lock)** — [`DECISIONS.md`](./DECISIONS.md) + [`dec0-visual-only.md`](./dec0-visual-only.md); DEC-1/2/3 closed n/a by it · DEC-4 text determinism · DEC-5 f32 budget · DEC-6 bool bounds · DEC-7 format RMW · DEC-8 E8/E9 · DEC-9 wall/slide/flip · DEC-10 lens naming — answer in one pass; adopted-by-evidence appendix carries the veto window                                                                                         |
| **DEC-0 fork demo**   | see the framing fork, not guess it                                              | **BUILT** — [`dec0-fork/`](./dec0-fork): seven scenes × two framings side by side (`lab/src/bin/fork.rs`, real resolver both arms), live overlap / container-breathing / ink-escape meters; the two-lane asymmetry scene (header-rot vs lens-rot)                                                                                                                                                                                                                                            |
| **DEC-0 flip**        | the second lock: visual-only default (CSS framing, CSS-pure sizing)             | **DONE** — [`dec0-visual-only.md`](./dec0-visual-only.md) (rules V-1…V-10; the V-4 group-box fork was real UB, decided sizing-tier); lab default flipped, hug/union CSS-pure behind the flag; `tests/visual_only.rs` (+14, suite **114**); E-A4/7/8/11/12 retired; spike re-cut (ink-bounds chrome, shots regenerated)                                                                                                                                                                       |
| **free-editing demo** | the base case, hands on (owner question: "without layout, how does it work?")   | **BUILT** — [`free-editing/`](./free-editing): live free-context mini-editor (JS mirror of the free rules — no Taffy, which is the point); live canonical IR, per-gesture write counts incl. typed errors, 0-write artboard responsiveness                                                                                                                                                                                                                                                   |
| **E10**               | the feel spike: does the model drive a REAL editor? (owner: feel it + textbook) | **BUILT** — [`spike-canvas/`](./spike-canvas): native winit+Skia app on the lab (`cargo run --release`); resolve-per-frame thesis MEASURED (starter frame 0.17 ms; 10k nodes paint-bound at 9 ms); arena+SOA storage evolution in the lab (**up to 11.5× resolver speedup**, 100 tests); interaction FSM, HUD w/ E-A7 readout, cross-zero flip gesture, undo, live+editable IR panel, reports-as-badges; [`TEXTBOOK.md`](./spike-canvas/TEXTBOOK.md) + [`SPIKE.md`](./spike-canvas/SPIKE.md) |

All verdicts + the spec deltas roll up in [`REPORT.md`](./REPORT.md).
Implementation: [`lab/`](./lab) — standalone crate, `cargo test` (114
green), bins `e1`, `e3`, `e4`, `e5scan`, `edge`, `fork`.

## Phase-3 definition of done

1. DEC-0 verdict folded in (visual-only, rules V-1…V-10) → R-3/OP-ROT-2
   become `INV`, not `POL`.
2. Normative spec: `../models/a.md` rewritten as spec (amendments folded,
   every `POL` in [`../conformance.md`](../conformance.md) answered and
   locked, applicability matrix final).
3. `grida.fbs` draft (E2) + text-IR grammar (E3) as spec appendices.
4. Conformance corpus stubbed with stable IDs (`covered_by` linkage).
5. WG graduation: code-agnostic write-up into `docs/wg/` (docs-wg
   doctrine), with model-v2 remaining the working record.

## Re-entry protocol (post-compaction)

Read in this order — ~10 minutes to full context:

1. This file (state + amendments + ledger).
2. [`../models/a.md`](../models/a.md) — the model itself.
3. [`../triage.md`](../triage.md) — why, in the owner's own words.
4. [`../conformance.md`](../conformance.md) §FORK rows +
   [`../editor.md`](../editor.md) doctrine — the behavioral contracts.
5. Skim [`../problems.md`](../problems.md) / [`../harnesses.md`](../harnesses.md)
   only when a design argument needs its source.

Also standing: this workbench lives on the **`model-v2-anchor`** branch
(tracking issue
[gridaco/grida#957](https://github.com/gridaco/grida/issues/957), pinned);
pushes require owner approval, per turn. The session convention is
grounding-first, problems before solutions, and no scope beyond
**Rust engine + format spec** — other seams (TS editor, WASM bindings)
follow after the model lands.
