//! Benchmark: pan and zoom frame performance for layer compositing cache A/B testing.
//!
//! Measures per-frame cost across three modes:
//!   - **A: No caching** (`cache_tile = false`, no layer compositing) — baseline
//!   - **B: Global tiles** (`cache_tile = true`) — old tile path
//!   - **C: Layer compositing** (`layer_compositing = true`) — new architecture (once implemented)
//!
//! Scenarios:
//!   - "pan_N": Simulate N pan frames (translate camera by small delta each frame)
//!   - "zoom_N": Simulate N zoom frames (scale camera each frame)
//!   - "edit_single": Change one node, render one frame (measures invalidation scope)

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

/// Create a heavy scene with effects (shadows, blurs) for realistic benchmarking.
/// `count` nodes arranged in a grid, each with a fill and a drop shadow.
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
                color: CGColor::from_rgba(
                    ((x * 13) % 255) as u8,
                    ((y * 17) % 255) as u8,
                    200,
                    255,
                ),
                blend_mode: BlendMode::default(),
                active: true,
            }));

            // Add a drop shadow effect for realism
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

/// Create a simple scene without effects for sanity-check benchmarking.
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
                color: CGColor::from_rgba(
                    ((x * 7) % 255) as u8,
                    ((y * 11) % 255) as u8,
                    180,
                    255,
                ),
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

/// Helper: load scene, warm caches, return renderer ready for benchmarking.
fn setup_renderer(scene: Scene, vp_w: i32, vp_h: i32) -> Renderer {
    let mut renderer = Renderer::new(
        Backend::new_from_raster(vp_w, vp_h),
        None,
        Camera2D::new(Size {
            width: vp_w as f32,
            height: vp_h as f32,
        }),
    );
    renderer.load_scene(scene);
    // Warm: render one stable frame so caches are populated
    renderer.queue_stable();
    let _ = renderer.flush();
    renderer
}

fn bench_pan(c: &mut Criterion) {
    let vp_w = 1000;
    let vp_h = 1000;

    // --- Heavy scene: 500 nodes (25x20) with shadows ---
    let cols = 25u32;
    let rows = 20u32;
    let scene_w = cols as f32 * 60.0;
    let scene_h = rows as f32 * 60.0;

    // --- Mode A: No caching ---
    {
        let mut group = c.benchmark_group("pan_heavy_no_cache");
        group.sample_size(100);
        group.measurement_time(std::time::Duration::from_secs(10));

        group.bench_function("pan_frame", |b| {
            let scene = create_heavy_scene(cols, rows);
            let mut renderer = setup_renderer(scene, vp_w, vp_h);
            renderer
                .camera
                .set_center(scene_w / 2.0, scene_h / 2.0);
            renderer.camera.set_zoom(1.0);
            renderer.queue_stable();
            let _ = renderer.flush();

            let mut dx = 5.0f32;
            b.iter(|| {
                dx = -dx;
                renderer.camera.translate(dx, 0.0);
                renderer.queue_unstable();
                let _ = black_box(renderer.flush());
            })
        });

        group.bench_function("zoom_frame", |b| {
            let scene = create_heavy_scene(cols, rows);
            let mut renderer = setup_renderer(scene, vp_w, vp_h);
            renderer
                .camera
                .set_center(scene_w / 2.0, scene_h / 2.0);
            renderer.camera.set_zoom(1.0);
            renderer.queue_stable();
            let _ = renderer.flush();

            let mut zoom_dir = 1;
            let mut current_zoom = 1.0f32;
            b.iter(|| {
                current_zoom += zoom_dir as f32 * 0.02;
                if current_zoom > 2.0 || current_zoom < 0.5 {
                    zoom_dir = -zoom_dir;
                }
                renderer.camera.set_zoom(current_zoom);
                renderer.queue_unstable();
                let _ = black_box(renderer.flush());
            })
        });

        group.finish();
    }

    // --- Simple scene (100 nodes) sanity check ---
    {
        let mut group = c.benchmark_group("pan_simple_no_cache");
        group.sample_size(200);
        group.measurement_time(std::time::Duration::from_secs(5));

        group.bench_function("pan_frame", |b| {
            let scene = create_simple_scene(10, 10);
            let mut renderer = setup_renderer(scene, vp_w, vp_h);
            renderer.camera.set_center(150.0, 150.0);
            renderer.camera.set_zoom(1.0);
            renderer.queue_stable();
            let _ = renderer.flush();

            let mut dx = 5.0f32;
            b.iter(|| {
                dx = -dx;
                renderer.camera.translate(dx, 0.0);
                renderer.queue_unstable();
                let _ = black_box(renderer.flush());
            })
        });

        group.finish();
    }
}

criterion_group!(benches, bench_pan);
criterion_main!(benches);
