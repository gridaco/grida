#[cfg(feature = "serde")]
use grida_canvas_fonts::selection_italic::*;
#[cfg(feature = "serde")]
use grida_canvas_fonts::serde::*;
#[cfg(feature = "serde")]
use grida_canvas_fonts::{
    FaceClassification, FamilyScenario, FvarAxis, FvarData, FvarInstance, InstanceInfo, StatAxis,
    StatAxisValue, StatCombination, StatData, VfRecipe,
};
#[cfg(feature = "serde")]
use std::collections::HashMap;

#[cfg(feature = "serde")]
#[test]
fn test_italic_kind_json_serialization() {
    // Test Normal
    let normal = ItalicKind::Normal;
    let normal_json = ItalicKindJson::from(normal);
    let json_str = serde_json::to_string(&normal_json).unwrap();
    assert_eq!(json_str, r#"{"kind":"normal"}"#);

    // Test Italic
    let italic = ItalicKind::Italic;
    let italic_json = ItalicKindJson::from(italic);
    let json_str = serde_json::to_string(&italic_json).unwrap();
    assert_eq!(json_str, r#"{"kind":"italic"}"#);
}

#[cfg(feature = "serde")]
#[test]
fn test_vf_recipe_json_serialization() {
    let mut axis_values = HashMap::new();
    axis_values.insert("ital".to_string(), 1.0);
    axis_values.insert("wght".to_string(), 400.0);

    let recipe = VfRecipe { axis_values };
    let recipe_json = VfRecipeJson::from(recipe);
    let json_str = serde_json::to_string(&recipe_json).unwrap();

    // Should contain both axis values
    assert!(json_str.contains("\"tag\":\"ital\""));
    assert!(json_str.contains("\"value\":1.0"));
    assert!(json_str.contains("\"tag\":\"wght\""));
    assert!(json_str.contains("\"value\":400.0"));
}

#[cfg(feature = "serde")]
#[test]
fn test_face_classification_json_serialization() {
    let classification = FaceClassification {
        font_style: ItalicKind::Italic,
        vf_recipe: Some(VfRecipe::new("ital", 1.0)),
        weight_key: 400,
        stretch_key: 5,
        is_variable: true,
        instance_info: Some(InstanceInfo {
            italic_instances: vec!["Italic".to_string()],
            ps_name: "TestFont-Italic".to_string(),
            style_name: "Italic".to_string(),
        }),
    };

    let classification_json = FaceClassificationJson::from(classification);
    let json_str = serde_json::to_string(&classification_json).unwrap();

    // Should contain all the expected fields
    assert!(json_str.contains("\"italic_kind\":{\"kind\":\"italic\"}"));
    assert!(json_str.contains("\"weight_key\":400"));
    assert!(json_str.contains("\"stretch_key\":5"));
    assert!(json_str.contains("\"is_variable\":true"));
    assert!(json_str.contains("\"TestFont-Italic\""));
}

#[cfg(feature = "serde")]
#[test]
fn test_family_scenario_json_serialization() {
    let scenarios = vec![
        FamilyScenario::SingleStatic,
        FamilyScenario::MultiStatic,
        FamilyScenario::SingleVf,
        FamilyScenario::DualVf,
    ];

    for scenario in scenarios {
        let scenario_json = FamilyScenarioJson::from(scenario.clone());
        let json_str = serde_json::to_string(&scenario_json).unwrap();

        // Should contain the scenario string
        let expected = match scenario {
            FamilyScenario::SingleStatic => "single_static",
            FamilyScenario::MultiStatic => "multi_static",
            FamilyScenario::SingleVf => "single_vf",
            FamilyScenario::DualVf => "dual_vf",
        };
        assert!(json_str.contains(&format!("\"scenario\":\"{}\"", expected)));
    }
}

#[cfg(feature = "serde")]
#[test]
fn test_utils_functions() {
    let data = "test_data".to_string();

    // Test success_response
    let success = utils::success_response(data);
    let success_json = serde_json::to_string(&success).unwrap();
    assert!(success_json.contains("\"success\":true"));
    assert!(success_json.contains("\"data\":\"test_data\""));

    // Test error_response
    let error = utils::error_response("TEST_ERROR", "Test error message");
    let error_json = serde_json::to_string(&error).unwrap();
    assert!(error_json.contains("\"success\":false"));
    assert!(error_json.contains("\"code\":\"TEST_ERROR\""));
    assert!(error_json.contains("\"message\":\"Test error message\""));

    // Test error_response_with_details
    let error_with_details =
        utils::error_response_with_details("DETAILED_ERROR", "Error message", "Additional details");
    let error_with_details_json = serde_json::to_string(&error_with_details).unwrap();
    assert!(error_with_details_json.contains("\"success\":false"));
    assert!(error_with_details_json.contains("\"code\":\"DETAILED_ERROR\""));
    assert!(error_with_details_json.contains("\"message\":\"Error message\""));
    assert!(error_with_details_json.contains("\"details\":\"Additional details\""));
}

#[cfg(feature = "serde")]
#[test]
fn test_fvar_data_json_serialization() {
    let mut axes = HashMap::new();
    axes.insert(
        "ital".to_string(),
        FvarAxis {
            tag: "ital".to_string(),
            min: 0.0,
            def: 0.0,
            max: 1.0,
            flags: 0,
            name: "Italic".to_string(),
        },
    );

    let instances = vec![FvarInstance {
        name: "Regular".to_string(),
        coordinates: {
            let mut coords = HashMap::new();
            coords.insert("ital".to_string(), 0.0);
            coords.insert("wght".to_string(), 400.0);
            coords
        },
        flags: 0,
        postscript_name: Some("TestFont-Regular".to_string()),
    }];

    let fvar_data = FvarData { axes, instances };
    let fvar_json = FvarDataJson::from(fvar_data);
    let json_str = serde_json::to_string(&fvar_json).unwrap();

    // Should contain axis and instance data
    assert!(json_str.contains("\"tag\":\"ital\""));
    assert!(json_str.contains("\"name\":\"Regular\""));
    assert!(json_str.contains("\"TestFont-Regular\""));
}

#[cfg(feature = "serde")]
#[test]
fn test_stat_data_json_serialization() {
    let stat_data = StatData {
        axes: vec![StatAxis {
            tag: "ital".to_string(),
            name: "Italic".to_string(),
            values: vec![
                StatAxisValue {
                    name: "Roman".to_string(),
                    value: 0.0,
                    linked_value: None,
                    range_min_value: None,
                    range_max_value: None,
                },
                StatAxisValue {
                    name: "Italic".to_string(),
                    value: 1.0,
                    linked_value: None,
                    range_min_value: None,
                    range_max_value: None,
                },
            ],
        }],
        combinations: vec![StatCombination {
            name: "Regular".to_string(),
            values: vec![("ital".to_string(), 0.0)],
        }],
        elided_fallback_name: Some("TestFont".to_string()),
    };

    let stat_json = StatDataJson::from(stat_data);
    let json_str = serde_json::to_string(&stat_json).unwrap();

    // Should contain axis, combination, and fallback name data
    assert!(json_str.contains("\"tag\":\"ital\""));
    assert!(json_str.contains("\"name\":\"Regular\""));
    assert!(json_str.contains("\"elided_fallback_name\":\"TestFont\""));
}
