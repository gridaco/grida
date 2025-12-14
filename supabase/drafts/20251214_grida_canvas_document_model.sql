/*
================================================================================
 Grida Canvas — Node Storage (STI single-table pattern)
--------------------------------------------------------------------------------
Why this exists
- We need a strict, evolvable, relational source of truth for very large
  documents (100k+ nodes) while keeping development solo-friendly.
- “Relational” joins across many small tables per node-type are costly to load.
- “NoSQL/JSON” makes migrations and long-term correctness hard.
- This file implements a pragmatic middle ground: a SINGLE “nodes” table (STI)
  with strongly-typed nullable columns for capabilities we understand today,
  plus a few shared side tables (fill_paints/stroke_paints/effects/links) for arrays.

Core idea (STI: Single Table Inheritance)
- All node kinds live in one table: grida_canvas.canvas_node
- Columns are grouped by capability (state, identity, blend, geometry…).
- Columns are nullable unless universally applicable.
- Type-specific validity is enforced by CHECK constraints (added in later
  migrations) and/or by application validators.
- Arrays/variable-length attributes (fill_paints, stroke_paints, effects, guides, etc.)
  live in separate “capability tables” keyed by (doc_id, node_id, ord).

Why STI over alternatives
- ✅ Fast open-path: a single narrow scan (clustered by doc_id) streams rows.
- ✅ Strict typing & easy migrations: ALTER TABLE ADD COLUMN (NULL default)
  is metadata-only in Postgres; we can evolve safely as the engine grows.
- ✅ Simple ergonomics: fewer joins, clear column names, predictable code-gen.
- ⚠️ Many NULLs are expected; that’s OK (NULLs are compact in Postgres).
- ⚠️ The table can grow wide; mitigate by:
  - Keeping the row “hot” (only immediately-needed scalars live here).
  - Moving bulky/rare fields (e.g. huge text/html/expressions) to side tables.
  - Using capability tables for lists (fill_paints/stroke_paints/effects).

CRDT identity model (high level)
- Runtime uses a compact packed u32 node id (actor:8 | counter:24).
- This draft stores the packed u32 as `node_id` (scoped by `doc_id`).
- If we later need actor reassignment (offline actor 0 → assigned actor),
  we may introduce a stable surrogate key; for now the packed id is the durable id.

How to load big docs efficiently (100k+ rows)
- SELECT only “hot” columns (avoid SELECT *) and stream with server-side cursors.
- Cluster/partition by doc_id for contiguous I/O.
- Fetch capability tables (fill_paints/stroke_paints/links) in parallel or lazily by viewport.
- Fetch capability tables (fill_paints/stroke_paints/links) in parallel or lazily by viewport.
- Optional: mirror the “first fill” on the node row for zero-join paint preview.

Schema evolution playbook
1) Add a new scalar prop?  -> ALTER TABLE ADD COLUMN … NULL; (fast)
2) Make it type-specific?  -> Add a CHECK that forbids it for other types.
3) New list-like prop?     -> New capability table (doc_id, node_id, ord, …).
4) Unsure if it’s hot?     -> Start in a side table; promote later if it becomes hot.
5) Renaming?               -> Add new column, backfill once, dual-write briefly,
                              remove old column in a later migration.
6) Deprecation?            -> Keep column NULL and stop writing; drop only when safe.

Naming & style guidelines
- snake_case, explicit, descriptive:  data_state_locked, data_blend_opacity, …
- Prefer consistent prefixes per capability (data_state_*, data_blend_*, …).
- Keep column names < ~60 chars (PG identifier limit is 63 bytes).
- Avoid reserved words; avoid quoted identifiers.
- Default values should match engine defaults to reduce payload size.

Constraints & validation (add in later migrations)
- CHECKs to guard type/capability: e.g., forbid text-only columns on non-text nodes.
- Range checks for normalized values (opacity 0..1, colors 0..255).
- `PRIMARY KEY (doc_id, node_id)` ensures uniqueness per document.
- If/when capability tables are introduced, they should FK to `canvas_node(doc_id, node_id)` with ON DELETE CASCADE.

Indexing suggestions
- Primary scan path: (doc_id) → sequential/bitmap scan is ideal when clustered.
- Partial indexes for hot filters (e.g., WHERE data_state_active).
- (doc_id, node_id) for client→DB translations.
- (doc_id, type) or small partials if you frequently address subsets.

Hierarchy & ordering
- Do NOT store “children arrays” in this table. Use a link table:
    link(doc_id, parent_node_id, child_node_id, ord)
  with a fractional ord key (e.g., “a”, “aM”, “b”) to avoid mass reindexing on
  reorder. Enforce acyclicity with a small trigger if needed.

Durable Objects (DO) / realtime server compatibility
- DO holds the authoritative in-memory doc state for realtime.
- DO loads from Postgres on cold start using the narrow select described above.
- DO periodically snapshots back to Postgres (or on commit points).
- Packed u32 node ids are used at the edge and in DB (scoped by doc_id).

When to split more tables
- Only for repeatables (fill_paints/stroke_paints/effects/guides/edges).
- Only for repeatables (fill_paints/stroke_paints/effects/guides/edges).
- Or when a capability family would add many rarely-used columns to this table.
- Keep the number of capability tables small (3–8), shared by all node types.

When NOT to split
- Scalar, frequently-read properties in the initial render path.
- Anything you need to filter/sort by routinely.

SQLite/edge portability (optional)
- If you also run SQLite at the edge: avoid PG-only types; store UUIDs as TEXT;
  keep JSON as TEXT with expression indexes; use the same logical shape.

FAQ
- “Is a 100k-row document load OK?”                     → Yes, if you stream a narrow
  projection and cluster by doc_id (expect tens of MBs at most).
- “Will hundreds of NULLs bloat storage?”               → Not significantly in PG; NULLs are
  bitmap-tracked. Keep wide TEXT/VARCHAR out of the hot row.
- “Why not JSONB?”                                      → Harder long-term migrations; weaker
  guarantees. We want strict evolution + predictable queries.
- “Can we enforce per-type columns strictly in DB?”     → Yes, with CHECKs; complement with
  application validators for friendlier errors.

--------------------------------------------------------------------------------
Everything below this header defines the initial columns for shared capabilities.
Add columns incrementally with small, focused migrations. Keep the hot row narrow,
arrays in capability tables, and validate aggressively.

*/



-- This is a draft schema file. It is expected to evolve.
-- The obvious parts here are aligned to the current Rust runtime model:
-- `crates/grida-canvas/src/node/schema.rs`

create schema if not exists grida_canvas;

-- Packed u32 (0..=4294967295) stored as BIGINT.
-- Semantically: a Grida object identifier (packed actor:8 | counter:24).
create domain grida_canvas.object_id as bigint
  check (value >= 0 and value <= 4294967295);

-- -----------------------------
-- enums (aligned to Rust `cg::types` serde rename strings)
-- -----------------------------

create type grida_canvas.canvas_node_type as enum (
  'initial_container',
  'container',
  'group',
  'rectangle',
  'ellipse',
  'polygon',
  'regular_polygon',
  'regular_star_polygon',
  'line',
  'text_span',
  'path',
  'vector',
  'boolean',
  'image',
  'error'
);

create type grida_canvas.boolean_path_operation as enum (
  'union',
  'intersection',
  'difference',
  'xor'
);

-- flattened mask type: geometry | alpha | luminance
create type grida_canvas.layer_mask_type as enum (
  'geometry',
  'alpha',
  'luminance'
);

-- flattened layer blend mode: pass-through | BlendMode
create type grida_canvas.layer_blend_mode as enum (
  'pass-through',
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
);

create type grida_canvas.position_basis as enum (
  'cartesian',
  'inset'
);

create type grida_canvas.axis as enum (
  'horizontal',
  'vertical'
);

create type grida_canvas.layout_mode as enum (
  'normal',
  'flex'
);

create type grida_canvas.layout_wrap as enum (
  'wrap',
  'nowrap'
);

create type grida_canvas.layout_positioning as enum (
  'auto',
  'absolute'
);

create type grida_canvas.main_axis_alignment as enum (
  'start',
  'end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
  'stretch'
);

create type grida_canvas.cross_axis_alignment as enum (
  'start',
  'end',
  'center',
  'stretch'
);

create type grida_canvas.text_align as enum (
  'left',
  'right',
  'center',
  'justify'
);

create type grida_canvas.text_align_vertical as enum (
  'top',
  'center',
  'bottom'
);

create type grida_canvas.affine2d as (
  a double precision,
  b double precision,
  c double precision,
  d double precision,
  e double precision,
  f double precision
);


-- [sti-pattern single table for design canvas document nodes]
create table grida_canvas.canvas_node (
    -- identity
    doc_id uuid not null,
    node_id grida_canvas.object_id not null,

    -- Node:: variant discriminator. Aligned to Rust schema.rs variants.
    -- (Do NOT treat this list as stable; extend as new variants are introduced.)
    node_type grida_canvas.canvas_node_type not null,

    -- common state
    active boolean not null default true,
    name text null,

    -- blend / mask
    opacity real not null default 1.0,
    blend_mode grida_canvas.layer_blend_mode not null default 'pass-through',
    mask_type grida_canvas.layer_mask_type null,

    -- transform (geometry-first baseline)
    transform grida_canvas.affine2d not null default row(1,0,0,1,0,0),

    -- layout: positioning basis (cartesian vs inset)
    layout_position_basis grida_canvas.position_basis not null default 'cartesian',
    layout_x real null,
    layout_y real null,
    layout_inset_left real null,
    layout_inset_right real null,
    layout_inset_top real null,
    layout_inset_bottom real null,
 
    -- layout: dimensions and constraints
    layout_width real null,
    layout_height real null,
    layout_min_width real null,
    layout_max_width real null,
    layout_min_height real null,
    layout_max_height real null,

    -- layout: container behavior
    layout_mode grida_canvas.layout_mode not null default 'normal',
    layout_direction grida_canvas.axis not null default 'horizontal',
    layout_wrap grida_canvas.layout_wrap null,
    layout_main_axis_alignment grida_canvas.main_axis_alignment null,
    layout_cross_axis_alignment grida_canvas.cross_axis_alignment null,
    layout_padding_left real null,
    layout_padding_right real null,
    layout_padding_top real null,
    layout_padding_bottom real null,
    layout_main_axis_gap real null,
    layout_cross_axis_gap real null,

    -- layout: child behavior
    layout_positioning grida_canvas.layout_positioning null,
    layout_grow real null,

    -- common shape metadata (node-specific applicability)
    rotation real null,
    rectangular_corner_radius_top_left real null,
    rectangular_corner_radius_top_right real null,
    rectangular_corner_radius_bottom_right real null,
    rectangular_corner_radius_bottom_left real null,
    corner_radius real null,
    corner_smoothing real null,

    -- rectangular stroke width (per-side). applicable to rectangular nodes (e.g. rectangle/container/image).
    rectangular_stroke_width_top real null,
    rectangular_stroke_width_right real null,
    rectangular_stroke_width_bottom real null,
    rectangular_stroke_width_left real null,

    -- paints / strokes / effects (complex nested types; stored as jsonb for now)
    -- canonical naming uses `*_paints` for paint stacks
    fill_paints jsonb null,
    stroke_paints jsonb null,
    stroke_style jsonb null,
    stroke_width jsonb null,
    stroke_width_profile jsonb null,
    effects jsonb null,

    -- container-only
    clip boolean null,

    -- boolean operation
    op grida_canvas.boolean_path_operation null,

    -- text span
    text text null,
    text_style jsonb null,
    text_align grida_canvas.text_align null,
    text_align_vertical grida_canvas.text_align_vertical null,
    text_max_lines integer null,
    text_ellipsis text null,

    -- vector
    vector_network jsonb null,

    -- polygon points (absolute points, svg <polygon>-like)
    shape_polygon_points jsonb null,

    -- regular polygon/star
    shape_point_count integer null,
    shape_inner_radius real null,

    -- ellipse arc/ring
    start_angle real null,
    angle real null,

    -- image
    image_resource jsonb null,
    image_paint jsonb null,

    -- error node
    error text null,

    -- [deprecated or under review:]
    -- path
    -- path_data text null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    primary key (doc_id, node_id),

    -- basic validation (keep light; deeper validation is app-side for now)
    check (opacity >= 0.0 and opacity <= 1.0)
);

-- hierarchy link table (ordered children list per parent)
create table grida_canvas.canvas_node_link (
    doc_id uuid not null,
    parent_node_id grida_canvas.object_id not null,
    child_node_id grida_canvas.object_id not null,
    ord text not null,

    primary key (doc_id, parent_node_id, ord),
    unique (doc_id, parent_node_id, child_node_id),

    foreign key (doc_id, parent_node_id)
      references grida_canvas.canvas_node (doc_id, node_id)
      on delete cascade,

    foreign key (doc_id, child_node_id)
      references grida_canvas.canvas_node (doc_id, node_id)
      on delete cascade,

    check (ord <> '')
);

create index canvas_node_by_doc on grida_canvas.canvas_node (doc_id);
create index canvas_node_by_doc_type on grida_canvas.canvas_node (doc_id, node_type);
create index canvas_node_link_by_child on grida_canvas.canvas_node_link (doc_id, child_node_id);

/*
Shape parity checklist (draft; “obvious” alignment only):

- Node::InitialContainer -> node_type='initial_container' + layout_* container fields as needed
- Node::Container        -> node_type='container' + clip + layout_* + fill_paints/stroke_paints/effects
- Node::Group            -> node_type='group' + opacity/blend/mask + transform
- Node::Rectangle        -> node_type='rectangle' + transform + layout_width/layout_height + rectangular_corner_radius_* + fill_paints/stroke_paints/effects
- Node::Ellipse          -> node_type='ellipse' + transform + layout_width/layout_height + start_angle/angle/shape_inner_radius + fill_paints/stroke_paints/effects
- Node::Polygon          -> node_type='polygon' + transform + shape_polygon_points + fill_paints/stroke_paints/effects
- Node::RegularPolygon   -> node_type='regular_polygon' + transform + layout_width/layout_height + shape_point_count + corner_radius + fill_paints/stroke_paints/effects
- Node::RegularStarPolygon -> node_type='regular_star_polygon' + transform + layout_width/layout_height + shape_point_count + shape_inner_radius + corner_radius + fill_paints/stroke_paints/effects
- Node::Line             -> node_type='line' + transform + layout_width + stroke_paints (+ stroke_style in jsonb for dash/cap)
- Node::TextSpan         -> node_type='text_span' + transform + layout_width/layout_height + text/max_lines/ellipsis + fill_paints/stroke_paints/effects
- Node::Path             -> node_type='path' + transform + path_data + fill_paints/stroke_paints/effects
- Node::Vector           -> node_type='vector' + transform + vector_network + stroke_width_profile + fill_paints/stroke_paints/effects
- Node::BooleanOperation -> node_type='boolean' + op + fill_paints/stroke_paints/effects (+ transform optional in Rust; stored here anyway)
- Node::Image            -> node_type='image' + transform + layout_width/layout_height + image_resource/image_paint + rectangular_corner_radius_* + stroke_paints/effects
- Node::Error            -> node_type='error' + transform + layout_width/layout_height + error

TODO (intentionally unresolved in draft):
- normalize paints/effects/stroke_paints into capability tables when hot paths are clear
- stricter per-node CHECK constraints (type-specific field guards)
- CRDT actor/counter materialization and migration strategy
*/