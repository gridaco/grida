use std::collections::HashMap;

use fonts::selection_italic as italic;
use fonts::FaceRecord;

/// Test scenarios that demonstrate Level 2+ features that fail with Level 1 implementation.
///
/// These tests show specific cases where Level 1 cannot provide accurate italic detection
/// due to missing advanced features. They serve as documentation for Level 2+ development.

/// Test case: Font with italic information only in fvar.instances (not in main names)
///
/// This demonstrates a limitation of Level 1: it only checks main name table entries
/// (subfamily name, PostScript name) but doesn't parse fvar.instances for italic detection.
///
/// Level 2+ would parse fvar.instances to find italic instances even when main names
/// don't indicate italic capability.
#[test]
fn test_level2_failure_fvar_instances_only() {
    let italic_parser = italic::ItalicParser::new();

    // Create a variable font with slnt axis and italic instances in fvar.instances
    // but main names don't indicate italic (like Recursive/Roboto Flex in their default state)
    let mut axes = HashMap::new();
    axes.insert("slnt".to_string(), (-15.0, 0.0, 0.0));
    axes.insert("wght".to_string(), (300.0, 400.0, 1000.0));

    let face = FaceRecord {
        face_id: "fvar-only-italic".to_string(),
        ps_name: "FvarOnlyFont-Regular".to_string(), // Main name doesn't indicate italic
        family_name: "Fvar Only Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(), // Main name doesn't indicate italic
        typographic_subfamily: None,
        is_variable: true,
        axes,
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Level 1: Should be classified as Italic via Priority 4 (Level 1 permissive slnt detection)
    // because it has slnt axis, even though main names don't indicate italic
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );

    // Level 2+ would provide more accurate detection by parsing fvar.instances
    // to find actual italic instances rather than just detecting slnt axis capability

    println!("✅ Level 1 correctly handles slnt axis (permissive detection)");
    println!("📝 Level 2+ would parse fvar.instances for more accurate italic instance detection");
}

/// Test case: Font with conflicting metadata (OS/2 vs names)
///
/// This demonstrates a limitation of Level 1: it doesn't handle conflicting metadata
/// with advanced heuristics or provide detailed diagnostics about conflicts.
///
/// Level 2+ would detect conflicts and provide recommendations.
#[test]
fn test_level2_failure_conflicting_metadata() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font with conflicting metadata
    let face = FaceRecord {
        face_id: "conflicting-metadata".to_string(),
        ps_name: "ConflictingFont-Regular".to_string(), // Name suggests regular
        family_name: "Conflicting Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(), // Name suggests regular
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(),
        os2_italic_bit: true, // But OS/2 says italic
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Level 1: Should trust OS/2 bit (Priority 1) and classify as Italic
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );

    // Level 2+ would detect the conflict between OS/2 and names
    // and provide diagnostics about the inconsistency

    println!("✅ Level 1 correctly prioritizes OS/2 bit over names");
    println!("📝 Level 2+ would detect metadata conflicts and provide diagnostics");
}

/// Test case: Font requiring STAT table analysis
///
/// This demonstrates a limitation of Level 1: it doesn't parse STAT table
/// for style mappings, which could provide more reliable italic detection
/// than name-based parsing alone.
#[test]
fn test_level2_failure_stat_table_required() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font that would require STAT table analysis for accurate detection
    let face = FaceRecord {
        face_id: "stat-table-required".to_string(),
        ps_name: "StatTableFont-Regular".to_string(),
        family_name: "Stat Table Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: true,
        axes: HashMap::new(),
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Level 1: Should classify as Normal (no italic indicators)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Normal
    );

    // Level 2+ would parse STAT table to find style mappings
    // that could indicate italic capability even without OS/2 bit or obvious names

    println!("✅ Level 1 correctly classifies as Normal (no italic indicators)");
    println!("📝 Level 2+ would parse STAT table for additional style information");
}

/// Test case: CJK font with mixed script support
///
/// This demonstrates a limitation of Level 1: it doesn't handle CJK fonts
/// or mixed-script fonts with appropriate fallback strategies.
///
/// Level 2+ would provide CJK-aware italic detection.
#[test]
fn test_level2_failure_cjk_mixed_script() {
    let italic_parser = italic::ItalicParser::new();

    // Create a CJK font that might have Latin italic variants
    let face = FaceRecord {
        face_id: "cjk-mixed-script".to_string(),
        ps_name: "CjkMixedFont-Regular".to_string(),
        family_name: "CJK Mixed Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(),
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Level 1: Should classify as Normal (no italic indicators)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Normal
    );

    // Level 2+ would handle CJK fonts appropriately, recognizing that
    // CJK characters typically don't have italic variants but Latin characters might

    println!("✅ Level 1 correctly classifies CJK font as Normal");
    println!("📝 Level 2+ would provide CJK-aware italic detection strategies");
}

/// Test case: Parser configuration limitations
///
/// This demonstrates a limitation of Level 1: it always trusts user font style
/// declarations and doesn't allow configuring this behavior.
///
/// Level 2+ would allow configuring trust levels for different use cases.
#[test]
fn test_level2_failure_parser_configuration() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font with user declaring it as italic
    let face = FaceRecord {
        face_id: "user-declared-italic".to_string(),
        ps_name: "UserDeclaredFont-Regular".to_string(),
        family_name: "User Declared Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(),
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(),
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: Some(true), // User declares italic
    };

    let classification = italic_parser.classify_face(face);

    // Level 1: Should trust user declaration (highest priority)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Italic
    );

    // Level 2+ would allow configuring whether to trust user declarations
    // based on the use case (e.g., trusted vs untrusted font sources)

    println!("✅ Level 1 correctly trusts user font style declaration");
    println!("📝 Level 2+ would allow configuring trust levels for user declarations");
}

/// Test case: Advanced name-based parsing requirements
///
/// This demonstrates a limitation of Level 1: it only checks main name table entries
/// and doesn't perform comprehensive name table analysis.
///
/// Level 2+ would parse all name table entries with sophisticated heuristics.
#[test]
fn test_level2_failure_advanced_name_parsing() {
    let italic_parser = italic::ItalicParser::new();

    // Create a font where italic information might be in non-main name table entries
    let face = FaceRecord {
        face_id: "advanced-name-parsing".to_string(),
        ps_name: "AdvancedNameFont-Regular".to_string(), // Main name doesn't indicate italic
        family_name: "Advanced Name Font".to_string(),
        typographic_family: None,
        subfamily_name: "Regular".to_string(), // Main name doesn't indicate italic
        typographic_subfamily: None,
        is_variable: false,
        axes: HashMap::new(),
        os2_italic_bit: false, // No OS/2 italic bit
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
    };

    let classification = italic_parser.classify_face(face);

    // Level 1: Should classify as Normal (no italic indicators in main names)
    assert_eq!(
        classification.classification.italic_kind(),
        italic::ItalicKind::Normal
    );

    // Level 2+ would parse all name table entries and use sophisticated heuristics
    // to detect italic styles from various name formats and languages

    println!("✅ Level 1 correctly classifies based on main name table entries");
    println!("📝 Level 2+ would perform comprehensive name table analysis");
}
