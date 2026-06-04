---
title: "Durable node identity — referencing a node across reloads and rewrites"
description: "RFD for the open problem behind #775: NodeId is parse-ephemeral, so there is no reference that survives a load() — let alone an external rewrite of the file. Frames the gap, scopes the candidate identity contracts (positional path, id attribute, semantic anchor), and sets the promotion gate before any public API lands."
keywords:
  - svg
  - svg-editor
  - identity
  - node-id
  - reference
  - round-trip
tags:
  - internal
  - svg
  - wg
format: md
---

# Durable node identity

**Status:** Open — problem framing, no committed design.
**Originating request:** [gridaco/grida#775](https://github.com/gridaco/grida/issues/775).

This RFD owns the reference half of #775. The serialization half
(`serialize_node`) shipped; see the package README. The positional
`node_path` / `node_at_path` proposal in #775 is **superseded by this
document** — see [Why the obvious answer is insufficient](#why-the-obvious-answer-is-insufficient).

## The gap

The editor identifies a node with a `NodeId`. That id is a random
per-parse string, minted when the document is parsed and discarded on the
next parse. It has two properties that matter here:

1. It **never appears in serialized output.** It is an in-memory handle,
   not a document fact.
2. It **regenerates on every parse.** `load()` the same bytes twice and
   the same logical element carries two different ids.

So there is no answer today to: _"the user selected this element; give me
a reference I can store, persist, or hand to another process, and later
resolve back to the same element."_ The `NodeId` cannot do it — it is gone
the moment the document is reloaded.

The need is real. The motivating scenario in #775: embed the editor as a
function over SVG, let the user select an element, and hand a downstream
process — concretely an AI coding agent — _that element_ for further work.
A `NodeId` is useless across that boundary: the agent sees SVG text, not
the editor's in-memory handles, and any reload re-mints the ids.

## What "durable" has to mean — two distinct contracts

"Survives a reload" hides two very different requirements. They must not be
conflated, because a mechanism that satisfies one can fail the other
completely.

- **C1 — survives a deterministic re-parse.** The same (or
  whitespace/comment-only-different) bytes are parsed again. The reference
  must resolve to the same logical element. Use case: app restart, reload
  of an unchanged file on disk, undo/redo across a `load()`.
- **C2 — survives a structural rewrite.** A _different agent_ — a human in
  another tool, or an AI pass — edits the file: inserts, removes, reorders,
  re-types elements, then the editor reloads the result. The reference must
  still resolve to "the same element the user meant."

C2 is the one #775's motivating scenario actually needs (the whole point is
to let the agent _edit_), and it is strictly harder. A reference scheme can
ace C1 and be worthless for C2.

## Candidate contracts, with honest scope

### Positional child-index path

Address a node by the chain of child indices from the root: "first element
child of root, then its third element child." Resolution walks the chain.

- **C1: yes.** Parsing is deterministic, so the index chain is stable
  across re-parse of the same bytes. Element-only indices (ignoring
  text/comment nodes) additionally tolerate whitespace/comment churn.
- **C2: no.** Any insert, remove, or reorder before the target shifts its
  index. The reference silently resolves to a _different_ element, or to
  none. Exactly the edits an editing agent performs are the edits that
  break it — so under C2 it is not merely weak, it is _misleading_: it
  resolves successfully to the wrong node.

#### Why the obvious answer is insufficient

This is the `node_path` / `node_at_path` shape proposed in #775. It is
cheap and it is derivable today from the editor's public `tree()` snapshot
(walk parents for the path; descend children to resolve) in a few lines —
which is itself a reason not to mint it as a public contract prematurely
(no second consumer has shaped it). But the deeper objection is the C1/C2
gap above: shipping it under a "survives a reload" headline would advertise
durability it does not have for the scenario that asked for it. If a
positional path is ever exposed, its contract must say **C1 only**, in
those words.

### The `id` attribute

SVG already has a serialized, author-facing identity mechanism: `id=""`.
The editor already reads it (display labels, `tree()` names).

- **C1: yes.** It is a document fact; it round-trips.
- **C2: mostly.** An agent that preserves ids keeps the reference valid
  across structural edits — `id` is position-independent. It breaks only if
  the agent renames or drops the id, which a cooperative agent need not do.
- **The catch — sovereignty (P1).** Not every node has an `id`, so this
  cannot be a _universal_ reference without the editor _minting_ ids. And
  minting ids is exactly the proprietary-noise the package exists to refuse
  — cf. the README's complaint about Illustrator stamping `SVGID_1_`. Any
  design that leans on `id` must answer: who writes the id, when, with the
  user's knowledge, and is an editor-authored id distinguishable from an
  authored one. "Silently inject ids so we have a handle" is a P1
  violation, not a design.

### Semantic anchor / selector

Address a node by a matchable description — a CSS/XPath-like selector, or a
structural fingerprint (tag + key attributes + neighborhood).

- **C1: yes. C2: best of the three** — a selector keyed on stable authored
  attributes tolerates reordering and unrelated inserts.
- **Cost.** Needs a matching engine, a disambiguation rule when more than
  one node matches, and a defined failure mode when zero match. This is the
  most capable and the most expensive option, and it has the largest design
  surface to get wrong.

## Non-goals / boundaries

- **Not a private id baked into the file.** Writing an editor-namespaced
  attribute (`grida:nodeid`) onto every element to carry identity is the
  proprietary-noise anti-goal in another costume. Rejected up front; if
  identity must be carried _in_ the file, it rides the author's own `id`,
  on the author's terms.
- **Not a sync/CRDT identity.** This is single-document reference
  resolution, not multiplayer node identity. "Not a Figma-style multiplayer
  canvas" still holds.

## Open questions

1. Is C1 alone worth a public API, or does exposing a C1-only reference
   just invite the C2 misuse it can't support?
2. For `id`-based identity: what is the honest UX for "this element needs a
   stable handle but has no id" — refuse, prompt, or an explicit
   user-invoked "assign id" command (never silent)?
3. Does the downstream consumer (the agent embedding) actually need
   _editor_-resolvable identity, or does it need a _document_-level anchor
   it resolves itself (in which case the editor's job is only to _report_ a
   good anchor for a selection, not to resolve one back)?

## Promotion gate

No public reference API lands until **≥2 internal consumers** have shaped
the contract (the package's P6 / promotion rule). The agent-embedding in
#775 is the first. A second — a persistence layer that stores selections,
or a layers panel that pins a node across reloads — must exist and exert
pressure on the shape before it escapes the package. Until then the
capability stays a documented recipe over `tree()` (for the C1 case) and
this RFD (for the rest).
