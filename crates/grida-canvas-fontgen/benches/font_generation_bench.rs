use criterion::{black_box, criterion_group, criterion_main, Criterion};
use grida_canvas_fontgen::fontgen::{DynFontManager, FontFamily, FontGlyph};

fn font_generation_benchmark(c: &mut Criterion) {
    c.bench_function("create_font_manager", |b| {
        b.iter(|| {
            let mut manager = DynFontManager::new();
            black_box(manager)
        })
    });

    c.bench_function("create_font_family", |b| {
        b.iter(|| {
            let family = FontFamily::new("Test Font".to_string(), "Regular".to_string());
            black_box(family)
        })
    });

    c.bench_function("create_glyph", |b| {
        b.iter(|| {
            let glyph = FontGlyph::new('A', vec![0u8; 100]);
            black_box(glyph)
        })
    });
}

criterion_group!(benches, font_generation_benchmark);
criterion_main!(benches);
