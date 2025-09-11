use fonts::{CurrentTextStyle, UIFontFace, UIFontParser};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

/// Test get_romans functionality - finding closest roman (non-italic) variants
#[test]
fn test_get_romans_basic_functionality() {
    let parser = UIFontParser::new();

    // Use real font files
    let paths = vec![
        font_path("Inter/Inter-VariableFont_opsz,wght.ttf"),
        font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf"),
    ];

    // Check if fonts exist
    if !paths.iter().all(|p| p.exists()) {
        println!("Inter fonts not found, skipping test");
        return;
    }

    // Create font faces with real data
    let font_data: Vec<_> = paths.iter().map(|p| fs::read(p).unwrap()).collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: Some(false), // Roman
            },
            UIFontFace {
                face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: Some(true), // Italic
            },
        ]
    };

    // Test without current style - should return all roman variants
    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            None, // No current style
            None, // No max results
        )
        .expect("Should analyze family successfully");

    // Should have at least 1 roman variant (Regular, but not Italic)
    assert!(roman_matches.len() >= 1);

    // All matches should have distance 0.0 (no current style to compare against)
    for mat in &roman_matches {
        assert_eq!(mat.distance, 0.0);
        assert!(mat.axis_diffs.is_none());
    }

    // Test with current style
    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        // Currently using italic
        custom_axes: HashMap::new(),
    };

    let roman_matches_with_style = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            None,
        )
        .expect("Should analyze family successfully");

    // Should have at least 1 roman variant
    assert!(roman_matches_with_style.len() >= 1);

    // Results should be sorted by distance (closest first)
    for i in 1..roman_matches_with_style.len() {
        assert!(
            roman_matches_with_style[i - 1].distance <= roman_matches_with_style[i].distance,
            "Results should be sorted by distance"
        );
    }
}

#[test]
fn test_get_romans_max_results() {
    let parser = UIFontParser::new();

    // Use real font files
    let paths = vec![
        font_path("Inter/Inter-VariableFont_opsz,wght.ttf"),
        font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf"),
    ];

    // Check if fonts exist
    if !paths.iter().all(|p| p.exists()) {
        println!("Inter fonts not found, skipping test");
        return;
    }

    // Create font faces with real data
    let font_data: Vec<_> = paths.iter().map(|p| fs::read(p).unwrap()).collect();
    let font_faces = vec![
        UIFontFace {
            face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
            data: &font_data[0],
            user_font_style_italic: Some(false), // Roman
        },
        UIFontFace {
            face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
            data: &font_data[1],
            user_font_style_italic: Some(true), // Italic
        },
    ];

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        custom_axes: HashMap::new(),
    };

    // Test with max_results = 1
    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            font_faces,
            Some(current_style),
            Some(1), // Max 1 result
        )
        .expect("Should analyze family successfully");

    // Should have at most 1 result
    assert!(roman_matches.len() <= 1);
}

#[test]
fn test_get_romans_no_romans_available() {
    let parser = UIFontParser::new();

    // Use only italic font
    let path = font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf");

    // Check if font exists
    if !path.exists() {
        println!("Inter Italic font not found, skipping test");
        return;
    }

    // Create font face with only italic
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: Some(true), // Only italic
    }];

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        custom_axes: HashMap::new(),
    };

    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            font_faces,
            Some(current_style),
            None,
        )
        .expect("Should analyze family successfully");

    // Should have no roman variants (only italic available)
    assert_eq!(roman_matches.len(), 0);
}

#[test]
fn test_get_romans_error_handling() {
    let parser = UIFontParser::new();

    // Test with empty font faces
    let result = parser.get_romans(
        Some("Inter".to_string()),
        vec![], // Empty font faces
        None,
        None,
    );

    // Should return an error for empty font faces
    assert!(result.is_err());
    let error_msg = result.unwrap_err();
    println!("Error message: {}", error_msg);
    // Just check that it's an error (the exact message may vary)
    assert!(!error_msg.is_empty());
}
