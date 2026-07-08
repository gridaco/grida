# anchor-engine — the phase-4 canvas engine skeleton

The pipeline the `crates/grida` migration will read: `document → resolve →
drawlist → paint`, plus the read tier (`query`), time-as-data
(`journal`/`replay`), and the sockets every future optimization plugs into
(`damage`, `ident`, `oracle`). It consumes [`anchor-lab`](../a/lab) as a
library — the same relationship the migration will have with the model crate.
The contracts it encodes are catalogued in [`../a/ENGINE.md`](../a/ENGINE.md)
(ENG-0…ENG-5, S-1…S-7); each module names the contract it serves.

This is a **day-1 skeleton**: every contract has a code socket and a guarding
test, and the spike ([`../a/spike-canvas`](../a/spike-canvas)) is **re-hosted**
onto it — painting, hit-testing, gestures, and damage all flow through the
engine. Growth (incremental resolve, tiles, a broadphase index, a real shaper)
is deferred to named studies; the sockets are here so that growth is additive.

## Run

```sh
# the engine's own tests (drawlist, query, journal, replay, damage, ident)
cd model-v2/engine && cargo test

# the trace arm must keep compiling
cargo check --features trace

# the gate: shots byte-identical + replay determinism + bench budgets
# (needs the spike built first — it owns the golden pixels)
(cd ../a/spike-canvas && cargo build --release)
cargo run --release --bin gate
```

How the engine proves it is _fast_ (the four measurement axes — automated work
& correctness, the auxiliary human-in-the-loop feel channel, and the
software-unmeasurable input→photon limit) is its own doctrine:
[`MEASURE.md`](./MEASURE.md).

## Contract → module → guarding test

| concern                              | module           | contract      | guarding test                                                                |
| ------------------------------------ | ---------------- | ------------- | ---------------------------------------------------------------------------- |
| stage purity + the oracle law        | (whole pipeline) | ENG-0         | the gate's differential + determinism runs                                   |
| drawlist (pure, diffable projection) | `drawlist.rs`    | ENG-2.1       | `tests/drawlist.rs` (order · pruning · color · verbatim world · determinism) |
| paint executor (only skia module)    | `paint.rs`       | ENG-2.1       | spike shots byte-identical (gate)                                            |
| one frame entry                      | `frame.rs`       | ENG-2.4       | spike live loop + gate                                                       |
| damage as data                       | `damage.rs`      | ENG-2.2       | `tests/damage.rs` (identity empty · single-op locality)                      |
| spatial read tier                    | `query.rs`       | ENG-3         | `tests/query.rs` (`hit_point ≡ pick` over a grid)                            |
| journal (op-log)                     | `journal.rs`     | ENG-5.1       | `tests/journal.rs`                                                           |
| replay (corpus, determinism)         | `replay.rs`      | ENG-5.2/5.3   | `tests/replay.rs` + `rig/corpus/*.replay` via the gate                       |
| cache identity                       | `ident.rs`       | ENG-2.3/1.4   | `tests/ident.rs` (generation-stamped key)                                    |
| oracle version tags                  | `oracle.rs`      | ENG-4.2       | the `.replay` header                                                         |
| gated observability                  | `trace.rs`       | S-6           | `cargo check --features trace`                                               |
| the rig                              | `bin/gate.rs`    | ENG-0.2 / S-5 | it _is_ the gate                                                             |

The model-crate side of the setup lives in [`../a/lab`](../a/lab): the typed
`Op` + `apply` dispatcher + `DirtyClass` (`ops.rs`), the per-slot `generations`
column (`model.rs`), the non-panicking `Resolved` opt accessors (`resolve.rs`),
and the optional `serde` feature (the op-log wire) — each additive, the 121-test
lab suite green throughout.

## The re-host, concretely

The spike's scene painter is deleted; it calls `drawlist::build` +
`paint::execute` (shots prove this byte-identical to the old painter, including
the rotated and cross-zero-flip scenes). Pick/hover go through `query`. All
gesture ops go through `apply` and are recorded in the `journal` (undo stays
document snapshots — ENG-5.5). `--record` writes `.replay` corpus files; the
panel shows the per-frame damage count.

## Scope fence (named, not silent)

Skia stays the rasterizer (the engine is the architecture _above_ it). Not an
ECS — the arena/SOA is a storage layout, not a component model. Deferred to
studies, each behind a socket that is already here: incremental resolve
(OS-1a/1b — `DirtyClass` exists, the engine ignores it and full-resolves) ·
tiles / partial repaint (OS-2a — damage is data only) · layer promotion (OS-2b
— re-measure the legacy finding) · broadphase BVH (OS-3a/3b — behind `query`)
· real shaper (OS-4a / DEC-4) · pathops-in-measure (OS-4b / DEC-6) · CRDT /
cross-session replay (OS-5b/5c — walled on stable ids, a.md §12).
