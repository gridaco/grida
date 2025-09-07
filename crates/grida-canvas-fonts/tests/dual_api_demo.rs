use grida_canvas_fonts::parse_ui::*;

/// Test that demonstrates both copy and zero-copy APIs work
#[test]
fn test_dual_api_demo() {
    let parser = UIFontParser::new();

    // Create some dummy font data
    let font_data = vec![0x00, 0x01, 0x02, 0x03, 0x04, 0x05];

    // Test zero-copy API
    let zero_copy_faces = vec![UIFontFace {
        face_id: "demo-font.ttf".to_string(),
        data: &font_data, // ← Zero-copy: borrows the data
        user_font_style_italic: None,
    }];

    // Test copy-based API
    let copy_faces = vec![UIFontFaceOwned::new(
        "demo-font.ttf".to_string(),
        font_data.clone(), // ← Copy-based: owns the data
        None,
    )];

    // Both should work (and both should fail with invalid font data, but that's expected)
    let zero_copy_result = parser.analyze_family(Some("Demo".to_string()), zero_copy_faces);
    let copy_result = parser.analyze_family_owned(Some("Demo".to_string()), copy_faces);

    // Both should fail because the data is not a valid font
    assert!(zero_copy_result.is_err());
    assert!(copy_result.is_err());

    // The original font_data is still available
    assert_eq!(font_data.len(), 6);
    assert_eq!(font_data[0], 0x00);
}

/// Test that demonstrates the memory efficiency difference
#[test]
fn test_memory_efficiency_comparison() {
    let parser = UIFontParser::new();

    // Create a large font data array
    let large_font_data = vec![0u8; 1024 * 1024]; // 1MB of data

    // Zero-copy approach: multiple UIFontFace instances share the same data
    let zero_copy_faces = vec![
        UIFontFace {
            face_id: "font1.ttf".to_string(),
            data: &large_font_data, // ← Borrows, doesn't copy
            user_font_style_italic: None,
        },
        UIFontFace {
            face_id: "font2.ttf".to_string(),
            data: &large_font_data, // ← Borrows the same data
            user_font_style_italic: None,
        },
    ];

    // Copy-based approach: each UIFontFaceOwned owns its own copy
    let copy_faces = vec![
        UIFontFaceOwned::new(
            "font1.ttf".to_string(),
            large_font_data.clone(), // ← Creates a copy
            None,
        ),
        UIFontFaceOwned::new(
            "font2.ttf".to_string(),
            large_font_data.clone(), // ← Creates another copy
            None,
        ),
    ];

    // Both should work (and both should fail with invalid font data)
    let zero_copy_result = parser.analyze_family(Some("Demo".to_string()), zero_copy_faces);
    let copy_result = parser.analyze_family_owned(Some("Demo".to_string()), copy_faces);

    // Both should fail because the data is not a valid font
    assert!(zero_copy_result.is_err());
    assert!(copy_result.is_err());

    // The original data is still available
    assert_eq!(large_font_data.len(), 1024 * 1024);

    // Memory usage comparison:
    // Zero-copy: 1MB (original) + 2 * 8 bytes (pointers) = ~1MB total
    // Copy-based: 1MB * 3 = 3MB total
    // The zero-copy approach is 3x more memory efficient!
}
