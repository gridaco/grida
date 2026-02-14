# `format` agent guide

This file is **for LLM agents** working in `./format`.

You are editing Grida’s **canonical on-disk contract** (the `.grida` file format). Treat changes here like public API changes: they ripple into Rust + TypeScript codecs, and (eventually) into real user files.

## What lives here

- **Schema**: `format/grida.fbs` (FlatBuffers)
- **Tooling notes**: `format/README.md` (how to validate/compile with `flatc`, including pinned `flatc` via `bin/activate-flatc`)

## Where the schema is consumed (update these together)

The `grida.fbs` header calls out the main alignment targets:

- **Rust runtime model**: `crates/grida-canvas/src/node/schema.rs`
- **TS document model**: `packages/grida-canvas-schema/grida.ts`

If you change the schema shape, **assume you must update both** the Rust and TS sides (and any serializers/deserializers that map between runtime models and FlatBuffers).

## Pick a strategy: Evolution vs Breaking (default: Evolution)

FlatBuffers strongly encourages **schema evolution** (additive change). That should be your default.

### Evolution (preferred)

Pick **Evolution** when you can ship the new capability by **adding** new fields/tables/variants while keeping old files readable.

- **Goal**: New writers can emit more data; older readers can ignore what they don’t understand; newer readers can read both old and new files.
- **Typical moves**: add optional table fields, add new union variants, add new enum variants (append-only).

### Breaking (exceptional, but allowed early on)

Because the project is still early, there are rare cases where a **breaking cleanup** is worth it (e.g. a clearly wrong early modeling choice that would permanently complicate the ecosystem).

Pick **Breaking** only when:

- the user explicitly asks for it, **or**
- you can make a strong case that the cleanup is worth losing compatibility, and you surface that trade-off and proceed intentionally.

If you do break compatibility, you must also update readers/writers so behavior is explicit: either **migrate**, or **fail fast with a clear error** (do not silently misinterpret old data).

If the user didn’t request a breaking change, **stick with Evolution by default**. Only choose Breaking after you explicitly raise it as an option and get clear buy-in.

## FlatBuffers constraints (read before editing)

Before touching `grida.fbs`, read the block:

- `CAUTION — FlatBuffers semantics & schema design rules (READ BEFORE EDITING)`

The short version you must internalize:

- **Scalars/enums/bools are always readable**: you can’t distinguish “unset” from “default”. If “unset / auto / inherited” matters, model it explicitly (nullable table, union, or explicit mode + payload).
- **Prefer `table` over `struct`**: structs are permanent and cannot evolve. Only use a struct when the all-zeros value is the correct semantic default forever.
- **Choose evolvability over compactness**: explicit intent beats clever sentinel values.

## Evolution rules of thumb (how to change `grida.fbs` safely)

- **Add, don’t mutate**: prefer additive changes over changing/removing existing fields.
- **Never change or reuse field ids**: this schema uses explicit `(id: N)`; treat ids as immutable. If you “remove” a field, leave the id unused.
- **Be careful with `required`**:
  - Adding a new `required` field is a breaking change for existing files (older writers won’t have it).
  - Use `required` only when you truly intend to invalidate older files (or you’re doing a Breaking change).
- **Enums must be append-only**: never reorder/renumber existing variants. Append new variants (or assign explicit values and keep existing values stable).
- **Unions must be forward-tolerant**:
  - Add new union members at the end.
  - Keep a fallback (`Unknown…`) path and ensure decoders can **skip** unknown variants rather than hard-failing.
- **Do not “fix” old defaults in-place**: changing defaults for existing scalar fields changes how old files decode. If semantics change, add a new field and migrate at the codec layer.

## Versioning & compatibility hook (`schema_version`)

`CanvasDocument.schema_version` exists to make compatibility behavior explicit.

- When writer behavior changes in a meaningful way (especially for Breaking changes), **bump the version your writer emits**.
- Keep it in sync with TS `grida.program.document.SCHEMA_VERSION` (called out in the schema comment).
- Readers should use `schema_version` to decide whether to:
  - accept and decode normally,
  - accept with best-effort degradation,
  - migrate, or
  - reject with a clear error.

## Review checklist (before you consider the work “done”)

- **Strategy**: you can state whether this is **Evolution** or **Breaking**, and why.
- **Ripple updates**: Rust + TS models/codecs are updated consistently with the schema.
- **Compatibility**:
  - Evolution: older files still load, unknown data is ignored safely.
  - Breaking: old files either migrate or fail loudly (no silent misreads).
- **Schema validity**: `grida.fbs` compiles with `flatc` (see `format/README.md` for the repo’s preferred workflow).
- **No generated artifacts**: do not commit generated FlatBuffers bindings; this repo intentionally keeps generation ad-hoc/CI-driven for now (see `format/README.md`).
