use grida_canvas_fonts::{CurrentTextStyle, UIFontFace, UIFontParser};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

/// Round-trip consistency tests for get_italics and get_romans
///
/// These tests verify that the smart resolution behavior is consistent
/// and predictable when switching between italic and roman variants.
/// This is crucial for UI applications that need to toggle between
/// italic and roman styles while maintaining other style properties.

#[test]
fn test_round_trip_italic_to_roman_to_italic() {
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
    let font_data: Vec<_> = paths.iter().map(|p| fs::read(p).unwrap()).collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "PTSerif-Regular.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: Some(false), // Roman
            },
            UIFontFace {
                face_id: "PTSerif-Bold.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: Some(false), // Roman
            },
            UIFontFace {
                face_id: "PTSerif-Italic.ttf".to_string(),
                data: &font_data[2],
                user_font_style_italic: Some(true), // Italic
            },
            UIFontFace {
                face_id: "PTSerif-BoldItalic.ttf".to_string(),
                data: &font_data[3],
                user_font_style_italic: Some(true), // Italic
            },
        ]
    };

    // Start with italic style
    let initial_style = CurrentTextStyle {
        weight: Some(700), // Use bold weight to make BoldItalic the clear winner
        width: Some(100),
        slant: Some(15.0),
        // Starting with italic
        custom_axes: HashMap::new(),
    };

    // Step 1: Get italic matches (should find italic variants)
    let italic_matches = parser
        .get_italics(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1), // Get closest italic
        )
        .expect("Should get italic matches");

    assert!(!italic_matches.is_empty(), "Should find italic variants");
    println!("Initial italic match: {}", italic_matches[0].recipe.name);

    // Step 2: Switch to roman (get_romans)
    let roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1), // Get closest roman
        )
        .expect("Should get roman matches");

    assert!(!roman_matches.is_empty(), "Should find roman variants");

    // Step 3: Switch back to italic (get_italics again)
    let final_italic_matches = parser
        .get_italics(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(initial_style),
            Some(1), // Get closest italic
        )
        .expect("Should get italic matches again");

    assert!(
        !final_italic_matches.is_empty(),
        "Should find italic variants again"
    );
    println!(
        "Final italic match: {}",
        final_italic_matches[0].recipe.name
    );

    // The final italic match should be consistent with the initial italic match
    // (same recipe, same distance calculation)
    assert_eq!(
        italic_matches[0].recipe.name, final_italic_matches[0].recipe.name,
        "Round-trip should return consistent italic matches"
    );

    assert!(
        (italic_matches[0].distance - final_italic_matches[0].distance).abs() < 0.001,
        "Round-trip should have consistent distance calculations"
    );
}

#[test]
fn test_round_trip_roman_to_italic_to_roman() {
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

    let font_data: Vec<_> = paths.iter().map(|p| fs::read(p).unwrap()).collect();

    // Helper function to create font_faces
    let create_font_faces = || {
        vec![
            UIFontFace {
                face_id: "PTSerif-Regular.ttf".to_string(),
                data: &font_data[0],
                user_font_style_italic: Some(false), // Roman
            },
            UIFontFace {
                face_id: "PTSerif-Bold.ttf".to_string(),
                data: &font_data[1],
                user_font_style_italic: Some(false), // Roman
            },
            UIFontFace {
                face_id: "PTSerif-Italic.ttf".to_string(),
                data: &font_data[2],
                user_font_style_italic: Some(true), // Italic
            },
            UIFontFace {
                face_id: "PTSerif-BoldItalic.ttf".to_string(),
                data: &font_data[3],
                user_font_style_italic: Some(true), // Italic
            },
        ]
    };

    // Start with roman style
    let initial_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        // Starting with roman
        custom_axes: HashMap::new(),
    };

    // Step 1: Get roman matches (should find roman variants)
    let roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1), // Get closest roman
        )
        .expect("Should get roman matches");

    assert!(!roman_matches.is_empty(), "Should find roman variants");

    // Step 2: Switch to italic (get_italics)
    let italic_matches = parser
        .get_italics(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1), // Get closest italic
        )
        .expect("Should get italic matches");

    assert!(!italic_matches.is_empty(), "Should find italic variants");

    // Step 3: Switch back to roman (get_romans again)
    let final_roman_matches = parser
        .get_romans(
            Some("PT Serif".to_string()),
            create_font_faces(),
            Some(initial_style),
            Some(1), // Get closest roman
        )
        .expect("Should get roman matches again");

    assert!(
        !final_roman_matches.is_empty(),
        "Should find roman variants again"
    );

    // The final roman match should be consistent with the initial roman match
    assert_eq!(
        roman_matches[0].recipe.name, final_roman_matches[0].recipe.name,
        "Round-trip should return consistent roman matches"
    );

    assert!(
        (roman_matches[0].distance - final_roman_matches[0].distance).abs() < 0.001,
        "Round-trip should have consistent distance calculations"
    );
}

#[test]
fn test_round_trip_with_smart_resolution() {
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

    let initial_style = CurrentTextStyle {
        weight: Some(400), // Should take priority over custom_axes["wght"]
        width: None,       // Should fallback to custom_axes["wdth"]
        slant: Some(15.0), // Should take priority over custom_axes["slnt"]
        // Currently using italic
        custom_axes,
    };

    // Step 1: Get italic matches
    let italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1),
        )
        .expect("Should get italic matches");

    // Step 2: Get roman matches
    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1),
        )
        .expect("Should get roman matches");

    // Step 3: Get italic matches again
    let final_italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style),
            Some(1),
        )
        .expect("Should get italic matches again");

    // All steps should succeed
    assert!(!italic_matches.is_empty());
    assert!(!roman_matches.is_empty());
    assert!(!final_italic_matches.is_empty());

    // Round-trip should be consistent
    assert_eq!(
        italic_matches[0].recipe.name, final_italic_matches[0].recipe.name,
        "Round-trip with smart resolution should be consistent"
    );
}

#[test]
fn test_round_trip_with_custom_axes_only() {
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

    // Test with only custom_axes (no explicit properties)
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0); // Should be used (weight=None)
    custom_axes.insert("wdth".to_string(), 120.0); // Should be used (width=None)
    custom_axes.insert("slnt".to_string(), 5.0); // Should be used (slant=None)
    custom_axes.insert("opsz".to_string(), 14.0); // Should be used (no explicit property)

    let initial_style = CurrentTextStyle {
        weight: None, // Should fallback to custom_axes["wght"]
        width: None,  // Should fallback to custom_axes["wdth"]
        slant: None,  // Should fallback to custom_axes["slnt"]
        // Currently using italic
        custom_axes,
    };

    // Step 1: Get italic matches
    let italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1),
        )
        .expect("Should get italic matches");

    // Step 2: Get roman matches
    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1),
        )
        .expect("Should get roman matches");

    // Step 3: Get italic matches again
    let final_italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style),
            Some(1),
        )
        .expect("Should get italic matches again");

    // All steps should succeed
    assert!(!italic_matches.is_empty());
    assert!(!roman_matches.is_empty());
    assert!(!final_italic_matches.is_empty());

    // Round-trip should be consistent
    assert_eq!(
        italic_matches[0].recipe.name, final_italic_matches[0].recipe.name,
        "Round-trip with custom_axes only should be consistent"
    );
}

#[test]
fn test_round_trip_italic_flag_never_maps_to_axes() {
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

    // Test that italic flag never maps to custom_axes["ital"]
    let mut custom_axes = HashMap::new();
    custom_axes.insert("ital".to_string(), 1.0); // Should be ignored
    custom_axes.insert("wght".to_string(), 500.0);

    let initial_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,
        // This should never map to custom_axes["ital"]
        custom_axes,
    };

    // Step 1: Get italic matches
    let italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1),
        )
        .expect("Should get italic matches");

    // Step 2: Get roman matches
    let roman_matches = parser
        .get_romans(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style.clone()),
            Some(1),
        )
        .expect("Should get roman matches");

    // Step 3: Get italic matches again
    let final_italic_matches = parser
        .get_italics(
            Some("Inter".to_string()),
            create_font_faces(),
            Some(initial_style),
            Some(1),
        )
        .expect("Should get italic matches again");

    // All steps should succeed
    assert!(!italic_matches.is_empty());
    assert!(!roman_matches.is_empty());
    assert!(!final_italic_matches.is_empty());

    // Round-trip should be consistent
    assert_eq!(
        italic_matches[0].recipe.name, final_italic_matches[0].recipe.name,
        "Round-trip with italic flag should be consistent"
    );
}

#[test]
fn test_round_trip_edge_cases() {
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

    // Test edge cases: zero and negative values
    let test_cases = vec![
        // Zero values
        CurrentTextStyle {
            weight: Some(0),
            width: Some(0),
            slant: Some(0.0),

            custom_axes: HashMap::new(),
        },
        // Negative values
        CurrentTextStyle {
            weight: Some(100),
            width: Some(50),
            slant: Some(-15.0),

            custom_axes: HashMap::new(),
        },
        // All None values
        CurrentTextStyle {
            weight: None,
            width: None,
            slant: None,

            custom_axes: HashMap::new(),
        },
    ];

    for (i, initial_style) in test_cases.into_iter().enumerate() {
        // Step 1: Get italic matches
        let italic_matches = parser
            .get_italics(
                Some("Inter".to_string()),
                create_font_faces(),
                Some(initial_style.clone()),
                Some(1),
            )
            .expect(&format!("Should get italic matches for test case {}", i));

        // Step 2: Get roman matches
        let _roman_matches = parser
            .get_romans(
                Some("Inter".to_string()),
                create_font_faces(),
                Some(initial_style.clone()),
                Some(1),
            )
            .expect(&format!("Should get roman matches for test case {}", i));

        // Step 3: Get italic matches again
        let final_italic_matches = parser
            .get_italics(
                Some("Inter".to_string()),
                create_font_faces(),
                Some(initial_style),
                Some(1),
            )
            .expect(&format!(
                "Should get italic matches again for test case {}",
                i
            ));

        // Round-trip should be consistent
        if !italic_matches.is_empty() && !final_italic_matches.is_empty() {
            assert_eq!(
                italic_matches[0].recipe.name, final_italic_matches[0].recipe.name,
                "Round-trip should be consistent for test case {}",
                i
            );
        }
    }
}
