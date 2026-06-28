# dotcanvas

## 0.2.0

The application axis and the marker filename are reshaped from 0.1.0 — all
**breaking** vs. 0.1.0 (the only previously published release), with no back-compat.
Spec, README, the published JSON Schema, and the test fixtures move together.
Reference page: [grida.co/dotcanvas](https://grida.co/dotcanvas).

### Breaking Changes (vs. 0.1.0)

- **The application axis is the field `editor`** — `"slides"` (linear deck) |
  `"board"` (freeform canvas) | `"unknown"` — a hint for which editor opens the
  bundle (à la Figma's `editorType`). It replaces 0.1.0's fused
  `type: "svg-slides"`: the editor (`editor`) and the content kind (`files`,
  below) are now separate axes, so any editor holds any content kind. `board` is
  the new freeform editor. Resolved type `EditorType`; warning code
  `unknown_editor`. No value aliases — an unrecognized `editor` resolves to
  `"unknown"` (with a warning).
- **`files` is the content axis** — the glob patterns whose root-basename matches
  are documents (`*` is the only wildcard). Missing → `["*.svg"]`; explicit `[]`
  derives nothing. `ResolvedCanvas.files` is always concrete. This is the seam
  that lets a future content kind join without a new `editor`.
- **The marker is `.canvas.json`** (was `canvas.json`) — hidden and JSON-typed
  (so editor tooling and `$schema` still apply), unmistakable from JSONCanvas's
  single-file `*.canvas`. `MANIFEST_FILENAME` is now `".canvas.json"`.
- Spec (`docs/wg/format/canvas.md`) §3 rewritten around the two axes; the
  "slides → general promotion" open question is resolved by `editor: "board"`.

## 0.1.0

First published release. `dotcanvas` is the reference reader/writer for the
**`.canvas`** format — a portable directory of standalone documents (V1: SVG
slides) plus a `canvas.json` manifest. Built, ESM-only, zero runtime
dependencies.

### Minor Changes

- **Publishable artifact.** Ships built `dist/` (`.js` + `.d.ts`) with an
  `exports` map and a `files` allowlist; zero runtime deps; ESM-only.
- **`ResolvedDocument.meta`** carries the source manifest entry (unknown
  per-document fields included), so a consumer renders per-document metadata
  from `resolved.documents` alone — no re-join against `resolved.manifest`.
- **`heal(manifest, rootEntries) → Manifest`** — the write-side twin of
  `resolve`: reconcile against disk into a writable manifest (drop missing
  `src`, append disk-only SVGs) while preserving every `id`/`layout`/unknown/
  `ext`. Canonical self-heal is `write(fs, heal(parsed, entries))`.
- **Generic `Manifest<TExt>` / `ResolvedCanvas<TExt>`** over the consumer's
  `ext` bag (default `Record<string, unknown>`, backward compatible; trusted,
  not validated).
- **`ManifestDocument.skip` + `setSkip()`** — a blessed per-document flag to
  skip a document in the linear slides view (it still exists and shows in the
  canvas view). Advisory: the reader round-trips it but never drops skipped
  documents. A human label/title is intentionally not modeled — that is the
  document content's job (an SVG slide's `<title>`).
- **Spec clarifications:** containment is the host's job (`resolve` is not a
  security boundary), `ReadableFs.list()` is recursive, and the
  `documents`-order-then-disk-append ordering is stable with no auto-renumber.
  Recommended slide filenames are 1-based (`001.svg`, `002.svg`, …).
