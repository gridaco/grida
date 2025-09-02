use grida_canvas_fontgen::fontgen::{
    custom_emoji_font, custom_emoji_ttf, test_write_fonts_basic, DynFontManager,
};
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Point};
use std::collections::HashMap;

// Static emoji data - embedded at compile time from fixtures
static EMOJI_DATA: [(&char, &'static [u8]); 15] = [
    // Basic emojis
    (
        &'❤',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/2764.png"),
    ),
    (
        &'⭐',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/2b50.png"),
    ),
    (
        &'👍',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f44d.png"),
    ),
    (
        &'💩',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f4a9.png"),
    ),
    (
        &'💰',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f4b0.png"),
    ),
    (
        &'💻',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f4bb.png"),
    ),
    (
        &'🔗',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f517.png"),
    ),
    (
        &'🔥',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f525.png"),
    ),
    (
        &'😁',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f601.png"),
    ),
    (
        &'😂',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f602.png"),
    ),
    (
        &'😍',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f60d.png"),
    ),
    (
        &'😎',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f60e.png"),
    ),
    (
        &'🎨',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f3a8.png"),
    ),
    (
        &'🧑',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f9d1.png"),
    ),
    (
        &'🎨',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f3a8.png"),
    ),
];

// Helper function to get PNG data for a character
fn get_png_data_for_char(char_code: char) -> Option<Vec<u8>> {
    EMOJI_DATA
        .iter()
        .find(|(emoji_char, _)| **emoji_char == char_code)
        .map(|(_, png_data)| png_data.to_vec())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating custom emoji fonts with DynFontManager using real PNG data...");

    // Create a new dynamic font manager
    let mut font_manager = DynFontManager::new();

    // Test the new write-fonts implementation
    println!("\n--- Testing write-fonts Integration ---");
    match test_write_fonts_basic() {
        Ok(ttf_data) => {
            println!("✅ write-fonts test successful: {} bytes", ttf_data.len());

            // Save the write-fonts generated font for comparison
            std::fs::write("write_fonts_test.ttf", &ttf_data).unwrap();
            println!("💾 Saved write-fonts test font to: write_fonts_test.ttf");
        }
        Err(e) => {
            eprintln!("❌ write-fonts test failed: {}", e);
        }
    }

    // Example 1: Create and manage a single font family
    println!("\n=== Creating Font Family ===");

    // Create a single emoji font family
    font_manager.create_family(
        "Apple Color Emoji Partial".to_string(),
        "Regular".to_string(),
    )?;
    println!("Created font family: Apple Color Emoji Partial");

    // Example 2: Add glyphs to the single font family
    println!("\n=== Adding Glyphs to Font Family ===");

    // Add all emoji glyphs to Apple Color Emoji Partial
    let all_emoji_chars = [
        '❤', '⭐', '👍', '💩', '💰', '💻', '🔗', '🔥', '🎨', '🧑', '😁', '😂', '😍', '😎',
    ];
    for &emoji_char in &all_emoji_chars {
        if let Some(png_data) = get_png_data_for_char(emoji_char) {
            let data_len = png_data.len();
            font_manager.add_char_glyph("Apple Color Emoji Partial", emoji_char, png_data)?;
            println!(
                "Added {} emoji glyph to Apple Color Emoji Partial ({} bytes)",
                emoji_char, data_len
            );
        }
    }

    println!(
        "Added {} emoji glyphs to Apple Color Emoji Partial",
        all_emoji_chars.len()
    );

    // Example 3: Explore the font manager state
    println!("\n=== Font Manager State ===");
    println!("Total font families: {}", font_manager.family_count());
    println!(
        "Total glyphs across all families: {}",
        font_manager.total_glyph_count()
    );
    println!("Font family names: {:?}", font_manager.get_family_names());

    if let Some(default_family) = font_manager.get_default_family() {
        println!(
            "Default font family: {} ({} glyphs)",
            default_family.name,
            default_family.glyph_count()
        );
    }

    // Example 4: Generate and save TTF file
    println!("\n=== Generating TTF File ===");

    // Save Apple Color Emoji Partial as the main font file
    font_manager
        .save_family_as_ttf("Apple Color Emoji Partial", "apple_color_emoji_partial.ttf")?;

    // Example 5: Demonstrate font family operations
    println!("\n=== Font Family Operations ===");

    // Check if the font family contains specific characters
    println!(
        "Apple Color Emoji Partial contains '❤': {}",
        font_manager
            .get_family("Apple Color Emoji Partial")
            .unwrap()
            .has_char('❤')
    );
    println!(
        "Apple Color Emoji Partial contains '🔥': {}",
        font_manager
            .get_family("Apple Color Emoji Partial")
            .unwrap()
            .has_char('🔥')
    );
    println!(
        "Apple Color Emoji Partial contains '😁': {}",
        font_manager
            .get_family("Apple Color Emoji Partial")
            .unwrap()
            .has_char('😁')
    );

    // Get supported characters for the font family
    if let Some(emoji_family) = font_manager.get_family("Apple Color Emoji Partial") {
        println!(
            "Apple Color Emoji Partial supported characters: {:?}",
            emoji_family.supported_chars()
        );
    }

    // Example 6: Change default font family
    println!("\n=== Changing Default Font Family ===");
    font_manager.set_default_family("Apple Color Emoji Partial")?;
    println!("Changed default font family to Apple Color Emoji Partial");

    if let Some(default_family) = font_manager.get_default_family() {
        println!(
            "New default font family: {} ({} glyphs)",
            default_family.name,
            default_family.glyph_count()
        );
    }

    // Example 7: Demonstrate font capabilities (without generating extra files)
    println!("\n=== Font Capabilities Demo ===");

    // Show that we can create individual emoji fonts if needed
    let emoji_char = '🎨';
    if let Some(png_data) = get_png_data_for_char(emoji_char) {
        match custom_emoji_ttf(emoji_char, &png_data) {
            Ok(ttf_data) => {
                println!(
                    "Successfully created single emoji font with {} bytes (not saved to file)",
                    ttf_data.len()
                );
            }
            Err(e) => {
                eprintln!("Failed to create single emoji font: {}", e);
            }
        }
    }

    // Show multi-emoji font creation capability
    let mut emoji_mappings = HashMap::new();
    if let Some(png_data) = get_png_data_for_char('❤') {
        emoji_mappings.insert('❤', png_data);
    }
    if let Some(png_data) = get_png_data_for_char('⭐') {
        emoji_mappings.insert('⭐', png_data);
    }
    if let Some(png_data) = get_png_data_for_char('👍') {
        emoji_mappings.insert('👍', png_data);
    }

    if !emoji_mappings.is_empty() {
        match custom_emoji_font(emoji_mappings) {
            Ok(ttf_data) => {
                println!(
                    "Successfully created multi-emoji font with {} bytes (not saved to file)",
                    ttf_data.len()
                );
            }
            Err(e) => {
                eprintln!("Failed to create multi-emoji font: {}", e);
            }
        }
    }

    // Example 8: Show PNG data statistics
    println!("\n=== PNG Data Statistics ===");
    for (emoji_char, png_data) in EMOJI_DATA.iter() {
        println!("{}: {} bytes", emoji_char, png_data.len());
    }

    // NEW: Create visual representation and save as golden PNG
    println!("\n=== Creating Golden PNG Output ===");
    create_golden_png(&font_manager)?;

    println!("\n=== Summary ===");
    println!(
        "Created {} font families with {} total glyphs",
        font_manager.family_count(),
        font_manager.total_glyph_count()
    );
    println!("Generated TTF files for each font family");
    println!(
        "Used real PNG data from {} emoji fixtures",
        EMOJI_DATA.len()
    );
    println!("Custom emoji font generation complete!");

    Ok(())
}

/// Create a visual representation of the emoji fonts and save as golden PNG
fn create_golden_png(font_manager: &DynFontManager) -> Result<(), Box<dyn std::error::Error>> {
    // Create a surface to draw on
    let (width, height) = (1200, 800);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Prepare paint for text
    let mut text_paint = Paint::default();
    text_paint.set_anti_alias(true);
    text_paint.set_color(Color::BLACK);

    // Load font for text
    let font_mgr = FontMgr::new();
    let geist = font_mgr.new_from_data(&[], None).unwrap();

    let title_font = Font::new(geist.clone(), 32.0);
    let header_font = Font::new(geist.clone(), 24.0);
    let body_font = Font::new(geist.clone(), 18.0);
    let emoji_font = Font::new(geist, 16.0);

    // Draw title
    canvas.draw_str(
        "Custom Emoji Font Generation & Rendering Demo",
        Point::new(50.0, 50.0),
        &title_font,
        &text_paint,
    );

    // Draw subtitle explaining the process
    canvas.draw_str(
        "PNG data → Font glyphs → Text rendering (no images drawn)",
        Point::new(50.0, 85.0),
        &body_font,
        &text_paint,
    );

    let mut y_offset = 120.0;
    let margin = 50.0;
    let emoji_size = 80.0;
    let spacing = 100.0;

    // Draw font family information
    for family_name in font_manager.get_family_names() {
        if let Some(family) = font_manager.get_family(&family_name) {
            // Draw family header
            canvas.draw_str(
                &format!(
                    "Font Family: {} ({} glyphs)",
                    family_name,
                    family.glyph_count()
                ),
                Point::new(margin, y_offset),
                &header_font,
                &text_paint,
            );
            y_offset += 40.0;

            // Draw emoji characters as text (demonstrating font rendering)
            let mut x_offset = margin;
            for char_code in family.supported_chars() {
                // Draw the emoji character using the generated font
                canvas.draw_str(
                    &format!("{}", char_code),
                    Point::new(x_offset, y_offset + emoji_size),
                    &emoji_font,
                    &text_paint,
                );

                // Draw character code below emoji
                canvas.draw_str(
                    &format!("U+{:04X}", char_code as u32),
                    Point::new(
                        x_offset + emoji_size / 2.0 - 20.0,
                        y_offset + emoji_size + 25.0,
                    ),
                    &emoji_font,
                    &text_paint,
                );

                x_offset += spacing;
            }

            y_offset += emoji_size + 60.0;
        }
    }

    // Draw statistics
    y_offset += 20.0;
    canvas.draw_str(
        &format!("Total Font Families: {}", font_manager.family_count()),
        Point::new(margin, y_offset),
        &body_font,
        &text_paint,
    );
    y_offset += 30.0;
    canvas.draw_str(
        &format!("Total Glyphs: {}", font_manager.total_glyph_count()),
        Point::new(margin, y_offset),
        &body_font,
        &text_paint,
    );

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/type_emoji_fontgen.png", data.as_bytes()).unwrap();
    println!("Saved golden PNG to: goldens/type_emoji_fontgen.png");

    Ok(())
}
