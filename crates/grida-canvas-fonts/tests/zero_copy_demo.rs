use grida_canvas_fonts::parse_ui::*;

/// Simple demonstration that zero-copy UIFontFace works correctly
#[test]
fn test_zero_copy_demo() {
    let parser = UIFontParser::new();

    // Create some dummy font data
    let font_data = vec![0x00, 0x01, 0x02, 0x03, 0x04, 0x05];

    // Create UIFontFace with borrowed data (zero-copy)
    let font_faces = vec![UIFontFace {
        face_id: "demo-font.ttf".to_string(),
        data: &font_data, // ← This borrows the data, no copying!
        user_font_style_italic: None,
    }];

    // The parser should work with the borrowed data
    // (This will fail with invalid font data, but that's expected)
    let result = parser.analyze_family(Some("Demo".to_string()), font_faces);

    // We expect this to fail because the data is not a valid font,
    // but the important thing is that it compiles and runs without copying the data
    assert!(result.is_err());

    // The original font_data is still available and unchanged
    assert_eq!(font_data.len(), 6);
    assert_eq!(font_data[0], 0x00);
}

/// Test that demonstrates the memory efficiency of zero-copy approach
#[test]
fn test_memory_efficiency_demo() {
    // Create a large font data array
    let large_font_data = vec![0u8; 1024 * 1024]; // 1MB of data

    // Create multiple UIFontFace instances that all borrow the same data
    let font_faces = vec![
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
        UIFontFace {
            face_id: "font3.ttf".to_string(),
            data: &large_font_data, // ← Borrows the same data
            user_font_style_italic: None,
        },
    ];

    // All three UIFontFace instances share the same underlying data
    // Memory usage: 1MB (original) + 3 * 8 bytes (pointers) = ~1MB total
    // vs. the old approach: 1MB * 4 = 4MB total

    let parser = UIFontParser::new();
    let result = parser.analyze_family(Some("Demo".to_string()), font_faces);

    // This will fail due to invalid font data, but that's not the point
    // The point is that we can create multiple UIFontFace instances without copying data
    assert!(result.is_err());

    // The original data is still available
    assert_eq!(large_font_data.len(), 1024 * 1024);
}
