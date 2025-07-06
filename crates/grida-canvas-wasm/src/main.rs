#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

use cg::window::application::ApplicationApi;
#[cfg(target_arch = "wasm32")]
use cg::window::application_webgl::WebGlApplication;
use math2::transform::AffineTransform;
use std::boxed::Box;

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn allocate(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn deallocate(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len != 0 {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn init(width: i32, height: i32) -> Box<WebGlApplication> {
    Box::new(WebGlApplication::new(width, height))
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn tick(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.tick();
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn resize_surface(app: *mut WebGlApplication, width: i32, height: i32) {
    if let Some(app) = app.as_mut() {
        app.resize(width as u32, height as u32);
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
pub unsafe extern "C" fn load_benchmark_scene(app: *mut WebGlApplication, cols: u32, rows: u32) {
    if let Some(app) = app.as_mut() {
        app.load_benchmark_scene(cols, rows);
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
    use cg::window::command::ApplicationCommand;
    if let Some(app) = app.as_mut() {
        let cmd = match id {
            1 => ApplicationCommand::ZoomIn,
            2 => ApplicationCommand::ZoomOut,
            3 => ApplicationCommand::ZoomDelta { delta: a },
            4 => ApplicationCommand::Pan { tx: a, ty: b },
            _ => ApplicationCommand::None,
        };
        app.command(cmd);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn set_main_camera_transform(
    app: *mut WebGlApplication,
    a: f32,
    c: f32,
    e: f32,
    b: f32,
    d: f32,
    f: f32,
) {
    if let Some(app) = app.as_mut() {
        app.set_main_camera_transform(AffineTransform::from_acebdf(a, c, e, b, d, f));
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn get_node_id_from_point(
    app: *mut WebGlApplication,
    x: f32,
    y: f32,
) -> *const u8 {
    use std::ffi::CString;

    if let Some(app) = app.as_mut() {
        if let Some(s) = app.get_node_id_from_point([x, y]) {
            return CString::new(s).unwrap().into_raw() as *const u8;
        }
    }
    std::ptr::null()
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn get_node_ids_from_point(
    app: *mut WebGlApplication,
    x: f32,
    y: f32,
) -> *const u8 {
    use serde_json;
    use std::ffi::CString;

    if let Some(app) = app.as_mut() {
        let ids = app.get_node_ids_from_point([x, y]);
        if let Ok(json) = serde_json::to_string(&ids) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }

    std::ptr::null()
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn get_node_ids_from_envelope(
    app: *mut WebGlApplication,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> *const u8 {
    use math2::rect::Rectangle;
    use serde_json;
    use std::ffi::CString;

    if let Some(app) = app.as_mut() {
        let ids = app.get_node_ids_from_envelope(Rectangle::from_xywh(x, y, w, h));
        if let Ok(json) = serde_json::to_string(&ids) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }

    std::ptr::null()
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn get_node_absolute_bounding_box(
    app: *mut WebGlApplication,
    ptr: *const u8,
    len: usize,
) -> *const f32 {
    if let Some(app) = app.as_mut() {
        let slice = std::slice::from_raw_parts(ptr, len);
        if let Ok(id) = std::str::from_utf8(slice) {
            if let Some(rect) = app.get_node_absolute_bounding_box(id) {
                let vec4 = rect.to_vec4(); // [f32; 4]
                let out = allocate(std::mem::size_of::<f32>() * 4) as *mut f32;
                std::ptr::copy_nonoverlapping(vec4.as_ptr(), out, 4);
                return out;
            }
        }
    }
    std::ptr::null()
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn set_debug(app: *mut WebGlApplication, debug: bool) {
    if let Some(app) = app.as_mut() {
        app.set_debug(debug);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn toggle_debug(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.toggle_debug();
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn set_verbose(app: *mut WebGlApplication, verbose: bool) {
    if let Some(app) = app.as_mut() {
        app.set_verbose(verbose);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn devtools_rendering_set_show_ruler(app: *mut WebGlApplication, show: bool) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_ruler(show);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn devtools_rendering_set_show_tiles(
    app: *mut WebGlApplication,
    enabled: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_tiles(enabled);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn devtools_rendering_set_show_fps_meter(
    app: *mut WebGlApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_fps_meter(show);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn devtools_rendering_set_show_stats(app: *mut WebGlApplication, show: bool) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_stats(show);
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn devtools_rendering_set_show_hit_testing(
    app: *mut WebGlApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_hit_testing(show);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {}

#[cfg(target_arch = "wasm32")]
fn main() {}
