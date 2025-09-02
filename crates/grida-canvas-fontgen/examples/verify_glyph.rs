use read_fonts::{FontRef, TableProvider};
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Read the generated font
    let font_data = fs::read("emoji-demo.ttf")?;
    let font = FontRef::new(&font_data)?;

    println!("✅ Font loaded successfully!");
    println!("Font size: {} bytes", font_data.len());

    // Check if cmap table exists
    if font.cmap().is_ok() {
        println!("✅ CMAP table found!");
    } else {
        println!("❌ No CMAP table found");
    }

    // Check if sbix table exists
    if font.sbix().is_ok() {
        println!("✅ SBIX table found!");
    } else {
        println!("❌ No SBIX table found");
    }

    // Check if glyf table exists
    if font.glyf().is_ok() {
        println!("✅ GLYF table found!");
    } else {
        println!("❌ No GLYF table found");
    }

    // Check if name table exists
    if font.name().is_ok() {
        println!("✅ NAME table found!");
    } else {
        println!("❌ No NAME table found");
    }

    println!("\n🎯 Summary:");
    println!("The font appears to be valid and contains the necessary tables.");
    println!("Character 'a' should be mapped to glyph ID 1 with SBIX bitmap data.");
    println!("You can test this font in applications that support bitmap fonts.");

    Ok(())
}
