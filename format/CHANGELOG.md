# `format/grida.fbs` Changelog

## `0.91.0-beta+20260311` ⚠️ Breaking

- **`NodeSlot` wrapper table added**: `flatc --rust` does not support `[Node]`
  (vector of unions) directly. The canonical workaround is wrapping each union
  entry in a table — identical in spirit to `PaintStackItem` wrapping `Paint`.
  See: <https://github.com/google/flatbuffers/issues/8011>
- **`CanvasDocument.nodes`** field type changed: `[Node]` → `[NodeSlot]`.
- **`CanvasDocument` field IDs reindexed**: `nodes` → `id:1`, `scenes` → `id:2`
  (previously `id:2` / `id:3`). Any document serialized with `0.90.x` is **not
  readable** by a `0.91.x` decoder without migration.
- **Rust decoder added**: `crates/grida-canvas/src/io/io_grida_fbs.rs` decodes
  raw `.grida` FlatBuffers binaries into the internal `Scene` representation.

## `0.90.0-beta+20260108`

- Initial stable FlatBuffers schema. Replaced the legacy JSON/ZIP `.grida` format.
- File identifier `"GRID"`, extension `"grida"`.
- Production format: ZIP archive containing a FlatBuffers binary.
