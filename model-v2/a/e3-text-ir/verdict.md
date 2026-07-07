# E3 verdict — the agent text IR

**Decision: amendment 3 is validated — the anchor model is mentally
simulable by an LLM from a ~150-line grammar, at 100% on frontier-class
models.** The text IR graduates from "documentation sugar" to a designed
surface with a reference parser/printer and a scoreable conformance
protocol.

Run: 2026-07-07. Probes, truth, raw predictions and scorer are all in
this directory; re-run with `cargo run --bin e3 -- truth|score`.

## Findings

1. **Cold prediction works (triage #17).** Two independent frontier
   agents, given only the grammar, predicted all 22 resolved boxes/AABBs
   exactly (≤0.5 px) — including greedy text wrap arithmetic, flex grow
   distribution, hug sizing, the rotated-AABB envelope, and the group
   origin-placement rule. Nothing about the model required running an
   engine to know the answer. This was the design bet of
   "closed-form, locally decidable resolution" — it held.
2. **The E1-locked rule is learnable in one paragraph.** All three agents
   — including the small-model control — correctly computed the
   rotated-in-flow _layout_ consequences (container hug = 260, sibling
   displaced to 190) from four sentences of spec. The two frontier agents
   also placed the rotated box itself perfectly. This closes the
   predictability clause of [`../e1-rotation-in-flow/verdict.md`](../e1-rotation-in-flow/verdict.md):
   layout-visible rotation does not cost agent predictability.
3. **Small-model failures are slips, not structure.** Haiku's five misses
   trace to two causes: a character-count off-by-one (then compounded),
   and executing "box center at slot center" as "box corner at slot
   corner" _after stating the rule correctly_. No failure involved the
   model's semantics being ambiguous or arbitration-dependent — exactly
   the failure class a format can't fix and a linter/preview can.
4. **Grammar gap found and fixed during the run**: the two flavors of
   stretch (container `cross="stretch"` respects fixed sizes; child
   `align="stretch"` means fill and overrides) needed explicit prose —
   the first grammar draft under-specified it and the truth run exposed
   it. Recorded for the phase-3 spec: this distinction must be a
   headlined rule, not a footnote.
5. **Open item for the real IR** (recorded, not blocking): the lab IR
   does not carry node ids — re-parsing assigns document-order ids, which
   round-trips content but not identity. The product IR needs an optional
   stable-id attribute for edit workflows (agents editing an existing doc
   rather than authoring a fresh one).

## Score summary

fable-a **22/22**, fable-b **22/22**, haiku-c 17/22 (tolerance 0.5 px;
22 lines across 6 probes). Zero missing lines from any agent — the output
protocol itself (comma lines, box-vs-aabb split) was followed perfectly
by all three.
