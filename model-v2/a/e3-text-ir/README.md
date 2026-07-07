# E3 — the agent text IR

**Question.** Triage amendment 3 makes an XML-ish textual projection a
first-class product surface whose audience is LLMs: an agent must be able
to _write_ a document and _predict its resolved geometry mentally_
(triage #17 "critical", #20 "the agent should be tricked it's writing a
file"). Is the anchor model actually mentally simulable from a spec alone?

**Deliverables here.**

- [`grammar.md`](./grammar.md) — the pocket grammar + hand-resolution
  semantics (the exact text given to probe agents; also the seed of the
  phase-3 text-IR spec).
- Reference implementation: parser + canonical printer in
  [`../lab/src/textir.rs`](../lab/src/textir.rs), with round-trip tests
  (`parse ∘ print` fixpoint; a.md §7 quartet expressed and resolved —
  `../lab/tests/textir_suite.rs`).
- [`probes/`](./probes) — six probe documents: bindings/span (p1), flex
  grow + cross alignment (p2), hug + text wrap + stretch (p3), free
  rotation AABB (p4), **rotated-in-flow** under the E1-locked rule (p5),
  group union + origin placement (p6).
- [`truth.txt`](./truth.txt) — resolver ground truth
  (`cargo run --bin e3 -- truth`).
- [`predictions/`](./predictions) — raw agent outputs, scored by
  `cargo run --bin e3 -- score <file>` (tolerance 0.5 px).

**Probe protocol.** Three fresh agents (two Fable-class, one Haiku-class
as a small-model control), given ONLY the grammar text and the six
documents inline. No tools, no resolver, no prior context from this
workbench. Output: `file,node,box|aabb,x,y,w,h` lines for every named
node (22 lines).

**Results (2026-07-07).**

| agent   | score     | failures                                                                                                                                                                               |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fable-a | **22/22** | —                                                                                                                                                                                      |
| fable-b | **22/22** | —                                                                                                                                                                                      |
| haiku-c | 17/22     | p3: counted 15 chars as 14 (wrap off-by-one) and stretched a fixed-width shape against the stated rule; p5: stated the slot-center rule correctly, then placed the box at slot _start_ |

The verdict lives in [`verdict.md`](./verdict.md).
