use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};

#[path = "../tests/fonts.rs"]
mod fonts;

fn main() {
    // Create a surface to accommodate all the optical sizing examples
    let mut surface = surfaces::raster_n32_premul((1200, 1800)).unwrap();
    let canvas = surface.canvas();

    // Clear the canvas with white background
    canvas.clear(Color::WHITE);

    // Create a paint for text
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Roboto Flex variable font
    let font_mgr = FontMgr::new();
    let base_typeface = font_mgr.new_from_data(fonts::ROBOTO_FLEX_VF, None).unwrap();

    // Create a paragraph style
    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    // Create a font collection and add the variable font
    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(base_typeface.clone(), Some("Roboto Flex"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    font_collection.set_default_font_manager(font_mgr.clone(), None);

    // Layout parameters
    let start_x = 80.0;
    let start_y = 120.0;
    let section_spacing = 80.0;

    // Draw title
    let title_style = TextStyleRec::from_font("Roboto Flex", 32.0);
    let mut title_ts = textstyle(&title_style, &None);
    title_ts.set_foreground_paint(&paint);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text("Optical Sizing Demo - Roboto Flex");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1100.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 80.0));

    // Draw subtitle
    let subtitle_style = TextStyleRec::from_font("Roboto Flex", 16.0);
    let mut subtitle_ts = textstyle(&subtitle_style, &None);
    subtitle_ts.set_foreground_paint(&paint);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_ts);
    subtitle_builder.add_text(
        "Optical size range: 8-144 (default: 14), demonstrating Auto, None, Fixed, and out-of-range values",
    );
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1100.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 30.0));

    let mut y_pos = start_y + 40.0;

    // Section 1: Small Text Examples (12px font size)
    draw_section_title(
        canvas,
        &font_collection,
        &paragraph_style,
        &paint,
        "Small Text Examples (12px)",
        start_x,
        y_pos,
    );
    y_pos += 50.0;

    // Small text with different optical sizing modes
    let small_text_examples = vec![
        (
            "Auto",
            FontOpticalSizing::Auto,
            "The quick brown fox jumps over the lazy dog (Auto)",
        ),
        (
            "None",
            FontOpticalSizing::None,
            "The quick brown fox jumps over the lazy dog (None)",
        ),
        (
            "Fixed (14) - Default",
            FontOpticalSizing::Fixed(14.0),
            "The quick brown fox jumps over the lazy dog (Fixed 14 - Default)",
        ),
        (
            "Fixed (8)",
            FontOpticalSizing::Fixed(8.0),
            "The quick brown fox jumps over the lazy dog (Fixed 8)",
        ),
        (
            "Fixed (12)",
            FontOpticalSizing::Fixed(12.0),
            "The quick brown fox jumps over the lazy dog (Fixed 12)",
        ),
        (
            "Fixed (16)",
            FontOpticalSizing::Fixed(16.0),
            "The quick brown fox jumps over the lazy dog (Fixed 16)",
        ),
        (
            "Fixed (144)",
            FontOpticalSizing::Fixed(144.0),
            "The quick brown fox jumps over the lazy dog (Fixed 144)",
        ),
    ];

    for (_label, optical_sizing, text) in small_text_examples {
        draw_text_example(
            canvas,
            &font_collection,
            &paragraph_style,
            &paint,
            text,
            12.0,
            optical_sizing,
            start_x,
            y_pos,
        );
        y_pos += 35.0;
    }

    y_pos += section_spacing;

    // Section 2: Large Text Examples (48px font size)
    draw_section_title(
        canvas,
        &font_collection,
        &paragraph_style,
        &paint,
        "Large Text Examples (48px)",
        start_x,
        y_pos,
    );
    y_pos += 50.0;

    // Large text with different optical sizing modes
    let large_text_examples = vec![
        (
            "Auto",
            FontOpticalSizing::Auto,
            "The quick brown fox (Auto)",
        ),
        (
            "None",
            FontOpticalSizing::None,
            "The quick brown fox (None)",
        ),
        (
            "Fixed (14) - Default",
            FontOpticalSizing::Fixed(14.0),
            "The quick brown fox (Fixed 14 - Default)",
        ),
        (
            "Fixed (48)",
            FontOpticalSizing::Fixed(48.0),
            "The quick brown fox (Fixed 48)",
        ),
        (
            "Fixed (72)",
            FontOpticalSizing::Fixed(72.0),
            "The quick brown fox (Fixed 72)",
        ),
        (
            "Fixed (144)",
            FontOpticalSizing::Fixed(144.0),
            "The quick brown fox (Fixed 144)",
        ),
    ];

    for (_label, optical_sizing, text) in large_text_examples {
        draw_text_example(
            canvas,
            &font_collection,
            &paragraph_style,
            &paint,
            text,
            48.0,
            optical_sizing,
            start_x,
            y_pos,
        );
        y_pos += 70.0;
    }

    y_pos += section_spacing;

    // Section 3: Out-of-Range Examples
    draw_section_title(
        canvas,
        &font_collection,
        &paragraph_style,
        &paint,
        "Out-of-Range Examples (Max: 144)",
        start_x,
        y_pos,
    );
    y_pos += 50.0;

    // Out-of-range examples
    let out_of_range_examples = vec![
        (
            "Fixed (8) - Min",
            FontOpticalSizing::Fixed(8.0),
            "The quick brown fox jumps over the lazy dog (Fixed 8 - Min)",
        ),
        (
            "Fixed (1) - Below min (8)",
            FontOpticalSizing::Fixed(1.0),
            "The quick brown fox jumps over the lazy dog (Fixed 1 - Below min 8)",
        ),
        (
            "Fixed (0) - Way below min (8)",
            FontOpticalSizing::Fixed(0.0),
            "The quick brown fox jumps over the lazy dog (Fixed 0 - Way below min 8)",
        ),
        (
            "Fixed (144) - Max",
            FontOpticalSizing::Fixed(144.0),
            "The quick brown fox jumps over the lazy dog (Fixed 144 - Max)",
        ),
        (
            "Fixed (200) - Above max (144)",
            FontOpticalSizing::Fixed(200.0),
            "The quick brown fox jumps over the lazy dog (Fixed 200 - Above max 144)",
        ),
        (
            "Fixed (400) - Way above max (144)",
            FontOpticalSizing::Fixed(400.0),
            "The quick brown fox jumps over the lazy dog (Fixed 400 - Way above max 144)",
        ),
    ];

    for (_label, optical_sizing, text) in out_of_range_examples {
        draw_text_example(
            canvas,
            &font_collection,
            &paragraph_style,
            &paint,
            text,
            24.0,
            optical_sizing,
            start_x,
            y_pos,
        );
        y_pos += 50.0;
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/type_var_opsz.png"),
        bytes,
    )
    .unwrap();

    println!("Optical sizing demo saved to goldens/type_var_opsz.png");
}

fn draw_section_title(
    canvas: &skia_safe::Canvas,
    font_collection: &FontCollection,
    paragraph_style: &ParagraphStyle,
    paint: &Paint,
    title: &str,
    x: f32,
    y: f32,
) {
    let title_style = TextStyleRec::from_font("Roboto Flex", 20.0);
    let mut title_ts = textstyle(&title_style, &None);
    title_ts.set_foreground_paint(paint);

    let mut title_builder = ParagraphBuilder::new(paragraph_style, font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text(title);
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1100.0);
    title_paragraph.paint(canvas, Point::new(x, y));
}

fn draw_text_example(
    canvas: &skia_safe::Canvas,
    font_collection: &FontCollection,
    paragraph_style: &ParagraphStyle,
    paint: &Paint,
    text: &str,
    font_size: f32,
    optical_sizing: FontOpticalSizing,
    x: f32,
    y: f32,
) {
    // Draw alternating background for better readability
    let mut bg_paint = Paint::default();
    bg_paint.set_color(Color::from_argb(255, 248, 248, 248));
    canvas.draw_rect(
        skia_safe::Rect::new(x - 10.0, y - 5.0, x + 1010.0, y + font_size + 15.0),
        &bg_paint,
    );

    // Create a paragraph builder
    let mut para_builder = ParagraphBuilder::new(paragraph_style, font_collection);

    // Create cg TextStyle with specific optical sizing
    let text_style = TextStyleRec {
        text_decoration: None,
        font_family: "Roboto Flex".to_string(),
        font_size: font_size,
        font_weight: FontWeight::default(),
        font_features: None,
        font_variations: None,
        font_optical_sizing: optical_sizing,
        font_style_italic: false,
        letter_spacing: Default::default(),
        word_spacing: Default::default(),
        line_height: Default::default(),
        text_transform: cg::cg::types::TextTransform::None,
    };

    // Convert to Skia TextStyle using our textstyle() function
    let mut skia_text_style = textstyle(&text_style, &None);
    skia_text_style.set_foreground_paint(paint);

    para_builder.push_style(&skia_text_style);
    para_builder.add_text(text);

    // Build and layout the paragraph
    let mut paragraph = para_builder.build();
    paragraph.layout(1000.0);

    // Draw the paragraph
    paragraph.paint(canvas, Point::new(x, y));
}
