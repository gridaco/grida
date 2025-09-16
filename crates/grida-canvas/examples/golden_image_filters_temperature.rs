//! # Grida Canvas Skia - Image Temperature Filter Example
//!
//! This example demonstrates the temperature filter implementation using Skia color matrix.
//! Temperature adjusts the white balance by scaling R and B channels relative to each other.
//!
//! ## Math
//! R' = R * rK, B' = B * bK
//! Where:
//! - rK = 1 + t (red channel multiplier)
//! - bK = 1 - t (blue channel multiplier)
//! - t = temperature adjustment
//!   - t = 0.0: neutral (no change)
//!   - t > 0.0: warmer (more red, less blue)
//!   - t < 0.0: cooler (less red, more blue)
//!
//! ## Layout
//! Single PNG with 3-column layout showing:
//! - Original image
//! - Cooler (-0.3, more blue)
//! - Warmer (+0.3, more red)

use cg::painter::image_filters;
use cg::cg::types::ImageFilters;
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

    // Temperature values for each column (normalized -1.0 to 1.0)
    let temperature_values = [-1.0, -0.5, 0.0, 0.5, 1.0];
    let temperature_labels = ["-1.0", "-0.5", "Original", "+0.5", "+1.0"];

    let cell_width = 400.0;
    let cell_height = 350.0;
    let image_size = 200.0;

    // Draw title
    draw_centered_label(canvas, 1000.0, 30.0, "Image Filters: Temperature");

    // Draw grid
    for (row, (image_file, image_label)) in images.iter().enumerate() {
        let y_offset = 80.0 + (row as f32 * cell_height);

        // Draw row label
        draw_centered_label(canvas, 50.0, y_offset + 100.0, image_label);

        for (col, (&temperature_t, label)) in temperature_values
            .iter()
            .zip(temperature_labels.iter())
            .enumerate()
        {
            let x_offset = 120.0 + (col as f32 * cell_width);

            // Load and draw image
            let image = load_fixture_image(image_file, image_size as i32, image_size as i32);

            if temperature_t == 0.0 {
                // Original image (no filter)
                canvas.draw_image(&image, (x_offset, y_offset), None);
            } else {
                // Apply temperature filter using normalized values
                let filters = ImageFilters {
                    exposure: 0.0,
                    contrast: 0.0,
                    saturation: 0.0,
                    temperature: temperature_t,
                    tint: 0.0,
                    highlights: 0.0,
                    shadows: 0.0,
                };
                if let Some(filter) = image_filters::create_image_filters_color_filter(&filters) {
                    let mut paint = SkPaint::default();
                    paint.set_color_filter(filter);
                    canvas.draw_image(&image, (x_offset, y_offset), Some(&paint));
                } else {
                    canvas.draw_image(&image, (x_offset, y_offset), None);
                }
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
            "/goldens/image_filters_temperature.png"
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
