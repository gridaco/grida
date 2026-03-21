use cg::cg::prelude::*;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use math2::transform::AffineTransform;

struct RectConfig {
    opacity: f32,
    blend_mode: LayerBlendMode,
    with_effects: bool,
}

impl Default for RectConfig {
    fn default() -> Self {
        Self {
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            with_effects: false,
        }
    }
}

fn create_rectangles(count: usize, with_effects: bool) -> Scene {
    create_rectangles_cfg(
        count,
        RectConfig {
            with_effects,
            ..Default::default()
        },
    )
}

fn create_rectangles_cfg(count: usize, cfg: RectConfig) -> Scene {
    let mut graph = SceneGraph::new();

    // Create rectangles
    let rectangles: Vec<Node> = (0..count)
        .map(|_i| {
            Node::Rectangle(RectangleNodeRec {
                active: true,
                opacity: cfg.opacity,
                blend_mode: cfg.blend_mode,
                mask: None,
                transform: AffineTransform::identity(),
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
                corner_radius: RectangularCornerRadius::zero(),
                corner_smoothing: CornerSmoothing::default(),
                fills: Paints::new([Paint::from(CGColor::RED)]),
                strokes: Paints::default(),
                stroke_style: StrokeStyle {
                    stroke_align: StrokeAlign::Inside,
                    stroke_cap: StrokeCap::default(),
                    stroke_join: StrokeJoin::default(),
                    stroke_miter_limit: StrokeMiterLimit::default(),
                    stroke_dash_array: None,
                },
                stroke_width: 1.0.into(),
                effects: if cfg.with_effects {
                    LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
                        dx: 2.0,
                        dy: 2.0,
                        blur: 4.0,
                        spread: 0.0,
                        color: CGColor::from_rgba(0, 0, 0, 128),
                        active: true,
                    })])
                } else {
                    LayerEffects::default()
                },
                layout_child: None,
            })
        })
        .collect();

    // Create root group
    let root_group = GroupNodeRec {
        active: true,
        transform: None,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
    };

    let root_id = graph.append_child(Node::Group(root_group), Parent::Root);
    graph.append_children(rectangles, Parent::NodeId(root_id));

    Scene {
        name: "Test Scene".into(),
        background_color: None,
        graph,
    }
}

fn bench_rectangles(c: &mut Criterion) {
    let width = 1000;
    let height = 1000;

    let mut group = c.benchmark_group("rectangles");
    group.sample_size(100);
    group.measurement_time(std::time::Duration::from_secs(10));

    // 1K rectangles
    group.bench_function("1k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );

            let scene = create_rectangles(black_box(1_000), false);

            // Clear canvas
            let canvas = renderer.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // 10K rectangles
    group.bench_function("10k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );

            let scene = create_rectangles(black_box(10_000), false);

            // Clear canvas
            let canvas = renderer.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    group.bench_function("10k_with_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );

            let scene = create_rectangles(black_box(10_000), true);

            // Clear canvas
            let canvas = renderer.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // 50K rectangles
    group.bench_function("50k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );

            let scene = create_rectangles(black_box(50_000), false);

            // Clear canvas
            let canvas = renderer.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    group.bench_function("50k_with_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );

            let scene = create_rectangles(black_box(50_000), true);

            // Clear canvas
            let canvas = renderer.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    group.finish();
}

/// Benchmarks specifically targeting the save_layer opacity folding optimization.
///
/// Semi-transparent nodes (opacity < 1.0) with a non-PassThrough blend mode
/// previously required **two** save_layers: one for blend isolation, one for
/// opacity. With the opacity folding optimization, effectless semi-transparent
/// nodes now merge opacity into the blend save_layer, eliminating one GPU
/// surface allocation per node.
fn bench_opacity_folding(c: &mut Criterion) {
    let width = 1000;
    let height = 1000;

    let mut group = c.benchmark_group("opacity_folding");
    group.sample_size(100);
    group.measurement_time(std::time::Duration::from_secs(10));

    // --- 1K nodes ---

    // Baseline: opaque, no save_layer needed
    group.bench_function("1k_opaque_passthrough", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(1_000),
                RectConfig {
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::default(),
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // Optimized path: opacity folded into blend save_layer (1 save_layer)
    group.bench_function("1k_semitransparent_normal", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(1_000),
                RectConfig {
                    opacity: 0.8,
                    blend_mode: LayerBlendMode::Blend(BlendMode::Normal),
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // Cannot fold: effects need separate opacity isolation (2+ save_layers)
    group.bench_function("1k_semitransparent_normal_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(1_000),
                RectConfig {
                    opacity: 0.8,
                    blend_mode: LayerBlendMode::Blend(BlendMode::Normal),
                    with_effects: true,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // Opaque + Normal blend — previously wasted a save_layer, now zero overhead
    group.bench_function("1k_opaque_normal", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(1_000),
                RectConfig {
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::Blend(BlendMode::Normal),
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // --- 10K nodes ---

    group.bench_function("10k_opaque_passthrough", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(10_000),
                RectConfig {
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::default(),
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // Opaque + Normal blend at 10k — should match opaque_passthrough now
    group.bench_function("10k_opaque_normal", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(10_000),
                RectConfig {
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::Blend(BlendMode::Normal),
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    group.bench_function("10k_semitransparent_normal", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(10_000),
                RectConfig {
                    opacity: 0.8,
                    blend_mode: LayerBlendMode::Blend(BlendMode::Normal),
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    group.bench_function("10k_semitransparent_normal_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(10_000),
                RectConfig {
                    opacity: 0.8,
                    blend_mode: LayerBlendMode::Blend(BlendMode::Normal),
                    with_effects: true,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    // --- PassThrough + opacity (save_layer_alpha path) ---

    group.bench_function("10k_semitransparent_passthrough", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(
                Backend::new_from_raster(width, height),
                None,
                Camera2D::new(Size {
                    width: width as f32,
                    height: height as f32,
                }),
            );
            let scene = create_rectangles_cfg(
                black_box(10_000),
                RectConfig {
                    opacity: 0.8,
                    blend_mode: LayerBlendMode::default(), // PassThrough
                    with_effects: false,
                },
            );
            renderer.load_scene(scene);
            renderer.queue_unstable();
            renderer.flush();
            renderer.free();
        })
    });

    group.finish();
}

criterion_group!(benches, bench_rectangles, bench_opacity_folding);
criterion_main!(benches);
