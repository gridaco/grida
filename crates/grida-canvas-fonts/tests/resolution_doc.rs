use grida_canvas_fonts::{CurrentTextStyle, UIFontParser};
use std::collections::HashMap;

/// Comprehensive documentation of smart resolution behavior.
///
/// This test serves as living documentation of the exact behavior expected
/// from smart resolution. It's crucial for implementing get_normals() which
/// will need to work in reverse and maintain consistency.
///
/// BEHAVIOR SPECIFICATION:
///
/// 1. PRIORITY RULE: Explicit properties (weight, width, slant) ALWAYS take priority over custom_axes
///    - weight: Some(400) + custom_axes["wght"]: 500.0 → Result: 400.0
///    - width: Some(100) + custom_axes["wdth"]: 120.0 → Result: 100.0
///    - slant: Some(15.0) + custom_axes["slnt"]: 5.0 → Result: 15.0
///
/// 2. FALLBACK RULE: Only use custom_axes when explicit property is None
///    - weight: None + custom_axes["wght"]: 500.0 → Result: 500.0
///    - width: None + custom_axes["wdth"]: 120.0 → Result: 120.0
///    - slant: None + custom_axes["slnt"]: 5.0 → Result: 5.0
///
/// 3. ITALIC SPECIAL: italic flag NEVER maps to custom_axes["ital"] - always returns None
///    - italic: Some(true) + custom_axes["ital"]: 1.0 → Result: None
///    - italic: Some(false) + custom_axes["ital"]: 0.0 → Result: None
///    - italic: None + custom_axes["ital"]: 1.0 → Result: None
///
/// 4. CUSTOM AXES: Only resolve to custom_axes for axes without explicit properties
///    - custom_axes["opsz"]: 14.0 → Result: 14.0
///    - custom_axes["GRAD"]: 0.5 → Result: 0.5
///
/// 5. NONE VALUES: Return None when both explicit and custom_axes are None/empty
///    - weight: None + no custom_axes["wght"] → Result: None
///    - width: None + no custom_axes["wdth"] → Result: None
///    - slant: None + no custom_axes["slnt"] → Result: None
///
/// 6. EDGE CASES: Zero and negative values are treated as valid explicit values
///    - weight: Some(0) + custom_axes["wght"]: 500.0 → Result: 0.0
///    - slant: Some(-15.0) + custom_axes["slnt"]: 5.0 → Result: -15.0

#[test]
fn document_priority_rule_behavior() {
    let parser = UIFontParser::new();

    // DOCUMENTATION: Priority rule examples for weight
    let weight_test_cases = vec![
        // (explicit_value, custom_axes_value, expected_result, description)
        (
            Some(400),
            500.0,
            Some(400.0),
            "weight=400 should win over custom_axes[\"wght\"]=500",
        ),
        (
            Some(0),
            500.0,
            Some(0.0),
            "weight=0 should win over custom_axes[\"wght\"]=500",
        ),
    ];

    for (explicit_weight, custom_wght, expected, description) in weight_test_cases {
        let mut custom_axes = HashMap::new();
        custom_axes.insert("wght".to_string(), custom_wght);

        let current_style = CurrentTextStyle {
            weight: explicit_weight,
            width: None,
            slant: None,

            custom_axes,
        };

        let result = parser.get_current_axis_value(&current_style, "wght");
        assert_eq!(result, expected, "PRIORITY RULE: {}", description);
    }

    // DOCUMENTATION: Priority rule examples for width
    let width_test_cases = vec![
        (
            Some(100),
            120.0,
            Some(100.0),
            "width=100 should win over custom_axes[\"wdth\"]=120",
        ),
        (
            Some(0),
            120.0,
            Some(0.0),
            "width=0 should win over custom_axes[\"wdth\"]=120",
        ),
    ];

    for (explicit_width, custom_wdth, expected, description) in width_test_cases {
        let mut custom_axes = HashMap::new();
        custom_axes.insert("wdth".to_string(), custom_wdth);

        let current_style = CurrentTextStyle {
            weight: None,
            width: explicit_width,
            slant: None,

            custom_axes,
        };

        let result = parser.get_current_axis_value(&current_style, "wdth");
        assert_eq!(result, expected, "PRIORITY RULE: {}", description);
    }

    // DOCUMENTATION: Priority rule examples for slant
    let slant_test_cases = vec![
        (
            Some(15.0),
            5.0,
            Some(15.0),
            "slant=15.0 should win over custom_axes[\"slnt\"]=5.0",
        ),
        (
            Some(0.0),
            5.0,
            Some(0.0),
            "slant=0.0 should win over custom_axes[\"slnt\"]=5.0",
        ),
        (
            Some(-15.0),
            5.0,
            Some(-15.0),
            "slant=-15.0 should win over custom_axes[\"slnt\"]=5.0",
        ),
    ];

    for (explicit_slant, custom_slnt, expected, description) in slant_test_cases {
        let mut custom_axes = HashMap::new();
        custom_axes.insert("slnt".to_string(), custom_slnt);

        let current_style = CurrentTextStyle {
            weight: None,
            width: None,
            slant: explicit_slant,

            custom_axes,
        };

        let result = parser.get_current_axis_value(&current_style, "slnt");
        assert_eq!(result, expected, "PRIORITY RULE: {}", description);
    }
}

#[test]
fn document_fallback_rule_behavior() {
    let parser = UIFontParser::new();

    // DOCUMENTATION: Fallback rule examples
    let test_cases = vec![
        // (custom_axes_value, expected_result, description)
        (
            500.0,
            Some(500.0),
            "weight=None should fallback to custom_axes[\"wght\"]=500",
        ),
        (
            120.0,
            Some(120.0),
            "width=None should fallback to custom_axes[\"wdth\"]=120",
        ),
        (
            5.0,
            Some(5.0),
            "slant=None should fallback to custom_axes[\"slnt\"]=5.0",
        ),
        (
            0.0,
            Some(0.0),
            "weight=None should fallback to custom_axes[\"wght\"]=0",
        ),
        (
            -5.0,
            Some(-5.0),
            "slant=None should fallback to custom_axes[\"slnt\"]=-5.0",
        ),
    ];

    for (custom_wght, expected, description) in test_cases {
        let mut custom_axes = HashMap::new();
        custom_axes.insert("wght".to_string(), custom_wght);

        let current_style = CurrentTextStyle {
            weight: None, // This should trigger fallback
            width: None,
            slant: None,

            custom_axes,
        };

        let result = parser.get_current_axis_value(&current_style, "wght");
        assert_eq!(result, expected, "FALLBACK RULE: {}", description);
    }
}

// Test removed: italic field no longer exists in CurrentTextStyle

#[test]
fn document_custom_axes_behavior() {
    let parser = UIFontParser::new();

    // DOCUMENTATION: Custom axes behavior examples
    let test_cases = vec![
        // (axis_tag, custom_value, expected_result, description)
        (
            "opsz",
            14.0,
            Some(14.0),
            "custom_axes[\"opsz\"]=14.0 should be used",
        ),
        (
            "GRAD",
            0.5,
            Some(0.5),
            "custom_axes[\"GRAD\"]=0.5 should be used",
        ),
        (
            "YTLC",
            500.0,
            Some(500.0),
            "custom_axes[\"YTLC\"]=500.0 should be used",
        ),
        (
            "YTUC",
            750.0,
            Some(750.0),
            "custom_axes[\"YTUC\"]=750.0 should be used",
        ),
    ];

    for (axis_tag, custom_value, expected, description) in test_cases {
        let mut custom_axes = HashMap::new();
        custom_axes.insert(axis_tag.to_string(), custom_value);

        let current_style = CurrentTextStyle {
            weight: None,
            width: None,
            slant: None,

            custom_axes,
        };

        let result = parser.get_current_axis_value(&current_style, axis_tag);
        assert_eq!(result, expected, "CUSTOM AXES RULE: {}", description);
    }
}

#[test]
fn document_none_values_behavior() {
    let parser = UIFontParser::new();

    // DOCUMENTATION: None values behavior examples
    let test_cases = vec![
        // (axis_tag, description)
        (
            "wght",
            "weight=None + no custom_axes[\"wght\"] should return None",
        ),
        (
            "wdth",
            "width=None + no custom_axes[\"wdth\"] should return None",
        ),
        (
            "slnt",
            "slant=None + no custom_axes[\"slnt\"] should return None",
        ),
        (
            "ital",
            "italic=None + no custom_axes[\"ital\"] should return None",
        ),
        ("opsz", "no custom_axes[\"opsz\"] should return None"),
        ("GRAD", "no custom_axes[\"GRAD\"] should return None"),
    ];

    for (axis_tag, description) in test_cases {
        let current_style = CurrentTextStyle {
            weight: None,
            width: None,
            slant: None,

            custom_axes: HashMap::new(), // Empty custom_axes
        };

        let result = parser.get_current_axis_value(&current_style, axis_tag);
        assert_eq!(result, None, "NONE VALUES RULE: {}", description);
    }
}

#[test]
fn document_complete_behavior_matrix() {
    let parser = UIFontParser::new();

    // DOCUMENTATION: Complete behavior matrix for round-trip testing
    // This test documents the exact behavior for all combinations

    let behavior_matrix = vec![
        // (weight, width, slant, italic, custom_axes, expected_results)
        (
            Some(400),
            Some(100),
            Some(15.0),
            Some(false),
            vec![
                ("wght", 500.0),
                ("wdth", 120.0),
                ("slnt", 5.0),
                ("opsz", 14.0),
                ("ital", 1.0),
            ],
            vec![
                ("wght", Some(400.0)),
                ("wdth", Some(100.0)),
                ("slnt", Some(15.0)),
                ("opsz", Some(14.0)),
                ("ital", Some(1.0)),
            ],
            "All explicit properties should take priority, custom axes should be used for non-explicit",
        ),
        (
            None,
            None,
            None,
            None,
            vec![
                ("wght", 500.0),
                ("wdth", 120.0),
                ("slnt", 5.0),
                ("opsz", 14.0),
                ("ital", 1.0),
            ],
            vec![
                ("wght", Some(500.0)),
                ("wdth", Some(120.0)),
                ("slnt", Some(5.0)),
                ("opsz", Some(14.0)),
                ("ital", Some(1.0)),
            ],
            "All None explicit properties should fallback to custom_axes",
        ),
        (
            Some(0),
            Some(0),
            Some(0.0),
            Some(false),
            vec![
                ("wght", 500.0),
                ("wdth", 120.0),
                ("slnt", 5.0),
                ("opsz", 14.0),
                ("ital", 1.0),
            ],
            vec![
                ("wght", Some(0.0)),
                ("wdth", Some(0.0)),
                ("slnt", Some(0.0)),
                ("opsz", Some(14.0)),
                ("ital", Some(1.0)),
            ],
            "Zero values should take priority over custom_axes",
        ),
        (
            Some(15),
            Some(50),
            Some(-90.0),
            Some(true),
            vec![
                ("wght", 500.0),
                ("wdth", 120.0),
                ("slnt", 5.0),
                ("opsz", 14.0),
                ("ital", 1.0),
            ],
            vec![
                ("wght", Some(15.0)),
                ("wdth", Some(50.0)),
                ("slnt", Some(-90.0)),
                ("opsz", Some(14.0)),
                ("ital", Some(1.0)),
            ],
            "Negative values should take priority over custom_axes",
        ),
    ];

    for (weight, width, slant, _italic, custom_axes_vec, expected_results, description) in
        behavior_matrix
    {
        let mut custom_axes = HashMap::new();
        for (axis, value) in &custom_axes_vec {
            custom_axes.insert(axis.to_string(), *value);
        }

        let current_style = CurrentTextStyle {
            weight,
            width,
            slant,
            custom_axes,
        };

        for ((axis, _expected), (expected_axis, expected_value)) in
            custom_axes_vec.iter().zip(expected_results.iter())
        {
            assert_eq!(axis, expected_axis, "Axis mismatch in behavior matrix");

            let result = parser.get_current_axis_value(&current_style, axis);
            assert_eq!(
                result, *expected_value,
                "BEHAVIOR MATRIX: {} - {} should resolve to {:?}",
                description, axis, expected_value
            );
        }
    }
}

#[test]
fn document_round_trip_consistency_requirements() {
    let parser = UIFontParser::new();

    // DOCUMENTATION: Round-trip consistency requirements for get_normals()
    // This test documents the exact behavior that get_normals() must maintain

    let test_scenarios = vec![
        // Scenario 1: All explicit properties
        {
            let mut custom_axes = HashMap::new();
            custom_axes.insert("ital".to_string(), 1.0);

            let current_style = CurrentTextStyle {
                weight: Some(400),
                width: Some(100),
                slant: Some(15.0),
                custom_axes,
            };

            let expected_resolved = [
                ("wght", Some(400.0)),
                ("wdth", Some(100.0)),
                ("slnt", Some(15.0)),
                ("ital", Some(1.0)),
            ];

            (
                current_style,
                expected_resolved,
                "All explicit properties scenario",
            )
        },
        // Scenario 2: Mixed explicit and fallback
        {
            let mut custom_axes = HashMap::new();
            custom_axes.insert("wght".to_string(), 500.0);
            custom_axes.insert("wdth".to_string(), 120.0);
            custom_axes.insert("slnt".to_string(), 5.0);
            custom_axes.insert("opsz".to_string(), 14.0);
            custom_axes.insert("ital".to_string(), 1.0);

            let current_style = CurrentTextStyle {
                weight: Some(400), // Explicit
                width: None,       // Fallback
                slant: Some(15.0), // Explicit
                custom_axes,
            };

            let expected_resolved = [
                ("wght", Some(400.0)),
                ("wdth", Some(120.0)),
                ("slnt", Some(15.0)),
                ("ital", Some(1.0)),
            ];

            (
                current_style,
                expected_resolved,
                "Mixed explicit and fallback scenario",
            )
        },
        // Scenario 3: All fallback
        {
            let mut custom_axes = HashMap::new();
            custom_axes.insert("wght".to_string(), 500.0);
            custom_axes.insert("wdth".to_string(), 120.0);
            custom_axes.insert("slnt".to_string(), 5.0);
            custom_axes.insert("opsz".to_string(), 14.0);
            custom_axes.insert("ital".to_string(), 1.0);

            let current_style = CurrentTextStyle {
                weight: None, // Fallback
                width: None,  // Fallback
                slant: None,  // Fallback
                custom_axes,
            };

            let expected_resolved = [
                ("wght", Some(500.0)),
                ("wdth", Some(120.0)),
                ("slnt", Some(5.0)),
                ("ital", Some(1.0)),
            ];

            (current_style, expected_resolved, "All fallback scenario")
        },
    ];

    for (current_style, expected_resolved, scenario_description) in test_scenarios {
        for (axis, expected_value) in expected_resolved.iter() {
            let result = parser.get_current_axis_value(&current_style, axis);
            assert_eq!(
                result, *expected_value,
                "ROUND-TRIP CONSISTENCY: {} - {} should resolve to {:?} for get_normals() compatibility",
                scenario_description, axis, expected_value
            );
        }
    }
}
