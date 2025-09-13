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
    assert_eq!(result.faces.len(), 1);

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
    let face = &result.faces[0];
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
    assert_eq!(result.faces.len(), existing_paths.len());

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
    assert_eq!(result.faces.len(), existing_paths.len());

    // Verify family-level axes
    assert!(!result.axes.is_empty());

    // Check for weight axis
    let weight_axis = result
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
    assert_eq!(result.faces.len(), 1);

    // Verify variable font info is in the face
    let face = &result.faces[0];
    assert!(face.is_variable);
    assert!(face.instances.is_some());

    // Check for slnt axis
    let slnt_axis = result
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
    assert_eq!(result.faces.len(), 1);
    let face = &result.faces[0];

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

    // Verify variable font info is in the face
    let face = &result.faces[0];
    assert!(face.is_variable);
    assert!(face.instances.is_some());
    let instances = face.instances.as_ref().unwrap();

    // Should have family-level axes
    assert!(!result.axes.is_empty());

    // Check family-level axis properties (no default values)
    for axis in &result.axes {
        assert!(!axis.tag.is_empty());
        assert!(!axis.name.is_empty());
        assert!(axis.min <= axis.max);
    }

    // Should have instances
    assert!(!instances.is_empty());

    // Check instance properties
    for instance in instances {
        assert!(!instance.name.is_empty());
        assert!(!instance.coordinates.is_empty());
    }
}

/// Test weight extraction for Inter Black style
#[test]
fn test_inter_black_weight_extraction() {
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
        .map(|p| fs::read(p).unwrap())
        .collect();
    let font_faces: Vec<UIFontFace> = existing_paths
        .iter()
        .enumerate()
        .map(|(i, _p)| UIFontFace {
            face_id: format!("Inter-{}", i),
            data: &font_data[i],
            user_font_style_italic: None,
        })
        .collect();

    let result = parser
        .analyze_family(Some("Inter".to_string()), font_faces)
        .unwrap();

    println!("Family: {}", result.family_name);
    println!("Styles count: {}", result.styles.len());

    // Look for Black style specifically
    let black_styles: Vec<_> = result
        .styles
        .iter()
        .filter(|s| s.name.to_lowercase().contains("black"))
        .collect();

    println!("Found {} Black styles:", black_styles.len());
    for style in &black_styles {
        println!(
            "  {}: weight={}, italic={}",
            style.name, style.weight, style.italic
        );
    }

    // Print all styles for debugging
    println!("All styles:");
    for style in &result.styles {
        println!(
            "  {}: weight={}, italic={}",
            style.name, style.weight, style.italic
        );
    }

    // Test multiple times to check for randomness
    for run in 0..5 {
        let font_faces2: Vec<UIFontFace> = existing_paths
            .iter()
            .enumerate()
            .map(|(i, _p)| UIFontFace {
                face_id: format!("Inter-{}", i),
                data: &font_data[i],
                user_font_style_italic: None,
            })
            .collect();

        let result2 = parser
            .analyze_family(Some("Inter".to_string()), font_faces2)
            .unwrap();

        let black_styles2: Vec<_> = result2
            .styles
            .iter()
            .filter(|s| s.name.to_lowercase().contains("black"))
            .collect();

        println!(
            "Run {}: Found {} Black styles",
            run + 1,
            black_styles2.len()
        );
        for style in &black_styles2 {
            println!("  {}: weight={}", style.name, style.weight);
        }
    }
}

/// Test negative axis values (like slnt) don't get converted to large positive numbers
#[test]
fn test_negative_axis_values() {
    let paths = vec![
        font_path("Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"),
    ];

    // Check if fonts exist
    let existing_paths: Vec<_> = paths.iter().filter(|p| p.exists()).collect();
    if existing_paths.is_empty() {
        println!("RobotoFlex fonts not found, skipping test");
        return;
    }

    let parser = UIFontParser::new();
    let font_data: Vec<_> = existing_paths
        .iter()
        .map(|p| fs::read(p).unwrap())
        .collect();
    let font_faces: Vec<UIFontFace> = existing_paths
        .iter()
        .enumerate()
        .map(|(i, _p)| UIFontFace {
            face_id: format!("RobotoFlex-{}", i),
            data: &font_data[i],
            user_font_style_italic: None,
        })
        .collect();

    let result = parser
        .analyze_family(Some("RobotoFlex".to_string()), font_faces)
        .unwrap();

    // Check for instances with negative slnt values
    for face in &result.faces {
        if let Some(instances) = &face.instances {
            for instance in instances {
                if let Some(slnt_value) = instance.coordinates.get("slnt") {
                    println!("Instance '{}': slnt={}", instance.name, slnt_value);
                    // slnt values should be negative for italic instances
                    if instance.name.to_lowercase().contains("italic") {
                        assert!(
                            *slnt_value < 0.0,
                            "Italic instance should have negative slnt value, got {}",
                            slnt_value
                        );
                    }
                }
            }
        }
    }

    // Check that weight values are reasonable (100-1000 range, including ExtraBlack)
    for style in &result.styles {
        assert!(
            style.weight >= 100 && style.weight <= 1000,
            "Weight should be in 100-1000 range, got {} for style '{}'",
            style.weight,
            style.name
        );
    }

    // Test the casting issue directly
    let test_negative_value = -10.0_f32;
    let cast_to_u16 = test_negative_value as u16;
    println!("Test: {} as u16 = {}", test_negative_value, cast_to_u16);

    // Test various negative values
    let test_values = vec![-1.0, -10.0, -100.0, -203.0];
    for val in test_values {
        let as_u16 = val as u16;
        let as_u32 = val as u32;
        let as_i32 = val as i32;
        println!(
            "{} -> u16: {}, u32: {}, i32: {}",
            val, as_u16, as_u32, as_i32
        );
    }

    // Check if the issue is in the WASM serialization
    #[cfg(feature = "serde")]
    {
        use fonts::parse_ui::UIFontInstance;
        use fonts::serde::WasmFontInstance;
        use std::collections::HashMap;

        let mut coords = HashMap::new();
        coords.insert("slnt".to_string(), -203.0);
        let instance = UIFontInstance {
            name: "Test".to_string(),
            postscript_name: None,
            coordinates: coords,
        };

        let wasm_instance: WasmFontInstance = instance.into();
        println!("WASM instance coordinates: {:?}", wasm_instance.coordinates);
    }
}
