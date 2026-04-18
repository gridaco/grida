# Node Properties Catalog

Companion reference to [`properties.toml`](./properties.toml).

`properties.toml` is the canonical, hand-authored catalog of every per-node
property in the Grida Canvas data model. It is **runtime-agnostic**: it
describes _what_ properties a node has, their logical type, nullability, and
how each one maps to the on-disk FlatBuffers schema in [`grida.fbs`](./grida.fbs).
It does not prescribe any particular runtime representation, column store, or
CRDT strategy — those choices are left to consumers.

## Purpose

The catalog serves three roles:

1. **Single auditable enumeration** of every property a node can hold.
2. **Stable numeric column ids** that may later drive codegen, delta formats,
   diffing, and wire protocols.
3. **Completeness check** against the persistency schema (`grida.fbs`).

The catalog is authored by hand. It is **not yet wired into codegen**; today
it is a reference contract that runtimes and codecs can conform to.

## File layout

- [`format/properties.toml`](./properties.toml) — the catalog (authoritative).
- [`format/grida.fbs`](./grida.fbs) — the FlatBuffers persistency schema.

Top-level TOML fields:

| Field            | Type     | Description                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| `schema_version` | `int`    | Catalog revision. Bump on any compatibility-affecting change. |
| `description`    | `string` | One-line description of the catalog.                          |
| `column`         | `[[…]]`  | Array of column entries (see below).                          |

## Column schema

Each `[[column]]` entry has the following fields:

| Field              | Required | Description                                                                                                                   |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`               | yes      | Stable numeric id (see [Id stability](#id-stability)).                                                                        |
| `name`             | yes      | Column name in snake_case. Names MAY be renamed; `id` is the stable reference.                                                |
| `type`             | yes      | Logical type (see [Type vocabulary](#type-vocabulary)).                                                                       |
| `nullable`         | yes      | `true` if the column can represent "unset / inherit / not constrained".                                                       |
| `applies_to`       | yes      | Array of node-variant names, or `["*"]` (see [Applies-to vocabulary](#applies-to-vocabulary)).                                |
| `fbs_path`         | yes      | Dotted path into `grida.fbs` where the property is persisted. `"none"` = runtime-only, no FBS counterpart.                    |
| `default_semantic` | yes      | `"safe"` if the zero bit pattern is a correct default; `"unsafe"` if zero has a distinct meaning (see [Defaults](#defaults)). |
| `init_value`       | no       | Required when `default_semantic = "unsafe"`. Literal value consumers should write on node creation.                           |
| `object_shape`     | no       | Required when `type = "object"`. TypeScript-ish shape string for readers.                                                     |
| `retired`          | no       | `true` if the column has been retired. A retired id MUST NOT be recycled.                                                     |
| `notes`            | no       | Free-form prose explaining quirks, discrepancies, or cross-references.                                                        |

## Id stability

The numeric `id` on every `[[column]]` is a **stable, append-only identifier**
and is the primary reference downstream (codegen, binary layout, migration).

### Contract

1. **Ids are unique and append-only.** Never reuse an id. A retired column
   remains in the file with `retired = true` and its id is tombstoned.
2. **`type` is immutable.** Once assigned, a column's type does not change.
   Semantic changes MUST allocate a new id and retire the old one.
3. **Names may be renamed** without an id change as long as the column's
   semantic meaning and wire shape are unchanged.
4. **Additions go at the end** of their topical range. If a range is
   exhausted, open a new range at the next available global id rather than
   packing into an adjacent range.
5. **Readers** that encounter an unknown id MUST treat it as an
   unknown/forward-compatible value and not fail.
6. **FBS `(id: N)` field numbers are local to each FBS table** and are NOT
   expected to equal catalog ids. `fbs_path` is the authoritative link back
   to FBS.
7. **Consumers** (encoders, decoders, delta codecs, WASM bindings, diff
   tooling) MUST key their column tables by catalog id, not by name.

### Topical range allocation

Ids are assigned in topical ranges with deliberate gaps so new columns in a
family can land next to their siblings without disturbing existing ids.

| Range     | Topic                                                           |
| --------- | --------------------------------------------------------------- |
| `1–5`     | Identity (node_type, id, name, active, locked)                  |
| `10–12`   | Hierarchy (parent, sort_key, deleted)                           |
| `20–22`   | Layer common (opacity, blend_mode, mask_kind)                   |
| `30–37`   | Transform (6 matrix components + origin x/y)                    |
| `40–50`   | Layout positioning basis + cartesian/inset values               |
| `60–65`   | Layout dimensions (target w/h + aspect ratio)                   |
| `70–80`   | Layout container style (flex, padding, gap)                     |
| `90–91`   | Layout child style (positioning, grow)                          |
| `100–106` | Shape descriptor (basic-shape union + parameters)               |
| `120–128` | Corner radius (8 per-corner components + smoothing)             |
| `140–141` | Paint stacks (fill, stroke)                                     |
| `150–162` | Stroke style + per-side widths + dash + width profile + markers |
| `170`     | Container clip flag                                             |
| `175`     | Boolean op                                                      |
| `180–186` | Scene (bg rgba, constraints, guides, edges)                     |
| `200–230` | Text (alignment, decoration, font, dimensions, lists, runs)     |
| `250–257` | Effects — layer blur                                            |
| `270–272` | Effects — backdrop blur                                         |
| `280–286` | Effects — glass                                                 |
| `290–291` | Effects — variable-length (shadows, noises)                     |
| `300–302` | Vector / path / fill_rule                                       |
| `320`     | Markdown                                                        |

## Type vocabulary

Types describe the logical shape of a column's value, not a specific storage
class. Consumers map these to whatever backing representation they prefer.

| Type             | Meaning                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `f32`            | 32-bit float scalar.                                                                                                           |
| `bool`           | Boolean.                                                                                                                       |
| `u8`             | Unsigned 8-bit integer. Commonly used for enum tags.                                                                           |
| `i32`            | Signed 32-bit integer.                                                                                                         |
| `string`         | UTF-8 string.                                                                                                                  |
| `list<f32>`      | Variable-length list of `f32`.                                                                                                 |
| `paint_stack`    | Variable-length list of paint references into a document-level paint pool. Individual paint variant payloads live in the pool. |
| `vector_network` | Opaque vector-network blob (mirrors the FBS `VectorNetworkData` table).                                                        |
| `object`         | Variable-length or composite value that doesn't fit a scalar type. `object_shape` describes the shape for readers.             |

Nullability is carried on each column as a separate `nullable` flag, not
baked into the type name.

## Applies-to vocabulary

Node-variant names follow the `Node` union in `grida.fbs`, in snake_case:

```
scene, group, tray, initial_container, container, boolean_operation,
basic_shape, line, vector, path, text_span, attributed_text,
markdown_embed, unknown
```

`basic_shape` covers the Rectangle / Ellipse / Polygon / RegularPolygon /
RegularStarPolygon / Path shape kinds, which all serialize to `BasicShapeNode`
with a `CanonicalLayerShape` union discriminator (`shape_kind`, id 100).

`["*"]` means: all nodes — universally applicable via `SystemNodeTrait`.

## FBS mapping

Every non-runtime-only column carries an `fbs_path` pointing into
`grida.fbs`. The path is dotted, starts at the type that owns the field, and
ends at the scalar being persisted.

Examples:

- `SystemNodeTrait.id` → `NodeIdentifier.id` (wrapper flattened).
- `LayerTrait.parent.position` → `ParentReference.position` (shared with
  `SceneNode.position` because `SceneNode` does not embed `LayerTrait`).
- `LayerEffects.fe_shadows` → a single `paint_stack`-style list column, not
  one column per shadow sub-field.

### Coverage

Every persisted field reachable from the `Node` union in `grida.fbs` —
through `SystemNodeTrait`, `LayerTrait`, `LayoutStyle`, `TextStyleRec`,
`StrokeStyle`, and the per-variant tables — has a catalog entry, with two
deliberate exceptions:

- **`BasicShapeNode.type: BasicShapeNodeType`** — legacy, marked
  `// TODO: remove this` in the schema. Superseded by `shape_kind` (id 100).
  Writers must keep the two consistent until the field is dropped.
- **`BasicShapeNode.corner_radius: float`** — legacy uniform scalar.
  Superseded by `rectangular_corner_radius` (ids 120–127). Encoders fan out
  `corner_radius_tl_x` (or the uniform value) into this legacy scalar if
  still written.

Composite and pool-like fields are represented as a single column at the
node-level attach point rather than one column per element field:

- `PaintStackItem`s live in the document-level paint pool referenced from
  `fill_paints` (id 140) and `stroke_paints` (id 141).
- `VectorNetworkData` is stored as an opaque blob (id 300). Per-region
  `fill_paints` / `fill_rule` live inside the blob and are not separate
  node columns.
- `Guide2D`, `Edge2D`, `StyledTextRunItem`, `FontFeature`, `FontVariation`,
  `VariableWidthStop`, `FilterShadowEffect`, `FeNoiseEffect` and similar
  element shapes appear only through their parent list column (ids 185, 186,
  230, 228, 229, 160, 290, 291).

Document-level plumbing (`CanvasDocument`, `GridaFile`, `NodeSlot`,
`ResourceRef*`) is deliberately out of scope — the catalog describes
per-node state, not document containers.

## Nullability and defaults

### Nullability

A column is `nullable = true` when the logical model needs to distinguish
"set to value X" from "unset / inherit / auto". Nullability decisions are
made by the logical model, not by FBS. When FBS and the catalog disagree
(e.g. FBS declares `required` but the catalog exposes the column as
nullable), the disagreement is logged in [Known asymmetries](#known-asymmetries)
and the consumer is responsible for reconciling on serialize.

### Defaults

`default_semantic` distinguishes two cases:

- **`safe`** — the zero bit pattern is a correct logical default. Consumers
  may leave a cell uninitialized without observable differences from an
  explicit default write.
- **`unsafe`** — the zero bit pattern has a distinct logical meaning that is
  NOT the desired default (e.g. `stroke_miter_limit = 0` is a legal miter
  clamp, not "no limit"). Consumers MUST track presence explicitly (via
  nullability, a presence bit, or an eager write on node creation) and use
  the `init_value` specified on the column.

## Non-FBS entries

A small number of catalog entries exist for runtime needs that have no
on-disk FBS counterpart. They are included in the catalog for id stability
so consumers have a stable place to key runtime-only state.

| Id  | Column    | Role                                                                                                      |
| --- | --------- | --------------------------------------------------------------------------------------------------------- |
| 12  | `deleted` | Soft-delete tombstone. Persistence consumers may filter these out; runtime/delta consumers preserve them. |

Non-FBS entries have `fbs_path = "none"`.

## Known asymmetries

Items recorded so future changes can resolve them intentionally. None are
blocking for the catalog's completeness.

### 1. `text_decoration_thickness` default drift

FBS `TextStyleRec.text_decoration.text_decoration_thickness` has a non-null
default of `1.0`. The catalog models the column as nullable, where `null`
encodes "auto / inherit". After a round-trip through a non-nullable FBS
encoder, an explicit `1.0` is indistinguishable from auto.

Possible resolutions:

- Change FBS to make the field nullable.
- Make the catalog column non-nullable and pick a sentinel for auto.
- Define "auto" as an explicit kind enum, like letter/word/line spacing.

### 2. `text_font_family` nullability drift

FBS marks `TextStyleRec.font_family` as `required`. The catalog models it as
nullable with `null = inherit`, so that styled runs can say "inherit from
parent span". Consumers serializing to FBS must materialize a concrete
family on write — either a configured fallback or via a text-style resolver.

### 3. `text_font_weight` type fit

`FontWeight.value: uint` ranges up to ~1000. The catalog exposes the
property as nullable (null = inherit). The current type vocabulary has no
"nullable i32" primitive, so the column is captured with `type = "object"`,
`object_shape = "number | null"`. If a nullable integer primitive is added,
the catalog type may switch (keeping the same id).

### 4. Uniform vs rectangular corner radius fan-out

FBS has two representations:

- `CornerRadiusTrait` with a single `CGRadius` (used by
  `BooleanOperationNode` and `VectorNode`).
- `RectangularCornerRadiusTrait` with 4 per-corner `CGRadius` (used by
  `ContainerNode`, `TrayNode`, `BasicShapeNode`, `MarkdownEmbedNode`).

The catalog flattens both to 8 columns (ids 120–127). For uniform-radius
nodes, consumers fan out the same `rx/ry` into all 4 corners on read and
collapse back on write. This keeps the column layout uniform and avoids
node-kind-dependent columns.

### 5. Legacy FBS fields not projected to catalog

`BasicShapeNode.type` and `BasicShapeNode.corner_radius: float` are legacy
fields marked for removal. Writers must keep them consistent with
`shape_kind` / `rectangular_corner_radius` until the fields are dropped from
the schema; readers should prefer the shape union / rectangular radius over
these legacy scalars. When the fields are deleted from FBS, no catalog
action is needed — the catalog never had entries for them.

### 6. `text_styled_runs` concurrency

The column is stored as a whole-array value (`object`, list of
`StyledTextRunEntry`). Under simple last-writer-wins semantics, concurrent
attributed-text edits will lose intermediate edits. A future sequence / rope
CRDT may require splitting the column; the catalog id (230) remains stable
either way.

### 7. `vector_network` concurrency

The column is `vector_network` (nullable whole-blob). Concurrent
vector-network editing needs its own resolution strategy (whole-blob LWW,
per-vertex SoA, or sub-document CRDT). This is a downstream codec / merge
policy problem, not a catalog problem.

### 8. `FeProgressiveBlur.radius2`

FBS declares a second radius for progressive blur. The catalog has a
dedicated column (`fe_blur_progressive_radius2`, id 257) so codecs have a
place to write it without requiring a later id gap.

### 9. Backdrop-blur progressive variant

The FBS `LayerEffects.fe_backdrop_blur.blur` union accepts both
`FeGaussianBlur` and `FeProgressiveBlur`, but the catalog surfaces only
`fe_backdrop_blur_{active, kind, radius}` — no progressive start/end columns
for backdrop blur. If progressive backdrop blur needs to be persisted,
additional ids will be appended in the `270–279` range.

## Contributing

When adding or modifying catalog entries:

1. **Add, don't mutate.** Prefer appending new columns over changing
   existing ones. Changing a column's `type` or semantic meaning requires
   retiring the old id (`retired = true`) and assigning a new id.
2. **Pick the next id in the appropriate range.** If the range is
   exhausted, open a new range at the next available global id (see
   [Topical range allocation](#topical-range-allocation)).
3. **Write `fbs_path` first.** Every persistable column must point to a
   real path in `grida.fbs`. If the column has no FBS counterpart, set
   `fbs_path = "none"` and document the runtime role.
4. **Justify nullability.** If `nullable = true`, the `notes` field should
   explain what `null` means (inherit, auto, unset, …).
5. **Call out disagreements with FBS.** When the catalog's `type` or
   `nullable` differs from the FBS field (e.g. a `required` FBS field
   modeled as nullable in the catalog), add an entry under
   [Known asymmetries](#known-asymmetries) and cross-reference it from
   `notes`.
6. **Keep `schema_version` honest.** Bump it when a change affects how
   consumers read the catalog (new mandatory field on `[[column]]`, new
   type, new range semantics). Appending new columns does not require a
   bump.

Entries are free-form TOML and intentionally human-readable. Codegen may
eventually consume this file; until then it is a contract that Rust + TS +
WASM consumers converge against.
