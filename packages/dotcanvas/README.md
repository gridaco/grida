# `dotcanvas`

> **v0.1.x — published, still pre-1.0.** **ESM-only**, **zero runtime deps**. The
> surface is shaped by its consumers and may change in a minor until 1.0 — pin a
> minor (`pnpm add dotcanvas`).

Reader/writer for the **`.canvas`** format: a _portable directory_ holding one
or more standalone documents (V1: SVG slides) plus a single `canvas.json`
manifest. It is a _container_ format one layer above
[`.grida`](https://github.com/gridaco/grida/tree/main/format) and SVG — a folder
of documents with an order and an optional 2D placement.

Spec: [`docs/wg/format/canvas.md`](https://github.com/gridaco/grida/blob/main/docs/wg/format/canvas.md).

## Install

```sh
npm i dotcanvas   # or: pnpm add dotcanvas · yarn add dotcanvas
```

**ESM-only**, **zero runtime dependencies**; ships built `dist/` (`.js` + `.d.ts`).

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
import { dotcanvas } from "dotcanvas";

// `fs` is any object with `list()` / `read()` (and `write()` to persist).
// `AgentFs.Backend` satisfies this structurally; tests use a Map-backed stub.
const canvas = await dotcanvas.read(fs);

canvas.mode; //=> "declared" | "implicit"
canvas.type; //=> "svg-slides" | "unknown"
canvas.documents; //=> reconciled, ordered ResolvedDocument[]  (the slides view)
canvas.thumbnail; //=> resolved path | null
canvas.warnings; //=> non-fatal observations (it never throws on a bad bundle)

// Edit-then-write round-trips unknown fields (mutate the carried manifest):
if (canvas.manifest) await dotcanvas.write(fs, canvas.manifest);
```

The pure core is also exported for callers that already hold the pieces:
`dotcanvas.resolve(manifest | null, rootEntries)` and
`dotcanvas.serialize(manifest)`.

Each `resolved.documents[]` carries its source manifest entry as `meta` (the raw
`ManifestDocument`, unknown per-doc fields and all; `undefined` for disk-appended
docs) — so a consumer renders per-document metadata (a human `name`, a `hidden`
flag) from the resolved view alone, without re-joining `resolved.manifest`.

### Self-heal (reconcile against disk → persist)

`heal(manifest | null, rootEntries)` is the write-side twin of `resolve`: it
returns a **writable**, reconciled manifest. The canonical self-heal is one line —
drop documents whose `src` is gone, append disk-only SVGs, and keep every
`id`/`layout`/unknown/`ext` intact:

```ts
const resolved = await dotcanvas.read(fs);
await dotcanvas.write(fs, dotcanvas.heal(resolved.manifest, await fs.list()));
```

### Typing your `ext` bag

`Manifest`/`ResolvedCanvas` are generic over the vendor bag you own (default
`Record<string, unknown>`, so it's backward compatible). `TExt` is _trusted, not
validated_ — the reader never checks `ext` against it:

```ts
type MyExt = { "com.acme.deck": { updatedAt: number } };
const r = await dotcanvas.read<MyExt>(fs); // r.ext is MyExt — no cast
```

### Editing a deck's structure (pure transforms)

When a deck's _structure or arrangement_ changes, edit the manifest with the
pure `(manifest, …) -> manifest` transforms, then `write` the result. They never
mutate the input, always preserve unknown top-level / per-document fields and
`ext`, and are tolerant — an operation that can't apply is a **no-op, not a
throw**:

```ts
let m = canvas.manifest ?? {};
m = dotcanvas.add(m, { src: "003.svg", id: "n_x1" }); // append a slide
m = dotcanvas.remove(m, "n_x1"); // drop by identity (id ?? src)
m = dotcanvas.reorder(m, ["002.svg", "001.svg"]); // permute the slides view
m = dotcanvas.setLayout(m, "001.svg", { x: 0, y: 0 }); // set canvas-view placement
m = dotcanvas.setLayout(m, "001.svg", null); // …or clear it
m = dotcanvas.setSkip(m, "001.svg", true); // skip in the slides view (false clears)
await dotcanvas.write(fs, m);
```

The guarantee these carry — not the array surgery — is the value: **no duplicate
identity** (the same condition `resolve` warns about, refused at the source) and
**no lost unknown fields**. The format models a document's _view-state_
(`layout`, `skip`); a consumer's own app data (a `createdAt`, selection,
previews, an active id) stays consumer-side as unknown / `ext` data the
transforms round-trip but never interpret. A human **label/title** specifically
is the document content's job — for an SVG slide, its `<title>` element — not a
manifest field.

### The two views from one list

- **Slides view** = the _order_ of `documents` (a document with `skip: true` is
  omitted from this view's running order, but still exists and shows on the canvas).
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
| `resolve(m, entries)`           | pure  | reconcile a manifest against a listing → read view (the heart)  |
| `heal(m, entries)`              | pure  | reconcile a manifest against a listing → **writable** manifest  |
| `serialize(manifest)`           | pure  | stable JSON (sorted keys, trailing newline)                     |
| `add(m, { src, id?, layout? })` | pure  | append a document; duplicate identity → no-op                   |
| `remove(m, idOrSrc)`            | pure  | drop a document by identity; absent key → no-op                 |
| `reorder(m, orderedKeys)`       | pure  | permute by identity; named first, unnamed keep order at the end |
| `setLayout(m, idOrSrc, layout)` | pure  | set placement; `null`/empty clears it; absent key → no-op       |
| `setSkip(m, idOrSrc, skip)`     | pure  | skip in the slides view; `false` clears the field; absent → no-op |
| `MANIFEST_FILENAME`             | const | `"canvas.json"`                                                 |
| `THUMBNAIL_NAMES`               | const | thumbnail filenames in precedence order                         |
| _types_                         | —     | `Manifest`, `ResolvedCanvas`, `ReadableFs`, `WritableFs`, …     |

The five `pure` transforms above share one contract: `(manifest, …) -> manifest`,
never mutating the input, always preserving unknown top-level / per-document
fields and `ext`, and degrading to a no-op (never a throw) when the operation
can't apply. _Identity_ is `id` when present and non-empty, else `src` — the same
rule `resolve` uses, so `add` can refuse the duplicate `resolve` would warn about.

## Test

```sh
pnpm --filter dotcanvas test
pnpm --filter dotcanvas typecheck
```

Tests are the spec: each `resolve`/`serialize` rule is pinned by a test whose
name is the RFD rule verbatim.

## License

[MIT](https://github.com/gridaco/grida/blob/main/packages/dotcanvas/LICENSE) © [Grida](https://grida.co)
