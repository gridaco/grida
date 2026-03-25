pub mod clock;
pub mod timer;

/// High-resolution timestamp in milliseconds.
/// Uses `emscripten_get_now()` on WASM, `Instant` on native.
#[cfg(target_os = "emscripten")]
pub fn perf_now() -> f64 {
    unsafe { crate::os::emscripten::emscripten_get_now() }
}

#[cfg(not(target_os = "emscripten"))]
pub fn perf_now() -> f64 {
    use std::time::Instant;
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    let start = START.get_or_init(Instant::now);
    start.elapsed().as_secs_f64() * 1000.0
}
