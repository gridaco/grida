//! Benchmark: viewport culling during camera pan/zoom.
//!
//! Measures the cost of rendering a single frame after a camera transform
//! change. The scene is loaded once during setup; only the queue + flush
//! (frame planning + draw) is timed.
//!
//! Scenarios:
//!   - "all_visible":  camera shows the entire scene (no culling benefit)
//!   - "partial":      camera shows ~25% of the scene
//!   - "corner":       camera shows a small corner (~6% of nodes)
//!   - "zoomed_in":    zoomed into a small region (~1-2% visible)
//!   - "empty":        camera pointed at empty space (0 visible nodes)

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

/// Create a grid scene with `cols * rows` rectangles spread in world space.
/// Each rectangle is 20x20 with 10px gap, starting at (0,0).
fn create_grid_scene(cols: u32, rows: u32) -> Scene {
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
        name: "Grid Scene".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

/// Helper: load scene, warm the picture cache with one initial render,
/// then return the renderer ready for camera-only benchmarking.
fn setup_renderer(scene: Scene, vp_width: i32, vp_height: i32) -> Renderer {
    let mut renderer = Renderer::new(
        Backend::new_from_raster(vp_width, vp_height),
        None,
        Camera2D::new(Size {
            width: vp_width as f32,
            height: vp_height as f32,
        }),
    );
    renderer.load_scene(scene);
    // Warm: render one frame so picture cache is populated
    renderer.queue_unstable();
    let _ = renderer.flush();
    renderer
}

/// Simulate a camera move and render one frame. Returns flush stats.
fn pan_and_render(renderer: &mut Renderer, tx: f32, ty: f32) {
    renderer.camera.translate(tx, ty);
    renderer.queue_unstable();
    let _ = renderer.flush();
}

fn bench_viewport_culling(c: &mut Criterion) {
    let vp_w = 1000;
    let vp_h = 1000;

    // --- 5K nodes (70x70 grid, ~5000 nodes) ---
    // Scene spans 70 * 30 = 2100 x 2100 world pixels
    let cols_5k = 70u32;
    let rows_5k = 70u32;
    let scene_extent_5k = cols_5k as f32 * 30.0; // ~2100

    let mut group = c.benchmark_group("viewport_culling_5k");
    group.sample_size(200);
    group.measurement_time(std::time::Duration::from_secs(10));

    // All visible: camera centered, zoom out to show everything
    group.bench_function("all_visible", |b| {
        let scene = create_grid_scene(cols_5k, rows_5k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        // Center camera on scene, zoom out so everything fits
        renderer
            .camera
            .set_center(scene_extent_5k / 2.0, scene_extent_5k / 2.0);
        renderer
            .camera
            .set_zoom(vp_w as f32 / scene_extent_5k * 0.9);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 1.0f32;
        b.iter(|| {
            dx = -dx; // oscillate to avoid no-op detection
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    // Partial: camera at (0,0), zoom=1 → viewport sees ~1000x1000 of 2100x2100
    // That's roughly (1000/30)^2 / 4900 ≈ 22% of nodes
    group.bench_function("partial_25pct", |b| {
        let scene = create_grid_scene(cols_5k, rows_5k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer.camera.set_center(0.0, 0.0);
        renderer.camera.set_zoom(1.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 1.0f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    // Corner: camera at top-left corner, zoom=2 → viewport sees 500x500 world
    // That's ~(500/30)^2 / 4900 ≈ 5.6% of nodes
    group.bench_function("corner_5pct", |b| {
        let scene = create_grid_scene(cols_5k, rows_5k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer.camera.set_center(0.0, 0.0);
        renderer.camera.set_zoom(2.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 1.0f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    // Zoomed in: camera at center, zoom=10 → viewport sees 100x100 world
    // That's ~(100/30)^2 / 4900 ≈ 0.2% of nodes
    group.bench_function("zoomed_in_1pct", |b| {
        let scene = create_grid_scene(cols_5k, rows_5k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer
            .camera
            .set_center(scene_extent_5k / 2.0, scene_extent_5k / 2.0);
        renderer.camera.set_zoom(10.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 0.5f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    // Empty: camera pointed far away from the scene (nothing visible)
    group.bench_function("empty_offscreen", |b| {
        let scene = create_grid_scene(cols_5k, rows_5k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer.camera.set_center(99999.0, 99999.0);
        renderer.camera.set_zoom(1.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 1.0f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    group.finish();

    // --- 50K nodes (224x224 grid, ~50176 nodes) ---
    // Scene spans 224 * 30 = 6720 x 6720 world pixels
    let cols_50k = 224u32;
    let rows_50k = 224u32;
    let scene_extent_50k = cols_50k as f32 * 30.0;

    let mut group = c.benchmark_group("viewport_culling_50k");
    group.sample_size(50);
    group.measurement_time(std::time::Duration::from_secs(15));

    group.bench_function("all_visible", |b| {
        let scene = create_grid_scene(cols_50k, rows_50k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer
            .camera
            .set_center(scene_extent_50k / 2.0, scene_extent_50k / 2.0);
        renderer
            .camera
            .set_zoom(vp_w as f32 / scene_extent_50k * 0.9);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 1.0f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    group.bench_function("zoomed_in_1pct", |b| {
        let scene = create_grid_scene(cols_50k, rows_50k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer
            .camera
            .set_center(scene_extent_50k / 2.0, scene_extent_50k / 2.0);
        renderer.camera.set_zoom(10.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 0.5f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    group.bench_function("empty_offscreen", |b| {
        let scene = create_grid_scene(cols_50k, rows_50k);
        let mut renderer = setup_renderer(scene, vp_w, vp_h);
        renderer.camera.set_center(99999.0, 99999.0);
        renderer.camera.set_zoom(1.0);
        renderer.queue_stable();
        let _ = renderer.flush();

        let mut dx = 1.0f32;
        b.iter(|| {
            dx = -dx;
            pan_and_render(black_box(&mut renderer), dx, 0.0);
        })
    });

    group.finish();
}

criterion_group!(benches, bench_viewport_culling);
criterion_main!(benches);
