use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};
use std::fs;

fn main() {
    // Create a surface to accommodate all the casual rows
    let mut surface = surfaces::raster_n32_premul((1200, 2000)).unwrap();
    let canvas = surface.canvas();

    // Clear the canvas with white background
    canvas.clear(Color::WHITE);

    // Create a paint for text
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Recursive variable font
    let font_mgr = FontMgr::new();
    let recursive_font_data = fs::read(
        "../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf",
    )
    .unwrap();
    let base_typeface = font_mgr.new_from_data(&recursive_font_data, None).unwrap();

    // Define the casual values we want to demonstrate (0 to 1 in 0.1 increments)
    // CASL axis typically ranges from 0 (linear) to 1 (casual)
    let casual_values = vec![0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

    // Create a paragraph style
    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    // Create a font collection and add the variable font
    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(base_typeface.clone(), Some("Recursive"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    font_collection.set_default_font_manager(font_mgr.clone(), None);

    // Simple row layout parameters
    let start_x = 80.0;
    let start_y = 120.0;
    let font_size = 24.0;

    // Draw title using cg TextStyle
    let title_style = TextStyleRec::from_font("Recursive", 32.0);

    let mut title_ts = textstyle(&title_style, &None);
    title_ts.set_foreground_paint(&paint);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text("Variable Font Casual (CASL) Demo");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1100.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 80.0));

    // Draw subtitle using cg TextStyle
    let subtitle_style = TextStyleRec::from_font("Recursive", 16.0);
    let mut subtitle_ts = textstyle(&subtitle_style, &None);
    subtitle_ts.set_foreground_paint(&paint);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_ts);
    subtitle_builder
        .add_text("Casual range: 0.0 (linear) to 1.0 (casual) in 0.1 increments (Recursive font)");
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1100.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 30.0));

    // Draw simple rows of casual variations using cg TextStyle
    let mut y_pos = start_y + 40.0; // Add 40px space after subtitle
    for (i, &casual) in casual_values.iter().enumerate() {
        // Add subtle alternating background for better readability
        if i % 2 == 1 {
            let mut bg_paint = Paint::default();
            bg_paint.set_color(Color::from_argb(255, 248, 248, 248));
            canvas.draw_rect(
                skia_safe::Rect::new(start_x - 10.0, y_pos - 5.0, start_x + 1010.0, y_pos + 55.0),
                &bg_paint,
            );
        }

        // Create a paragraph builder
        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);

        // Create cg TextStyle with specific casual value
        let text_style = TextStyleRec {
            font_variations: Some(vec![FontVariation {
                axis: "CASL".to_string(),
                value: casual,
            }]),
            ..TextStyleRec::from_font("Recursive", font_size)
        };

        // Convert to Skia TextStyle using our textstyle() function
        let mut skia_text_style = textstyle(&text_style, &None);
        skia_text_style.set_foreground_paint(&paint);
        para_builder.push_style(&skia_text_style);
        let text = format!(
            "The quick brown fox jumps over the lazy dog (casual: {:.1})",
            casual
        );
        para_builder.add_text(&text);

        // Build and layout the paragraph
        let mut paragraph = para_builder.build();
        paragraph.layout(1000.0); // Slightly narrower for better readability

        // Draw the paragraph
        paragraph.paint(canvas, Point::new(start_x, y_pos));

        y_pos += 60.0; // More space between rows for better visibility
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write("goldens/type_var_casl.png", bytes).unwrap();

    println!("Variable font casual demo saved to goldens/type_var_casl.png");
}
