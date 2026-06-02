---
name: docs-wg
description: >
  Doctrine for drafting and keeping working-group docs under
  `docs/wg/**` — RFC/RFD specs and findings/research/glossary. A WG doc
  is a language-agnostic, code-agnostic study of a domain: it argues
  *why* and defines *what*, never *how in our code*. Use when writing or
  editing anything under `docs/wg/`, an RFC/RFD, a spec, a design note, a
  glossary, or research findings — including "write up the design",
  "document the spec", or "capture what we learned". Not for plans/TODOs
  (untracked `*.plan.md`), user docs, or SDK API refs — use `docs` to
  route those.
---

# WG docs

Working-group docs are where Grida reasons about a problem **before and
above** any one implementation. A good WG doc could be handed to someone
rebuilding the feature in a different language, on a different stack, in a
different decade, and still be the right starting point. That is the bar.

The reason WG docs are code-agnostic is not stylistic. Code moves; a file
path or a function name is stale within months, and a doc anchored to it
rots into a lie. A doc anchored to the _domain_ — the problem, the spec,
the why — stays true as long as the problem does. You are writing the
thing that outlives the code.

This skill is the doctrine. Operational mechanics (frontmatter,
`format: md`, `draft`/`unlisted`/`doc_tasks`, the sync model) live in
[`docs/AGENTS.md`](../../../docs/AGENTS.md) — read it once. For _reading_
the WG tree before you edit, use [`grounding`](../grounding/SKILL.md).

## The two genres

A WG doc is almost always one of these. Name which before you draft —
they have different shapes.

### 1. RFC / RFD — spec

A specification of _what a feature or system is_ and _why it is that
way_. Spec-rich. It defines vocabulary, states constraints and
invariants, and argues the design tradeoffs. It reads like a standards
document, not like a code comment.

- **Covers why and what.** The motivation, the requirements, the model,
  the chosen design and the alternatives rejected (and why).
- **No code-level implementation detail.** Describe the behavior and the
  contract, not the functions that will realize them. If you find
  yourself naming a struct or a file, you have dropped from spec altitude
  into implementation — climb back up.
- **Language- and stack-agnostic.** Express the model in terms a second
  implementer could honor, not in terms of the current one.

### 2. Findings / research / glossary

Grounded, concise domain knowledge — what is _true_ about the problem
space. A glossary that pins down vocabulary; findings that record what a
study established; research that surveys how the domain is understood.

- **Always factual and grounded.** Every claim traceable to a spec, a
  standard, or a demonstrated result — not to a hunch or a memory.
- **Concise and managed.** This is reference material; it earns its keep
  by being correct and findable, not long.
- **Domain-first.** It studies the _problem_, not Grida's solution to it.

> **The dedicated upstream-survey subtree is `docs/wg/research/**`**, and
it has its own stricter rules (pure survey, Grida absent from the body).
When writing there, use [`research`](../research/SKILL.md) — it governs
> that subtree specifically. This skill governs the broader WG surface.

## What a good WG doc is

- **Clear and well-researched** — the reader trusts it because it shows
  its grounding.
- **Always factual; agnostic spec; language-agnostic** — true regardless
  of who implements it or in what.
- **A deep study and a starting place** — the canonical entry point for
  understanding a feature or spec, covering _why_ and _what_.
- **A manifesto / doctrine when that is what the topic needs** — a WG doc
  may take a position and argue it. Taking a stance is allowed; the stance
  must rest on fact.

## What a bad WG doc is

These are not style nits — each one is the doc rotting or pointing the
reader wrong:

- **References specific parts of the code.** File paths, function names,
  line numbers. They date the doc and pull it down to implementation
  altitude. Describe the contract, not the call site.
- **References an external project as the model.** A WG doc studies the
  _domain_, not some other project's take on it. Citing "how library X
  does it" smuggles a foreign implementation in as if it were the spec.
  - **Exception: domain reference standards.** Citing a de-facto standard
    or reference implementation of the _domain itself_ is fine and often
    necessary — Chromium and the W3C/WHATWG specs for web rendering, for
    example, _are_ the domain. The test: are you citing the standard, or
    a project's opinion? Dedicated surveys of such sources belong in
    `docs/wg/research/**` under [`research`](../research/SKILL.md).
- **Dirty plans / TODO sprawl.** Scattered "TODO: fix this later" and
  half-formed task lists turn a reference into a scratchpad. Keep the doc
  a clean statement of what is true and intended.

## What is NOT a WG doc at all

These do not belong under `docs/wg/` in any form. They are a different
kind of artifact:

- **Plans.** Implementation plans live in `*.plan.md` files, which are
  **gitignored on purpose** ([.gitignore](../../../.gitignore)) — they are
  working scratch, not committed knowledge. A plan is about _the work_; a
  WG doc is about _the thing_.
- **TODO lists.** Tracked work belongs in issues/PRs, not in a doc.
- **Conversational logs / history / decision diaries.** "On Tuesday we
  decided…" is process, not knowledge. Historical snapshots that must be
  kept go under a `_history/` folder marked `unlisted: true` (see
  [`docs/AGENTS.md`](../../../docs/AGENTS.md)), never in the live spec.

The throughline: a WG doc states **what is true and what is intended**,
in domain terms, for a reader who arrives cold. Anything that is _about
the work_ rather than _about the thing_ is a different artifact.

## Placement and upkeep

- WG docs live in topic clusters: `docs/wg/feat-*/`, `docs/wg/format/`,
  `docs/wg/platform/`, `docs/wg/ai/`, and surveys in
  `docs/wg/research/`. Put the doc in the cluster that owns its topic;
  create a new `feat-<topic>/` cluster when none fits (consult
  [`naming`](../naming/SKILL.md) for the cluster name).
- **Most clusters have an `index.md` hub.** When you add a doc, update the
  hub so the cluster stays navigable — an orphaned doc is an unfindable
  doc.
- **Frontmatter** (per [`docs/AGENTS.md`](../../../docs/AGENTS.md)):
  `title`, a `description`, `tags: [internal, wg, <topic>…]` drawn from
  the controlled vocabulary in [`docs/tags.yml`](../../../docs/tags.yml),
  and `format: md` for plain-Markdown pages (the MDX-safety opt-out).
- **Links** follow the [`links`](../links/SKILL.md) skill: relative within
  `/docs`, GitHub-absolute for anything outside `/docs`, universal `/_/`
  routes for "open in the product."

## Before you save — review

- [ ] Could a second implementer in another language honor this doc
      without reading our code? If not, you have implementation detail to
      remove.
- [ ] Search the draft for file paths, function/struct names, `crates/`,
      `editor/`, `packages/`. Each match must justify itself — usually by
      being lifted to a domain-level statement.
- [ ] Any external project cited as _the model_ rather than as a domain
      standard? Reframe to the domain, or move a genuine survey to
      `research/`.
- [ ] Any `TODO`, plan fragment, or "we decided on <date>"? Remove it —
      it belongs in a plan, an issue, or `_history/`.
- [ ] Did you update the cluster `index.md`?

## Related skills

[`docs`](../docs/SKILL.md) (the family router — start there if unsure this
is even a WG doc), [`research`](../research/SKILL.md) (the `research/`
upstream-survey subtree), [`grounding`](../grounding/SKILL.md) (read and
reconcile before editing), [`links`](../links/SKILL.md),
[`naming`](../naming/SKILL.md) (cluster and concept names).
Operational mechanics: [`docs/AGENTS.md`](../../../docs/AGENTS.md).
