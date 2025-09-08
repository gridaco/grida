//! Example: WASM Communication with JSON Serialization
//!
//! This example demonstrates how to use the serde module for serializing
//! font analysis results to JSON for WASM consumption.
//!
//! Run with: cargo run --example wasm_communication --features serde

#[cfg(feature = "serde")]
use grida_canvas_fonts::serde::*;

#[cfg(feature = "serde")]
fn main() {
    println!("🚀 WASM Communication Example (Serialization Only)");
    println!("=================================================");

    // Example 1: Create a font analysis response
    let response = create_font_analysis_response();
    let response_json = serde_json::to_string_pretty(&response).unwrap();
    println!("\n📥 Font Analysis Response (JSON):");
    println!("{}", response_json);

    // Example 2: Demonstrate utility functions
    demonstrate_utility_functions();

    // Example 3: Show error handling
    demonstrate_error_handling();
}

#[cfg(feature = "serde")]
fn create_font_analysis_response() -> FontAnalysisResponse {
    // Simulate creating classifications
    let classifications = vec![
        FaceClassificationJson {
            italic_kind: ItalicKindJson {
                kind: "italic".to_string(),
            },
            vf_recipe: Some(VfRecipeJson {
                axis_values: vec![AxisValue {
                    tag: "ital".to_string(),
                    value: 1.0,
                }],
            }),
            weight_key: 400,
            stretch_key: 5,
            is_variable: true,
            instance_info: Some(InstanceInfoJson {
                italic_instances: vec!["Italic".to_string()],
                ps_name: "TestFont-Italic".to_string(),
                style_name: "Italic".to_string(),
            }),
        },
        FaceClassificationJson {
            italic_kind: ItalicKindJson {
                kind: "normal".to_string(),
            },
            vf_recipe: None,
            weight_key: 400,
            stretch_key: 5,
            is_variable: false,
            instance_info: None,
        },
    ];

    // Simulate creating capability map
    let capability_map = ItalicCapabilityMapJson {
        upright_slots: vec![UprightSlot {
            weight_key: 400,
            stretch_key: 5,
            face_id: "font-2".to_string(),
        }],
        italic_slots: vec![ItalicSlot {
            weight_key: 400,
            stretch_key: 5,
            face: FaceOrVfWithRecipeJson {
                face_id: "font-1".to_string(),
                vf_recipe: Some(VfRecipeJson {
                    axis_values: vec![AxisValue {
                        tag: "ital".to_string(),
                        value: 1.0,
                    }],
                }),
                instance_info: Some(InstanceInfoJson {
                    italic_instances: vec!["Italic".to_string()],
                    ps_name: "TestFont-Italic".to_string(),
                    style_name: "Italic".to_string(),
                }),
            },
        }],
        scenario: FamilyScenarioJson {
            scenario: "dual_vf".to_string(),
        },
    };

    // Simulate fvar data
    let fvar_data = Some(FvarDataJson {
        axes: vec![
            FvarAxisJson {
                tag: "ital".to_string(),
                min: 0.0,
                def: 0.0,
                max: 1.0,
                flags: 0,
                name: "Italic".to_string(),
            },
            FvarAxisJson {
                tag: "wght".to_string(),
                min: 100.0,
                def: 400.0,
                max: 900.0,
                flags: 0,
                name: "Weight".to_string(),
            },
        ],
        instances: vec![
            FvarInstanceJson {
                name: "Regular".to_string(),
                coordinates: vec![
                    AxisValue {
                        tag: "ital".to_string(),
                        value: 0.0,
                    },
                    AxisValue {
                        tag: "wght".to_string(),
                        value: 400.0,
                    },
                ],
                flags: 0,
                postscript_name: Some("TestFont-Regular".to_string()),
            },
            FvarInstanceJson {
                name: "Italic".to_string(),
                coordinates: vec![
                    AxisValue {
                        tag: "ital".to_string(),
                        value: 1.0,
                    },
                    AxisValue {
                        tag: "wght".to_string(),
                        value: 400.0,
                    },
                ],
                flags: 0,
                postscript_name: Some("TestFont-Italic".to_string()),
            },
        ],
    });

    // Simulate STAT data
    let stat_data = Some(StatDataJson {
        axes: vec![StatAxisJson {
            tag: "ital".to_string(),
            name: "Italic".to_string(),
            values: vec![
                StatAxisValueJson {
                    name: "Roman".to_string(),
                    value: 0.0,
                    linked_value: None,
                    range_min_value: None,
                    range_max_value: None,
                },
                StatAxisValueJson {
                    name: "Italic".to_string(),
                    value: 1.0,
                    linked_value: None,
                    range_min_value: None,
                    range_max_value: None,
                },
            ],
        }],
        combinations: vec![
            StatCombinationJson {
                name: "Regular".to_string(),
                values: vec![AxisValue {
                    tag: "ital".to_string(),
                    value: 0.0,
                }],
            },
            StatCombinationJson {
                name: "Italic".to_string(),
                values: vec![AxisValue {
                    tag: "ital".to_string(),
                    value: 1.0,
                }],
            },
        ],
        elided_fallback_name: Some("TestFont".to_string()),
    });

    FontAnalysisResponse {
        classifications,
        capability_map,
        fvar_data,
        stat_data,
        metadata: AnalysisMetadata {
            face_count: 2,
            has_variable_fonts: true,
            timestamp: "2024-01-15T10:30:00Z".to_string(),
            engine_version: "0.1.0".to_string(),
        },
    }
}

#[cfg(feature = "serde")]
fn demonstrate_utility_functions() {
    println!("\n🔧 Utility Functions Demo:");
    println!("=========================");

    // Create some data
    let data = "Font analysis completed successfully".to_string();

    // Test success response
    let success = utils::success_response(data);
    let success_json = serde_json::to_string_pretty(&success).unwrap();
    println!("✅ Success Response:\n{}", success_json);
}

#[cfg(feature = "serde")]
fn demonstrate_error_handling() {
    println!("\n❌ Error Handling Demo:");
    println!("=======================");

    // Test error response
    let error = utils::error_response("FONT_PARSE_ERROR", "Failed to parse font data");
    let error_json = serde_json::to_string_pretty(&error).unwrap();
    println!("❌ Error Response:\n{}", error_json);

    // Test error response with details
    let error_with_details = utils::error_response_with_details(
        "VALIDATION_ERROR",
        "Font validation failed",
        "The font file appears to be corrupted or in an unsupported format",
    );
    let error_with_details_json = serde_json::to_string_pretty(&error_with_details).unwrap();
    println!(
        "❌ Error Response with Details:\n{}",
        error_with_details_json
    );
}

#[cfg(not(feature = "serde"))]
fn main() {
    println!("❌ This example requires the 'serde' feature to be enabled.");
    println!("Run with: cargo run --example wasm_communication --features serde");
}
