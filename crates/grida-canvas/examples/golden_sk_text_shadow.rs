//! # Grida Canvas Skia - Golden Text Shadow Example
//!
//! This example demonstrates text rendering with shadow effects using only Skia API.
//! It shows how to create text shadows by drawing the text multiple times with
//! different offsets and blur effects.
//!
//! ## Goal
//! Demonstrate text shadow rendering using Skia's image filters and text drawing capabilities.
//!
//! ## What it demonstrates:
//! - Text rendering with Skia's Font and Paint
//! - Shadow effects using image filters (blur and offset)
//! - Multiple text rendering passes for shadow + main text
//! - Simple text shadow implementation
//!
//! ## Layout
//! Single PNG showing text with shadow effects:
//! - Simple text with drop shadow
//! - Text with colored shadow
//! - Text with multiple shadows

use cg::cg::types::*;
use skia_safe::{self as sk, surfaces, Color, Font, Paint as SkPaint, Point};

thread_local! {
    static FONT: Font = Font::new(cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES), 48.0);
}

fn main() {
    let width = 800;
    let height = 400;
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Example 1: Simple text with black shadow
    let shadow1 = FeShadow {
        dx: 2.0,
        dy: 2.0,
        blur: 4.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 255), // Black
    };
    draw_text_with_shadow(canvas, "Hello Grida", 50.0, 100.0, &shadow1, Color::BLUE);

    // Example 2: Text with colored shadow
    let shadow2 = FeShadow {
        dx: 3.0,
        dy: 3.0,
        blur: 6.0,
        spread: 0.0,
        color: CGColor(255, 100, 100, 255), // Red shadow
    };
    draw_text_with_shadow(canvas, "Canvas Text", 50.0, 200.0, &shadow2, Color::GREEN);

    // Example 3: Text with larger shadow
    let shadow3 = FeShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 128), // Semi-transparent black
    };
    draw_text_with_shadow(
        canvas,
        "Shadow Effect",
        50.0,
        300.0,
        &shadow3,
        Color::from_argb(255, 100, 50, 200), // Purple text
    );

    // save png
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/sk_text_shadow.png"),
        data.as_bytes(),
    )
    .unwrap();
}

fn draw_text_with_shadow(
    canvas: &sk::Canvas,
    text: &str,
    x: f32,
    y: f32,
    shadow: &FeShadow,
    text_color: Color,
) {
    FONT.with(|font| {
        // Use the existing text shadow image filter from the painter module
        let text_shadow_filter = cg::painter::shadow::drop_shadow_image_filter(shadow);

        // Create shadow paint with the filter
        let mut shadow_paint = SkPaint::default();
        shadow_paint.set_anti_alias(true);
        shadow_paint.set_image_filter(text_shadow_filter);

        // Draw shadow text
        let shadow_point = Point::new(x, y);
        canvas.draw_str(text, shadow_point, font, &shadow_paint);

        // Create main text paint
        let mut text_paint = SkPaint::default();
        text_paint.set_color(text_color);
        text_paint.set_anti_alias(true);

        // Draw main text
        let text_point = Point::new(x, y);
        canvas.draw_str(text, text_point, font, &text_paint);
    });
}
