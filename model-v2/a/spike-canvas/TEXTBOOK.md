# TEXTBOOK — how an editor sits on the `anchor` model

2026-07-07. The spike's second deliverable: the reference the
`crates/grida` / `crates/grida_editor` migration reads. Every chapter
names the concern, where it lives here, the model law it exercises, and
the lab test that guards the claim. The lab (`../lab`) is the single
source of truth; this app consumes it as a library — exactly the
relationship the migration will have with the engine crate.

> **DEC-0 second lock (same day):** the default flipped to
> **visual-only** rotation (owner framing; normative rules incl. the
> V-4 group-box fork: [`../dec0-visual-only.md`](../dec0-visual-only.md)).
> Chapters below hold unchanged except: HUD chrome for derived kinds
> reads INK bounds (`world_aabb`), and the rotate×layout policy surface
> (E-A4/E-A7/E-A11/E-A12, DEC-1/2/3) is retired. Both arms stay
> implemented and tested; the anchor arm is the documented alternative.

## The thesis: resolve-per-frame, no derived state

`document → resolve (full) → paint`, immediate. The editor holds NO
caches, no dirty tracking, no reactive layer — its whole state is the
arena `Document`, an FSM, a camera, and an undo stack of document
snapshots. This is affordable because the resolved tier is cheap to
recompute: the spike's `--bench` measures the starter scene at
**0.008 ms resolve / 0.17 ms full frame**, and 10k nodes at 0.35 ms
resolve (paint-bound at ~9 ms). Where the legacy engine invalidates,
this design just re-resolves — the incremental invalidator becomes an
optimization to ADD someday, not an architecture to build first.

## The storage chapter: node arena + SOA resolved tier

The lab's original store was `BTreeMap<NodeId, Node>` with an O(n)
`parent_of` scan — the same pointer-chasing shape the legacy system
pays for. The spike replaced it (`lab/src/model.rs`):

- **cold intent = AoS in a node arena** — `NodeId` IS the slot index,
  deleted slots are tombstones, parent links are an index-aligned
  column (O(1) `parent_of`). Nodes stay AoS because intent is edited
  field-wise and read whole.
- **hot resolved = SOA columns** (`lab/src/resolve.rs::Resolved`) —
  `Vec<Option<Affine>>` / `Vec<Option<RectF>>` indexed by NodeId,
  written once per resolve, read every frame by paint/HUD/pick.
- **equality is semantic** — tombstones and arena capacity are storage
  artifacts, not document content (MM-7's add-then-delete-restores
  holds by definition; `tests/mm_laws.rs`).

Measured (E4 bench, median of 11, same machine, before → after):

| scene                    | before (map) | after (arena+SOA) | speedup             |
| ------------------------ | ------------ | ----------------- | ------------------- |
| flat canvas 1,000        | 0.753 ms     | 0.097 ms          | 7.8×                |
| flat canvas 10,000       | 5.462 ms     | 0.473 ms          | **11.5×**           |
| mixed groups+flex 10,000 | 8.534 ms     | 3.005 ms          | 2.8×                |
| flex cards ~10,000       | 24.373 ms    | 19.341 ms         | 1.26× (Taffy-bound) |

Guarded by: the whole suite (100 tests) passing unchanged across the
refactor, plus `tests/arena_pick.rs::parent_links_survive_structural_ops`.

## Chapter map (concern → file → law → guarding test)

| concern                  | spike file                                     | model law                                                                                                   | lab test                                                              |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| camera (view ≠ document) | `src/camera.rs`                                | reads/writes split: pan/zoom write nothing                                                                  | (host-only; no doc writes exist to test)                              |
| hit-testing              | `lab/src/pick.rs` (model concern, NOT chrome)  | oriented boxes via inverse world; lens hits post-ops; groups transparent-select to the OUTERMOST (GROUP.md) | `arena_pick.rs::pick_*` (5 tests)                                     |
| pointer FSM              | `src/interaction.rs`                           | states are data; transitions call ops; typed errors surface                                                 | ops layer: `ops_suite.rs`, `flip.rs`                                  |
| gestures → writes        | `src/shell/app.rs` (`pointer_move`)            | delta-form ops re-target intent; a drag ends as if written once; parent-space conversion via world inverse  | `ops_suite.rs::write_counts_match_doctrine`                           |
| resize through zero      | `Drag::ResizeEdge/Corner` → `ops::resize_drag` | E-A14: \|extent\| + flip toggle + re-pin; out-and-back = identity; typed `set_width(−x)` stays a wall       | `flip.rs::f4_*` (4 tests), `f5_typed_negative…`                       |
| rotate                   | `Drag::Rotate`                                 | boxed = 1 write (center pivot); derived = 3-write center-feel                                               | `rotation.rs::r1`, `ops_suite.rs`, `rotation.rs::group_origin_pivot…` |
| HUD chrome               | `src/shell/hud.rs`                             | chrome derives from the resolved tier; derived local box = box − origin (E-A1); envelope readout (E-A7)     | `derived.rs::d2_*`, `geometry.rs`                                     |
| undo                     | snapshot stack in `app.rs`                     | the document is one value; history = values                                                                 | `mm_laws.rs::mm7_add_delete_restores`                                 |
| structure ops            | `ops::delete` / `ops::ungroup`                 | subtree remove; ungroup = 3–5 write bake with mirror conjugation                                            | `arena_pick.rs::delete_*`, `flip.rs::f6`, `mm_laws.rs::mm9`           |
| the IR panel             | `src/shell/app.rs::apply_ir`                   | the text IR is a full projection; parse errors are typed; round-trip is law                                 | `textir_suite.rs::roundtrip_fixpoint`                                 |
| reports as UI            | panel "reports" section                        | §8 applicability outcomes are REPORTED, never silent                                                        | `layout.rs`, `edge_census.rs` (report assertions)                     |

## The shell (non-textbook, by design)

`src/shell/window.rs` is cribbed from `crates/grida_editor/src/shell/window.rs`
(winit 0.30 + glutin 0.32 + skia GL surface + egui_glow 0.35 overlay on
the ONE shared context, with the Ganesh `reset(None)` dance after egui's
raw GL). The windowing is chrome, not model — the migration keeps its
own shell and takes the chapters above.

## Counterpart map (spike → grida_editor)

| spike                      | grida_editor                    | note                                                                          |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `interaction.rs` FSM       | `hud/gesture.rs`, `tool.rs`     | states-as-data; the spike's is minimal on purpose                             |
| `shell/hud.rs`             | `hud/chrome.rs`, `hud/vocab.rs` | one geometry for paint AND hit (`handles()` shared)                           |
| `lab/pick.rs`              | `hud/hit.rs`                    | spike puts hit in the MODEL crate — recommended for the migration             |
| undo snapshots             | `history.rs`                    | grida_editor has invertible mutations; snapshots are the spike's honest floor |
| `apply_ir`                 | `io.rs` / wire                  | text seam with typed errors                                                   |
| `shell/app.rs::paint_egui` | `shell/app.rs::paint_egui`      | same recipe, same reset dance                                                 |

## The legacy wasm seam (recorded for the migration, not exercised)

`crates/grida-canvas-wasm` is a C-ABI seam: `#[no_mangle] extern "C"`,
strings in as ptr+len UTF-8, results out as 4-byte-LE length-prefixed
buffers via exported `_allocate`/`_deallocate` (JS mirror:
`lib/modules/ffi.ts` — `allocString`/`readLenPrefixedString`), pointer
events as packed-u32 responses, hit-test precedent
`_get_node_id_from_point`. When the anchor model crosses that boundary,
`resolve → draw list` and the op vocabulary here are the payload shapes
to encode; the spike deliberately did not build the boundary (owner:
no wasm — testing the model, not the transport).

## Frictions found by hand (see SPIKE.md for the full list)

Fed back into the register/docs rather than patched silently:
edge-resize of a ROTATED node steers in parent axes (usable, not
local-axis correct — a gesture-math follow-up for editor.md); text
measure-vs-render mismatch is visible (DEC-4/B-1, on purpose); skia
0.93 removed mutable `Path` (use `PathBuilder` — engine already does).
