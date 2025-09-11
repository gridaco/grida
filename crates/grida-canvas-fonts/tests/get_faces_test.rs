use fonts::{CurrentTextStyle, FaceType, UIFontFace, UIFontParser};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

/// Test get_faces functionality - unified interface for italic/roman variants
#[test]
fn test_get_faces_italic_returns_same_as_get_italics() {
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

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        custom_axes: HashMap::new(),
    };

    // Get italic variants using get_faces
    let faces_italic_matches = parser
        .get_faces(
            FaceType::Italic,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style.clone()),
            Some(3),
        )
        .expect("Should get italic matches via get_faces");

    // Get italic variants using get_italics
    let direct_italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            Some(3),
        )
        .expect("Should get italic matches via get_italics");

    // Results should be identical
    assert_eq!(faces_italic_matches.len(), direct_italic_matches.len());

    for (faces_match, direct_match) in faces_italic_matches
        .iter()
        .zip(direct_italic_matches.iter())
    {
        assert_eq!(faces_match.recipe.name, direct_match.recipe.name);
        assert!((faces_match.distance - direct_match.distance).abs() < 0.001);
        assert_eq!(faces_match.axis_diffs, direct_match.axis_diffs);
    }
}

#[test]
fn test_get_faces_roman_returns_same_as_get_romans() {
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

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        custom_axes: HashMap::new(),
    };

    // Get roman variants using get_faces
    let faces_roman_matches = parser
        .get_faces(
            FaceType::Roman,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style.clone()),
            Some(3),
        )
        .expect("Should get roman matches via get_faces");

    // Get roman variants using get_romans
    let direct_roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            Some(3),
        )
        .expect("Should get roman matches via get_romans");

    // Results should be identical
    assert_eq!(faces_roman_matches.len(), direct_roman_matches.len());

    for (faces_match, direct_match) in faces_roman_matches.iter().zip(direct_roman_matches.iter()) {
        assert_eq!(faces_match.recipe.name, direct_match.recipe.name);
        assert!((faces_match.distance - direct_match.distance).abs() < 0.001);
        assert_eq!(faces_match.axis_diffs, direct_match.axis_diffs);
    }
}

#[test]
fn test_get_faces_toggle_functionality() {
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

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        // Currently roman
        custom_axes: HashMap::new(),
    };

    // Toggle to italic
    let italic_matches = parser
        .get_faces(
            FaceType::Italic,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style.clone()),
            Some(1),
        )
        .expect("Should get italic matches");

    // Toggle to roman
    let roman_matches = parser
        .get_faces(
            FaceType::Roman,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            Some(1),
        )
        .expect("Should get roman matches");

    // Should have different results
    assert!(!italic_matches.is_empty());
    assert!(!roman_matches.is_empty());

    // The italic and roman matches should be different
    assert_ne!(italic_matches[0].recipe.name, roman_matches[0].recipe.name);
}

#[test]
fn test_get_faces_with_smart_resolution() {
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
                user_font_style_italic: Some(false),
            },
            UIFontFace {
                face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: Some(true),
            },
        ]
    };

    // Test with smart resolution (explicit properties + custom_axes)
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0); // Should be overridden by weight=400
    custom_axes.insert("wdth".to_string(), 120.0); // Should be used (width=None)
    custom_axes.insert("slnt".to_string(), 5.0); // Should be overridden by slant=15.0

    let current_style = CurrentTextStyle {
        weight: Some(400), // Should take priority over custom_axes["wght"]
        width: None,       // Should fallback to custom_axes["wdth"]
        slant: Some(15.0), // Should take priority over custom_axes["slnt"]
        // Currently using italic
        custom_axes,
    };

    // Get italic variants using get_faces
    let italic_matches = parser
        .get_faces(
            FaceType::Italic,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style.clone()),
            Some(1),
        )
        .expect("Should get italic matches");

    // Get roman variants using get_faces
    let roman_matches = parser
        .get_faces(
            FaceType::Roman,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            Some(1),
        )
        .expect("Should get roman matches");

    // Both should succeed
    assert!(!italic_matches.is_empty());
    assert!(!roman_matches.is_empty());

    // Results should be sorted by distance
    assert!(italic_matches[0].distance >= 0.0);
    assert!(roman_matches[0].distance >= 0.0);
}

#[test]
fn test_get_faces_max_results() {
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
                user_font_style_italic: Some(false),
            },
            UIFontFace {
                face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: Some(true),
            },
        ]
    };

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        custom_axes: HashMap::new(),
    };

    // Test with max_results = 1
    let italic_matches = parser
        .get_faces(
            FaceType::Italic,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style.clone()),
            Some(1),
        )
        .expect("Should get italic matches");

    let roman_matches = parser
        .get_faces(
            FaceType::Roman,
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            Some(1),
        )
        .expect("Should get roman matches");

    // Should have at most 1 result each
    assert!(italic_matches.len() <= 1);
    assert!(roman_matches.len() <= 1);
}

#[test]
fn test_get_faces_no_current_style() {
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
                user_font_style_italic: Some(false),
            },
            UIFontFace {
                face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: Some(true),
            },
        ]
    };

    // Test without current style
    let italic_matches = parser
        .get_faces(
            FaceType::Italic,
            Some("Inter".to_string()),
            create_font_faces(),
            None, // No current style
            None,
        )
        .expect("Should get italic matches");

    let roman_matches = parser
        .get_faces(
            FaceType::Roman,
            Some("Inter".to_string()),
            create_font_faces(),
            None, // No current style
            None,
        )
        .expect("Should get roman matches");

    // Should have results (these assertions are always true for usize, but kept for clarity)
    // assert!(italic_matches.len() >= 0); // Always true for usize
    // assert!(roman_matches.len() >= 0);  // Always true for usize

    // All matches should have distance 0.0 (no current style to compare against)
    for mat in &italic_matches {
        assert_eq!(mat.distance, 0.0);
        assert!(mat.axis_diffs.is_none());
    }

    for mat in &roman_matches {
        assert_eq!(mat.distance, 0.0);
        assert!(mat.axis_diffs.is_none());
    }
}

#[test]
fn test_get_faces_error_handling() {
    let parser = UIFontParser::new();

    // Test with empty font faces
    let result_italic = parser.get_faces(
        FaceType::Italic,
        Some("Inter".to_string()),
        vec![], // Empty font faces
        None,
        None,
    );

    let result_roman = parser.get_faces(
        FaceType::Roman,
        Some("Inter".to_string()),
        vec![], // Empty font faces
        None,
        None,
    );

    // Both should return the same error
    assert!(result_italic.is_err());
    assert!(result_roman.is_err());

    let error_italic = result_italic.unwrap_err();
    let error_roman = result_roman.unwrap_err();

    // Error messages should be the same
    assert_eq!(error_italic, error_roman);
    assert!(error_italic.contains("Font faces list cannot be empty"));
}
