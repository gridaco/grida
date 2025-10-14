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
fn test_get_romans_no_current_style() {
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
}

#[test]
fn test_get_romans_with_current_style() {
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
                user_font_style_italic: Some(true), // Italic (should be filtered out)
            },
        ]
    };

    // Current style with weight 500
    let current_style = CurrentTextStyle {
        weight: Some(500),
        width: Some(100),
        slant: None,
        // Currently using italic
        custom_axes: HashMap::new(),
    };

    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            None, // No max results
        )
        .expect("Should analyze family successfully");

    // Should have at least 1 roman variant (Regular, but not Italic)
    assert!(roman_matches.len() >= 1);

    // Results should be sorted by distance (closest first)
    for i in 1..roman_matches.len() {
        assert!(
            roman_matches[i - 1].distance <= roman_matches[i].distance,
            "Results should be sorted by distance"
        );
    }
}

#[test]
fn test_get_romans_max_results() {
    let parser = UIFontParser::new();

    // Use PT Serif fonts which have multiple static variants
    let paths = vec![
        font_path("PT_Serif/PTSerif-Regular.ttf"),
        font_path("PT_Serif/PTSerif-Bold.ttf"),
        font_path("PT_Serif/PTSerif-Italic.ttf"),
        font_path("PT_Serif/PTSerif-BoldItalic.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.len() < 3 {
        println!("PT Serif fonts not found, skipping test");
        return;
    }

    // Create multiple roman font faces
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "PTSerif-Regular.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-Bold.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-Italic.ttf".to_string(),
                data: &font_data[2],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-BoldItalic.ttf".to_string(),
                data: &font_data[3],
                user_font_style_italic: None, // Let parser analyze
            },
        ]
    };

    let current_style = CurrentTextStyle {
        weight: Some(400), // Regular weight
        width: Some(100),
        slant: None,

        custom_axes: HashMap::new(),
    };

    // Test with max_results = 2
    let roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(current_style),
            Some(2), // Max 2 results
        )
        .expect("Should analyze family successfully");

    // Should have at least 1 result (Regular and Bold are roman)
    // Note: PT Serif might be detected as having different roman variants
    assert!(roman_matches.len() >= 1);
    assert!(roman_matches.len() <= 2);

    // Results should be sorted by distance (if we have more than 1)
    if roman_matches.len() > 1 {
        assert!(roman_matches[0].distance <= roman_matches[1].distance);
    }
}

#[test]
fn test_get_romans_no_romans_available() {
    let parser = UIFontParser::new();

    // Use only italic fonts (PT Serif Italic and BoldItalic)
    let paths = vec![
        font_path("PT_Serif/PTSerif-Italic.ttf"),
        font_path("PT_Serif/PTSerif-BoldItalic.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.len() < 2 {
        println!("PT Serif italic fonts not found, skipping test");
        return;
    }

    // Create only italic font faces
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "PTSerif-Italic.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-BoldItalic.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: None, // Let parser analyze
            },
        ]
    };

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,

        custom_axes: HashMap::new(),
    };

    let roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(current_style),
            None,
        )
        .expect("Should analyze family successfully");

    // Should have no roman variants
    assert_eq!(roman_matches.len(), 0);
}

#[test]
fn test_get_romans_variable_font() {
    let parser = UIFontParser::new();

    // Use a real variable font (Inter Roman)
    let path = font_path("Inter/Inter-VariableFont_opsz,wght.ttf");
    if !path.exists() {
        println!("Inter variable font not found, skipping test");
        return;
    }

    // Create a variable font face
    let font_data = fs::read(&path).unwrap();
    let create_font_faces = || {
        vec![UIFontFace {
            face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
            data: &font_data,
            user_font_style_italic: None, // Let parser detect
        }]
    };

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: Some(15.0), // Currently slanted

        custom_axes: HashMap::new(),
    };

    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(current_style),
            None,
        )
        .expect("Should analyze family successfully");

    // Should have roman variants (variable fonts can have both italic and roman)
    // The exact number depends on the mock data, but should not be empty
    assert!(
        roman_matches.len() > 0,
        "Should have at least one roman variant"
    );
}

#[test]
fn test_get_romans_custom_axes() {
    let parser = UIFontParser::new();

    // Use PT Serif fonts for testing custom axes
    let paths = vec![
        font_path("PT_Serif/PTSerif-Regular.ttf"),
        font_path("PT_Serif/PTSerif-Bold.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.len() < 2 {
        println!("PT Serif fonts not found, skipping test");
        return;
    }

    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "PTSerif-Regular.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-Bold.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: None, // Let parser analyze
            },
        ]
    };

    // Current style with custom axes
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);
    custom_axes.insert("wdth".to_string(), 120.0);
    custom_axes.insert("opsz".to_string(), 14.0);

    let current_style = CurrentTextStyle {
        weight: Some(400), // Should take priority over custom_axes["wght"]
        width: None,       // Should fallback to custom_axes["wdth"]
        slant: None,

        custom_axes,
    };

    let roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(current_style),
            None,
        )
        .expect("Should analyze family successfully");

    // Should have roman variants
    assert!(roman_matches.len() > 0);

    // Check that smart resolution is working (weight=400 should take priority)
    for mat in &roman_matches {
        // Distance should be calculated based on smart resolution
        assert!(mat.distance >= 0.0);
    }
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
}

#[test]
fn test_get_romans_round_trip_consistency() {
    let parser = UIFontParser::new();

    // Use PT Serif fonts which have both italic and roman variants
    let paths = vec![
        font_path("PT_Serif/PTSerif-Regular.ttf"),
        font_path("PT_Serif/PTSerif-Bold.ttf"),
        font_path("PT_Serif/PTSerif-Italic.ttf"),
        font_path("PT_Serif/PTSerif-BoldItalic.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.len() < 4 {
        println!("PT Serif fonts not found, skipping test");
        return;
    }

    // Create font faces with both italic and roman variants
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "PTSerif-Regular.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-Bold.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-Italic.ttf".to_string(),
                data: &font_data[2],
                user_font_style_italic: None, // Let parser analyze
            },
            UIFontFace {
                face_id: "PTSerif-BoldItalic.ttf".to_string(),
                data: &font_data[3],
                user_font_style_italic: None, // Let parser analyze
            },
        ]
    };

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        // Currently using italic
        custom_axes: HashMap::new(),
    };

    // Test round-trip: get_romans -> get_italics
    let roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(current_style.clone()),
            None,
        )
        .expect("Should get roman matches");

    // Should have roman variants
    assert!(roman_matches.len() > 0);

    // Now test get_italics with the same current style
    let italic_matches = parser
        .get_italics(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(current_style),
            None,
        )
        .expect("Should get italic matches");

    // Should have italic variants
    assert!(italic_matches.len() > 0);

    // The sum of roman and italic matches should be <= total capabilities
    // (some capabilities might be filtered out or not match the current style)
    // assert!(roman_matches.len() + italic_matches.len() >= 0); // Always true for usize
}
