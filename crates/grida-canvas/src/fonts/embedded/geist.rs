/// Embedded fallback font used for devtools overlays.
///
/// Skia does not ship with any fonts by default, which causes text
/// rendering to fail especially in WebAssembly builds where the host
/// system fonts are not available.  To ensure that devtools overlays are
/// always rendered with a valid typeface we embed a lightweight font at
/// build time.
pub static BYTES: &[u8] = include_bytes!("../../../assets/fonts/Geist/Geist-VariableFont_wght.ttf");
pub static FAMILY: &str = "Geist";
