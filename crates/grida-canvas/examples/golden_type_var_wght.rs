use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};

fn main() {
    // Create a surface to accommodate all the weight rows
    let mut surface = surfaces::raster_n32_premul((1200, 2000)).unwrap();
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

    // Define the weights we want to demonstrate (100 to 1000 in 25-step increments)
    let weights = vec![
        25, 50, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475,
        500, 525, 550, 575, 600, 625, 650, 675, 700, 725, 750, 775, 800, 825, 850, 875, 900, 925,
        950, 975, 1000,
    ];

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

    // Simple row layout parameters
    let start_x = 80.0;
    let start_y = 120.0;
    let font_size = 20.0;

    // Draw title using cg TextStyle
    let title_style = TextStyleRec::from_font("Geist", 32.0);
    let mut title_ts = textstyle(&title_style, &None);
    title_ts.set_foreground_paint(&paint);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_ts);
    title_builder.add_text("Variable Font Weight Demo");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1100.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 80.0));

    // Draw subtitle using cg TextStyle
    let subtitle_style = TextStyleRec::from_font("Geist", 16.0);
    let mut subtitle_ts = textstyle(&subtitle_style, &None);
    subtitle_ts.set_foreground_paint(&paint);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_ts);
    subtitle_builder.add_text("Weight range: 100-1000 in 25-step increments");
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1100.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 30.0));

    // Draw simple rows of weight variations using cg TextStyle
    let mut y_pos = start_y + 40.0; // Add 40px space after subtitle
    for (i, &weight) in weights.iter().enumerate() {
        // Add subtle alternating background for better readability
        if i % 2 == 1 {
            let mut bg_paint = Paint::default();
            bg_paint.set_color(Color::from_argb(255, 248, 248, 248));
            canvas.draw_rect(
                skia_safe::Rect::new(start_x - 10.0, y_pos - 5.0, start_x + 1010.0, y_pos + 45.0),
                &bg_paint,
            );
        }

        // Create a paragraph builder
        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);

        // Create cg TextStyle with specific weight
        let text_style = TextStyleRec {
            text_decoration: None,
            font_family: "Geist".to_string(),
            font_size: font_size,
            font_weight: FontWeight::new(weight),
            font_features: None,
            font_variations: None,
            font_optical_sizing: Default::default(),
            font_style_italic: false,
            letter_spacing: Default::default(),
            word_spacing: Default::default(),
            line_height: Default::default(),
            text_transform: cg::cg::types::TextTransform::None,
        };

        // Convert to Skia TextStyle using our textstyle() function
        let mut skia_text_style = textstyle(&text_style, &None);
        skia_text_style.set_foreground_paint(&paint);

        para_builder.push_style(&skia_text_style);
        let text = format!("The quick brown fox jumps over the lazy dog ({})", weight);
        para_builder.add_text(&text);

        // Build and layout the paragraph
        let mut paragraph = para_builder.build();
        paragraph.layout(1000.0); // Slightly narrower for better readability

        // Draw the paragraph
        paragraph.paint(canvas, Point::new(start_x, y_pos));

        y_pos += 50.0; // More space between rows
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/type_var_wght.png"),
        bytes,
    )
    .unwrap();

    println!("Variable font weight demo saved to goldens/type_var_wght.png");
}
