use skia_safe::surfaces;

/// Verifies that `Image::with_default_mipmaps()` produces a mipmapped image.
#[test]
fn skia_with_default_mipmaps_works() {
    let mut surface = surfaces::raster_n32_premul((512, 512)).unwrap();
    let image = surface.image_snapshot();

    let mipmapped = image.with_default_mipmaps();
    assert!(
        mipmapped.is_some(),
        "with_default_mipmaps() should succeed for a 512×512 image"
    );

    let mipmapped = mipmapped.unwrap();
    // The mipmapped image should have the same dimensions as the original.
    assert_eq!(mipmapped.width(), 512);
    assert_eq!(mipmapped.height(), 512);
}

/// Verifies that mipmapped images can be used to create shaders with mipmap sampling.
#[test]
fn mipmapped_image_shader_creation() {
    use skia_safe::{FilterMode, MipmapMode, SamplingOptions, TileMode};

    let mut surface = surfaces::raster_n32_premul((256, 256)).unwrap();
    let image = surface.image_snapshot();
    let mipmapped = image.with_default_mipmaps().unwrap();

    let sampling = SamplingOptions::new(FilterMode::Linear, MipmapMode::Nearest);
    let tile_modes = (TileMode::Decal, TileMode::Decal);

    let shader = mipmapped.to_shader(Some(tile_modes), sampling, None);
    assert!(
        shader.is_some(),
        "Shader creation should succeed with mipmapped image"
    );
}

/// Verifies that 1×1 images handle mipmaps gracefully.
#[test]
fn tiny_image_mipmaps() {
    let mut surface = surfaces::raster_n32_premul((1, 1)).unwrap();
    let image = surface.image_snapshot();

    // with_default_mipmaps() may return None for 1×1 images — that's fine,
    // the fallback in ImageRepository handles this.
    let result = image.with_default_mipmaps();
    // Either succeeds or falls back gracefully.
    let img = result.unwrap_or(image);
    assert_eq!(img.width(), 1, "Fallback image should be 1px wide");
    assert_eq!(img.height(), 1, "Fallback image should be 1px tall");
}
