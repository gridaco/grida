# Pedantic review — the anchor model (MODEL.md + REPORT.md)

2026-07-07. Four adversarial lenses (bedrock/logic, UX, engineering,
market) + an edge-case hunter, run as a panel; findings below are the
survivors after cross-checking against the docs, the lab, and — where a
claim was executable — **construction tests** (the edge-case sweep
`lab/src/bin/edge.rs` → [`edge-cases/`](./edge-cases), whose data
independently confirmed two findings before the panel returned them).

**Verdict: the core survives — the two-axis model, layout-visible
rotation, the points-law direction, and the four-phase resolver are
genuinely evidenced. MODEL.md as a phase-3 seed needs rework in seven
places, and two market-facing seams were never measured at all.**
Findings in target order; severity per finding.

---

## A. Machine-verified (a failing construction exists)

**A1 — grow × rotation is discontinuous at θ=0 (SERIOUS, new E-A11).**
Quote: "grow expands the slot; a rotated child's box keeps its basis"
(E-A4). Constructed: fixed row, middle card `grow:1` — at θ=0 the box
fills 300 px; at θ=3° it snaps to its 60 px basis. **240 px jump in one
3° step**, measured by the edge sweep (scene `grow`). E-A4 never defined
the θ=0 boundary. _Resolution:_ inverse-envelope fill — the box takes
the largest extent whose rotated envelope fits the grown slot
(continuous at 0°, reads as "a filling card stays filling while it
turns"); or at minimum declare the pop and make the editor clear `grow`
on rotate. Conformance row owed.

**A2 — stretch × rotation is a silent pop (SERIOUS, new E-A12).**
Constructed: `align:stretch` child stretches to 170 px tall at θ=0,
pops to 100 px at θ=3° (scene `stretch`; 70 px jump). The lab's
`contribute_aabb` branch silently skips the stretch override and the
text measure closure — an **unstated rule that is currently
load-bearing** for both "zero overlap by construction" and "single-pass
acyclic" (the bedrock lens derived the same gap from the applicability
matrix alone: §8 says grow/self_align are unconditionally "effective"
in flow, which is false for θ≠0). _Resolution:_ promote the policy to
spec text: for θ≠0 in-flow children, `self_align:Stretch` and
layout-imposed re-measure are ignored-by-rule **with report**; same
continuity treatment as A1.

**A3 — the bool box-source cell in MODEL.md is wrong (SERIOUS).**
MODEL.md's table: `bool` = "derived (union of oriented children)".
a.md §3 and conformance **D-5** say: op-_result_ bounds (subtract-to-
empty: union is large, result is empty — they differ by construction).
Transcription drift in the consolidated statement; REPORT's lose column
concedes bool never ran, so no test caught it. _Resolution:_ fixed in
MODEL.md (this pass); lab test (subtract-to-empty) owed before phase 3.

## B. Counterexample-verified (constructible on paper, no lab arm yet)

**B1 — flip pivot violates D-2 for derived kinds (SERIOUS).** E-A2 says
flips are "center-applied" with no derived-kind carve-out. Counter-
example: group with `flip_x`, move child A → union widens → union
center shifts → mirrored sibling B moves in world space — the exact P6
instability E-A1 exists to kill. Flip is unimplemented in the lab
(`grep flip lab/src` = 0 hits): the corpus forced flip's _existence_,
not its _semantics_. _Resolution:_ flip pivot per kind exactly as
rotation (center for boxed/measured, own-origin for derived); D-2-with-
flip conformance row; lab arm.

**B2 — E-A9's write side has a stationarity counterexample
(DEALBREAKER-class for law 6 as written).** Fixed-box vector (box
48×48, ref 24×24): drag ONE vertex outward → if the ref rect re-derives
(T-5), `box/ref` changes and **every untouched vertex visibly moves**.
The disjoint-fields CRDT story also only holds for a _stored_ ref rect
— normalize-at-write renormalization rewrites every vertex on any
bound-moving edit, resurrecting the write amplification E-A9 was minted
to kill. Plus: zero-extent reference axis (any straight-line vector) →
division by zero at render, reachable from a shipping document (N-2
promises NaN-free). _Resolution set (lock before phase 3):_ ref rect =
**free intent** (explicitly exempt from law 1 — same status as Figma's
`normalizedSize`, which is bake-time state, not point bounds); **forbid
origin/bounds renormalization as a gesture side effect**; vertex-edit =
declared atomic write-set with a stationarity guarantee; zero-extent
axis → translation-only mapping (POL; check a straight-line .fig
fixture first — io-figma harness exists); rewrite T-5 with Auto/Fixed
arms; implement the vector kind in the lab with a resize∥vertex-edit
test.

**B3 — law 8 contradicts itself and the lab (MODERATE).** "The op layer
never hard-walls… a rejected op leaves the document byte-identical" —
both halves can't rule. The lab (cited as proof) _rejects_:
`Err(AxisOwnedBySpan)`, `Err(OwnedByLayout)`; M-2 locks a typed-error
list. _Resolution:_ two enumerated regimes — the re-target set (writes
that coerce, with report) and the reject set (M-2's list, byte-
identical) — and MODEL.md says which is which.

**B4 — reads-materialize/writes-retarget has a counterexample (SERIOUS,
editor seam).** Type W into the inspector of a `grow:1` (or stretched)
child: the echo cannot equal the typed value unless the write also
clears `grow`/`self_align`. Figma's answer (clears fill on W write) is
the researched precedent. _Resolution:_ editor.md rule — a W/H write on
a grown/stretched child clears the growth intent (session-memory
restorable); law 7 carve-out stated.

**B5 — group rotation typed into an inspector lurches (SERIOUS, editor
seam).** Raw `rotation` write on a group = origin pivot (E-A1's
"bindings place the origin" can sit far from visible content); the
center-feel result requires the 3-write OP-ROT-3 gesture. A numeric
inspector field is a raw write today. _Resolution:_ inspector rotation
on derived kinds routes through OP-ROT-3 (compensated); spec'd in
editor.md, not left to implementers. (The edge demo's `group` scene
shows flow placement stays centered — the resolver's slot-centering
hides the pivot in flow; free context is where the lurch lives.)

## C. Leaked uncertainty / overclaims in MODEL.md prose

**C1 — "E-A1…E-A10 folded into one coherent statement" is false
(MODERATE, verified by grep).** E-A4, E-A5, E-A7, E-A8 are absent.
Worse: E-A5 (underdetermined bindings error-by-rule) is the _acyclicity
guard_ — without it stated, "single-pass, acyclic" has a constructible
cycle (Span ← parent hug ← child extents). _Resolution:_ fold or
narrow the claim (this pass narrows it); E-A5 stated next to the
acyclicity claim.

**C2 — locality overclaim (MODERATE).** "18 µs locality" drops E4's own
qualifier ("under clean parent boxes"); a text edit in a hug chain
propagates to the nearest fixed-extent ancestor (the flagship card-list
example violates the clean-parent precondition). And "subtree-local
invalidation by structure" presents as achieved what REPORT quarantines
("no incremental resolver"). _Resolution:_ state the dirty-propagation
rule (up the measure chain to the nearest fixed-extent ancestor) and
the 18 µs precondition.

**C3 — E3 citation drops its own quarantine (MINOR but strategic).**
"LLMs predicted cold at 100%" without "n=3 models, 6 documents,
authoring-only, no stable ids". Law 7's write half (agent edit-in-place)
is _open_, not proven — no ids means positional identity breaks on
reorder+edit. _Resolution:_ carry the protocol caveat; split law 7
(reads proven / IR writes pending stable ids).

**C4 — M-4 is an INV the chosen encoding verifiably fails (MODERATE).**
E-A6 measured FlatBuffers dropping unknown fields on old-schema
re-encode, yet conformance M-4 still says INV "preserves unknown
content through RMW". _Resolution:_ decide E-A6 (buffer-retention vs
version-gated writers) or downgrade M-4 to POL with the declared
answer — before phase 3, since S-5/forward-compat cite it.

**C5 — lens `Scale` is a scalar; Framer-Graphic semantics are
box-proportional (MODERATE, honest-trade finding).** E7 oversold the
equivalence: a retained scalar cannot track the box, so "icon scales
proportionally _when its box resizes_" is still unrepresentable
retained. _Resolution:_ declare the trade explicitly (substitutes: K
bake, per-leaf mapped vectors) or add a box-relative scale variant to
the lens vocabulary later — additive either way.

**C6 — the lens has no opt-in (MODERATE, UX).** MODEL.md calls the
proportional world "the opt-in lens"; editor.md has no lens-creating
or lens-resizing operation — the only producer is SVG import. Resize
handles on a lens are undefined (pre-ops box vs post-ops visual).
_Resolution:_ OP rows: "wrap in lens", "lens resize re-targets the
Scale op", hit/chrome tracks post-ops visual.

## D. The two unmeasured market seams

**D1 — "lossless transpile to CSS" is unfalsifiable as claimed
(DEALBREAKER-class for the web story).** finale.md's concession table
carries it; layout-visible rotation **has no CSS flexbox equivalent**
— a `grow:1 rotation:20` child cannot be projected losslessly. Grida
ships a DOM-rendered tenant-site surface today. _Resolution:_ **E8** —
transpile the E1 document to HTML/CSS, measure the loss class, decide
the projection mechanism (per-breakpoint bake of resolved geometry /
JS resolver runtime / declared degradation table). Until E8 runs, the
web bill is unpaid, not cheap.

**D2 — the Figma corpus was never scanned (SERIOUS).** Triage #3 made
Figma-convertibility the hard requirement; E5 measured a _million SVG
transforms_ and zero `.fig` nodes. Known concrete gap: Figma's SCALE
constraint has no v1 equivalent (percent pins are deferred). _Resolution:_
**E9** — E5-style scanner over the io-figma corpus counting constraint
types (esp. SCALE), rotated children in auto-layout,
`normalizedSize≠size` vectors, boolean nesting, negative determinants.
Also: declare the export posture (flatten-to-frames lossy table, or
export-is-a-non-goal) — round-trip silence reads as a hidden "no".

**D3 — the Figma community record predicts the #1 support ticket
(SERIOUS, UX-market).** Figma's forum carries recurring tickets against
exactly this behavior class ("prevent rotated images increasing the
component's bounding box"). E1 measured smoothness, not user reaction.
_Resolution:_ the escapes are launch-blocking editor affordances, not
notes — rotate-HUD one-click "keep slot fixed" (wrap/lens re-target) +
envelope readout (E-A7). Also fold the "Fill" sugar (`width="fill"` in
IR/inspector redirecting to grow/stretch/span with report) — one user
concept, three intents, incumbents spell it as one word.

## Cleared by the panel (pressed, survived)

Layout-visible rotation itself (Figma parity X-FIG-1 + E1 measurement);
the no-Fill _model_ (given D3's sugar); reads-materialize for
copy/paste (natural); origin-placement E-A1 (D-2 holds, lab-tested);
the two-scales split (K vs lens, given C5/C6 fixes); text-measure-
unrotated (industry-standard dodge, edge scene reads naturally); wrap
line-hop (discrete by nature, CSS-equivalent; editor should animate);
rotated-frame rigidity, space-between symmetry, two-envelope
composition — all smooth in the sweep with sub-bound step sizes.

## Disposition

MODEL.md surgically corrected this pass: A3 (bool cell), C1 (folded-
claim narrowed + E-A5 stated), C2 (locality qualified), B3 (law 8 two
regimes), C3 (E3 caveat), law 6 marked open-pending-B2. Everything
else lands as phase-3 lock conditions: **E-A11** (A1), **E-A12** (A2),
the B2 lock set, B1 flip pivots, B4/B5/C6 editor.md rows, C4 M-4
decision, C5 declared trade, **E8** and **E9** as new ledger
experiments. The demo for A1/A2 and the cleared scenes is
[`edge-cases/`](./edge-cases) (interactive; discontinuity meter).
