//! # Grida Canvas Skia - Golden Text Backdrop Blur Path Example
//!
//! This example demonstrates text-masked backdrop blur effects using the path-based approach
//! from the main painter implementation.
//!
//! ## Features Demonstrated:
//! - Text to path conversion using `paragraph.visit()` API
//! - Backdrop blur using SaveLayerRec with backdrop filter
//! - Path-based clipping for precise text masking
//! - Proper font loading and paragraph layout
//! - Semi-transparent text rendering
//!
//! ## Technical Implementation:
//! - Uses the same `paragraph.visit()` approach as `text_stroke.rs`
//! - Extracts individual glyph paths for accurate text masking
//! - Applies backdrop blur using the same technique as `painter.rs`
//! - Demonstrates proper font weight and opacity handling

use skia_safe::{
    self as sk,
    canvas::SaveLayerRec,
    path::AddPathMode,
    surfaces,
    textlayout::{FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle},
    Color, Data, FontMgr, Image, Matrix, Paint as SkPaint, Path, Point, Rect,
};

use cg::cg::types::*;
use cg::text::text_style::textstyle;

fn main() {
    let width = 800;
    let height = 600;
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Draw background image
    draw_background_image(canvas, width, height);

    // Draw text with backdrop blur effect
    draw_text_backdrop_blur_paragraph(
        canvas,
        "GLASS",
        0.0,                             // x position (paragraph will center horizontally)
        height as f32 / 2.0 - 50.0,      // y position (centered vertically)
        25.0,                            // blur sigma
        Color::from_argb(64, 200, 0, 0), // semi-transparent red (25% opacity)
    );

    // Save as golden image
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/sk_text_backdrop_blur_path.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

fn draw_background_image(canvas: &sk::Canvas, width: i32, height: i32) {
    // Load the 4K background image
    let image_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures/images/4k.jpg");

    if let Ok(image_data) = std::fs::read(image_path) {
        let data = Data::new_copy(&image_data);
        if let Some(image) = Image::from_encoded(data) {
            let mut paint = SkPaint::default();
            paint.set_anti_alias(true);

            // Draw the image to fill the canvas
            let dest_rect = Rect::from_wh(width as f32, height as f32);
            canvas.draw_image_rect(&image, None, &dest_rect, &paint);
            return;
        }
    }

    // Fallback: draw a simple gradient if image loading fails
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);

    let center = Point::new(width as f32 / 2.0, height as f32 / 2.0);
    let radius = (width.max(height) as f32) / 2.0;

    let colors = vec![
        Color::from_argb(255, 255, 100, 100), // Red
        Color::from_argb(255, 100, 255, 100), // Green
        Color::from_argb(255, 100, 100, 255), // Blue
        Color::from_argb(255, 255, 255, 100), // Yellow
    ];
    let positions = vec![0.0, 0.33, 0.66, 1.0];

    if let Some(shader) = sk::Shader::radial_gradient(
        center,
        radius,
        &*colors,
        Some(&*positions),
        sk::TileMode::Clamp,
        None,
        None,
    ) {
        paint.set_shader(shader);
        canvas.draw_rect(Rect::from_wh(width as f32, height as f32), &paint);
    }
}

fn draw_text_backdrop_blur_paragraph(
    canvas: &sk::Canvas,
    text: &str,
    x: f32,
    y: f32,
    blur_sigma: f32,
    text_color: Color,
) {
    // Create paragraph with the text
    let mut paragraph = create_paragraph(text, text_color);

    // Convert paragraph to path for backdrop blur
    let font_collection = FontCollection::new();
    if let Some(text_path) = paragraph_to_path(&mut paragraph, &font_collection, x, y) {
        // Apply backdrop blur effect
        draw_backdrop_blur_for_path(canvas, &text_path, blur_sigma);

        // Draw the text on top
        paragraph.paint(canvas, Point::new(x, y));
    }
}

/// Create a paragraph with the given text and color
fn create_paragraph(text: &str, text_color: Color) -> Paragraph {
    let mut paragraph_style = ParagraphStyle::default();
    paragraph_style.set_text_align(skia_safe::textlayout::TextAlign::Center);

    // Create text style with bold font
    let text_style_rec = TextStyleRec {
        font_family: "Geist".to_string(),
        font_size: 144.0,
        font_weight: FontWeight(900), // Maximum weight
        font_kerning: true,
        font_style_italic: false,
        text_decoration: None,
        letter_spacing: TextLetterSpacing::Fixed(0.0),
        word_spacing: TextWordSpacing::Fixed(0.0),
        line_height: TextLineHeight::Normal,
        font_optical_sizing: FontOpticalSizing::Auto,
        font_variations: None,
        font_features: None,
        text_transform: TextTransform::None,
    };

    let text_style = textstyle(&text_style_rec, &None);
    let mut skia_text_style = text_style;
    skia_text_style.set_color(text_color);

    // Set up font collection with embedded Geist font
    let mut font_collection = FontCollection::new();
    let font_mgr = FontMgr::new();
    let _typeface = font_mgr
        .new_from_data(&Data::new_copy(cg::fonts::embedded::geist::BYTES), None)
        .expect("Failed to create typeface");
    font_collection.set_default_font_manager(font_mgr, None);

    // Build paragraph
    let mut paragraph_builder = ParagraphBuilder::new(&paragraph_style, font_collection);
    paragraph_builder.push_style(&skia_text_style);
    paragraph_builder.add_text(text);

    let mut paragraph = paragraph_builder.build();
    paragraph.layout(800.0); // Match canvas width
    paragraph
}

/// Convert a paragraph to a path using paragraph.visit() API
/// Extracts individual glyph paths for accurate text masking
fn paragraph_to_path(
    paragraph: &mut Paragraph,
    _font_collection: &FontCollection,
    x: f32,
    y: f32,
) -> Option<Path> {
    let mut path = Path::new();

    // Iterate through text runs and extract glyph paths
    paragraph.visit(|_, info| {
        if let Some(info) = info {
            let font = info.font();
            let glyphs = info.glyphs();
            let positions = info.positions();
            let origin = info.origin();

            // Build path from individual glyphs
            for (glyph, position) in glyphs.iter().zip(positions.iter()) {
                if let Some(glyph_path) = font.get_path(*glyph) {
                    let offset = Point::new(position.x + origin.x, position.y + origin.y);
                    path.add_path(&glyph_path, offset, AddPathMode::Append);
                }
            }
        }
    });

    if path.is_empty() {
        return None;
    }

    // Transform path to correct position
    let mut transformed_path = path.clone();
    let transform = Matrix::translate((x, y));
    transformed_path.transform(&transform);

    Some(transformed_path)
}

/// Draw backdrop blur for a path using SaveLayerRec with backdrop filter
fn draw_backdrop_blur_for_path(canvas: &sk::Canvas, path: &Path, blur_sigma: f32) {
    // Create Gaussian blur filter
    let Some(image_filter) =
        skia_safe::image_filters::blur((blur_sigma, blur_sigma), None, None, None)
    else {
        return;
    };

    // Clip canvas to the path
    canvas.save();
    canvas.clip_path(path, None, true);

    // Apply backdrop blur using SaveLayerRec
    let layer_rec = SaveLayerRec::default().backdrop(&image_filter);
    canvas.save_layer(&layer_rec);

    // Restore layers
    canvas.restore(); // pop the SaveLayer
    canvas.restore(); // pop the clip
}
