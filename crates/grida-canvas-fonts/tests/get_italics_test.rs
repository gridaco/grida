//! Tests for the `get_italics` method functionality.

use fonts::parse_ui::{CurrentTextStyle, UIFontFace, UIFontParser};
use std::collections::HashMap;
use std::fs;

fn font_path(filename: &str) -> std::path::PathBuf {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("fixtures");
    path.push("fonts");
    path.push(filename);
    path
}

/// Test get_italics with no current style (should return all italics)
#[test]
fn test_get_italics_no_current_style() {
    let path = font_path("Molle/Molle-Italic.ttf");
    if !path.exists() {
        println!("Molle font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Molle-Italic.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None,
    }];

    let matches = parser
        .get_italics(
            Some("Molle".to_string()),
            font_faces,
            None, // No current style
            None, // No max results
        )
        .unwrap();

    assert_eq!(matches.len(), 1);
    assert!(matches[0].recipe.is_italic);
    assert_eq!(matches[0].distance, 0.0);
    assert!(matches[0].axis_diffs.is_none());
}

/// Test get_italics with current style matching
#[test]
fn test_get_italics_with_current_style() {
    let paths = vec![
        font_path("Inter/Inter-VariableFont_opsz,wght.ttf"),
        font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.len() < 2 {
        println!("Inter fonts not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();
    let font_faces: Vec<UIFontFace> = existing_paths
        .iter()
        .enumerate()
        .map(|(i, _p)| UIFontFace {
            face_id: format!("Inter-{}", i),
            data: &font_data[i],
            user_font_style_italic: None,
        })
        .collect();

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,

        custom_axes: HashMap::new(),
    };

    let matches = parser
        .get_italics(
            Some("Inter".to_string()),
            font_faces,
            Some(current_style),
            Some(3),
        )
        .unwrap();

    assert!(!matches.is_empty());
    assert!(matches[0].recipe.is_italic);
    assert!(matches[0].distance >= 0.0);
}

/// Test get_italics with max_results limit
#[test]
fn test_get_italics_max_results() {
    let path = font_path("Molle/Molle-Italic.ttf");
    if !path.exists() {
        println!("Molle font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Molle-Italic.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None,
    }];

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,

        custom_axes: HashMap::new(),
    };

    let matches = parser
        .get_italics(
            Some("Molle".to_string()),
            font_faces,
            Some(current_style),
            Some(1), // Max 1 result
        )
        .unwrap();

    assert!(matches.len() <= 1);
}

/// Test get_italics with variable font (Recursive)
#[test]
fn test_get_italics_variable_font() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    if !path.exists() {
        println!("Recursive font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Recursive-Variable.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None,
    }];

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: Some(0.0), // No slant currently

        custom_axes: HashMap::new(),
    };

    let matches = parser
        .get_italics(
            Some("Recursive".to_string()),
            font_faces,
            Some(current_style),
            None,
        )
        .unwrap();

    // Should find italic variants
    assert!(!matches.is_empty());

    // Check that matches are sorted by distance
    for i in 1..matches.len() {
        assert!(matches[i - 1].distance <= matches[i].distance);
    }

    // For variable fonts, check axis differences
    for mat in &matches {
        if let Some(axis_diffs) = &mat.axis_diffs {
            for diff in axis_diffs {
                assert!(!diff.tag.is_empty());
                assert!(diff.diff.abs() > 0.001); // Only significant differences
            }
        }
    }
}

/// Test get_italics with custom axes
#[test]
fn test_get_italics_custom_axes() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    if !path.exists() {
        println!("Recursive font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Recursive-Variable.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None,
    }];

    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);
    custom_axes.insert("slnt".to_string(), -10.0);

    let current_style = CurrentTextStyle {
        weight: Some(500),
        width: Some(100),
        slant: Some(-10.0),

        custom_axes,
    };

    let matches = parser
        .get_italics(
            Some("Recursive".to_string()),
            font_faces,
            Some(current_style),
            None,
        )
        .unwrap();

    assert!(!matches.is_empty());

    // Should have some distance since we're not exactly matching an italic variant
    assert!(matches[0].distance > 0.0);
}

/// Test get_italics with no italic variants available
#[test]
fn test_get_italics_no_italics() {
    let path = font_path("Allerta/Allerta-Regular.ttf");
    if !path.exists() {
        println!("Allerta font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Allerta-Regular.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None,
    }];

    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: None,

        custom_axes: HashMap::new(),
    };

    let matches = parser
        .get_italics(
            Some("Allerta".to_string()),
            font_faces,
            Some(current_style),
            None,
        )
        .unwrap();

    // Should return empty since Allerta has no italic variants
    assert!(matches.is_empty());
}

/// Test get_italics error handling
#[test]
fn test_get_italics_error_handling() {
    let parser = UIFontParser::new();

    // Test with empty font faces
    let result = parser.get_italics(None, vec![], None, None);
    assert!(result.is_err());

    // Test with invalid font data
    let result = parser.get_italics(
        None,
        vec![UIFontFace {
            face_id: "invalid.ttf".to_string(),
            data: &[0, 1, 2, 3],
            user_font_style_italic: None,
        }],
        None,
        None,
    );
    assert!(result.is_err());
}
