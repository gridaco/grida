//! WASM Serialization Module for Font Analysis
//!
//! This module provides JSON-serializable versions of all UI font structures
//! optimized for WASM communication. It directly mirrors the `UIFontFamilyResult`
//! structure and related types from `parse_ui.rs`.
//!
//! Key design principles:
//! - Direct 1:1 mapping with `UIFontFamilyResult` and related types
//! - All structs implement `Serialize` for JSON output
//! - Use `String` instead of complex enums for better JSON compatibility
//! - Use `Vec` instead of `HashMap` for predictable JSON ordering
//! - Include all fields from the original UI structures
//! - Optimized for WASM consumption

use crate::parse_ui::{
    UIFontAxis, UIFontFaceInfo, UIFontFamilyAxis, UIFontFamilyResult, UIFontFeature,
    UIFontInstance, UIFontItalicCapability, UIFontItalicRecipe, UIFontStyleInstance,
};
use crate::selection::VfRecipe;

// ====================================================================================================
// #region: Core WASM Response Types
// ====================================================================================================

/// WASM response for complete font family analysis
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontFamilyResult {
    /// Family name
    pub family_name: String,
    /// Family-level axes (no default values as they vary per face)
    pub axes: Vec<WasmFontFamilyAxis>,
    /// Italic capabilities and recipes
    pub italic_capability: WasmFontItalicCapability,
    /// Face-level information
    pub faces: Vec<WasmFontFaceInfo>,
    /// Available font styles for UI style picker
    pub styles: Vec<WasmFontStyleInstance>,
}

/// WASM response for italic capability analysis
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontItalicCapability {
    /// Whether the family has italic variants
    pub has_italic: bool,
    /// Whether the family has upright variants
    pub has_upright: bool,
    /// Primary italic strategy for this family (as string)
    pub strategy: String,
    /// Available italic recipes for UI display
    pub recipes: Vec<WasmFontItalicRecipe>,
    /// Family scenario type (as string)
    pub scenario: String,
}

/// WASM response for italic recipe
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontItalicRecipe {
    /// User-friendly name (e.g., "Bold Italic", "Regular")
    pub name: String,
    /// User-friendly description
    pub description: String,
    /// Whether this recipe produces italic text
    pub is_italic: bool,
    /// Face ID to use for this recipe
    pub face_id: String,
    /// Variable font recipe (if applicable)
    pub vf_recipe: Option<WasmVfRecipe>,
}

/// WASM response for variable font recipe
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmVfRecipe {
    /// Axis values as a vector for predictable JSON ordering
    pub axis_values: Vec<WasmAxisValue>,
}

/// WASM response for axis value pair
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmAxisValue {
    /// Axis tag (e.g., "ital", "slnt", "wght")
    pub tag: String,
    /// Axis value
    pub value: f32,
}

/// WASM response for family-level axis information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontFamilyAxis {
    /// Axis tag (e.g., "wght", "ital", "slnt")
    pub tag: String,
    /// Human-readable axis name
    pub name: String,
    /// Minimum value across all faces
    pub min: f32,
    /// Maximum value across all faces
    pub max: f32,
}

/// WASM response for face-level information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontFaceInfo {
    /// Face identifier
    pub face_id: String,
    /// Family name
    pub family_name: String,
    /// Subfamily name
    pub subfamily_name: String,
    /// PostScript name
    pub postscript_name: String,
    /// Weight class
    pub weight_class: u16,
    /// Width class
    pub width_class: u16,
    /// Whether this is a variable font
    pub is_variable: bool,
    /// Face-specific axes (includes default values)
    pub axes: Vec<WasmFontAxis>,
    /// Variable font instances (if this is a variable font)
    pub instances: Option<Vec<WasmFontInstance>>,
    /// Available font features
    pub features: Vec<WasmFontFeature>,
}

/// WASM response for face-specific axis information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontAxis {
    /// Axis tag (e.g., "wght", "ital", "slnt")
    pub tag: String,
    /// Human-readable axis name
    pub name: String,
    /// Minimum value
    pub min: f32,
    /// Default value for this face
    pub default: f32,
    /// Maximum value
    pub max: f32,
}

/// WASM response for variable font instance information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontInstance {
    /// Instance name
    pub name: String,
    /// Axis coordinates as a vector for predictable JSON ordering
    pub coordinates: Vec<WasmAxisValue>,
}

/// WASM response for font feature information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontFeature {
    /// Feature tag
    pub tag: String,
    /// Feature name
    pub name: String,
    /// Tooltip text
    pub tooltip: Option<String>,
    /// Sample text
    pub sample_text: Option<String>,
    /// Characters covered by this feature
    pub glyphs: Vec<String>,
}

/// WASM response for font style instance
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmFontStyleInstance {
    /// User-friendly style name (e.g., "Regular", "Bold", "Light Italic")
    pub name: String,
    /// PostScript name for this style
    pub postscript_name: String,
    /// Whether this style is italic
    pub italic: bool,
}

// ====================================================================================================
// #region: Conversion Implementations
// ====================================================================================================

impl From<UIFontFamilyResult> for WasmFontFamilyResult {
    fn from(result: UIFontFamilyResult) -> Self {
        Self {
            family_name: result.family_name,
            axes: result.axes.into_iter().map(Into::into).collect(),
            italic_capability: result.italic_capability.into(),
            faces: result.faces.into_iter().map(Into::into).collect(),
            styles: result.styles.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<UIFontItalicCapability> for WasmFontItalicCapability {
    fn from(capability: UIFontItalicCapability) -> Self {
        Self {
            has_italic: capability.has_italic,
            has_upright: capability.has_upright,
            strategy: format!("{:?}", capability.strategy),
            recipes: capability.recipes.into_iter().map(Into::into).collect(),
            scenario: format!("{:?}", capability.scenario),
        }
    }
}

impl From<UIFontItalicRecipe> for WasmFontItalicRecipe {
    fn from(recipe: UIFontItalicRecipe) -> Self {
        Self {
            name: recipe.name,
            description: recipe.description,
            is_italic: recipe.is_italic,
            face_id: recipe.face_id,
            vf_recipe: recipe.vf_recipe.map(Into::into),
        }
    }
}

impl From<VfRecipe> for WasmVfRecipe {
    fn from(recipe: VfRecipe) -> Self {
        Self {
            axis_values: recipe
                .axis_values
                .into_iter()
                .map(|(tag, value)| WasmAxisValue { tag, value })
                .collect(),
        }
    }
}

impl From<UIFontFamilyAxis> for WasmFontFamilyAxis {
    fn from(axis: UIFontFamilyAxis) -> Self {
        Self {
            tag: axis.tag,
            name: axis.name,
            min: axis.min,
            max: axis.max,
        }
    }
}

impl From<UIFontFaceInfo> for WasmFontFaceInfo {
    fn from(face: UIFontFaceInfo) -> Self {
        Self {
            face_id: face.face_id,
            family_name: face.family_name,
            subfamily_name: face.subfamily_name,
            postscript_name: face.postscript_name,
            weight_class: face.weight_class,
            width_class: face.width_class,
            is_variable: face.is_variable,
            axes: face.axes.into_iter().map(Into::into).collect(),
            instances: face
                .instances
                .map(|instances| instances.into_iter().map(Into::into).collect()),
            features: face.features.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<UIFontAxis> for WasmFontAxis {
    fn from(axis: UIFontAxis) -> Self {
        Self {
            tag: axis.tag,
            name: axis.name,
            min: axis.min,
            default: axis.default,
            max: axis.max,
        }
    }
}

impl From<UIFontInstance> for WasmFontInstance {
    fn from(instance: UIFontInstance) -> Self {
        Self {
            name: instance.name,
            coordinates: instance
                .coordinates
                .into_iter()
                .map(|(tag, value)| WasmAxisValue { tag, value })
                .collect(),
        }
    }
}

impl From<UIFontFeature> for WasmFontFeature {
    fn from(feature: UIFontFeature) -> Self {
        Self {
            tag: feature.tag,
            name: feature.name,
            tooltip: feature.tooltip,
            sample_text: feature.sample_text,
            glyphs: feature.glyphs,
        }
    }
}

impl From<UIFontStyleInstance> for WasmFontStyleInstance {
    fn from(style: UIFontStyleInstance) -> Self {
        Self {
            name: style.name,
            postscript_name: style.postscript_name,
            italic: style.italic,
        }
    }
}

// ====================================================================================================
// #region: Utility Functions
// ====================================================================================================

/// Serializes a `UIFontFamilyResult` to JSON string for WASM consumption
pub fn serialize_font_family_result(result: UIFontFamilyResult) -> Result<String, String> {
    let wasm_result = WasmFontFamilyResult::from(result);
    serde_json::to_string(&wasm_result)
        .map_err(|e| format!("Failed to serialize font family result: {}", e))
}

/// Creates a success response wrapper for WASM
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmSuccessResponse<T> {
    /// Success flag
    pub success: bool,
    /// Response data
    pub data: T,
}

/// Creates an error response wrapper for WASM
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmErrorResponse {
    /// Success flag
    pub success: bool,
    /// Error information
    pub error: WasmError,
}

/// Error information for WASM responses
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmError {
    /// Error message
    pub message: String,
}

impl<T: serde::Serialize> WasmSuccessResponse<T> {
    /// Creates a new success response
    pub fn new(data: T) -> Self {
        Self {
            success: true,
            data,
        }
    }

    /// Serializes the response to JSON
    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(self)
            .map_err(|e| format!("Failed to serialize success response: {}", e))
    }
}

impl WasmErrorResponse {
    /// Creates a new error response
    pub fn new(message: String) -> Self {
        Self {
            success: false,
            error: WasmError { message },
        }
    }

    /// Serializes the response to JSON
    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(self)
            .map_err(|e| format!("Failed to serialize error response: {}", e))
    }
}

// ====================================================================================================
// #region: Tests
// ====================================================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_ui::{UIFontFamilyResult, UIFontItalicCapability, UIFontItalicStrategy};
    use crate::selection::FamilyScenario;
    use std::collections::HashMap;

    #[test]
    fn test_wasm_font_family_result_serialization() {
        // Create a minimal test result
        let result = UIFontFamilyResult {
            family_name: "TestFont".to_string(),
            axes: vec![],
            italic_capability: UIFontItalicCapability {
                has_italic: true,
                has_upright: true,
                strategy: UIFontItalicStrategy::StaticFamily,
                recipes: vec![],
                scenario: FamilyScenario::MultiStatic,
            },
            faces: vec![],
            styles: vec![],
        };

        let wasm_result = WasmFontFamilyResult::from(result);
        let json_str = serde_json::to_string(&wasm_result).unwrap();

        // Should contain the family name and strategy
        assert!(json_str.contains("\"family_name\":\"TestFont\""));
        assert!(json_str.contains("\"has_italic\":true"));
        assert!(json_str.contains("\"has_upright\":true"));
        assert!(json_str.contains("\"strategy\":\"StaticFamily\""));
        assert!(json_str.contains("\"scenario\":\"MultiStatic\""));
    }

    #[test]
    fn test_wasm_vf_recipe_serialization() {
        let mut axis_values = HashMap::new();
        axis_values.insert("ital".to_string(), 1.0);
        axis_values.insert("wght".to_string(), 400.0);

        let recipe = VfRecipe { axis_values };
        let wasm_recipe = WasmVfRecipe::from(recipe);
        let json_str = serde_json::to_string(&wasm_recipe).unwrap();

        // Should contain both axis values
        assert!(json_str.contains("\"tag\":\"ital\""));
        assert!(json_str.contains("\"value\":1.0"));
        assert!(json_str.contains("\"tag\":\"wght\""));
        assert!(json_str.contains("\"value\":400.0"));
    }

    #[test]
    fn test_wasm_success_response() {
        let data = "test_data".to_string();
        let response = WasmSuccessResponse::new(data);
        let json_str = response.to_json().unwrap();

        assert!(json_str.contains("\"success\":true"));
        assert!(json_str.contains("\"data\":\"test_data\""));
    }

    #[test]
    fn test_wasm_error_response() {
        let response = WasmErrorResponse::new("Test error message".to_string());
        let json_str = response.to_json().unwrap();

        assert!(json_str.contains("\"success\":false"));
        assert!(json_str.contains("\"message\":\"Test error message\""));
    }
}
