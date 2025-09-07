use std::collections::HashMap;

use grida_canvas_fonts::selection_italic as italic;
use grida_canvas_fonts::{FaceRecord, FamilyScenario};

/// Test Scenario 1: One static font
///
/// Single static font file without variable axes. Italic may or may not be present.
/// Examples:
/// - Non-italic: Allerta-Regular.ttf
/// - Italic-only: Molle-Italic.ttf (rare case)
///
/// Level 1 Detection: OS/2 ITALIC bit (bit 0)
#[test]
fn test_scenario_1_non_italic_static_font() {
    let italic_parser = italic::ItalicParser::new();

    // Create a non-italic static font (like Allerta-Regular.ttf)
    let face = FaceRecord {
        face_id: "allerta-regular".to_string(),
        ps_name: "Allerta-Regular".to_string(),
        family_name: "Allerta".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(),  // No variable axes
        os2_italic_bit: false, // OS/2 says not italic
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Normal (no italic capability)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Normal
    );
    assert!(classification.classification.vf_recipe.is_none());
    assert!(classification.classification.instance_info.is_none());

    println!("✅ Scenario 1 (Non-italic static): Correctly classified as Normal");
}

#[test]
fn test_scenario_1_italic_only_static_font() {
    let italic_parser = italic::ItalicParser::new();

    // Create an italic-only static font (like Molle-Italic.ttf)
    let face = FaceRecord {
        face_id: "molle-italic".to_string(),
        ps_name: "Molle-Italic".to_string(),
        family_name: "Molle".to_string(),
        typographic_family: None,
        subfamily_name: "Italic".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(), // No variable axes
        os2_italic_bit: true, // OS/2 says italic
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via OS/2 bit
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_none()); // Static font, no recipe
    assert!(classification.classification.instance_info.is_none());

    println!("✅ Scenario 1 (Italic-only static): Correctly classified as Italic via OS/2");
}

#[test]
fn test_scenario_1_user_font_style_override() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font that OS/2 says is not italic, but user declares it is
    let face = FaceRecord {
        face_id: "user-declared-italic".to_string(),
        ps_name: "CustomFont-Regular".to_string(),
        family_name: "Custom Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(),
        os2_italic_bit: false, // OS/2 says not italic
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: Some(true), // But user says it is italic
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via user declaration (highest priority)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_none());
    assert!(classification.classification.instance_info.is_none());

    println!("✅ Scenario 1 (User override): Correctly classified as Italic via user declaration");
}

#[test]
fn test_scenario_1_family_aggregation() {
    let italic_parser = italic::ItalicParser::new();

    // Test family aggregation for Scenario 1
    let faces = vec![
        // Single static font
        FaceRecord {
            face_id: "single-static".to_string(),
            ps_name: "SingleFont-Regular".to_string(),
            family_name: "Single Font".to_string(),
            typographic_family: None,
            subfamily_name: "Regular".to_string(),
            typographic_subfamily: None,
            is_variable: false,
            axes: HashMap::new(),
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
    ];

    let capability_map = italic_parser.build_capability_map(faces);

    // Should have single static scenario
    assert_eq!(capability_map.scenario, FamilyScenario::SingleStatic);

    // Should have one upright slot, no italic slots
    assert_eq!(capability_map.upright_slots.len(), 1);
    assert_eq!(capability_map.italic_slots.len(), 0);

    // Check that the upright slot has the correct weight/stretch
    let upright_key = (400, 5);
    assert!(capability_map.upright_slots.contains_key(&upright_key));

    println!("✅ Scenario 1 (Family aggregation): Correctly identified as SingleStatic scenario");
}
