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
  plus a few shared side tables (fills/strokes/effects/links) for arrays.

Core idea (STI: Single Table Inheritance)
- All node kinds live in one table: grida_canvas.canvas_node
- Columns are grouped by capability (state, identity, blend, geometry…).
- Columns are nullable unless universally applicable.
- Type-specific validity is enforced by CHECK constraints (added in later
  migrations) and/or by application validators.
- Arrays/variable-length attributes (fills, strokes, effects, guides, etc.)
  live in separate “capability tables” keyed by (doc_id, node_row_id, ord).

Why STI over alternatives
- ✅ Fast open-path: a single narrow scan (clustered by doc_id) streams rows.
- ✅ Strict typing & easy migrations: ALTER TABLE ADD COLUMN (NULL default)
  is metadata-only in Postgres; we can evolve safely as the engine grows.
- ✅ Simple ergonomics: fewer joins, clear column names, predictable code-gen.
- ⚠️ Many NULLs are expected; that’s OK (NULLs are compact in Postgres).
- ⚠️ The table can grow wide; mitigate by:
  - Keeping the row “hot” (only immediately-needed scalars live here).
  - Moving bulky/rare fields (e.g. huge text/html/expressions) to side tables.
  - Using capability tables for lists (fills/strokes/effects).

CRDT identity model (high level)
- Runtime/CRDT uses a compact 32-bit id (actor:8 | counter:24).
- Database rows use an immutable UUID primary key (row_id) for stability.
- Store CRDT (actor, counter, packed_int, string) alongside row_id with a
  UNIQUE(doc_id, actor, counter). All FKs in capability tables point to row_id.
- This lets us rewrite offline actor 0 → assigned actor without FK churn.

How to load big docs efficiently (100k+ rows)
- SELECT only “hot” columns (avoid SELECT *) and stream with server-side cursors.
- Cluster/partition by doc_id for contiguous I/O.
- Fetch capability tables (fills/strokes/links) in parallel or lazily by viewport.
- Optional: mirror the “first fill” on the node row for zero-join paint preview.

Schema evolution playbook
1) Add a new scalar prop?  -> ALTER TABLE ADD COLUMN … NULL; (fast)
2) Make it type-specific?  -> Add a CHECK that forbids it for other types.
3) New list-like prop?     -> New capability table (doc_id, node_row_id, ord, …).
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
- UNIQUE(doc_id, crdt_actor, crdt_counter) when CRDT fields are present.
- FKs from capability tables to canvas_node(row_id) with ON DELETE CASCADE.

Indexing suggestions
- Primary scan path: (doc_id) → sequential/bitmap scan is ideal when clustered.
- Partial indexes for hot filters (e.g., WHERE data_state_active).
- (doc_id, crdt_packed) for client→DB translations.
- (doc_id, type) or small partials if you frequently address subsets.

Hierarchy & ordering
- Do NOT store “children arrays” in this table. Use a link table:
    link(doc_id, parent_row_id, child_row_id, ord)
  with a fractional ord key (e.g., “a”, “aM”, “b”) to avoid mass reindexing on
  reorder. Enforce acyclicity with a small trigger if needed.

Durable Objects (DO) / realtime server compatibility
- DO holds the authoritative in-memory doc state for realtime.
- DO loads from Postgres on cold start using the narrow select described above.
- DO periodically snapshots back to Postgres (or on commit points).
- CRDT ids are used at the edge; DB uses UUID row_id for relational stability.

When to split more tables
- Only for repeatables (fills/strokes/effects/guides/edges).
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
    id int not null,

    data_state_locked boolean not null default false,
    data_state_active boolean not null default true,

    -- name of the node, optionally set by user
    data_name text null,

    -- blend
    blend_opacity real not null default 1.0,
    blend_mode text not null default 'normal',

    -- geometry - dimension
    geometry_width_real real not null default 0.0,
    geometry_height__real real not null default 0.0,
    geometry_width_max real not null default 0.0,
    geometry_height_max real not null default 0.0,
    geometry_width_min real not null default 0.0,
    geometry_height_min real not null default 0.0,

    -- geometry - position
    geometry_transform_relative grida_canvas.affine2d not null default row(1,0,0,1,0,0)

    -- layout - padding
    layout_padding_left real null,
    layout_padding_right real null,
    layout_padding_top real null,
    layout_padding_bottom real null,



    -- style - stroke

    -- style - text
    text_font_size real null,
    text_text_transform text null,
    text_opentype_features jsonb null,
    text_letter_spacing real null,
    text_text_align text null,
    text_text_align_vertical text null,
    

    -- service extensions
    ext_guides jsonb null,
    ext_export_settings jsonb null,
);