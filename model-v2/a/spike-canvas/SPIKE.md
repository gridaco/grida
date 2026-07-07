# SPIKE.md — E10 read-out

2026-07-07. Built in one session on the lab (which gained the arena/SOA
storage, `pick`, and `delete` — 100 tests green). Self-verified via
`--shot` headless renders and a 6 s window smoke-launch; the FEEL half
of the acceptance is the owner's (README checklist).

## Numbers

Resolver bench (E4, median of 11, release) — the arena+SOA refactor
alone, before the spike even paints:

| scene        | map store | arena+SOA | Δ                   |
| ------------ | --------- | --------- | ------------------- |
| flat 1,000   | 0.753 ms  | 0.097 ms  | 7.8×                |
| flat 10,000  | 5.462 ms  | 0.473 ms  | 11.5×               |
| mixed 10,000 | 8.534 ms  | 3.005 ms  | 2.8×                |
| flex ~10,000 | 24.373 ms | 19.341 ms | 1.26× (Taffy-bound) |

Spike frame bench (`--bench`, raster, resolve + skia paint):

| scene         | nodes  | resolve  | paint    | frame   |
| ------------- | ------ | -------- | -------- | ------- |
| starter scene | 18     | 0.008 ms | 0.163 ms | 0.17 ms |
| flat 100      | 101    | 0.004 ms | 0.183 ms | 0.19 ms |
| flat 1,000    | 1,001  | 0.034 ms | 1.248 ms | 1.28 ms |
| flat 10,000   | 10,001 | 0.345 ms | 8.674 ms | 9.02 ms |

**Verdict on the thesis:** resolve-per-frame holds with an order of
magnitude of headroom — at editor scales the frame is PAINT-bound, not
resolve-bound. The incremental invalidator is an optimization for
later, not a load-bearing wall. (This is the inverse of the legacy
architecture's assumption, and now it has numbers.)

## Verified headless (committed-adjacent in [shots/](./shots); reproduce with --shot)

- `default`: the row makes room for the 20° card; HUD reads
  "70×110 basis · 103×127 envelope · 20.0°" (E-A7); badge end-pinned;
  bar spanned; lens child rotated in the paint lane; hug breathing.
- `crosszero`: card.a dragged 50 px past its fixed right edge →
  50×110, `flip_x=true`, row reflowed (E-A14 re-target, no negative
  extent stored).
- `ungroup`: chips baked to the artboard, world-exact.
- Window smoke-launch: 6 s, exit clean (GL + skia + egui painter +
  event loop healthy).

## Frictions found by hand (the spike's real yield)

1. **Rotated edge-resize steers in parent axes.** `resize_drag` is
   parent-axis by design; on a rotated node the handle follows the
   cursor's parent-X, not the local edge normal. Usable, but the
   local-axis gesture (project cursor onto the local axis, then
   re-target) belongs in editor.md as the real spec — follow-up, not a
   model change (R-4 commute already guarantees the write side).
2. **Text: measured-vs-rendered mismatch is visible** (lab stub vs
   default typeface). Expected — this is open DEC-4/B-1 rendered
   honest. The moment a real shaper lands, the measure closure seam in
   `resolve.rs` is where it plugs.
3. **Hover-pick every pointer-move re-resolves.** At spike scale it's
   free (8 µs); at product scale the resolved tier of the LAST frame is
   already correct for picking — reuse it (the SOA columns make that a
   borrow, not a copy). Noted for the migration.
4. **skia-safe 0.93 removed mutable `Path`** — `PathBuilder` +
   `snapshot()` (the engine already does this; the textbook records it
   so the migration doesn't rediscover it).
5. **egui 0.35 API drift** (`Panel` not `SidePanel`, `run_ui`,
   `egui_wants_pointer_input`) — grida_editor's shell is the reliable
   reference, upstream docs are not.

## Register feedback

- Nothing falsified. DEC-1's pop reproduces exactly as the register
  describes (rotate card.grow and watch it snap at the first degree —
  with the report badge visible in the panel).
- DEC-9's flip arm feels RIGHT in the hand (drag through zero and
  back): supports the owner lean (true flip) with gesture evidence.
- E-A13 untouched by the spike (group pass-through not exercised —
  the starter groups are Start-pinned free-context).

## What this cost

Lab: +arena/SOA refactor (semantic-equality PartialEq, structural
APIs), +`pick.rs`, +`ops::delete` — net +8 tests (100 total).
Spike: ~1,900 lines across 9 files, one session, skia reused from the
repo's shared target dir (first full build ≈ 2.5 min).

## Addendum — DEC-0 flip (same day)

After the read-out, DEC-0 second-locked to **visual-only (CSS framing,
CSS-pure sizing)** — owner framing, correcting a mis-recorded first
lock. The gated spec review ran: normative rules in
`../dec0-visual-only.md` (the V-4 group-box fork was real UB until
decided — sizing-tier union chosen); lab default flipped;
`tests/visual_only.rs` added (14 tests; suite now **114**); shots above
regenerated under the new default (the rot45 shot now shows overlap as
correct behavior and the hug frame NOT breathing — compare the fork
demo's right panel). The E-A11 pop noted in "register feedback" is
n/a under the new default — the configuration it popped in no longer
exists.
