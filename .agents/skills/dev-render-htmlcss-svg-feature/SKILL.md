---
name: dev-render-htmlcss-svg-feature
description: >
  Manual-invocation only. Five-phase feature loop (audit → ground →
  fixture → implement → verify) for driving a single SVG feature to
  Chromium parity in the grida `htmlcss::svg` renderer. Sibling to
  `dev-render-htmlcss-feature` (HTML/CSS path); same loop shape,
  different corpus (resvg-test-suite + Chrome bake) and different
  scoring (multi-oracle: consensus / disputed / UB).
---

# grida-htmlcss::svg — feature loop

**What this is.** A heavy, manually-invoked loop for driving a single
SVG feature forward in `crates/grida/src/htmlcss/svg/`. Do not
auto-trigger; load only when the user explicitly runs it.

**Sister skill.** [`dev-render-htmlcss-feature`](../dev-render-htmlcss-feature/SKILL.md)
covers the HTML/CSS path (different code surface, different fixture
suite, single oracle). This SKILL covers the SVG path: same five-phase
shape, but different corpus and different scoring policy.

| Aspect          | HTML/CSS sister skill                        | This (SVG) skill                                                    |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Renderer module | `crates/grida/src/htmlcss/` (excl. `svg/`)   | `crates/grida/src/htmlcss/svg/`                                     |
| Corpus          | `fixtures/test-html/L0/` (we author)         | `fixtures/local/resvg-test-suite/` (vendored, 1679 fixtures)        |
| Oracle          | Playwright Chromium (refbrowser, on-the-fly) | `expected.png` (suite author) **+** baked Chrome PNG                |
| Scoring         | Single oracle, gate=`L0.exact` floor 1.0     | Multi-oracle: consensus / disputed / UB; gate = consensus pass-rate |
| Tooling         | `cargo run -p grida_wpt -- render --suite …` | `cargo run -p grida_dev -- reftest <run\|bake\|inspect\|summary>`   |

---

## Why multi-oracle (read this before phase 1)

The resvg-test-suite ships one `expected.png` per fixture — but that
PNG is the **suite author's** read of the spec, not a browser
oracle. For ~12% of fixtures Chrome diverges from `expected.png`
(disputed) and ~4% have no defined behavior at all (UB). The harness
ingests the suite's `results.csv` (a 9-renderer status matrix) to
classify each fixture:

- **Consensus** (`chrome=PASSED` in csv): `expected.png` is
  authoritative. Optimize against this set — it is the headline
  parity number.
- **Disputed** (`chrome=FAILED/CRASHED`): Chrome diverges from
  `expected.png`. The harness scores against a baked Chrome PNG too;
  effective score = max(`vs_expected`, `vs_chrome`). Passing on
  either oracle counts.
- **UB** (`chrome=UNKNOWN`): excluded from headline parity entirely.
  Don't optimize, don't regress, don't celebrate a pass.

When you read a score, always read its bucket. A 0.30 score on a
disputed fixture is meaningless without `vs_chrome`; a 0.30 score on
a consensus fixture is a real bug.

---

## The five phases

```text
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 1. AUDIT │→ │2. GROUND │→ │3. FIXTURE│→ │ 4. IMPL  │→ │5. VERIFY │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
    │                                                         │
    └───── ← ─── loop ← ─── score < floor ← ─── diff ← ───────┘
```

### 1. Audit — "what's the actual state of this feature?"

**Question.** Where does the feature live in the htmlcss::svg pipeline
today? Which resvg fixtures touch it, and where do they fall in the
oracle buckets?

**Actions.**

- Scan `crates/grida/src/htmlcss/svg/` for the property/element name
  in dom/parse, style/cascade, layout, paint. SVG features can be
  parsed-but-dropped, computed-but-misrouted, or just unhandled —
  each has a different fix shape.
- Get the suite-wide picture and the worst-fail shortlist:
  ```sh
  cargo run --release -p grida_dev -- reftest summary
  ```
  Headline = consensus pass-rate. The `worst consensus failures` block
  is the real-bug shortlist.
- For each fixture relevant to your feature, run `inspect`:
  ```sh
  cargo run --release -p grida_dev -- reftest inspect <fixture>
  ```
  This prints oracle status, all 9 renderer flags, last-run scores
  vs both oracles, and the four PNG paths. **This is the agent's
  primary diagnostic tool.** Use `--json` for machine consumption.
- Filter the run to just the feature's category:
  ```sh
  cargo run --release -p grida_dev -- reftest run \
    --suite-dir fixtures/local/resvg-test-suite \
    --renderer htmlcss --threshold 0.1 \
    --filter 'filters_feSpecularLighting'
  ```
- Cross-reference [`crates/grida/src/htmlcss/svg/README.md`](../../../crates/grida/src/htmlcss/svg/README.md)
  for the Blink module map and any prior decision.

**Deliverable.** A short audit note (PR draft / task prompt):

- _Pipeline state_: not-parsed / parsed-but-dropped / partial /
  Chromium-parity-except-X. Cite the file:line.
- _Affected fixtures, partitioned by oracle_:
  - `consensus` (must fix): list with `vs_expected` scores.
  - `disputed` (situational): list with `vs_expected` and
    `vs_chrome`. If we already match Chrome, this is a non-issue.
  - `ub` (ignore): list count only.
- _Priority bucket_: easy-and-important / easy-low-value /
  hard-important / hard-low-value.

**Exit when.** You can name the broken pipeline stage **and** point
at a specific consensus fixture that demonstrates it. If your only
failing fixture is disputed-but-we-match-chrome, there is no bug to
fix.

### 2. Ground — "how do real engines solve this?"

**Question.** What's the canonical implementation strategy in a
mature SVG engine? We adapt; we don't invent.

**Actions.** Invoke `/research`. The references for SVG features:

- **Blink (`third_party/blink/renderer/core/svg/`,
  `core/layout/svg/`, `core/paint/svg/`)** — authoritative for the
  layout/paint divergence calls; the engine our chrome-baseline is
  rendered against.
- **WebKit (`Source/WebCore/svg/`)** — third voice. Useful when
  Blink has Chrome-specific behavior (the disputed bucket often
  contains Chrome quirks).
- **resvg (`crates/resvg/`, `crates/usvg/`)** — Rust, readable.
  Useful for parsing and computed-value rules. But remember: when we
  diverge from resvg toward Chrome, that's correct for the disputed
  bucket — resvg authored most of the contested expecteds.
- **Spec** (SVG 1.1 / 2 / specific module). Read this first.

**Deliverable.** A research note with:

- The spec section(s) that govern behavior.
- 3–6 lines on Blink's structure, plus contrast with resvg's read
  when relevant.
- Explicit deviation, if any, and which oracle motivates it (Chrome
  vs. resvg/expected). Cite the disputed fixture(s) by name.

**Exit when.** You can defend the implementation shape by pointing
at Blink, **and** if disputed fixtures are involved, you can name
the oracle the implementation is targeting and why.

### 3. Fixture — "which test proves it?"

**Different from the HTML/CSS path: we don't author SVG fixtures —
we pick them.** The 1679 resvg-test-suite fixtures already cover
nearly every SVG primitive. Authoring new ones is reserved for
genuine gaps in the upstream coverage.

**Actions.**

- Identify 1–3 fixtures that exercise the feature unambiguously.
  `reftest inspect <fixture>` gives you the rel path, oracle status,
  and current score in one shot.
- Prefer **consensus** fixtures as your primary target — they have an
  unambiguous oracle. A consensus fixture going from 0.3 → 1.0 is
  a clean win.
- For features whose semantics Chrome interprets differently, you
  may need a **disputed** fixture as your target. That is fine, but
  the bake oracle (Chrome PNG) must be present. Run:
  ```sh
  cargo run --release -p grida_dev -- reftest bake --filter <category>
  ```
  Verify with `inspect` that `chrome.png` is now resolved.
- If genuinely no upstream fixture covers the case, consider whether
  the feature is in scope. Authoring a new SVG fixture should be
  rare; check WPT (`fixtures/local/wpt/svg/`) before authoring.

**Deliverable.**

- A list of 1–3 target fixtures with their rel paths, oracle status,
  and current scores.
- For disputed targets: confirmation that the chrome-baseline PNG
  exists for each.

**Exit when.** Each target fixture renders through `reftest run`
(filtered), produces all four PNGs in the result dir, and has a
known starting score against the chosen oracle.

### 4. Implement — "what code change realizes the behavior?"

**Question.** What is the minimum diff in
`crates/grida/src/htmlcss/svg/` to make the targets pass?

**Actions.**

- Touch the smallest surface possible. Don't combine refactor +
  feature; the multi-oracle scoring already adds noise to the
  signal — adding refactor noise on top is a debugging nightmare.
- Trace the SVG pipeline end-to-end:
  parse (`dom/`) → style cascade (`style/`) → geometry/layout
  (`geometry/`, `layout/`) → paint (`paint/`). A feature can fail
  at any stage.
- Add unit tests where behavior is data-assertable (computed paint
  server, resolved length, geometry). The Rust tests catch
  regressions the reftest cannot, especially for SVG's lots of
  "value resolved correctly but ended up at the wrong z-position"
  bugs.
- Mirror the Blink structure when in doubt; the htmlcss::svg module
  map docs are explicit about Blink anchors.

**Deliverable.**

- Code change scoped to the feature.
- Any new data tests.
- A one-line behavior summary in the PR description, written in
  spec terms (e.g. "feSpecularLighting now treats specularExponent=0
  as the default 1, matching Chrome / SVG 1.1 §15.21.4").

**Exit when.** `cargo check -p grida -p grida_dev` is clean,
existing unit tests pass, and the targeted fixtures render via
`reftest run` without panic.

### 5. Verify — "does it actually match Chromium?"

**Actions.**

1. Run the targeted slice:
   ```sh
   cargo run --release -p grida_dev -- reftest run \
     --suite-dir fixtures/local/resvg-test-suite --renderer htmlcss \
     --threshold 0.1 --filter <category>
   ```
2. Read the consensus pass-rate and worst-N:
   ```sh
   cargo run --release -p grida_dev -- reftest summary --report \
     target/reftests/resvg-test-suite.htmlcss/report.json
   ```
3. For every target fixture, `reftest inspect <name>`. Read both
   `vs_expected` and `vs_chrome`. If the oracle is `consensus`, both
   should match. If `disputed`, at least one must clear `pass_floor`
   (default 0.95).
4. **Read the diff PNG.** `inspect` prints its path. A high
   similarity score on a sparse fixture can mask a completely
   broken feature. Open the PNG.
5. Run the **full suite** at least once before declaring done. New
   features routinely regress neighbors via shared codepaths
   (cascade ordering, paint server resolution, etc.):
   ```sh
   cargo run --release -p grida_dev -- reftest run \
     --suite-dir fixtures/local/resvg-test-suite --renderer htmlcss \
     --threshold 0.1
   cargo run --release -p grida_dev -- reftest summary
   ```
   Compare the headline consensus pass-rate to the pre-change number.
   It must not drop. If it dropped, something regressed — diff the
   `worst_consensus` lists before vs. after.

**Close the loop.**

- Headline rose, no consensus regressions? Done.
- Headline rose but disputed bucket got worse? Investigate. We may
  have over-fit to the resvg interpretation and broken Chrome
  alignment.
- Headline dropped on consensus? Stop. Either revert or fix; do
  **not** lower `pass_floor`.

**Deliverable.** PR description with:

- Before/after consensus pass-rate (from `reftest summary`).
- Per-fixture before/after scores for the targets, with both
  `vs_expected` and `vs_chrome` when relevant.
- Diff PNG review for any score < 1.0.
- Specific divergence-surface note for any residual gap.

**Exit when.** Someone reading the PR description without the
context can tell exactly which fixtures moved, which oracle they
moved against, and whether anything regressed.

---

## Handoffs and artifacts

| Phase     | Artifact                                                  | Location                                                        |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Audit     | Current-state note, oracle-partitioned fixture list       | PR description / task prompt                                    |
| Ground    | Research note (spec + Blink/resvg cross-ref)              | PR description or `docs/wg/feat-2d/`                            |
| Fixture   | Target fixture list with oracle status; baked chrome.png  | `fixtures/local/resvg-test-suite/chrome-baseline/` (gitignored) |
| Implement | Code change, data tests, spec-language behavior summary   | `crates/grida/src/htmlcss/svg/`                                 |
| Verify    | Before/after summary, per-fixture scores, diff PNG review | PR description                                                  |

---

## Gate policy

The gate is the **consensus pass-rate** — `oracle_buckets.consensus.passing
/ oracle_buckets.consensus.total` from `report.json` (aka the headline
in `reftest summary`).

- The consensus pass-rate must not drop. Period.
- Disputed bucket: track but do not gate. Improvements here are good;
  small regressions are tolerable if `vs_chrome` improved overall.
- UB bucket: never gate, never optimize, never report.
- `pass_floor` (default 0.95) is the per-fixture passing threshold.
  Don't relax it to "make a fixture pass." If a fixture is slipping
  by 0.001, fix the renderer or eat the score.

### What "destructive" means here

A change is destructive if it:

- Lowers the consensus pass-rate.
- Lowers `pass_floor` in `reftest.toml`.
- Removes `[test.oracles]` config or detaches the chrome baseline.
- Increases `--threshold` to absorb real divergence.
- Reclassifies a UB fixture as consensus by editing `results.csv` to
  fit our renderer.

None are acceptable without explicit human approval.

---

## Anti-patterns

| Anti-pattern                                               | Why it fails                                                                                  | Instead                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Optimizing against `expected.png` for a disputed fixture   | You're aligning with the suite author, not the browser. Chrome users will see something else. | Bake the chrome baseline; align there.                                 |
| Treating UB fixtures as bugs                               | UB has no oracle; "passing" or "failing" is meaningless.                                      | Filter `oracle_status: "ub"` out of your worklist.                     |
| Reading `similarity_score` without reading `oracle_status` | Same number means different things across buckets.                                            | Always `inspect` first. The bucket is the context.                     |
| Skipping audit, fixing the worst score                     | The worst score is often UB or disputed-we-match-chrome — fixing them is wrong-headed.        | Triage `summary worst_consensus` first; that is the real-bug list.     |
| Combining renderer change + chrome rebake in one PR        | Reviewer can't tell which delta came from which.                                              | Bake first, land separately. Or note explicitly which bake was needed. |
| Authoring a new SVG fixture                                | The 1679-fixture suite already covers ~all primitives.                                        | Find the existing one. Author only when WPT also lacks coverage.       |
| Lowering `pass_floor` because a fixture is at 0.94         | The floor exists so regressions are loud.                                                     | Fix the renderer. Or document the residual surface.                    |
| Claiming "verified" without running the full suite         | Targeted runs miss neighbor regressions through shared codepaths.                             | Always do a full-suite check before declaring done.                    |

---

## Loop mode (autonomous /loop driver)

When invoked via `/loop`, each iteration drives the full five-phase
cycle end-to-end on one target. Phases do **not** split across wakes.
The protocol below makes iterations idempotent and resumable.

### State file

In-flight loop state lives in the project memory at
`memory/project_dev_render_htmlcss_svg_loop.md`. Two fields:

- _Active target_: `<test_name>` + phase reached (1–5) + brief note.
- _Pre-iteration consensus pass-rate_: snapshot from
  `reftest summary --json | jq '.headline.consensus_pass_rate'`,
  written before phase 4 so phase 5 can detect regressions.

If the file is absent or the active target is empty, the iteration
auto-picks a new target.

### Skip list

Targets the loop has tried but should not retry sit in
`memory/project_dev_render_htmlcss_svg_skip.md`:

- One `<test_name>` per line, optional `# reason` suffix.
- Loaded each iteration; matching targets are excluded from auto-pick.
- Reasons to add: three iterations without progress, known-OOS feature,
  blocked on upstream fix.

### Per-iteration protocol

```
1.  Read state.
    - If active target exists, resume there.
    - Else: auto-pick (see below).

2.  Pre-flight (skip if resuming past phase 1):
    - reftest inspect <target> --json
    - If oracle_status == "ub":  add to skip list, restart at 1.
    - If oracle_status == "disputed" AND vs_chrome >= pass_floor:
        add to skip list (we already match chrome), restart at 1.
    - If oracle_status == "disputed" AND chrome.png is missing:
        reftest bake --filter <category>; re-inspect.

3.  Snapshot pre-iteration consensus pass-rate to state.

4.  Drive phases 1-5 on the target.

5.  Verify gate (phase 5):
    - Diff post vs. pre consensus_pass_rate.
    - If dropped: revert the diff, log "regression on <target>", add
      to skip list with reason. Do NOT continue to next target.
    - If improved or held: clear active target, commit, update state.

6.  Update state. If target hit pass_floor, clear it. If progress was
    made but not done, leave active target with new phase number.

7.  Increment "no-progress streak" if score didn't improve. At 3,
    move target to skip list and clear.
```

### Auto-pick

```sh
cargo run --release -p grida_dev -- reftest summary --json \
  | jq -r '.worst_consensus[].test_name'
```

Walk the list top-down; pick the first whose `test_name` is **not**
in the skip list. If the list is empty, the loop's job is done —
write "consensus saturated; no more bugs in worklist" to state and
stop.

### Termination

The loop stops (and pings the user) when any of:

- `summary --json | jq '.headline.consensus_pass_rate' >= 0.99` —
  only edge cases remain; switch to manual.
- `worst_consensus` is empty after skip-list filtering — nothing
  left to autonomously work on.
- Three consecutive iterations with no commit — escalate.
- Any `reftest run` panic that isn't a fixture-level error.

### Bake invariant

The loop must never bake on every iteration — it's a one-time cost
per fixture per Chrome version. Only invoke `reftest bake` when:

- The target's category has chrome.png missing for at least one
  disputed fixture (detected via `inspect`).
- An explicit `bake-needed` flag is set in state by a prior
  iteration.

`reftest bake --retry-failed` is used after any bake produces
`BAKE_ERRORS.log`; do not skip this.

### What loop mode does NOT do

- Edit `reftest.toml` (gate config is human-only).
- Edit `results.csv` (oracle source-of-truth is upstream-only).
- Force-merge despite a regression (see gate policy).
- Author new fixtures (the corpus is vendored).

---

## The template — paste this to kick off a cycle

Fill in the brackets. Expect to run the loop in passes
(audit+ground+fixture → implement → verify), with a checkpoint at
each pass that future-you or a reviewer can read without the
conversation.

```text
Drive the htmlcss::svg feature loop for: <feature>.
Follow the dev-render-htmlcss-svg-feature skill
(.agents/skills/dev-render-htmlcss-svg-feature/SKILL.md).

Scope:
- Feature:     <e.g. feSpecularLighting specularExponent=0 default>
- Hypothesis:  <e.g. we treat 0 as zero-light; Chrome treats it as default 1>
- Target:      <e.g. flip 6 disputed feSpecularLighting fixtures to passing vs chrome.png>

Produce, in order:

1. Audit note: pipeline stage, fixture list partitioned by oracle bucket
   (consensus / disputed / ub), before-scores from `reftest summary` and
   `reftest inspect`.
2. Ground note: spec section, Blink approach, resvg approach (when
   different — explain which oracle the implementation targets).
3. Fixture list: 1-3 target fixtures with rel paths, oracle status,
   baked chrome.png present (yes/no).
4. Implementation: minimal diff in crates/grida/src/htmlcss/svg/.
   Data tests where assertable.
5. Verify report:
   - before/after consensus pass-rate (from `reftest summary`)
   - per-fixture before/after vs_expected and vs_chrome
   - diff PNG review for any sub-1.0 score
   - confirm no consensus regressions in the full-suite run

Gate: consensus pass-rate must not drop. pass_floor stays at 0.95.
Do not relax the gate. If a target doesn't reach pass_floor, leave a
specific divergence-surface note.

Tools:
- `cargo run --release -p grida_dev -- reftest summary [--json]`
- `cargo run --release -p grida_dev -- reftest inspect <fixture> [--json]`
- `cargo run --release -p grida_dev -- reftest run [--filter <pat>]`
- `cargo run --release -p grida_dev -- reftest bake [--filter <pat>]`

Use /research for phase 2.
```

---

## Quick reference — reftest subcommands

| Command                                                  | Purpose                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `reftest run [--filter pat]`                             | Render fixtures, score against expected.png + chrome.png, write `report.json`.                                                |
| `reftest summary [--json]`                               | Headline consensus pass-rate + per-bucket stats + worst-N consensus failures.                                                 |
| `reftest inspect <fixture> [--json]`                     | Per-fixture diagnostic: oracle flags, scores, PNG paths. Accepts `cat_group_name` or `cat/group/name.svg`.                    |
| `reftest bake [--filter pat] [--retry-failed] [--force]` | Bake Chrome PNGs into `<suite>/chrome-baseline/`. Idempotent; `--retry-failed` batches prior errors into one node invocation. |
| `reftest view <result-dir>`                              | Serve the dashboard.                                                                                                          |

See [`crates/grida_dev/AGENTS.md`](../../../crates/grida_dev/AGENTS.md) and
[`crates/grida/src/htmlcss/svg/README.md`](../../../crates/grida/src/htmlcss/svg/README.md)
for the underlying contracts.
