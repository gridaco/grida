//! # Grida Canvas Skia - Golden Image Example
//!
//! This example demonstrates that two different Skia rendering methods can produce
//! visually identical results:
//! 1. Direct image drawing with `canvas.draw_image()`
//! 2. Image shader painting with `paint.set_shader()`
//!
//! ## Goal
//! Prove that `canvas.draw_image()` and `paint.set_shader()` can render the same
//! image with identical pixel output when properly configured.
//!
//! ## What it demonstrates:
//! - Direct image drawing using `canvas.draw_image()`
//! - Image shader creation and application to paint
//! - Proper matrix transformation for shader positioning
//! - Visual equivalence between the two methods
//!
//! ## Layout
//! Single PNG with 2-column layout, center-aligned:
//!
//! | Column | Description | Method |
//! |--------|-------------|---------|
//! | **LEFT** | **Direct Draw** | `canvas.draw_image()` - direct image rendering |
//! | **RIGHT** | **Shader Paint** | `paint.set_shader()` - image as shader |
//!
//! ### Layout Details:
//! - Images are evenly spaced and center-aligned horizontally
//! - Labels are positioned under each image, center-aligned
//! - Increased padding and spacing for better visual presentation
//!
//! ### Expected Result:
//! Both columns should show visually identical checkerboard patterns, proving that
//! image shaders can produce the same visual output as direct image drawing.

use skia_safe::{
    self as sk, surfaces, Color, Data, Font, Image, Matrix, Paint as SkPaint, Point, Rect,
    SamplingOptions, TileMode,
};

thread_local! {
    static FONT: Font = Font::new(cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES), 12.0);
}

fn main() {
    let tile = 100.0;
    let padding = 40.0;
    let column_gap = 60.0;
    let label_height = 20.0;
    let label_gap = 10.0;
    let total_width = (padding * 2.0 + tile * 2.0 + column_gap) as i32;
    let total_height = (padding * 2.0 + tile + label_height + label_gap) as i32;

    let mut surface = surfaces::raster_n32_premul((total_width, total_height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Calculate center positions for both images
    let center_y = padding + tile / 2.0;
    let left_center_x = padding + tile / 2.0;
    let right_center_x = padding + tile + column_gap + tile / 2.0;

    // Load test image
    let checker_image = load_fixture_image("checker.png", tile as i32, tile as i32);

    // Draw left image (Direct)
    let left_rect = Rect::from_xywh(
        left_center_x - tile / 2.0,
        center_y - tile / 2.0,
        tile,
        tile,
    );
    canvas.draw_image(&checker_image, (left_rect.left(), left_rect.top()), None);

    // Draw right image (Shader)
    let right_rect = Rect::from_xywh(
        right_center_x - tile / 2.0,
        center_y - tile / 2.0,
        tile,
        tile,
    );
    let sampling = SamplingOptions::default();
    let mut matrix = Matrix::new_identity();
    matrix.set_translate((right_rect.left(), right_rect.top()));
    let image_shader = checker_image
        .to_shader(
            Some((TileMode::default(), TileMode::default())),
            sampling,
            Some(&matrix),
        )
        .unwrap();
    let mut paint = SkPaint::default();
    paint.set_shader(image_shader);
    paint.set_anti_alias(true);
    canvas.draw_rect(right_rect, &paint);

    // Draw labels under each image, center-aligned
    let label_y = center_y + tile / 2.0 + label_gap;
    draw_centered_label(canvas, left_center_x, label_y, "Direct");
    draw_centered_label(canvas, right_center_x, label_y, "Shader");

    // save png
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/sk_image.png"),
        data.as_bytes(),
    )
    .unwrap();
}

fn draw_centered_label(canvas: &sk::Canvas, center_x: f32, y: f32, text: &str) {
    FONT.with(|font| {
        let mut text_paint = SkPaint::default();
        text_paint.set_color(Color::BLACK);
        text_paint.set_anti_alias(true);

        // Calculate text width for centering
        let (text_width, _bounds) = font.measure_str(text, Some(&text_paint));
        let text_x = center_x - text_width / 2.0;
        let text_point = Point::new(text_x, y + 12.0);

        canvas.draw_str(text, text_point, font, &text_paint);
    });
}

fn load_fixture_image(filename: &str, w: i32, h: i32) -> Image {
    // Load image from fixtures directory (project root)
    let fixture_path = format!(
        "{}/../../fixtures/images/{}",
        env!("CARGO_MANIFEST_DIR"),
        filename
    );
    let data = std::fs::read(&fixture_path).expect("Failed to read fixture image");
    let data = Data::new_copy(&data);
    let image = Image::from_encoded(data).expect("Failed to decode image");

    // Create a surface and draw the image scaled to the desired size
    let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
    let canvas = surface.canvas();
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    canvas.draw_image_rect(&image, None, Rect::from_wh(w as f32, h as f32), &paint);

    surface.image_snapshot()
}
