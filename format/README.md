# `format/`

This directory contains **canonical file formats and schemas** used across Grida.

## FlatBuffers

- **Schema**: `format/grida.fbs`
- **File identifier**: `"GRID"`
- **File extension**: `"grida"`
- **Docs**: [FlatBuffers documentation](https://flatbuffers.dev/)

### Install `flatc` locally (developer workflow)

Most developers will use an OS-installed `flatc`.

- macOS (Homebrew):

```sh
brew install flatbuffers
```

### Validate / compile schema

```sh
# Compiles the schema to a binary schema file (.bfbs)
flatc --schema --binary -o /tmp/grida-fbs-check format/grida.fbs
ls -la /tmp/grida-fbs-check
```

### Generate bindings (ad-hoc)

```sh
# TypeScript
flatc --ts --ts-no-import-ext -o /tmp/grida-fbs-gen/ts format/grida.fbs

# Rust
flatc --rust -o /tmp/grida-fbs-gen/rust format/grida.fbs
```

### Also available: `bin/activate-flatc` (CI/Vercel)

We do **not** commit generated FlatBuffers bindings. For CI and Vercel builds we
use the repo script `bin/activate-flatc`, which downloads and caches a **pinned**
`flatc` release binary (currently **v25.12.19**) and runs it.

```sh
# Compiles the schema to a binary schema file (.bfbs)
python3 bin/activate-flatc -- --schema --binary -o /tmp/grida-fbs-check format/grida.fbs

# TypeScript
python3 bin/activate-flatc -- --ts --ts-no-import-ext -o /tmp/grida-fbs-gen/ts format/grida.fbs

# Rust
python3 bin/activate-flatc -- --rust -o /tmp/grida-fbs-gen/rust format/grida.fbs
```

> In-repo generated code + automation:
>
> - **TypeScript**: `packages/grida-format/` — **committed**; regenerated on `pnpm build` via `prebuild`. Changes to generated TS files are expected in PRs that modify `grida.fbs`.
> - **Rust**: `crates/grida-canvas/src/io/generated/` — **committed**; regenerated on `pnpm build` via `prebuild`. Changes to generated Rust files are expected in PRs that modify `grida.fbs`.
>
> **Contributor workflow**: after editing `grida.fbs`, run `pnpm build` (or the individual `prebuild` scripts in each package) to regenerate bindings, then commit the updated generated files alongside your schema change.

## References

- [Adobe Photoshop File Format Specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/) — PSD/PSB structure, image resources, layer and mask info; useful when comparing or aligning design-tool format concepts.
- [Figma .fig (Kiwi) format](../.ref/figma/README.md) — In-repo: extracted Kiwi schema (`fig.kiwi`) and tooling for Figma’s binary `.fig` format; see `/.ref/figma/`.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
