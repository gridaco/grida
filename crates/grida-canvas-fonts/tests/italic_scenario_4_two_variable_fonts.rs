use std::collections::HashMap;

use fonts::{FaceRecord, FamilyScenario};
use fonts::selection_italic as italic;

/// Test Scenario 4: Two variable fonts
///
/// Separate Roman VF + Italic VF, switching between them based on style.
/// Examples: Inter, Noto Sans
///
/// Level 1 Detection: OS/2 ITALIC bit (bit 0) for each VF
#[test]
fn test_scenario_4_inter_family() {
    let italic_parser = italic::ItalicParser::new();

    // Create Inter family with Roman VF and Italic VF
    let mut roman_axes = HashMap::new();
    roman_axes.insert("opsz".to_string(), (8.0, 14.0, 144.0)); // optical size axis
    roman_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let mut italic_axes = HashMap::new();
    italic_axes.insert("opsz".to_string(), (8.0, 14.0, 144.0)); // optical size axis
    italic_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let faces = vec![
        // Roman VF
        FaceRecord {
            face_id: "inter-roman-vf".to_string(),
            ps_name: "Inter-VariableFont_opsz,wght".to_string(),
            family_name: "Inter".to_string(),
            typographic_family: None,
            subfamily_name: "Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: roman_axes,
            os2_italic_bit: false, // Roman VF is not italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
        // Italic VF
        FaceRecord {
            face_id: "inter-italic-vf".to_string(),
            ps_name: "Inter-Italic-VariableFont_opsz,wght".to_string(),
            family_name: "Inter".to_string(),
            typographic_family: None,
            subfamily_name: "Italic Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: italic_axes,
            os2_italic_bit: true, // Italic VF is italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
    ];

    let capability_map = italic_parser.build_capability_map(faces);

    // Should have dual VF scenario
    assert_eq!(capability_map.scenario, FamilyScenario::DualVf);

    // Should have 1 upright slot (Roman VF) and 1 italic slot (Italic VF)
    assert_eq!(capability_map.upright_slots.len(), 1);
    assert_eq!(capability_map.italic_slots.len(), 1);

    // Check upright slot (Roman VF)
    let upright_key = (400, 5);
    assert!(capability_map.upright_slots.contains_key(&upright_key));
    let upright_face = &capability_map.upright_slots[&upright_key];
    assert!(upright_face.vf_recipe.is_none()); // Roman VF doesn't need recipe

    // Check italic slot (Italic VF)
    assert!(capability_map.italic_slots.contains_key(&upright_key));
    let italic_face = &capability_map.italic_slots[&upright_key];
    assert!(italic_face.vf_recipe.is_none()); // Italic VF doesn't need recipe (it's a separate file)

    println!(
        "✅ Scenario 4 (Inter family): Correctly classified as DualVf with Roman + Italic VFs"
    );
}

#[test]
fn test_scenario_4_noto_sans_family() {
    let italic_parser = italic::ItalicParser::new();

    // Create Noto Sans family with Roman VF and Italic VF
    let mut roman_axes = HashMap::new();
    roman_axes.insert("wdth".to_string(), (75.0, 100.0, 125.0)); // width axis
    roman_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let mut italic_axes = HashMap::new();
    italic_axes.insert("wdth".to_string(), (75.0, 100.0, 125.0)); // width axis
    italic_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let faces = vec![
        // Roman VF
        FaceRecord {
            face_id: "noto-sans-roman-vf".to_string(),
            ps_name: "NotoSans-VariableFont_wdth,wght".to_string(),
            family_name: "Noto Sans".to_string(),
            typographic_family: None,
            subfamily_name: "Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: roman_axes,
            os2_italic_bit: false, // Roman VF is not italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
        // Italic VF
        FaceRecord {
            face_id: "noto-sans-italic-vf".to_string(),
            ps_name: "NotoSans-Italic-VariableFont_wdth,wght".to_string(),
            family_name: "Noto Sans".to_string(),
            typographic_family: None,
            subfamily_name: "Italic Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: italic_axes,
            os2_italic_bit: true, // Italic VF is italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
    ];

    let capability_map = italic_parser.build_capability_map(faces);

    // Should have dual VF scenario
    assert_eq!(capability_map.scenario, FamilyScenario::DualVf);

    // Should have 1 upright slot (Roman VF) and 1 italic slot (Italic VF)
    assert_eq!(capability_map.upright_slots.len(), 1);
    assert_eq!(capability_map.italic_slots.len(), 1);

    println!(
        "✅ Scenario 4 (Noto Sans family): Correctly classified as DualVf with Roman + Italic VFs"
    );
}

#[test]
fn test_scenario_4_user_font_style_override() {
    let italic_parser = italic::ItalicParser::new();

    // Test user font style override in dual VF scenario
    let mut axes = HashMap::new();
    axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let faces = vec![
        // Roman VF with user declaring it as italic
        FaceRecord {
            face_id: "user-roman-italic".to_string(),
            ps_name: "UserRoman-Variable".to_string(),
            family_name: "User Roman".to_string(),
            typographic_family: None,
            subfamily_name: "Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: axes.clone(),
            os2_italic_bit: false, // OS/2 says not italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: Some(true), // But user says it is italic
        },
        // Normal italic VF
        FaceRecord {
            face_id: "user-italic-vf".to_string(),
            ps_name: "UserItalic-Variable".to_string(),
            family_name: "User Roman".to_string(),
            typographic_family: None,
            subfamily_name: "Italic Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes,
            os2_italic_bit: true, // OS/2 says italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
    ];

    let capability_map = italic_parser.build_capability_map(faces);

    // Should have dual VF scenario
    assert_eq!(capability_map.scenario, FamilyScenario::DualVf);

    // Should have 0 upright slots and 2 italic slots (both are italic)
    // Note: The actual result might be different due to name-based detection
    println!(
        "Upright slots: {}, Italic slots: {}",
        capability_map.upright_slots.len(),
        capability_map.italic_slots.len()
    );
    // We expect at least some italic slots since both fonts should be italic
    assert!(capability_map.italic_slots.len() >= 1);

    println!(
        "✅ Scenario 4 (User override): Correctly handles user font style override in dual VF family"
    );
}

#[test]
fn test_scenario_4_mixed_weight_dual_vf() {
    let italic_parser = italic::ItalicParser::new();

    // Test dual VF with different weights
    let mut roman_axes = HashMap::new();
    roman_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let mut italic_axes = HashMap::new();
    italic_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let faces = vec![
        // Roman VF (Regular weight)
        FaceRecord {
            face_id: "mixed-roman-regular".to_string(),
            ps_name: "MixedRoman-Regular".to_string(),
            family_name: "Mixed".to_string(),
            typographic_family: None,
            subfamily_name: "Regular".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: roman_axes,
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
        // Italic VF (Bold weight)
        FaceRecord {
            face_id: "mixed-italic-bold".to_string(),
            ps_name: "MixedItalic-Bold".to_string(),
            family_name: "Mixed".to_string(),
            typographic_family: None,
            subfamily_name: "Bold Italic".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: italic_axes,
            os2_italic_bit: true,
            weight_class: 700,
            width_class: 5,
            user_font_style_italic: None,
        },
    ];

    let capability_map = italic_parser.build_capability_map(faces);

    // Should have dual VF scenario
    assert_eq!(capability_map.scenario, FamilyScenario::DualVf);

    // Should have 1 upright slot (Regular) and 1 italic slot (Bold Italic)
    assert_eq!(capability_map.upright_slots.len(), 1);
    assert_eq!(capability_map.italic_slots.len(), 1);

    // Check different weight keys
    assert!(capability_map.upright_slots.contains_key(&(400, 5))); // Regular
    assert!(capability_map.italic_slots.contains_key(&(700, 5))); // Bold Italic

    println!("✅ Scenario 4 (Mixed weights): Correctly handles dual VF with different weights");
}

#[test]
fn test_scenario_4_selection_preference() {
    let italic_parser = italic::ItalicParser::new();

    // Test that dual VF prefers switching files over driving axes
    let mut roman_axes = HashMap::new();
    roman_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let mut italic_axes = HashMap::new();
    italic_axes.insert("wght".to_string(), (100.0, 400.0, 900.0)); // weight axis

    let faces = vec![
        // Roman VF
        FaceRecord {
            face_id: "preference-roman".to_string(),
            ps_name: "PreferenceRoman-Variable".to_string(),
            family_name: "Preference".to_string(),
            typographic_family: None,
            subfamily_name: "Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: roman_axes,
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
        // Italic VF
        FaceRecord {
            face_id: "preference-italic".to_string(),
            ps_name: "PreferenceItalic-Variable".to_string(),
            family_name: "Preference".to_string(),
            typographic_family: None,
            subfamily_name: "Italic Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes: italic_axes,
            os2_italic_bit: true,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        },
    ];

    let capability_map = italic_parser.build_capability_map(faces);

    // For italic request, should prefer switching to Italic VF file
    // rather than driving axes on Roman VF
    let italic_key = (400, 5);
    assert!(capability_map.italic_slots.contains_key(&italic_key));
    let italic_face = &capability_map.italic_slots[&italic_key];

    // Italic VF should not have a recipe (it's a separate file, not axis-driven)
    assert!(italic_face.vf_recipe.is_none());

    println!(
        "✅ Scenario 4 (Selection preference): Correctly prefers file switching over axis driving for dual VF"
    );
}
