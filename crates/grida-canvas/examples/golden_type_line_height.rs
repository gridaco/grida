use cg::cg::prelude::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};

fn main() {
    // Create a surface to accommodate all the line height examples in rows
    let mut surface = surfaces::raster_n32_premul((1500, 1400)).unwrap();
    let canvas = surface.canvas();

    // Clear the canvas with white background
    canvas.clear(Color::WHITE);

    // Create a paint for text
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Geist variable font
    let font_mgr = FontMgr::new();
    let base_typeface = font_mgr
        .new_from_data(cg::fonts::embedded::geist::BYTES, None)
        .unwrap();

    // Create a paragraph style
    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    // Create a font collection and add the variable font
    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(base_typeface.clone(), Some("Geist"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    font_collection.set_default_font_manager(font_mgr.clone(), None);

    // Layout parameters for row-based layout
    let start_x = 40.0;
    let start_y = 100.0;
    let font_size = 18.0;
    let section_spacing = 50.0; // Increased spacing between sections
    let row_height = 150.0; // Increased row height
    let col_width = 300.0; // Width for each column (4 columns)
    let col_spacing = 30.0; // Increased spacing between columns

    // Draw title
    let title_style = TextStyleRec::from_font("Geist", 28.0);
    let mut title_ts = textstyle(&title_style, &None);
    title_ts.set_foreground_paint(&paint);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text("Line Height Demo - Row Layout");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1300.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 50.0));

    // Draw subtitle
    let subtitle_style = TextStyleRec::from_font("Geist", 14.0);
    let mut subtitle_ts = textstyle(&subtitle_style, &None);
    subtitle_ts.set_foreground_paint(&paint);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_ts);
    subtitle_builder.add_text(
        "Comparing different line height values side by side for better visual distinction",
    );
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1300.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 20.0));

    // Helper function to draw a text block with line height
    let draw_text_block = |canvas: &skia_safe::Canvas,
                           x: f32,
                           y: f32,
                           width: f32,
                           label: &str,
                           line_height: TextLineHeight| {
        // Label
        let label_style = TextStyleRec {
            text_decoration: None,
            font_family: "Geist".to_string(),
            font_size: 12.0,
            font_weight: Default::default(),
            font_width: None,
            font_kerning: true,
            font_features: None,
            font_variations: None,
            font_optical_sizing: Default::default(),
            font_style_italic: false,
            letter_spacing: Default::default(),
            word_spacing: Default::default(),
            line_height: TextLineHeight::Normal,
            text_transform: TextTransform::None,
        };

        let mut label_ts = textstyle(&label_style, &None);
        label_ts.set_foreground_paint(&paint);

        let mut label_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        label_builder.push_style(&label_ts);
        label_builder.add_text(label);
        let mut label_paragraph = label_builder.build();
        label_paragraph.layout(width);
        label_paragraph.paint(canvas, Point::new(x, y));

        // Example text
        let text_style = TextStyleRec {
            text_decoration: None,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: Default::default(),
            font_width: None,
            font_kerning: true,
            font_features: None,
            font_variations: None,
            font_optical_sizing: Default::default(),
            font_style_italic: false,
            letter_spacing: Default::default(),
            word_spacing: Default::default(),
            line_height: line_height,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(
            "The quick brown fox jumps over the lazy dog. This demonstrates line height spacing.",
        );
        let mut paragraph = para_builder.build();
        paragraph.layout(width);
        paragraph.paint(canvas, Point::new(x, y + 30.0));
    };

    let mut y_pos = start_y + 20.0;

    // Section 1: Normal vs Fixed Line Heights
    let section_style = TextStyleRec::from_font("Geist", 16.0);
    let mut section_ts = textstyle(&section_style, &None);
    section_ts.set_foreground_paint(&paint);

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("1. Normal vs Fixed Line Heights");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1300.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 40.0;

    // Row 1: Normal, Tight, Normal, Comfortable
    let row1_heights = [
        (TextLineHeight::Normal, "Normal (Default)"),
        (TextLineHeight::Fixed(16.0), "Tight (16px)"),
        (TextLineHeight::Fixed(20.0), "Normal (20px)"),
        (TextLineHeight::Fixed(24.0), "Comfortable (24px)"),
    ];

    for (i, (line_height, label)) in row1_heights.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, line_height.clone());
    }
    y_pos += row_height + section_spacing;

    // Row 2: Normal, Loose, Very Loose, Extra Loose
    let row2_heights = [
        (TextLineHeight::Normal, "Normal (Default)"),
        (TextLineHeight::Fixed(28.0), "Loose (28px)"),
        (TextLineHeight::Fixed(32.0), "Very Loose (32px)"),
        (TextLineHeight::Fixed(36.0), "Extra Loose (36px)"),
    ];

    for (i, (line_height, label)) in row2_heights.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, line_height.clone());
    }
    y_pos += row_height + section_spacing;

    // Section 2: Percentage Line Heights
    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("2. Percentage Line Heights");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1300.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 40.0;

    // Row 3: Normal, 100%, 120%, 140%
    let row3_heights = [
        (TextLineHeight::Normal, "Normal (Default)"),
        (TextLineHeight::Factor(1.0), "100% (Tight)"),
        (TextLineHeight::Factor(1.2), "120% (Normal)"),
        (TextLineHeight::Factor(1.4), "140% (Comfortable)"),
    ];

    for (i, (line_height, label)) in row3_heights.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, line_height.clone());
    }
    y_pos += row_height + section_spacing;

    // Row 4: Normal, 160%, 180%, 200%
    let row4_heights = [
        (TextLineHeight::Normal, "Normal (Default)"),
        (TextLineHeight::Factor(1.6), "160% (Loose)"),
        (TextLineHeight::Factor(1.8), "180% (Very Loose)"),
        (TextLineHeight::Factor(2.0), "200% (Extra Loose)"),
    ];

    for (i, (line_height, label)) in row4_heights.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, line_height.clone());
    }
    y_pos += row_height + section_spacing;

    // Section 3: Edge Cases - Zero and Negative Values
    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("3. Edge Cases - Zero and Very Tight Values");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1300.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 40.0;

    // Row 5: Normal, Very Tight, Near Zero, Zero
    let row5_heights = [
        (TextLineHeight::Normal, "Normal (Reference)"),
        (TextLineHeight::Fixed(8.0), "Very Tight (8px)"),
        (TextLineHeight::Fixed(1.0), "Near Zero (1px)"),
        (TextLineHeight::Fixed(0.0), "Zero (0px)"),
    ];

    for (i, (line_height, label)) in row5_heights.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, line_height.clone());
    }
    y_pos += row_height + section_spacing;

    // Row 6: Normal, Very Tight Percent, Near Zero Percent, Zero Percent
    let row6_heights = [
        (TextLineHeight::Normal, "Normal (Reference)"),
        (TextLineHeight::Factor(0.4), "Very Tight (40%)"),
        (TextLineHeight::Factor(0.05), "Near Zero (5%)"),
        (TextLineHeight::Factor(0.0), "Zero (0%)"),
    ];

    for (i, (line_height, label)) in row6_heights.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, line_height.clone());
    }

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/type_line_height.png"),
        bytes,
    )
    .unwrap();
    println!("Generated golden_type_line_height.png");
}
