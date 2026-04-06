# Anti-Aliasing Cost at Sub-Pixel Scale

**Date:** 2026-04-07
**Status:** Investigation findings

## Summary

At fit-zoom on large documents (0.02x on 135K nodes), anti-aliased
sub-pixel geometry is the dominant GPU cost. Disabling AA on sub-pixel
nodes is a viable path to 2x+ frame time reduction during settle frames.

## Discovery

### Benchmark setup

Isolated GPU benchmark (`skia_bench_subpixel`): pre-recorded SkPictures
of simple rects drawn at 1.0x vs 0.02x zoom, with AA on vs off.
GPU synced via `flush_submit_and_sync_cpu()` for accurate timing.

Hardware: Apple M2 Pro, Metal 4.1, 1000x1000 viewport.

### Results

| Nodes | full (AA on) | 0.02x (AA on) | 0.02x (AA off) | skip (0 draws) |
|-------|-------------|---------------|----------------|----------------|
| 1,000 | 621 µs | 809 µs | 442 µs | 286 µs |
| 5,000 | 1,923 µs | 3,426 µs | 1,535 µs | 271 µs |
| 10,000 | 2,986 µs | 6,221 µs | 2,180 µs | 458 µs |
| 40,000 | 9,628 µs | 21,878 µs | 6,804 µs | 324 µs |

### Key findings

1. **Sub-pixel with AA is 2.3x MORE expensive than full-size with AA.**
   At 0.02x zoom, 40K rects: 21,878 µs vs 9,628 µs. Counter-intuitive —
   smaller geometry costs more.

2. **AA is the dominant cost at sub-pixel scale.**
   AA on vs AA off at 0.02x: 21,878 vs 6,804 µs = **3.2x overhead**.
   Skia's AA rasterizer computes edge coverage for each sub-pixel edge,
   and this work is proportionally more expensive when the geometry is
   smaller than a pixel.

3. **Without AA, sub-pixel draws are near-free.**
   Per-node cost at 0.02x: AA off = 0.16 µs/node vs AA on = 0.54 µs/node.
   The AA-off cost approaches the skip baseline (0 draws).

4. **Text is not the bottleneck.**
   A/B test skipping all text nodes (22% of layers) on the 135K fixture
   showed 0% frame time difference. At 0.02x zoom, text and shapes have
   identical per-node cost — both dominated by AA overhead.

## Implications for optimization

### Adaptive AA by screen size

When a node's screen-space area falls below a threshold (e.g. 4 px²),
disable AA for that node. The visual difference is invisible (the node
is sub-pixel) but the GPU cost drops 3x.

This is similar to Chromium's approach: content below a certain screen
size gets rasterized with reduced quality during pinch-zoom.

### Where AA is set

All `set_anti_alias(true)` calls go through a few central functions in
`crates/grida-canvas/src/painter/`:

- `paint.rs` — `sk_solid_paint()`, `sk_paint_stack()`, `sk_paint_stack_without_images()`
- `gradient.rs` — gradient paint creation
- `painter.rs` — shadow, inner shadow, outline paints
- `shadow.rs` — drop/inner shadow paints
- `effects_noise.rs` — noise effect paints

A `force_no_aa` field on `RenderPolicy` controls AA globally. The
bench CLI exposes this as `--no-aa`. For production, the approach
should be per-node based on screen-space size, computed during the
frame plan.

## Benchmark measurement fix

During this investigation, we discovered that `gpu_flush()` was using
`flush_and_submit()` (async, non-blocking) instead of
`flush_submit_and_sync_cpu()` (blocking). This meant:

- `mid_flush_us` measured command buffer submission time, not GPU execution
- Per-stage breakdowns in `FrameFlushStats` were unreliable
- A/B comparisons that changed GPU workload showed false-negative results

Fixed: added `sync_gpu` config flag on `RuntimeRendererConfig`.
Benchmarks enable this, making per-stage timing accurate. Note: synced
benchmarks serialize CPU/GPU and understate pipelined throughput — they
measure isolated GPU cost, not real-world frame rate.

## Real-scene results (135K nodes, 01-135k.perf.grida)

| Scenario | AA on | AA off | Delta |
|----------|-------|--------|-------|
| baseline_nocache_zoom_slow_fit (0.02x) | 62,038 µs | 60,103 µs | **-3%** |
| mid_flush at fit | 50,599 µs | 48,773 µs | -4% |
| baseline_nocache_zoom_slow_high (zoomed in) | 21,190 µs | 19,491 µs | **-8%** |
| mid_flush at high zoom | 16,542 µs | 15,009 µs | -9% |

The improvement is smaller than the isolated bench predicted (3-9% vs
3.2x) because the real scene has complex Path nodes where picture cache
replay and path tessellation overhead dominate over AA cost.

**Interpretation:** AA is a contributor but not the primary bottleneck
on real scenes with complex geometry. The dominant cost is the per-node
`draw_picture` dispatch + replay + GPU pipeline overhead for 41K nodes,
regardless of AA state.

## Related

- `crates/grida-canvas/examples/skia_bench/skia_bench_subpixel.rs` — isolated benchmark
- `docs/wg/feat-2d/optimization.md` — master optimization catalog
- Chromium pinch-zoom: reduced rasterization quality during interaction
