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
