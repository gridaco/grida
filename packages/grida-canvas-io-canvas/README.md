# `@grida/io-canvas`

> **v0.x — unstable. No compatibility guarantees.** The public surface will be
> shaped by its second consumer (the desktop editor) before it is locked.

Reader/writer for the **`.canvas`** format: a _portable directory_ holding one
or more standalone documents (V1: SVG slides) plus a single `canvas.json`
manifest. It is a _container_ format one layer above [`.grida`](../../format)
and SVG — a folder of documents with an order and an optional 2D placement.

Spec: [`docs/wg/format/canvas.md`](../../docs/wg/format/canvas.md).

## Mental model

A reader is **tolerant by construction** — an invalid, partial, or weird
`.canvas` is a normal state of the world, not an error to reject. The one
load-bearing rule:

> **The manifest is authoritative for _order_ and _placement_; disk is
> authoritative for _existence_.**

`canvas.json` + the files on disk are the source of truth. The resolved view
this package returns is rebuilt on every `read` — never a cache.

## Usage

```ts
import { iocanvas } from "@grida/io-canvas";

// `fs` is any object with `list()` / `read()` (and `write()` to persist).
// `AgentFs.Backend` satisfies this structurally; tests use a Map-backed stub.
const canvas = await iocanvas.read(fs);

canvas.mode; //=> "declared" | "implicit"
canvas.type; //=> "svg-slides" | "unknown"
canvas.documents; //=> reconciled, ordered ResolvedDocument[]  (the slides view)
canvas.thumbnail; //=> resolved path | null
canvas.warnings; //=> non-fatal observations (it never throws on a bad bundle)

// Edit-then-write round-trips unknown fields (mutate the carried manifest):
if (canvas.manifest) await iocanvas.write(fs, canvas.manifest);
```

The pure core is also exported for callers that already hold the pieces:
`iocanvas.resolve(manifest | null, rootEntries)` and
`iocanvas.serialize(manifest)`.

### Editing a deck's structure (pure transforms)

When a deck's _structure or arrangement_ changes, edit the manifest with the
pure `(manifest, …) -> manifest` transforms, then `write` the result. They never
mutate the input, always preserve unknown top-level / per-document fields and
`ext`, and are tolerant — an operation that can't apply is a **no-op, not a
throw**:

```ts
let m = canvas.manifest ?? {};
m = iocanvas.add(m, { src: "002.svg", id: "n_x1" }); // append a slide
m = iocanvas.remove(m, "n_x1"); // drop by identity (id ?? src)
m = iocanvas.reorder(m, ["001.svg", "000.svg"]); // permute the slides view
m = iocanvas.setLayout(m, "000.svg", { x: 0, y: 0 }); // set canvas-view placement
m = iocanvas.setLayout(m, "000.svg", null); // …or clear it
await iocanvas.write(fs, m);
```

The guarantee these carry — not the array surgery — is the value: **no duplicate
identity** (the same condition `resolve` warns about, refused at the source) and
**no lost unknown fields**. A consumer's own data (a human `name`, a `createdAt`,
selection, previews) stays consumer-side as unknown / `ext` data the transforms
round-trip; the format does not model it.

### The two views from one list

- **Slides view** = the _order_ of `documents`.
- **Canvas view** = each document's optional `layout` (`x/y/w/h/z`).

One list, two projections. A deck with no `layout` anywhere is still valid.

## Anti-goals (the perimeter that keeps this small)

- **Not a renderer / slide engine.** It resolves paths, order, and warnings;
  it never rasterizes SVG or lays out a deck.
- **Not a validator that rejects.** Failure is nature — it degrades and warns,
  never throws on a partial or malformed bundle.
- **Not a private IR or cache.** `canvas.json` + the files are the truth;
  `ResolvedCanvas` is rebuilt every read.
- **Not a filesystem / not a watcher.** It operates over an injected port — no
  `node:fs`, no path traversal, no change subscription.
- **Not a `.grida`/IR converter.** It stays agnostic about each document's
  internal format.
- **Not customizable.** No hooks to alter parsing, ordering, or precedence; the
  reconcile rule is fixed. The editing transforms are _fixed operations_, not
  extension points — they take no strategy/comparator and model no consumer
  state (`name`, selection, `activeId`, previews, persistence); those ride
  through as unknown / `ext` data the transforms preserve but never interpret.

## Public surface

| export                          | kind  | what                                                            |
| ------------------------------- | ----- | --------------------------------------------------------------- |
| `read(fs)`                      | IO    | load a bundle → `ResolvedCanvas`                                |
| `write(fs, manifest)`           | IO    | serialize + persist `canvas.json`                               |
| `resolve(m, entries)`           | pure  | reconcile a manifest against a listing (the heart)              |
| `serialize(manifest)`           | pure  | stable JSON (sorted keys, trailing newline)                     |
| `add(m, { src, id?, layout? })` | pure  | append a document; duplicate identity → no-op                   |
| `remove(m, idOrSrc)`            | pure  | drop a document by identity; absent key → no-op                 |
| `reorder(m, orderedKeys)`       | pure  | permute by identity; named first, unnamed keep order at the end |
| `setLayout(m, idOrSrc, layout)` | pure  | set placement; `null`/empty clears it; absent key → no-op       |
| `MANIFEST_FILENAME`             | const | `"canvas.json"`                                                 |
| `THUMBNAIL_NAMES`               | const | thumbnail filenames in precedence order                         |
| _types_                         | —     | `Manifest`, `ResolvedCanvas`, `ReadableFs`, `WritableFs`, …     |

The four `pure` transforms above share one contract: `(manifest, …) -> manifest`,
never mutating the input, always preserving unknown top-level / per-document
fields and `ext`, and degrading to a no-op (never a throw) when the operation
can't apply. _Identity_ is `id` when present and non-empty, else `src` — the same
rule `resolve` uses, so `add` can refuse the duplicate `resolve` would warn about.

## Test

```sh
pnpm --filter @grida/io-canvas test
pnpm --filter @grida/io-canvas typecheck
```

Tests are the spec: each `resolve`/`serialize` rule is pinned by a test whose
name is the RFD rule verbatim.
