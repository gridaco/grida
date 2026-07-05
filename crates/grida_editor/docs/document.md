---
title: Document & Mutations
description: The editor's working copy of a document and the closed mutation vocabulary — the single way anything changes, feeding history, sync, and rendering alike.
tags:
  - internal
  - wg
  - editor
format: md
---

The **document** is the material being edited: a set of scenes, each a
tree of nodes with typed properties. What a node _is_ — its types and
properties — is owned by the format/schema specifications; this
document specifies the editor's relationship to it: the working copy
and the mutation vocabulary.

## The working copy

The editor holds one document as its working copy. Nodes are addressed
by **stable ids** — the ids that persist in files and cross instance
boundaries. Whatever faster internal handles an implementation uses,
every contract in this cluster is stated (and tested) in terms of
stable ids.

## The mutation vocabulary

All change flows through a **closed set of mutation operations**. The
vocabulary is deliberately small; everything an editor feature does
must compose from it:

| Mutation                         | Meaning                                                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insert(parent, index, subtree)` | Insert a node subtree under a parent at a document-order index                                                                                                                                                                                     |
| `remove(id)`                     | Remove a node and its subtree                                                                                                                                                                                                                      |
| `patch(id, props)`               | Set one or more properties on a node                                                                                                                                                                                                               |
| `move(ids, parent, index)`       | Reparent/reorder nodes to a parent at a **post-removal** document-order index                                                                                                                                                                      |
| `scene(op)`                      | Add, remove, or reorder scenes; document-level fields                                                                                                                                                                                              |
| `guide(op)`                      | Insert, remove, or reposition a per-scene guide — the [ruler](../../../docs/wg/canvas/ruler.md)'s delta to this vocabulary. Guide changes are non-structural for the renderer (chrome repaints, no scene rebuild) but carry every other rule below |

Rules that make the vocabulary load-bearing:

- **Invertible.** Given the pre-state, every mutation has a computable
  inverse mutation. This is what lets history store entries as data.
- **Serializable.** Every mutation is plain data — it can be logged,
  persisted, and sent over a wire. Sync transmits these same
  operations; there is no second "remote edit" vocabulary.
- **Atomic in batches.** A batch of mutations applies all-or-nothing
  and is observed as one change (one history entry when recorded, one
  notification to observers).
- **Validated.** A mutation that references a missing id, would create
  a cycle (moving a node into its own subtree), or violates the
  schema is rejected as a unit, with a diagnosable error — never a
  silent no-op, never a partial application.

Higher-level editing operations (group, ungroup, flatten, duplicate,
boolean ops) are **compositions**: they expand to mutation batches and
carry no special status in history or sync.

## Ordering

A parent's children are in **document order**: earlier renders behind
later ("first = back"). All mutation indices are document-order
indices; presentation layers that display reversed order (the
hierarchy panel shows front-on-top) own their own reversal and always
speak document order at this boundary. `move` indices are interpreted
**after** the moved nodes are detached — the "post-removal index" rule
— so a move is a single unambiguous splice.

## Change classification

Applying mutations yields a **change summary** — which nodes changed
and in what class (geometry, paint, structure) — produced at the
choke-point, not reverse-engineered by observers. Renderers and panels
subscribe to summaries; nothing diffs the document after the fact.

## Contracts

- **DOC-1** No API exists to alter the working copy except the
  mutation vocabulary; every observed document change corresponds to
  an applied mutation batch.
- **DOC-2** For every mutation batch B applied to state S, the
  computed inverse batch B⁻¹ applied to the result restores S
  (round-trip equality on the document).
- **DOC-3** Every mutation round-trips through serialization: encode →
  decode → apply behaves identically to apply.
- **DOC-4** An invalid mutation in a batch rejects the whole batch;
  the document is unchanged and the error identifies the offending
  mutation.
- **DOC-5** `move` uses post-removal indices: moving the node at
  index 0 to index 2 among five siblings places it third after the
  splice, and the operation is idempotent when re-applied to the
  resulting state.
- **DOC-6** Higher-level operations (group, ungroup, flatten,
  duplicate) produce mutation batches whose application and inversion
  need no knowledge of the operation that generated them.
- **DOC-7** Each applied batch yields exactly one change summary, and
  the summary's node set equals the set of nodes the batch touched.
