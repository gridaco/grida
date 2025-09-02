use grida_canvas_fontgen::fontgen::font_validator::FontValidator;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let default_path = "apple_color_emoji_partial.ttf".to_string();
    let ttf_path = args.get(1).unwrap_or(&default_path);

    println!("🚀 Font Validation Test");
    println!("Testing font: {}", ttf_path);
    println!();

    // First, analyze the TTF structure
    FontValidator::analyze_ttf_structure(ttf_path)?;
    println!();

    // Then run comprehensive validation
    FontValidator::validate_font(ttf_path)?;

    Ok(())
}
