---
name: naming
description: >
  How to think about names in the Grida repo — not conventions, but what a
  name commits you to, reveals about the system, and costs to change. The
  central discipline is that a strict, honest name refuses to grow, and that
  refusal drives the repo's shape (flat modules, small agnostic packages,
  suffix siblings). Use when planning a new package, crate, module,
  directory, route group, or test corpus — the name comes first.
---

# Naming

Vanilla conventions (`snake_case` in Rust, `kebab-case` in JS/TS,
`PascalCase` exports, `use-*` hooks) are table stakes — assume them.
This document is about the observations on top: what a name commits
you to, what it reveals, and what it costs when it's wrong.

## Name first

Pick the name **before** the types, before the tests, before the
file exists. If the name doesn't come easily, the design isn't
ready — don't start coding; sharpen the concept until the name
falls out. Maintainability is downstream of naming. How a module
grows, how cleanly it retires, how safely it can be deleted — all
of it is decided at the moment you choose what to call it.

## A strict, honest name is a scope gate

A name's primary job here is to **refuse the wrong content**. A
module called `painter` should feel actively wrong to host a
layout helper; a package called `@grida/cmath` should feel wrong
to host color logic. The strictness is deliberate — it is the
mechanism that keeps features from leaking into each other.

"Strict" requires "honest." A name that no longer describes what's
inside has stopped being a gate: it won't reject foreign additions,
and new readers can't trust it. When contents drift past the name,
you have two moves — _rename_ to match what the module has become,
or _extract_ the drifted pieces out — and you must pick one
promptly. Letting a name go stale is how codebases rot quietly.

Three consequences cascade from the gate discipline, and together
they produce the current repo structure:

1. **Modules stay shallow.** You will rarely see a module nested
   deeper than two levels inside a crate's `src/` or a package's
   `src/`. When you're tempted to grow a third level, the parent's
   name has stopped describing what's inside — flatten or extract,
   don't nest.
2. **Flatten with prefixed siblings, or collapse into one file.**
   Before reaching for a subdirectory, ask whether the new thing is
   a sibling variant of an existing file (`painter.rs` +
   `painter_debug_node.rs` + `painter_geometry.rs`) or whether it
   collapses into the existing file. Both preserve the parent's
   scope; a new subdirectory quietly widens it.
3. **If it resists flattening, it is a new module.** The thing
   that won't fit under the strict name doesn't belong there. It
   wants its own tiny, agnostic package or crate. The repo has
   many small `@grida/*` packages and small crates precisely
   because this extraction was made each time a sibling would have
   diluted the parent's name.

## One module, one thing

The gate only works because each module commits to one thing.
Two-thing modules can't enforce either scope — the name becomes
ambiguous as a filter, and new additions slip in under whichever
reading is convenient. When you notice a module doing two things,
pick the primary, rename for it, and extract or delete the other.
The repo's proliferation of tiny packages is this choice
compounded.

## The diff test

A well-named module exhibits two properties under change. Treat
them as the measurable signal that naming is doing its work:

1. **A feature change lands in one file, or a tight set of
   sibling files.** Diffs that scatter across unrelated modules
   mean the boundary isn't where the name implies it is.
2. **The file can be deleted with confidence.** Remove it and the
   compiler or test suite will tell you exactly what else must go
   — or nothing does. If removal requires a cross-cutting hunt
   through unrelated names, the module was leaking all along.

A codebase where neither test passes easily has a naming problem
dressed up as an architecture problem. The inverse is the real
payoff: when both tests pass, code grows by adding siblings or
spawning small packages, and it retires by a single `git rm`.

## A name is a contract at the scope of its reach

The cost of a bad name is `rename friction × fanout`. Fanout is
set by where the name is visible, and the difference is severe:

- A **directory** is seen by whoever walks the tree. Rename cost:
  `git mv` + import updates. Cheap.
- A **published identifier** (`@grida/cg`, Cargo `name`) is seen
  by every call site in every branch in every downstream repo.
  Rename cost: coordinated migration, deprecation window, semver
  break.

This asymmetry is why the directory name and the published name
**can diverge**. `packages/grida-canvas-cg` publishes as
`@grida/cg`: the long directory pays for browsability (the
canvas family clusters in the file tree) where rename is cheap;
the short scope pays for ergonomics where rename is expensive.
The Rust side, by contrast, currently aligns — `crates/grida`
publishes as `grida` because the core crate is also the
project's public namespace, and keeping the two in lockstep
removes a name to remember. Two different trade-offs; pick per
surface. Invest heavily in a name **before** it escapes its
file; once it's a public surface, the name is a commitment.

## A name is a diagnostic

A name that feels hard to pick is telling you something about the
module, not your vocabulary. Common tells:

- **Tempted to stamp the child with the parent's name.** The
  parent isn't carrying its scope. Fix the parent — don't
  double-stamp. `grida-canvas/canvas-text/` is the symptom;
  `grida-canvas/text/` is the correction.
- **Can't name the new thing without qualifying against a
  sibling.** The sibling is too close — you haven't factored the
  shared abstraction, or the two don't belong in this parent.
- **The strict name won't stretch to fit what you want to add.**
  This is the system working. The answer is never to loosen the
  name; it's to flatten the addition as a sibling, or extract it.
- **Need a README paragraph to explain the module's name.** The
  boundary is wrong. Names that require prose describe accidental
  groupings.

Naming is the cheapest design review you get. Listen to it when
it resists.

## Terseness is a claim of uniqueness

Two-letter names (`cg`, `fe`, `k/`, `q/`) are not
abbreviations — they are assertions that nothing else in this
parent competes for the slot. The assertion is load-bearing;
reviewers rely on it to mean "this is _the_ canvas-graphics
module," not "one of several."

The bar to mint one: **would adding any peer to this parent make
the terse name ambiguous?** If yes, qualify now. If no, terseness
pays — proportionally to how often the name appears at call sites.
Long breadcrumb names earn their length by narrowing; every
segment in `grida-canvas-react-renderer-dom` discriminates against
a sibling that differs at that segment. Segments that don't
narrow are decoration, and decoration erodes trust in the ones
that do.

## Order segments so tree-views become indices

The alphabetic sort in a file tree is the primary lookup index
most readers use. **Domain first, role last** makes the tree a
usable index — the canvas family clusters, its react variants
cluster under that, the DOM renderer variant under that.
Role-as-prefix inverts this and scatters siblings across the
alphabet by what they _do_ rather than what they're _of_. That's
why `*-hosted`, `*-wasm`, `*-react`, `*-renderer-<backend>` are
always suffixes.

## Scope membership and lifecycle signals are governance

`@grida/*` and the `grida-canvas-*` package family are not filing
conventions — they are assertions that these packages share
release cadence, review ownership, and compatibility guarantees.
Adding a package to the scope is a governance decision.
`react-p-queue` lives unscoped because it doesn't derive identity
from Grida.

The same is true of lifecycle signals in names — `-legacy`,
`-experimental-*`, `x-` (cross-cutting / vendor-adjacent),
`-hosted`. They carry more trust than documentation because they
sit in the name itself, and that trust decays the moment they
stop being accurate. Prune: promote out of `experimental/` when
the shape settles; remove `legacy/` when the replacement is done;
don't let `x-` become the label for "anything weird."

## Test corpora want queryability, not hierarchy

A flat directory of kebab-breadcrumb filenames is an index
optimized for grep and prefix-completion — the reader's first
motion — not browsing. Nest only when a subfolder would be a
browseable category a reader would open without knowing the case
they want. Almost no real test corpus is that.

## Route groups partition readers

`(www)` / `(site)` / `(workbench)` / `(workspace)` / `(tenant)`
encode **who is on the other side of the screen**, not which
feature lives here. Each group is a surface with its own auth,
chrome, analytics, and deployability story. Adding a group is an
architectural commitment; if it's a new feature for an existing
reader, it belongs inside an existing group.

## The short version

- Name first. If you can't name it, you don't understand it yet.
- A strict, honest name refuses the wrong content. That refusal
  is the engine of the repo's shape.
- One module, one thing. Two-thing names can't gate anything.
- Flatten with siblings, or extract a new module. Don't nest to
  hide scope drift.
- The diff test: well-named modules produce per-file diffs and
  delete cleanly. Failing either test is a naming problem, not
  an architecture problem.
- Public names are commitments; directory names are cheap. Let
  them differ.
- Terseness is a uniqueness claim, not an abbreviation.
- Scopes and lifecycle signals are governance — keep them honest.

See [`cases.md`](cases.md) for concrete tables and the
grandfathered short-name list.
