//! Benchmark: unified camera performance — pan, zoom, and pinch-zoom.
//!
//! This is the canonical benchmark for evaluating camera interaction
//! performance. Unlike `bench_pan` (which focused narrowly on panning),
//! this benchmark exercises **all** camera operations uniformly so we can
//! find the sweet spot: a configuration that makes panning fast without
//! regressing zoom.
//!
//! # Design
//!
//! Each scenario measures `queue_unstable + flush` (the full per-frame cost)
//! under a specific camera operation pattern. Scenarios are grouped by
//! **scene complexity × camera operation × renderer config**, producing a
//! matrix that makes regressions immediately visible.
//!
//! ## Camera operations
//!
//!   - **pan**: pure translation, no zoom change (`CameraChangeKind::PanOnly`)
//!   - **zoom**: pure zoom change at viewport center (`CameraChangeKind::ZoomIn`/`ZoomOut`)
//!   - **pinch_zoom**: zoom-at-cursor — changes both zoom and translation
//!     simultaneously (`CameraChangeKind::PanAndZoom`), the most common
//!     real-world zoom gesture
//!   - **pan_after_zoom**: pan frames that follow a zoom (tests cache
//!     re-warm cost after invalidation)
//!   - **rapid_zoom_steps**: many small zoom increments simulating a
//!     continuous trackpad pinch (tests repeated invalidation cost)
//!
//! ## Scenes
//!
//!   - **heavy** (500 nodes, drop shadows): realistic design-tool content
//!   - **simple** (100 nodes, fills only): isolates overhead from effects
//!   - **large** (2000 nodes, mixed effects): stress test at scale
//!
//! ## Renderer configs
//!
//!   - **baseline**: no caching, no downscale
//!   - **compositing**: layer compositing + atlas, no downscale
//!   - **downscale**: layer compositing + atlas + 0.5× interaction scale
//!
//! # Running
//!
//! ```sh
//! # Run all camera benchmarks:
//! cargo bench -p cg --bench bench_camera
//!
//! # Run only zoom-related scenarios:
//! cargo bench -p cg --bench bench_camera -- zoom
//!
//! # Run only the heavy scene:
//! cargo bench -p cg --bench bench_camera -- heavy
//!
//! # Run only pinch_zoom on heavy with compositing:
//! cargo bench -p cg --bench bench_camera -- heavy_compositing/pinch_zoom
//!
//! # Run only baseline config:
//! cargo bench -p cg --bench bench_camera -- baseline
//!
//! # Compare pan vs zoom for a specific config:
//! cargo bench -p cg --bench bench_camera -- heavy_compositing
//! ```

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

// ─── Scene builders ─────────────────────────────────────────────────

/// Heavy scene: `cols × rows` nodes with fills + drop shadows.
fn create_heavy_scene(cols: u32, rows: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let size = 40.0f32;
    let gap = 20.0f32;

    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(
                x as f32 * (size + gap),
                y as f32 * (size + gap),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.set_fill(Paint::Solid(SolidPaint {
                color: CGColor::from_rgba(((x * 13) % 255) as u8, ((y * 17) % 255) as u8, 200, 255),
                blend_mode: BlendMode::default(),
                active: true,
            }));
            rect.effects = LayerEffects::new().drop_shadow(FeShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 8.0,
                spread: 0.0,
                color: CGColor::from_rgba(0, 0, 0, 80),
                active: true,
            });
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: "Heavy Scene".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

/// Simple scene: `cols × rows` nodes with solid fills only (no effects).
fn create_simple_scene(cols: u32, rows: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let size = 20.0f32;
    let gap = 10.0f32;

    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(
                x as f32 * (size + gap),
                y as f32 * (size + gap),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.set_fill(Paint::Solid(SolidPaint {
                color: CGColor::from_rgba(((x * 7) % 255) as u8, ((y * 11) % 255) as u8, 180, 255),
                blend_mode: BlendMode::default(),
                active: true,
            }));
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: "Simple Scene".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

/// Large scene: `cols × rows` nodes with a mix of effects.
/// Even-index nodes get drop shadows, odd-index nodes get solid fills only.
/// This simulates a realistic heterogeneous design file.
fn create_large_scene(cols: u32, rows: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let size = 30.0f32;
    let gap = 15.0f32;

    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(
                x as f32 * (size + gap),
                y as f32 * (size + gap),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.set_fill(Paint::Solid(SolidPaint {
                color: CGColor::from_rgba(
                    ((x * 11 + y * 3) % 255) as u8,
                    ((y * 7 + x * 5) % 255) as u8,
                    160,
                    255,
                ),
                blend_mode: BlendMode::default(),
                active: true,
            }));

            // Every other node gets a drop shadow (heterogeneous workload)
            if (x + y) % 2 == 0 {
                rect.effects = LayerEffects::new().drop_shadow(FeShadow {
                    dx: 2.0,
                    dy: 2.0,
                    blur: 6.0,
                    spread: 0.0,
                    color: CGColor::from_rgba(0, 0, 0, 60),
                    active: true,
                });
            }

            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: "Large Scene".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

// ─── Scene descriptors ──────────────────────────────────────────────

struct SceneSpec {
    name: &'static str,
    cols: u32,
    rows: u32,
    /// World extent (cols * cell_stride)
    cell_stride: f32,
    builder: fn(u32, u32) -> Scene,
    sample_size: usize,
    measurement_secs: u64,
}

const SCENES: &[SceneSpec] = &[
    SceneSpec {
        name: "heavy",
        cols: 25,
        rows: 20,
        cell_stride: 60.0, // 40 size + 20 gap
        builder: create_heavy_scene,
        sample_size: 100,
        measurement_secs: 10,
    },
    SceneSpec {
        name: "simple",
        cols: 10,
        rows: 10,
        cell_stride: 30.0, // 20 size + 10 gap
        builder: create_simple_scene,
        sample_size: 200,
        measurement_secs: 5,
    },
    SceneSpec {
        name: "large",
        cols: 50,
        rows: 40,
        cell_stride: 45.0, // 30 size + 15 gap
        builder: create_large_scene,
        sample_size: 50,
        measurement_secs: 15,
    },
];

// ─── Renderer config profiles ───────────────────────────────────────

struct ConfigProfile {
    name: &'static str,
    layer_compositing: bool,
    compositor_atlas: bool,
    interaction_render_scale: f32,
}

const CONFIGS: &[ConfigProfile] = &[
    ConfigProfile {
        name: "baseline",
        layer_compositing: false,
        compositor_atlas: false,
        interaction_render_scale: 1.0,
    },
    ConfigProfile {
        name: "compositing",
        layer_compositing: true,
        compositor_atlas: true,
        interaction_render_scale: 1.0,
    },
    ConfigProfile {
        name: "downscale",
        layer_compositing: true,
        compositor_atlas: true,
        interaction_render_scale: 0.5,
    },
];

// ─── Renderer setup ─────────────────────────────────────────────────

const VP_W: i32 = 1000;
const VP_H: i32 = 1000;

fn setup_renderer(scene: Scene, config: &ConfigProfile) -> Renderer {
    let mut renderer = Renderer::new(
        Backend::new_from_raster(VP_W, VP_H),
        None,
        Camera2D::new(Size {
            width: VP_W as f32,
            height: VP_H as f32,
        }),
    );

    renderer.set_layer_compositing(config.layer_compositing);
    renderer.set_compositor_atlas(config.compositor_atlas);
    renderer.set_interaction_render_scale(config.interaction_render_scale);

    renderer.load_scene(scene);
    // Warm: render one stable frame so all caches are populated
    renderer.queue_stable();
    let _ = renderer.flush();
    renderer
}

// ─── Camera operation runners ───────────────────────────────────────

/// Pure pan: oscillate horizontally by `dx` each iteration.
fn run_pan(renderer: &mut Renderer, dx: &mut f32) {
    *dx = -*dx;
    renderer.camera.translate(*dx, 0.0);
    renderer.queue_unstable();
    let _ = black_box(renderer.flush());
}

/// Pure zoom: oscillate zoom between bounds, stepping by `step` each iteration.
fn run_zoom(renderer: &mut Renderer, current_zoom: &mut f32, zoom_dir: &mut i32) {
    *current_zoom += *zoom_dir as f32 * 0.02;
    if *current_zoom > 2.0 || *current_zoom < 0.5 {
        *zoom_dir = -*zoom_dir;
    }
    renderer.camera.set_zoom(*current_zoom);
    renderer.queue_unstable();
    let _ = black_box(renderer.flush());
}

/// Pinch-zoom at cursor: zoom while keeping a screen point fixed.
/// This triggers `CameraChangeKind::PanAndZoom` — the most common real gesture.
///
/// Uses a two-level alternation (zoom_a ↔ zoom_b) so that the camera
/// position exactly cancels every two iterations, preventing unbounded
/// translation drift that would push the viewport off-scene over many
/// criterion samples.
fn run_pinch_zoom(
    renderer: &mut Renderer,
    use_zoom_a: &mut bool,
    zoom_a: f32,
    zoom_b: f32,
    screen_point: [f32; 2],
) {
    let target = if *use_zoom_a { zoom_a } else { zoom_b };
    *use_zoom_a = !*use_zoom_a;
    renderer.camera.set_zoom_at(target, screen_point);
    renderer.queue_unstable();
    let _ = black_box(renderer.flush());
}

// ─── Benchmark entry point ──────────────────────────────────────────

fn bench_camera(c: &mut Criterion) {
    for scene_spec in SCENES {
        let scene_w = scene_spec.cols as f32 * scene_spec.cell_stride;
        let scene_h = scene_spec.rows as f32 * scene_spec.cell_stride;

        for config in CONFIGS {
            let group_name = format!("{}_{}", scene_spec.name, config.name);
            let mut group = c.benchmark_group(&group_name);
            group.sample_size(scene_spec.sample_size);
            group.measurement_time(std::time::Duration::from_secs(scene_spec.measurement_secs));

            // ── pan ──────────────────────────────────────────────
            group.bench_function("pan", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                renderer.camera.set_zoom(1.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut dx = 5.0f32;
                b.iter(|| run_pan(&mut renderer, &mut dx))
            });

            // ── zoom (center) ────────────────────────────────────
            group.bench_function("zoom", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                renderer.camera.set_zoom(1.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut current_zoom = 1.0f32;
                let mut zoom_dir: i32 = 1;
                b.iter(|| run_zoom(&mut renderer, &mut current_zoom, &mut zoom_dir))
            });

            // ── pinch_zoom (at off-center point) ─────────────────
            // Uses screen point (700, 300) to ensure both zoom and
            // translation change simultaneously, which is the real-world
            // pinch gesture behavior.
            //
            // Alternates between two zoom levels so that each pair of
            // iterations exactly cancels the translation shift, preventing
            // drift that would move the camera off-scene over time.
            group.bench_function("pinch_zoom", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                renderer.camera.set_zoom(1.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut use_zoom_a = true;
                let screen_point = [700.0f32, 300.0];
                b.iter(|| run_pinch_zoom(&mut renderer, &mut use_zoom_a, 1.0, 1.3, screen_point))
            });

            // ── pan_after_zoom ───────────────────────────────────
            // Measures the cost of panning right after a zoom change.
            // This captures the cache re-warm penalty: zoom invalidates
            // compositor caches, so the first pan frames after zoom
            // must rebuild them.
            //
            // NOTE: Each sample = 3 frames (1 zoom + 2 pan). Compare
            // the reported time against 1×zoom + 2×pan individually to
            // see whether the recovery penalty is additive or worse.
            group.bench_function("pan_after_zoom", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                renderer.camera.set_zoom(1.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut dx = 5.0f32;
                let mut current_zoom = 1.0f32;
                let mut zoom_dir: i32 = 1;
                b.iter(|| {
                    // One zoom frame (invalidates caches)
                    run_zoom(&mut renderer, &mut current_zoom, &mut zoom_dir);
                    // Two pan frames (measures recovery cost)
                    run_pan(&mut renderer, &mut dx);
                    run_pan(&mut renderer, &mut dx);
                })
            });

            // ── rapid_zoom_steps ─────────────────────────────────
            // Simulates continuous trackpad pinch: many tiny zoom
            // increments in sequence. Tests how well the renderer
            // handles repeated compositor invalidation.
            //
            // NOTE: Each sample = 5 frames. Divide reported time by 5
            // for per-frame cost, or compare directly against 5×zoom.
            group.bench_function("rapid_zoom_steps", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                renderer.camera.set_zoom(1.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut current_zoom = 1.0f32;
                let mut zoom_dir: i32 = 1;
                b.iter(|| {
                    // 5 consecutive tiny zoom steps (simulates one gesture chunk)
                    for _ in 0..5 {
                        current_zoom += zoom_dir as f32 * 0.005;
                        if !(0.7..=1.5).contains(&current_zoom) {
                            zoom_dir = -zoom_dir;
                        }
                        renderer.camera.set_zoom(current_zoom);
                        renderer.queue_unstable();
                        let _ = black_box(renderer.flush());
                    }
                })
            });

            // ── zoom_in_sparse ───────────────────────────────────
            // Zoom into a small region where few nodes are visible.
            // Tests the interaction between zoom invalidation and
            // viewport culling: even though caches are invalidated,
            // fewer nodes need re-rasterization.
            group.bench_function("zoom_in_sparse", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                // Start zoomed in so few nodes are visible
                renderer.camera.set_zoom(5.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut current_zoom = 5.0f32;
                let mut zoom_dir: i32 = 1;
                b.iter(|| {
                    current_zoom += zoom_dir as f32 * 0.1;
                    if !(3.0..=8.0).contains(&current_zoom) {
                        zoom_dir = -zoom_dir;
                    }
                    renderer.camera.set_zoom(current_zoom);
                    renderer.queue_unstable();
                    let _ = black_box(renderer.flush());
                })
            });

            // ── pan_zoomed_in ────────────────────────────────────
            // Pan while zoomed in (few nodes visible). Tests that
            // pan-only fast path works well at high zoom where nodes
            // are large on screen (more pixels per node to blit/draw).
            group.bench_function("pan_zoomed_in", |b| {
                let scene = (scene_spec.builder)(scene_spec.cols, scene_spec.rows);
                let mut renderer = setup_renderer(scene, config);
                renderer.camera.set_center(scene_w / 2.0, scene_h / 2.0);
                renderer.camera.set_zoom(5.0);
                renderer.queue_stable();
                let _ = renderer.flush();

                let mut dx = 2.0f32;
                b.iter(|| run_pan(&mut renderer, &mut dx))
            });

            group.finish();
        }
    }
}

criterion_group!(benches, bench_camera);
criterion_main!(benches);
