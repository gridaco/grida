# model-v2 — node geometry / layout / transform model redesign

Workbench for the fundamental redesign of the Grida node model: how a node's
geometry, position, size, rotation/transform, and layout participation are
represented — in the **Rust engine** (`crates/grida`) and the **format spec**
(`format/grida.fbs`). Other seams (TS editor, WASM bindings, importers) follow
after the model lands; they are out of scope here.

> **Branch note.** This directory lives on the `model-v2-anchor` branch as a
> working snapshot — tracking issue:
> [gridaco/grida#957](https://github.com/gridaco/grida/issues/957) (pinned).
> The plan: finish the feel pass on the spike, then propose an RFC with this
> branch as the textbook, then start the legacy migration/rebuild (weeks
> out). Nothing here ships; no production code is touched by this branch.

## Run

```sh
# the lab (the model's single source of truth) — 114 tests
cd model-v2/a/lab && cargo test

# the interactive spike (native skia window on the model)
cd model-v2/a/spike-canvas && cargo run --release

# the demo pages (proof, model walkthrough, edge cases, DEC-0 fork, free editing)
python3 -m http.server 4173 --directory model-v2/a/.preview
```

## Why this exists

The current system answers the same question three different ways:

- leaf nodes: baked `AffineTransform` + `size`
- containers: `position` enum + `rotation: f32` scalar + `layout_dimensions`
- format spec (`LayerTrait`): `layout` + `post_layout_transform` (unimplemented, self-flagged provisional)

reconciled at runtime by a lossy, branchy resolver. This was never reconciled
because the underlying questions were never decided. This directory decides
them — problems first, then candidates, then spec.

## Phase discipline

| phase                   | artifact                                                       | status                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Problems & harnesses | `problems.md`, `harnesses.md`, `study.md`                      | stable draft                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2. Candidate models     | `paradigm.md`, `axes.md`, `models/*`, `finale.md`, `triage.md` | **DECIDED — `anchor`** (+5 triage amendments)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3. Spec                 | normative doc + `grida.fbs` draft                              | **experiments RUN, model PROVEN** — E1–E10 complete with verdicts; **DEC-0 decided: VISUAL-ONLY rotation (the CSS framing), CSS-pure sizing** ([`a/dec0-visual-only.md`](./a/dec0-visual-only.md)); flips built (E-A14, cross-zero resize); 114-test lab; native interactive spike ([`a/spike-canvas/`](./a/spike-canvas/)); open calls parked in [`a/DECISIONS.md`](./a/DECISIONS.md). Remaining: fold deltas into a normative rewrite of `models/a.md` + WG graduation |
| 4. Runtime              | `crates/grida` implementation                                  | **day-1 engine skeleton BUILT** — [`engine/`](./engine) (`anchor-engine`): the `resolve → drawlist → paint` pipeline + query/journal/replay/damage sockets, spike re-hosted onto it, gate green (shots byte-identical, replay deterministic, budgets baselined); contracts in [`a/ENGINE.md`](./a/ENGINE.md). Migration into `crates/grida` follows; the spike's [`TEXTBOOK.md`](./a/spike-canvas/TEXTBOOK.md) is the reference                                          |

Ground rules:

- **Problems before solutions.** When a new unclear part arises, it becomes a
  catalog entry — not an inline patch to a proposal.
- **Every claim is evidence-linked** to current code, the format spec, or a
  studied peer system.
- **No candidate survives without a harness run.** `harnesses.md` is the test
  suite for designs.
- An earlier in-chat probe sketched one candidate (scalars-canonical + per-axis
  anchors + layout-visible rotation + a transform-quarantine node). It is
  deliberately **not recorded here as a decision** — it re-enters in phase 2 as
  one candidate among others, subject to the harnesses.

## Files

- [`problems.md`](./problems.md) — the problem catalog (P1–P11): each unclear
  part stated precisely, with its tension, option space, and evidence.
- [`harnesses.md`](./harnesses.md) — the constraints (H1–H10) any candidate
  must pass, each with a concrete pass/fail probe, plus the tension map
  between harnesses.
- [`study.md`](./study.md) — comparative study of peer systems (CSS, SVG,
  Flutter, SwiftUI, Figma, tldraw): facts we reason with, not designs we copy.
- [`paradigm.md`](./paradigm.md) — phase-2 **candidate** paradigm
  ("one box, one way"): nouns, laws, how each problem lands, trades declared,
  falsification criteria. Not ratified.
- [`finale.md`](./finale.md) — the phase-2 finale, **decided: `anchor`**;
  preserved with the pre-decision concession bill and deciding question.
- [`survey.md`](./survey.md) — the 32-question instrument itself, saved
  clean (no answers, no verdict): administration rules, all questions with
  options, and scoring guidance. Reusable for future re-runs or other
  respondents.
- [`triage.md`](./triage.md) — the 2026-07-07 run of the survey: answers,
  scoring key, verdict, the five amendments, and the one open (tilted)
  fork.
- [`editor.md`](./editor.md) — the editor-experience operation catalog:
  every gesture as **gesture → writes → effect → ripple** with stable
  `OP-*` ids, the six operation laws (incl. the three sanctioned
  state→intent bake moments), and per-op FORK marks.
- [`conformance.md`](./conformance.md) — the model-agnostic test corpus:
  metamorphic laws, per-area invariants + edge registries, the executable
  merge matrix, and the compatibility checklist (CSS/Figma/SVG/current
  engine) with Y / N-deviation / spectrum verdicts. FORK rows are the
  finale's probes.
- [`axes.md`](./axes.md) — the decision-space factoring: **Axis 1 = semantic
  model** (`anchor` vs `bake` — decide first), **Axis 2 = representation &
  mutation protocol** (struct vs sheet, key granularity — tunable after,
  bounded by the atom rule). Re-scopes `sheet`; source of harnesses H11/H12.
- [`a/`](./a/) — **the winner's workbench**: the experiment ledger E1–E10
  (each with verdicts and lab tests), the decision register
  ([`a/DECISIONS.md`](./a/DECISIONS.md)), the DEC-0 normative rules, the
  ship-readiness census ([`a/LIMITS.md`](./a/LIMITS.md)), the peer-compat
  matrix, the phase-4 engine layer programs with day-1 contracts
  ([`a/ENGINE.md`](./a/ENGINE.md)), the 114-test Rust lab
  ([`a/lab/`](./a/lab/)), and the native interactive spike
  ([`a/spike-canvas/`](./a/spike-canvas/)).
- [`models/`](./models/) — concrete candidate models, one file each,
  harness-scored, best-faith. Files keep letter slots (`a.md`, `b.md`, …);
  the names are the working identifiers:
  - [`models/a.md`](./models/a.md) — **`anchor`** (the anchored box model):
    intent-canonical scalars, per-axis bindings, lens quarantine. Proposed
    best fit.
  - [`models/b.md`](./models/b.md) — **`sheet`** (the property sheet model):
    CSS-faithful flat registry, rulebook conflicts, post-layout transforms.
  - [`models/c.md`](./models/c.md) — **`bake`** (the materialized matrix
    model): Figma-faithful matrix + state canonicalism, edit-time layout.
  - [`models/d.md`](./models/d.md) — **`wire`** (the wired geometry model):
    relational archetype — referent-general bindings, dataflow DAG, the WG
    Level-4 destination. Priced and deferred; `anchor` grows into it
    additively.

## Relationship to existing docs

- [`docs/wg/feat-layout/index.md`](../docs/wg/feat-layout/index.md) — the
  anchor+flex+grid positioning vision (draft, PR #437). It covers positioning
  intent only and is **silent on rotation/transform and their layout
  coupling** — that gap is a large part of this catalog. When phase 3 produces
  a spec, it graduates into `docs/wg/` under WG doctrine (code-agnostic) and
  this directory's evidence links stay behind as the working record.
- [`format/grida.fbs`](../format/grida.fbs) — the current archive draft; its
  header rules (unset-vs-default, tables-over-structs, additive evolution) are
  binding harnesses on whatever phase 3 encodes (see H9).
