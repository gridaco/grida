---
name: io-grida
description: >
  Guides work on the Grida file format (.grida) from the TS side: the I/O
  packages that read/write it (loading, archive packing, clipboard) and the
  frozen schema bindings. Use when working with .grida files in the editor or
  packages, or debugging format round-trip issues. (The schema and the Rust
  decoder live in the engine repo.)
---

# Grida I/O — `.grida` Format & Loading (TS side)

## Format Overview

Grida uses **FlatBuffers** as the canonical binary format. File identifier: `"GRID"`.

Two on-disk variants:

| Variant         | Detection             | Notes                                          |
| --------------- | --------------------- | ---------------------------------------------- |
| Raw FlatBuffers | `"GRID"` at bytes 4–7 | Bare document, no images                       |
| ZIP archive     | ZIP magic bytes       | `manifest.json` + `document.grida` + `images/` |

**Document model**: Flat node repository (not nested). Nodes reference parents via ID + fractional-index position strings. Multi-scene: each Figma page → a `SceneNode`.

## Key Locations

| Path                                    | Role                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| `packages/grida-canvas-schema/grida.ts` | TS runtime types (`grida` namespace) + `SCHEMA_VERSION`  |
| `packages/grida-canvas-io/`             | TS file loading, archive pack/unpack, clipboard protocol |
| `packages/grida-format/src/`            | **FROZEN** flatc TS bindings (tombstone — see below)     |

The **schema source of truth and the Rust decoder** live in the engine repo:
[`format/grida.fbs`](https://github.com/gridaco/nothing/blob/main/format/grida.fbs) ·
[`crates/grida/src/io/`](https://github.com/gridaco/nothing/tree/main/crates/grida/src/io).

## TS Side — `packages/grida-canvas-io/`

- **`io.load(file)`** — auto-detects format, decodes, extracts images → `LoadedDocument`
- **`io.is_grid(bytes)`** — checks `"GRID"` identifier
- **`io.archive.pack/unpack`** — ZIP with `manifest.json`
- **`io.clipboard.encode/decode`** — Grida clipboard protocol

## The tombstone — `packages/grida-format`

The generated TS FlatBuffers bindings are **committed and frozen**: the flatc
generator wiring was deleted at the engine split (this repo has no
`format/grida.fbs` and no `bin/activate-flatc`). The bindings are
byte-identical to pinned flatc v25.12.19 output and the formatter/linter
ignore them to keep it that way. **Do not edit them.** If the schema evolves
in the engine repo and this reader should follow, re-snapshot deliberately
from a gridaco/nothing checkout.

## Verification

```sh
pnpm turbo test --filter='@grida/io'
pnpm turbo typecheck --filter='@grida/io' --filter='@grida/canvas-schema'
```

## Schema Changes

Schema evolution happens **in the engine repo** (see its io-grida skill and
[`format/AGENTS.md`](https://github.com/gridaco/nothing/blob/main/format/AGENTS.md)).
What this repo owes on a breaking change — **a cross-REPO lockstep**:

1. TS: bump `grida.program.document.SCHEMA_VERSION` in
   `packages/grida-canvas-schema/grida.ts` to match the engine's
   `SCHEMA_VERSION` in
   [`crates/grida/src/io/io_grida_fbs.rs`](https://github.com/gridaco/nothing/blob/main/crates/grida/src/io/io_grida_fbs.rs)
   — **exactly in sync**; both writers must emit the same version string.
2. Re-snapshot the frozen bindings from the new schema (deliberate act, see above).
3. Old files are **rejected** by the TS reader (`format.ts` calls
   `isSchemaCompatible()` and throws on mismatch).

**Version compatibility logic** (`isSchemaCompatible` in `grida-canvas-schema/grida.ts`):

- While MAJOR=0: same `MAJOR.MINOR` required (e.g. `0.91.*` accepts `0.91.*`, rejects `0.90.*`)
- Once MAJOR≥1: same MAJOR required (standard semver)

Format: `MAJOR.MINOR.PATCH-prerelease+build` (e.g. `"0.91.0-beta+20260311"`).

Note: the TS FlatBuffers decoder is more lenient than the Rust verifier — a
TS-side round-trip may pass on structurally invalid bytes. For byte-level
verification, use the engine repo's Rust verifier.
