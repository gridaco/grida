//! Tests for font styles functionality
//!
//! This module tests the font styles generation that provides UI-friendly style picker data.

use fonts::parse_ui::{UIFontFaceOwned, UIFontParser};
use fonts::selection::FamilyScenario;

/// Test that static fonts generate correct styles
#[test]
fn test_static_font_styles() {
    // Load a static font (PT Serif Regular)
    let font_data = include_bytes!("../../../fixtures/fonts/PT_Serif/PTSerif-Regular.ttf");
    let face = UIFontFaceOwned::new("PTSerif-Regular.ttf".to_string(), font_data.to_vec(), None);

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("PT Serif".to_string()), vec![face])
        .unwrap();

    // Should have one style for the static font
    assert_eq!(result.styles.len(), 1);

    let style = &result.styles[0];
    assert_eq!(style.name, "Regular");
    assert_eq!(style.postscript_name, Some("PTSerif-Regular".to_string()));
    assert_eq!(style.italic, false);
}

/// Test that variable fonts generate styles from instances
#[test]
fn test_variable_font_styles() {
    // Load a variable font (Inter Variable)
    let font_data =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
    let face = UIFontFaceOwned::new("Inter-Variable.ttf".to_string(), font_data.to_vec(), None);

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("Inter".to_string()), vec![face])
        .unwrap();

    // Should have multiple styles from variable font instances
    assert!(!result.styles.is_empty());

    // Check that we have some expected styles
    let style_names: Vec<&String> = result.styles.iter().map(|s| &s.name).collect();
    println!("Available styles: {:?}", style_names);

    // Should have at least one style
    assert!(!result.styles.is_empty());

    // PostScript names may or may not be present depending on the font
    // (Inter fonts don't have PostScript names for instances)
    for style in &result.styles {
        if let Some(ref ps_name) = style.postscript_name {
            assert!(!ps_name.is_empty());
        }
    }
}

/// Test that italic variable fonts generate correct italic styles
#[test]
fn test_italic_variable_font_styles() {
    // Load an italic variable font (Inter Italic Variable)
    let font_data =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.ttf");
    let face = UIFontFaceOwned::new(
        "Inter-Italic-Variable.ttf".to_string(),
        font_data.to_vec(),
        None,
    );

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("Inter".to_string()), vec![face])
        .unwrap();

    // Should have multiple styles from variable font instances
    assert!(!result.styles.is_empty());

    // All styles should be italic since this is an italic variable font
    for style in &result.styles {
        assert_eq!(
            style.italic, true,
            "Style '{}' should be italic",
            style.name
        );
    }
}

/// Test that multiple static fonts generate multiple styles
#[test]
fn test_multiple_static_font_styles() {
    // Load multiple static fonts
    let regular_data = include_bytes!("../../../fixtures/fonts/PT_Serif/PTSerif-Regular.ttf");
    let bold_data = include_bytes!("../../../fixtures/fonts/PT_Serif/PTSerif-Bold.ttf");

    let faces = vec![
        UIFontFaceOwned::new(
            "PTSerif-Regular.ttf".to_string(),
            regular_data.to_vec(),
            None,
        ),
        UIFontFaceOwned::new("PTSerif-Bold.ttf".to_string(), bold_data.to_vec(), None),
    ];

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("PT Serif".to_string()), faces)
        .unwrap();

    // Should have multiple styles
    assert!(result.styles.len() >= 2);

    // Should have Regular and Bold styles
    let style_names: Vec<&String> = result.styles.iter().map(|s| &s.name).collect();
    assert!(style_names.contains(&&"Regular".to_string()));
    assert!(style_names.contains(&&"Bold".to_string()));

    // Check that styles are unique by postscript name
    let postscript_names: Vec<Option<&String>> = result
        .styles
        .iter()
        .map(|s| s.postscript_name.as_ref())
        .collect();
    let unique_postscript_names: std::collections::HashSet<Option<&String>> =
        postscript_names.iter().cloned().collect();
    assert_eq!(postscript_names.len(), unique_postscript_names.len());
}

/// Test that italic detection works correctly
#[test]
fn test_italic_style_detection() {
    // Load an italic font
    let italic_data = include_bytes!("../../../fixtures/fonts/PT_Serif/PTSerif-Italic.ttf");
    let face = UIFontFaceOwned::new("PTSerif-Italic.ttf".to_string(), italic_data.to_vec(), None);

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("PT Serif".to_string()), vec![face])
        .unwrap();

    // Should have one style
    assert_eq!(result.styles.len(), 1);

    let style = &result.styles[0];
    assert_eq!(style.name, "Italic");
    assert_eq!(style.postscript_name, Some("PTSerif-Italic".to_string()));
    assert_eq!(style.italic, true);
}

/// Test that user-declared italic style takes precedence
#[test]
fn test_user_declared_italic_style() {
    // Load a regular font but declare it as italic
    let regular_data = include_bytes!("../../../fixtures/fonts/PT_Serif/PTSerif-Regular.ttf");
    let face = UIFontFaceOwned::new(
        "PTSerif-Regular.ttf".to_string(),
        regular_data.to_vec(),
        Some(true), // User declares this as italic
    );

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("PT Serif".to_string()), vec![face])
        .unwrap();

    // Should have one style
    assert_eq!(result.styles.len(), 1);

    let style = &result.styles[0];
    assert_eq!(style.name, "Regular");
    assert_eq!(style.postscript_name, Some("PTSerif-Regular".to_string()));
    assert_eq!(style.italic, true); // Should be italic due to user declaration
}

/// Test that styles are sorted and deduplicated
#[test]
fn test_styles_sorting_and_deduplication() {
    // Load the same font twice to test deduplication
    let font_data = include_bytes!("../../../fixtures/fonts/PT_Serif/PTSerif-Regular.ttf");
    let faces = vec![
        UIFontFaceOwned::new(
            "PTSerif-Regular-1.ttf".to_string(),
            font_data.to_vec(),
            None,
        ),
        UIFontFaceOwned::new(
            "PTSerif-Regular-2.ttf".to_string(),
            font_data.to_vec(),
            None,
        ),
    ];

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("PT Serif".to_string()), faces)
        .unwrap();

    // Should have only one style due to deduplication
    assert_eq!(result.styles.len(), 1);

    let style = &result.styles[0];
    assert_eq!(style.postscript_name, Some("PTSerif-Regular".to_string()));
}

/// Test Inter Duo VF scenario with both regular and italic variable fonts
#[test]
fn test_inter_duo_vf_scenario() {
    // Load both Inter variable fonts (regular and italic)
    let regular_data =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
    let italic_data =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.ttf");

    let faces = vec![
        UIFontFaceOwned::new(
            "Inter-VariableFont_opsz,wght.ttf".to_string(),
            regular_data.to_vec(),
            None,
        ),
        UIFontFaceOwned::new(
            "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
            italic_data.to_vec(),
            None,
        ),
    ];

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("Inter".to_string()), faces)
        .unwrap();

    // Should have 18 styles total (9 from regular VF + 9 from italic VF)
    assert_eq!(
        result.styles.len(),
        18,
        "Expected 18 styles (9 regular + 9 italic)"
    );

    // Count italic and non-italic styles
    let italic_styles: Vec<_> = result.styles.iter().filter(|s| s.italic).collect();
    let non_italic_styles: Vec<_> = result.styles.iter().filter(|s| !s.italic).collect();

    // Should have exactly 9 italic styles and 9 non-italic styles
    assert_eq!(italic_styles.len(), 9, "Expected 9 italic styles");
    assert_eq!(non_italic_styles.len(), 9, "Expected 9 non-italic styles");

    // Verify that all italic styles are actually italic
    for style in &italic_styles {
        assert_eq!(
            style.italic, true,
            "Style '{}' should be italic",
            style.name
        );
    }

    // Verify that all non-italic styles are actually non-italic
    for style in &non_italic_styles {
        assert_eq!(
            style.italic, false,
            "Style '{}' should be non-italic",
            style.name
        );
    }

    // Verify that we have the expected scenario type
    assert_eq!(result.italic_capability.scenario, FamilyScenario::DualVf);
}

/// Test Recursive VF scenario - Single Variable Font with Italic Instances (scenario 3-1)
///
/// This test validates the "Single Variable Font with Italic Instances" scenario where a single
/// variable font has `slnt` axis and explicit italic instances in `fvar.instances`. The font has
/// `slnt` axis but OS/2 bit 0 is not set, so detection relies on `slnt` axis values and instance names.
///
/// Reference: [italic-fonts.md](https://grida.co/docs/reference/italic-fonts)
#[test]
fn test_recursive_vf_scenario() {
    // Load Recursive variable font (single VF with slnt axis and italic instances)
    let font_data = include_bytes!(
        "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    let face = UIFontFaceOwned::new(
        "Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf".to_string(),
        font_data.to_vec(),
        None,
    );

    let parser = UIFontParser::new();
    let result = parser
        .analyze_family_owned(Some("Recursive".to_string()), vec![face])
        .unwrap();

    // Should have 64 styles total (32 regular + 32 italic instances)
    assert_eq!(
        result.styles.len(),
        64,
        "Expected 64 styles from Recursive VF instances"
    );

    // Count italic and non-italic styles
    let italic_styles: Vec<_> = result.styles.iter().filter(|s| s.italic).collect();
    let non_italic_styles: Vec<_> = result.styles.iter().filter(|s| !s.italic).collect();

    println!("Total styles: {}", result.styles.len());
    println!("Italic styles: {}", italic_styles.len());
    println!("Non-italic styles: {}", non_italic_styles.len());

    // Print first few styles to debug
    println!("First 10 styles:");
    for (i, style) in result.styles.iter().take(10).enumerate() {
        println!("  {}: {} (italic: {})", i + 1, style.name, style.italic);
    }

    // Verify the correct 32/32 split for Scenario 3-1
    assert_eq!(
        result.styles.len(),
        64,
        "Expected 64 styles from Recursive VF"
    );
    assert_eq!(
        italic_styles.len(),
        32,
        "Expected 32 italic styles from Recursive VF"
    );
    assert_eq!(
        non_italic_styles.len(),
        32,
        "Expected 32 non-italic styles from Recursive VF"
    );

    // Verify that all italic styles are actually italic
    for style in &italic_styles {
        assert_eq!(
            style.italic, true,
            "Style '{}' should be italic",
            style.name
        );
    }

    // Verify that all non-italic styles are actually non-italic
    for style in &non_italic_styles {
        assert_eq!(
            style.italic, false,
            "Style '{}' should be non-italic",
            style.name
        );
    }

    // Verify that we have the expected scenario type
    assert_eq!(result.italic_capability.scenario, FamilyScenario::SingleVf);

    // Print some example styles for verification
    println!("Sample italic styles:");
    for (i, style) in italic_styles.iter().take(5).enumerate() {
        println!("  {}: {} (italic: {})", i + 1, style.name, style.italic);
    }

    println!("Sample non-italic styles:");
    for (i, style) in non_italic_styles.iter().take(5).enumerate() {
        println!("  {}: {} (italic: {})", i + 1, style.name, style.italic);
    }
}
