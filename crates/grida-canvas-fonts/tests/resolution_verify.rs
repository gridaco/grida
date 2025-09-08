use grida_canvas_fonts::{CurrentTextStyle, UIFontParser};
use std::collections::HashMap;

/// Comprehensive verification tests for smart resolution behavior.
///
/// These tests explicitly verify the expected behavior of smart resolution,
/// not just that the tests pass. This is crucial for implementing get_normals()
/// which will need to work in reverse and maintain consistency.
///
/// Expected Behavior Documentation:
///
/// 1. PRIORITY RULE: Explicit properties (weight, width, slant) ALWAYS take priority over custom_axes
/// 2. FALLBACK RULE: Only use custom_axes when explicit property is None
/// 3. ITALIC SPECIAL: italic flag NEVER maps to custom_axes["ital"] - always returns None
/// 4. AXIS SEEDING: Only resolve to custom_axes if the target font actually has that axis
/// 5. NON-VF FALLBACK: For non-variable fonts, only explicit properties are used

#[test]
fn verify_priority_rule_explicit_properties_always_win() {
    let parser = UIFontParser::new();

    // Test case: Explicit weight=400, custom_axes["wght"]=500
    // EXPECTED: weight=400 should win (explicit property priority)
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);

    let current_style = CurrentTextStyle {
        weight: Some(400), // This should ALWAYS win
        width: None,
        slant: None,
        custom_axes,
    };

    // VERIFICATION: Explicit weight should take priority
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(400.0),
        "FAILURE: Explicit weight=400 should take priority over custom_axes[\"wght\"]=500"
    );

    // Test case: Explicit width=100, custom_axes["wdth"]=120
    // EXPECTED: width=100 should win
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wdth".to_string(), 120.0);

    let current_style = CurrentTextStyle {
        weight: None,
        width: Some(100), // This should ALWAYS win
        slant: None,
        custom_axes,
    };

    // VERIFICATION: Explicit width should take priority
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(100.0),
        "FAILURE: Explicit width=100 should take priority over custom_axes[\"wdth\"]=120"
    );

    // Test case: Explicit slant=15.0, custom_axes["slnt"]=5.0
    // EXPECTED: slant=15.0 should win
    let mut custom_axes = HashMap::new();
    custom_axes.insert("slnt".to_string(), 5.0);

    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: Some(15.0), // This should ALWAYS win
        custom_axes,
    };

    // VERIFICATION: Explicit slant should take priority
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(15.0),
        "FAILURE: Explicit slant=15.0 should take priority over custom_axes[\"slnt\"]=5.0"
    );
}

#[test]
fn verify_fallback_rule_custom_axes_when_explicit_is_none() {
    let parser = UIFontParser::new();

    // Test case: weight=None, custom_axes["wght"]=500
    // EXPECTED: Should fallback to custom_axes["wght"]=500
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);

    let current_style = CurrentTextStyle {
        weight: None, // This should trigger fallback
        width: None,
        slant: None,
        custom_axes,
    };

    // VERIFICATION: Should fallback to custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(500.0),
        "FAILURE: Should fallback to custom_axes[\"wght\"]=500 when weight=None"
    );

    // Test case: width=None, custom_axes["wdth"]=120
    // EXPECTED: Should fallback to custom_axes["wdth"]=120
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wdth".to_string(), 120.0);

    let current_style = CurrentTextStyle {
        weight: None,
        width: None, // This should trigger fallback
        slant: None,
        custom_axes,
    };

    // VERIFICATION: Should fallback to custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(120.0),
        "FAILURE: Should fallback to custom_axes[\"wdth\"]=120 when width=None"
    );

    // Test case: slant=None, custom_axes["slnt"]=5.0
    // EXPECTED: Should fallback to custom_axes["slnt"]=5.0
    let mut custom_axes = HashMap::new();
    custom_axes.insert("slnt".to_string(), 5.0);

    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: None, // This should trigger fallback
        custom_axes,
    };

    // VERIFICATION: Should fallback to custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(5.0),
        "FAILURE: Should fallback to custom_axes[\"slnt\"]=5.0 when slant=None"
    );
}

// Test removed: italic field no longer exists in CurrentTextStyle

#[test]
fn verify_custom_axes_only_for_other_axes() {
    let parser = UIFontParser::new();

    // Test case: custom_axes["opsz"]=14.0 (no explicit property exists)
    // EXPECTED: Should return custom_axes["opsz"]=14.0
    let mut custom_axes = HashMap::new();
    custom_axes.insert("opsz".to_string(), 14.0);

    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: None,
        custom_axes,
    };

    // VERIFICATION: Should use custom_axes for non-explicit axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        Some(14.0),
        "FAILURE: Should use custom_axes[\"opsz\"]=14.0 for axes without explicit properties"
    );

    // Test case: custom_axes["GRAD"]=0.5 (no explicit property exists)
    // EXPECTED: Should return custom_axes["GRAD"]=0.5
    let mut custom_axes = HashMap::new();
    custom_axes.insert("GRAD".to_string(), 0.5);

    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: None,
        custom_axes,
    };

    // VERIFICATION: Should use custom_axes for non-explicit axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "GRAD"),
        Some(0.5),
        "FAILURE: Should use custom_axes[\"GRAD\"]=0.5 for axes without explicit properties"
    );
}

#[test]
fn verify_none_values_return_none() {
    let parser = UIFontParser::new();

    // Test case: All values are None or empty
    // EXPECTED: All should return None
    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: None,
        custom_axes: HashMap::new(),
    };

    // VERIFICATION: All should return None
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        None,
        "FAILURE: Should return None when weight=None and no custom_axes[\"wght\"]"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        None,
        "FAILURE: Should return None when width=None and no custom_axes[\"wdth\"]"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        None,
        "FAILURE: Should return None when slant=None and no custom_axes[\"slnt\"]"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "ital"),
        None,
        "FAILURE: Should return None for italic axis (special handling)"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        None,
        "FAILURE: Should return None when no custom_axes[\"opsz\"]"
    );
}

#[test]
fn verify_mixed_scenarios_priority_and_fallback() {
    let parser = UIFontParser::new();

    // Test case: Mixed scenario with some explicit, some fallback, some custom-only
    // EXPECTED: Each should follow its respective rule
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0); // Should be overridden by weight=400
    custom_axes.insert("wdth".to_string(), 120.0); // Should be used (width=None)
    custom_axes.insert("slnt".to_string(), 5.0); // Should be overridden by slant=15.0
    custom_axes.insert("opsz".to_string(), 14.0); // Should be used (no explicit property)

    let current_style = CurrentTextStyle {
        weight: Some(400), // Should take priority over custom_axes["wght"]
        width: None,       // Should fallback to custom_axes["wdth"]
        slant: Some(15.0), // Should take priority over custom_axes["slnt"]
        custom_axes,
    };

    // VERIFICATION: Each axis should follow its respective rule
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(400.0),
        "FAILURE: weight=400 should take priority over custom_axes[\"wght\"]=500"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(120.0),
        "FAILURE: width=None should fallback to custom_axes[\"wdth\"]=120"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(15.0),
        "FAILURE: slant=15.0 should take priority over custom_axes[\"slnt\"]=5.0"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        Some(14.0),
        "FAILURE: Should use custom_axes[\"opsz\"]=14.0 for axes without explicit properties"
    );
}

#[test]
fn verify_edge_case_zero_values() {
    let parser = UIFontParser::new();

    // Test case: Zero values in explicit properties
    // EXPECTED: Zero values should be treated as valid (not None)
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);
    custom_axes.insert("wdth".to_string(), 120.0);
    custom_axes.insert("slnt".to_string(), 5.0);

    let current_style = CurrentTextStyle {
        weight: Some(0),  // Zero should be treated as valid explicit value
        width: Some(0),   // Zero should be treated as valid explicit value
        slant: Some(0.0), // Zero should be treated as valid explicit value
        // False should be treated as valid explicit value
        custom_axes,
    };

    // VERIFICATION: Zero values should take priority over custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(0.0),
        "FAILURE: weight=0 should take priority over custom_axes[\"wght\"]=500"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(0.0),
        "FAILURE: width=0 should take priority over custom_axes[\"wdth\"]=120"
    );

    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(0.0),
        "FAILURE: slant=0.0 should take priority over custom_axes[\"slnt\"]=5.0"
    );
}

#[test]
fn verify_edge_case_negative_values() {
    let parser = UIFontParser::new();

    // Test case: Negative values in explicit properties
    // EXPECTED: Negative values should be treated as valid (not None)
    let mut custom_axes = HashMap::new();
    custom_axes.insert("slnt".to_string(), 5.0);

    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: Some(-15.0), // Negative should be treated as valid explicit value
        custom_axes,
    };

    // VERIFICATION: Negative values should take priority over custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(-15.0),
        "FAILURE: slant=-15.0 should take priority over custom_axes[\"slnt\"]=5.0"
    );
}

#[test]
fn verify_consistency_for_round_trip_testing() {
    let parser = UIFontParser::new();

    // This test verifies that the resolution behavior is consistent and predictable
    // for round-trip testing (get_italics -> get_normals -> get_italics)

    // Test case: Create a style with known values
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);
    custom_axes.insert("wdth".to_string(), 120.0);
    custom_axes.insert("slnt".to_string(), 5.0);
    custom_axes.insert("opsz".to_string(), 14.0);

    let current_style = CurrentTextStyle {
        weight: Some(400), // Explicit
        width: None,       // Fallback
        slant: Some(15.0), // Explicit
        // Special
        custom_axes,
    };

    // VERIFICATION: Resolution should be consistent
    let resolved_values = [
        (
            "wght",
            parser.get_current_axis_value(&current_style, "wght"),
        ),
        (
            "wdth",
            parser.get_current_axis_value(&current_style, "wdth"),
        ),
        (
            "slnt",
            parser.get_current_axis_value(&current_style, "slnt"),
        ),
        (
            "opsz",
            parser.get_current_axis_value(&current_style, "opsz"),
        ),
        (
            "ital",
            parser.get_current_axis_value(&current_style, "ital"),
        ),
    ];

    // Expected resolved values
    let expected_values = [
        ("wght", Some(400.0)), // Explicit weight wins
        ("wdth", Some(120.0)), // Fallback to custom_axes
        ("slnt", Some(15.0)),  // Explicit slant wins
        ("opsz", Some(14.0)),  // Custom axis only
        ("ital", None),        // Special handling
    ];

    // VERIFICATION: All values should match expected
    for ((axis, actual), (expected_axis, expected)) in
        resolved_values.iter().zip(expected_values.iter())
    {
        assert_eq!(
            axis, expected_axis,
            "FAILURE: Axis mismatch in consistency test"
        );
        assert_eq!(
            actual, expected,
            "FAILURE: {} resolution inconsistent: got {:?}, expected {:?}",
            axis, actual, expected
        );
    }
}
