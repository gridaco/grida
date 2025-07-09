pub mod application;
pub mod command;
pub mod input;
pub mod state;

#[cfg(not(target_arch = "wasm32"))]
pub mod application_native;
#[cfg(not(target_arch = "wasm32"))]
pub mod application_native_demo;

#[cfg(not(target_arch = "wasm32"))]
pub use application_native_demo::{run_demo_window, run_demo_window_with};

pub use application::UnknownTargetApplication;

#[cfg(not(target_arch = "wasm32"))]
pub use application_native::NativeApplication;

pub mod application_emscripten;

pub mod emscripten;
