use fonts::{CurrentTextStyle, UIFontParser};
use std::collections::HashMap;

/// Test smart auto-resolution for CurrentTextStyle
///
/// This test verifies that the parser correctly handles duplicated values between
/// explicit properties and custom_axes, with explicit properties taking priority.
#[test]
fn test_smart_resolution_priority() {
    let parser = UIFontParser::new();

    // Create a style with both explicit properties and custom_axes
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0); // Should be overridden by weight: 400
    custom_axes.insert("wdth".to_string(), 120.0); // Should be overridden by width: 100
    custom_axes.insert("slnt".to_string(), 5.0); // Should be overridden by slant: 10.0
    custom_axes.insert("opsz".to_string(), 14.0); // Should be used (no explicit property)

    let current_style = CurrentTextStyle {
        weight: Some(400), // Should take priority over custom_axes["wght"]
        width: Some(100),  // Should take priority over custom_axes["wdth"]
        slant: Some(10.0), // Should take priority over custom_axes["slnt"]
        // Special flag, never maps to custom_axes
        custom_axes,
    };

    // Test weight resolution
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(400.0)
    );

    // Test width resolution
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(100.0)
    );

    // Test slant resolution
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(10.0)
    );

    // Test custom axis (no explicit property)
    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        Some(14.0)
    );

    // Test italic flag (should never map to custom_axes)
    assert_eq!(parser.get_current_axis_value(&current_style, "ital"), None);
}

/// Test smart auto-resolution fallback to custom_axes when explicit properties are None
#[test]
fn test_smart_resolution_fallback() {
    let parser = UIFontParser::new();

    // Create a style with only custom_axes (no explicit properties)
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0);
    custom_axes.insert("wdth".to_string(), 120.0);
    custom_axes.insert("slnt".to_string(), 5.0);
    custom_axes.insert("opsz".to_string(), 14.0);

    let current_style = CurrentTextStyle {
        weight: None, // Should fallback to custom_axes["wght"]
        width: None,  // Should fallback to custom_axes["wdth"]
        slant: None,  // Should fallback to custom_axes["slnt"]
        // Special flag, never maps to custom_axes
        custom_axes,
    };

    // Test fallback to custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(500.0)
    );
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(120.0)
    );
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(5.0)
    );
    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        Some(14.0)
    );

    // Test italic flag (should never map to custom_axes)
    assert_eq!(parser.get_current_axis_value(&current_style, "ital"), None);
}

/// Test smart auto-resolution with mixed explicit and custom values
#[test]
fn test_smart_resolution_mixed() {
    let parser = UIFontParser::new();

    // Create a style with some explicit properties and some custom_axes
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 500.0); // Should be overridden by weight: 400
    custom_axes.insert("wdth".to_string(), 120.0); // Should be used (width: None)
    custom_axes.insert("slnt".to_string(), 5.0); // Should be overridden by slant: 10.0
    custom_axes.insert("opsz".to_string(), 14.0); // Should be used (no explicit property)

    let current_style = CurrentTextStyle {
        weight: Some(400), // Should take priority over custom_axes["wght"]
        width: None,       // Should fallback to custom_axes["wdth"]
        slant: Some(10.0), // Should take priority over custom_axes["slnt"]
        // Special flag, never maps to custom_axes
        custom_axes,
    };

    // Test mixed resolution
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(400.0)
    ); // Explicit wins
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(120.0)
    ); // Fallback to custom
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(10.0)
    ); // Explicit wins
    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        Some(14.0)
    ); // Custom only
}

/// Test smart auto-resolution with empty custom_axes
#[test]
fn test_smart_resolution_empty_custom_axes() {
    let parser = UIFontParser::new();

    // Create a style with only explicit properties
    let current_style = CurrentTextStyle {
        weight: Some(400),
        width: Some(100),
        slant: Some(10.0),

        custom_axes: HashMap::new(), // Empty custom_axes
    };

    // Test explicit properties only
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(400.0)
    );
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(100.0)
    );
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(10.0)
    );

    // Test non-existent axes
    assert_eq!(parser.get_current_axis_value(&current_style, "opsz"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "ital"), None);
}

/// Test smart auto-resolution with None explicit properties and empty custom_axes
#[test]
fn test_smart_resolution_none_values() {
    let parser = UIFontParser::new();

    // Create a style with no values
    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: None,

        custom_axes: HashMap::new(),
    };

    // Test all should return None
    assert_eq!(parser.get_current_axis_value(&current_style, "wght"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "wdth"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "slnt"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "opsz"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "ital"), None);
}

/// Test that ital axis now behaves like any other custom axis
#[test]
fn test_italic_flag_special_handling() {
    let parser = UIFontParser::new();

    // Create a style with custom_axes["ital"]
    let mut custom_axes = HashMap::new();
    custom_axes.insert("ital".to_string(), 1.0); // Should be used

    let current_style = CurrentTextStyle {
        weight: None,
        width: None,
        slant: None,
        custom_axes,
    };

    // Test that ital axis now returns the value from custom_axes
    assert_eq!(
        parser.get_current_axis_value(&current_style, "ital"),
        Some(1.0)
    );

    // Test that other axes still work
    assert_eq!(parser.get_current_axis_value(&current_style, "wght"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "wdth"), None);
    assert_eq!(parser.get_current_axis_value(&current_style, "slnt"), None);
}

/// Test smart auto-resolution with realistic font matching scenario
#[test]
fn test_smart_resolution_realistic_scenario() {
    let parser = UIFontParser::new();

    // Simulate a realistic scenario where user has both explicit properties
    // and custom_axes from a previous font selection
    let mut custom_axes = HashMap::new();
    custom_axes.insert("wght".to_string(), 600.0); // From previous font
    custom_axes.insert("wdth".to_string(), 110.0); // From previous font
    custom_axes.insert("slnt".to_string(), 0.0); // From previous font
    custom_axes.insert("opsz".to_string(), 12.0); // From previous font

    let current_style = CurrentTextStyle {
        weight: Some(400), // User explicitly set weight
        width: None,       // User didn't set width, use previous
        slant: Some(15.0), // User explicitly set slant
        // User explicitly set italic
        custom_axes,
    };

    // Test realistic resolution
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wght"),
        Some(400.0)
    ); // Explicit wins
    assert_eq!(
        parser.get_current_axis_value(&current_style, "wdth"),
        Some(110.0)
    ); // Fallback to previous
    assert_eq!(
        parser.get_current_axis_value(&current_style, "slnt"),
        Some(15.0)
    ); // Explicit wins
    assert_eq!(
        parser.get_current_axis_value(&current_style, "opsz"),
        Some(12.0)
    ); // Previous value
    assert_eq!(parser.get_current_axis_value(&current_style, "ital"), None); // Never maps
}
