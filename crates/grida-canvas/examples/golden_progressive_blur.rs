use cg::cg::types::FeProgressiveBlur;
use skia_safe::{
    self as sk, image_filters, surfaces, BlendMode, Color, Data, Paint, Point, Rect, Shader,
    TileMode,
};

static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    x1: 0.0,
    y1: 0.0,
    x2: 400.0,
    y2: 400.0,
    radius: 0.0,
    radius2: 200.0,
};

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();

    // Clear the surface with white background
    canvas.clear(Color::WHITE);

    // Load the image from file
    let image_path = "../fixtures/images/checker.png";
    let image_data = std::fs::read(image_path).expect("Failed to read image file");
    let image =
        sk::Image::from_encoded(Data::new_copy(&image_data)).expect("Failed to decode image");

    // TODO: !!

    // Save the result to a file
    let image_snapshot = surface.image_snapshot();
    let data = image_snapshot
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("Failed to encode image");
    std::fs::write("goldens/progressive_blur.png", data.as_bytes())
        .expect("Failed to write output file");
}
