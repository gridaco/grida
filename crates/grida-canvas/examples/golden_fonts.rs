use skia_safe::textlayout::FontCollection;
use skia_safe::textlayout::{
    ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TextStyle, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Point};

#[path = "../tests/fonts.rs"]
mod fonts;

fn main() {
    // Create a surface to draw on
    let mut surface = surfaces::raster_n32_premul((400, 800)).unwrap();
    let canvas = surface.canvas();

    // Clear the canvas with white background
    canvas.clear(Color::WHITE);

    // Create a paint for text
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Caveat font from embedded resources
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(fonts::CAVEAT_VF, None).unwrap();
    let font = Font::new(typeface, 24.0);

    // Draw text with Caveat
    let text = "Hello, Skia!";
    let point = Point::new(50.0, 100.0);
    canvas.draw_str(text, point, &font, &paint);

    // Draw text with Bungee
    if let Some(bungee_typeface) = font_mgr.new_from_data(fonts::BUNGEE_REGULAR, None) {
        let bungee_font = Font::new(bungee_typeface, 24.0);
        let bungee_point = Point::new(50.0, 200.0);
        canvas.draw_str("Bungee Font!", bungee_point, &bungee_font, &paint);
    }

    // Draw text with Recursive
    if let Some(recursive_typeface) = font_mgr.new_from_data(fonts::RECURSIVE_VF, None) {
        let recursive_font = Font::new(recursive_typeface, 24.0);
        let recursive_point = Point::new(50.0, 300.0);
        canvas.draw_str("Recursive Font!", recursive_point, &recursive_font, &paint);
    }

    // Draw text and paragraph with VT323
    if let Some(vt323_typeface) = font_mgr.new_from_data(fonts::VT323_REGULAR, None) {
        let vt323_font = Font::new(vt323_typeface.clone(), 24.0);
        let vt323_point = Point::new(50.0, 400.0);
        canvas.draw_str("VT323 Font!", vt323_point, &vt323_font, &paint);

        let paragraph_text = "Welcome to the VT323 font demo! This is a monospace font that's perfect for coding and retro-style interfaces. It has a distinctive pixelated look that makes it stand out. The font was designed by Peter Hull and is inspired by the classic VT320 terminal.";
        let paragraph_point = Point::new(50.0, 450.0);

        let mut paragraph_style = ParagraphStyle::new();
        paragraph_style.set_text_direction(TextDirection::LTR);
        paragraph_style.set_text_align(TextAlign::Left);

        let mut font_collection = FontCollection::new();
        let mut provider = TypefaceFontProvider::new();
        provider.register_typeface(
            font_mgr.new_from_data(fonts::VT323_REGULAR, None).unwrap(),
            Some("VT323"),
        );
        font_collection.set_asset_font_manager(Some(provider.into()));
        font_collection.set_default_font_manager(font_mgr.clone(), None);

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &font_collection);

        let mut text_style = TextStyle::new();
        text_style.set_foreground_paint(&paint);
        text_style.set_font_size(20.0);
        text_style.set_font_families(&["VT323"]);
        para_builder.push_style(&text_style);
        para_builder.add_text(paragraph_text);

        let mut paragraph = para_builder.build();
        paragraph.layout(300.0);
        paragraph.paint(canvas, paragraph_point);
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write("goldens/fonts.png", bytes).unwrap();
}
