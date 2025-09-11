//! Example: High-Level UI Font Parser
//!
//! This example demonstrates how to use the UIFontParser for family-level
//! font analysis with opinionated, UI-friendly results.

use fonts::{UIFontFace, UIFontParser};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🎨 UI Font Parser Example");
    println!("=========================");

    // Create UI parser (for demonstration - not actually used in this example)
    let _parser = UIFontParser::new();

    // Example 1: Single static font
    println!("\n📝 Example 1: Single Static Font");
    println!("--------------------------------");

    // Simulate font data (in real usage, you'd load actual font files)
    let empty_data = &[];
    let _font_faces: Vec<UIFontFace> = vec![
        // This would be actual font data: std::fs::read("font.ttf")?
        UIFontFace {
            face_id: "font.ttf".to_string(),
            data: empty_data,             // Placeholder
            user_font_style_italic: None, // Let parser analyze the font metadata
        },
    ];

    // For demonstration, we'll show the expected output structure
    println!("Expected result structure:");
    println!("- Family name: 'Font Family'");
    println!("- Italic capability: has_italic=true, has_upright=false");
    println!("- Strategy: StaticItalicOnly");
    println!("- Recipes: [Italic]");
    println!("- Face info: 1 face with font features");

    // Example 2: Multiple static fonts
    println!("\n📚 Example 2: Multiple Static Fonts (PT Serif)");
    println!("---------------------------------------------");

    println!("Expected result structure:");
    println!("- Family name: 'PT Serif'");
    println!("- Italic capability: has_italic=true, has_upright=true");
    println!("- Strategy: StaticFamily");
    println!("- Recipes: [Regular, Italic, Bold, Bold Italic]");
    println!("- Face info: 4 faces with different weights/styles");

    // Example 3: Variable font
    println!("\n🔄 Example 3: Variable Font (Inter)");
    println!("----------------------------------");

    println!("Expected result structure:");
    println!("- Family name: 'Inter'");
    println!("- Italic capability: has_italic=true, has_upright=true");
    println!("- Strategy: DualVariableFonts");
    println!("- Recipes: [Regular, Italic] with VF recipes");
    println!("- Variable font info: axes=[wght, opsz], instances=[...]");
    println!("- Face info: 2 variable faces");

    // Example 4: Slnt axis font
    println!("\n📐 Example 4: Slnt Axis Font (Recursive)");
    println!("---------------------------------------");

    println!("Expected result structure:");
    println!("- Family name: 'Recursive'");
    println!("- Italic capability: has_italic=true, has_upright=true");
    println!("- Strategy: VariableFont");
    println!("- Recipes: [Regular, Italic] with slnt axis recipes");
    println!("- Variable font info: axes=[wght, slnt, casl, ...]");
    println!("- Face info: 1 variable face with multiple axes");

    // Example 5: Usage in UI context
    println!("\n🖥️  Example 5: UI Usage Pattern");
    println!("-----------------------------");

    println!("// Load font family with user-specified IDs");
    println!("let font_faces = vec![");
    println!("    UIFontFace {{");
    println!("        face_id: \"Inter-Regular.ttf\".to_string(),");
    println!("        data: std::fs::read(\"Inter-Regular.ttf\")?,");
    println!("        user_font_style_italic: Some(false), // User declares this is not italic");
    println!("    }},");
    println!("    UIFontFace {{");
    println!("        face_id: \"Inter-Italic.ttf\".to_string(),");
    println!("        data: std::fs::read(\"Inter-Italic.ttf\")?,");
    println!("        user_font_style_italic: Some(true), // User declares this is italic");
    println!("    }},");
    println!("];");
    println!();
    println!("// Analyze family");
    println!("let result = parser.analyze_family(Some(\"Inter\".to_string()), font_faces)?;");
    println!();
    println!("// Display family info");
    println!("println!(\"Family: {{}}\", result.family_name);");
    println!("println!(\"Italic available: {{}}\", result.italic_capability.has_italic);");
    println!();
    println!("// Show available styles");
    println!("for recipe in &result.italic_capability.recipes {{");
    println!("    println!(\"Style: {{}} - {{}}\", recipe.name, recipe.description);");
    println!("    if let Some(vf_recipe) = &recipe.vf_recipe {{");
    println!("        println!(\"  VF Recipe: {{:?}}\", vf_recipe.axis_values);");
    println!("    }}");
    println!("}}");
    println!();
    println!("// Show variable font axes");
    println!("if let Some(vf_info) = &result.variable_font_info {{");
    println!("    for axis in &vf_info.axes {{");
    println!(
        "        println!(\"Axis: {{}} ({{}}): {{}} to {{}}\", axis.tag, axis.name, axis.min, axis.max);"
    );
    println!("    }}");
    println!("}}");

    // Example 6: Error handling
    println!("\n❌ Example 6: Error Handling");
    println!("---------------------------");

    println!("// Handle empty font faces");
    println!("let result = parser.analyze_family(None, vec![]);");
    println!("match result {{");
    println!("    Ok(family_result) => println!(\"Success: {{}}\", family_result.family_name),");
    println!("    Err(e) => println!(\"Error: {{}}\", e),");
    println!("}}");
    println!();
    println!("// Handle invalid font data");
    println!("let result = parser.analyze_family(None, vec![UIFontFace {{");
    println!("    face_id: \"invalid.ttf\".to_string(),");
    println!("    data: vec![0, 1, 2, 3],");
    println!("    user_font_style_italic: None,");
    println!("}}]);");
    println!("match result {{");
    println!("    Ok(family_result) => println!(\"Success: {{}}\", family_result.family_name),");
    println!("    Err(e) => println!(\"Error: {{}}\", e),");
    println!("}}");

    println!("\n✅ UI Font Parser Example Complete!");
    println!("===================================");
    println!();
    println!("The UIFontParser provides:");
    println!("• Family-level analysis (not per-face)");
    println!("• Opinionated, UI-friendly results");
    println!("• Italic recipes with clear descriptions");
    println!("• Variable font axis information");
    println!("• Face-level details (features, metadata)");
    println!("• Error handling for invalid inputs");

    Ok(())
}
