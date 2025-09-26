//! # Grida Canvas Skia - Image Shadows/Highlights Filter Example
//!
//! This example demonstrates the shadows/highlights filter implementation using SkSL.
//! This filter provides advanced shadow and highlight recovery/compression with chroma preservation.
//!
//! ## Math
//! The filter uses smooth masking to selectively adjust shadows and highlights:
//! - Shadow mask: smooth transition from shadows to midtones
//! - Highlight mask: smooth transition from midtones to highlights
//! - Luma adjustment: Y' = Y + shadow_adjust + highlight_adjust
//! - Chroma preservation: RGB' = lerp(grayscale, RGB * factor, chroma_preserve)
//!
//! ## Layout
//! Single PNG with 3-column layout showing:
//! - Original image
//! - Shadow recovery (shadows = +0.5)
//! - Highlight recovery (highlights = +0.5)
//! - Combined effect (shadows = +0.3, highlights = +0.3)

use cg::painter::image_filters::{self, ShadowsHighlightsParams};
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

    // Filter configurations for each column
    let filter_configs = [
        ("Original", None),
        (
            "Shadow Recovery",
            Some(ShadowsHighlightsParams {
                shadows: 0.5,
                highlights: 0.0,
                ..Default::default()
            }),
        ),
        (
            "Highlight Recovery",
            Some(ShadowsHighlightsParams {
                shadows: 0.0,
                highlights: 0.5,
                ..Default::default()
            }),
        ),
        (
            "Combined",
            Some(ShadowsHighlightsParams {
                shadows: 0.3,
                highlights: 0.3,
                ..Default::default()
            }),
        ),
        (
            "Strong Effect",
            Some(ShadowsHighlightsParams {
                shadows: 0.8,
                highlights: 0.8,
                ..Default::default()
            }),
        ),
    ];

    let cell_width = 400.0;
    let cell_height = 350.0;
    let image_size = 200.0;

    // Draw title
    draw_centered_label(canvas, 1000.0, 30.0, "Image Filters: Shadows/Highlights");

    // Draw grid
    for (row, (image_file, image_label)) in images.iter().enumerate() {
        let y_offset = 80.0 + (row as f32 * cell_height);

        // Draw row label
        draw_centered_label(canvas, 50.0, y_offset + 100.0, image_label);

        for (col, (label, filter_params)) in filter_configs.iter().enumerate() {
            let x_offset = 120.0 + (col as f32 * cell_width);

            // Load and draw image
            let image = load_fixture_image(image_file, image_size as i32, image_size as i32);

            if let Some(params) = filter_params {
                // Apply shadows/highlights filter
                let filter = image_filters::create_shadows_highlights_filter(params.clone());
                let mut paint = SkPaint::default();
                paint.set_color_filter(filter);
                canvas.draw_image(&image, (x_offset, y_offset), Some(&paint));
            } else {
                // Original image (no filter)
                canvas.draw_image(&image, (x_offset, y_offset), None);
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
            "/goldens/image_filters_shadows_highlights.png"
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
