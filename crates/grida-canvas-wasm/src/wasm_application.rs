use crate::_internal::*;
use cg::window::application::ApplicationApi;
use cg::window::application_emscripten::EmscriptenApplication;
use serde::Serialize;
use std::boxed::Box;
use std::ffi::CString;

// ====================================================================================================
// #region: main app lifecycle
// ====================================================================================================

#[no_mangle]
/// js::_init
pub extern "C" fn init(
    width: i32,
    height: i32,
    use_embedded_fonts: bool,
) -> Box<EmscriptenApplication> {
    EmscriptenApplication::new(
        width,
        height,
        cg::runtime::scene::RendererOptions { use_embedded_fonts },
    )
}

#[no_mangle]
/// js::_tick
pub unsafe extern "C" fn tick(app: *mut EmscriptenApplication, time: f64) {
    if let Some(app) = app.as_mut() {
        app.tick(time);
    }
}

#[no_mangle]
/// js::_resize_surface
pub unsafe extern "C" fn resize_surface(app: *mut EmscriptenApplication, width: i32, height: i32) {
    if let Some(app) = app.as_mut() {
        app.resize(width as u32, height as u32);
    }
}

#[no_mangle]
/// js::_redraw
pub unsafe extern "C" fn redraw(app: *mut EmscriptenApplication) {
    if let Some(app) = app.as_mut() {
        app.redraw();
    }
}

#[no_mangle]
/// js::_load_scene_json
pub unsafe extern "C" fn load_scene_json(
    app: *mut EmscriptenApplication,
    ptr: *const u8,
    len: usize,
) {
    if let Some(app) = app.as_mut() {
        let json = __str_from_ptr_len(ptr, len);
        if let Some(json) = json {
            app.load_scene_json(&json);
        }
    }
}

#[no_mangle]
/// js::_pointer_move
pub unsafe extern "C" fn pointer_move(app: *mut EmscriptenApplication, x: f32, y: f32) {
    if let Some(app) = app.as_mut() {
        app.pointer_move(x, y);
    }
}

#[no_mangle]
/// js::_command
pub unsafe extern "C" fn command(app: *mut EmscriptenApplication, id: u32, a: f32, b: f32) {
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

#[no_mangle]
/// js::_set_main_camera_transform
pub unsafe extern "C" fn set_main_camera_transform(
    app: *mut EmscriptenApplication,
    a: f32,
    c: f32,
    e: f32,
    b: f32,
    d: f32,
    f: f32,
) {
    use math2::transform::AffineTransform;
    if let Some(app) = app.as_mut() {
        app.set_main_camera_transform(AffineTransform::from_acebdf(a, c, e, b, d, f));
    }
}

// #endregion: main app lifecycle

// ====================================================================================================
// #region: image management
// ====================================================================================================

#[derive(Serialize)]
pub struct CreateImageResourceResult {
    pub hash: String,
    pub url: String,
    pub width: u32,
    pub height: u32,
    #[serde(rename = "type")]
    pub r#type: String,
}

#[no_mangle]
/// js::_add_image
pub unsafe extern "C" fn add_image(
    app: *mut EmscriptenApplication,
    data_ptr: *const u8,
    data_len: usize,
) -> *const u8 {
    if let Some(app) = app.as_mut() {
        let data = std::slice::from_raw_parts(data_ptr, data_len);
        let (hash, url, width, height, r#type) = app.add_image(data);
        let result = CreateImageResourceResult {
            hash,
            url,
            width,
            height,
            r#type,
        };
        if let Ok(json) = serde_json::to_string(&result) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_get_image_bytes
pub unsafe extern "C" fn get_image_bytes(
    app: *mut EmscriptenApplication,
    id_ptr: *const u8,
    id_len: usize,
) -> *const u8 {
    if let (Some(app), Some(id)) = (app.as_mut(), __str_from_ptr_len(id_ptr, id_len)) {
        if let Some(bytes) = app.get_image_bytes(&id) {
            let len = bytes.len();
            let out = allocate(len + 4) as *mut u8;
            let len_bytes = (len as u32).to_le_bytes();
            std::ptr::copy_nonoverlapping(len_bytes.as_ptr(), out, 4);
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), out.add(4), len);
            return out;
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_get_image_size
pub unsafe extern "C" fn get_image_size(
    app: *mut EmscriptenApplication,
    id_ptr: *const u8,
    id_len: usize,
) -> *const u32 {
    if let (Some(app), Some(id)) = (app.as_mut(), __str_from_ptr_len(id_ptr, id_len)) {
        if let Some((w, h)) = app.get_image_size(&id) {
            let out = allocate(std::mem::size_of::<u32>() * 2) as *mut u32;
            std::ptr::write(out, w);
            std::ptr::write(out.add(1), h);
            return out;
        }
    }
    std::ptr::null()
}

// #endregion

// ====================================================================================================
// #region: font management & text style api
// ====================================================================================================

#[derive(Serialize)]
pub struct FontKey {
    /// CSS font-family name.
    pub family: String,
    // In the future, additional properties will precisely describe the font to enable
    // partial fetching and more accurate identification.
}

#[no_mangle]
/// js::_add_font
pub unsafe extern "C" fn add_font(
    app: *mut EmscriptenApplication,
    family_ptr: *const u8,
    family_len: usize,
    data_ptr: *const u8,
    data_len: usize,
) {
    if let Some(app) = app.as_mut() {
        if let Some(family) = __str_from_ptr_len(family_ptr, family_len) {
            let data = std::slice::from_raw_parts(data_ptr, data_len);
            app.add_font(&family, data);
        }
    }
}

#[no_mangle]
/// js::_has_missing_fonts
pub unsafe extern "C" fn has_missing_fonts(app: *mut EmscriptenApplication) -> bool {
    if let Some(app) = app.as_ref() {
        app.has_missing_fonts()
    } else {
        false
    }
}

#[no_mangle]
/// js::_list_missing_fonts
pub unsafe extern "C" fn list_missing_fonts(app: *mut EmscriptenApplication) -> *const u8 {
    use serde_json;
    use std::ffi::CString;

    if let Some(app) = app.as_ref() {
        let fonts = app
            .list_missing_fonts()
            .into_iter()
            .map(|family| FontKey { family })
            .collect::<Vec<FontKey>>();
        if let Ok(json) = serde_json::to_string(&fonts) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_list_available_fonts
pub unsafe extern "C" fn list_available_fonts(app: *mut EmscriptenApplication) -> *const u8 {
    use serde_json;
    use std::ffi::CString;

    if let Some(app) = app.as_ref() {
        let fonts = app
            .list_available_fonts()
            .into_iter()
            .map(|family| FontKey { family })
            .collect::<Vec<FontKey>>();
        if let Ok(json) = serde_json::to_string(&fonts) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_set_default_fallback_fonts
pub unsafe extern "C" fn set_default_fallback_fonts(
    app: *mut EmscriptenApplication,
    ptr: *const u8,
    len: usize,
) {
    use serde_json;
    if let Some(app) = app.as_mut() {
        if let Some(json) = __str_from_ptr_len(ptr, len) {
            if let Ok(fonts) = serde_json::from_str::<Vec<String>>(&json) {
                app.set_default_fallback_fonts(fonts);
            }
        }
    }
}

#[no_mangle]
/// js::_get_default_fallback_fonts
pub unsafe extern "C" fn get_default_fallback_fonts(app: *mut EmscriptenApplication) -> *const u8 {
    use serde_json;
    use std::ffi::CString;

    if let Some(app) = app.as_ref() {
        let fonts = app.get_default_fallback_fonts();
        if let Ok(json) = serde_json::to_string(&fonts) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }
    std::ptr::null()
}

// #endregion

// ====================================================================================================
// #region: hit testing & geometry
// ====================================================================================================

#[no_mangle]
/// js::_get_node_id_from_point
pub unsafe extern "C" fn get_node_id_from_point(
    app: *mut EmscriptenApplication,
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

#[no_mangle]
/// js::_get_node_ids_from_point
pub unsafe extern "C" fn get_node_ids_from_point(
    app: *mut EmscriptenApplication,
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

#[no_mangle]
/// js::_get_node_ids_from_envelope
pub unsafe extern "C" fn get_node_ids_from_envelope(
    app: *mut EmscriptenApplication,
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

#[no_mangle]
/// js::_get_node_absolute_bounding_box
pub unsafe extern "C" fn get_node_absolute_bounding_box(
    app: *mut EmscriptenApplication,
    ptr: *const u8,
    len: usize,
) -> *const f32 {
    if let Some(app) = app.as_mut() {
        let id = __str_from_ptr_len(ptr, len);
        if let Some(id) = id {
            if let Some(rect) = app.get_node_absolute_bounding_box(&id) {
                let vec4 = rect.to_vec4(); // [f32; 4]
                let out = allocate(std::mem::size_of::<f32>() * 4) as *mut f32;
                std::ptr::copy_nonoverlapping(vec4.as_ptr(), out, 4);
                return out;
            }
        }
    }
    std::ptr::null()
}

// #endregion

// ====================================================================================================
// #region: export api
// ====================================================================================================

#[no_mangle]
/// js::_export_node_as
pub unsafe extern "C" fn export_node_as(
    app: *mut EmscriptenApplication,
    id_ptr: *const u8,
    id_len: usize,
    fmt_ptr: *const u8,
    fmt_len: usize,
) -> *const u8 {
    use cg::export::ExportAs;

    let (Some(app), Some(id), Some(fmt_str)) = (
        app.as_mut(),
        __str_from_ptr_len(id_ptr, id_len),
        __str_from_ptr_len(fmt_ptr, fmt_len),
    ) else {
        return std::ptr::null();
    };

    let fmt = serde_json::from_str(&fmt_str).unwrap_or(ExportAs::png());

    if let Some(exported) = app.export_node_as(&id, fmt) {
        let data = exported.data();
        let data_len = data.len();

        // Allocate memory for: [4 bytes for length] + [actual data]
        let total_size = 4 + data_len;
        let out = allocate(total_size) as *mut u8;

        // Write the length as first 4 bytes (little-endian u32)
        let len_bytes = (data_len as u32).to_le_bytes();
        std::ptr::copy_nonoverlapping(len_bytes.as_ptr(), out, 4);

        // Write the actual data after the length
        std::ptr::copy_nonoverlapping(data.as_ptr(), out.add(4), data_len);

        return out;
    }

    std::ptr::null()
}

#[no_mangle]
/// js::_to_vector_network
pub unsafe extern "C" fn to_vector_network(
    app: *mut EmscriptenApplication,
    id_ptr: *const u8,
    id_len: usize,
) -> *const u8 {
    use serde_json;
    use std::ffi::CString;

    let (Some(app), Some(id)) = (app.as_mut(), __str_from_ptr_len(id_ptr, id_len)) else {
        return std::ptr::null();
    };

    if let Some(vn) = app.to_vector_network(&id) {
        if let Ok(json) = serde_json::to_string(&vn) {
            if let Ok(cstr) = CString::new(json) {
                return cstr.into_raw() as *const u8;
            }
        }
    }

    std::ptr::null()
}

// #endregion: export api

// ====================================================================================================
// #region: devtools
// ====================================================================================================

#[no_mangle]
/// js::_set_debug
pub unsafe extern "C" fn set_debug(app: *mut EmscriptenApplication, debug: bool) {
    if let Some(app) = app.as_mut() {
        app.set_debug(debug);
    }
}

#[no_mangle]
/// js::_toggle_debug
pub unsafe extern "C" fn toggle_debug(app: *mut EmscriptenApplication) {
    if let Some(app) = app.as_mut() {
        app.toggle_debug();
    }
}

#[no_mangle]
/// js::_set_verbose
pub unsafe extern "C" fn set_verbose(app: *mut EmscriptenApplication, verbose: bool) {
    if let Some(app) = app.as_mut() {
        app.set_verbose(verbose);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_ruler
pub unsafe extern "C" fn devtools_rendering_set_show_ruler(
    app: *mut EmscriptenApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_ruler(show);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_tiles
pub unsafe extern "C" fn devtools_rendering_set_show_tiles(
    app: *mut EmscriptenApplication,
    enabled: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_tiles(enabled);
    }
}

#[no_mangle]
/// js::_runtime_renderer_set_cache_tile
pub unsafe extern "C" fn runtime_renderer_set_cache_tile(
    app: *mut EmscriptenApplication,
    enabled: bool,
) {
    if let Some(app) = app.as_mut() {
        app.runtime_renderer_set_cache_tile(enabled);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_fps_meter
pub unsafe extern "C" fn devtools_rendering_set_show_fps_meter(
    app: *mut EmscriptenApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_fps_meter(show);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_stats
pub unsafe extern "C" fn devtools_rendering_set_show_stats(
    app: *mut EmscriptenApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_stats(show);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_hit_testing
pub unsafe extern "C" fn devtools_rendering_set_show_hit_testing(
    app: *mut EmscriptenApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_hit_testing(show);
    }
}

// #endregion: devtools

// ====================================================================================================
// #region: surface api
// ====================================================================================================

#[no_mangle]
/// js::_highlight_strokes
pub unsafe extern "C" fn highlight_strokes(
    app: *mut EmscriptenApplication,
    ptr: *const u8,
    len: usize,
) {
    use serde::Deserialize;
    use serde_json;
    #[derive(Deserialize)]
    struct JsStyle {
        #[serde(rename = "strokeWidth")]
        stroke_width: Option<f32>,
        stroke: Option<String>,
    }
    #[derive(Deserialize)]
    struct JsArgs {
        nodes: Vec<String>,
        #[serde(default)]
        style: Option<JsStyle>,
    }

    if let Some(app) = app.as_mut() {
        if let Some(json) = __str_from_ptr_len(ptr, len) {
            if let Ok(args) = serde_json::from_str::<JsArgs>(&json) {
                let style = args.style.map(|s| {
                    let mut st = cg::devtools::stroke_overlay::StrokeOverlayStyle::default();
                    if let Some(w) = s.stroke_width {
                        st.stroke_width = w;
                    }
                    if let Some(color) = s.stroke {
                        let rgba = math2::hex_to_rgba8888(&color);
                        st.stroke = cg::cg::CGColor(rgba.r, rgba.g, rgba.b, (rgba.a * 255.0) as u8);
                    }
                    st
                });
                app.highlight_strokes(args.nodes, style);
            }
        }
    }
}

// #endregion: surface api

// ====================================================================================================
// #region: testing / mock / dummy
// ====================================================================================================

#[no_mangle]
/// js::_load_dummy_scene
pub unsafe extern "C" fn load_dummy_scene(app: *mut EmscriptenApplication) {
    if let Some(app) = app.as_mut() {
        app.load_dummy_scene();
    }
}

#[no_mangle]
/// js::_load_benchmark_scene
pub unsafe extern "C" fn load_benchmark_scene(
    app: *mut EmscriptenApplication,
    cols: u32,
    rows: u32,
) {
    if let Some(app) = app.as_mut() {
        app.load_benchmark_scene(cols, rows);
    }
}

// #endregion
