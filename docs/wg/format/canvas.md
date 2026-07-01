---
title: ".canvas Directory Contract"
format: md
tags:
  - internal
  - wg
  - format
  - canvas
---

# `.canvas` — Directory Contract

> **Status: Draft V1** · App-agnostic format spec · Last updated 2026-06-16

A `.canvas` is a **portable directory** that holds one or more standalone documents
(SVG by default) plus a single manifest that describes how to interpret them. It is
a _container_ format, not a scene format — it sits a layer above [`.grida`](./grida) and
[SVG](./svg): a `.grida` file is one scene's IR; a `.canvas` is a folder of standalone
documents with an order and an optional 2D placement.

The manifest describes the bundle along **two orthogonal axes**: an **editor**
(`editor` — which editor opens the bundle: a linear _slides_ deck or a freeform
_board_) and a **content** kind (`files` — which file patterns are documents,
e.g. SVG). They are independent: a deck of SVGs and a board of SVGs differ only
in `editor`; a deck of SVGs and a deck of some other document kind differ only
in `files`.

## 0. Philosophy — the only load-bearing part

1. **Reader-first, not writer-first.** This spec defines how a _tolerant reader
   interprets_ a `.canvas`, not how authors must write one. Like a code editor opening a
   folder: it reads whatever is there and does its best (Postel's law).
2. **Minimally valid. Failure is nature.** There are almost no MUSTs. An invalid,
   partial, or weird `.canvas` is a normal state of the world, not an error to reject.
   Readers **degrade**; they do not hard-fail.
3. **The directory has no required shape.** Humans and agents author it however they
   like. The spec constrains _one file_ and nothing else.
4. **The manifest is the only authority.** `.canvas.json` (the _godfile_) is the single
   authored contract — the only file the reader parses. When it is present and parseable
   the reader follows it; absent or malformed, the reader degrades to implicit mode (§5),
   it does not reject. Every other file is **taste** — opaque to the format, never
   required, never validated.
5. **100% portable.** It is a folder of files with relative references. Copy it, zip it,
   email the folder, check it into git. No database, no absolute paths, no host coupling.

## 1. What a `.canvas` is

A **directory**, conventionally suffixed `.canvas` (e.g. `intro-deck.canvas/`). The
suffix is a _hint_, not the contract.

- **Marker:** the directory contains a root file named **`.canvas.json`**. Its _presence_
  — not the folder's name — is what declares the directory a `.canvas`.
- **Declared mode:** `.canvas.json` present → the reader follows it.
- **Implicit mode:** `.canvas.json` absent or unreadable → a reader **MAY** still open the
  directory best-effort as `editor: "unknown"`, deriving content from the files it finds.
  (This is the "open any folder" behavior; it is optional and lossy.)

> **Marker name.** The marker is **`.canvas.json`** — hidden (a dotfile) and JSON-typed, so
> editor tooling and `$schema` still apply, while staying unmistakable from JSONCanvas's
> single-file `*.canvas`. It is matched case-sensitively at the bundle root.

A directory is never _invalid_ — at worst it is _implicit_.

## 2. The godfile — `.canvas.json`

JSON. **The minimal valid manifest is `{}`** — every field is optional and the reader
fills defaults. All paths are **relative to the bundle root**; `..` escape and absolute
paths are out of scope for V1 (see [§9](#9-open-questions-need-an-rfd-before-theyre-v2)).

**Containment is the host's responsibility.** A reader reconciles `src` against the
directory listing for _existence only_ — it is **not** a security boundary and does not
reject `..`-traversal or absolute paths. A consuming application that maps a `src` to a
real file MUST guard containment itself before any file operation.

```jsonc
{
  // OPTIONAL. Spec version this manifest targets. Missing → reader assumes current.
  "version": "1",

  // OPTIONAL. Editor-tooling hint only. Ignored by readers.
  "$schema": "https://grida.co/schema/dotcanvas/v1.json",

  // OPTIONAL. EDITOR. "slides" | "board" | "unknown". Unrecognized/missing → "unknown". See §3.
  "editor": "slides",

  // OPTIONAL. CONTENT. The glob patterns whose matches are documents — and the
  // file kind a host opens an editor for. Missing → ["*.svg"]. Empty [] derives
  // nothing (rely on `documents`). Patterns match root basenames; `*` only. See §3.
  "files": ["*.svg"],

  // OPTIONAL. Explicit thumbnail pointer; overrides the filename convention in §4.
  "thumbnail": "thumbnail.png",

  // OPTIONAL. The ordered set of documents. ABSENT → reader derives from disk (§5).
  // Array order IS the sequence order (the "slides view").
  "documents": [
    {
      "src": "001.svg", // the only field that means anything; relative path
      "id": "n_a1b2", // OPTIONAL stable id; absent → `src` is the identity
      "layout": {
        // OPTIONAL 2D placement (the "canvas view"); absent → no canvas position
        "x": 0,
        "y": 0,
        "w": 1920,
        "h": 1080,
        "z": 0,
      },
      // OPTIONAL. Skip this document in the LINEAR slides view (it still EXISTS
      // and shows in the canvas view); absent → not skipped. Advisory only.
      "skip": false,
      // NOTE: there is no `name`/`title` field — a human label is the document's
      // own content's job (for an SVG slide, its `<title>` element).
    },
  ],

  // OPTIONAL. Vendor/app extension bag. Readers ignore keys they don't own; SHOULD round-trip them.
  "ext": { "...": {} },
}
```

### The two views from one list

This is the Figma-Slides duality (slides view + canvas view), expressed minimally:

- **Slides view** = the **order** of `documents[]`. Each entry whose `src` is a document
  is rendered as **exactly one slide**, in array order. This view is what `editor: "slides"`
  presents primarily.
- **Canvas view** = each entry's optional **`layout`** — where that same document sits on
  a 2D surface. Entries without `layout` simply have no canvas position (the reader
  auto-places or omits them). This view is what `editor: "board"` presents primarily.

One list, two projections. Both projections exist on every bundle regardless of `editor`;
`editor` only names which is the **primary** presentation. The canvas view is purely
additive: a `slides` document with no `layout` anywhere is still a perfectly valid linear
deck, and a `board` is the same list read through `layout` instead of order.

**Skip (slides view).** A document may carry `"skip": true` — omitted from the linear
slides view's running order while it still **exists** and shows in the canvas view. It is
_skipped_, not _hidden_: a non-linear viewer still sees it. Skip is **advisory** — the
reader round-trips it but does not drop skipped documents; honoring it is the slides UI's
job. This mirrors PowerPoint (`sld@show`), Google Slides (`isSkipped`), and
Keynote/Figma "Skip Slide".

**No `name`/`title`.** A human label is deliberately **not** a manifest field — it is the
document's own content's job (for an SVG slide, its `<title>` element), matching how
PowerPoint, Google Slides, and Keynote derive a slide's title from its content rather
than from deck metadata. The manifest governs order, placement, existence, and skip; the
label travels inside the document.

## 3. Editor (`editor`) and content (`files`)

A `.canvas` is described along two orthogonal axes. **Editor** is _which editor opens the
bundle_ — how the documents are read/presented (à la Figma's `editorType`); **content** is
_what_ they are. They are independent, so any editor can hold any content kind.

### 3a. Editor — `editor`

| `editor`     | Meaning                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `"slides"`   | A **linear deck**. `documents[]` order is the primary presentation (the running order); `layout` is an additive canvas view.               |
| `"board"`    | A **freeform canvas**. Each document's `layout` is the primary presentation (2D placement); order is secondary.                            |
| `"unknown"`  | The reader makes no assumption. Default for a missing/unrecognized `editor` and implicit mode.                                             |
| _(reserved)_ | All other strings are reserved for future editors. A reader that doesn't recognize an `editor` treats it as `"unknown"` — it never errors. |

### 3b. Content — `files`

`files` is the set of **glob patterns whose matches at the bundle root are documents** —
and, by the same token, the document **file kind a host opens an editor for** (`*.svg` →
an SVG editor).

- **Missing → `["*.svg"]`.** SVG is the V1 default, so an SVG `.canvas` needs no `files`.
- **Explicit `[]` derives nothing** — membership comes only from `documents[]`.
- Patterns match **root basenames**; `*` (any run) is the only wildcard in V1.
- It is **advisory and tolerant**: it drives disk-derivation (§5) and the host's editor
  choice, but a junk pattern simply matches nothing — never an error.

This is the seam that lets a future content kind join without a new `editor`: the editor
stays `slides`/`board`; only `files` changes.

## 4. Thumbnail (by convention)

A reader looks for a root file named **`thumbnail.png` / `thumbnail.svg` / `thumbnail.jpg`
/ `thumbnail.jpeg`**.

- All optional.
- If **multiple** exist: **`png` wins**, then `svg`, then `jpg`/`jpeg`. The others are a
  **lint warning, not an error** (failure is nature).
- An explicit `thumbnail` field in `.canvas.json` **overrides** the convention.

## 5. Reader semantics (the heart)

A conforming reader is tolerant by construction:

| Situation                                         | Behavior                                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.canvas.json` missing                            | Open in **implicit mode**, `editor: "unknown"`; MAY derive a document list from on-disk files.                                                                                                                |
| `.canvas.json` is malformed JSON                  | **Degrade to implicit mode + surface a warning.** Do not hard-fail.                                                                                                                                           |
| Unknown top-level fields / unknown `editor`       | **Ignore** (and SHOULD preserve on write).                                                                                                                                                                    |
| `documents` absent                                | **Derive from disk:** list root files matching `files` (default `["*.svg"]`), **excluding any reserved thumbnail cover** (§4), order **lexically by filename** (the `nnn.svg` convention, §8).                |
| A `documents[].src` points at a missing **file**  | **Skip it with a warning.** Disk wins.                                                                                                                                                                        |
| A `documents[].src` is a **URI** (`scheme://…`)   | **Include it as-is** — a pointable reference, used as written. It has no on-disk presence to check, so it is **always present** (no existence check, no warning). Disk-existence applies to _file_ srcs only. |
| Disk has matching files not listed in `documents` | Reader **MAY append** them after the listed ones (disk wins for _existence_; manifest wins for _order_).                                                                                                      |
| Two entries share an `id`/`src`                   | Linter warning; reader keeps the first.                                                                                                                                                                       |

The reconcile rule in one line: **the manifest is authoritative for order and placement;
disk is authoritative for the existence of _file_ srcs** (a URI src is a reference, present by
definition).

Ordering is exactly **`documents` order, then disk-only matches appended lexically** —
there is no auto-renumber or re-sort mode (no "re-sequence to `nnn.svg`"), and there
won't be. Any renumbering is a consumer's own behavior, not the reader's.

## 6. Editor semantics (informative)

What a reader/editor does with a `.canvas` — descriptive, not normative:

- Reads `.canvas.json`, renders documents in order (slides view) and optionally at their
  `layout` (canvas view).
- Edits an individual document by rewriting its `src` file in place. The document is a
  standalone SVG; editing it doesn't touch the manifest.
- Reorder / move / show-hide → rewrites `.canvas.json`. (Reorder = array order; move =
  `layout`.)
- Two writers (e.g. an agent and a direct-manipulation editor) coordinate through the
  files on disk; last-write-wins per file is the floor.

## 7. Everything else is taste

Any file that isn't `.canvas.json` or a referenced document is **opaque to the format**:

- `plan.md`, `styles.css`, `theme.css`, `assets/`, notes, scratch files, an app's private
  sidecars — **none of these are part of the contract.**
- A tool MAY use them by its own private convention. The format neither requires, defines,
  nor validates them.
- A `.canvas` with nothing but `.canvas.json` is valid. A `.canvas` cluttered with a
  hundred unrelated files is also valid.

## 8. Recommendations for writers (non-binding)

These are SHOULDs, offered so the format ages well — not gates:

- **Preserve unknown fields** on round-trip (don't destroy a newer writer's data).
- **Relative paths for bundled documents**; keep the bundle self-contained where you can. A
  **URI src** is allowed (an external reference, used as-is) — but it makes the bundle no longer
  self-contained, so prefer a bundled file when portability-when-copied matters (see §9).
- **Stable-ish serialization** (sorted keys, trailing newline) so `git` diffs stay
  legible — nice for local-first, not required.
- Prefer convention (`nnn.svg`, `thumbnail.png`) when you have no reason to deviate, so
  the implicit-mode reader degrades gracefully.
- **Number slide files `001.svg`, `002.svg`, … — 1-based, zero-padded.** Page numbers
  start at 1, so a 1-based filename matches the slide number a viewer shows (file `00N.svg`
  ≈ page N), which is friendlier than the 0-based `000.svg`. This is only a writer
  recommendation: the reader sorts lexically and is indifferent to the starting index
  (`000.svg` is still read fine). _Nuance:_ once a slide is **skipped** (or `documents[]`
  reorders away from filename order), the file number and the visible page number diverge
  by the skipped count — that misalignment is inherent to any file-number scheme and is
  **not** a reason to 0-base or to avoid numbering.

## 9. Open questions (need an RFD before they're V2)

- **External resources / links.** _Partially resolved._ A `documents[].src` MAY be a **URI**
  (`scheme://…`) — a pointable reference used as-is, a first-class placed document alongside
  bundled files (it skips the disk-existence check; §5). This is the deliberate stance that a
  reference is a reference: the contract holds the link; resolving and rendering it (and any
  host-side fetch policy) is the consumer's concern, not the format's. **Still open:** symlinks,
  linked sibling `.canvas`es, and the **portability-when-copied** question — a bundle whose
  documents point at URIs is no longer self-contained, so a future _pack/localize_ step (snapshot
  external references into the bundle) is what "100% portable" needs. That packing step needs its
  own RFD; the URI-`src` reference itself does not.
- **Stable identity vs path identity.** V1 lets `src` be the identity. Once rename +
  canvas-view + reorder all compose, opaque `id`s may need to be promoted from optional to
  recommended (move a file and every `layout` entry dangles).
- **Sealed transport.** A zipped single-file form for sharing must **not** reuse the
  `.canvas` suffix (that collides with single-file `.canvas` formats elsewhere, e.g.
  Obsidian's JSON Canvas). Naming TBD.
- ~~**Slides → general promotion.**~~ **Resolved.** The general editor is `editor: "board"`
  (§3a), reached by the orthogonal `editor` (application axis) and `files` (content) axes —
  exactly the reserved-`editor` + additive-`layout` mechanism this question anticipated.
  Further content kinds join via `files`, no new editor needed.

## Relationship to other Grida formats

| Format              | Layer         | What it is                                                                                |
| ------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| [SVG](./svg)        | document      | A single standalone graphic. The default document content (`files: ["*.svg"]`).           |
| [`.grida`](./grida) | scene IR      | One scene's node graph (FlatBuffers). A single document's internal representation.        |
| **`.canvas`**       | **container** | A portable _directory_ of standalone documents + a manifest (order + optional 2D layout). |

`.canvas` does not replace or wrap `.grida`; it is a higher layer. A `.canvas` references
documents by relative path and stays agnostic about each document's internal format — V1
standardizes on SVG, but `files` reserves room for other document kinds.

## Appendix A — Prior art & divergences (non-normative)

- **JSONCanvas (Obsidian).** Studied, not adopted. We borrowed the validated shape — a
  node = id + file ref + 2D box — and explicitly _rejected_ its single-file container, its
  node+**edge** flowchart model (we have no edges in V1), and its silence on
  versioning/unknown-fields. Convergent where the problem forces it; divergent where its
  choices were weak. The name collision is tolerated because ours is a **directory**,
  theirs is a **file**.
- **Figma family** (`.fig` / `.jam` / `.deck` / …). The lesson we kept: **one substrate,
  the editor as a profile** (`editor`), so slides can be promoted to a general canvas
  without a format rename.
- **Sketch** (`.sketch` zip). The lesson: separate content from view-state. We go
  further — view-state (order/placement) is _also_ document data, and the only validated
  file.
- **Freeform** (opaque SQLite in an iCloud container). The anti-pattern. We are the
  transparent inverse: a portable folder of files.
