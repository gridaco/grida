# The shape survey — 32 gut questions

The instrument, saved without answers or verdict. (The 2026-07-07 run's
answers and synthesis live in [`triage.md`](./triage.md); this document is
the reusable questionnaire itself.)

**Purpose.** Decide the shape of a document/geometry model without arguing
about models. Every question is high-level, model-blind, and answerable by
gut. The questions triangulate the axes a model must serve — product truth,
pattern-following, authoring, engineering discipline, LLM/agent fit,
collaboration, evolution, capability, effort — so that a shape _falls out_
of the answers instead of being debated into existence.

**How to administer.**

- Answer fast; the gut is the instrument. If a question forces engineering
  analysis, skip or annotate — a refusal is itself signal.
- Never name candidate models in questions or options.
- Free-text answers beat the offered options when the gut says something
  the options don't.
- Keep any scoring key hidden until all rounds are answered.
- 8 rounds × 4 questions; each should take seconds.

---

## Round 1 — truth & identity

**1. Truth.** When the canvas and the deployed web page disagree about the
same design, which one is wrong?
— The web is wrong (canvas is source of truth; web chases it) ·
The canvas is wrong (the deploy target defines reality) ·
Depends on surface (two regimes).

**2. Document nature.** In your gut, a document file is closest to…
— A program (engines evaluate it into the picture) ·
A picture (a finished arrangement; consumers draw it) ·
A recording (the history of what the author did).

**3. Rotate + list.** You rotate a card inside an auto-flowing list. Should
the list make room for the rotated card?
— Yes, always (layout reacts to the rotated footprint) ·
No — rotation is visual-only (overlap is correct) ·
Per-container switch.

**4. Author.** Who is the primary author of documents long-term?
— Humans in the editor · Agents & code · Both equally.

## Round 2 — pattern-following & invention appetite

**5. Standards.** A proven external standard exists but conflicts with your
ideal semantics. Default posture?
— Adopt, warts included · Ideal first (pay authorship) ·
Ideal, borrow freely where compatible.

**6. Proven-ness.** How much does "battle-tested by the entire web for 25
years" weigh in a design decision?
— Decisive · Strong but overridable · Weak — the domain differs.

**7. Legacy.** Which 2030 review makes you prouder?
— "Finally fixed it" · "Instantly familiar".

**8. Refusal.** OK for the model to make some rare designer wishes
structurally unrepresentable, to stay simple?
— Yes, refusal is a feature · No, expressiveness first ·
Only with an escape hatch.

## Round 3 — the file & authoring promises

**9. Raw read.** A stranger opens the raw file in a text editor. Predicting
the render just by reading matters…
— Critically · Nice-to-have · Barely (tooling mediates).

**10. Set promise.** Which promise to the user matters more?
— "Stored exactly as you said" (your `right: 24` lives in the file) ·
"Stored as you see" (the file always equals the current visual result).

**11. Memory.** Should the FILE remember currently-inactive values, so
toggling a mode away and back restores them?
— Yes, the file remembers · No, the file is current truth only ·
Editor-session memory only.

**12. Verbatim.** Must human-typed numbers (x, width, 15°) appear verbatim
in the file?
— Yes, verbatim · Equivalent-derived is fine if round-trip is exact.

## Round 4 — engineering discipline

**13. Bad write.** A write can't take effect in the current context. The
system should…
— Reject with a typed error · Store it; it may apply later ·
Auto-convert the context so it applies now.

**14. Determinism.** Same file on two platforms (native, wasm):
— Bit-identical geometry required · Tolerance-equal is the honest bar.

**15. Rules home.** Where should the model's semantics live?
— In the type system (invalid = unrepresentable) ·
In a written rulebook (everything encodes; prose defines) ·
Types for the core, rulebook for the edges.

**16. Oracle.** What anchors conformance testing?
— An external reference implementation · Our own spec + goldens ·
External where overlap exists, own the rest.

## Round 5 — LLM & agent fit

**17. LLM predict.** Should an LLM writing a document be able to predict
the resulting geometry _without running the engine_?
— Critical · Helpful, not critical · Unnecessary (agents get tools).

**18. LLM safety.** For agent edits, the safer model shape:
— Invalid states unrepresentable (writes can fail, typed) ·
All writes legal (never a wall; rules arbitrate).

**19. LLM prior.** "LLMs already know this vocabulary deeply from training
data" — worth how much?
— A lot (meet models where they are) · Some (a tiebreaker) ·
Little (a clean in-context spec closes the gap).

**20. Agent API.** Agents should manipulate documents primarily through…
— The same fields humans see (the format is the API) ·
A higher-level op layer (gesture-like named operations) ·
Ops first, fields as fallback.

## Round 6 — collaboration & evolution

**21. Co-edit.** Two users, same node, simultaneous move + rotate. Both
intents surviving the merge is…
— Non-negotiable · Nice to have · Whole-op last-write-wins is fine.

**22. Blast radius.** Editing one node requiring the editor to rewrite
_other_ nodes (siblings, parents):
— Never acceptable · A few sanctioned, named cases · Fine, normal.

**23. Growth.** Five years out, the model grows mostly by…
— New node kinds · New properties on existing kinds · Both, heavily.

**24. Breakage.** Before the format locks, breaking changes with migration
scripts are…
— Fine until lock · Never — additive-only from day one.

## Round 7 — capability & scope

**25. 3D.** 3D / perspective on the canvas:
— Real roadmap item · Someday-maybe (don't preclude, don't spend) ·
Not our product.

**26. Exotic 2D.** Skew and arbitrary matrices (mostly via imports):
— First-class on every node · Preserved but quarantined and marked ·
Approximate/degrade acceptable.

**27. Animating layout.** A list reflowing live while a card grows or
turns:
— Core scenario · Occasional (OK if it's the expensive path) ·
Out of scope (motion is a visual overlay).

**28. Layout scope.** Beyond flex/grid — radial, text-on-path, masonry:
— The core must anticipate (pluggable layout) · Payload/plugin concern ·
Never core.

## Round 8 — effort & rollout

**29. Timeline.** Gut timeline for the new model becoming the engine
default:
— Months (ship, iterate) · ~A year (once, right) ·
No deadline (correctness sets the pace).

**30. Consumers.** Third-party renderers / SDK consumers of the format
within ~2 years:
— Plan for them · Unlikely (we own all implementations) ·
Actively want an ecosystem.

**31. Spec duty.** Appetite for maintaining a normative written spec,
standards-body style:
— Yes, sign me up · Tests are the spec · Code is the spec.

**32. Migration.** Existing documents and the current editor model:
— Must migrate losslessly · Best-effort OK · Free to break.

---

## Reading the results (after answering)

Interpretation happens per-run, not in this document. Guidance for whoever
scores: look for (a) the two or three answers that decide the _truth model_
(1, 2, 6, 10 are the usual deciders); (b) answers that _reshape_ rather
than pick — memory (11), write policy (8 vs 18), agent surface (17/20),
vocabulary (7/19); (c) honest refusals — a punted question with a stated
constraint is often worth more than a forced choice; (d) contradiction
pairs (8↔18, 9↔17) — they are not errors, they locate a layer boundary the
model must implement.
