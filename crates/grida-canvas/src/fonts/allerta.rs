use skia_safe::{Font, FontMgr};

/// Embedded fallback font used for devtools overlays.
///
/// Skia does not ship with any fonts by default, which causes text
/// rendering to fail especially in WebAssembly builds where the host
/// system fonts are not available.  To ensure that devtools overlays are
/// always rendered with a valid typeface we embed a lightweight font at
/// build time.
static ALLERTA_REGULAR: &[u8] = include_bytes!("../../fonts/Allerta/Allerta-Regular.ttf");

pub fn allerta(size: f32) -> Font {
    let font_mgr = FontMgr::new();

    // Create a typeface from the embedded font data. This always
    // succeeds on both native and WASM targets because the bytes are bundled
    // with the binary at compile time.
    if let Some(tf) = font_mgr.new_from_data(ALLERTA_REGULAR, None) {
        return Font::new(tf, size);
    }

    // Fallback to default font if embedded font fails (shouldn't happen)
    let mut f = Font::default();
    f.set_size(size);
    f
}
