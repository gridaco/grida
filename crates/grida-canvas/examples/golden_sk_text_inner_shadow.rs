//! # Grida Canvas Skia - Golden Text Inner Shadow Example
//!
//! This example demonstrates text rendering with inner shadow effects using only Skia API.
//! It shows how to create inner text shadows by applying image filters directly to text
//! without extracting the text as a path.
//!
//! ## Goal
//! Demonstrate inner text shadow rendering using Skia's image filters applied directly to text.
//!
//! ## What it demonstrates:
//! - Text rendering with Skia's Font and Paint
//! - Inner shadow effects using image filters (blur, offset, and masking)
//! - Direct text rendering with inner shadow without path extraction
//! - Multiple inner shadow variations
//!
//! ## Layout
//! Single PNG showing text with inner shadow effects:
//! - Simple inner shadow
//! - Colored inner shadow
//! - Multiple inner shadows

use cg::cg::prelude::*;
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

    // Example 1: Simple inner shadow
    let shadow1 = FeShadow {
        dx: 2.0,
        dy: 2.0,
        blur: 4.0,
        spread: 0.0,
        color: CGColor::from_rgba(0, 0, 0, 128), // Semi-transparent black
        active: true,
    };
    draw_text_with_inner_shadow(canvas, "Hello Grida", 50.0, 100.0, &shadow1, Color::BLUE);

    // Example 2: Colored inner shadow
    let shadow2 = FeShadow {
        dx: 3.0,
        dy: 3.0,
        blur: 6.0,
        spread: 0.0,
        color: CGColor::from_rgba(255, 100, 100, 255), // Red shadow
        active: true,
    };
    draw_text_with_inner_shadow(canvas, "Canvas Text", 50.0, 200.0, &shadow2, Color::GREEN);

    // Example 3: Larger inner shadow
    let shadow3 = FeShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor::from_rgba(100, 50, 200, 180), // Purple shadow
        active: true,
    };
    draw_text_with_inner_shadow(
        canvas,
        "Inner Shadow",
        50.0,
        300.0,
        &shadow3,
        Color::from_argb(255, 200, 150, 50),
    ); // Orange text

    // save png
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/sk_text_inner_shadow.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

fn draw_text_with_inner_shadow(
    canvas: &sk::Canvas,
    text: &str,
    x: f32,
    y: f32,
    shadow: &FeShadow,
    text_color: Color,
) {
    FONT.with(|font| {
        // Use the existing inner shadow image filter from the painter module
        let inner_shadow_filter = cg::painter::shadow::inner_shadow_image_filter(shadow);

        // Create main text paint with inner shadow filter
        let mut text_paint = SkPaint::default();
        text_paint.set_color(text_color);
        text_paint.set_anti_alias(true);
        text_paint.set_image_filter(inner_shadow_filter);

        // Draw text with inner shadow
        let text_point = Point::new(x, y);
        canvas.draw_str(text, text_point, font, &text_paint);
    });
}
