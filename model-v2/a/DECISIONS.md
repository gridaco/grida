# DECISIONS — the open register

2026-07-07. Every red flag that needs an **owner call** lives here, one
entry each: the question, the evidence on file, the options with a
recommendation, and what the answer unblocks. Everything NOT here is
either already locked by evidence (REPORT amendments E-A1…E-A14) or
adopted-by-evidence below (appendix — veto window, not questions).

Ids are `DEC-#` (the `D-#` prefix belongs to the derived-kind
conformance suite). Status: **OPEN** until the owner answers; answers
get recorded in place and promoted to amendments/spec text.

---

## DEC-0 · the framing fork: is rotation layout-visible at all? — **DECIDED 2026-07-07 (second lock): VISUAL-ONLY (the CSS framing), CSS-pure sizing**

**Owner framing, locked after an explicit correction.** The first lock
("keep layout-visible") mis-recorded the owner's sentence — "this model
is much cleaner with the behaviour" referred to the CSS framing in the
fork demo, not the anchor arm. Corrected 2026-07-07: rotation is a
**post-layout paint transform**; sizing (flex contributions, hug,
derived unions) NEVER reads rotation or flips; the read tier
(selection, world AABBs, hit-testing) stays oriented. Sub-answer:
**CSS-pure** — sizing ignores transforms everywhere, no hybrid hug.
Normative rule set + the group-box fork decision:
[`dec0-visual-only.md`](./dec0-visual-only.md). Consequences: DEC-1/2/3
close as n/a; E-A4/E-A7/E-A11/E-A12 retire; COMPAT's Figma
rotated-in-auto-layout row degrades (importer bakes to absolute); the
lens remains the quarantine for shear/matrix (lens-rotate ≡
header-rotate behaviorally). The flip was gated on a spec review — run
same day, findings in the rule doc.

**Question (owner, 2026-07-07).** Adopt the CSS framing as the default —
rotation is a _post-layout paint transform_, the box never grows by
child rotation — trading make-room semantics for clean two-lane
semantics? Sub-questions answered below the table: free context, the
general transform, svg-first.

**Evidence.** Both arms are implemented and tested (`RotationInFlow`;
R-3 runs both) — this is a policy flip, not rework. **See it in
action:** [`dec0-fork/`](./dec0-fork) — the same seven scenes resolved
under both framings side by side, live overlap/containment meters
(measured at θ=45°: CSS arm — stretch 4,131 px² overlap; hug container
frozen while ink escapes 16.6 px; wrap never reflows, 2,661 px²; anchor
arm — 0 px² everywhere except the deliberate lens lane). E1 measured the
arms against each other: anchor arm **0 px² overlap at every angle**;
CSS arm **1,830 px²** (siblings don't make room). X-FIG-1: Figma is
layout-visible — visual-only silently changes imported geometry for
every rotated child in auto-layout (frequency = **E9**'s counter,
unknown). The tax is documented on BOTH sides: Figma's forum asks to
_stop_ envelope growth (pedantic D3); CSS had to add `writing-mode` as
a whole layout feature because paint-rotation cannot put rotated text
in flow — the one rotated-in-flow case everyone needs. The lens is
already the CSS lane inside anchor
(`lens_rotate_is_the_visual_only_twin` reproduces the CSS arm exactly).

| option                                     | gain                                                                                                                                                                                                     | lose                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **keep layout-visible (E1)** ← recommended | containment truth (0 overlap, measured); Figma import parity; rotated-text-in-flow native (demo scene reads naturally); **both lanes reachable** — the lens IS per-node CSS semantics, one structural op | the whole DEC-1/DEC-2 policy surface; E-A7 readout + D3 escapes launch-blocking; envelope math in M/L                                                                                                                                                                                                                                                                                                   |
| flip to visual-only (CSS)                  | DEC-1/DEC-2/DEC-3 close n/a; fill never fights rotation (no pops, no 45° flip); simpler flex path; the D3 ticket class never happens                                                                     | measured overlap by construction; Figma parity breaks (E9 quantifies); **no path back** — layout-visible becomes per-node unreachable (wrapping in a hug frame doesn't help: hug would read the unrotated box too); a NEW wart appears — hug/group must still union _oriented_ envelopes or selection chrome lies about ink, so the envelope math stays anyway and "auto size" forks meaning by context |

**The three sub-answers (recorded so the framing question stays sharp):**

1. _Free context is not "pre-layout" — it is the base case._ Rotation is
   ALWAYS applied in phase T, in every context; the fork is only what
   phases M/L **read** (oriented envelope vs unrotated box). A
   scene-root rectangle rotating has no L to be pre or post of; its
   envelope exists only for reads (selection, hug, union). "Pre/post
   layout" is CSS vocabulary assuming flow exists everywhere — that's
   the legacy framing, not the free canvas.
2. _The general transform is already settled and does not move._ The
   general affine lives ONLY in the lens, and the lens is paint-only in
   every context — CSS semantics already. If header rotation also went
   visual-only, header-rotate and lens-rotate become redundant
   everywhere (E-A8's distinction collapses; one of them turns legacy).
   Layout-visible keeps them meaningfully distinct: header = the flow
   lane, lens = the paint lane.
3. _svg-first + layout-as-feature is already the model's shape_ — free
   context is the default world, `Pin{Start, offset}` IS svg x/y,
   layout is a frame payload feature that overrides position.
   **Hands-on:** [`free-editing/`](./free-editing) — a live free-context
   document (no layout engine runs) with the canonical IR and a
   per-gesture typed write log; the artboard-resize gesture shows
   end/center/span responding with zero writes. What
   svg-first must NOT become is matrix-first **storage**: E5 (99% of a
   million wild transforms are structured intent), E3 (LLMs 100% on
   scalars, matrices notoriously not), E4 (kills the atan2
   reconstruction forest), CRDT 1-field writes — all measured against
   the matrix road.

**The mental model, one sentence.** A scene is a transform tree with
structured intent (SVG's semantics, not SVG's storage); layout is a
container feature that computes some boxes; rotation is always applied
after the box (phase T); the ONLY open dial is whether box computation
_reads_ the rotated envelope — never (CSS) / always (Figma, anchor
today) / per-node via lens (anchor's two-lane).

**Relation to the register.** If DEC-0 = visual-only: DEC-1/2/3 close
n/a, E-A4/E-A7/E-A11/E-A12 retire, X-FIG-1 flips to a COMPAT degrade
row. If DEC-0 = keep: the clean-semantics instinct is honored at the
actual mess instead — **DEC-1 = inert-when-rotated + DEC-2 = inert**
gives "fill never fights rotation" (most of the CSS win) while keeping
make-room, containment, and Figma parity. E9's rotated-in-auto-layout
count is the missing number either way — run it before locking.

## DEC-1 · fill intent × rotation (E-A11 + E-A12) — **CLOSED n/a (DEC-0, 2026-07-07)**

_Closed by the visual-only lock: the configuration this decision
governed no longer exists — sizing never reads rotation, so fill
never fights it (dec0-visual-only.md V-2/V-4). Body kept as the
record of the road not taken._

**Question.** What do `grow` (main axis) and `self_align:Stretch` (cross
axis) do on a **rotated** in-flow child?

**Evidence.** Today the lab pops: 240 px within 3° on grow, 70 px on
stretch (edge scenes `grow`/`stretch`). Figma verification (2026-07-07,
community-evidenced; officially undocumented): fill **stays stored and
active** on rotated children; the engine fills against the **rotated
envelope** in the parent's unrotated axis space; **which child dimension
the fill drives flips at 45°** (observed snap); at exactly 90° at least
one unresolved bug report (text). The aspect-ratio-hack genre depends on
envelope fill (`length = slot/cosθ`). **No continuous-everywhere policy
exists anywhere** — the choice is where the discontinuity lives.

| option                                          | discontinuity lives at                       | notes                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **envelope-fill + 45° axis-flip** ← recommended | 45° (same place Figma put it)                | Figma-parity class; defined at 90°; no pop at 0°; costs a bounded second per-container solve + conformance rows                    |
| pure inverse-envelope (always drive main dim)   | 90° (driven dim → ∞, clamp is our invention) | continuous elsewhere; diverges from Figma near vertical                                                                            |
| inert-when-rotated (today's lab rule, promoted) | first degree of the rotate gesture           | simplest; single-pass trivially safe; breaks Figma parity + the rotated-spacer import genre; editor should clear-and-offer-restore |
| keep basis + declare pop (E-A4 as-is)           | 3° step, 240 px                              | cheapest; reads worst in the demo                                                                                                  |

**Unblocks.** E-A11/E-A12 spec text, two conformance rows, the
`stretch`/`grow` cells of COMPAT's Figma map.

## DEC-2 · fill intent on DERIVED kinds (group/bool) — **CLOSED n/a (DEC-0, 2026-07-07)**

_Closed by the visual-only lock: the configuration this decision
governed no longer exists — sizing never reads rotation, so fill
never fights it (dec0-visual-only.md V-2/V-4). Body kept as the
record of the road not taken._

**Question.** A group sits in a flex row with `grow`/`stretch` — today
silently inert. Figma's answer: a stretched group **rescales its
children** (groups resize by scaling).

| option                                   | notes                                                                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **inert-with-report** ← recommended (v1) | derived boxes never take layout-imposed size; report instead of silence; Figma-like rescale stays an explicit editor gesture (K parametric bake); CRDT-clean, reads-never-write preserved |
| resolved-tier visual scale-to-slot       | lens-like render-time scale, nothing stored; xywh reads diverge from ink; hit-testing needs the scaled tier                                                                               |
| K-bake at gesture time                   | true Figma semantics but a write fan-out across members; reflow-driven slot changes still need one of the above at resolve time                                                           |

## DEC-3 · rotate-gesture escapes: launch-blocking? — **CLOSED n/a (DEC-0, 2026-07-07)**

_Closed by the visual-only lock: the configuration this decision
governed no longer exists — sizing never reads rotation, so fill
never fights it (dec0-visual-only.md V-2/V-4). Body kept as the
record of the road not taken._

**Question.** Are the D3 escapes — rotate-HUD one-click "keep slot
fixed" (wrap/lens re-target) + the E-A7 envelope readout — **v1 ship
requirements** in editor.md, or fast-follows?

**Evidence.** Figma's forum record shows this exact behavior class
("prevent rotated image growing the bounding box") as a recurring
ticket generator; E1 measured smoothness, not user reaction.
Recommended: **launch-blocking** — the model's boldest choice ships
with its pressure valve.

## DEC-4 · text determinism posture (blocker B-1) — OPEN

**Question.** T-3 promises identical measured text geometry
cross-platform within ε — unsatisfiable with real fonts (a 1-ULP
advance difference flips a line count; no ε absorbs a line-height
jump). Pick the posture.

| option                                       | notes                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pin a deterministic shaper** ← recommended | one versioned shaping stack, bit-exact per version; T-3 survives as an INV-per-shaper-version; Figma ships its own text stack for exactly this reason; CRDT/multiplayer + server rendering need stable line counts; cost: we own the pipeline, shaper upgrades become format-versioned events |
| per-platform goldens                         | T-3 re-scoped to (platform, font stack); cross-platform docs may reflow; cheaper now, divergence surfaces in multiplayer                                                                                                                                                                      |
| defer, quarantine T-3                        | honest but leaves the loudest blocker open; dependent specs cite an unresolved invariant                                                                                                                                                                                                      |

## DEC-5 · coordinate budget (blocker B-2) — OPEN

**Question.** ULP(1e7) = 1 px, so N-1's "error bounded at ±1e7" cannot
hold in a normative-f32 pipeline. Declare the budget.

| option                                               | notes                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **declared f32 budget: ±1e6 @ 0.1 px** ← recommended | matches the Skia/engine reality and Figma's accepted-limited-range posture; N-1 rewritten with the honest numbers |
| f64 resolved tier                                    | doubles resolved-tier memory, wasm-boundary cost; Blink-style 1/64 fixed-point is a third path nobody asked for   |

## DEC-6 · bool bounds fork (blocker B-5) — OPEN

**Question.** `bool` box source: **op-result** bounds (D-5, correct —
subtract-to-empty reports empty) requires render-grade path booleans
inside Phase M (unbuilt, unbudgeted). **Figma reports operand-union.**

| option                                                             | notes                                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **keep D-5 op-result; bool ships when pathops land** ← recommended | no wrong reads ever shipped; bool stays ⛔ until the engine dependency exists       |
| operand-union v1 (Figma parity)                                    | cheap now; xywh lies for subtractive ops; migrating later is a breaking read change |
| two named reads (union now, op-result later additive)              | honest but two truths for one box — the exact ambiguity a.md §3 exists to kill      |

## DEC-7 · format RMW posture (E-A6 / pedantic C4) — OPEN

**Question.** FlatBuffers decode→re-encode through an old schema
verifiably **drops unknown fields** (E2), yet conformance M-4 still
claims INV "preserves unknown content through RMW".

| option                                                          | notes                                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **version-gated writers + M-4 downgraded to POL** ← recommended | writers must be ≥ the document's schema version or refuse; the declared drop-window is zero; simplest honest contract |
| buffer-retention patching                                       | true RMW preservation; substantial format-layer machinery for a lab-stage format                                      |
| leave M-4 as INV                                                | fails as measured — not an option, listed for completeness                                                            |

## DEC-8 · E8 + E9 sequencing — OPEN

**Question.** Two dealbreaker-class seams were never measured: **E8**
(transpile the E1 document to HTML/CSS, measure the loss class — the
tenant-site web bill) and **E9** (E5-style scanner over the io-figma
corpus: SCALE constraints, rotated-in-auto-layout counts,
`normalizedSize≠size`, boolean nesting, **negative determinants** —
which also quantifies DEC-9's "how often do designs carry mirrors").

Recommended: **run both before the phase-3 rewrite** — E9 is cheap
(harness exists), E8 is a day-scale experiment; both feed lock
conditions the rewrite must cite.

## DEC-10 · the lens's NAME (taxonomy, not spec) — OPEN

**Question (owner, 2026-07-07).** Doubts about the name `lens`: should
`group` absorb the lens's job, or should it be renamed (`tgroup` /
"transform group")?

**The genus taxonomy** (why the SPLIT stays regardless of the name):
`frame` OWNS space · `group` IS a set (nothing else — GROUP.md; its
powers: transparent-select, E-A13 pass-through, 3-scalar ungroup bake,
all depend on refusing ops) · `lens` is a VIEW (derived box, ordered
paint ops, quarantine-opaque). A group-with-optional-ops is a two-thing
kind — every consumer forks on "has ops?" and the name gates nothing.
Figma corroborates: they shipped **TransformGroupNode as a separate
node**, not by growing GroupNode.

**Post-DEC-0 axis check:** "transform group" names the WRONG axis now —
plain groups also transform (header rotation/flip, paint-only). The
lens's real distinction is _structured scalars vs ordered arbitrary
ops_ (shear/matrix/retained-scale/3D-reserved) — the sub-1% quarantine
(E5), rarer still since E-A8 inverted (lens-only-rotate always
redundant).

| candidate                  | commits to                                                                                                                                          | verdict                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `lens` (incumbent)         | a view: non-destructive, removable, layout-transparent — the metaphor carries the load-bearing semantics; unique, greppable, terse-uniqueness holds | jargon; must be taught once       |
| `tgroup` / transform group | group genus — imports FALSE expectations (pass-through? transparent-select? ungroup?); wrong axis post-DEC-0                                        | fails "refuses the wrong content" |
| `transform`                | instantly readable but maximally overloaded — every node colloquially "has a transform"; grep pollution; gates nothing                              | fails uniqueness                  |

**Recommendation:** keep `lens` as the FORMAT name (public commitment,
expensive to change after `.fbs` ships); the UI DISPLAY label is a
separate cheap decision (naming doctrine: public names and surface
labels may diverge — Figma's kiwi names ≠ UI names) and can say
"Transform" if user-testing prefers it. If doubt persists at phase 3,
run the cheap empirical probe: A/B the kind name in the E3 grammar
with cold LLMs and measure misuse (do they expect ungroup? try to give
it layout?). Merging into group is rejected under any name.

## DEC-9 · resize across zero: wall / slide / flip — OPEN (evidence built)

**Question.** Drag a resize handle past the fixed edge. The current
model walls (typed reject). Figma flips — uniformly, every node kind,
frames and text included, because it all shares one render transform.
Owner lean (2026-07-07): "actually flip, like SVG — the inner paint
mirrors too — is more correct in 2D graphics; happens quite often, not
critically often."

**Evidence built today** (the E-A14 arm): `flip_x`/`flip_y` are live in
the lab; the `resize_drag` op re-targets across zero (|extent| + flip
toggle + re-pin; 2–3 writes; **out-and-back = document identity**,
lab-tested); the typed `set_width(−50)` stays a wall
(`NegativeExtent`); flip is layout-invisible for boxed kinds by
construction. 11 tests green ([`lab/tests/flip.rs`](./lab/tests/flip.rs));
three-policy interactive demo: [`edge-cases/`](./edge-cases) scene
"resize across zero".

| option                                                            | notes                                                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **flip (true mirror, uniform)** ← recommended, matches owner lean | Figma-parity ("same rt"): paint, children, text, image fills all mirror; the only arm where directional content keeps tracking the hand; already implemented + tested |
| slide (re-pin, never mirror)                                      | rect tracks the hand but arrows/image fills/glyphs stay right-way-round — reads broken mid-gesture on any asymmetric content                                          |
| wall (reject at zero)                                             | the pre-decision model; the hand keeps moving, the box doesn't follow                                                                                                 |

**Sub-decision (only if flip):** uniform mirror includes TEXT (glyphs
render reversed — Figma does this; some tools exempt text). Recommended:
**uniform** — exemptions break "one render transform" and make ungroup
bakes kind-dependent. Import note: mirrored `.fig`/SVG content maps to
the flip bits natively (E-A2); E9 will count how often.

---

## Appendix · adopted-by-evidence (veto window, not questions)

Recorded as decided because peers agree and/or a test now enforces it —
say the word to reopen any of them:

1. **B-3 uniform clamp-then-re-measure** — min/max clamps re-measure in
   both free and flex contexts (both studied peers re-measure).
2. **Law 9 free-context qualifier** — "never moves siblings" holds in
   free context; in flow a union change legitimately reflows (Figma
   agrees).
3. **min/max clamps bound the box, never the envelope.**
4. **Flip pivot per kind = rotation's rule** (pedantic B1) — center for
   boxed/measured, own origin for derived. Now lab-tested (F-3).
5. **Flip composes innermost** (`T·R·F`) — declared + tested (F-2).
6. **Winding reads the stored rotation scalar** — it _is_ intent
   (resolves the law-7 / R-E2 / H5 three-way).
7. **−0.0 canonicalized at the write boundary** (R-E3, tested).
8. **NegativeExtent is a typed op error** — extents non-negative stays
   bedrock; only the drag gesture re-targets across zero (E-A14).
9. **Declare-only punch list** (resolver reports, no semantics change):
   empty-derived placeholder-at-pins; hidden children skipped from
   union (MM-6 written); NaN guard over every lens-op scalar; 3D lens
   ops = render-skip + preserve; giant-word ink-bounds ⊃ box declared
   for hit/cull; empty group spends two gaps in flex (CSS agrees).
