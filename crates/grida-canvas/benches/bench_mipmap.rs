use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use skia_safe::{
    surfaces, Color, FilterMode, Image, Matrix, MipmapMode, Paint, Rect, SamplingOptions, TileMode,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Render an image shader into a target surface.
/// `image` is the (optionally mipmapped) image.
/// `logical_size` is the node size (e.g. 10x10).
/// `zoom` is the camera zoom applied to the canvas.
fn render_image_shader(
    target: &mut skia_safe::Surface,
    image: &Image,
    logical_size: (f32, f32),
    zoom: f32,
    sampling: SamplingOptions,
) {
    let canvas = target.canvas();
    canvas.save();
    canvas.clear(Color::WHITE);

    // Simulate camera zoom
    canvas.scale((zoom, zoom));

    // Build shader matrix: maps image pixels -> logical container
    let sx = logical_size.0 / image.width() as f32;
    let sy = logical_size.1 / image.height() as f32;
    let matrix = Matrix::new_all(sx, 0.0, 0.0, 0.0, sy, 0.0, 0.0, 0.0, 1.0);

    if let Some(shader) = image.to_shader(
        Some((TileMode::Decal, TileMode::Decal)),
        sampling,
        Some(&matrix),
    ) {
        let mut paint = Paint::default();
        paint.set_shader(shader);
        canvas.draw_rect(Rect::from_wh(logical_size.0, logical_size.1), &paint);
    }

    canvas.restore();
}

// ---------------------------------------------------------------------------
// 1. Skia mipmap generation at various source sizes
// ---------------------------------------------------------------------------

fn bench_mipmap_generation(c: &mut Criterion) {
    let mut group = c.benchmark_group("mipmap_gen");

    for &size in &[512, 1024, 2048, 4096] {
        let mut surface = surfaces::raster_n32_premul((size, size)).unwrap();
        let image = surface.image_snapshot();

        group.bench_with_input(BenchmarkId::new("skia_builtin", size), &size, |b, _| {
            b.iter(|| {
                let _ = black_box(image.with_default_mipmaps());
            })
        });
    }

    group.finish();
}

// ---------------------------------------------------------------------------
// 2. Rendering benchmarks: Skia mipmap modes vs no mipmaps
// ---------------------------------------------------------------------------

fn bench_mipmap_render(c: &mut Criterion) {
    let source_size = 4096;
    let logical_size = (10.0_f32, 10.0_f32);

    // Prepare source image
    let mut surface = surfaces::raster_n32_premul((source_size, source_size)).unwrap();
    let image = surface.image_snapshot();

    // Skia built-in mipmaps
    let skia_mipmapped = image.with_default_mipmaps().unwrap();

    let mut group = c.benchmark_group("mipmap_render");

    for &zoom in &[1.0_f32, 5.0, 25.0, 100.0] {
        let render_w = (logical_size.0 * zoom).ceil() as i32;
        let render_h = (logical_size.1 * zoom).ceil() as i32;
        let target_size = (render_w.max(1), render_h.max(1));

        // --- Skia built-in: linear mipmap mode ---
        group.bench_with_input(
            BenchmarkId::new("skia_mipmap_linear", format!("z{zoom}")),
            &zoom,
            |b, _| {
                let mut target = surfaces::raster_n32_premul(target_size).unwrap();
                let sampling = SamplingOptions::new(FilterMode::Linear, MipmapMode::Linear);
                b.iter(|| {
                    render_image_shader(
                        &mut target,
                        black_box(&skia_mipmapped),
                        logical_size,
                        zoom,
                        sampling,
                    );
                })
            },
        );

        // --- Skia built-in: nearest mipmap mode ---
        group.bench_with_input(
            BenchmarkId::new("skia_mipmap_nearest", format!("z{zoom}")),
            &zoom,
            |b, _| {
                let mut target = surfaces::raster_n32_premul(target_size).unwrap();
                let sampling = SamplingOptions::new(FilterMode::Linear, MipmapMode::Nearest);
                b.iter(|| {
                    render_image_shader(
                        &mut target,
                        black_box(&skia_mipmapped),
                        logical_size,
                        zoom,
                        sampling,
                    );
                })
            },
        );

        // --- Baseline: full-res image, no mipmaps at all ---
        group.bench_with_input(
            BenchmarkId::new("no_mipmap", format!("z{zoom}")),
            &zoom,
            |b, _| {
                let mut target = surfaces::raster_n32_premul(target_size).unwrap();
                let sampling = SamplingOptions::new(FilterMode::Linear, MipmapMode::None);
                b.iter(|| {
                    render_image_shader(
                        &mut target,
                        black_box(&image),
                        logical_size,
                        zoom,
                        sampling,
                    );
                })
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_mipmap_generation, bench_mipmap_render,);
criterion_main!(benches);
