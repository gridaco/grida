#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

#[cfg(target_arch = "wasm32")]
use cg::window::application_webgl::WebGlApplication;
#[cfg(target_arch = "wasm32")]
use std::boxed::Box;

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn init(width: i32, height: i32) -> Box<WebGlApplication> {
    Box::new(WebGlApplication::new(width, height))
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn resize_surface(app: *mut WebGlApplication, width: i32, height: i32) {
    if let Some(app) = app.as_mut() {
        app.resize(width, height);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn redraw(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.redraw();
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn load_scene_json(app: *mut WebGlApplication, ptr: *const u8, len: usize) {
    if let Some(app) = app.as_mut() {
        let slice = std::slice::from_raw_parts(ptr, len);
        if let Ok(json) = std::str::from_utf8(slice) {
            app.load_scene_json(json);
        }
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn load_dummy_scene(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.load_dummy_scene();
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn load_benchmark_scene(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.load_benchmark_scene();
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn pointer_move(app: *mut WebGlApplication, x: f32, y: f32) {
    if let Some(app) = app.as_mut() {
        app.pointer_move(x, y);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn command(app: *mut WebGlApplication, id: u32, a: f32, b: f32) {
    use cg::window::command::WindowCommand;
    if let Some(app) = app.as_mut() {
        let cmd = match id {
            0 => WindowCommand::Close,
            1 => WindowCommand::ZoomIn,
            2 => WindowCommand::ZoomOut,
            3 => WindowCommand::ZoomDelta { delta: a },
            4 => WindowCommand::Pan { tx: a, ty: b },
            5 => WindowCommand::Redraw,
            6 => WindowCommand::Resize {
                width: a as u32,
                height: b as u32,
            },
            _ => WindowCommand::None,
        };
        app.command(cmd);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {}

#[cfg(target_arch = "wasm32")]
fn main() {}
