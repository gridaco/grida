use cg::cache::mipmap::{ImageMipmaps, MipmapConfig, MipmapLevels};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use skia_safe::surfaces;

fn bench_mipmap_generation(c: &mut Criterion) {
    let mut surface = surfaces::raster_n32_premul((2048, 2048)).unwrap();
    let image = surface.image_snapshot();

    let mut group = c.benchmark_group("mipmap_gen");

    let chained = MipmapConfig {
        levels: MipmapLevels::FullChain,
        chained: true,
    };
    group.bench_function("chained", |b| {
        b.iter(|| {
            let _ = ImageMipmaps::from_image(black_box(image.clone()), &chained);
        })
    });

    let direct = MipmapConfig {
        levels: MipmapLevels::FullChain,
        chained: false,
    };
    group.bench_function("direct", |b| {
        b.iter(|| {
            let _ = ImageMipmaps::from_image(black_box(image.clone()), &direct);
        })
    });

    group.finish();
}

criterion_group!(benches, bench_mipmap_generation);
criterion_main!(benches);
