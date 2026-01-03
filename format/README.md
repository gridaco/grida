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

> Note: In-repo generated code locations + automation scripts are intentionally
> not committed yet; we’ll add them once the schema stabilizes.
