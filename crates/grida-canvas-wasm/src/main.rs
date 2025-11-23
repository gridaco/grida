#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

mod _internal;
mod wasm_application;
mod wasm_fonts;
mod wasm_svg;

#[cfg(not(target_arch = "wasm32"))]
fn main() {}

#[cfg(target_arch = "wasm32")]
fn main() {}
