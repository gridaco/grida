use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};
use std::fs;

fn main() {
    // Create a surface to accommodate the color examples
    let mut surface = surfaces::raster_n32_premul((600, 800)).unwrap();
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

    // Layout parameters
    let start_x = 60.0;
    let start_y = 100.0;
    let font_size = 24.0;
    let line_height = 50.0;

    // Draw title
    let title_style = TextStyle::from_font("Geist", 32.0);
    let mut title_ts = textstyle(&title_style);
    title_ts.set_foreground_paint(&paint);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text("Text Decoration Colors Demo");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(700.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 60.0));

    // Draw subtitle
    let subtitle_style = TextStyle::from_font("Geist", 16.0);
    let mut subtitle_ts = textstyle(&subtitle_style);
    subtitle_ts.set_foreground_paint(&paint);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_ts);
    subtitle_builder.add_text("Demonstrating various colors for text decorations");
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(700.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 25.0));

    // Decoration Colors
    let mut y_pos = start_y + 20.0;

    let colors = [
        (CGColor::from_rgb(255, 0, 0), "Red Underline"),
        (CGColor::from_rgb(0, 255, 0), "Green Underline"),
        (CGColor::from_rgb(0, 0, 255), "Blue Underline"),
        (CGColor::from_rgb(255, 165, 0), "Orange Underline"),
        (CGColor::from_rgb(128, 0, 128), "Purple Underline"),
        (CGColor::from_rgb(0, 128, 128), "Teal Underline"),
        (CGColor::from_rgb(255, 20, 147), "Deep Pink Underline"),
        (CGColor::from_rgb(255, 215, 0), "Gold Underline"),
        (CGColor::from_rgb(75, 0, 130), "Indigo Underline"),
        (CGColor::from_rgb(220, 20, 60), "Crimson Underline"),
    ];

    for (color, label) in colors.iter() {
        let text_style = TextStyle {
            text_decoration: TextDecoration::Underline,
            text_decoration_color: Some(*color),
            text_decoration_style: None,
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

        let mut ts = textstyle(&text_style);
        // Keep text color black for readability
        let mut text_paint = Paint::default();
        text_paint.set_anti_alias(true);
        text_paint.set_color(Color::BLACK);
        ts.set_foreground_paint(&text_paint);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
        para_builder.push_style(&ts);
        para_builder.add_text(label);
        let mut paragraph = para_builder.build();
        paragraph.layout(700.0);
        paragraph.paint(canvas, Point::new(start_x, y_pos));
        y_pos += line_height;
    }

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write("goldens/type_decoration_color.png", bytes).unwrap();
    println!("Generated golden_type_decoration_color.png");
}
