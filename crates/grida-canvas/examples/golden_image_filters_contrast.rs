//! # Grida Canvas Skia - Image Contrast Filter Example
//!
//! This example demonstrates the contrast filter implementation using Skia color matrix.
//! Contrast adjusts the difference between light and dark areas by scaling around a pivot point.
//!
//! ## Math
//! c' = (c - p) * k + p
//! Where:
//! - c = input color value [0, 1]
//! - p = pivot point (typically 0.5 for sRGB)
//! - k = contrast factor
//!   - k = 1.0: neutral (no change)
//!   - k > 1.0: higher contrast
//!   - k < 1.0: lower contrast
//!   - k = 0.0: flat gray
//!
//! ## Layout
//! Single PNG with 3-column layout showing:
//! - Original image
//! - Low contrast (k = 0.5)
//! - High contrast (k = 2.0)

use cg::painter::image_filters;
use skia_safe::{self as sk, surfaces, Color, Data, Font, Image, Paint as SkPaint, Point, Rect};

thread_local! {
    static FONT: Font = Font::new(cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES), 12.0);
}

fn main() {
    let mut surface = surfaces::raster_n32_premul((2000, 1200)).expect("Failed to create surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Test images for each row
    let images = [
        ("checker.png", "Checker"),
        ("4k.jpg", "4K"),
        ("8k.jpg", "8K"),
    ];

    // Contrast values for each column (0.25, 0.5, 1.0, 2.0, 4.0)
    let contrast_values = [0.25, 0.5, 1.0, 2.0, 4.0];
    let contrast_labels = ["0.25x", "0.5x", "Original", "2.0x", "4.0x"];

    let cell_width = 400.0;
    let cell_height = 350.0;
    let image_size = 200.0;

    // Draw title
    draw_centered_label(canvas, 1000.0, 30.0, "Image Filters: Contrast");

    // Draw grid
    for (row, (image_file, image_label)) in images.iter().enumerate() {
        let y_offset = 80.0 + (row as f32 * cell_height);

        // Draw row label
        draw_centered_label(canvas, 50.0, y_offset + 100.0, image_label);

        for (col, (&contrast_k, label)) in contrast_values
            .iter()
            .zip(contrast_labels.iter())
            .enumerate()
        {
            let x_offset = 120.0 + (col as f32 * cell_width);

            // Load and draw image
            let image = load_fixture_image(image_file, image_size as i32, image_size as i32);

            if contrast_k == 1.0 {
                // Original image (no filter)
                canvas.draw_image(&image, (x_offset, y_offset), None);
            } else {
                // Apply contrast filter
                let filter = image_filters::create_contrast_filter(contrast_k);
                let mut paint = SkPaint::default();
                paint.set_color_filter(filter);
                canvas.draw_image(&image, (x_offset, y_offset), Some(&paint));
            }

            // Draw column label
            draw_centered_label(
                canvas,
                x_offset + image_size / 2.0,
                y_offset + image_size + 20.0,
                label,
            );
        }
    }

    // Save PNG
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/image_filters_contrast.png"
        ),
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
