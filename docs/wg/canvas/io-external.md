---
title: IO — External
description: Foreign content crossing into the editor — the drop format matrix, the paste sniffing order, placement rules, and the paste-is-load trust doctrine.
tags:
  - internal
  - wg
  - editor
format: md
---

External intake is how _foreign_ content enters the document: files
dropped on the canvas and non-native clipboard payloads pasted into
it. [io](./io.md) owns the native side (documents, fragments,
export); this document owns the foreign matrix. Drop and paste are
**one pipeline** — the same decoders and the same insertion behavior
— differing only in how the placement point arrives.

## The drop matrix

Every file dropped on the canvas resolves through a type matrix.
Detection is content-type first, extension fallback; resolution is
per file, so a multi-file drop inserts one result per file.

| Dropped                                                    | Result                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Raster image (PNG, JPEG, GIF, WebP)                        | an image node at the image's natural size, centered on the drop point, named after the file       |
| SVG file                                                   | the parsed vector subtree at its intrinsic size, centered on the drop point, named after the file |
| Plain text / markdown file                                 | a text node with the content                                                                      |
| Native document (the editor's own format)                  | **refused with guidance** — a document opens, it is not inserted into another document            |
| Foreign design document (e.g. a peer editor's file format) | refused with guidance toward the import flow                                                      |
| Anything else                                              | refused, **loudly** — the user is told the type is unsupported; nothing silently disappears       |

Insertion behaviors shared by all accepted rows: the drop is one
undoable entry per file (IO-2), the inserted nodes become the
selection, and image bytes enter the document's resource store —
the node references the resource; it does not point at the outside
world.

Asset-panel drags (the editor's own library) ride an internal
payload and are not "external" in this sense — they follow the same
insertion behaviors but skip the foreign matrix.

## The paste sniffing order

A paste event carries multiple representations; the editor resolves
them in a fixed precedence, first match wins:

1. **Native fragment** — the self-describing encoded fragment
   ([io](./io.md) clipboard). Freshness rule: the encoded payload
   carries an id; when it matches the editor's own last-copied
   payload, the internal buffer is used directly (highest fidelity),
   otherwise the encoded fragment is decoded as data.
2. **Peer-editor clipboard** — a recognized foreign editor payload
   (detected by its own markers inside the HTML flavor) converts
   through the corresponding importer and inserts the converted
   subtree.
3. **SVG source text** — a text payload that is an SVG document
   fragment parses and inserts as a vector subtree.
4. **Image bytes** — an image flavor inserts as an image node at
   natural size.
5. **Plain text** — a non-empty text payload inserts as a text node.
   Empty or whitespace-only text inserts nothing.

The order is normative: a payload matching several rows (they often
do — HTML plus text plus image) resolves by precedence, not by
platform enumeration order. Unrecognized payloads refuse as a no-op
— observable to the host, silent to the document.

## Placement

Where intake lands is decided by how it arrived:

- **Drop**: centered on the drop point.
- **Paste via context menu**: at the menu's opening point (CTX-3).
- **Paste via keybinding**: at the viewport center.
- Pasted native fragments preserve their recorded position when the
  source context is compatible ([io](./io.md)); foreign payloads
  have no such context and always use the rules above.

In every case the inserted nodes become the selection, and the
destination parent resolves from context exactly as native paste
does.

## Copy toward the outside

The mirror direction, so external round-trips are honest:

- **Copy as SVG** writes both an SVG flavor and its source text —
  paste into a text editor yields markup; paste back into the editor
  round-trips through row 3.
- **Copy as PNG** writes the rendered raster of the selection at
  document scale: the committed appearance, rendered in isolation
  (the node's own opacity applies; ancestor opacity does not). A
  multi-node selection rasters as one image over its union bounds.
- Ordinary copy always writes the native fragment _plus_ fallback
  flavors, so external applications receive something useful and
  the editor itself receives the highest-fidelity row.

## Trust

**Paste is load.** Pasting foreign markup has exactly the trust
surface of opening a file with that markup: intake preserves content
faithfully and never silently rewrites it — screening or sanitizing
is a host decision at the host boundary, not a hidden mutation
inside the editor. What renders after intake is the rendering
layer's hardening problem, not the clipboard's.

## Contracts

- **IOX-1** The drop matrix is total: every accepted type inserts
  per the table; every refused type produces user-visible feedback;
  no drop is silently ignored.
- **IOX-2** Sniffing is deterministic: a payload carrying multiple
  flavors resolves to the highest-precedence row on every platform.
- **IOX-3** Fresh-native priority: after an internal copy, paste
  reproduces the internal fragment even if the OS clipboard also
  holds foreign flavors; after an external copy elsewhere, the
  foreign payload wins.
- **IOX-4** SVG text round-trip: copy-as-SVG then paste yields a
  subtree that renders identically to the original selection, as
  one undoable entry with the result selected.
- **IOX-5** Placement: drop centers on the drop point; menu paste
  lands at the menu's opening point; keybinding paste at viewport
  center.
- **IOX-6** Multi-file drop inserts one entry per file, each
  independently undoable.
- **IOX-7** Raster round-trip: copy-as-PNG followed by paste inserts
  an image node at the raster's natural size, backed by exactly the
  copied pixels, as one undoable entry with the node selected —
  copy-as-PNG's output is a valid row-4 paste input.
