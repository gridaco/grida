//! Font Coverage Testing Tool
//!
//! A CLI utility for testing font coverage and rendering capabilities of TTF font files.
//! Tests fonts against multiple character sets including ASCII, CJK, Hebrew, emoji, and mixed text.
//!
//! Key Features:
//! - Isolated testing: Uses ONLY the specified font file (no system fonts)
//! - Comprehensive coverage: Tests multiple writing systems and character types
//! - Visual output: Generates PNG images showing exactly what the font can render
//! - Detailed reports: Creates text reports with test results and metadata
//!
//! Usage:
//!   cargo run --example clitool_font <FONT_FILE> -o <OUTPUT_PATH>
//!
//! Examples:
//!   cargo run --example clitool_font fonts/myfont.ttf -o output.png
//!   cargo run --example clitool_font fonts/myfont.ttf -o output.png -f 32.0
//!
//! Output Files:
//! - <OUTPUT_PATH>: PNG image showing font coverage across all character sets
//! - <OUTPUT_PATH>.txt: Detailed text report with test parameters and results
//!
//! Use Cases: Font development, quality assurance, localization testing, debugging

use clap::Parser;
use skia_safe::textlayout::{
    FontCollection, ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection,
    TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Path to the TTF font file to test
    #[arg(value_name = "FONT_FILE")]
    font_path: String,

    /// Output path for generated files (required)
    #[arg(short, long, value_name = "OUTPUT_PATH")]
    output: String,

    /// Font size for testing (default: 24.0)
    #[arg(short, long, default_value = "24.0")]
    font_size: f32,
}

// Test character sets
const ASCII_CHARS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789\n!@#$%^&*()_+-=[]{}|;':\",./<>?";
const CJK_CHARS: &str = "你好世界\nこんにちは世界\n안녕하세요 세계\nสวัสดีชาวโลก\nनमस्ते दुनिया";
const HEBREW_CHARS: &str = "שלום עולם\nבְּרֵאשִׁית בָּרָא אֱלֹהִים";
const EMOJI_CHARS: &str =
    "😀😃😄😁😆😅😂🤣\n❤️💔💖💗💘💝💕\n🚗🚕🚙🚌🚎🏎️🚓\n🌍🌎🌏🌐🌑🌒🌓\n🍎🍐🍊🍋🍌🍉🍇";
const MIXED_CHARS: &str = "Hello 世界! 🌍\nこんにちは! 😊\n안녕하세요! 🚗\nשלום! ❤️";

fn draw_section_title(
    canvas: &skia_safe::Canvas,
    title: &str,
    x: f32,
    y: f32,
    font_collection: &FontCollection,
) -> f32 {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::from_argb(255, 100, 100, 100));

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut builder = ParagraphBuilder::new(&paragraph_style, font_collection);

    let mut text_style = skia_safe::textlayout::TextStyle::new();
    text_style.set_foreground_paint(&paint);
    text_style.set_font_size(18.0);
    text_style.set_font_families(&["Test"]);

    builder.push_style(&text_style);
    builder.add_text(title);

    let mut paragraph = builder.build();
    paragraph.layout(800.0);
    paragraph.paint(canvas, Point::new(x, y));

    y + paragraph.height() + 10.0
}

fn draw_text_section(
    canvas: &skia_safe::Canvas,
    text: &str,
    x: f32,
    y: f32,
    font_size: f32,
    font_collection: &FontCollection,
) -> f32 {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut builder = ParagraphBuilder::new(&paragraph_style, font_collection);

    let mut text_style = skia_safe::textlayout::TextStyle::new();
    text_style.set_foreground_paint(&paint);
    text_style.set_font_size(font_size);
    text_style.set_font_families(&["Test"]);

    builder.push_style(&text_style);
    builder.add_text(text);

    let mut paragraph = builder.build();
    paragraph.layout(800.0);
    paragraph.paint(canvas, Point::new(x, y));

    y + paragraph.height() + 20.0
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // Validate font file exists
    if !Path::new(&cli.font_path).exists() {
        eprintln!("Error: Font file '{}' not found", cli.font_path);
        std::process::exit(1);
    }

    // Create output directory if it doesn't exist
    let output_path = Path::new(&cli.output);
    let output_dir = output_path.parent().unwrap_or_else(|| Path::new("."));
    if !output_dir.exists() {
        fs::create_dir_all(output_dir)?;
    }

    // Load font file
    let font_bytes = fs::read(&cli.font_path)?;
    println!(
        "Loaded font file: {} ({} bytes)",
        cli.font_path,
        font_bytes.len()
    );

    // Create font manager and load the custom font
    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .new_from_data(&font_bytes, None)
        .ok_or("Failed to load font from data")?;

    // Create font collection with ONLY our test font (no system fonts)
    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(typeface, Some("Test"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    // IMPORTANT: Do NOT set default font manager to avoid loading system fonts

    // Create surface for rendering
    let mut surface = surfaces::raster_n32_premul((900, 2000)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut y_pos = 50.0;
    let x_pos = 50.0;

    // Draw title
    y_pos = draw_section_title(canvas, "Font Coverage Test", x_pos, y_pos, &font_collection);

    // Test ASCII characters
    y_pos = draw_section_title(canvas, "ASCII Characters:", x_pos, y_pos, &font_collection);
    y_pos = draw_text_section(
        canvas,
        ASCII_CHARS,
        x_pos,
        y_pos,
        cli.font_size,
        &font_collection,
    );

    // Test CJK characters
    y_pos = draw_section_title(canvas, "CJK Characters:", x_pos, y_pos, &font_collection);
    y_pos = draw_text_section(
        canvas,
        CJK_CHARS,
        x_pos,
        y_pos,
        cli.font_size,
        &font_collection,
    );

    // Test Hebrew characters
    y_pos = draw_section_title(canvas, "Hebrew Characters:", x_pos, y_pos, &font_collection);
    y_pos = draw_text_section(
        canvas,
        HEBREW_CHARS,
        x_pos,
        y_pos,
        cli.font_size,
        &font_collection,
    );

    // Test Emoji characters
    y_pos = draw_section_title(canvas, "Emoji Characters:", x_pos, y_pos, &font_collection);
    y_pos = draw_text_section(
        canvas,
        EMOJI_CHARS,
        x_pos,
        y_pos,
        cli.font_size,
        &font_collection,
    );

    // Test Mixed characters
    y_pos = draw_section_title(canvas, "Mixed Characters:", x_pos, y_pos, &font_collection);
    y_pos = draw_text_section(
        canvas,
        MIXED_CHARS,
        x_pos,
        y_pos,
        cli.font_size,
        &font_collection,
    );

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();

    let output_path = &cli.output;
    fs::write(output_path, bytes)?;

    println!("Font coverage test completed successfully!");
    println!("Output saved to: {}", output_path);
    println!("Font family: Test");
    println!("Font size: {}", cli.font_size);
    println!("Total height used: {:.1}px", y_pos);

    // Generate a simple text report
    let report_path = format!("{}.txt", output_path.trim_end_matches(".png"));
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let report = format!(
        "Font Coverage Test Report
=======================

Font File: {}
Font Family: Test
Font Size: {}
Output Image: {}
Report Generated: {}

Character Sets Tested:
- ASCII: Basic Latin characters, numbers, symbols
- CJK: Chinese, Japanese, Korean, Thai, Hindi
- Hebrew: Hebrew script with diacritics
- Emoji: Various emoji categories
- Mixed: Combined multilingual text

Notes:
- This test uses ONLY the specified font file
- No system fonts are loaded as fallbacks
- Missing glyphs will show as empty boxes or fallback characters
- The output image shows exactly what the font can render

Total canvas height used: {:.1}px
",
        cli.font_path, cli.font_size, output_path, timestamp, y_pos
    );

    fs::write(&report_path, report)?;
    println!("Report saved to: {}", report_path);

    Ok(())
}
