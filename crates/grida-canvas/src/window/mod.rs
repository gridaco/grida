pub mod command;
pub mod fps;
pub mod hit_overlay;
pub mod ruler;
pub mod scheduler;
pub mod state;
pub mod stats_overlay;
pub mod tile_overlay;

pub mod application;

#[cfg(not(target_arch = "wasm32"))]
pub mod application_native;
#[cfg(not(target_arch = "wasm32"))]
pub mod application_native_demo;
#[cfg(target_arch = "wasm32")]
pub mod application_webgl;

#[cfg(not(target_arch = "wasm32"))]
pub use application_native_demo::{run_demo_window, run_demo_window_with};

pub use application::UnknownTargetApplication;
#[cfg(not(target_arch = "wasm32"))]
pub use application_native::NativeApplication;
