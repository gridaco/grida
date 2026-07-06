# grida_editor

The Rust-native Grida editor: document working copy, invertible
mutations, history, commands, interaction — **all** editor plumbing —
built from scratch as the reference implementation of the universal
[canvas spec](../../docs/wg/canvas/index.md), on the read-only
[`grida`](../grida) engine. This crate's own implementation-binding
specs (how it realizes the canvas spec) live in [`./docs`](./docs/).

**This README is doctrine, not documentation.** The previous
architecture did not fail for lack of skill or effort — it failed for
lack of laws. This file states the laws, extracted from that failure,
and the checklist that every engineering decision passes **before any
action** — new features, refactors, reorganization, and, above all,
decisions about the code already in this crate. The module ↔ concept
map lives in [`src/lib.rs`](src/lib.rs); the spec cluster is
normative; this file is why both exist.

## 1. The failure this crate answers

The legacy mental model, in one sentence: **replace the DOM with a
custom wasm canvas, keep the JS core the same.** `@grida/canvas-wasm`
was a dumb, stateless render engine; JS owned the entire scene state
and flushed it across. Good on paper. It worked — until it did not.

How it died, reduced to root causes:

- **Split ownership.** State lived in JS; capability lived in Rust.
  The text editor is the canonical case: native-quality text editing
  had to live Rust-side, the JS host tried to own its state anyway,
  and the ownership story collapsed into nested-state complexity it
  never recovered from.
- **Sync as architecture.** The HUD and the whole interaction layer
  lived web-only, so every feature paid the same tax: mutate JS state
  → sync the scene → query the new geometry → update everything
  downstream. The reconciliation loop _was_ the architecture.
- **The write path was an afterthought.** As scenes grew, the real
  performance plumbing was not making the render fast — it was making
  _mutation_ fast. The split had no answer for that.
- **Death by accretion.** JS was the natural home for exploring UX —
  and the exploration hardened into the architecture. Both sides
  became unmanageable; every refactor got more painful and more
  costly than the last, until the project stopped.

The failure was architectural, not incidental. Ten thousand commits
that each "worked" accumulated into a system that did not.

## 2. The doctrine

Six laws. Each is the direct negation of a root cause above. They are
not aspirations — they are the merge bar.

1. **One owner per concern.** Every piece of state has exactly one
   owner: the module that holds the capability to operate on it. If
   two sides need to own the same state, the boundary is in the wrong
   place — move the boundary, never share the state. _(Negates: the
   text-editor split.)_ In-tree example: `ARCH-1` — editor core owns
   document truth and runs its whole suite with no renderer.

2. **Data flows one way.** Every feature must be expressible as
   one-directional flow through contracts: intents up, derived state
   down. A design that must _write, then read back to learn what
   happened_ has misplaced ownership — that is the legacy sync loop
   wearing a new name. _(Negates: mutate → sync → query → update.)_
   In-tree example: `HUD-3` — intents up, selection mirror down, same
   event.

3. **The write path is a first-class surface.** Mutation cost,
   invertibility, history shape, and damage propagation are designed
   and budgeted with the same rigor as rendering — never bolted on.
   _(Negates: render-first, mutation-someday.)_ In-tree example: the
   damage ledger — no call site talks to the renderer about content;
   `FRAME-2` names the scattered per-site plumbing it forbids.

4. **One module, one concept, one golden contract.** Every module
   maps to a named spec concept ("concept ≈ module",
   [`src/lib.rs`](src/lib.rs)) and exposes one contract. A contract
   is **golden** only when it is all four of:
   - **specified** — it has an RFC clause and a name;
   - **tested** — conformance tests cite its id
     ([`harness.md`](./docs/harness.md));
   - **pure** — no hidden state, no side channels, no reaching
     through it;
   - **singly owned** — exactly one module implements it.

   **Nothing is built on a non-golden contract.** If what you need
   isn't cleanly offered by a golden contract, the work is to fix the
   contract first — spec, then tests, then code — not to reach
   around it. _(Negates: death by accretion.)_ In-tree example: the
   UI kernel/policy seam — widgets emit an opaque `Emission` and have
   never heard of a document
   ([`src/ui/README.md`](src/ui/README.md)).

5. **"It works" is not an argument.** The legacy system was made
   entirely of working code. A change that works but blurs ownership,
   bends data flow, or leans on a non-golden contract is debt on the
   day it lands — and this crate exists _because_ that debt
   compounds. Easy paths that "just make things work" are how the
   last system died.

6. **Prototypes retire; specs carry.** Exploration code —
   [`grida_dev`](../grida_dev), and ultimately the web editor's
   implementation itself — exists to prove ideas and be retired. The
   RFC is the durable form of a feature; code never becomes
   architecture by inertia.

## 3. This crate's own code is the first suspect

Be honest about the situation: this crate was authored fast, largely
machine-written, and has **not** been fully reviewed. Assume it
contains easy paths — places where the code makes things work rather
than paying the debt this project exists to pay.

Therefore:

- **The spec is the precedent. The code never is.** Existing code in
  this crate carries zero authority in a design argument; only RFC
  clauses and their tests do.
- **The checklist below applies inward.** Reorganizing or extending
  _this_ code is gated exactly like touching legacy code.
- **Deviations resolve deliberately, never silently.** When code and
  spec disagree, either the code is wrong, or reality won — and then
  the spec and its tests are amended _in the same change_. Silent
  drift is the one outcome that is never acceptable.

## 4. The checklist — before any action

Run this before implementing anything: a feature, a refactor, a
reorganization, a "cleanup". Answers belong in the design (RFC or
plan) — if you are answering them in code, you have already skipped
the step that matters.

1. **Ownership** — name the single owner of every piece of state this
   touches. Any piece with two plausible owners → stop, redesign the
   boundary.
2. **Flow** — draw the data flow. Is it one-directional? Any
   mutate-then-query-back loop → ownership is misplaced.
3. **Contracts** — list every contract this builds on, by id. Is each
   one golden (specified, tested, pure, singly owned)? A non-golden
   one → fix that contract first; do not build on it.
4. **Concept** — which spec concept owns this work? None → write the
   spec first, or don't build it.
5. **The easy-path test** — is this shaped this way because it is
   _right_, or because it was _expedient_? Would it survive the
   review the legacy system failed?
6. **Blast** — does this alter a contract others build on? Then spec,
   tests, and code amend in the same change — never code alone.

## 5. Status: today → tomorrow → end state

**The new model** (what the laws build toward): all interaction
models, all state, all syncing — all plumbing — live in the
Rust-native editor. The JS host provides exactly what a host owns:
GL context, input events, rAF, network. The web's editor UI becomes a
thin controller over state the Rust editor already holds — HTML stays
the natural home for panel UX; the HUD, rulers, and canvas chrome
render in-canvas. Everything ships in the box, deliberately less
(not) configurable.

**Today** — the legacy debt delayed, then stopped, the canvas
project; wasm shipping is frozen until this rebuild can swap in as
v2. This crate is the **spec container and pioneer**: the RFC cluster
is normative, this crate is its executable form, and UX, performance,
and document spec are worked out here first. It is deliberately an
island — depends on `grida` + `math2` only, nothing depends on it,
core is feature-free and rendererless (`ARCH-1`), the windowed shell
sits behind the `shell` feature. It is not a product: the UI is crude
on purpose ([`src/ui/README.md`](src/ui/README.md)), and the engine
is read-only from here.

**Tomorrow** — this crate retires the legacy projects (`grida_dev`
first), then challenges every design not yet touched — including the
core engine itself, which needs a fundamentally new design: we lost
track of the code flow, and the render pipeline is not manageable.
The sequence is deliberate: **first this editor becomes a solid
harness** (specs and tests fixed at the level above the engine),
**then the core is re-worked underneath it** with confidence,
studying how Chromium-class systems structure these problems, so the
core + editor end up semantic, genuinely well-designed, and
performant.

**End state** — this crate is the backbone, re-exposed to the web
through a wasm seam; likely a new package rather than
`@grida/canvas-wasm`, since what it exposes is no longer a canvas but
an _editor_ (packaging and naming not yet decided).

## 6. How a feature lands

No new features are invented here. The work is **translating the web
editor's implementation** into primitive, managed concepts:

1. **RFC/RFD first** — the document and interaction model, in domain
   terms, less-technical than the code (the feature already exists;
   the RFC is its durable form).
2. **Re-implement spec-respecting, not pixel-faithful** — this editor
   does not mirror the web's control-level UX polish and does not
   care about a clean UI; it cares that behavior matches the spec.
3. **Harness-covered** — contract tests citing the RFC ids, headless
   where possible, raster probes only for genuinely visual claims.
   Once a feature lands, it is tested, finalized, and can never
   silently drift again.

## Running & testing

```sh
# the windowed shell (one window: canvas + panels)
cargo run -p grida_editor --features shell

# core conformance suite — headless, no renderer (ARCH-1)
cargo test -p grida_editor

# full suite including the shell plane (raster probes)
cargo test -p grida_editor --features shell
```
