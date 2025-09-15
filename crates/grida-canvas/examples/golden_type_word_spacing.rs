use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};

fn main() {
    // Create a surface to accommodate all the word spacing examples in rows
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
    title_builder.add_text("Word Spacing Demo - Row Layout");
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
        "Comparing different word spacing values side by side for better visual distinction",
    );
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1300.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 20.0));

    // Helper function to draw a text block with word spacing
    let draw_text_block = |canvas: &skia_safe::Canvas,
                           x: f32,
                           y: f32,
                           width: f32,
                           label: &str,
                           word_spacing: TextWordSpacing| {
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
            word_spacing: TextWordSpacing::Fixed(0.0),
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
            word_spacing: word_spacing,
            line_height: TextLineHeight::Normal,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(
            "The quick brown fox jumps over the lazy dog. This demonstrates word spacing.",
        );
        let mut paragraph = para_builder.build();
        paragraph.layout(width);
        paragraph.paint(canvas, Point::new(x, y + 30.0));
    };

    let mut y_pos = start_y + 20.0;

    // Section 1: Normal vs Fixed Word Spacing
    let section_style = TextStyleRec::from_font("Geist", 16.0);
    let mut section_ts = textstyle(&section_style, &None);
    section_ts.set_foreground_paint(&paint);

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("1. Normal vs Fixed Word Spacing");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1300.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 40.0;

    // Row 1: Normal, Tight, Normal, Wide
    let row1_spacings = [
        (TextWordSpacing::Fixed(0.0), "Normal (Default)"),
        (TextWordSpacing::Fixed(-2.0), "Tight (-2px)"),
        (TextWordSpacing::Fixed(0.0), "Normal (0px)"),
        (TextWordSpacing::Fixed(4.0), "Wide (4px)"),
    ];

    for (i, (word_spacing, label)) in row1_spacings.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, word_spacing.clone());
    }
    y_pos += row_height + section_spacing;

    // Row 2: Normal, Very Wide, Extra Wide, Maximum
    let row2_spacings = [
        (TextWordSpacing::Fixed(0.0), "Normal (Default)"),
        (TextWordSpacing::Fixed(8.0), "Very Wide (8px)"),
        (TextWordSpacing::Fixed(12.0), "Extra Wide (12px)"),
        (TextWordSpacing::Fixed(16.0), "Maximum (16px)"),
    ];

    for (i, (word_spacing, label)) in row2_spacings.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, word_spacing.clone());
    }
    y_pos += row_height + section_spacing;

    // Section 2: Percentage Word Spacing
    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("2. Percentage Word Spacing");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1300.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 40.0;

    // Row 3: Normal, 50%, 100%, 150%
    let row3_spacings = [
        (TextWordSpacing::Fixed(0.0), "Normal (Default)"),
        (TextWordSpacing::Factor(0.5), "50% (Tight)"),
        (TextWordSpacing::Factor(1.0), "100% (Normal)"),
        (TextWordSpacing::Factor(1.5), "150% (Wide)"),
    ];

    for (i, (word_spacing, label)) in row3_spacings.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, word_spacing.clone());
    }
    y_pos += row_height + section_spacing;

    // Row 4: Normal, 200%, 250%, 300%
    let row4_spacings = [
        (TextWordSpacing::Fixed(0.0), "Normal (Default)"),
        (TextWordSpacing::Factor(2.0), "200% (Very Wide)"),
        (TextWordSpacing::Factor(2.5), "250% (Extra Wide)"),
        (TextWordSpacing::Factor(3.0), "300% (Maximum)"),
    ];

    for (i, (word_spacing, label)) in row4_spacings.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, word_spacing.clone());
    }
    y_pos += row_height + section_spacing;

    // Section 3: Edge Cases - Zero and Negative Values
    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("3. Edge Cases - Zero and Negative Values");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1300.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 40.0;

    // Row 5: Normal, Zero, Small Negative, Big Negative (Fixed)
    let row5_spacings = [
        (TextWordSpacing::Fixed(0.0), "Normal (Reference)"),
        (TextWordSpacing::Fixed(0.0), "Zero (0px)"),
        (TextWordSpacing::Fixed(-8.0), "Small Negative (-8px)"),
        (TextWordSpacing::Fixed(-30.0), "Big Negative (-30px)"),
    ];

    for (i, (word_spacing, label)) in row5_spacings.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, word_spacing.clone());
    }
    y_pos += row_height + section_spacing;

    // Row 6: Normal, Zero Factor, Small Negative, Big Negative (Factor)
    let row6_spacings = [
        (TextWordSpacing::Fixed(0.0), "Normal (Reference)"),
        (TextWordSpacing::Factor(0.0), "Zero (0%)"),
        (TextWordSpacing::Factor(-0.5), "Small Negative (-50%)"),
        (TextWordSpacing::Factor(-1.5), "Big Negative (-150%)"),
    ];

    for (i, (word_spacing, label)) in row6_spacings.iter().enumerate() {
        let x = start_x + (i as f32) * (col_width + col_spacing);
        draw_text_block(canvas, x, y_pos, col_width, label, word_spacing.clone());
    }

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/type_word_spacing.png"),
        bytes,
    )
    .unwrap();
    println!("Generated golden_type_word_spacing.png");
}
