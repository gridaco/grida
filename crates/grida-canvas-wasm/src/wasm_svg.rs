//! WASM Bindings for Grida Canvas SVG
//!
//! This module provides high-level APIs for SVG optimization and processing that can be called
//! from JavaScript/TypeScript in the browser. All functions use the `grida_svg_` prefix
//! and return JSON strings for easy consumption by web applications.

use super::_internal::*;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use cg::io::io_svg::svg_optimize;

// ====================================================================================================
// #region: WASM Response Structs
// ====================================================================================================

/// WASM response for SVG optimization result
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmSvgOptimizeResult {
    /// Optimized SVG string with CSS styles resolved and inlined
    pub svg_optimized: String,
}

// ====================================================================================================
// #region: High-Level SVG APIs
// prefix: `grida_svg_`
// ====================================================================================================

/// Optimizes and resolves an SVG, producing a flat, self-contained SVG output.
///
/// Resolves CSS styles from `<style>` tags and inlines them as element attributes.
/// See `cg::io::io_svg::svg_optimize` for detailed documentation.
///
/// # Arguments
/// * `svg` - Input SVG string (null-terminated C string)
///
/// # Returns
/// JSON string containing `WasmSvgOptimizeResult` with `optimized_svg` field or error information.
/// The returned pointer must be freed using `grida_svg_free()`.
///
/// js:__grida_svg_optimize
#[no_mangle]
pub unsafe extern "C" fn grida_svg_optimize(svg: *const c_char) -> *mut c_char {
    let result = (|| -> Result<String, String> {
        if svg.is_null() {
            return Err("svg cannot be null".to_string());
        }
        let svg_str = CStr::from_ptr(svg)
            .to_str()
            .map_err(|e| format!("Invalid UTF-8: {}", e))?;
        if svg_str.is_empty() {
            return Err("svg cannot be empty".to_string());
        }
        let optimized_svg = svg_optimize(svg_str)?;
        WasmSuccessResponse::new(WasmSvgOptimizeResult {
            svg_optimized: optimized_svg,
        })
        .to_json()
    })();

    match result {
        Ok(json) => CString::new(json).unwrap().into_raw(),
        Err(error) => CString::new(WasmErrorResponse::new(error).to_json().unwrap())
            .unwrap()
            .into_raw(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_success_response() {
        let data = WasmSvgOptimizeResult {
            svg_optimized: "<svg></svg>".to_string(),
        };
        let response = WasmSuccessResponse::new(data);
        let json_str = response.to_json().unwrap();

        assert!(json_str.contains("\"success\":true"));
        assert!(json_str.contains("\"svg_optimized\""));
    }

    #[test]
    fn test_wasm_error_response() {
        let response = WasmErrorResponse::new("Test error message".to_string());
        let json_str = response.to_json().unwrap();

        assert!(json_str.contains("\"success\":false"));
        assert!(json_str.contains("\"message\":\"Test error message\""));
    }
}
