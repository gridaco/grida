use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};
use std::fs;

fn main() {
    // Create a surface to accommodate all the decoration examples
    let mut surface = surfaces::raster_n32_premul((1200, 2200)).unwrap();
    let canvas = surface.canvas();

    // Clear the canvas with white background
    canvas.clear(Color::WHITE);

    // Create a paint for text
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Geist variable font
    let font_mgr = FontMgr::new();
    let geist_font_data = fs::read("fonts/Geist/Geist-VariableFont_wght.ttf").unwrap();
    let base_typeface = font_mgr.new_from_data(&geist_font_data, None).unwrap();

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

    // Layout parameters - optimized for better space usage
    let start_x = 60.0;
    let start_y = 100.0;
    let font_size = 20.0;
    let line_height = 45.0;
    let section_spacing = 15.0;

    // Draw title
    let title_style = TextStyleRec::from_font("Geist", 30.0);
    let mut title_ts = textstyle(&title_style, &None);
    title_ts.set_foreground_paint(&paint);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text("Text Decoration Demo");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1100.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 60.0));

    // Draw subtitle
    let subtitle_style = TextStyleRec::from_font("Geist", 14.0);
    let mut subtitle_ts = textstyle(&subtitle_style, &None);
    subtitle_ts.set_foreground_paint(&paint);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_ts);
    subtitle_builder.add_text("Demonstrating underline, overline, line-through with various styles, colors, and thickness");
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1100.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 25.0));

    // Section 1: Basic Text Decorations
    let mut y_pos = start_y + 20.0;

    // Section title
    let section_style = TextStyleRec::from_font("Geist", 18.0);
    let mut section_ts = textstyle(&section_style, &None);
    section_ts.set_foreground_paint(&paint);

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("1. Basic Text Decorations");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    // Basic decorations
    let decorations = [
        (TextDecoration::None, "No Decoration"),
        (TextDecoration::Underline, "Underlined Text"),
        (TextDecoration::Overline, "Overlined Text"),
        (TextDecoration::LineThrough, "Strikethrough Text"),
    ];

    for (decoration, label) in decorations.iter() {
        let text_style = TextStyleRec {
            text_decoration: *decoration,
            text_decoration_color: Some(CGColor::RED),
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: None,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Section 2: Decoration Styles
    y_pos += section_spacing;

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("2. Decoration Styles");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    let styles = [
        (TextDecorationStyle::Solid, "Solid Underline"),
        (TextDecorationStyle::Double, "Double Underline"),
        (TextDecorationStyle::Dotted, "Dotted Underline"),
        (TextDecorationStyle::Dashed, "Dashed Underline"),
    ];

    for (style, label) in styles.iter() {
        let text_style = TextStyleRec {
            text_decoration: TextDecoration::Underline,
            text_decoration_color: None,
            text_decoration_style: Some(*style),
            text_decoration_skip_ink: None,
            text_decoration_thinkness: None,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Section 3: Decoration Colors
    y_pos += section_spacing;

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("3. Decoration Colors");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    let colors = [
        (CGColor::RED, "Red Underline"),
        (CGColor::GREEN, "Green Underline"),
        (CGColor::BLUE, "Blue Underline"),
        (CGColor::from_rgba(255, 165, 0, 255), "Orange Underline"),
    ];

    for (color, label) in colors.iter() {
        let text_style = TextStyleRec {
            text_decoration: TextDecoration::Underline,
            text_decoration_color: Some(*color),
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: None,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        // Create a paint with the same color as the decoration for better visibility
        let mut text_paint = Paint::default();
        text_paint.set_anti_alias(true);
        text_paint.set_color(Color::BLACK); // Keep text black for readability
        ts.set_foreground_paint(&text_paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Section 4: Decoration Thickness
    y_pos += section_spacing;

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("4. Decoration Thickness");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    let thicknesses = [
        (0.5, "Thin Underline (0.5x)"),
        (1.0, "Normal Underline (1.0x)"),
        (2.0, "Thick Underline (2.0x)"),
        (3.0, "Very Thick Underline (3.0x)"),
    ];

    for (thickness, label) in thicknesses.iter() {
        let text_style = TextStyleRec {
            text_decoration: TextDecoration::Underline,
            text_decoration_color: None,
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: Some(*thickness),
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Section 5: Skip Ink Settings
    y_pos += section_spacing;

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("5. Skip Ink Settings");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    let skip_ink_settings = [
        (true, "Skip Ink Enabled (default)"),
        (false, "Skip Ink Disabled"),
    ];

    for (skip_ink, label) in skip_ink_settings.iter() {
        let text_style = TextStyleRec {
            text_decoration: TextDecoration::Underline,
            text_decoration_color: Some(CGColor(255, 0, 0, 255)),
            text_decoration_style: None,
            text_decoration_skip_ink: Some(*skip_ink),
            text_decoration_thinkness: None,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Section 6: Combined Examples
    y_pos += section_spacing;

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text("6. Combined Examples");
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    let combined_examples = [
        (
            TextDecoration::Underline,
            Some(TextDecorationStyle::Dashed),
            Some(CGColor(128, 0, 128, 255)),
            Some(2.0),
            "Purple Dashed Thick Underline",
        ),
        (
            TextDecoration::Overline,
            Some(TextDecorationStyle::Double),
            Some(CGColor(255, 140, 0, 255)),
            Some(1.5),
            "Orange Double Thick Overline",
        ),
        (
            TextDecoration::LineThrough,
            Some(TextDecorationStyle::Dotted),
            Some(CGColor(0, 128, 128, 255)),
            Some(2.5),
            "Teal Dotted Very Thick Strikethrough",
        ),
    ];

    for (decoration, style, color, thickness, label) in combined_examples.iter() {
        let text_style = TextStyleRec {
            text_decoration: *decoration,
            text_decoration_color: *color,
            text_decoration_style: *style,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: *thickness,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Section 7: Multiple Decorations (if supported)
    y_pos += section_spacing;

    let mut section_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    section_builder.push_style(&section_ts);
    section_builder.add_text(
        "7. Multiple Decorations (Note: Current implementation supports one decoration at a time)",
    );
    let mut section_paragraph = section_builder.build();
    section_paragraph.layout(1100.0);
    section_paragraph.paint(canvas, Point::new(start_x, y_pos));
    y_pos += 35.0;

    // Show examples of different decorations on the same text
    let multi_text = "Multiple Decorations Example";
    let decorations_multi = [
        TextDecoration::Underline,
        TextDecoration::Overline,
        TextDecoration::LineThrough,
    ];

    for decoration in decorations_multi.iter() {
        let text_style = TextStyleRec {
            text_decoration: *decoration,
            text_decoration_color: Some(CGColor(100, 100, 100, 255)),
            text_decoration_style: Some(TextDecorationStyle::Solid),
            text_decoration_skip_ink: None,
            text_decoration_thinkness: Some(1.5),
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(400),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };

        let mut ts = textstyle(&text_style, &None);
        ts.set_foreground_paint(&paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(multi_text);
        let mut paragraph = para_builder.build();
        paragraph.layout(1100.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write("goldens/type_decoration.png", bytes).unwrap();
    println!("Generated golden_type_decoration.png");
}
