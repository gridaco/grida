pub mod emscripten;

#[cfg(not(target_arch = "wasm32"))]
pub mod winit;
