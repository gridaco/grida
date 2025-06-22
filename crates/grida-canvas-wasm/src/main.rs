use cg::window::application_webgl::WebGlApplication;
use std::boxed::Box;

#[no_mangle]
pub extern "C" fn init(width: i32, height: i32) -> Box<WebGlApplication> {
    Box::new(WebGlApplication::new(width, height))
}

#[no_mangle]
pub unsafe extern "C" fn resize_surface(app: *mut WebGlApplication, width: i32, height: i32) {
    if let Some(app) = app.as_mut() {
        app.resize(width, height);
    }
}

#[no_mangle]
pub unsafe extern "C" fn redraw(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.redraw();
    }
}

#[no_mangle]
pub unsafe extern "C" fn load_scene_json(app: *mut WebGlApplication, ptr: *const u8, len: usize) {
    if let Some(app) = app.as_mut() {
        let slice = std::slice::from_raw_parts(ptr, len);
        if let Ok(json) = std::str::from_utf8(slice) {
            app.load_scene_json(json);
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn load_dummy_scene(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.load_dummy_scene();
    }
}

fn main() {}
