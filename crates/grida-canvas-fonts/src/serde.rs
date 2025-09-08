//! JSON Serialization Structs for WASM Communication
//!
//! This module provides serializable versions of the core font parsing structures
//! optimized for JSON transport to WASM environments.
//!
//! Key design principles:
//! - All structs implement Serialize (serialization only)
//! - Use String instead of complex enums for better JSON compatibility
//! - Flatten nested structures where appropriate
//! - Use Vec instead of HashMap for predictable JSON ordering
//! - Include metadata for debugging and validation
//! - Focus on clean return values for WASM consumption

use crate::parse::{
    FvarAxis, FvarData, FvarInstance, StatAxis, StatAxisValue, StatCombination, StatData,
};
use crate::selection::{FaceClassification, FamilyScenario, InstanceInfo, VfRecipe};
use crate::selection_italic::{ItalicCapabilityMap, ItalicKind};

/// JSON-friendly representation of italic classification.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ItalicKindJson {
    /// String representation of the italic kind
    pub kind: String,
}

impl From<ItalicKind> for ItalicKindJson {
    fn from(kind: ItalicKind) -> Self {
        Self {
            kind: match kind {
                ItalicKind::Normal => "normal".to_string(),
                ItalicKind::Italic => "italic".to_string(),
            },
        }
    }
}

// Note: FontStyle -> ItalicKindJson conversion is handled by the ItalicKind implementation
// since ItalicKind is a type alias for FontStyle

/// JSON-friendly representation of variable font recipe.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VfRecipeJson {
    /// Axis values as a vector of key-value pairs for predictable JSON ordering
    pub axis_values: Vec<AxisValue>,
}

/// A single axis value pair.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AxisValue {
    /// Axis tag (e.g., "ital", "slnt", "wght")
    pub tag: String,
    /// Axis value
    pub value: f32,
}

impl From<VfRecipe> for VfRecipeJson {
    fn from(recipe: VfRecipe) -> Self {
        Self {
            axis_values: recipe
                .axis_values
                .into_iter()
                .map(|(tag, value)| AxisValue { tag, value })
                .collect(),
        }
    }
}

/// JSON-friendly representation of instance information.
#[derive(Debug, Clone, serde::Serialize)]
pub struct InstanceInfoJson {
    /// List of italic instance names found
    pub italic_instances: Vec<String>,
    /// PostScript name of the font
    pub ps_name: String,
    /// Style name of the font
    pub style_name: String,
}

impl From<InstanceInfo> for InstanceInfoJson {
    fn from(info: InstanceInfo) -> Self {
        Self {
            italic_instances: info.italic_instances,
            ps_name: info.ps_name,
            style_name: info.style_name,
        }
    }
}

/// JSON-friendly representation of face classification.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FaceClassificationJson {
    /// Italic classification
    pub italic_kind: ItalicKindJson,
    /// Variable font recipe (if applicable)
    pub vf_recipe: Option<VfRecipeJson>,
    /// Weight key for family aggregation
    pub weight_key: u16,
    /// Stretch key for family aggregation
    pub stretch_key: u16,
    /// Whether this is a variable font
    pub is_variable: bool,
    /// Instance information (if applicable)
    pub instance_info: Option<InstanceInfoJson>,
}

impl From<FaceClassification> for FaceClassificationJson {
    fn from(classification: FaceClassification) -> Self {
        Self {
            italic_kind: classification.font_style.into(),
            vf_recipe: classification.vf_recipe.map(|r| r.into()),
            weight_key: classification.weight_key,
            stretch_key: classification.stretch_key,
            is_variable: classification.is_variable,
            instance_info: classification.instance_info.map(|i| i.into()),
        }
    }
}

/// JSON-friendly representation of family scenario.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FamilyScenarioJson {
    /// String representation of the scenario
    pub scenario: String,
}

impl From<FamilyScenario> for FamilyScenarioJson {
    fn from(scenario: FamilyScenario) -> Self {
        Self {
            scenario: match scenario {
                FamilyScenario::SingleStatic => "single_static".to_string(),
                FamilyScenario::MultiStatic => "multi_static".to_string(),
                FamilyScenario::SingleVf => "single_vf".to_string(),
                FamilyScenario::DualVf => "dual_vf".to_string(),
            },
        }
    }
}

/// JSON-friendly representation of a face with recipe.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FaceOrVfWithRecipeJson {
    /// Face identifier
    pub face_id: String,
    /// Variable font recipe (if applicable)
    pub vf_recipe: Option<VfRecipeJson>,
    /// Instance information (if applicable)
    pub instance_info: Option<InstanceInfoJson>,
}

/// JSON-friendly representation of italic capability map.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ItalicCapabilityMapJson {
    /// Upright slots as a vector for predictable JSON ordering
    pub upright_slots: Vec<UprightSlot>,
    /// Italic slots as a vector for predictable JSON ordering
    pub italic_slots: Vec<ItalicSlot>,
    /// Family scenario
    pub scenario: FamilyScenarioJson,
}

/// An upright slot entry.
#[derive(Debug, Clone, serde::Serialize)]
pub struct UprightSlot {
    /// Weight key
    pub weight_key: u16,
    /// Stretch key
    pub stretch_key: u16,
    /// Face identifier
    pub face_id: String,
}

/// An italic slot entry.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ItalicSlot {
    /// Weight key
    pub weight_key: u16,
    /// Stretch key
    pub stretch_key: u16,
    /// Face with recipe information
    pub face: FaceOrVfWithRecipeJson,
}

impl From<ItalicCapabilityMap> for ItalicCapabilityMapJson {
    fn from(map: ItalicCapabilityMap) -> Self {
        Self {
            upright_slots: map
                .upright_slots
                .into_iter()
                .map(|((weight_key, stretch_key), face)| UprightSlot {
                    weight_key,
                    stretch_key,
                    face_id: face.face_id,
                })
                .collect(),
            italic_slots: map
                .italic_slots
                .into_iter()
                .map(|((weight_key, stretch_key), face)| ItalicSlot {
                    weight_key,
                    stretch_key,
                    face: FaceOrVfWithRecipeJson {
                        face_id: face.face_id,
                        vf_recipe: face.vf_recipe.map(|r| r.into()),
                        instance_info: face.instance_info.map(|i| i.into()),
                    },
                })
                .collect(),
            scenario: map.scenario.into(),
        }
    }
}

// Note: FontSelectionCapabilityMap -> ItalicCapabilityMapJson conversion is handled by the ItalicCapabilityMap implementation
// since ItalicCapabilityMap is a type alias for FontSelectionCapabilityMap

/// JSON-friendly representation of fvar axis.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FvarAxisJson {
    /// Axis tag
    pub tag: String,
    /// Minimum value
    pub min: f32,
    /// Default value
    pub def: f32,
    /// Maximum value
    pub max: f32,
    /// Axis flags
    pub flags: u16,
    /// Axis name
    pub name: String,
}

impl From<FvarAxis> for FvarAxisJson {
    fn from(axis: FvarAxis) -> Self {
        Self {
            tag: axis.tag,
            min: axis.min,
            def: axis.def,
            max: axis.max,
            flags: axis.flags,
            name: axis.name,
        }
    }
}

/// JSON-friendly representation of fvar instance.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FvarInstanceJson {
    /// Instance name
    pub name: String,
    /// Instance coordinates as a vector for predictable JSON ordering
    pub coordinates: Vec<AxisValue>,
    /// Instance flags
    pub flags: u16,
    /// PostScript name (if available)
    pub postscript_name: Option<String>,
}

impl From<FvarInstance> for FvarInstanceJson {
    fn from(instance: FvarInstance) -> Self {
        Self {
            name: instance.name,
            coordinates: instance
                .coordinates
                .into_iter()
                .map(|(tag, value)| AxisValue { tag, value })
                .collect(),
            flags: instance.flags,
            postscript_name: instance.postscript_name,
        }
    }
}

/// JSON-friendly representation of fvar data.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FvarDataJson {
    /// Axes as a vector for predictable JSON ordering
    pub axes: Vec<FvarAxisJson>,
    /// Named instances
    pub instances: Vec<FvarInstanceJson>,
}

impl From<FvarData> for FvarDataJson {
    fn from(data: FvarData) -> Self {
        Self {
            axes: data.axes.into_iter().map(|(_, axis)| axis.into()).collect(),
            instances: data
                .instances
                .into_iter()
                .map(|instance| instance.into())
                .collect(),
        }
    }
}

/// JSON-friendly representation of STAT axis value.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StatAxisValueJson {
    /// Value name
    pub name: String,
    /// Value
    pub value: f32,
    /// Linked value (if available)
    pub linked_value: Option<f32>,
    /// Range minimum value (if available)
    pub range_min_value: Option<f32>,
    /// Range maximum value (if available)
    pub range_max_value: Option<f32>,
}

impl From<StatAxisValue> for StatAxisValueJson {
    fn from(value: StatAxisValue) -> Self {
        Self {
            name: value.name,
            value: value.value,
            linked_value: value.linked_value,
            range_min_value: value.range_min_value,
            range_max_value: value.range_max_value,
        }
    }
}

/// JSON-friendly representation of STAT axis.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StatAxisJson {
    /// Axis tag
    pub tag: String,
    /// Axis name
    pub name: String,
    /// Axis values
    pub values: Vec<StatAxisValueJson>,
}

impl From<StatAxis> for StatAxisJson {
    fn from(axis: StatAxis) -> Self {
        Self {
            tag: axis.tag,
            name: axis.name,
            values: axis.values.into_iter().map(|value| value.into()).collect(),
        }
    }
}

/// JSON-friendly representation of STAT combination.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StatCombinationJson {
    /// Combination name
    pub name: String,
    /// Axis values as a vector for predictable JSON ordering
    pub values: Vec<AxisValue>,
}

impl From<StatCombination> for StatCombinationJson {
    fn from(combination: StatCombination) -> Self {
        Self {
            name: combination.name,
            values: combination
                .values
                .into_iter()
                .map(|(tag, value)| AxisValue { tag, value })
                .collect(),
        }
    }
}

/// JSON-friendly representation of STAT data.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StatDataJson {
    /// Axes as a vector for predictable JSON ordering
    pub axes: Vec<StatAxisJson>,
    /// Combinations as a vector for predictable JSON ordering
    pub combinations: Vec<StatCombinationJson>,
    /// Elided fallback name (if available)
    pub elided_fallback_name: Option<String>,
}

impl From<StatData> for StatDataJson {
    fn from(data: StatData) -> Self {
        Self {
            axes: data.axes.into_iter().map(|axis| axis.into()).collect(),
            combinations: data
                .combinations
                .into_iter()
                .map(|combination| combination.into())
                .collect(),
            elided_fallback_name: data.elided_fallback_name,
        }
    }
}

/// High-level API response for font analysis.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FontAnalysisResponse {
    /// Face classification results
    pub classifications: Vec<FaceClassificationJson>,
    /// Italic capability map
    pub capability_map: ItalicCapabilityMapJson,
    /// Variable font data (if applicable)
    pub fvar_data: Option<FvarDataJson>,
    /// STAT table data (if applicable)
    pub stat_data: Option<StatDataJson>,
    /// Metadata about the analysis
    pub metadata: AnalysisMetadata,
}

/// Metadata about the font analysis.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AnalysisMetadata {
    /// Number of faces analyzed
    pub face_count: usize,
    /// Whether any faces are variable fonts
    pub has_variable_fonts: bool,
    /// Analysis timestamp (ISO 8601 format)
    pub timestamp: String,
    /// Version of the analysis engine
    pub engine_version: String,
}

/// Success response wrapper.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SuccessResponse<T> {
    /// Success flag
    pub success: bool,
    /// Response data
    pub data: T,
}

/// Error response for failed operations.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ErrorResponse {
    /// Error code
    pub code: String,
    /// Error message
    pub message: String,
    /// Additional error details
    pub details: Option<String>,
}

/// Error response wrapper.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ErrorResponseWrapper {
    /// Success flag
    pub success: bool,
    /// Error information
    pub error: ErrorResponse,
}

/// Utility functions for creating responses.
pub mod utils {
    use super::*;

    /// Creates a success response.
    pub fn success_response<T: serde::Serialize>(data: T) -> SuccessResponse<T> {
        SuccessResponse {
            success: true,
            data,
        }
    }

    /// Creates an error response.
    pub fn error_response(code: &str, message: &str) -> ErrorResponseWrapper {
        ErrorResponseWrapper {
            success: false,
            error: ErrorResponse {
                code: code.to_string(),
                message: message.to_string(),
                details: None,
            },
        }
    }

    /// Creates an error response with additional details.
    pub fn error_response_with_details(
        code: &str,
        message: &str,
        details: &str,
    ) -> ErrorResponseWrapper {
        ErrorResponseWrapper {
            success: false,
            error: ErrorResponse {
                code: code.to_string(),
                message: message.to_string(),
                details: Some(details.to_string()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::selection_italic::ItalicKind;
    use crate::{
        FaceClassification, FamilyScenario, FvarAxis, FvarData, FvarInstance, InstanceInfo,
        StatAxis, StatAxisValue, StatCombination, StatData, VfRecipe,
    };
    use std::collections::HashMap;

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
        let error_with_details = utils::error_response_with_details(
            "DETAILED_ERROR",
            "Error message",
            "Additional details",
        );
        let error_with_details_json = serde_json::to_string(&error_with_details).unwrap();
        assert!(error_with_details_json.contains("\"success\":false"));
        assert!(error_with_details_json.contains("\"code\":\"DETAILED_ERROR\""));
        assert!(error_with_details_json.contains("\"message\":\"Error message\""));
        assert!(error_with_details_json.contains("\"details\":\"Additional details\""));
    }

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
}
