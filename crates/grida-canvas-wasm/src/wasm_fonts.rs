//! WASM Bindings for Grida Canvas Fonts
//!
//! This module provides high-level APIs for font parsing and selection that can be called
//! from JavaScript/TypeScript in the browser. All functions use the `grida_fonts_` prefix
//! and return JSON strings for easy consumption by web applications.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use fonts::parse::Parser;
use fonts::parse_ui::{UIFontFaceOwned, UIFontParser};
use fonts::serde::WasmFontFamilyResult;

// ====================================================================================================
// #region: Utility Functions
// ====================================================================================================

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
// #region: WASM Response Structs (Single Font Only)
// ====================================================================================================

/// WASM response for face record (single font parsing)
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

// ====================================================================================================
// #region: Conversion Functions
// ====================================================================================================

impl From<fonts::selection::FaceRecord> for WasmFaceRecord {
    fn from(record: fonts::selection::FaceRecord) -> Self {
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
        let wasm_result = WasmFontFamilyResult::from(result);
        let response = WasmSuccessResponse::new(wasm_result);
        response.to_json()
    })();

    match result {
        Ok(json) => CString::new(json).unwrap().into_raw(),
        Err(error) => {
            let error_response = WasmErrorResponse::new(error);
            CString::new(error_response.to_json().unwrap())
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
            let error_response = WasmErrorResponse::new(error);
            CString::new(error_response.to_json().unwrap())
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

mod tests {

    #[test]
    fn test_wasm_success_response() {
        let data = "test_data".to_string();
        let response = super::WasmSuccessResponse::new(data);
        let json_str = response.to_json().unwrap();

        assert!(json_str.contains("\"success\":true"));
        assert!(json_str.contains("\"data\":\"test_data\""));
    }

    #[test]
    fn test_wasm_error_response() {
        let response = super::WasmErrorResponse::new("Test error message".to_string());
        let json_str = response.to_json().unwrap();

        assert!(json_str.contains("\"success\":false"));
        assert!(json_str.contains("\"message\":\"Test error message\""));
    }
}
