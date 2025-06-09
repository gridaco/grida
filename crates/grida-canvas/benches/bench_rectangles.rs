use cg::draw::{Backend, Renderer};
use cg::repository::NodeRepository;
use cg::schema::*;
use criterion::{Criterion, black_box, criterion_group, criterion_main};
use grida_cmath::transform::AffineTransform;

fn create_rectangles(count: usize, with_effects: bool) -> Scene {
    let mut repository = NodeRepository::new();
    let mut ids = Vec::new();

    // Create rectangles
    for i in 0..count {
        let id = format!("rect-{}", i);
        ids.push(id.clone());

        let rect = RectangleNode {
            base: BaseNode {
                id: id.clone(),
                name: format!("Rectangle {}", i),
                active: true,
            },
            transform: AffineTransform::identity(),
            size: Size {
                width: 100.0,
                height: 100.0,
            },
            corner_radius: RectangularCornerRadius::zero(),
            fill: Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 255),
                opacity: 1.0,
            }),
            stroke: Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            }),
            stroke_width: 1.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effect: if with_effects {
                Some(cg::schema::FilterEffect::DropShadow(
                    cg::schema::FeDropShadow {
                        dx: 2.0,
                        dy: 2.0,
                        blur: 4.0,
                        color: Color(0, 0, 0, 128),
                    },
                ))
            } else {
                None
            },
        };

        repository.insert(Node::Rectangle(rect));
    }

    // Create root group
    let root_group = cg::schema::GroupNode {
        base: BaseNode {
            id: "root".to_string(),
            name: "Root Group".to_string(),
            active: true,
        },
        transform: AffineTransform::identity(),
        children: ids.clone(),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };

    repository.insert(Node::Group(root_group));

    Scene {
        id: "scene".to_string(),
        name: "Test Scene".to_string(),
        transform: AffineTransform::identity(),
        children: vec!["root".to_string()],
        nodes: repository,
        background_color: None,
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
            let mut renderer = Renderer::new(1000.0, 1000.0, 1.0);
            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let scene = create_rectangles(black_box(1_000), false);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_scene(&scene);
            renderer.free();
        })
    });

    // 10K rectangles
    group.bench_function("10k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(1000.0, 1000.0, 1.0);

            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let scene = create_rectangles(black_box(10_000), false);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_scene(&scene);
            renderer.free();
        })
    });

    group.bench_function("10k_with_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(1000.0, 1000.0, 1.0);

            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let scene = create_rectangles(black_box(10_000), true);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_scene(&scene);
            renderer.free();
        })
    });

    // 50K rectangles
    group.bench_function("50k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(1000.0, 1000.0, 1.0);

            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let scene = create_rectangles(black_box(50_000), false);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_scene(&scene);
            renderer.free();
        })
    });

    group.bench_function("50k_with_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new(1000.0, 1000.0, 1.0);

            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let scene = create_rectangles(black_box(50_000), true);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_scene(&scene);
            renderer.free();
        })
    });

    group.finish();
}

criterion_group!(benches, bench_rectangles);
criterion_main!(benches);
