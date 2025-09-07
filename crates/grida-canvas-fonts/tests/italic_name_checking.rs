use std::collections::HashMap;

use grida_canvas_fonts::FaceRecord;
use grida_canvas_fonts::selection_italic as italic;

/// Test italic instance detection with various name combinations
#[test]
fn test_italic_instance_detection() {
    let italic_parser = italic::ItalicParser::new();

    // Test cases for italic instance detection
    let test_cases = vec![
        // Valid italic cases
        ("Italic", true, vec!["Italic", "TestFont-Italic"]), // Both subfamily and PS name contain "italic"
        (
            "Bold Italic",
            true,
            vec!["Bold Italic", "TestFont-Bold Italic"],
        ),
        (
            "Light Italic",
            true,
            vec!["Light Italic", "TestFont-Light Italic"],
        ),
        (
            "TestFont-Italic",
            true,
            vec!["TestFont-Italic", "TestFont-TestFont-Italic"],
        ), // Both contain "italic"
        ("Regular", false, vec![]),
        ("Bold", false, vec![]),
        ("TestFont-Regular", false, vec![]),
        // IMPORTANT: "oblique" should NOT be considered valid italic
        ("Oblique", false, vec![]),
        ("Bold Oblique", false, vec![]),
        ("TestFont-Oblique", false, vec![]),
        (
            "Italic Oblique",
            true,
            vec!["Italic Oblique", "TestFont-Italic Oblique"],
        ), // Contains "italic" so valid
        // Edge cases
        ("", false, vec![]),
        ("ITALIC", true, vec!["ITALIC", "TestFont-ITALIC"]), // Case insensitive
        ("italic", true, vec!["italic", "TestFont-italic"]),
        ("ItAlIc", true, vec!["ItAlIc", "TestFont-ItAlIc"]), // Mixed case
    ];

    for (name, should_be_italic, expected_instances) in test_cases {
        let mut axes = HashMap::new();
        axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0));

        let face = FaceRecord {
            face_id: format!("test-{}", name.replace(" ", "_")),
            ps_name: format!("TestFont-{}", name),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: name.to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes,
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        };

        // Test extract_italic_instances
        let italic_instances = italic_parser.extract_italic_instances(&face);
        assert_eq!(
            italic_instances, expected_instances,
            "Failed for name '{}': expected {:?}, got {:?}",
            name, expected_instances, italic_instances
        );

        // Test has_italic_named_instances
        let has_italic = italic_parser.has_italic_named_instances(&face);
        assert_eq!(
            has_italic, should_be_italic,
            "Failed for name '{}': expected {}, got {}",
            name, should_be_italic, has_italic
        );

        // Test is_italic_by_name
        let is_italic_by_name = italic_parser.is_italic_by_name(&face);
        assert_eq!(
            is_italic_by_name, should_be_italic,
            "Failed for name '{}': expected {}, got {}",
            name, should_be_italic, is_italic_by_name
        );

        println!(
            "✅ '{}' -> italic: {}, instances: {:?}",
            name, should_be_italic, italic_instances
        );
    }
}

/// Test that oblique is NOT considered valid italic
#[test]
fn test_oblique_not_valid_italic() {
    let italic_parser = italic::ItalicParser::new();

    let oblique_cases = vec![
        "Oblique",
        "Bold Oblique",
        "Light Oblique",
        "TestFont-Oblique",
        "OBLIQUE",
        "oblique",
        "ObLiQuE",
    ];

    for name in oblique_cases {
        let mut axes = HashMap::new();
        axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0));

        let face = FaceRecord {
            face_id: format!("test-{}", name.replace(" ", "_")),
            ps_name: format!("TestFont-{}", name),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: name.to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes,
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        };

        // These should all be false - oblique is NOT valid italic
        let italic_instances = italic_parser.extract_italic_instances(&face);
        assert!(
            italic_instances.is_empty(),
            "Oblique name '{}' should not produce italic instances, got: {:?}",
            name,
            italic_instances
        );

        let has_italic = italic_parser.has_italic_named_instances(&face);
        assert!(
            !has_italic,
            "Oblique name '{}' should not be considered italic",
            name
        );

        let is_italic_by_name = italic_parser.is_italic_by_name(&face);
        assert!(
            !is_italic_by_name,
            "Oblique name '{}' should not be considered italic by name",
            name
        );

        println!("✅ '{}' correctly rejected as italic", name);
    }
}

/// Test Scenario 3-1 with proper italic instances
#[test]
fn test_scenario_3_1_with_italic_instances() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font that should qualify for Scenario 3-1
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0));

    let face = FaceRecord {
        face_id: "scenario-3-1-italic".to_string(),
        ps_name: "TestFont-Italic".to_string(),
        family_name: "Test".to_string(),
        typographic_family: None,
        subfamily_name: "Italic".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    // Should be classified as Italic via Priority 3 (Scenario 3-1)
    let classification = italic_parser.classify_face(face);

    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert!(recipe.axis_values.contains_key("slnt"));

    // Should have instance information
    assert!(classification.classification.instance_info.is_some());
    let instance_info = classification.classification.instance_info.unwrap();
    assert_eq!(instance_info.ps_name, "TestFont-Italic");
    assert_eq!(instance_info.style_name, "Italic");
    assert!(!instance_info.italic_instances.is_empty());
    assert!(
        instance_info
            .italic_instances
            .contains(&"Italic".to_string())
    );
    assert!(
        instance_info
            .italic_instances
            .contains(&"TestFont-Italic".to_string())
    );

    println!(
        "✅ Scenario 3-1 correctly detected with italic instances: {:?}",
        instance_info.italic_instances
    );
}

/// Test that fonts with oblique names do NOT qualify for Scenario 3-1
#[test]
fn test_scenario_3_1_rejects_oblique() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font with oblique name that should NOT qualify for Scenario 3-1
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0));

    let face = FaceRecord {
        face_id: "scenario-3-1-oblique".to_string(),
        ps_name: "TestFont-Oblique".to_string(),
        family_name: "Test".to_string(),
        typographic_family: None,
        subfamily_name: "Oblique".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    // Should be classified as Italic via Priority 4 (Level 1 permissive), NOT Scenario 3-1
    let classification = italic_parser.classify_face(face);

    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );
    assert!(classification.classification.vf_recipe.is_some());

    let recipe = classification.classification.vf_recipe.unwrap();
    assert!(recipe.axis_values.contains_key("slnt"));

    // Should have instance information indicating it's slnt-axis-capable, not true italic instances
    assert!(classification.classification.instance_info.is_some());
    let instance_info = classification.classification.instance_info.unwrap();
    assert_eq!(instance_info.ps_name, "TestFont-Oblique");
    assert_eq!(instance_info.style_name, "Oblique");
    assert_eq!(instance_info.italic_instances, vec!["slnt-axis-capable"]);

    println!("✅ Oblique font correctly handled as Level 1 permissive, not Scenario 3-1");
}
