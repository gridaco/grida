# cg-htmlcss — feature loop prompt

**What this is.** A pastable prompt template for driving a single CSS
feature forward in the cg htmlcss renderer. Paste the template at the
bottom into a new task; the reference above it is context an agent
can read to follow the loop honestly.

**Why this is a prompt and not a skill.** The 5-phase loop is
deliberately heavy — audit + ground + fixture + implement + verify.
It's overkill for small fixes, and it's already a conductor over
`/research`, `/fixtures`, `/cg-reftest`, which auto-trigger correctly
on their own. Opt-in invocation is right: paste it when you want the
full cycle; skip it for paper-cuts.

**Lifecycle.** Expect this file to grow as new divergence patterns
surface. It will likely go stale in parts once htmlcss hits
Chromium-parity on L0/L1; treat the _phase structure_ as durable and
the _property-specific callouts_ as advisory.

---

## The five phases

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 1. AUDIT │→ │2. GROUND │→ │3. FIXTURE│→ │ 4. IMPL  │→ │5. VERIFY │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
    │                                                         │
    └───── ← ─── loop ← ─── score < floor ← ─── diff ← ───────┘
```

Each phase has a **question it answers**, a **deliverable**, and an
**exit criterion**. Don't skip forward; don't linger past the exit
criterion. The loop closes at verify — if the score is below the
gate, return to phase 3 or 4 with a specific hypothesis, not a vibe.

### 1. Audit — "what's the actual state of this feature?"

**Question.** Where is the feature on the cg side today? What
renders wrong, what doesn't render at all, what renders
coincidentally-correctly but by the wrong path?

**Actions.**

- Scan `crates/grida-canvas/src/htmlcss/` for the property name in
  stylo enum mapping, paint emit, layout feed. A property can be
  parsed-but-dropped, emitted-but-wrong, or unhandled — each has a
  different fix shape.
- Enumerate existing fixtures that touch the feature
  (`fixtures/test-html/L0/`). Run them under `L0.coverage` and
  record current similarity per fixture. This is the before-number.
- Check `docs/wg/feat-2d/htmlcss.md` and any related design notes
  for a prior decision or deliberate gap.
- List sibling properties likely to break the same way (e.g.
  `border-radius` %-values implied `border-image-slice` %-values).

**Deliverable.** A short audit note inside the task prompt or the
PR draft:

- _Current support level_: not-parsed / parsed-but-dropped /
  partial / Chromium-parity-except-X.
- _Fixtures touching it_: list with current similarity scores.
- _Priority bucket_: easy-and-important / easy-low-value /
  hard-important / hard-low-value. Pick from the top-left by
  default; only go hard-important when called out.

**Exit when.** You can state the feature's current renderer state
in one paragraph with file references. If you can't, you don't
know enough yet — read more, don't guess.

### 2. Ground — "how do real engines solve this?"

**Question.** What's the canonical implementation strategy for
this feature in a mature engine? We are not inventing; we are
adapting.

**Actions.** Invoke `/research`. Three engines are the usual
references:

- **Servo + stylo** — Rust, most readable. Especially useful for
  parsing, cascade, inheritance, computed-value rules.
- **Chromium / Blink** — C++. Authoritative for layout and paint
  divergence calls. The renderer we diff against.
- **WebKit** — C++. Third voice; useful when Blink has
  controversial behavior (Safari-only bugs / features).

For a new property, read the **spec first** (CSS Backgrounds,
CSS Display, CSS Values 4, etc.). Then look up:

- How stylo represents the property's computed value.
- How Blink paints or lays out against that representation.
- What WPT section exercises it (for free fixtures later).

**Deliverable.** A research note — either inline in the PR
description or under `docs/wg/feat-2d/` if substantial — with:

- The spec section(s) that govern behavior.
- The 3–6 line summary of how stylo/Blink structure the solution.
- The explicit deviation, if any, and why.

**Exit when.** You can defend the implementation shape by pointing
at prior art, not just "it compiles and the fixture passes." If
the only justification is the fixture, you've over-fit.

### 3. Fixture — "what's the smallest test that proves it?"

**Question.** What HTML/CSS input demonstrates the feature
unambiguously, and what does the ideal rendered output look like?

**Actions.** Invoke `/fixtures` for authoring rules; `/cg-reftest`
for the suite manifest. In short:

- One concept per file. `paint-<property>-<variant>.html` naming.
- Probe-friendly palette (≤3 colors, round coordinates) when the
  feature is pixel-precision rather than paint-rich.
- **Paint vs. layout decision.** Paint fixtures fix body size to
  the preset (via `min-height`); layout fixtures let content size
  itself and carry an explicit `viewport` in the suite entry.
  See `fixtures/test-html/README.md`.
- Inject `hide-text.css` via `extra_css` when text is incidental
  (labels for humans, not the subject under test). This is the
  single biggest lever against noise.
- WPT fixtures are fair game — prefer pulling an established WPT
  test into the suite over authoring one from scratch when the
  section is mature.

**Deliverable.**

- One or more fixtures under `fixtures/test-html/L0/`.
- Entries in `fixtures/test-html/suites/L0.coverage.json`. Only
  put in `L0.exact.json` after verify phase confirms 100.00%.
- For layout fixtures: the measured `viewport.height` from the cg
  natural cull.

**Exit when.** The fixture runs through both producers and
produces PNGs of identical dimensions. Dimension mismatch → stop;
the suite config is wrong and the score will be zero.

### 4. Implement — "what code change realizes the behavior?"

**Question.** What is the minimum set of edits in
`crates/grida-canvas/src/htmlcss/` to make the fixture match?

**Actions.**

- Touch the smallest surface that can possibly work. Avoid
  "refactor + feature" in one commit; the reftest cannot tell you
  which change caused which delta.
- Trace the pipeline end-to-end for the property:
  parse → compute → layout feed → paint. A feature can fail at
  any stage; diagnose before editing.
- Add unit tests where behavior is data-assertable (computed
  value, resolved length, layout position). Data tests are free
  and catch regressions the reftest can't (e.g. "this resolves
  to `12px` in _both_ Chromium and us, for the right reason").
- When in doubt, mirror the Blink / stylo structure. Deviations
  cost reviewer attention; prior-art parity is free.

**Deliverable.**

- Code change scoped to the feature.
- Any new data tests for the computed-value surface.
- A one-line entry in the PR description for each user-facing
  behavior change, written in spec terms, not implementation
  terms.

**Exit when.** `cargo check -p cg` is clean, existing tests pass,
and the fixture renders through `golden_htmlcss --suite` without
error. Similarity score is measured in phase 5 — do not gate on
it here.

### 5. Verify — "does it actually match Chromium?"

**Question.** Is the rendered output Chromium-parity at the
fixture's tolerance gate?

**Actions.** This is `/cg-reftest`'s core loop. For each fixture
in the change:

1. Render expecteds (Playwright Chromium) into
   `target/refbrowser/<suite>/expected`.
2. Render actuals (`cargo run -p cg --example golden_htmlcss --
--suite …`).
3. Diff with `@grida/reftest`, threshold 0 (the strict default).
4. Read similarity against the suite's `gate.floor`.

**Don't trust the score naively** — see "Reading the score" in the
cg-reftest skill. A 96% score on a sparse fixture can mask a
completely broken subject. Eyeball the diff PNG every time. A
single round of verification without visual inspection is not
verification.

**Close the loop:**

- Score ≥ `gate.floor`? Promote the fixture to `L0.exact.json`
  if it reached 100.00%; otherwise leave in coverage and document
  the residual delta in the PR description.
- Score < floor? Return to phase 3 (fixture too noisy / wrong
  subject) or phase 4 (renderer bug) with a specific hypothesis.
  Do _not_ lower the gate to fit the result; the gate exists so
  regressions are loud.

**Deliverable.** The PR description, written honestly:

- Before/after similarity numbers for every affected fixture.
- Diff PNGs attached or linked for any score < 1.0.
- The specific divergence surface (rounding, AA, layout math,
  etc.) if below 100.00%. "Renderer choice differs from Blink at
  <specific pixel class>" beats "close enough."

**Exit when.** The PR description can be read by someone who has
never seen the code and they know exactly what's now supported,
what's still broken, and what the score proves.

---

## Handoffs and artifacts

The phases are designed so an agent can stop, a second agent can
pick up, and no context is lost. The durable artifacts:

| Phase     | Artifact                                                 | Location                                               |
| --------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Audit     | Current-state note, priority bucket                      | PR description / task prompt                           |
| Ground    | Research note (spec + engine cross-ref)                  | PR description or `docs/wg/feat-2d/`                   |
| Fixture   | `.html` fixture(s), suite entries, viewport measurement  | `fixtures/test-html/L0/`, `fixtures/test-html/suites/` |
| Implement | Code change, data tests, behavior summary                | `crates/grida-canvas/src/htmlcss/`                     |
| Verify    | Before/after scores, diff PNG review, divergence surface | PR description                                         |

If a phase's artifact is missing, the phase isn't done — even if
the code "works."

---

## Gate policy — the part that makes automation safe

The only reason this loop can be automated is that phase 5 has a
**numeric, unambiguous, byte-exact** pass condition. Everything
upstream is advisory; verify is the truth.

- `L0.exact.json`: `gate.floor = 1.0`, `threshold = 0`, `aa = off`.
  Any regression is a real renderer change we made differently
  from Blink. No tolerance inflation — ever.
- `L0.coverage.json`: informational scores, no gate. Landing a
  fixture here is "we know about this case and intend to fix it."
  Promoting to exact is "we now match Blink."

Automation rules downstream of this prompt (CI gating, auto-merge,
etc.) must assert on the `report.json` emitted by `@grida/reftest`
and **not** on free-text agent assertions. The agent's job is to
drive the loop; the report is the contract.

### What "destructive" means here

A change is destructive if it:

- Lowers `gate.floor` in `L0.exact.json`.
- Removes an entry from `L0.exact.json` without a corresponding
  `coverage` entry (or documented reason).
- Increases `--threshold` or enables `--aa` to absorb real
  divergence.
- Suppresses a fixture to dodge a failing score.

None of these are acceptable without explicit human approval. The
loop fails loudly instead.

---

## Anti-patterns

| Anti-pattern                                    | Why it fails                                                                                | Instead                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Skipping audit, starting with "fix this bug"    | The bug is a symptom; the broken pipeline stage may be a different property.                | Trace parse→compute→layout→paint first. Name the stage.            |
| Skipping ground, implementing from intuition    | CSS is full of non-obvious spec requirements. "Looks right" to a human ≠ spec-correct.      | Read the spec. Cross-ref one real engine.                          |
| Combining refactor + feature in one PR          | Reftest deltas can't be attributed.                                                         | Land the refactor alone first (score must not drop).               |
| Raising threshold to "just pass"                | Hides real bugs. Turns the harness into a rubber stamp.                                     | Fix the divergence. If out of scope, document + leave in coverage. |
| Using text-heavy fixtures to test non-text feat | Font shaping noise dominates the score; you're measuring the wrong thing.                   | Inject `hide-text.css`. Or use probe-friendly fixtures.            |
| Promoting to `exact` at 99.xx%                  | The exact suite is a byte-exact contract. Near-passes belong in coverage with a delta note. | Wait for 100.00%. Or fix the residual.                             |
| Claiming "verified" without reading the diff    | A similarity score is a coarse index; the diff image is the truth.                          | Eyeball every sub-100 diff. Record the specific divergence.        |
| Inventing new fixtures when WPT covers it       | Duplicates work; WPT has reviewed spec-intent pass criteria.                                | Import the WPT fixture; cite it in the suite entry.                |

---

## The template — paste this to kick off a cycle

Fill in the brackets. The agent you hand it to should produce all
five artifacts before declaring done. Expect to run the loop in
passes (audit+ground+fixture → implement → verify), with a
checkpoint at each pass that future-you or a reviewer can read
without the conversation.

```
Drive the htmlcss feature loop for: <property or behavior>.
Follow .agents/prompts/cg-htmlcss-feature.md.

Scope:
- Feature:    <e.g. `border-radius` percentage values>
- Hypothesis: <e.g. cg parses but drops %-values in the paint stage>
- Expected:   <e.g. promote paint-border-radius.html to L0.exact>

Produce, in order:

1. Audit note:  current support level, file references, before-scores.
2. Ground note: spec section(s), stylo/Blink strategy summary.
3. Fixture(s): `.html` + suite entries. Paint or layout? Declare it.
4. Implementation: minimal diff. Data tests where assertable.
5. Verify report: before/after similarity per fixture, diff PNG
   review for any sub-1.0 score, promoted fixtures listed.

Gate: L0.exact must stay at floor 1.0, threshold 0, aa off. Do not
relax the gate. If the feature doesn't reach 100.00%, leave it in
coverage with a specific divergence-surface note.

Use /research for phase 2, /fixtures for phase 3, /cg-reftest for
phases 3 and 5.
```
