use skia_safe::{Canvas, Color, Font, FontMgr, FontStyle, Paint, Point, Surface, Typeface};
use std::fs;

fn main() {
    // Create a surface to draw on
    let mut surface = Surface::new_raster_n32_premul((400, 800)).unwrap();
    let canvas = surface.canvas();

    // Clear the canvas with white background
    canvas.clear(Color::WHITE);

    // Create a paint for text
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Caveat font from local resources
    let font_data = fs::read("resources/Caveat-VariableFont_wght.ttf").unwrap();
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(&font_data, None).unwrap();
    let font = Font::new(typeface, 24.0);

    // Draw text with Caveat
    let text = "Hello, Skia!";
    let point = Point::new(50.0, 100.0);
    canvas.draw_str(text, point, &font, &paint);

    // Try to load Bungee font
    if let Ok(bungee_data) = fs::read("resources/Bungee-Regular.ttf") {
        if let Some(bungee_typeface) = font_mgr.new_from_data(&bungee_data, None) {
            let bungee_font = Font::new(bungee_typeface, 24.0);
            // Draw text with Bungee
            let bungee_point = Point::new(50.0, 200.0);
            canvas.draw_str("Bungee Font!", bungee_point, &bungee_font, &paint);
        }
    } else {
        // If Bungee font is not found, draw a message
        let fallback_point = Point::new(50.0, 200.0);
        canvas.draw_str("Bungee font not found", fallback_point, &font, &paint);
    }

    // Try to load Fruktur font
    if let Ok(fruktur_data) = fs::read("resources/Fruktur-Regular.ttf") {
        if let Some(fruktur_typeface) = font_mgr.new_from_data(&fruktur_data, None) {
            let fruktur_font = Font::new(fruktur_typeface, 24.0);
            // Draw text with Fruktur
            let fruktur_point = Point::new(50.0, 300.0);
            canvas.draw_str("Fruktur Font!", fruktur_point, &fruktur_font, &paint);
        }
    } else {
        // If Fruktur font is not found, draw a message
        let fallback_point = Point::new(50.0, 300.0);
        canvas.draw_str("Fruktur font not found", fallback_point, &font, &paint);
    }

    // Try to load VT323 font
    if let Ok(vt323_data) = fs::read("resources/VT323-Regular.ttf") {
        if let Some(vt323_typeface) = font_mgr.new_from_data(&vt323_data, None) {
            let vt323_font = Font::new(vt323_typeface, 24.0);
            // Draw text with VT323
            let vt323_point = Point::new(50.0, 400.0);
            canvas.draw_str("VT323 Font!", vt323_point, &vt323_font, &paint);
        }
    } else {
        // If VT323 font is not found, draw a message
        let fallback_point = Point::new(50.0, 400.0);
        canvas.draw_str("VT323 font not found", fallback_point, &font, &paint);
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode_to_data(skia_safe::EncodedImageFormat::PNG)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write("text_output.png", bytes).unwrap();
}
