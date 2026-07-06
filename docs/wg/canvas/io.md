---
title: IO
description: Import, export, and clipboard — files in, files out, and document fragments across editor instances.
tags:
  - internal
  - wg
  - editor
format: md
---

IO is how documents and fragments cross the editor's boundary. Three
surfaces: **import** (file → document), **export** (document/node →
file), **clipboard** (fragment → fragment, including across
instances). The file format itself is owned by the format
specifications; this document specifies the editor-side behavior.
**Foreign** content arriving by drop or paste — the format matrix,
sniffing order, and placement — is [io-external.md](./io-external.md).

## Import

The reference editor opens documents in the native format, loading
them as the working copy ([editor.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/editor.md) lifecycle). Import
of foreign formats (vector graphics documents) inserts their
converted subtree as a mutation batch into the open document — an
undoable edit like any other, not a document swap.

## Export

- **Document export** writes the working copy to the native format
  such that open → export → open is identity (the round-trip
  contract).
- **Node export** renders a node (or selection) to raster or vector
  image formats at a chosen scale — the export renders from committed
  document state and is unaffected by in-flight previews.

## Clipboard

The clipboard carries **document fragments**: one or more node
subtrees encoded in the native serialized form, self-contained
(carrying the resources or references they need to be pasted
elsewhere).

- **Copy** encodes the selection (whole subtrees, in document order).
- **Paste** inserts the fragment as a mutation batch: new ids are
  minted for every pasted node (a fragment pasted twice yields two
  independent subtrees), the destination parent is resolved from
  context (selection, or scene root), and the paste is one history
  entry with the pasted nodes selected afterward.
- **Cross-instance paste** must work between two running editor
  instances via the system clipboard: the fragment encoding is
  self-describing and versioned, never process-local pointers.
- **Copy as PNG** additionally offers the rendered raster of the
  selection to the system clipboard — the outward-flavor half
  (alongside copy-as-SVG and the fallback flavors ordinary copy
  writes) is specified in [io-external.md](./io-external.md), "copy
  toward the outside".

Text editing owns its own clipboard behavior inside a session (plain
text); fragment copy/paste applies outside nested contexts.

## Contracts

- **IO-1** Document round-trip: open → export → open yields a
  byte-equal working copy (node identity, order, and properties all
  preserved).
- **IO-2** Foreign import is an edit: importing a foreign file into
  an open document is one undoable entry; undo removes the imported
  subtree entirely.
- **IO-3** Paste mints ids: pasting the same fragment twice produces
  disjoint id sets, and neither collides with existing ids.
- **IO-4** Copy/paste round-trip: copy selection → paste yields
  subtrees property-equal and structure-equal to the originals
  (ids excepted).
- **IO-5** Cross-instance: a fragment copied in instance A pastes in
  instance B (no shared process state), satisfying IO-3/IO-4.
- **IO-6** Paste is one entry: a multi-node paste undoes in one step,
  restoring prior selection.
- **IO-7** Export excludes previews: exporting during an in-flight
  gesture renders the last committed state.
