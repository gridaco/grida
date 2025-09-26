//! # Grida Canvas Skia - Image Saturation Filter Example
//!
//! This example demonstrates the saturation filter implementation using Skia color matrix.
//! Saturation adjusts the intensity of colors by interpolating between the original color
//! and its grayscale equivalent.
//!
//! ## Math
//! color' = lerp(luma, color, k)
//! Where:
//! - luma = dot(RGB, [0.2126, 0.7152, 0.0722]) - sRGB luminance coefficients
//! - k = saturation factor
//!   - k = 1.0: neutral (no change)
//!   - k > 1.0: more saturated
//!   - k < 1.0: less saturated
//!   - k = 0.0: grayscale
//!
//! ## Layout
//! Single PNG with 5-column layout showing:
//! - Desaturated (-1.0)
//! - Partially desaturated (-0.5)
//! - Original (0.0)
//! - Partially oversaturated (+0.5)
//! - Oversaturated (+1.0)

use cg::cg::types::ImageFilters;
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

    // Saturation values for each column (normalized -1.0 to 1.0)
    let saturation_values = [-1.0, -0.5, 0.0, 0.5, 1.0];
    let saturation_labels = ["-1.0", "-0.5", "Original", "+0.5", "+1.0"];

    let cell_width = 400.0;
    let cell_height = 350.0;
    let image_size = 200.0;

    // Draw title
    draw_centered_label(canvas, 1000.0, 30.0, "Image Filters: Saturation");

    // Draw grid
    for (row, (image_file, image_label)) in images.iter().enumerate() {
        let y_offset = 80.0 + (row as f32 * cell_height);

        // Draw row label
        draw_centered_label(canvas, 50.0, y_offset + 100.0, image_label);

        for (col, (&saturation_k, label)) in saturation_values
            .iter()
            .zip(saturation_labels.iter())
            .enumerate()
        {
            let x_offset = 120.0 + (col as f32 * cell_width);

            // Load and draw image
            let image = load_fixture_image(image_file, image_size as i32, image_size as i32);

            if saturation_k == 0.0 {
                // Original image (no filter)
                canvas.draw_image(&image, (x_offset, y_offset), None);
            } else {
                // Apply saturation filter using normalized values
                let filters = ImageFilters {
                    exposure: 0.0,
                    contrast: 0.0,
                    saturation: saturation_k,
                    temperature: 0.0,
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
            "/goldens/image_filters_saturation.png"
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
