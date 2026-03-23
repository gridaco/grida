---
name: io-grida
description: >
  Guides work on the Grida file format (.grida), the I/O packages that read/write it,
  and the Rust decoder that loads it into the canvas runtime.
  Use when working with .grida files, the FlatBuffers schema, file loading/saving,
  archive packing, clipboard encode/decode, or debugging format round-trip issues.
---

# Grida I/O — `.grida` Format & Loading

## Format Overview

Grida uses **FlatBuffers** as the canonical binary format. File identifier: `"GRID"`.

Three on-disk variants:

| Variant         | Detection              | Notes                                          |
| --------------- | ---------------------- | ---------------------------------------------- |
| Raw FlatBuffers | `"GRID"` at bytes 4–7  | Bare document, no images                       |
| ZIP archive     | ZIP magic bytes        | `manifest.json` + `document.grida` + `images/` |
| Legacy JSON     | Starts with `{` or `[` | Deprecated, still decoded                      |

**Document model**: Flat node repository (not nested). Nodes reference parents via ID + fractional-index position strings. Multi-scene: each Figma page → a `SceneNode`.

## Key Locations

| Path                                            | Role                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `format/grida.fbs`                              | **Source of truth** — FlatBuffers schema                    |
| `format/AGENTS.md`                              | Schema evolution rules (append-only, never reuse field IDs) |
| `packages/grida-canvas-schema/grida.ts`         | TS runtime types (`grida` namespace)                        |
| `packages/grida-canvas-io/`                     | TS file loading, archive pack/unpack, clipboard protocol    |
| `crates/grida-canvas/src/io/`                   | Rust decoder (FBS/ZIP/JSON → `Scene`)                       |
| `crates/grida-canvas/src/io/generated/grida.rs` | Auto-generated Rust FlatBuffers bindings                    |
| `crates/grida-canvas/src/node/schema.rs`        | Rust runtime node schema (aligned with TS)                  |

## TS Side — `packages/grida-canvas-io/`

- **`io.load(file)`** — auto-detects format, decodes, extracts images → `LoadedDocument`
- **`io.is_grid(bytes)`** — checks `"GRID"` identifier
- **`io.archive.pack/unpack`** — ZIP with `manifest.json`
- **`io.clipboard.encode/decode`** — Grida clipboard protocol

## Rust Side — `crates/grida-canvas/src/io/`

| File               | Role                                                           |
| ------------------ | -------------------------------------------------------------- |
| `io_grida_file.rs` | Format detection + unified `decode_all(&bytes)` → `Vec<Scene>` |
| `io_grida_fbs.rs`  | FlatBuffers → Rust runtime (`GridaFile` → `Scene`)             |
| `io_grida.rs`      | Legacy JSON decoder                                            |

## Code Generation

Schema → generated code (both committed):

```sh
# TS (runs during pnpm build of @grida/format)
python3 bin/activate-flatc -- --ts --ts-no-import-ext -o <out> format/grida.fbs

# Rust
python3 bin/activate-flatc -- --rust -o <out> format/grida.fbs
```

Uses pinned `flatc` v25.12.19 via `bin/activate-flatc`.

## Verification

```sh
# Rust round-trip
cargo test -p cg --test fbs_roundtrip

# TS I/O tests
pnpm turbo test --filter='@grida/io'

# Full typecheck
pnpm turbo typecheck --filter='@grida/io' --filter='@grida/canvas-schema'
```

## Schema Changes

### Evolution (non-breaking, default)

- Add new **optional** fields only; never change or reuse field IDs
- Prefer `table` over `struct` (structs are immutable once defined)
- Append-only enums; new union variants at the end only
- PATCH bump only (e.g. `0.91.0` → `0.91.1`)
- Round-trip tests required

### Breaking changes

When you need to invalidate old files (field renumbering, semantic changes, removed fields):

1. **Bump MINOR** (while MAJOR=0) in both places:
   - TS: `grida.program.document.SCHEMA_VERSION` in `packages/grida-canvas-schema/grida.ts`
   - Rust: `SCHEMA_VERSION` in `crates/grida-canvas/src/io/io_grida_fbs.rs`
2. Keep them **exactly in sync** — both writers must emit the same version string.
3. Old files will be **rejected** by the TS reader (`format.ts` calls `isSchemaCompatible()` and throws on mismatch).

**Version compatibility logic** (`isSchemaCompatible` in `grida-canvas-schema/grida.ts`):

- While MAJOR=0: same `MAJOR.MINOR` required (e.g. `0.91.*` accepts `0.91.*`, rejects `0.90.*`)
- Once MAJOR≥1: same MAJOR required (standard semver)

Format: `MAJOR.MINOR.PATCH-prerelease+build` (e.g. `"0.91.0-beta+20260311"`).

See `format/AGENTS.md` for the full review checklist.
