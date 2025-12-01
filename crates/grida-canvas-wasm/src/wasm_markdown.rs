//! WASM Bindings for Grida Canvas Markdown
//!
//! This module provides high-level APIs for markdown processing that can be called
//! from JavaScript/TypeScript in the browser. All functions use the `grida_markdown_` prefix
//! and return JSON strings for easy consumption by web applications.

use super::_internal::*;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use cg::io::io_markdown::markdown_to_html;

// ====================================================================================================
// #region: WASM Response Structs
// ====================================================================================================

/// WASM response for markdown to HTML conversion result
#[derive(Debug, Clone, serde::Serialize)]
pub struct WasmMarkdownToHtmlResult {
    /// Converted HTML string
    pub html: String,
}

// ====================================================================================================
// #region: High-Level Markdown APIs
// prefix: `grida_markdown_`
// ====================================================================================================

/// Converts markdown text to HTML.
///
/// Parses markdown content and converts it to HTML using the pulldown-cmark library.
/// See `cg::io::io_markdown::markdown_to_html` for detailed documentation.
///
/// # Arguments
/// * `markdown` - Input markdown string (null-terminated C string)
///
/// # Returns
/// JSON string containing `WasmMarkdownToHtmlResult` with `html` field or error information.
/// The returned pointer should be freed using the TypeScript wrapper's `_string_from_wasm()` method
/// or the internal `_deallocate()` function.
///
/// js:__grida_markdown_to_html
#[no_mangle]
pub unsafe extern "C" fn grida_markdown_to_html(markdown: *const c_char) -> *mut c_char {
    let result = (|| -> Result<String, String> {
        if markdown.is_null() {
            return Err("markdown cannot be null".to_string());
        }
        let markdown_str = CStr::from_ptr(markdown)
            .to_str()
            .map_err(|e| format!("Invalid UTF-8: {}", e))?;
        let html = markdown_to_html(markdown_str);
        WasmSuccessResponse::new(WasmMarkdownToHtmlResult { html }).to_json()
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
    use crate::_internal;
    use std::ffi::CString;

    #[test]
    fn test_markdown_to_html_basic() {
        let markdown = "# Hello World\n\nThis is a **test**.";
        let html = markdown_to_html(markdown);
        println!("Input markdown: {}", markdown);
        println!("Output HTML: {}", html);

        assert!(html.contains("<h1>Hello World</h1>"));
        assert!(html.contains("<p>This is a <strong>test</strong>.</p>"));
    }

    #[test]
    fn test_markdown_to_html_complex() {
        let markdown = r#"# Title

## Subtitle

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2
- List item 3

1. Ordered item 1
2. Ordered item 2

[Link](https://example.com)

`code snippet`
"#;

        let html = markdown_to_html(markdown);
        println!("Input markdown:\n{}", markdown);
        println!("Output HTML:\n{}", html);

        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<h2>Subtitle</h2>"));
        assert!(html.contains("<strong>bold</strong>"));
        assert!(html.contains("<em>italic</em>"));
        assert!(html.contains("<ul>"));
        assert!(html.contains("<li>List item 1</li>"));
        assert!(html.contains("<ol>"));
        assert!(html.contains("<a href=\"https://example.com\">Link</a>"));
        assert!(html.contains("<code>code snippet</code>"));
    }

    #[test]
    fn test_wasm_markdown_to_html_function() {
        let markdown = "# Test\n\nThis is a test.";
        let c_string = CString::new(markdown).unwrap();
        let ptr = c_string.as_ptr();

        let result_ptr = unsafe { grida_markdown_to_html(ptr) };
        assert!(!result_ptr.is_null());

        // Clone the string before taking ownership
        let json_str = unsafe {
            let cstr = CStr::from_ptr(result_ptr);
            cstr.to_str().unwrap().to_string()
        };
        println!("WASM function result: {}", json_str);

        // Parse the JSON response
        let response: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(response["success"], true);

        let html = response["data"]["html"].as_str().unwrap();
        println!("Extracted HTML: {}", html);

        assert!(html.contains("<h1>Test</h1>"));
        assert!(html.contains("<p>This is a test.</p>"));

        // Free the memory using the internal deallocate function
        unsafe {
            let cstr = CStr::from_ptr(result_ptr);
            let len = cstr.to_bytes_with_nul().len();
            _internal::deallocate(result_ptr as *mut u8, len);
        }
    }

    #[test]
    fn test_wasm_markdown_to_html_null_input() {
        let result_ptr = unsafe { grida_markdown_to_html(std::ptr::null()) };
        assert!(!result_ptr.is_null());

        // Clone the string before taking ownership
        let json_str = unsafe {
            let cstr = CStr::from_ptr(result_ptr);
            cstr.to_str().unwrap().to_string()
        };
        println!("Error response: {}", json_str);

        let response: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(response["success"], false);
        assert!(response["error"]["message"]
            .as_str()
            .unwrap()
            .contains("cannot be null"));

        // Free the memory using the internal deallocate function
        unsafe {
            let cstr = CStr::from_ptr(result_ptr);
            let len = cstr.to_bytes_with_nul().len();
            _internal::deallocate(result_ptr as *mut u8, len);
        }
    }

    #[test]
    fn test_wasm_markdown_to_html_empty_string() {
        let c_string = CString::new("").unwrap();
        let ptr = c_string.as_ptr();

        let result_ptr = unsafe { grida_markdown_to_html(ptr) };
        assert!(!result_ptr.is_null());

        // Clone the string before taking ownership
        let json_str = unsafe {
            let cstr = CStr::from_ptr(result_ptr);
            cstr.to_str().unwrap().to_string()
        };
        println!("Empty string result: {}", json_str);

        // Empty markdown should still produce valid HTML (empty or just whitespace)
        let response: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(response["success"], true);
        let html = response["data"]["html"].as_str().unwrap();
        // Empty markdown produces empty HTML
        assert!(html.is_empty() || html.trim().is_empty());

        // Free the memory using the internal deallocate function
        unsafe {
            let cstr = CStr::from_ptr(result_ptr);
            let len = cstr.to_bytes_with_nul().len();
            _internal::deallocate(result_ptr as *mut u8, len);
        }
    }
}
