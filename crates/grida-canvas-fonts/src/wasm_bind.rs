//! WASM Bindings for Grida Canvas Fonts
//!
//! This module provides high-level APIs for font parsing and selection that can be called
//! from JavaScript/TypeScript in the browser. All functions use the `grida_fonts_` prefix
//! and return JSON strings for easy consumption by web applications.

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use crate::parse::Parser;
use crate::parse_ui::{UIFontFaceOwned, UIFontParser};

// ====================================================================================================
// #region: WASM Response Structs
// ====================================================================================================

/// WASM response for font family analysis
#[derive(serde::Serialize)]
pub struct WasmFontAnalysisResult {
    pub success: bool,
    pub family_name: String,
    pub has_italic: bool,
    pub has_upright: bool,
    pub strategy: String,
    pub scenario: String,
    pub recipe_count: usize,
    pub variable_font_info: Option<WasmVariableFontInfo>,
    pub face_info: Vec<WasmFaceInfo>,
}

/// WASM response for variable font information
#[derive(serde::Serialize)]
pub struct WasmVariableFontInfo {
    pub axes: Vec<WasmFontAxis>,
    pub instances: Vec<WasmFontInstance>,
}

/// WASM response for font axis information
#[derive(serde::Serialize)]
pub struct WasmFontAxis {
    pub tag: String,
    pub name: String,
    pub min: f32,
    pub default: f32,
    pub max: f32,
}

/// WASM response for font instance information
#[derive(serde::Serialize)]
pub struct WasmFontInstance {
    pub name: String,
    pub coordinates: HashMap<String, f32>,
}

/// WASM response for face information
#[derive(serde::Serialize)]
pub struct WasmFaceInfo {
    pub face_id: String,
    pub family_name: String,
    pub subfamily_name: String,
    pub postscript_name: String,
    pub weight_class: u16,
    pub width_class: u16,
    pub is_variable: bool,
    pub features: Vec<WasmFontFeature>,
}

/// WASM response for font feature information
#[derive(serde::Serialize)]
pub struct WasmFontFeature {
    pub tag: String,
    pub name: String,
    pub tooltip: Option<String>,
    pub sample_text: Option<String>,
}

/// WASM response for face record
#[derive(serde::Serialize)]
pub struct WasmFaceRecord {
    pub face_id: String,
    pub ps_name: String,
    pub family_name: String,
    pub subfamily_name: String,
    pub is_variable: bool,
    pub os2_italic_bit: bool,
    pub weight_class: u16,
    pub width_class: u16,
    pub user_font_style_italic: Option<bool>,
    pub axes_count: usize,
}

/// WASM error response
#[derive(serde::Serialize)]
pub struct WasmError {
    pub error: bool,
    pub message: String,
}

// ====================================================================================================
// #region: Conversion Functions
// ====================================================================================================

impl From<crate::parse_ui::UIFontFamilyResult> for WasmFontAnalysisResult {
    fn from(result: crate::parse_ui::UIFontFamilyResult) -> Self {
        Self {
            success: true,
            family_name: result.family_name,
            has_italic: result.italic_capability.has_italic,
            has_upright: result.italic_capability.has_upright,
            strategy: format!("{:?}", result.italic_capability.strategy),
            scenario: format!("{:?}", result.italic_capability.scenario),
            recipe_count: result.italic_capability.recipes.len(),
            variable_font_info: result.variable_font_info.map(Into::into),
            face_info: result.face_info.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<crate::parse_ui::UIFontVariableInfo> for WasmVariableFontInfo {
    fn from(vfi: crate::parse_ui::UIFontVariableInfo) -> Self {
        Self {
            axes: vfi.axes.into_iter().map(Into::into).collect(),
            instances: vfi.instances.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<crate::parse_ui::UIFontAxis> for WasmFontAxis {
    fn from(axis: crate::parse_ui::UIFontAxis) -> Self {
        Self {
            tag: axis.tag,
            name: axis.name,
            min: axis.min,
            default: axis.default,
            max: axis.max,
        }
    }
}

impl From<crate::parse_ui::UIFontInstance> for WasmFontInstance {
    fn from(instance: crate::parse_ui::UIFontInstance) -> Self {
        Self {
            name: instance.name,
            coordinates: instance.coordinates,
        }
    }
}

impl From<crate::parse_ui::UIFontFaceInfo> for WasmFaceInfo {
    fn from(face: crate::parse_ui::UIFontFaceInfo) -> Self {
        Self {
            face_id: face.face_id,
            family_name: face.family_name,
            subfamily_name: face.subfamily_name,
            postscript_name: face.postscript_name,
            weight_class: face.weight_class,
            width_class: face.width_class,
            is_variable: face.is_variable,
            features: face.features.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<crate::parse_ui::UIFontFeature> for WasmFontFeature {
    fn from(feature: crate::parse_ui::UIFontFeature) -> Self {
        Self {
            tag: feature.tag,
            name: feature.name,
            tooltip: feature.tooltip,
            sample_text: feature.sample_text,
        }
    }
}

impl From<crate::selection::FaceRecord> for WasmFaceRecord {
    fn from(record: crate::selection::FaceRecord) -> Self {
        Self {
            face_id: record.face_id,
            ps_name: record.ps_name,
            family_name: record.family_name,
            subfamily_name: record.subfamily_name,
            is_variable: record.is_variable,
            os2_italic_bit: record.os2_italic_bit,
            weight_class: record.weight_class,
            width_class: record.width_class,
            user_font_style_italic: record.user_font_style_italic,
            axes_count: record.axes.len(),
        }
    }
}

// ====================================================================================================
// #region: Helper Functions
// ====================================================================================================

/// Converts C-style arrays to Rust UIFontFaceOwned vectors
unsafe fn convert_c_arrays_to_faces(
    font_count: usize,
    face_ids: *const *const c_char,
    font_data_ptrs: *const *const u8,
    font_data_sizes: *const usize,
    user_italic_flags: *const i32,
) -> Result<Vec<UIFontFaceOwned>, String> {
    // Validate input parameters
    if font_count == 0 {
        return Err("font_count cannot be zero".to_string());
    }
    if face_ids.is_null() || font_data_ptrs.is_null() || font_data_sizes.is_null() {
        return Err("face_ids, font_data_ptrs, and font_data_sizes cannot be null".to_string());
    }

    // Convert C arrays to Rust vectors
    let mut faces = Vec::with_capacity(font_count);
    for i in 0..font_count {
        // Get face ID
        let face_id_ptr = *face_ids.add(i);
        if face_id_ptr.is_null() {
            return Err(format!("face_ids[{}] cannot be null", i));
        }
        let face_id = CStr::from_ptr(face_id_ptr).to_string_lossy().to_string();

        // Get font data
        let data_ptr = *font_data_ptrs.add(i);
        let data_size = *font_data_sizes.add(i);
        if data_ptr.is_null() || data_size == 0 {
            return Err(format!("font_data[{}] cannot be null or empty", i));
        }
        let font_data = std::slice::from_raw_parts(data_ptr, data_size).to_vec();

        // Get user italic flag
        let user_font_style_italic = if user_italic_flags.is_null() {
            None
        } else {
            let flag = *user_italic_flags.add(i);
            match flag {
                -1 => None,
                0 => Some(false),
                1 => Some(true),
                _ => return Err(format!("Invalid user_italic_flags[{}]: {}", i, flag)),
            }
        };

        faces.push(UIFontFaceOwned {
            face_id,
            data: font_data,
            user_font_style_italic,
        });
    }

    Ok(faces)
}

// ====================================================================================================
// #region: High-Level Font Analysis APIs
// prefix: `grida_fonts_`
// ====================================================================================================

/// Analyzes a font family and returns comprehensive family information as JSON.
///
/// # Arguments
/// * `family_name` - Family name (can be null for auto-detection)
/// * `font_count` - Number of font faces
/// * `face_ids` - Array of face IDs (null-terminated strings)
/// * `font_data_ptrs` - Array of pointers to font data
/// * `font_data_sizes` - Array of font data sizes
/// * `user_italic_flags` - Array of user italic declarations (can be null)
///
/// # Returns
/// JSON string containing UIFontFamilyResult or error information
#[no_mangle]
pub unsafe extern "C" fn grida_fonts_analyze_family(
    family_name: *const c_char,
    font_count: usize,
    face_ids: *const *const c_char,
    font_data_ptrs: *const *const u8,
    font_data_sizes: *const usize,
    user_italic_flags: *const i32, // -1 = null, 0 = false, 1 = true
) -> *mut c_char {
    let result = (|| -> Result<String, String> {
        // Parse family name
        let family_name = if family_name.is_null() {
            None
        } else {
            let c_str = CStr::from_ptr(family_name);
            Some(c_str.to_string_lossy().to_string())
        };

        // Convert C arrays to Rust vectors
        let faces = convert_c_arrays_to_faces(
            font_count,
            face_ids,
            font_data_ptrs,
            font_data_sizes,
            user_italic_flags,
        )?;

        // Analyze family
        let parser = UIFontParser::new();
        let result = parser.analyze_family_owned(family_name, faces)?;

        // Convert to WASM response struct and serialize
        let response = WasmFontAnalysisResult::from(result);
        serde_json::to_string(&response).map_err(|e| format!("Failed to serialize result: {}", e))
    })();

    match result {
        Ok(json) => CString::new(json).unwrap().into_raw(),
        Err(error) => {
            let error_response = WasmError {
                error: true,
                message: error,
            };
            CString::new(serde_json::to_string(&error_response).unwrap())
                .unwrap()
                .into_raw()
        }
    }
}

// ====================================================================================================
// #region: Low-Level Font Parsing APIs
// prefix: `grida_fonts_`
// ====================================================================================================

/// Parses a single font file and extracts basic metadata.
///
/// # Arguments
/// * `font_data_ptr` - Pointer to font data
/// * `font_data_size` - Size of font data
/// * `face_id` - Unique identifier for this font face
/// * `user_font_style_italic` - User-declared italic style (can be null for auto-detection)
///
/// # Returns
/// JSON string containing FaceRecord or error information
#[no_mangle]
pub unsafe extern "C" fn grida_fonts_parse_font(
    font_data_ptr: *const u8,
    font_data_size: usize,
    face_id: *const c_char,
    user_font_style_italic: *const c_char,
) -> *mut c_char {
    let result = (|| -> Result<String, String> {
        // Validate font data
        if font_data_ptr.is_null() || font_data_size == 0 {
            return Err("font_data cannot be null or empty".to_string());
        }

        // Get font data
        let font_data = std::slice::from_raw_parts(font_data_ptr, font_data_size).to_vec();

        // Parse face ID
        let face_id_str = CStr::from_ptr(face_id).to_string_lossy().to_string();

        // Parse user font style italic
        let user_font_style_italic = if user_font_style_italic.is_null() {
            None
        } else {
            let style_str = CStr::from_ptr(user_font_style_italic)
                .to_string_lossy()
                .to_string();
            match style_str.as_str() {
                "true" => Some(true),
                "false" => Some(false),
                _ => {
                    return Err(format!(
                        "Invalid user_font_style_italic: {}. Must be 'true' or 'false'",
                        style_str
                    ))
                }
            }
        };

        // Parse font
        let parser = Parser::new(&font_data).map_err(|e| format!("Failed to parse font: {}", e))?;

        let face_record = parser.extract_face_record(face_id_str, user_font_style_italic)?;

        // Convert to WASM response struct and serialize
        let response = WasmFaceRecord::from(face_record);
        serde_json::to_string(&response).map_err(|e| format!("Failed to serialize result: {}", e))
    })();

    match result {
        Ok(json) => CString::new(json).unwrap().into_raw(),
        Err(error) => {
            let error_response = WasmError {
                error: true,
                message: error,
            };
            CString::new(serde_json::to_string(&error_response).unwrap())
                .unwrap()
                .into_raw()
        }
    }
}

// ====================================================================================================
// #region: Utility Functions
// prefix: `grida_fonts_`
// ====================================================================================================

/// Frees memory allocated by WASM functions.
///
/// # Arguments
/// * `ptr` - Pointer to memory allocated by a WASM function
#[no_mangle]
pub unsafe extern "C" fn grida_fonts_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        let _ = CString::from_raw(ptr);
    }
}

/// Returns the version of the font parsing library.
///
/// # Returns
/// Version string
#[no_mangle]
pub unsafe extern "C" fn grida_fonts_version() -> *mut c_char {
    let version = env!("CARGO_PKG_VERSION");
    CString::new(version).unwrap().into_raw()
}

// ====================================================================================================
// #region: JSON Helper Types
// ====================================================================================================
