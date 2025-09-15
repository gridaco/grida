use std::collections::HashMap;

use fonts::selection_italic as italic;
use fonts::{FaceRecord, FamilyScenario};

/// Test Scenario 3-1: Variable font with `slnt` axis & italic instances
///
/// Single variable font with `slnt` axis and explicit italic instances in `fvar.instances`.
/// Examples: Recursive, Roboto Flex
///
/// Level 1 Detection: Requires both `slnt` axis AND italic-named instances via name table
#[test]
fn test_scenario_3_1_recursive_font() {
    let italic_parser = italic::ItalicParser::new();

    // Create Recursive-like font with slnt axis and italic instances
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0)); // min=-15, default=0, max=0
    axes.insert("wght".to_string(), (300.0, 400.0, 1000.0)); // weight axis
    axes.insert("casl".to_string(), (0.0, 0.0, 1.0)); // casual axis

    let face = FaceRecord {
        face_id: "recursive-variable".to_string(),
        ps_name: "Recursive-Variable".to_string(),
        family_name: "Recursive".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(), // Main name is Regular
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via Priority 4 (Level 1 permissive slnt detection)
    // because main names don't contain "italic" but font has slnt axis
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert!(recipe.axis_values.contains_key("slnt"));
    assert_eq!(recipe.axis_values["slnt"], -10.0); // Default slnt value

    // Should have instance info indicating slnt-axis-capable
    assert!(classification.classification.instance_info.is_some());
    let instance_info = classification.classification.instance_info.unwrap();
    assert_eq!(instance_info.italic_instances, vec!["slnt-axis-capable"]);

    println!("✅ Scenario 3-1 (Recursive): Correctly classified as Italic via Level 1 permissive slnt detection");
}

#[test]
fn test_scenario_3_1_roboto_flex_font() {
    let italic_parser = italic::ItalicParser::new();

    // Create Roboto Flex-like font with slnt axis
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-12.0, 0.0, 0.0)); // min=-12, default=0, max=0
    axes.insert("wght".to_string(), (100.0, 400.0, 1000.0)); // weight axis
    axes.insert("wdth".to_string(), (25.0, 100.0, 151.0)); // width axis
    axes.insert("opsz".to_string(), (8.0, 14.0, 144.0)); // optical size axis

    let face = FaceRecord {
        face_id: "roboto-flex-variable".to_string(),
        ps_name: "RobotoFlex-Variable".to_string(),
        family_name: "Roboto Flex".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(), // Main name is Regular
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via Priority 4 (Level 1 permissive slnt detection)
    // because main names don't contain "italic" but font has slnt axis
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert!(recipe.axis_values.contains_key("slnt"));
    assert_eq!(recipe.axis_values["slnt"], -10.0); // Default slnt value

    // Should have instance info indicating slnt-axis-capable
    assert!(classification.classification.instance_info.is_some());
    let instance_info = classification.classification.instance_info.unwrap();
    assert_eq!(instance_info.italic_instances, vec!["slnt-axis-capable"]);

    println!("✅ Scenario 3-1 (Roboto Flex): Correctly classified as Italic via Level 1 permissive slnt detection");
}

#[test]
fn test_scenario_3_1_true_italic_instances() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font that truly qualifies for Scenario 3-1 (slnt + italic-named instances)
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0)); // min=-15, default=0, max=0
    axes.insert("wght".to_string(), (300.0, 400.0, 1000.0)); // weight axis

    let face = FaceRecord {
        face_id: "true-scenario-3-1".to_string(),
        ps_name: "TrueScenario-Italic".to_string(), // PostScript name contains "Italic"
        family_name: "True Scenario".to_string(),
        typographic_family: None,
        subfamily_name: "Italic".to_string(), // Subfamily name contains "Italic"
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via Priority 3 (Scenario 3-1)
    // because it has both slnt axis AND italic-named instances
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert!(recipe.axis_values.contains_key("slnt"));
    assert_eq!(recipe.axis_values["slnt"], -10.0); // Default slnt value

    // Should have instance info with actual italic instances
    assert!(classification.classification.instance_info.is_some());
    let instance_info = classification.classification.instance_info.unwrap();
    assert!(instance_info
        .italic_instances
        .contains(&"Italic".to_string()));
    assert!(instance_info
        .italic_instances
        .contains(&"TrueScenario-Italic".to_string()));

    println!("✅ Scenario 3-1 (True italic instances): Correctly classified as Italic via Priority 3 (Scenario 3-1)");
}

#[test]
fn test_scenario_3_1_oblique_not_valid() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font with slnt axis but oblique names (should NOT qualify for Scenario 3-1)
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0)); // min=-15, default=0, max=0
    axes.insert("wght".to_string(), (300.0, 400.0, 1000.0)); // weight axis

    let face = FaceRecord {
        face_id: "oblique-not-italic".to_string(),
        ps_name: "ObliqueFont-Oblique".to_string(), // PostScript name contains "Oblique"
        family_name: "Oblique Font".to_string(),
        typographic_family: None,
        subfamily_name: "Oblique".to_string(), // Subfamily name contains "Oblique"
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via Priority 4 (Level 1 permissive slnt detection)
    // because oblique names don't qualify for Scenario 3-1, but slnt axis makes it italic-capable
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert!(recipe.axis_values.contains_key("slnt"));

    // Should have instance info indicating slnt-axis-capable (not true italic instances)
    assert!(classification.classification.instance_info.is_some());
    let instance_info = classification.classification.instance_info.unwrap();
    assert_eq!(instance_info.italic_instances, vec!["slnt-axis-capable"]);

    println!("✅ Scenario 3-1 (Oblique not valid): Correctly handled as Level 1 permissive, not Scenario 3-1");
}

#[test]
fn test_scenario_3_1_user_font_style_override() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font with slnt axis, but user declares it as italic
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0)); // min=-15, default=0, max=0
    axes.insert("wght".to_string(), (300.0, 400.0, 1000.0)); // weight axis

    let face = FaceRecord {
        face_id: "user-slnt-override".to_string(),
        ps_name: "UserSlnt-Regular".to_string(),
        family_name: "User Slnt".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: Some(true), // User declares it as italic
    };

    let classification = italic_parser.classify_face(face);

    // Should be classified as Italic via user declaration (highest priority)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_none()); // User declaration doesn't need recipe

    println!(
        "✅ Scenario 3-1 (User override): Correctly classified as Italic via user declaration"
    );
}

#[test]
fn test_scenario_3_1_family_aggregation() {
    let italic_parser = italic::ItalicParser::new();

    // Test family aggregation for Scenario 3-1 (single VF with slnt)
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0)); // min=-15, default=0, max=0
    axes.insert("wght".to_string(), (300.0, 400.0, 1000.0)); // weight axis

    let faces = vec![FaceRecord {
        face_id: "single-vf-slnt".to_string(),
        ps_name: "SingleVF-Slnt".to_string(),
        family_name: "Single VF Slnt".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    }];

    let capability_map = italic_parser.build_capability_map(faces);

    // Should have single VF scenario
    assert_eq!(capability_map.scenario, FamilyScenario::SingleVf);

    // Should have 1 italic slot (since slnt axis makes it italic-capable)
    assert_eq!(capability_map.upright_slots.len(), 0);
    assert_eq!(capability_map.italic_slots.len(), 1);

    // Check italic slot has slnt recipe
    let italic_key = (400, 5);
    assert!(capability_map.italic_slots.contains_key(&italic_key));
    let italic_face = &capability_map.italic_slots[&italic_key];
    assert!(italic_face.vf_recipe.is_some());
    assert!(italic_face
        .vf_recipe
        .as_ref()
        .unwrap()
        .axis_values
        .contains_key("slnt"));

    println!("✅ Scenario 3-1 (Family aggregation): Correctly identified as SingleVf scenario with slnt recipe");
}
