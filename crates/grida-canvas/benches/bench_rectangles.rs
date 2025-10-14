use cg::cg::types::*;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use math2::transform::AffineTransform;

fn create_rectangles(count: usize, with_effects: bool) -> Scene {
    let mut graph = SceneGraph::new();

    // Create rectangles
    let rectangles: Vec<Node> = (0..count)
        .map(|i| {
            let id = format!("rect-{}", i);

            Node::Rectangle(RectangleNodeRec {
                id: id.clone(),
                name: None,
                active: true,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                mask: None,
                transform: AffineTransform::identity(),
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
                corner_radius: RectangularCornerRadius::zero(),
                fills: Paints::new([Paint::from(CGColor(255, 0, 0, 255))]),
                strokes: Paints::default(),
                stroke_width: 1.0,
                stroke_align: StrokeAlign::Inside,
                stroke_dash_array: None,
                effects: if with_effects {
                    LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
                        dx: 2.0,
                        dy: 2.0,
                        blur: 4.0,
                        spread: 0.0,
                        color: CGColor(0, 0, 0, 128),
                    })])
                } else {
                    LayerEffects::default()
                },
            })
        })
        .collect();

    // Create root group
    let root_group = GroupNodeRec {
        id: "root".to_string(),
        name: Some("Root Group".to_string()),
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

criterion_group!(benches, bench_rectangles);
criterion_main!(benches);
