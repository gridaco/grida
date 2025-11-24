// ====================================================================================================
// #region: internal helpers
// ====================================================================================================

#[no_mangle]
/// js::_allocate
pub extern "C" fn allocate(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
/// js::_deallocate
pub unsafe extern "C" fn deallocate(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len != 0 {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

pub unsafe fn __str_from_ptr_len(ptr: *const u8, len: usize) -> Option<String> {
    if ptr.is_null() || len == 0 {
        return None;
    }

    let slice = std::slice::from_raw_parts(ptr, len);
    std::str::from_utf8(slice).ok().map(|s| s.to_string())
}

// #endregion: internal helpers

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
