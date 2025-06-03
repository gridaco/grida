use cg::draw::{Backend, Renderer};
use cg::schema::{
    BaseNode, BlendMode, Color, Node, NodeMap, Paint, RectangleNode, RectangularCornerRadius, Size,
    SolidPaint,
};
use cg::transform::AffineTransform;
use criterion::{Criterion, black_box, criterion_group, criterion_main};

fn create_rectangles(count: usize, with_effects: bool) -> (NodeMap, Vec<String>) {
    let mut nodemap = NodeMap::new();
    let mut ids = Vec::with_capacity(count);

    for i in 0..count {
        let id = format!("rect_{}", i);
        let rect = RectangleNode {
            base: BaseNode {
                id: id.clone(),
                name: format!("Rectangle {}", i),
                active: true,
                blend_mode: if i % 2 == 0 {
                    BlendMode::Normal
                } else {
                    BlendMode::Multiply
                },
            },
            transform: AffineTransform::new(
                (i % 100) as f32 * 10.0, // x position
                (i / 100) as f32 * 10.0, // y position
                (i % 4) as f32 * 90.0,   // rotation
            ),
            size: Size {
                width: 8.0,
                height: 8.0,
            },
            corner_radius: RectangularCornerRadius::all(2.0),
            fill: Paint::Solid(SolidPaint {
                color: Color(
                    (i * 7) as u8,  // r
                    (i * 13) as u8, // g
                    (i * 17) as u8, // b
                    255,            // a
                ),
            }),
            stroke: Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
            }),
            stroke_width: 1.0,
            opacity: 1.0,
            effect: if with_effects {
                Some(cg::schema::FilterEffect::DropShadow(
                    cg::schema::FeDropShadow {
                        dx: 2.0,
                        dy: 2.0,
                        blur: 4.0,
                        color: Color(0, 0, 0, 77),
                    },
                ))
            } else {
                None
            },
        };
        nodemap.insert(id.clone(), Node::Rectangle(rect));
        ids.push(id);
    }

    // Create a root group node
    let root_group = cg::schema::GroupNode {
        base: BaseNode {
            id: "root".to_string(),
            name: "Root Group".to_string(),
            active: true,
            blend_mode: BlendMode::Normal,
        },
        transform: AffineTransform::identity(),
        children: ids.clone(),
        opacity: 1.0,
    };
    nodemap.insert("root".to_string(), Node::Group(root_group));

    (nodemap, ids)
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
            let mut renderer = Renderer::new();
            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let (nodemap, _) = create_rectangles(black_box(1_000), false);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_node(&"root".to_string(), &nodemap);
            renderer.free();
        })
    });

    // 10K rectangles
    group.bench_function("10k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new();
            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let (nodemap, _) = create_rectangles(black_box(10_000), false);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_node(&"root".to_string(), &nodemap);
            renderer.free();
        })
    });

    group.bench_function("10k_with_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new();
            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let (nodemap, _) = create_rectangles(black_box(10_000), true);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_node(&"root".to_string(), &nodemap);
            renderer.free();
        })
    });

    // 50K rectangles
    group.bench_function("50k_basic", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new();
            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let (nodemap, _) = create_rectangles(black_box(50_000), false);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_node(&"root".to_string(), &nodemap);
            renderer.free();
        })
    });

    group.bench_function("50k_with_effects", |b| {
        b.iter(|| {
            let mut renderer = Renderer::new();
            let surface_ptr = Renderer::init_raster(width, height);
            renderer.set_backend(Backend::Raster(surface_ptr));

            let (nodemap, _) = create_rectangles(black_box(50_000), true);

            // Clear canvas
            let surface = unsafe { &mut *surface_ptr };
            let canvas = surface.canvas();
            let mut paint = skia_safe::Paint::default();
            paint.set_color(skia_safe::Color::WHITE);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
                &paint,
            );

            renderer.render_node(&"root".to_string(), &nodemap);
            renderer.free();
        })
    });

    group.finish();
}

criterion_group!(benches, bench_rectangles);
criterion_main!(benches);
