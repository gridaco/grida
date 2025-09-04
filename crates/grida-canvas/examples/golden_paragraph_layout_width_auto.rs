//! # Skia Paragraph Layout: Width Auto Implementation
//!
//! This example demonstrates the correct way to implement `width: auto` for text nodes in Skia paragraph layout.
//!
//! ## Key Solution
//!
//! The proper fix is to disable Skia's rounding hack by calling `paragraph_style.set_apply_rounding_hack(false)`.
//! This ensures that fractional intrinsic widths are honored exactly, preventing unwanted line breaks.
//!
//! ## Implementation
//!
//! ```rust
//! let mut paragraph_style = ParagraphStyle::new();
//! paragraph_style.set_apply_rounding_hack(false); // Disable rounding hack
//!
//! // Layout with infinity to get intrinsic width
//! paragraph.layout(f32::INFINITY);
//! let intrinsic_width = paragraph.max_intrinsic_width();
//!
//! // Re-layout with the exact intrinsic width (no padding needed)
//! paragraph.layout(intrinsic_width);
//! ```
//!
//! This correctly implements `width: auto` behavior without hacky workarounds like adding arbitrary padding.
//!
//! ## Important Notes
//!
//! 1. **Always disable rounding hack**: `set_apply_rounding_hack(false)` should always be used to prevent
//!    fractional width truncation that causes unwanted line breaks.
//!
//! 2. **For clean integer widths**: If you need clean integer widths, use `ceil()` instead of `round()`:
//!    ```rust
//!    let clean_width = intrinsic_width.ceil(); // Always rounds up, preventing line breaks
//!    // vs
//!    let rounded_width = intrinsic_width.round(); // May round down, causing line breaks
//!    ```
//!
//! 3. **Skia's rounding hack should always be off**: This feature should be disabled in all paragraph
//!    styles to ensure consistent and predictable text layout behavior.

use skia_safe::textlayout::{
    FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle, TextStyle,
};
use skia_safe::{surfaces, Color, Color4f, FontMgr, Paint, PaintStyle, Point, Rect};

fn main() {
    // Demonstrate the correct width: auto implementation
    test_width_auto_implementation();
    test_verification();

    // Generate visual output
    generate_golden_image();
}

fn test_width_auto_implementation() {
    println!("Testing correct width: auto implementation with Skia paragraph...");

    // Create a simple text style using system default font
    let font_mgr = FontMgr::new();
    let mut font_collection = FontCollection::new();
    font_collection.set_default_font_manager(font_mgr, None);

    let mut text_style = TextStyle::new();
    text_style.set_font_size(16.0);
    text_style.set_font_families(&["Arial"]);
    text_style.set_color(Color::BLACK);

    // Test with simple text that should not break
    let test_text = "Hello";

    // Create paragraph style
    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
    // Disable Skia's rounding hack so intrinsic fractional widths are honored
    paragraph_style.set_apply_rounding_hack(false);

    // Build paragraph
    let mut builder = ParagraphBuilder::new(&paragraph_style, font_collection);
    builder.push_style(&text_style);
    builder.add_text(test_text);
    let mut paragraph: Paragraph = builder.build();

    // Step 1: Layout with infinity to get intrinsic width (current approach)
    paragraph.layout(f32::INFINITY);
    let intrinsic_width = paragraph.max_intrinsic_width();
    println!("Intrinsic width for '{}': {}", test_text, intrinsic_width);

    // Step 2: Re-layout with the measured width (this causes the issue)
    paragraph.layout(intrinsic_width);
    let line_count_after_relayout = paragraph.line_number();
    println!(
        "Line count after re-layout with intrinsic width: {}",
        line_count_after_relayout
    );

    // With rounding hack disabled, intrinsic width should yield a single line
    paragraph.layout(intrinsic_width);
    let line_count_single = paragraph.line_number();
    println!(
        "Line count with intrinsic width (no rounding hack): {}",
        line_count_single
    );
    assert_eq!(
        line_count_single, 1,
        "Text should not break when laid out at max_intrinsic_width with rounding hack disabled"
    );

    paragraph.layout(f32::INFINITY);
    let min_intrinsic_width = paragraph.min_intrinsic_width();
    println!(
        "Min intrinsic width for '{}': {}",
        test_text, min_intrinsic_width
    );
    assert!(
        min_intrinsic_width <= intrinsic_width + 0.001,
        "min_intrinsic_width should not exceed max_intrinsic_width"
    );
    paragraph.layout(min_intrinsic_width);
    let line_count_with_min = paragraph.line_number();
    println!(
        "Line count with min intrinsic width: {}",
        line_count_with_min
    );
    assert_eq!(
        line_count_with_min, 1,
        "Single word should not break at min_intrinsic_width either"
    );
}

fn test_verification() {
    println!("\n=== Verification Tests ===");

    // Test multiple text samples to ensure the fix works consistently
    let test_cases = vec![
        "Hello",
        "World",
        "Test",
        "A",
        "Hello World",
        "This is a longer text",
    ];

    for test_text in test_cases {
        println!("\nTesting: '{}'", test_text);

        // Create paragraph
        let font_mgr = FontMgr::new();
        let mut font_collection = FontCollection::new();
        font_collection.set_default_font_manager(font_mgr, None);

        let mut text_style = TextStyle::new();
        text_style.set_font_size(16.0);
        text_style.set_font_families(&["Arial"]);
        text_style.set_color(Color::BLACK);

        let mut paragraph_style = ParagraphStyle::new();
        paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
        paragraph_style.set_apply_rounding_hack(false);

        let mut builder = ParagraphBuilder::new(&paragraph_style, font_collection);
        builder.push_style(&text_style);
        builder.add_text(test_text);
        let mut paragraph: Paragraph = builder.build();

        // Measure and lay out at intrinsic width without rounding hack
        paragraph.layout(f32::INFINITY);
        let intrinsic_width = paragraph.max_intrinsic_width();
        paragraph.layout(intrinsic_width);
        let line_count = paragraph.line_number();
        println!("  Intrinsic width: {}", intrinsic_width);
        println!("  Line count: {}", line_count);

        // For single words, we expect 1 line
        if !test_text.contains(' ') {
            assert_eq!(
                line_count, 1,
                "Single word '{}' should not break into multiple lines",
                test_text
            );
        }
    }

    println!("\n✅ All tests passed! Width auto implementation works correctly.");
}

fn generate_golden_image() {
    println!("\n=== Generating Golden Image ===");

    // Create a surface for rendering
    let mut surface = surfaces::raster_n32_premul((800, 600)).expect("surface");
    let canvas = surface.canvas();

    // Clear background
    canvas.clear(Color::WHITE);

    // Create font manager and collection
    let font_mgr = FontMgr::new();
    let mut font_collection = FontCollection::new();
    font_collection.set_default_font_manager(font_mgr, None);

    // Test cases with different text samples
    let test_cases = vec![
        ("Hello", 50.0, 80.0),
        ("World", 50.0, 130.0),
        ("Test", 50.0, 180.0),
        ("A", 50.0, 230.0),
        ("Hello World", 50.0, 280.0),
        ("This is a longer text", 50.0, 330.0),
        ("Very long text that should not break", 50.0, 380.0),
    ];

    for (text, x, y) in test_cases {
        // Create paragraph with correct settings
        let mut text_style = TextStyle::new();
        text_style.set_font_size(16.0);
        text_style.set_font_families(&["Arial"]);
        text_style.set_color(Color::BLACK);

        let mut paragraph_style = ParagraphStyle::new();
        paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
        paragraph_style.set_apply_rounding_hack(false); // Key fix!

        let mut builder = ParagraphBuilder::new(&paragraph_style, font_collection.clone());
        builder.push_style(&text_style);
        builder.add_text(text);
        let mut paragraph: Paragraph = builder.build();

        // Layout with infinity to get intrinsic width
        paragraph.layout(f32::INFINITY);
        let intrinsic_width = paragraph.max_intrinsic_width();

        // Re-layout with the intrinsic width
        paragraph.layout(intrinsic_width);

        // Draw the text
        paragraph.paint(canvas, Point::new(x, y));

        // Draw bounding box overlay
        let mut paint = Paint::new(Color4f::new(1.0, 0.0, 0.0, 0.5), None);
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(1.0);

        let bounds = Rect::new(x, y, x + intrinsic_width, y + paragraph.height());
        canvas.draw_rect(bounds, &paint);

        // Draw width label
        let mut label_paint = Paint::new(Color4f::new(0.0, 0.0, 1.0, 1.0), None);
        label_paint.set_anti_alias(true);

        // Create a simple text paint for labels
        let mut label_style = TextStyle::new();
        label_style.set_font_size(10.0);
        label_style.set_font_families(&["Arial"]);
        label_style.set_color(Color::from_argb(255, 0, 0, 255));

        let mut label_paragraph_style = ParagraphStyle::new();
        label_paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
        label_paragraph_style.set_apply_rounding_hack(false);

        let mut label_builder =
            ParagraphBuilder::new(&label_paragraph_style, font_collection.clone());
        label_builder.push_style(&label_style);
        label_builder.add_text(&format!("w: {:.1}", intrinsic_width));
        let mut label_paragraph: Paragraph = label_builder.build();
        label_paragraph.layout(f32::INFINITY);

        label_paragraph.paint(canvas, Point::new(x, y - 15.0));

        println!(
            "  '{}' -> width: {:.1}, height: {:.1}",
            text,
            intrinsic_width,
            paragraph.height()
        );
    }

    // Add title
    let mut title_style = TextStyle::new();
    title_style.set_font_size(14.0);
    title_style.set_font_families(&["Arial"]);
    title_style.set_color(Color::BLACK);

    let mut title_paragraph_style = ParagraphStyle::new();
    title_paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
    title_paragraph_style.set_apply_rounding_hack(false);

    let mut title_builder = ParagraphBuilder::new(&title_paragraph_style, font_collection);
    title_builder.push_style(&title_style);
    title_builder.add_text("Width Auto Implementation (Red boxes show intrinsic width)");
    let mut title_paragraph: Paragraph = title_builder.build();
    title_paragraph.layout(f32::INFINITY);
    title_paragraph.paint(canvas, Point::new(50.0, 20.0));

    // Save the image
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/paragraph_layout_width_auto.png", data.as_bytes()).unwrap();

    println!("✅ Golden image saved to: goldens/paragraph_layout_width_auto.png");
    println!("   Red boxes show the intrinsic width boundaries");
    println!("   All text should fit within their red boxes (no line breaking)");
}
