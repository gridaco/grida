use std::fs;
use std::path::PathBuf;

use grida_canvas_fonts::{parse::Parser, selection_italic as italic, FaceRecord, FamilyScenario, ParserConfig, VfRecipe};

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

/// Test Level 1 italic detection with real font files from fixtures.
/// Note: Most fonts in fixtures don't have OS/2 italic bits set, demonstrating
/// why Level 1 focuses on OS/2 bits and Level 2+ includes name-based fallbacks.
#[test]
fn test_level1_italic_detection_real_fonts() {
    let parser = italic::ItalicParser::new();

    // Test 1: Static italic font (Molle - properly flagged as Italic in OS/2)
    let path = font_path("Molle/Molle-Italic.ttf");
    if path.exists() {
        let data = fs::read(&path).unwrap();
        let font_parser = Parser::new(&data).unwrap();
        let face_record = font_parser
            .extract_face_record("molle-italic".to_string(), None)
            .unwrap();

        let classification = parser.classify_face(face_record);
        // Level 1 correctly identifies this as Italic based on OS/2 bit
        assert_eq!(
            classification.classification.italic_kind(),
            italic::ItalicKind::Italic
        );
        assert!(!classification.classification.is_variable);
        assert!(classification.face.os2_italic_bit); // Has OS/2 italic bit
    }

    // Test 2: Static regular font (should be normal)
    let path = font_path("Allerta/Allerta-Regular.ttf");
    if path.exists() {
        let data = fs::read(&path).unwrap();
        let font_parser = Parser::new(&data).unwrap();
        let face_record = font_parser
            .extract_face_record("allerta-regular".to_string(), None)
            .unwrap();

        let classification = parser.classify_face(face_record);
        assert_eq!(
            classification.classification.italic_kind(),
            italic::ItalicKind::Normal
        );
        assert!(!classification.classification.is_variable);
    }

    // Test 3: Variable font italic (Inter Italic VF - properly flagged in OS/2)
    let path = font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf");
    if path.exists() {
        let data = fs::read(&path).unwrap();
        let font_parser = Parser::new(&data).unwrap();
        let face_record = font_parser
            .extract_face_record("inter-italic-vf".to_string(), None)
            .unwrap();

        let classification = parser.classify_face(face_record);
        // Level 1 correctly identifies this as Italic based on OS/2 bit
        assert_eq!(
            classification.classification.italic_kind(),
            italic::ItalicKind::Italic
        );
        assert!(classification.classification.is_variable);
        assert!(classification.face.os2_italic_bit); // Has OS/2 italic bit
        assert!(!classification.face.axes.contains_key("ital")); // No ital axis
    }

    // Test 4: Variable font without ital axis (Geist)
    let path = font_path("Geist/Geist-VariableFont_wght.ttf");
    if path.exists() {
        let data = fs::read(&path).unwrap();
        let font_parser = Parser::new(&data).unwrap();
        let face_record = font_parser
            .extract_face_record("geist-vf".to_string(), None)
            .unwrap();

        let classification = parser.classify_face(face_record);
        assert_eq!(
            classification.classification.italic_kind(),
            italic::ItalicKind::Normal
        );
        assert!(classification.classification.is_variable);
        assert!(!classification.face.os2_italic_bit);
    }
}

/// Test user font style declaration priority.
#[test]
fn test_user_font_style_priority() {
    let parser = italic::ItalicParser::new();

    // Create a face that OS/2 says is normal, but user declares as italic
    let face = FaceRecord {
        face_id: "test-user-style".to_string(),
        ps_name: "TestFont-Regular".to_string(),
        family_name: "Test".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: false, // OS/2 says not italic
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: Some(true), // But user says it is italic
    };

    let classification = parser.classify_face(face);
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
}

/// Test family aggregation with multiple static fonts.
#[test]
fn test_family_aggregation_multi_static() {
    let parser = italic::ItalicParser::new();

    // Create a family with regular and italic variants
    let regular = FaceRecord {
        face_id: "pt-serif-regular".to_string(),
        ps_name: "PTSerif-Regular".to_string(),
        family_name: "PT Serif".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: false,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let italic = FaceRecord {
        face_id: "pt-serif-italic".to_string(),
        ps_name: "PTSerif-Italic".to_string(),
        family_name: "PT Serif".to_string(),
        typographic_family: None,
        subfamily_name: "Italic".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: true,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let map = parser.build_capability_map(vec![regular, italic]);

    assert_eq!(map.scenario, FamilyScenario::MultiStatic);
    assert_eq!(map.upright_slots.len(), 1);
    assert_eq!(map.italic_slots.len(), 1);

    // Check that the slots contain the right faces
    let upright_key = (400, 5);
    let italic_key = (400, 5);

    assert!(map.upright_slots.contains_key(&upright_key));
    assert!(map.italic_slots.contains_key(&italic_key));

    assert_eq!(map.upright_slots[&upright_key].face_id, "pt-serif-regular");
    assert_eq!(map.italic_slots[&italic_key].face_id, "pt-serif-italic");
}

/// Test family aggregation with dual variable fonts.
#[test]
fn test_family_aggregation_dual_vf() {
    let parser = italic::ItalicParser::new();

    // Create Inter family with Roman and Italic VFs
    let roman_vf = FaceRecord {
        face_id: "inter-roman-vf".to_string(),
        ps_name: "Inter-VariableFont_opsz,wght".to_string(),
        family_name: "Inter".to_string(),
        typographic_family: None,
        subfamily_name: "Variable".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes: {
            let mut axes = std::collections::HashMap::new();
            axes.insert("wght".to_string(), (100.0, 400.0, 900.0));
            axes.insert("opsz".to_string(), (8.0, 14.0, 144.0));
            axes
        },
        os2_italic_bit: false,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let italic_vf = FaceRecord {
        face_id: "inter-italic-vf".to_string(),
        ps_name: "Inter-Italic-VariableFont_opsz,wght".to_string(),
        family_name: "Inter".to_string(),
        typographic_family: None,
        subfamily_name: "Italic Variable".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes: {
            let mut axes = std::collections::HashMap::new();
            axes.insert("wght".to_string(), (100.0, 400.0, 900.0));
            axes.insert("opsz".to_string(), (8.0, 14.0, 144.0));
            axes
        },
        os2_italic_bit: true,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let map = parser.build_capability_map(vec![roman_vf, italic_vf]);

    assert_eq!(map.scenario, FamilyScenario::DualVf);
    assert_eq!(map.upright_slots.len(), 1);
    assert_eq!(map.italic_slots.len(), 1);

    let upright_key = (400, 5);
    let italic_key = (400, 5);

    assert_eq!(map.upright_slots[&upright_key].face_id, "inter-roman-vf");
    assert_eq!(map.italic_slots[&italic_key].face_id, "inter-italic-vf");
}

/// Test variable font with ital axis.
#[test]
fn test_variable_font_ital_axis() {
    let parser = italic::ItalicParser::new();

    // Create a hypothetical VF with ital axis
    let vf_with_ital = FaceRecord {
        face_id: "hypothetical-ital-vf".to_string(),
        ps_name: "Hypothetical-VariableFont_ital,wght".to_string(),
        family_name: "Hypothetical".to_string(),
        typographic_family: None,
        subfamily_name: "Variable".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes: {
            let mut axes = std::collections::HashMap::new();
            axes.insert("ital".to_string(), (0.0, 1.0, 1.0)); // Default ital=1
            axes.insert("wght".to_string(), (100.0, 400.0, 900.0));
            axes
        },
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = parser.classify_face(vf_with_ital);
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.is_variable);
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert_eq!(recipe.axis_values.get("ital"), Some(&1.0));
}

/// Test parser configuration.
#[test]
fn test_parser_configuration() {
    // Test default config
    let parser_default = italic::ItalicParser::new();
    assert!(parser_default.config().trust_user_font_style);

    // Test custom config
    let config = ParserConfig {
        trust_user_font_style: false,
    };
    let parser_custom = italic::ItalicParser::with_config(config);
    assert!(!parser_custom.config().trust_user_font_style);
}

/// Test VfRecipe creation and manipulation.
#[test]
fn test_vf_recipe() {
    let recipe = VfRecipe::new("ital", 1.0);
    assert_eq!(recipe.axis_values.get("ital"), Some(&1.0));
    assert_eq!(recipe.axis_values.len(), 1);

    let empty = VfRecipe::empty();
    assert!(empty.axis_values.is_empty());
}

/// Test face record extraction from real font files.
#[test]
fn test_face_record_extraction() {
    // Test with a real font file
    let path = font_path("Molle/Molle-Italic.ttf");
    if path.exists() {
        let data = fs::read(&path).unwrap();
        let parser = Parser::new(&data).unwrap();
        let face_record = parser
            .extract_face_record("molle-italic".to_string(), None)
            .unwrap();

        assert_eq!(face_record.face_id, "molle-italic");
        assert!(!face_record.ps_name.is_empty());
        assert!(!face_record.family_name.is_empty());
        assert!(!face_record.subfamily_name.is_empty());
        assert!(!face_record.is_variable);
        // Molle-Italic.ttf is properly flagged as Italic in OS/2 table
        assert!(face_record.os2_italic_bit); // Has OS/2 italic bit
    }
}

/// Test edge cases and error handling.
#[test]
fn test_edge_cases() {
    let parser = italic::ItalicParser::new();

    // Test empty capability map
    let empty_map = parser.build_capability_map(vec![]);
    assert_eq!(empty_map.scenario, FamilyScenario::SingleStatic);
    assert_eq!(empty_map.upright_slots.len(), 0);
    assert_eq!(empty_map.italic_slots.len(), 0);

    // Test single static font
    let single_face = FaceRecord {
        face_id: "single".to_string(),
        ps_name: "Single-Regular".to_string(),
        family_name: "Single".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: false,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let single_map = parser.build_capability_map(vec![single_face]);
    assert_eq!(single_map.scenario, FamilyScenario::SingleStatic);
    assert_eq!(single_map.upright_slots.len(), 1);
    assert_eq!(single_map.italic_slots.len(), 0);
}

/// Test weight and stretch key handling.
#[test]
fn test_weight_stretch_keys() {
    let parser = italic::ItalicParser::new();

    // Test different weight classes
    let light_face = FaceRecord {
        face_id: "light".to_string(),
        ps_name: "Test-Light".to_string(),
        family_name: "Test".to_string(),
        typographic_family: None,
        subfamily_name: "Light".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: false,
        weight_class: 300, // Light
        width_class: 5,
        user_font_style_italic: None,
    };

    let bold_face = FaceRecord {
        face_id: "bold".to_string(),
        ps_name: "Test-Bold".to_string(),
        family_name: "Test".to_string(),
        typographic_family: None,
        subfamily_name: "Bold".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: false,
        weight_class: 700, // Bold
        width_class: 5,
        user_font_style_italic: None,
    };

    let map = parser.build_capability_map(vec![light_face, bold_face]);
    assert_eq!(map.upright_slots.len(), 2);

    // Should have separate slots for different weights
    assert!(map.upright_slots.contains_key(&(300, 5)));
    assert!(map.upright_slots.contains_key(&(700, 5)));
}
