use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TextStyle, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};
use std::fs;

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
    let geist_font_data = fs::read("fonts/Geist/Geist-VariableFont_wght.ttf").unwrap();
    let base_typeface = font_mgr.new_from_data(&geist_font_data, None).unwrap();

    // Define the weights we want to demonstrate (100 to 1000 in 25-step increments)
    let weights = vec![
        100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 500, 525,
        550, 575, 600, 625, 650, 675, 700, 725, 750, 775, 800, 825, 850, 875, 900, 925, 950, 975,
        1000,
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

    // Draw title
    let mut title_style = TextStyle::new();
    title_style.set_foreground_paint(&paint);
    title_style.set_font_size(32.0);
    title_style.set_font_families(&["Geist"]);

    let mut title_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    title_builder.push_style(&title_style);
    title_builder.add_text("Variable Font Weight Demo");
    let mut title_paragraph = title_builder.build();
    title_paragraph.layout(1100.0);
    title_paragraph.paint(canvas, Point::new(start_x, start_y - 80.0));

    // Draw subtitle
    let mut subtitle_style = TextStyle::new();
    subtitle_style.set_foreground_paint(&paint);
    subtitle_style.set_font_size(16.0);
    subtitle_style.set_font_families(&["Geist"]);

    let mut subtitle_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    subtitle_builder.push_style(&subtitle_style);
    subtitle_builder.add_text("Weight range: 100-1000 in 25-step increments");
    let mut subtitle_paragraph = subtitle_builder.build();
    subtitle_paragraph.layout(1100.0);
    subtitle_paragraph.paint(canvas, Point::new(start_x, start_y - 30.0));

    // Draw simple rows of weight variations
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

        // Create text style with specific weight
        let mut text_style = TextStyle::new();
        text_style.set_foreground_paint(&paint);
        text_style.set_font_size(font_size);
        text_style.set_font_families(&["Geist"]);

        // Create font arguments with weight variation
        let coordinates = vec![skia_safe::font_arguments::variation_position::Coordinate {
            axis: skia_safe::FourByteTag::from(('w', 'g', 'h', 't')),
            value: weight as f32,
        }];
        let variation_position = skia_safe::font_arguments::VariationPosition {
            coordinates: &coordinates[..],
        };
        let font_args =
            skia_safe::FontArguments::new().set_variation_design_position(variation_position);

        // Set font arguments on text style
        text_style.set_font_arguments(&font_args);

        para_builder.push_style(&text_style);
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
    std::fs::write("goldens/type_var_wght.png", bytes).unwrap();

    println!("Variable font weight demo saved to goldens/type_var_wght.png");
}
