# `format/`

This directory contains **canonical file formats and schemas** used across Grida.

## FlatBuffers

- **Schema**: `format/grida.fbs`
- **File identifier**: `"GRID"`
- **File extension**: `"grida"`
- **Docs**: [FlatBuffers documentation](https://flatbuffers.dev/)

### Validate / compile schema

```sh
# Compiles the schema to a binary schema file (.bfbs)
flatc --schema --binary -o /tmp/grida-fbs-check format/grida.fbs
ls -la /tmp/grida-fbs-check
```

### Generate bindings (ad-hoc)

```sh
# TypeScript
flatc --ts -o /tmp/grida-fbs-gen/ts format/grida.fbs

# Rust
flatc --rust -o /tmp/grida-fbs-gen/rust format/grida.fbs
```

> Note: In-repo generated code locations + automation scripts are intentionally
> not committed yet; we’ll add them once the schema stabilizes.
