use super::args::{BenchArgs, BenchReportArgs};
use super::report::*;
use anyhow::{anyhow, Result};
use cg::cg::prelude::*;
use cg::devtools::surface_overlay::SurfaceOverlayConfig;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::{Node, Scene, Size};
use cg::runtime::frame_loop::{FrameLoop, FrameQuality};
use cg::runtime::scene::FrameFlushResult;
use cg::surface::state::SurfaceState;
use cg::surface::ui::{HitRegions, SurfaceUI};
use cg::window::headless::HeadlessGpu;
use math2::transform::AffineTransform;
use std::path::{Path, PathBuf};
use std::time::Instant;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Reusable state for drawing the SurfaceUI overlay during benchmarks.
/// Created once per bench run when `--overlay` is set; passed to `measure_frame`.
struct OverlayBenchState {
    surface_state: SurfaceState,
    config: SurfaceOverlayConfig,
    hit_regions: HitRegions,
}

impl OverlayBenchState {
    fn new() -> Self {
        Self {
            surface_state: SurfaceState::default(),
            config: SurfaceOverlayConfig {
                dpr: 1.0,
                show_frame_titles: true,
                show_size_meter: false,
                text_baseline_decoration: false,
                show_selection_handles: false,
            },
            hit_regions: HitRegions::new(),
        }
    }

    /// Draw `SurfaceUI` onto the renderer's canvas and flush the GPU.
    fn draw(&mut self, renderer: &mut cg::runtime::scene::Renderer) {
        let graph = renderer.scene.as_ref().map(|s| &s.graph);
        let cache = renderer.get_cache();
        let camera = &renderer.camera;
        let fonts = &renderer.fonts;
        let canvas = renderer.canvas();
        SurfaceUI::draw(
            canvas,
            &self.surface_state,
            camera,
            cache,
            &self.config,
            &mut self.hit_regions,
            graph,
            fonts,
        );
        renderer.flush_overlay();
    }
}

fn count_effects_nodes(renderer: &cg::runtime::scene::Renderer) -> usize {
    renderer
        .scene
        .as_ref()
        .map(|s| {
            s.graph
                .nodes_iter()
                .filter(|(_, node)| match node {
                    Node::Rectangle(r) => r.effects.has_expensive_effects(),
                    Node::Ellipse(e) => e.effects.has_expensive_effects(),
                    _ => false,
                })
                .count()
        })
        .unwrap_or(0)
}

fn warmup(renderer: &mut cg::runtime::scene::Renderer) {
    renderer.queue_stable();
    let _ = renderer.flush();
    for _ in 0..10 {
        renderer.camera.translate(1.0, 0.0);
        renderer.queue_unstable();
        let _ = renderer.flush();
    }
}

/// Measure a single frame including queue + flush + optional overlay.
/// Returns (total_us, queue_us, draw_us, mid_flush_us, compositor_us, flush_us).
///
/// When `overlay` is `Some`, [`SurfaceUI::draw`] is called after the content
/// flush — matching the real `Application::frame()` pipeline. The overlay cost
/// is included in `total_us` but not in the per-stage breakdown, mirroring how
/// the native viewer accounts for it.
fn measure_frame(
    renderer: &mut cg::runtime::scene::Renderer,
    stable: bool,
    overlay: Option<&mut OverlayBenchState>,
) -> Option<(u64, u64, u64, u64, u64, u64)> {
    let t0 = Instant::now();
    if stable {
        renderer.queue_stable();
    } else {
        renderer.queue_unstable();
    }
    let queue_us = t0.elapsed().as_micros() as u64;

    match renderer.flush() {
        FrameFlushResult::OK(stats) => {
            // Draw the SurfaceUI overlay if enabled (after content flush,
            // before recording total time — same order as Application::frame).
            if let Some(ov) = overlay {
                ov.draw(renderer);
            }
            let total = t0.elapsed().as_micros() as u64;
            Some((
                total,
                queue_us,
                stats.draw.painter_duration.as_micros() as u64,
                stats.mid_flush_duration.as_micros() as u64,
                stats.compositor_duration.as_micros() as u64,
                stats.flush_duration.as_micros() as u64,
            ))
        }
        _ => None,
    }
}

/// Run a pan pass with configurable speed (dx per frame) at the current camera zoom.
/// Uses CONTINUOUS panning (one direction, then reverses) to trigger cache misses
/// and expose frame drop outliers during area discovery/culling.
/// Measures queue + flush per frame. Ends with a settle (stable) frame.
fn run_pan_pass_at(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    dx: f32,
    mut overlay: Option<OverlayBenchState>,
) -> PassStats {
    let wall_start = Instant::now();
    let mut frame_times = Vec::with_capacity(frames as usize);
    let mut queue_us_acc = Vec::with_capacity(frames as usize);
    let mut draw_us_acc = Vec::with_capacity(frames as usize);
    let mut mid_flush_us_acc = Vec::with_capacity(frames as usize);
    let mut compositor_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);

    // Continuous pan: go right for half the frames, then left for the other half.
    // This accumulates offset in one direction, triggering cache misses and
    // new-area discovery, unlike the old alternating ±dx pattern which kept
    // the camera in place and only measured cache hits.
    let half = frames / 2;
    for i in 0..frames {
        let d = if i < half { dx } else { -dx };
        renderer.camera.translate(d, 0.0);
        if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut()) {
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(d);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
        }
    }
    let wall = wall_start.elapsed();

    // Settle frame (stable quality) — not counted in per-frame stats.
    let settle_us = measure_settle(renderer);

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        settle_us,
    )
}

/// Legacy: pan at dx=5.0 (default).
fn run_pan_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    overlay: Option<OverlayBenchState>,
) -> PassStats {
    run_pan_pass_at(renderer, frames, 5.0, overlay)
}

/// Pick a sensible default target node for translate benchmarks.
///
/// Prefers the first root node that supports translation. Skips
/// `InitialContainer` which has no movable transform.
fn pick_translate_target(scene: &Scene) -> Option<cg::node::schema::NodeId> {
    use cg::node::schema::Node;
    for &root_id in scene.graph.roots() {
        match scene.graph.get_node(&root_id) {
            Ok(Node::InitialContainer(_)) => continue,
            Ok(_) => return Some(root_id),
            Err(_) => continue,
        }
    }
    None
}

/// Run a node-translate mutation pass.
///
/// Each frame:
///   1. Translate the target node by (±dx, 0) — reversing direction
///      halfway through so the node ends near its starting position.
///   2. Call `mark_node_change_kind` + `apply_changes` to drive the
///      invalidation pipeline (same path as the native drag gesture
///      in `EditorDocument::apply_and_mark`).
///   3. Measure queue+flush as a regular frame.
fn run_translate_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    target_id: cg::node::schema::NodeId,
    dx: f32,
    mut overlay: Option<OverlayBenchState>,
) -> PassStats {
    use grida_dev::editor::mutation::{self, MutationCommand};

    let wall_start = Instant::now();
    let mut frame_times = Vec::with_capacity(frames as usize);
    let mut queue_us_acc = Vec::with_capacity(frames as usize);
    let mut draw_us_acc = Vec::with_capacity(frames as usize);
    let mut mid_flush_us_acc = Vec::with_capacity(frames as usize);
    let mut compositor_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);

    let half = frames / 2;
    let mut apply_changes_us_acc: Vec<u64> = Vec::with_capacity(frames as usize);
    for i in 0..frames {
        let d = if i < half { dx } else { -dx };

        // Reuse the editor mutation API so the bench exercises
        // exactly the same translate/classify path as the native
        // drag (`EditorDocument::apply_and_mark`).
        let reports = if let Some(scene) = renderer.scene.as_mut() {
            mutation::apply(
                scene,
                &MutationCommand::Translate {
                    ids: vec![target_id],
                    dx: d,
                    dy: 0.0,
                },
            )
        } else {
            Vec::new()
        };
        if reports.is_empty() {
            continue;
        }
        for (id, kind) in &reports {
            renderer.mark_node_change_kind(*id, *kind);
        }

        // Mirror Application::frame(): call apply_changes before queue,
        // and include its cost in the total frame time. This is where
        // the invalidation pipeline actually runs.
        let t_total = Instant::now();
        let t_ac = Instant::now();
        let _ = renderer.apply_changes(cg::runtime::camera::CameraChangeKind::None, false);
        let apply_us = t_ac.elapsed().as_micros() as u64;

        if let Some((queue_flush_total, q, d_us, mf, c, f)) =
            measure_frame(renderer, false, overlay.as_mut())
        {
            let total = t_total.elapsed().as_micros() as u64;
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(d_us);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
            apply_changes_us_acc.push(apply_us);
            let _ = queue_flush_total; // queue+flush is part of total
        }
    }
    let wall = wall_start.elapsed();
    let settle_us = measure_settle(renderer);

    // Print apply_changes cost separately — the differ + flush_dirty
    // live inside it, so this is the load-bearing number for the
    // invalidation refactor.
    if !apply_changes_us_acc.is_empty() {
        let mut sorted = apply_changes_us_acc.clone();
        sorted.sort_unstable();
        let n = sorted.len();
        let avg = sorted.iter().sum::<u64>() / n as u64;
        let p50 = sorted[n / 2];
        let p95 = sorted[(n * 95 / 100).min(n - 1)];
        let p99 = sorted[(n * 99 / 100).min(n - 1)];
        let max = *sorted.last().unwrap();
        println!(
            "  apply_changes: avg={} p50={} p95={} p99={} MAX={} us",
            avg, p50, p95, p99, max
        );
    }

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        settle_us,
    )
}

/// Run a zoom pass with configurable step and range.
/// Measures queue + flush per frame. Ends with a settle (stable) frame.
fn run_zoom_pass_at(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    step: f32,
    z_min: f32,
    z_max: f32,
    mut overlay: Option<OverlayBenchState>,
) -> PassStats {
    let start_z = (z_min + z_max) / 2.0;
    renderer.camera.set_zoom(start_z);
    // Warmup at the starting zoom
    renderer.queue_stable();
    let _ = renderer.flush();

    let wall_start = Instant::now();
    let mut frame_times = Vec::with_capacity(frames as usize);
    let mut queue_us_acc = Vec::with_capacity(frames as usize);
    let mut draw_us_acc = Vec::with_capacity(frames as usize);
    let mut mid_flush_us_acc = Vec::with_capacity(frames as usize);
    let mut compositor_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);
    let mut z = start_z;
    let mut zdir: i32 = 1;

    for _ in 0..frames {
        let next_z = z + zdir as f32 * step;
        // Reverse direction at bounds, but avoid clamping to the same value
        // (which would produce a no-change frame and waste a measurement).
        if next_z > z_max {
            zdir = -1;
            z = z_max;
        } else if next_z < z_min {
            zdir = 1;
            z = z_min;
        } else {
            z = next_z;
        }
        renderer.camera.set_zoom(z);
        if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut()) {
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(d);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
        }
    }
    let wall = wall_start.elapsed();

    // Settle frame: the stable redraw after zoom ends.
    // This is the frame that replaces the blurry zoom-cached content
    // with full-quality rendering at the correct zoom level.
    let settle_us = measure_settle(renderer);

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        settle_us,
    )
}

/// Legacy: zoom with step=0.02, range 0.5-2.0.
fn run_zoom_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    overlay: Option<OverlayBenchState>,
) -> PassStats {
    run_zoom_pass_at(renderer, frames, 0.02, 0.5, 2.0, overlay)
}

/// Measure a single stable (settle) frame including queue + flush.
fn measure_settle(renderer: &mut cg::runtime::scene::Renderer) -> u64 {
    let t = Instant::now();
    renderer.queue_stable();
    let _ = renderer.flush();
    t.elapsed().as_micros() as u64
}

/// Simulate a resize cycle on the Renderer.
///
/// Reproduces the work that `Application::resize()` + `frame()` does,
/// minus the GPU surface recreation (which is owned by the window/headless host):
///   1. update_viewport_size + camera.set_size
///   2. mark_changed(VIEWPORT_SIZE)
///   3. apply_changes  (central dispatch — selective invalidation)
///   4. queue_unstable + flush (scene repaint with surviving caches)
fn measure_resize(
    renderer: &mut cg::runtime::scene::Renderer,
    width: i32,
    height: i32,
) -> Option<(u64, u64, u64, u64)> {
    use cg::runtime::camera::CameraChangeKind;
    use cg::runtime::invalidation::GlobalFlag;

    let t0 = Instant::now();

    renderer.update_viewport_size(width as f32, height as f32);
    renderer.camera.set_size(Size {
        width: width as f32,
        height: height as f32,
    });
    renderer.mark_global(GlobalFlag::ViewportSize);

    // apply_changes replaces the old rebuild_scene_caches + invalidate_cache
    let t_apply = Instant::now();
    renderer.apply_changes(CameraChangeKind::None, false);
    let apply_us = t_apply.elapsed().as_micros() as u64;

    // invalidate_us is now effectively zero (no separate step)
    let invalidate_us = 0u64;

    renderer.queue_unstable();
    let t_flush = Instant::now();
    match renderer.flush() {
        FrameFlushResult::OK(_) => {
            let flush_us = t_flush.elapsed().as_micros() as u64;
            let total_us = t0.elapsed().as_micros() as u64;
            Some((total_us, apply_us, invalidate_us, flush_us))
        }
        _ => None,
    }
}

/// Run a resize pass: alternate between two viewport sizes for N iterations.
///
/// Simulates what happens on every ResizeObserver callback in the browser:
/// the full resize() + redraw() path fires per frame during a window drag.
fn run_resize_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    size_a: (i32, i32),
    size_b: (i32, i32),
) -> ResizePassStats {
    let wall_start = Instant::now();
    let mut total_us_acc = Vec::with_capacity(frames as usize);
    let mut rebuild_us_acc = Vec::with_capacity(frames as usize);
    let mut invalidate_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);

    for i in 0..frames {
        let (w, h) = if i % 2 == 0 { size_a } else { size_b };
        if let Some((total, rebuild, invalidate, flush)) = measure_resize(renderer, w, h) {
            total_us_acc.push(total);
            rebuild_us_acc.push(rebuild);
            invalidate_us_acc.push(invalidate);
            flush_us_acc.push(flush);
        }
    }

    let wall = wall_start.elapsed();
    compute_resize_stats(
        &total_us_acc,
        &rebuild_us_acc,
        &invalidate_us_acc,
        &flush_us_acc,
        wall,
    )
}

struct ResizePassStats {
    avg_us: u64,
    min_us: u64,
    p50_us: u64,
    p95_us: u64,
    max_us: u64,
    rebuild_us: u64,
    invalidate_us: u64,
    flush_us: u64,
    wall: std::time::Duration,
}

fn compute_resize_stats(
    total: &[u64],
    rebuild: &[u64],
    invalidate: &[u64],
    flush: &[u64],
    wall: std::time::Duration,
) -> ResizePassStats {
    if total.is_empty() {
        return ResizePassStats {
            avg_us: 0,
            min_us: 0,
            p50_us: 0,
            p95_us: 0,
            max_us: 0,
            rebuild_us: 0,
            invalidate_us: 0,
            flush_us: 0,
            wall,
        };
    }
    let mut sorted = total.to_vec();
    sorted.sort();
    let n = sorted.len();
    ResizePassStats {
        avg_us: wall.as_micros() as u64 / n as u64,
        min_us: sorted[0],
        p50_us: sorted[n / 2],
        p95_us: sorted[n * 95 / 100],
        max_us: sorted[n - 1],
        rebuild_us: rebuild.iter().sum::<u64>() / n as u64,
        invalidate_us: invalidate.iter().sum::<u64>() / n as u64,
        flush_us: flush.iter().sum::<u64>() / n as u64,
        wall,
    }
}

fn compute_pass_stats(
    frame_times: &[u64],
    queue_us_acc: &[u64],
    draw_us_acc: &[u64],
    mid_flush_us_acc: &[u64],
    compositor_us_acc: &[u64],
    flush_us_acc: &[u64],
    wall: std::time::Duration,
    settle_us: u64,
) -> PassStats {
    if frame_times.is_empty() {
        return PassStats {
            avg_us: 0,
            fps: 0.0,
            min_us: 0,
            p50_us: 0,
            p95_us: 0,
            p99_us: 0,
            max_us: 0,
            queue_us: 0,
            draw_us: 0,
            mid_flush_us: 0,
            compositor_us: 0,
            flush_us: 0,
            settle_us: 0,
        };
    }

    let mut sorted = frame_times.to_vec();
    sorted.sort();
    let n = sorted.len();
    let avg = wall.as_micros() as u64 / n as u64;

    PassStats {
        avg_us: avg,
        fps: 1_000_000.0 / avg as f64,
        min_us: sorted[0],
        p50_us: sorted[n / 2],
        p95_us: sorted[n * 95 / 100],
        p99_us: sorted[n * 99 / 100],
        max_us: sorted[n - 1],
        queue_us: queue_us_acc.iter().sum::<u64>() / n as u64,
        draw_us: draw_us_acc.iter().sum::<u64>() / n as u64,
        mid_flush_us: mid_flush_us_acc.iter().sum::<u64>() / n as u64,
        compositor_us: compositor_us_acc.iter().sum::<u64>() / n as u64,
        flush_us: flush_us_acc.iter().sum::<u64>() / n as u64,
        settle_us,
    }
}

/// Run a zigzag pan pass: diagonal back-and-forth like reading a document.
///
/// Motion pattern: right+down for `segment_frames`, then left+down for
/// `segment_frames`, repeating. Each segment moves `dx` horizontally and
/// `dy` vertically per frame.
///
/// When `pause_frames > 0`, the user "stops to read" between each zig and
/// zag. During the pause, settle frames fire (simulating the native viewer's
/// settle countdown), then the next zig/zag begins cold (no cache from the
/// previous direction).
fn run_zigzag_pan_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    frames: u32,
    dx: f32,
    dy: f32,
    segment_frames: u32,
    pause_frames: u32,
) -> PassStats {
    let wall_start = Instant::now();
    let mut frame_times = Vec::new();
    let mut queue_us_acc = Vec::new();
    let mut draw_us_acc = Vec::new();
    let mut mid_flush_us_acc = Vec::new();
    let mut compositor_us_acc = Vec::new();
    let mut flush_us_acc = Vec::new();

    let mut emitted = 0u32;
    let mut _seg_pos = 0u32;
    let mut going_right = true;

    while emitted < frames {
        // Zig or zag segment
        let seg_len = segment_frames.min(frames - emitted);
        for _ in 0..seg_len {
            let sx = if going_right { dx } else { -dx };
            renderer.camera.translate(sx, dy);
            if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut())
            {
                frame_times.push(total);
                queue_us_acc.push(q);
                draw_us_acc.push(d);
                mid_flush_us_acc.push(mf);
                compositor_us_acc.push(c);
                flush_us_acc.push(f);
            }
            emitted += 1;
            if emitted >= frames {
                break;
            }
        }

        // Pause: "stop to read". Fire settle frames like the native viewer
        // would during idle time. These are real frames the user sees.
        for _ in 0..pause_frames {
            if emitted >= frames {
                break;
            }
            if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, true, overlay.as_mut()) {
                frame_times.push(total);
                queue_us_acc.push(q);
                draw_us_acc.push(d);
                mid_flush_us_acc.push(mf);
                compositor_us_acc.push(c);
                flush_us_acc.push(f);
            }
            emitted += 1;
        }

        going_right = !going_right;
        _seg_pos += 1;
    }

    let wall = wall_start.elapsed();
    let settle_us = measure_settle(renderer);

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        settle_us,
    )
}

/// Run a circle-panning pass: simulates a realistic trackpad gesture where
/// the user pans in a circle. This is the hardest case for cache-based
/// approaches because the pan direction is unpredictable — edges get culled
/// and rediscovered continuously.
///
/// `radius` is in world-space units. The circle completes over `frames` frames.
fn run_circle_pan_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    frames: u32,
    radius: f32,
) -> PassStats {
    let wall_start = Instant::now();
    let mut frame_times = Vec::with_capacity(frames as usize);
    let mut queue_us_acc = Vec::with_capacity(frames as usize);
    let mut draw_us_acc = Vec::with_capacity(frames as usize);
    let mut mid_flush_us_acc = Vec::with_capacity(frames as usize);
    let mut compositor_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);

    // Complete 2 full circles over the frame count.
    let circles = 2.0f32;
    let mut prev_x = 0.0f32;
    let mut prev_y = 0.0f32;

    for i in 0..frames {
        let angle = (i as f32 / frames as f32) * std::f32::consts::TAU * circles;
        let x = angle.cos() * radius;
        let y = angle.sin() * radius;
        let dx = x - prev_x;
        let dy = y - prev_y;
        prev_x = x;
        prev_y = y;

        renderer.camera.translate(dx, dy);
        if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut()) {
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(d);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
        }
    }
    let wall = wall_start.elapsed();
    let settle_us = measure_settle(renderer);

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        settle_us,
    )
}

// ---------------------------------------------------------------------------
// Real-time event loop simulation
// ---------------------------------------------------------------------------

/// Simulates the native viewer's exact event loop timing model:
/// - Scroll events arrive at `scroll_interval_ms` (e.g., 8ms for 120Hz trackpad)
/// - A 240Hz tick thread decrements `settle_countdown` between events
/// - When countdown reaches 0 → `queue_stable()` fires (clears caches, full redraw)
/// - Real `sleep()` between events for GPU state realism
///
/// This produces frame timings that match what the user actually sees in the
/// native viewer, including settle-induced frame drops at their natural frequency.
fn run_realtime_pan_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    scroll_interval_ms: f64,
    dx: f32,
    dy: f32,
    duration_ms: f64,
    settle_ticks: u32,
) -> PassStats {
    let tick_interval_ms: f64 = 1000.0 / 240.0; // 240Hz tick thread
    let wall_start = Instant::now();

    let mut frame_times = Vec::new();
    let mut queue_us_acc = Vec::new();
    let mut draw_us_acc = Vec::new();
    let mut mid_flush_us_acc = Vec::new();
    let mut compositor_us_acc = Vec::new();
    let mut flush_us_acc = Vec::new();
    let mut settle_times = Vec::new();

    let mut clock: f64 = 0.0;
    let mut next_scroll = scroll_interval_ms;
    let mut next_tick = tick_interval_ms;
    let mut settle_countdown: u32 = 0;

    while clock < duration_ms {
        // Find next event
        let next_event = next_scroll.min(next_tick).min(duration_ms);
        let sleep_ms = next_event - clock;

        // Real sleep for GPU state realism
        if sleep_ms > 0.5 {
            std::thread::sleep(std::time::Duration::from_micros((sleep_ms * 1000.0) as u64));
        }
        clock = next_event;

        // Process tick events that fired
        if clock >= next_tick {
            if settle_countdown > 0 {
                settle_countdown -= 1;
                if settle_countdown == 0 {
                    // Settle fires — this is the expensive frame
                    if let Some((total, q, d, mf, c, f)) =
                        measure_frame(renderer, true, overlay.as_mut())
                    {
                        settle_times.push(total);
                        frame_times.push(total);
                        queue_us_acc.push(q);
                        draw_us_acc.push(d);
                        mid_flush_us_acc.push(mf);
                        compositor_us_acc.push(c);
                        flush_us_acc.push(f);
                    }
                }
            }
            next_tick += tick_interval_ms;
        }

        // Process scroll event
        if clock >= next_scroll && clock < duration_ms {
            renderer.camera.translate(dx, dy);
            settle_countdown = settle_ticks; // Reset countdown on every scroll

            if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut())
            {
                frame_times.push(total);
                queue_us_acc.push(q);
                draw_us_acc.push(d);
                mid_flush_us_acc.push(mf);
                compositor_us_acc.push(c);
                flush_us_acc.push(f);
            }
            next_scroll += scroll_interval_ms;
        }
    }

    let wall = wall_start.elapsed();
    let avg_settle = if settle_times.is_empty() {
        0
    } else {
        settle_times.iter().sum::<u64>() / settle_times.len() as u64
    };

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        avg_settle,
    )
}

/// Real-time FrameLoop pan pass.
///
/// Reproduces **exactly** what happens in `Application::frame()` during
/// panning — same FrameLoop, same apply_changes/build_plan/flush_with_plan
/// path, same GPU backend, with real `thread::sleep()` between ticks so
/// the GPU pipeline sees realistic idle gaps.
///
/// This is the only benchmark that captures the actual user-facing
/// bottleneck: stable frames interrupting pan interactions.
///
/// # How it works
///
/// Runs a 60fps RAF loop (real 16ms sleeps). Scroll events inject camera
/// translations at `scroll_interval_ms` intervals. `FrameLoop` decides
/// whether each tick produces a frame and at what quality. The output
/// is the same `PassStats` as other passes, but the frame time
/// distribution reflects the real interaction — including jank spikes
/// from stable frames.
fn run_frameloop_pan_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    scroll_interval_ms: f64,
    dx: f32,
    duration_ms: f64,
) -> PassStats {
    let raf_interval_us: u64 = 16_000; // 60fps host cadence
    let t_origin = Instant::now();

    let mut frame_loop = FrameLoop::new();

    let mut frame_times = Vec::new();
    let mut queue_us_acc = Vec::new();
    let mut draw_us_acc = Vec::new();
    let mut mid_flush_us_acc = Vec::new();
    let mut compositor_us_acc = Vec::new();
    let mut flush_us_acc = Vec::new();
    let mut stable_count = 0u32;
    let mut unstable_count = 0u32;

    let mut next_scroll_ms = 0.0f64;
    let mut scroll_events_fired = 0u32;
    let mut pan_direction = 1.0f32;

    loop {
        // Real wall time since start → this is what FrameLoop sees.
        let now_ms = t_origin.elapsed().as_secs_f64() * 1000.0;
        if now_ms >= duration_ms {
            break;
        }

        // --- Inject scroll event if due ---
        if now_ms >= next_scroll_ms {
            let zoom = renderer.camera.get_zoom();
            renderer.camera.translate(dx * pan_direction / zoom, 0.0);
            frame_loop.invalidate(now_ms);
            next_scroll_ms += scroll_interval_ms;
            scroll_events_fired += 1;

            if scroll_events_fired.is_multiple_of(25) {
                pan_direction = -pan_direction;
            }
        }

        // --- Application::frame() equivalent ---
        // Steps 4-8 from Application::frame(), using real wall time.
        if let Some(quality) = frame_loop.poll(now_ms) {
            // Step 5: camera change + stable promotion
            let camera_change = renderer.camera.change_kind();
            let stable = quality == FrameQuality::Stable || !camera_change.any_changed();

            // Step: apply_changes (central invalidation dispatch)
            renderer.apply_changes(camera_change, stable);

            // Step: warm camera cache
            renderer.camera.warm_cache();

            // Step: build frame plan
            let rect = renderer.camera.rect();
            let zoom = renderer.camera.get_zoom();
            let plan = renderer.build_frame_plan(rect, zoom, stable, camera_change);

            // Step: consume camera change
            renderer.camera.consume_change();

            // Step: flush (draw + GPU submit) — MEASURED
            let t0 = Instant::now();
            let stats_opt = renderer.flush_with_plan(plan);
            let wall_time = t0.elapsed().as_micros() as u64;

            // Step: complete frame
            frame_loop.complete(quality);

            if quality == FrameQuality::Stable {
                stable_count += 1;
            } else {
                unstable_count += 1;
            }

            if let Some(stats) = stats_opt {
                frame_times.push(wall_time);
                queue_us_acc.push(0);
                draw_us_acc.push(stats.draw.painter_duration.as_micros() as u64);
                mid_flush_us_acc.push(stats.mid_flush_duration.as_micros() as u64);
                compositor_us_acc.push(stats.compositor_duration.as_micros() as u64);
                flush_us_acc.push(stats.flush_duration.as_micros() as u64);
            }
        }

        // --- Real sleep to next RAF tick ---
        let elapsed_us = t_origin.elapsed().as_micros() as u64;
        let next_tick_us = (elapsed_us / raf_interval_us + 1) * raf_interval_us;
        let sleep_us = next_tick_us.saturating_sub(t_origin.elapsed().as_micros() as u64);
        if sleep_us > 500 {
            std::thread::sleep(std::time::Duration::from_micros(sleep_us));
        }
    }

    let wall = t_origin.elapsed();

    eprintln!(
        "    [frameloop] scroll every {scroll_interval_ms:.0}ms | \
         {scroll_events_fired} events | \
         {} frames ({unstable_count} unstable, {stable_count} stable) | \
         wall: {:.0}ms",
        frame_times.len(),
        wall.as_millis(),
    );

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        0, // settle is implicit — stable frames are in frame_times
    )
}

/// Diagnostic: realtime event loop with per-frame printing.
#[allow(dead_code)]
fn run_realtime_diagnostic(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    scroll_interval_ms: f64,
    dx: f32,
    dy: f32,
    duration_ms: f64,
    settle_ticks: u32,
) {
    let tick_interval_ms: f64 = 1000.0 / 240.0;
    eprintln!(
        "\n=== REALTIME DIAGNOSTIC: scroll every {scroll_interval_ms:.0}ms, settle after {settle_ticks} ticks ===",
    );
    eprintln!(
        "{:>8} {:>6} {:>8} {:>8} {:>8}",
        "time_ms", "event", "total_us", "draw_us", "note"
    );

    let mut clock: f64 = 0.0;
    let mut next_scroll = scroll_interval_ms;
    let mut next_tick = tick_interval_ms;
    let mut settle_countdown: u32 = 0;

    while clock < duration_ms {
        let next_event = next_scroll.min(next_tick).min(duration_ms);
        let sleep_ms = next_event - clock;
        if sleep_ms > 0.5 {
            std::thread::sleep(std::time::Duration::from_micros((sleep_ms * 1000.0) as u64));
        }
        clock = next_event;

        if clock >= next_tick {
            if settle_countdown > 0 {
                settle_countdown -= 1;
                if settle_countdown == 0 {
                    if let Some((total, _q, d, _mf, _c, _f)) =
                        measure_frame(renderer, true, overlay.as_mut())
                    {
                        let marker = if total > 1000 { " <<<" } else { "" };
                        eprintln!(
                            "{:>8.1} {:>6} {:>8} {:>8} settle{marker}",
                            clock, "SETTLE", total, d
                        );
                    }
                }
            }
            next_tick += tick_interval_ms;
        }

        if clock >= next_scroll && clock < duration_ms {
            renderer.camera.translate(dx, dy);
            settle_countdown = settle_ticks;
            if let Some((total, _q, d, _mf, _c, _f)) =
                measure_frame(renderer, false, overlay.as_mut())
            {
                let note = if d > 0 { "full draw" } else { "cache hit" };
                let marker = if total > 1000 { " <<<" } else { "" };
                eprintln!(
                    "{:>8.1} {:>6} {:>8} {:>8} {note}{marker}",
                    clock, "scroll", total, d
                );
            }
            next_scroll += scroll_interval_ms;
        }
    }
    eprintln!();
}

fn run_pan_with_settle_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    frames: u32,
    dx: f32,
    settle_interval: u32,
) -> PassStats {
    let wall_start = Instant::now();
    let mut frame_times =
        Vec::with_capacity(frames as usize + frames as usize / settle_interval as usize);
    let mut queue_us_acc = Vec::new();
    let mut draw_us_acc = Vec::new();
    let mut mid_flush_us_acc = Vec::new();
    let mut compositor_us_acc = Vec::new();
    let mut flush_us_acc = Vec::new();
    let mut settle_times = Vec::new();

    let half = frames / 2;
    let mut since_settle = 0u32;

    for i in 0..frames {
        let d = if i < half { dx } else { -dx };
        renderer.camera.translate(d, 0.0);

        // Interaction frame (unstable)
        if let Some((total, q, dr, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut()) {
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(dr);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
        }

        since_settle += 1;

        // Insert settle frame at interval (simulates native viewer countdown)
        if since_settle >= settle_interval && i < frames - 1 {
            since_settle = 0;
            if let Some((total, q, dr, mf, c, f)) = measure_frame(renderer, true, overlay.as_mut())
            {
                settle_times.push(total);
                // Include in overall stats — this IS a real frame the user sees
                frame_times.push(total);
                queue_us_acc.push(q);
                draw_us_acc.push(dr);
                mid_flush_us_acc.push(mf);
                compositor_us_acc.push(c);
                flush_us_acc.push(f);
            }
        }
    }

    let wall = wall_start.elapsed();
    let avg_settle = if settle_times.is_empty() {
        0
    } else {
        settle_times.iter().sum::<u64>() / settle_times.len() as u64
    };

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        avg_settle,
    )
}

/// Run a zoom pass that interleaves settle (stable) frames at a fixed interval,
/// simulating what happens in real usage: zoom → pause → settle fires → zoom again.
///
/// This is the zoom equivalent of `run_pan_with_settle_pass`. It captures:
/// - The expensive stable frame cost (full-quality redraw + cache invalidation)
/// - The cache-cold first frame after settle (zoom cache was nuked)
/// - The overall frame time distribution including settle spikes
///
/// `settle_interval` = number of zoom frames between each settle frame.
/// settle_interval=12 matches the native viewer's 12-tick countdown at 240Hz (~50ms).
fn run_zoom_with_settle_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    frames: u32,
    step: f32,
    z_min: f32,
    z_max: f32,
    settle_interval: u32,
) -> PassStats {
    let start_z = (z_min + z_max) / 2.0;
    renderer.camera.set_zoom(start_z);
    renderer.queue_stable();
    let _ = renderer.flush();

    let wall_start = Instant::now();
    let mut frame_times =
        Vec::with_capacity(frames as usize + frames as usize / settle_interval as usize);
    let mut queue_us_acc = Vec::new();
    let mut draw_us_acc = Vec::new();
    let mut mid_flush_us_acc = Vec::new();
    let mut compositor_us_acc = Vec::new();
    let mut flush_us_acc = Vec::new();
    let mut settle_times = Vec::new();

    let mut z = start_z;
    let mut zdir: i32 = 1;
    let mut since_settle = 0u32;

    for i in 0..frames {
        let next_z = z + zdir as f32 * step;
        if next_z > z_max {
            zdir = -1;
            z = z_max;
        } else if next_z < z_min {
            zdir = 1;
            z = z_min;
        } else {
            z = next_z;
        }
        renderer.camera.set_zoom(z);

        // Interaction frame (unstable)
        if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, false, overlay.as_mut()) {
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(d);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
        }

        since_settle += 1;

        // Insert settle frame at interval (simulates native viewer countdown)
        if since_settle >= settle_interval && i < frames - 1 {
            since_settle = 0;
            if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, true, overlay.as_mut()) {
                settle_times.push(total);
                // Include in overall stats — this IS a real frame the user sees
                frame_times.push(total);
                queue_us_acc.push(q);
                draw_us_acc.push(d);
                mid_flush_us_acc.push(mf);
                compositor_us_acc.push(c);
                flush_us_acc.push(f);
            }
        }
    }

    let wall = wall_start.elapsed();
    let avg_settle = if settle_times.is_empty() {
        0
    } else {
        settle_times.iter().sum::<u64>() / settle_times.len() as u64
    };

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        avg_settle,
    )
}

/// Real-time FrameLoop zoom pass.
///
/// Reproduces **exactly** what happens in `Application::frame()` during
/// zooming — same FrameLoop, same apply_changes/build_plan/flush_with_plan
/// path, same GPU backend, with real `thread::sleep()` between ticks so
/// the GPU pipeline sees realistic idle gaps.
///
/// This is the zoom equivalent of `run_frameloop_pan_pass`. It captures
/// the actual user-facing bottleneck: stable frames interrupting zoom
/// interactions. The zoom cache blit fast path, compositor re-rasterization,
/// and GPU flush stalls are all exercised on the real GPU backend.
///
/// # How it works
///
/// Runs a 60fps RAF loop (real 16ms sleeps). Zoom events inject camera
/// zoom changes at `event_interval_ms` intervals. `FrameLoop` decides
/// whether each tick produces a frame and at what quality. Stable frames
/// nuke the zoom image cache, forcing the next unstable frame into a full
/// draw — this is the spike users feel as "3 FPS during zoom".
fn run_frameloop_zoom_pass(
    renderer: &mut cg::runtime::scene::Renderer,
    event_interval_ms: f64,
    step: f32,
    z_min: f32,
    z_max: f32,
    duration_ms: f64,
) -> PassStats {
    let raf_interval_us: u64 = 16_000; // 60fps host cadence
    let t_origin = Instant::now();

    let mut frame_loop = FrameLoop::new();

    let mut frame_times = Vec::new();
    let mut queue_us_acc = Vec::new();
    let mut draw_us_acc = Vec::new();
    let mut mid_flush_us_acc = Vec::new();
    let mut compositor_us_acc = Vec::new();
    let mut flush_us_acc = Vec::new();
    let mut stable_count = 0u32;
    let mut unstable_count = 0u32;

    let mut next_event_ms = 0.0f64;
    let mut zoom_events_fired = 0u32;
    let mut z = (z_min + z_max) / 2.0;
    let mut zdir: i32 = 1;

    loop {
        let now_ms = t_origin.elapsed().as_secs_f64() * 1000.0;
        if now_ms >= duration_ms {
            break;
        }

        // --- Inject zoom event if due ---
        if now_ms >= next_event_ms {
            let next_z = z + zdir as f32 * step;
            if next_z > z_max {
                zdir = -1;
                z = z_max;
            } else if next_z < z_min {
                zdir = 1;
                z = z_min;
            } else {
                z = next_z;
            }
            renderer.camera.set_zoom(z);
            frame_loop.invalidate(now_ms);
            next_event_ms += event_interval_ms;
            zoom_events_fired += 1;
        }

        // --- Application::frame() equivalent ---
        if let Some(quality) = frame_loop.poll(now_ms) {
            let camera_change = renderer.camera.change_kind();
            let stable = quality == FrameQuality::Stable || !camera_change.any_changed();

            // apply_changes (central invalidation dispatch)
            renderer.apply_changes(camera_change, stable);

            // warm camera cache
            renderer.camera.warm_cache();

            // build frame plan
            let rect = renderer.camera.rect();
            let zoom = renderer.camera.get_zoom();
            let plan = renderer.build_frame_plan(rect, zoom, stable, camera_change);

            // consume camera change
            renderer.camera.consume_change();

            // flush (draw + GPU submit) — MEASURED
            let t0 = Instant::now();
            let stats_opt = renderer.flush_with_plan(plan);
            let wall_time = t0.elapsed().as_micros() as u64;

            // complete frame
            frame_loop.complete(quality);

            if quality == FrameQuality::Stable {
                stable_count += 1;
            } else {
                unstable_count += 1;
            }

            if let Some(stats) = stats_opt {
                frame_times.push(wall_time);
                queue_us_acc.push(0);
                draw_us_acc.push(stats.draw.painter_duration.as_micros() as u64);
                mid_flush_us_acc.push(stats.mid_flush_duration.as_micros() as u64);
                compositor_us_acc.push(stats.compositor_duration.as_micros() as u64);
                flush_us_acc.push(stats.flush_duration.as_micros() as u64);
            }
        }

        // --- Real sleep to next RAF tick ---
        let elapsed_us = t_origin.elapsed().as_micros() as u64;
        let next_tick_us = (elapsed_us / raf_interval_us + 1) * raf_interval_us;
        let sleep_us = next_tick_us.saturating_sub(t_origin.elapsed().as_micros() as u64);
        if sleep_us > 500 {
            std::thread::sleep(std::time::Duration::from_micros(sleep_us));
        }
    }

    let wall = t_origin.elapsed();

    eprintln!(
        "    [frameloop-zoom] events every {event_interval_ms:.0}ms | \
         {zoom_events_fired} events | \
         {} frames ({unstable_count} unstable, {stable_count} stable) | \
         wall: {:.0}ms",
        frame_times.len(),
        wall.as_millis(),
    );

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        0, // settle is implicit — stable frames are in frame_times
    )
}

/// Run a zoom pass where EVERY frame is forced stable (stable=true).
///
/// This reproduces the bug in `Application::redraw()` which passes
/// `apply_changes(camera_change, true)` on every frame — even during
/// active zoom interaction. The result:
/// - Zoom image cache blit fast path is never used (gated on `!plan.stable`)
/// - Zoom cache is nuked every frame (`invalidate_zoom` fires when stable + camera changed)
/// - Every frame does a full draw (R-tree query + sort + paint all nodes)
///
/// Compare against `run_zoom_pass_at` (which uses stable=false) to see the
/// performance impact of the bug.
fn run_zoom_pass_forced_stable(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    step: f32,
    z_min: f32,
    z_max: f32,
    mut overlay: Option<OverlayBenchState>,
) -> PassStats {
    let start_z = (z_min + z_max) / 2.0;
    renderer.camera.set_zoom(start_z);
    renderer.queue_stable();
    let _ = renderer.flush();

    let wall_start = Instant::now();
    let mut frame_times = Vec::with_capacity(frames as usize);
    let mut queue_us_acc = Vec::with_capacity(frames as usize);
    let mut draw_us_acc = Vec::with_capacity(frames as usize);
    let mut mid_flush_us_acc = Vec::with_capacity(frames as usize);
    let mut compositor_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);
    let mut z = start_z;
    let mut zdir: i32 = 1;

    for _ in 0..frames {
        let next_z = z + zdir as f32 * step;
        if next_z > z_max {
            zdir = -1;
            z = z_max;
        } else if next_z < z_min {
            zdir = 1;
            z = z_min;
        } else {
            z = next_z;
        }
        renderer.camera.set_zoom(z);
        // No-cache baseline: always pass stable=true (forces full draw every frame)
        if let Some((total, q, d, mf, c, f)) = measure_frame(renderer, true, overlay.as_mut()) {
            frame_times.push(total);
            queue_us_acc.push(q);
            draw_us_acc.push(d);
            mid_flush_us_acc.push(mf);
            compositor_us_acc.push(c);
            flush_us_acc.push(f);
        }
    }
    let wall = wall_start.elapsed();

    compute_pass_stats(
        &frame_times,
        &queue_us_acc,
        &draw_us_acc,
        &mid_flush_us_acc,
        &compositor_us_acc,
        &flush_us_acc,
        wall,
        0,
    )
}

/// Diagnostic: pan with settle frames interleaved, printing per-frame timing.
/// Shows the settle cost and whether the cache recapture works (the frame
/// AFTER settle should be fast if the cache was recaptured).
#[allow(dead_code)]
fn run_pan_settle_diagnostic(
    renderer: &mut cg::runtime::scene::Renderer,
    mut overlay: Option<OverlayBenchState>,
    frames: u32,
    dx: f32,
    settle_interval: u32,
) {
    eprintln!("\n=== PAN+SETTLE DIAGNOSTIC: dx={dx}, settle every {settle_interval} frames ===");
    eprintln!(
        "{:>5} {:>4} {:>8} {:>8} {:>8} {:>8}",
        "frame", "type", "total_us", "queue_us", "draw_us", "list"
    );

    let mut since_settle = 0u32;
    for i in 0..frames {
        renderer.camera.translate(dx, 0.0);

        if let Some((total, q, d, _mf, _c, _f)) = measure_frame(renderer, false, overlay.as_mut()) {
            let list = 0; // Not available from measure_frame
            let marker = if total > 1000 { " <<<" } else { "" };
            eprintln!(
                "{:>5} {:>4} {:>8} {:>8} {:>8} {:>8}{marker}",
                i, "pan", total, q, d, list
            );
        }

        since_settle += 1;
        if since_settle >= settle_interval && i < frames - 1 {
            since_settle = 0;
            if let Some((total, q, d, _mf, _c, _f)) =
                measure_frame(renderer, true, overlay.as_mut())
            {
                let marker = if total > 1000 { " <<<" } else { "" };
                eprintln!(
                    "{:>5} {:>4} {:>8} {:>8} {:>8} {:>8}{marker}",
                    i, "STTL", total, q, d, 0
                );
            }
        }
    }
    eprintln!();
}

/// Diagnostic: pan in one direction at fit zoom, printing per-frame timing.
/// Shows exactly where frame drops occur during the transition from
/// "all nodes visible" to "some nodes culled".
#[allow(dead_code)]
fn run_pan_diagnostic(renderer: &mut cg::runtime::scene::Renderer, frames: u32, dx: f32) {
    eprintln!("\n=== PAN DIAGNOSTIC: dx={dx}, {} frames ===", frames);
    eprintln!(
        "{:>5} {:>8} {:>8} {:>8} {:>8} {:>8} {:>8}",
        "frame", "total_us", "queue_us", "draw_us", "mflush", "comp_us", "flush_us"
    );

    for i in 0..frames {
        renderer.camera.translate(dx, 0.0);

        let t0 = Instant::now();
        renderer.queue_unstable();
        let queue_us = t0.elapsed().as_micros() as u64;

        match renderer.flush() {
            FrameFlushResult::OK(stats) => {
                let total = t0.elapsed().as_micros() as u64;
                let draw = stats.draw.painter_duration.as_micros() as u64;
                let mf = stats.mid_flush_duration.as_micros() as u64;
                let comp = stats.compositor_duration.as_micros() as u64;
                let fl = stats.flush_duration.as_micros() as u64;
                let list_size = stats.frame.display_list_size_estimated;
                let marker = if total > 1000 { " <<<" } else { "" };
                eprintln!(
                    "{:>5} {:>8} {:>8} {:>8} {:>8} {:>8} {:>8}  list={}{marker}",
                    i, total, queue_us, draw, mf, comp, fl, list_size
                );
            }
            _ => {
                eprintln!("{:>5} SKIPPED", i);
            }
        }
    }

    // Settle
    let t = Instant::now();
    renderer.queue_stable();
    let _ = renderer.flush();
    let settle = t.elapsed().as_micros();
    eprintln!("settle: {settle} us\n");
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

struct PanScenario {
    name: &'static str,
    dx: f32,
    zoom: f32,
}

struct ZoomScenario {
    name: &'static str,
    step: f32,
    z_min: f32,
    z_max: f32,
}

/// Build the standard scenario matrix.
/// `fit_zoom` is the zoom level from `fit_camera_to_scene`.
fn standard_scenarios(fit_zoom: f32) -> (Vec<PanScenario>, Vec<ZoomScenario>) {
    // Higher zoom = zoomed in (more detail, fewer visible nodes if culled)
    let zoomed_in = (fit_zoom * 4.0).min(10.0);
    // Zoom range around fit
    let fit_lo = (fit_zoom * 0.5).max(0.01);
    let fit_hi = fit_zoom * 2.0;

    let pan_scenarios = vec![
        PanScenario {
            name: "pan_slow_fit",
            dx: 2.0,
            zoom: fit_zoom,
        },
        PanScenario {
            name: "pan_fast_fit",
            dx: 50.0,
            zoom: fit_zoom,
        },
        PanScenario {
            name: "pan_slow_zoomed",
            dx: 2.0,
            zoom: zoomed_in,
        },
        PanScenario {
            name: "pan_fast_zoomed",
            dx: 50.0,
            zoom: zoomed_in,
        },
    ];

    let zoom_scenarios = vec![
        ZoomScenario {
            name: "zoom_slow_around_fit",
            step: 0.005,
            z_min: fit_lo,
            z_max: fit_hi,
        },
        ZoomScenario {
            name: "zoom_fast_around_fit",
            step: 0.05,
            z_min: fit_lo,
            z_max: fit_hi,
        },
        ZoomScenario {
            name: "zoom_slow_high",
            step: 0.01,
            z_min: zoomed_in * 0.5,
            z_max: zoomed_in,
        },
        ZoomScenario {
            name: "zoom_fast_high",
            step: 0.1,
            z_min: zoomed_in * 0.5,
            z_max: zoomed_in,
        },
    ];

    (pan_scenarios, zoom_scenarios)
}

fn run_scenarios(
    renderer: &mut cg::runtime::scene::Renderer,
    frames: u32,
    fit_zoom: f32,
    overlay: bool,
) -> Vec<ScenarioResult> {
    let ov = || {
        if overlay {
            Some(OverlayBenchState::new())
        } else {
            None
        }
    };
    let (pan_scenarios, zoom_scenarios) = standard_scenarios(fit_zoom);
    let mut results = Vec::new();

    for ps in &pan_scenarios {
        renderer.camera.set_zoom(ps.zoom);
        // Warmup at this zoom
        renderer.queue_stable();
        let _ = renderer.flush();
        for _ in 0..5 {
            renderer.camera.translate(1.0, 0.0);
            renderer.queue_unstable();
            let _ = renderer.flush();
        }

        let stats = run_pan_pass_at(renderer, frames, ps.dx, ov());
        results.push(ScenarioResult {
            name: ps.name.to_string(),
            kind: "pan".to_string(),
            params: ScenarioParams {
                speed: Some(ps.dx),
                zoom: Some(ps.zoom),
                zoom_min: None,
                zoom_max: None,
            },
            stats,
        });
    }

    // Circle pan scenarios: realistic trackpad gesture.
    // Small radius = tight circles (edges constantly change).
    // Large radius = wide sweeping gesture (more cache misses).
    struct CirclePanScenario {
        name: &'static str,
        radius: f32,
        zoom: f32,
    }

    let zoomed_in_c = (fit_zoom * 4.0).min(10.0);
    let circle_scenarios = vec![
        CirclePanScenario {
            name: "circle_small_fit",
            radius: 200.0,
            zoom: fit_zoom,
        },
        CirclePanScenario {
            name: "circle_large_fit",
            radius: 2000.0,
            zoom: fit_zoom,
        },
        CirclePanScenario {
            name: "circle_small_zoomed",
            radius: 200.0,
            zoom: zoomed_in_c,
        },
        CirclePanScenario {
            name: "circle_large_zoomed",
            radius: 2000.0,
            zoom: zoomed_in_c,
        },
    ];

    for cs in &circle_scenarios {
        renderer.camera.set_zoom(cs.zoom);
        renderer.queue_stable();
        let _ = renderer.flush();
        // Small warmup
        for _ in 0..3 {
            renderer.camera.translate(1.0, 0.0);
            renderer.queue_unstable();
            let _ = renderer.flush();
        }

        let stats = run_circle_pan_pass(renderer, ov(), frames, cs.radius);
        results.push(ScenarioResult {
            name: cs.name.to_string(),
            kind: "circle_pan".to_string(),
            params: ScenarioParams {
                speed: Some(cs.radius),
                zoom: Some(cs.zoom),
                zoom_min: None,
                zoom_max: None,
            },
            stats,
        });
    }

    // Zigzag pan scenarios: diagonal back-and-forth like reading a document.
    // "fast" = continuous motion, no pauses.
    // "slow" = pause between each zig/zag segment (settle frames fire, cache goes cold).
    struct ZigzagScenario {
        name: &'static str,
        dx: f32,
        dy: f32,
        segment_frames: u32,
        pause_frames: u32,
        zoom: f32,
    }

    let zoomed_in_z = (fit_zoom * 4.0).min(10.0);
    let zigzag_scenarios = vec![
        // Fast zigzag: continuous diagonal sweeps, no pauses
        ZigzagScenario {
            name: "zigzag_fast_fit",
            dx: 30.0,
            dy: 5.0,
            segment_frames: 20,
            pause_frames: 0,
            zoom: fit_zoom,
        },
        ZigzagScenario {
            name: "zigzag_fast_zoomed",
            dx: 30.0,
            dy: 5.0,
            segment_frames: 20,
            pause_frames: 0,
            zoom: zoomed_in_z,
        },
        // Slow zigzag: zig, stop (settle fires), zag, stop (settle fires)
        // pause_frames=3 simulates ~3 settle frames during the "reading" pause
        ZigzagScenario {
            name: "zigzag_slow_fit",
            dx: 10.0,
            dy: 3.0,
            segment_frames: 15,
            pause_frames: 3,
            zoom: fit_zoom,
        },
        ZigzagScenario {
            name: "zigzag_slow_zoomed",
            dx: 10.0,
            dy: 3.0,
            segment_frames: 15,
            pause_frames: 3,
            zoom: zoomed_in_z,
        },
    ];

    for zz in &zigzag_scenarios {
        renderer.camera.set_zoom(zz.zoom);
        renderer.queue_stable();
        let _ = renderer.flush();
        for _ in 0..3 {
            renderer.camera.translate(1.0, 0.0);
            renderer.queue_unstable();
            let _ = renderer.flush();
        }

        let stats = run_zigzag_pan_pass(
            renderer,
            ov(),
            frames,
            zz.dx,
            zz.dy,
            zz.segment_frames,
            zz.pause_frames,
        );
        results.push(ScenarioResult {
            name: zz.name.to_string(),
            kind: "zigzag".to_string(),
            params: ScenarioParams {
                speed: Some(zz.dx),
                zoom: Some(zz.zoom),
                zoom_min: None,
                zoom_max: None,
            },
            stats,
        });
    }

    for zs in &zoom_scenarios {
        let stats = run_zoom_pass_at(renderer, frames, zs.step, zs.z_min, zs.z_max, ov());
        results.push(ScenarioResult {
            name: zs.name.to_string(),
            kind: "zoom".to_string(),
            params: ScenarioParams {
                speed: Some(zs.step),
                zoom: None,
                zoom_min: Some(zs.z_min),
                zoom_max: Some(zs.z_max),
            },
            stats,
        });
    }

    // Settle-interleaved pan scenarios: simulate native viewer's settle countdown.
    // settle_interval=12 matches the native viewer's 12-tick countdown at 240Hz (~50ms).
    struct SettlePanScenario {
        name: &'static str,
        dx: f32,
        zoom: f32,
        settle_interval: u32,
    }

    let zoomed_in_s = (fit_zoom * 4.0).min(10.0);
    let settle_scenarios = vec![
        SettlePanScenario {
            name: "pan_settle_slow_fit",
            dx: 2.0,
            zoom: fit_zoom,
            settle_interval: 12,
        },
        SettlePanScenario {
            name: "pan_settle_fast_fit",
            dx: 50.0,
            zoom: fit_zoom,
            settle_interval: 12,
        },
        SettlePanScenario {
            name: "pan_settle_slow_zoomed",
            dx: 2.0,
            zoom: zoomed_in_s,
            settle_interval: 12,
        },
        SettlePanScenario {
            name: "pan_settle_fast_zoomed",
            dx: 50.0,
            zoom: zoomed_in_s,
            settle_interval: 12,
        },
    ];

    for ss in &settle_scenarios {
        renderer.camera.set_zoom(ss.zoom);
        renderer.queue_stable();
        let _ = renderer.flush();
        for _ in 0..5 {
            renderer.camera.translate(1.0, 0.0);
            renderer.queue_unstable();
            let _ = renderer.flush();
        }

        let stats = run_pan_with_settle_pass(renderer, ov(), frames, ss.dx, ss.settle_interval);
        results.push(ScenarioResult {
            name: ss.name.to_string(),
            kind: "pan_with_settle".to_string(),
            params: ScenarioParams {
                speed: Some(ss.dx),
                zoom: Some(ss.zoom),
                zoom_min: None,
                zoom_max: None,
            },
            stats,
        });
    }

    // Forced-stable zoom scenarios: reproduce the redraw() bug where every frame
    // passes stable=true, defeating the zoom cache blit fast path.
    // Compare these against the regular zoom_* scenarios to see the impact.
    struct ForcedStableZoomScenario {
        name: &'static str,
        step: f32,
        z_min: f32,
        z_max: f32,
    }

    let fs_lo = (fit_zoom * 0.5).max(0.01);
    let fs_hi = fit_zoom * 2.0;
    let fs_zoomed_in = (fit_zoom * 4.0).min(10.0);

    let forced_stable_scenarios = vec![
        ForcedStableZoomScenario {
            name: "baseline_nocache_zoom_slow_fit",
            step: 0.005,
            z_min: fs_lo,
            z_max: fs_hi,
        },
        ForcedStableZoomScenario {
            name: "baseline_nocache_zoom_fast_fit",
            step: 0.05,
            z_min: fs_lo,
            z_max: fs_hi,
        },
        ForcedStableZoomScenario {
            name: "baseline_nocache_zoom_slow_high",
            step: 0.01,
            z_min: fs_zoomed_in * 0.5,
            z_max: fs_zoomed_in,
        },
        ForcedStableZoomScenario {
            name: "baseline_nocache_zoom_fast_high",
            step: 0.1,
            z_min: fs_zoomed_in * 0.5,
            z_max: fs_zoomed_in,
        },
    ];

    for fss in &forced_stable_scenarios {
        renderer.camera.set_zoom((fss.z_min + fss.z_max) / 2.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let stats =
            run_zoom_pass_forced_stable(renderer, frames, fss.step, fss.z_min, fss.z_max, ov());
        results.push(ScenarioResult {
            name: fss.name.to_string(),
            kind: "baseline_nocache_zoom".to_string(),
            params: ScenarioParams {
                speed: Some(fss.step),
                zoom: None,
                zoom_min: Some(fss.z_min),
                zoom_max: Some(fss.z_max),
            },
            stats,
        });
    }

    // Settle-interleaved zoom scenarios: simulate native viewer's settle countdown
    // during zoom interactions. This is the zoom equivalent of the pan settle
    // scenarios — the key missing piece that captures the real UX bottleneck.
    //
    // settle_interval=12 matches the native viewer's 12-tick countdown at 240Hz (~50ms).
    let szs_zoomed_in = (fit_zoom * 4.0).min(10.0);
    let szs_lo = (fit_zoom * 0.5).max(0.01);
    let szs_hi = fit_zoom * 2.0;

    struct SettleZoomScenario {
        name: &'static str,
        step: f32,
        z_min: f32,
        z_max: f32,
        settle_interval: u32,
    }

    let settle_zoom_scenarios = vec![
        SettleZoomScenario {
            name: "zoom_settle_slow_fit",
            step: 0.005,
            z_min: szs_lo,
            z_max: szs_hi,
            settle_interval: 12,
        },
        SettleZoomScenario {
            name: "zoom_settle_fast_fit",
            step: 0.05,
            z_min: szs_lo,
            z_max: szs_hi,
            settle_interval: 12,
        },
        SettleZoomScenario {
            name: "zoom_settle_slow_high",
            step: 0.01,
            z_min: szs_zoomed_in * 0.5,
            z_max: szs_zoomed_in,
            settle_interval: 12,
        },
        SettleZoomScenario {
            name: "zoom_settle_fast_high",
            step: 0.1,
            z_min: szs_zoomed_in * 0.5,
            z_max: szs_zoomed_in,
            settle_interval: 12,
        },
    ];

    for szs in &settle_zoom_scenarios {
        renderer.camera.set_zoom((szs.z_min + szs.z_max) / 2.0);
        renderer.queue_stable();
        let _ = renderer.flush();
        for _ in 0..5 {
            renderer.camera.translate(1.0, 0.0);
            renderer.queue_unstable();
            let _ = renderer.flush();
        }

        let stats = run_zoom_with_settle_pass(
            renderer,
            ov(),
            frames,
            szs.step,
            szs.z_min,
            szs.z_max,
            szs.settle_interval,
        );
        results.push(ScenarioResult {
            name: szs.name.to_string(),
            kind: "zoom_with_settle".to_string(),
            params: ScenarioParams {
                speed: Some(szs.step),
                zoom: None,
                zoom_min: Some(szs.z_min),
                zoom_max: Some(szs.z_max),
            },
            stats,
        });
    }

    // Realtime event loop simulation scenarios.
    // These use real sleep() and simulate the native viewer's 240Hz tick
    // thread + settle countdown, producing timings that match actual UX.
    struct RealtimeScenario {
        name: &'static str,
        scroll_interval_ms: f64,
        dx: f32,
        dy: f32,
        zoom: f32,
        duration_ms: f64,
    }

    let zoomed_in_rt = (fit_zoom * 4.0).min(10.0);
    let realtime_scenarios = vec![
        RealtimeScenario {
            name: "rt_pan_fast_fit",
            scroll_interval_ms: 8.0,
            dx: 2.0,
            dy: 0.0,
            zoom: fit_zoom,
            duration_ms: 2000.0,
        },
        RealtimeScenario {
            name: "rt_pan_slow_fit",
            scroll_interval_ms: 100.0,
            dx: 5.0,
            dy: 0.0,
            zoom: fit_zoom,
            duration_ms: 2000.0,
        },
        RealtimeScenario {
            name: "rt_pan_fast_zoomed",
            scroll_interval_ms: 8.0,
            dx: 2.0,
            dy: 0.0,
            zoom: zoomed_in_rt,
            duration_ms: 2000.0,
        },
        RealtimeScenario {
            name: "rt_pan_slow_zoomed",
            scroll_interval_ms: 100.0,
            dx: 5.0,
            dy: 0.0,
            zoom: zoomed_in_rt,
            duration_ms: 2000.0,
        },
    ];

    for rt in &realtime_scenarios {
        renderer.camera.set_zoom(rt.zoom);
        renderer.queue_stable();
        let _ = renderer.flush();
        warmup(renderer);

        let stats = run_realtime_pan_pass(
            renderer,
            ov(),
            rt.scroll_interval_ms,
            rt.dx,
            rt.dy,
            rt.duration_ms,
            12,
        );
        results.push(ScenarioResult {
            name: rt.name.to_string(),
            kind: "realtime".to_string(),
            params: ScenarioParams {
                speed: Some(rt.dx),
                zoom: Some(rt.zoom),
                zoom_min: None,
                zoom_max: None,
            },
            stats,
        });
    }

    // FrameLoop-based pan scenarios: the real FrameLoop decision path.
    // Unlike all other scenarios, these go through FrameLoop.poll() which
    // decides Stable vs Unstable based on adaptive delay. This captures:
    // - Pan image cache hit rate (GPU-only: unstable pan = cache blit)
    // - Stable frame intrusion frequency (adaptive delay prevents these)
    // - Compositor budget impact on stable frame cost
    struct FrameLoopScenario {
        name: &'static str,
        scroll_interval_ms: f64,
        dx: f32,
        zoom: f32,
    }

    // Sweep across a range of scroll intervals to find the jank threshold.
    // Real trackpad scroll events range from ~8ms (fast flick) to ~200ms+
    // (very slow, deliberate single-finger scroll).
    let frameloop_scenarios = vec![
        // Continuous fast pan — baseline, no stable frames should fire
        FrameLoopScenario {
            name: "fl_16ms",
            scroll_interval_ms: 16.0,
            dx: 5.0,
            zoom: fit_zoom,
        },
        // Moderate pan — gaps start approaching old 50ms debounce
        FrameLoopScenario {
            name: "fl_50ms",
            scroll_interval_ms: 50.0,
            dx: 3.0,
            zoom: fit_zoom,
        },
        // Slow pan — exceeds old 50ms debounce, adaptive should extend
        FrameLoopScenario {
            name: "fl_80ms",
            scroll_interval_ms: 80.0,
            dx: 3.0,
            zoom: fit_zoom,
        },
        // Slower — common slow trackpad scroll speed
        FrameLoopScenario {
            name: "fl_120ms",
            scroll_interval_ms: 120.0,
            dx: 2.0,
            zoom: fit_zoom,
        },
        // Very slow — deliberate, careful scrolling
        FrameLoopScenario {
            name: "fl_200ms",
            scroll_interval_ms: 200.0,
            dx: 1.0,
            zoom: fit_zoom,
        },
        // Ultra slow — near the edge of "interaction session" detection
        FrameLoopScenario {
            name: "fl_300ms",
            scroll_interval_ms: 300.0,
            dx: 1.0,
            zoom: fit_zoom,
        },
        // Discrete clicks — clearly separate events, stable should fire between
        FrameLoopScenario {
            name: "fl_500ms",
            scroll_interval_ms: 500.0,
            dx: 1.0,
            zoom: fit_zoom,
        },
    ];

    for fl_s in &frameloop_scenarios {
        renderer.camera.set_zoom(fl_s.zoom);
        renderer.queue_stable();
        let _ = renderer.flush();
        warmup(renderer);

        let stats = run_frameloop_pan_pass(
            renderer,
            fl_s.scroll_interval_ms,
            fl_s.dx,
            2000.0, // 2 second session
        );
        results.push(ScenarioResult {
            name: fl_s.name.to_string(),
            kind: "frameloop".to_string(),
            params: ScenarioParams {
                speed: Some(fl_s.dx),
                zoom: Some(fl_s.zoom),
                zoom_min: None,
                zoom_max: None,
            },
            stats,
        });
    }

    // FrameLoop-based zoom scenarios: the real FrameLoop decision path for zoom.
    // Unlike the plain zoom scenarios, these go through FrameLoop.poll() which
    // decides Stable vs Unstable based on adaptive delay. This captures:
    // - Zoom image cache hit rate (GPU-only: unstable zoom = cache blit)
    // - Stable frame intrusion frequency (the settle frame that nukes zoom cache)
    // - Cache-cold first frame cost after settle (the "3 FPS" spike)
    // - Compositor re-rasterization budget impact
    let flz_lo = (fit_zoom * 0.5).max(0.01);
    let flz_hi = fit_zoom * 2.0;

    struct FrameLoopZoomScenario {
        name: &'static str,
        event_interval_ms: f64,
        step: f32,
        z_min: f32,
        z_max: f32,
    }

    let frameloop_zoom_scenarios = vec![
        // Continuous fast pinch — baseline, no stable frames should fire
        FrameLoopZoomScenario {
            name: "flz_16ms",
            event_interval_ms: 16.0,
            step: 0.01,
            z_min: flz_lo,
            z_max: flz_hi,
        },
        // Moderate pinch — gaps start approaching old 50ms debounce
        FrameLoopZoomScenario {
            name: "flz_50ms",
            event_interval_ms: 50.0,
            step: 0.02,
            z_min: flz_lo,
            z_max: flz_hi,
        },
        // Slow pinch — exceeds old 50ms debounce, adaptive should extend
        FrameLoopZoomScenario {
            name: "flz_80ms",
            event_interval_ms: 80.0,
            step: 0.02,
            z_min: flz_lo,
            z_max: flz_hi,
        },
        // Slower — common slow trackpad pinch speed
        FrameLoopZoomScenario {
            name: "flz_120ms",
            event_interval_ms: 120.0,
            step: 0.03,
            z_min: flz_lo,
            z_max: flz_hi,
        },
        // Very slow — deliberate, careful zooming
        FrameLoopZoomScenario {
            name: "flz_200ms",
            event_interval_ms: 200.0,
            step: 0.05,
            z_min: flz_lo,
            z_max: flz_hi,
        },
        // Discrete scroll-wheel clicks — clearly separate events, stable fires between
        FrameLoopZoomScenario {
            name: "flz_500ms",
            event_interval_ms: 500.0,
            step: 0.1,
            z_min: flz_lo,
            z_max: flz_hi,
        },
    ];

    for flz in &frameloop_zoom_scenarios {
        renderer.camera.set_zoom((flz.z_min + flz.z_max) / 2.0);
        renderer.queue_stable();
        let _ = renderer.flush();
        warmup(renderer);

        let stats = run_frameloop_zoom_pass(
            renderer,
            flz.event_interval_ms,
            flz.step,
            flz.z_min,
            flz.z_max,
            2000.0, // 2 second session
        );
        results.push(ScenarioResult {
            name: flz.name.to_string(),
            kind: "frameloop_zoom".to_string(),
            params: ScenarioParams {
                speed: Some(flz.step),
                zoom: None,
                zoom_min: Some(flz.z_min),
                zoom_max: Some(flz.z_max),
            },
            stats,
        });
    }

    results
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

fn collect_grida_files(path: &Path) -> Vec<PathBuf> {
    if path.is_file() {
        return vec![path.to_path_buf()];
    }
    let mut files = Vec::new();
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.extension().map(|e| e == "grida").unwrap_or(false) {
                out.push(p);
            }
        }
    }
    walk(path, &mut files);
    files.sort();
    files
}

fn build_benchmark_scene(grid: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let grid = grid.max(1);
    let size = 18.0f32;
    let spacing = 6.0f32;

    for y in 0..grid {
        for x in 0..grid {
            let mut rect = nf.create_rectangle_node();
            rect.transform = AffineTransform::new(
                40.0 + x as f32 * (size + spacing),
                40.0 + y as f32 * (size + spacing),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.fills = Paints::new([Paint::Solid(SolidPaint {
                color: CGColor::from_rgb(((x * 11) % 255) as u8, ((y * 7) % 255) as u8, 210),
                blend_mode: BlendMode::default(),
                active: true,
            })]);
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: format!("Benchmark {}x{}", grid, grid),
        graph,
        background_color: Some(CGColor::from_rgb(250, 250, 250)),
    }
}

// ---------------------------------------------------------------------------
// Single-scene bench (human-readable output)
// ---------------------------------------------------------------------------

pub async fn run_bench(args: BenchArgs, load_scenes: impl AsyncSceneLoader) -> Result<()> {
    let scenes = if let Some(ref path) = args.path {
        load_scenes.load(path).await?
    } else {
        vec![build_benchmark_scene(args.size)]
    };

    if args.list_scenes {
        println!("Available scenes ({}):", scenes.len());
        for (i, s) in scenes.iter().enumerate() {
            println!("  [{}] {} ({} nodes)", i, s.name, s.graph.node_count());
        }
        return Ok(());
    }

    if args.scene_index >= scenes.len() {
        return Err(anyhow!(
            "scene index {} out of range (0..{}). Use --list-scenes.",
            args.scene_index,
            scenes.len()
        ));
    }

    let scene = scenes.into_iter().nth(args.scene_index).unwrap();
    let node_count = scene.graph.node_count();

    let mut gpu =
        HeadlessGpu::new(args.width, args.height).map_err(|e| anyhow!("GPU init failed: {e}"))?;
    gpu.print_gl_info();

    let mut renderer = gpu.create_renderer();
    if args.no_aa {
        let mut policy = cg::runtime::render_policy::RenderPolicy::STANDARD;
        policy.force_no_aa = true;
        renderer.set_render_policy(policy);
    }
    renderer.set_sync_gpu(true);
    renderer.load_scene(scene);
    renderer.fit_camera_to_scene();

    let fit_zoom = renderer.camera.get_zoom();
    let cam_rect = renderer.camera.rect();
    println!("Loaded scene: {} nodes", node_count);
    println!(
        "Camera: zoom={:.4} viewport=({:.0}x{:.0})",
        fit_zoom, cam_rect.width, cam_rect.height,
    );
    println!(
        "Viewport: {}x{}, frames: {}{}",
        args.width,
        args.height,
        args.frames,
        if args.no_aa { "  [NO-AA]" } else { "" },
    );
    println!();

    warmup(&mut renderer);

    let effects_count = count_effects_nodes(&renderer);
    let comp_stats = renderer.get_cache().compositor.stats();
    println!(
        "Nodes with effects: {}  Compositor: {} promoted, {:.1} KB",
        effects_count,
        comp_stats.promoted_count,
        comp_stats.memory_bytes as f64 / 1024.0,
    );

    // --- Node-translate mutation benchmark (--translate) ---
    if let Some(ref spec) = args.translate {
        use cg::node::schema::NodeId;
        let target_id: Option<NodeId> = match spec.as_str() {
            "" | "first" => renderer.scene.as_ref().and_then(pick_translate_target),
            s => s.parse::<NodeId>().ok(),
        };
        let Some(target_id) = target_id else {
            return Err(anyhow!(
                "--translate: no valid target node (spec='{}'). Use a numeric id or 'first'.",
                spec
            ));
        };
        let target_kind = renderer
            .scene
            .as_ref()
            .and_then(|s| s.graph.get_node(&target_id).ok())
            .map(|n| format!("{:?}", std::mem::discriminant(n)))
            .unwrap_or_else(|| "?".to_string());
        println!(
            "\n=== Translate benchmark ({} frames, target id={} kind={}) ===",
            args.frames, target_id, target_kind
        );
        // Enable the invalidation log so the dev can see which branch
        // each frame takes (Full vs Transform vs Paint).
        let pass = run_translate_pass(&mut renderer, args.frames, target_id, 2.0, None);
        println!("  avg: {:>7} us ({:>6.1} fps)", pass.avg_us, pass.fps);
        println!(
            "  min: {:>7} us  p50: {:>7} us  p95: {:>7} us  p99: {:>7} us  MAX: {:>7} us",
            pass.min_us, pass.p50_us, pass.p95_us, pass.p99_us, pass.max_us
        );
        println!(
            "  queue: {} us  draw: {} us  mid_flush: {} us  compositor: {} us  flush: {} us  settle: {} us",
            pass.queue_us, pass.draw_us, pass.mid_flush_us, pass.compositor_us, pass.flush_us, pass.settle_us
        );
        drop(renderer);
        println!("\nDone.");
        return Ok(());
    }

    // --- Resize benchmark (--resize) ---
    if args.resize {
        let size_a = (args.width, args.height);
        // Second size: ~66% of the primary viewport (simulates browser resize drag)
        let size_b = (
            std::cmp::max(1, args.width * 2 / 3),
            std::cmp::max(1, args.height * 2 / 3),
        );
        println!(
            "\n=== Resize benchmark ({} frames, {}x{} <-> {}x{}) ===",
            args.frames, size_a.0, size_a.1, size_b.0, size_b.1
        );
        let r = run_resize_pass(&mut renderer, args.frames, size_a, size_b);
        println!("  wall:   {:>10.1} ms", r.wall.as_micros() as f64 / 1000.0);
        println!("  avg:    {:>10} us", r.avg_us);
        println!("  min:    {:>10} us", r.min_us);
        println!("  p50:    {:>10} us", r.p50_us);
        println!("  p95:    {:>10} us", r.p95_us);
        println!("  MAX:    {:>10} us", r.max_us);
        println!("  --- per-cycle breakdown (avg) ---");
        println!("  apply_changes:        {:>7} us", r.rebuild_us);
        println!("  (invalidate legacy):  {:>7} us", r.invalidate_us);
        println!("  flush (redraw):       {:>7} us", r.flush_us);

        drop(renderer);
        println!("\nDone.");
        return Ok(());
    }

    let ov_flag = args.overlay;
    let ov = || {
        if ov_flag {
            Some(OverlayBenchState::new())
        } else {
            None
        }
    };
    println!("Overlay: {}", if ov_flag { "ON" } else { "OFF" });

    // --- Legacy Pan ---
    println!("=== Pan benchmark ({} frames, continuous) ===", args.frames);
    let pan = run_pan_pass(&mut renderer, args.frames, ov());
    println!("  avg: {:>7} us ({:>6.1} fps)", pan.avg_us, pan.fps);
    println!(
        "  min: {:>7} us  p50: {:>7} us  p95: {:>7} us  p99: {:>7} us  MAX: {:>7} us",
        pan.min_us, pan.p50_us, pan.p95_us, pan.p99_us, pan.max_us
    );
    println!(
        "  queue: {} us  draw: {} us  mid_flush: {} us  compositor: {} us  flush: {} us  settle: {} us",
        pan.queue_us, pan.draw_us, pan.mid_flush_us, pan.compositor_us, pan.flush_us, pan.settle_us
    );

    // --- Legacy Zoom ---
    println!("\n=== Zoom benchmark ({} frames) ===", args.frames);
    let zoom = run_zoom_pass(&mut renderer, args.frames, ov());
    println!(
        "  avg: {:>7} us ({:>6.1} fps)  p50: {:>7} us  p95: {:>7} us",
        zoom.avg_us, zoom.fps, zoom.p50_us, zoom.p95_us
    );
    println!(
        "  queue: {} us  draw: {} us  mid_flush: {} us  compositor: {} us  flush: {} us  settle: {} us",
        zoom.queue_us, zoom.draw_us, zoom.mid_flush_us, zoom.compositor_us, zoom.flush_us, zoom.settle_us
    );

    // --- Expanded Scenarios ---
    println!("\n=== Expanded Scenarios ({} frames each) ===", args.frames);
    renderer.fit_camera_to_scene();
    let scenarios = run_scenarios(&mut renderer, args.frames, fit_zoom, ov_flag);
    for s in &scenarios {
        println!(
            "\n  [{:25}] ({}) {:>7} us avg ({:>6.1} fps)  min: {:>7}  p50: {:>7}  p95: {:>7}  p99: {:>7}  MAX: {:>7}",
            s.name, s.kind, s.stats.avg_us, s.stats.fps, s.stats.min_us, s.stats.p50_us, s.stats.p95_us, s.stats.p99_us, s.stats.max_us
        );
        println!(
            "    queue: {} us  draw: {} us  mid_flush: {} us  compositor: {} us  flush: {} us  settle: {} us",
            s.stats.queue_us, s.stats.draw_us, s.stats.mid_flush_us, s.stats.compositor_us, s.stats.flush_us, s.stats.settle_us
        );
    }

    drop(renderer);
    println!("\nDone.");
    Ok(())
}

// ---------------------------------------------------------------------------
// Bulk bench-report (JSON output)
// ---------------------------------------------------------------------------

pub async fn run_bench_report(
    args: BenchReportArgs,
    load_scenes: impl AsyncSceneLoader,
) -> Result<()> {
    let input_path = Path::new(&args.path);
    if !input_path.exists() {
        return Err(anyhow!("path not found: {}", args.path));
    }

    let files = collect_grida_files(input_path);
    if files.is_empty() {
        return Err(anyhow!("no .grida files found in {}", args.path));
    }

    eprintln!(
        "bench-report: {} files, {} frames/pass, {}x{} viewport",
        files.len(),
        args.frames,
        args.width,
        args.height
    );

    let mut results = Vec::new();
    let mut errors = Vec::new();

    for (fi, file_path) in files.iter().enumerate() {
        let file_str = file_path.to_string_lossy().to_string();
        eprintln!("[{}/{}] {}", fi + 1, files.len(), file_str);

        let scenes = match load_scenes.load(&file_str).await {
            Ok(s) => s,
            Err(e) => {
                errors.push(BenchError {
                    file: file_str,
                    error: format!("{e}"),
                });
                continue;
            }
        };

        for (si, scene) in scenes.into_iter().enumerate() {
            let node_count = scene.graph.node_count();
            let scene_name = scene.name.clone();
            eprintln!("  scene[{}] \"{}\" ({} nodes)", si, scene_name, node_count);

            let mut gpu = match HeadlessGpu::new(args.width, args.height) {
                Ok(g) => g,
                Err(e) => {
                    errors.push(BenchError {
                        file: file_str.clone(),
                        error: format!("GPU init failed for scene {si}: {e}"),
                    });
                    continue;
                }
            };

            let mut renderer = gpu.create_renderer();
            renderer.set_sync_gpu(true);
            renderer.load_scene(scene);
            renderer.fit_camera_to_scene();
            let fit_zoom = renderer.camera.get_zoom();

            warmup(&mut renderer);

            let effects_count = count_effects_nodes(&renderer);

            // Legacy passes (back-compat)
            let ov = || {
                if args.overlay {
                    Some(OverlayBenchState::new())
                } else {
                    None
                }
            };
            let pan = run_pan_pass(&mut renderer, args.frames, ov());
            let zoom = run_zoom_pass(&mut renderer, args.frames, ov());

            // Expanded scenario matrix
            renderer.fit_camera_to_scene();
            let scenarios = run_scenarios(&mut renderer, args.frames, fit_zoom, args.overlay);

            drop(renderer);

            results.push(SceneBenchResult {
                file: file_str.clone(),
                scene: scene_name,
                scene_index: si,
                nodes: node_count,
                effects_nodes: effects_count,
                fit_zoom,
                pan,
                zoom,
                scenarios,
            });
        }
    }

    let report = BenchReportOutput {
        meta: BenchReportMeta {
            frames: args.frames,
            viewport: [args.width, args.height],
            files_count: files.len(),
            scenes_count: results.len(),
        },
        results,
        errors,
    };

    let json = serde_json::to_string_pretty(&report)?;

    if let Some(ref out_path) = args.output {
        std::fs::write(out_path, &json)?;
        eprintln!("report written to {out_path}");
    } else {
        println!("{json}");
    }

    eprintln!("bench-report done.");
    Ok(())
}

// ---------------------------------------------------------------------------
// Scene loading trait — decouples bench module from main.rs file loading
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait AsyncSceneLoader {
    async fn load(&self, source: &str) -> Result<Vec<Scene>>;
}
