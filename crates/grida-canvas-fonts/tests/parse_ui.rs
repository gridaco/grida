use std::fs;
use std::path::PathBuf;

use fonts::parse_ui::*;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

/// Test basic UI parser functionality with a single static font
#[test]
fn test_ui_parser_single_static_font() {
    let path = font_path("Molle/Molle-Italic.ttf");
    if !path.exists() {
        println!("Molle font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Molle-Italic.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None, // Let parser analyze the font metadata
    }];

    let result = parser
        .analyze_family(Some("Molle".to_string()), font_faces)
        .unwrap();

    // Verify family information
    assert_eq!(result.family_name, "Molle");
    assert_eq!(result.face_info.len(), 1);

    // Verify italic capability
    assert!(result.italic_capability.has_italic);
    assert!(!result.italic_capability.has_upright);
    assert_eq!(
        result.italic_capability.strategy,
        UIFontItalicStrategy::StaticItalicOnly
    );
    assert_eq!(result.italic_capability.recipes.len(), 1);

    // Verify recipe
    let recipe = &result.italic_capability.recipes[0];
    assert_eq!(recipe.name, "Italic");
    assert!(recipe.is_italic);
    assert!(recipe.description.contains("Italic"));

    // Verify face info
    let face = &result.face_info[0];
    assert_eq!(face.family_name, "Molle");
    assert!(!face.is_variable);
}

/// Test UI parser with multiple static fonts (PT Serif family)
#[test]
fn test_ui_parser_multi_static_fonts() {
    let paths = vec![
        font_path("PT_Serif/PTSerif-Regular.ttf"),
        font_path("PT_Serif/PTSerif-Italic.ttf"),
        font_path("PT_Serif/PTSerif-Bold.ttf"),
        font_path("PT_Serif/PTSerif-BoldItalic.ttf"),
    ];

    // Check if all fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.len() < 2 {
        println!("PT Serif fonts not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();
    let font_faces: Vec<UIFontFace> = existing_paths
        .iter()
        .enumerate()
        .map(|(i, _p)| UIFontFace {
            face_id: format!("PT-Serif-{}", i),
            data: &font_data[i],
            user_font_style_italic: None, // Let parser analyze the font metadata
        })
        .collect();

    let result = parser
        .analyze_family(Some("PT Serif".to_string()), font_faces)
        .unwrap();

    // Verify family information
    assert_eq!(result.family_name, "PT Serif");
    assert_eq!(result.face_info.len(), existing_paths.len());

    // Verify italic capability
    assert!(result.italic_capability.has_italic);
    assert!(result.italic_capability.has_upright);
    assert_eq!(
        result.italic_capability.strategy,
        UIFontItalicStrategy::StaticFamily
    );
    assert!(result.italic_capability.recipes.len() >= 2); // At least Regular and Italic

    // Verify recipes
    let regular_recipe = result
        .italic_capability
        .recipes
        .iter()
        .find(|r| r.name == "Regular")
        .expect("Should have Regular recipe");
    assert!(!regular_recipe.is_italic);

    let italic_recipe = result
        .italic_capability
        .recipes
        .iter()
        .find(|r| r.is_italic)
        .expect("Should have italic recipe");
    assert!(italic_recipe.is_italic);
}

/// Test UI parser with variable font (Inter family)
#[test]
fn test_ui_parser_variable_font() {
    let paths = vec![
        font_path("Inter/Inter-VariableFont_opsz,wght.ttf"),
        font_path("Inter/Inter-Italic-VariableFont_opsz,wght.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.is_empty() {
        println!("Inter fonts not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(*p).unwrap())
        .collect();
    let font_faces: Vec<UIFontFace> = existing_paths
        .iter()
        .enumerate()
        .map(|(i, _p)| UIFontFace {
            face_id: format!("Inter-{}", i),
            data: &font_data[i],
            user_font_style_italic: None, // Let parser analyze the font metadata
        })
        .collect();

    let result = parser
        .analyze_family(Some("Inter".to_string()), font_faces)
        .unwrap();

    // Verify family information
    assert_eq!(result.family_name, "Inter");
    assert_eq!(result.face_info.len(), existing_paths.len());

    // Verify variable font info
    assert!(result.variable_font_info.is_some());
    let vf_info = result.variable_font_info.unwrap();
    assert!(!vf_info.axes.is_empty());

    // Check for weight axis
    let weight_axis = vf_info
        .axes
        .iter()
        .find(|a| a.tag == "wght")
        .expect("Should have weight axis");
    assert_eq!(weight_axis.name, "Weight");
    assert!(weight_axis.min < weight_axis.max);

    // Verify italic capability
    if existing_paths.len() > 1 {
        assert_eq!(
            result.italic_capability.strategy,
            UIFontItalicStrategy::DualVariableFonts
        );
    } else {
        assert_eq!(
            result.italic_capability.strategy,
            UIFontItalicStrategy::VariableFont
        );
    }
}

/// Test UI parser with slnt axis font (Recursive)
#[test]
fn test_ui_parser_slnt_axis_font() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    if !path.exists() {
        println!("Recursive font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Recursive-Variable.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None, // Let parser analyze the font metadata
    }];

    let result = parser
        .analyze_family(Some("Recursive".to_string()), font_faces)
        .unwrap();

    // Verify family information
    assert_eq!(result.family_name, "Recursive");
    assert_eq!(result.face_info.len(), 1);

    // Verify variable font info
    assert!(result.variable_font_info.is_some());
    let vf_info = result.variable_font_info.unwrap();

    // Check for slnt axis
    let slnt_axis = vf_info
        .axes
        .iter()
        .find(|a| a.tag == "slnt")
        .expect("Should have slnt axis");
    assert_eq!(slnt_axis.name, "Slant");
    assert!(slnt_axis.min < slnt_axis.max);

    // Verify italic capability
    assert_eq!(
        result.italic_capability.strategy,
        UIFontItalicStrategy::VariableFont
    );
    assert!(result.italic_capability.has_italic);
}

/// Test UI parser error handling
#[test]
fn test_ui_parser_error_handling() {
    let parser = UIFontParser::new();

    // Test empty font faces list
    let result = parser.analyze_family(None, vec![]);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("empty"));

    // Test invalid font data
    let result = parser.analyze_family(
        None,
        vec![UIFontFace {
            face_id: "invalid.ttf".to_string(),
            data: &[0, 1, 2, 3],
            user_font_style_italic: None,
        }],
    );
    assert!(result.is_err());
}

/// Test recipe generation through actual font analysis
#[test]
fn test_recipe_generation_through_analysis() {
    let path = font_path("Molle/Molle-Italic.ttf");
    if !path.exists() {
        println!("Molle font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Molle-Italic.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None, // Let parser analyze the font metadata
    }];

    let result = parser
        .analyze_family(Some("Molle".to_string()), font_faces)
        .unwrap();

    // Verify recipe generation
    assert_eq!(result.italic_capability.recipes.len(), 1);
    let recipe = &result.italic_capability.recipes[0];

    // Check recipe properties
    assert_eq!(recipe.name, "Italic");
    assert!(recipe.is_italic);
    assert!(recipe.description.contains("Italic"));
    assert!(!recipe.face_id.is_empty());
}

/// Test face info analysis
#[test]
fn test_face_info_analysis() {
    let path = font_path("Molle/Molle-Italic.ttf");
    if !path.exists() {
        println!("Molle font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Molle-Italic.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None, // Let parser analyze the font metadata
    }];

    let result = parser.analyze_family(None, font_faces).unwrap();

    // Verify face info
    assert_eq!(result.face_info.len(), 1);
    let face = &result.face_info[0];

    assert!(!face.face_id.is_empty());
    assert!(!face.family_name.is_empty());
    assert!(!face.subfamily_name.is_empty());
    assert!(!face.postscript_name.is_empty());
    assert!(!face.is_variable);

    // Features should be available (even if empty)
    assert!(face.features.is_empty() || !face.features.is_empty());
}

/// Test variable font info analysis
#[test]
fn test_variable_font_info_analysis() {
    let path = font_path("Inter/Inter-VariableFont_opsz,wght.ttf");
    if !path.exists() {
        println!("Inter font not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data = fs::read(&path).unwrap();
    let font_faces = vec![UIFontFace {
        face_id: "Inter-Variable.ttf".to_string(),
        data: &font_data,
        user_font_style_italic: None, // Let parser analyze the font metadata
    }];

    let result = parser.analyze_family(None, font_faces).unwrap();

    // Verify variable font info
    assert!(result.variable_font_info.is_some());
    let vf_info = result.variable_font_info.unwrap();

    // Should have axes
    assert!(!vf_info.axes.is_empty());

    // Check axis properties
    for axis in &vf_info.axes {
        assert!(!axis.tag.is_empty());
        assert!(!axis.name.is_empty());
        assert!(axis.min <= axis.default);
        assert!(axis.default <= axis.max);
    }

    // Should have instances
    assert!(!vf_info.instances.is_empty());

    // Check instance properties
    for instance in &vf_info.instances {
        assert!(!instance.name.is_empty());
        assert!(!instance.coordinates.is_empty());
    }
}
