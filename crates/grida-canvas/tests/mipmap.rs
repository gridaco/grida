use cg::mipmap::{ImageMipmaps, MipmapConfig};
use skia_safe::surfaces;

#[test]
fn full_chain_down_to_1x1() {
    let width = 300;
    let height = 200;

    let mut surface = surfaces::raster_n32_premul((width, height)).unwrap();
    let image = surface.image_snapshot();

    let mip = ImageMipmaps::from_image(image, &MipmapConfig::FullChain);
    let expected_levels = (width.max(height) as f32).log2().ceil() as usize + 1;
    assert_eq!(mip.level_count(), expected_levels);

    let last = mip.last_level_image().unwrap();
    assert!(last.width() <= 1 && last.height() <= 1);
}

#[test]
fn best_for_size_selects_correct_level() {
    let mut surface = surfaces::raster_n32_premul((300, 200)).unwrap();
    let image = surface.image_snapshot();

    let mip = ImageMipmaps::from_image(image, &MipmapConfig::FullChain);
    let level = mip.best_for_size(100.0, 100.0).unwrap();

    assert_eq!(level.width(), 150);
    assert_eq!(level.height(), 100);
}
