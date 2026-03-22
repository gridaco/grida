use crate::_internal::*;
use cg::window::application::ApplicationApi;
use cg::window::application::UnknownTargetApplication;
use serde::Serialize;
use std::boxed::Box;

fn alloc_len_prefixed(bytes: &[u8]) -> *const u8 {
    let Ok(len_u32) = u32::try_from(bytes.len()) else {
        return std::ptr::null();
    };
    let total = 4 + bytes.len();
    let out = allocate(total) as *mut u8;
    let len_bytes = len_u32.to_le_bytes();
    unsafe {
        std::ptr::copy_nonoverlapping(len_bytes.as_ptr(), out, 4);
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out.add(4), bytes.len());
    }
    out
}

// ====================================================================================================
// #region: main app lifecycle
// ====================================================================================================

const BACKEND_WEBGL: u32 = 0;
const BACKEND_RASTER: u32 = 1;

#[no_mangle]
/// js::_init
pub extern "C" fn init(
    width: i32,
    height: i32,
    use_embedded_fonts: bool,
) -> Box<UnknownTargetApplication> {
    init_with_backend(BACKEND_WEBGL, width, height, use_embedded_fonts)
}

#[no_mangle]
/// js::_init_with_backend
///
/// backend_id:
/// - 0 (`BACKEND_WEBGL`): webgl (emscripten/webgl2)
/// - 1 (`BACKEND_RASTER`): raster (cpu)
pub extern "C" fn init_with_backend(
    backend_id: u32,
    width: i32,
    height: i32,
    use_embedded_fonts: bool,
) -> Box<UnknownTargetApplication> {
    let options = cg::runtime::scene::RendererOptions { use_embedded_fonts };
    match backend_id {
        BACKEND_RASTER => UnknownTargetApplication::new_raster(width, height, options),
        _ => cg::window::application_emscripten::new_webgl_app(width, height, options),
    }
}

#[no_mangle]
/// js::_tick
pub unsafe extern "C" fn tick(app: *mut UnknownTargetApplication, time: f64) {
    if let Some(app) = app.as_mut() {
        app.tick(time);
    }
}

#[no_mangle]
/// js::_destroy
///
/// Release an application created by `_init(...)` / `_init_with_backend(...)`.
///
/// - Raster (headless) apps are freed immediately.
/// - WebGL apps are driven by an Emscripten RAF loop; `_destroy` first requests
///   the loop to stop, then the loop frees the application on its final tick.
pub unsafe extern "C" fn destroy(app: *mut UnknownTargetApplication) {
    let Some(app_ref) = app.as_mut() else {
        return;
    };

    if app_ref.auto_tick() {
        app_ref.request_stop();
        return;
    }

    drop(Box::from_raw(app));
}

#[no_mangle]
/// js::_resize_surface
pub unsafe extern "C" fn resize_surface(
    app: *mut UnknownTargetApplication,
    width: i32,
    height: i32,
) {
    if let Some(app) = app.as_mut() {
        app.resize(width as u32, height as u32);
    }
}

#[no_mangle]
/// js::_redraw
pub unsafe extern "C" fn redraw(app: *mut UnknownTargetApplication) {
    if let Some(app) = app.as_mut() {
        app.redraw();
    }
}

#[no_mangle]
/// js::_load_scene_grida1
pub unsafe extern "C" fn load_scene_grida1(
    app: *mut UnknownTargetApplication,
    ptr: *const u8,
    len: usize,
) {
    if let Some(app) = app.as_mut() {
        let json = __str_from_ptr_len(ptr, len);
        if let Some(json) = json {
            app.load_scene_grida1(&json);
        }
    }
}

#[no_mangle]
/// js::_load_scene_grida
pub unsafe extern "C" fn load_scene_grida(
    app: *mut UnknownTargetApplication,
    ptr: *const u8,
    len: usize,
) {
    if let Some(app) = app.as_mut() {
        if !ptr.is_null() && len > 0 {
            let bytes = std::slice::from_raw_parts(ptr, len);
            app.load_scene_grida(bytes);
        }
    }
}

#[no_mangle]
/// js::_switch_scene
pub unsafe extern "C" fn switch_scene(
    app: *mut UnknownTargetApplication,
    ptr: *const u8,
    len: usize,
) {
    if let Some(app) = app.as_mut() {
        let scene_id = __str_from_ptr_len(ptr, len);
        if let Some(scene_id) = scene_id {
            app.switch_scene(&scene_id);
        }
    }
}

#[no_mangle]
/// js::_drain_missing_images
/// Returns a len-prefixed JSON array of missing image ref strings, or null if empty.
pub unsafe extern "C" fn drain_missing_images(
    app: *mut UnknownTargetApplication,
) -> *const u8 {
    if let Some(app) = app.as_mut() {
        let refs = app.drain_missing_images();
        if refs.is_empty() {
            return std::ptr::null();
        }
        if let Ok(json) = serde_json::to_string(&refs) {
            return alloc_len_prefixed(json.as_bytes());
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_resolve_image
/// Same as _add_image_with_rid but without return value, and queues a redraw.
/// Used by the lazy image loading system.
pub unsafe extern "C" fn resolve_image(
    app: *mut UnknownTargetApplication,
    rid_ptr: *const u8,
    rid_len: usize,
    bytes_ptr: *const u8,
    bytes_len: usize,
) {
    if let Some(app) = app.as_mut() {
        let rid = __str_from_ptr_len(rid_ptr, rid_len);
        if let Some(rid) = rid {
            if !bytes_ptr.is_null() && bytes_len > 0 {
                let bytes = std::slice::from_raw_parts(bytes_ptr, bytes_len);
                app.add_image_with_rid(bytes, &rid);
                app.request_redraw();
            }
        }
    }
}

#[no_mangle]
/// js::_apply_scene_transactions
pub unsafe extern "C" fn apply_scene_transactions(
    app: *mut UnknownTargetApplication,
    ptr: *const u8,
    len: usize,
) -> *const u8 {
    if let Some(app) = app.as_mut() {
        if let Some(json) = __str_from_ptr_len(ptr, len) {
            match app.apply_document_transactions_json(&json) {
                Ok(reports) => {
                    if let Ok(output) = serde_json::to_string(&reports) {
                        return alloc_len_prefixed(output.as_bytes());
                    }
                }
                Err(err) => {
                    eprintln!("failed to apply scene transactions: {}", err);
                }
            }
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_pointer_move
///
/// Legacy path — updates devtools hit test only, does NOT dispatch through
/// the surface event system. Use `surface_pointer_move` for full surface
/// interaction (hover, cursor icon).
pub unsafe extern "C" fn pointer_move(app: *mut UnknownTargetApplication, x: f32, y: f32) {
    if let Some(app) = app.as_mut() {
        app.pointer_move(x, y);
    }
}

// ====================================================================================================
// #region: surface interaction
// ====================================================================================================

/// Pack a `SurfaceResponse` into a u32 bitmask for cheap cross-boundary return.
///
/// bit 0 = needs_redraw
/// bit 1 = cursor_changed
/// bit 2 = selection_changed
/// bit 3 = hover_changed
fn pack_surface_response(r: &cg::surface::SurfaceResponse) -> u32 {
    (r.needs_redraw as u32)
        | ((r.cursor_changed as u32) << 1)
        | ((r.selection_changed as u32) << 2)
        | ((r.hover_changed as u32) << 3)
}

/// Decode a modifiers bitmask from JS.
///
/// bit 0 = shift, bit 1 = alt, bit 2 = ctrl_or_cmd
fn decode_modifiers(bits: u32) -> cg::surface::Modifiers {
    cg::surface::Modifiers {
        shift: bits & 1 != 0,
        alt: bits & 2 != 0,
        ctrl_or_cmd: bits & 4 != 0,
    }
}

/// Decode a pointer button from JS.
///
/// 0 = Primary, 1 = Secondary, 2 = Middle
fn decode_button(id: u32) -> cg::surface::PointerButton {
    match id {
        1 => cg::surface::PointerButton::Secondary,
        2 => cg::surface::PointerButton::Middle,
        _ => cg::surface::PointerButton::Primary,
    }
}

#[no_mangle]
/// js::_surface_pointer_move
///
/// Dispatches a pointer-move through the surface event system (hover, cursor).
/// Returns packed `SurfaceResponse` flags as u32.
pub unsafe extern "C" fn surface_pointer_move(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
) -> u32 {
    match app.as_mut() {
        Some(app) => pack_surface_response(&app.surface_pointer_move(x, y)),
        None => 0,
    }
}

#[no_mangle]
/// js::_surface_pointer_down
///
/// `button`: 0=Primary, 1=Secondary, 2=Middle
/// `modifiers`: bitmask (bit0=shift, bit1=alt, bit2=ctrl_or_cmd)
/// Returns packed `SurfaceResponse` flags as u32.
pub unsafe extern "C" fn surface_pointer_down(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
    button: u32,
    modifiers: u32,
) -> u32 {
    match app.as_mut() {
        Some(app) => pack_surface_response(&app.surface_pointer_down(
            x,
            y,
            decode_button(button),
            decode_modifiers(modifiers),
        )),
        None => 0,
    }
}

#[no_mangle]
/// js::_surface_pointer_up
///
/// `button`: 0=Primary, 1=Secondary, 2=Middle
/// `modifiers`: bitmask (bit0=shift, bit1=alt, bit2=ctrl_or_cmd)
/// Returns packed `SurfaceResponse` flags as u32.
pub unsafe extern "C" fn surface_pointer_up(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
    button: u32,
    modifiers: u32,
) -> u32 {
    match app.as_mut() {
        Some(app) => pack_surface_response(&app.surface_pointer_up(
            x,
            y,
            decode_button(button),
            decode_modifiers(modifiers),
        )),
        None => 0,
    }
}

#[no_mangle]
/// js::_surface_get_cursor
///
/// Returns the current cursor icon as u32:
/// 0=Default, 1=Pointer, 2=Grab, 3=Grabbing, 4=Crosshair, 5=Move
pub unsafe extern "C" fn surface_get_cursor(app: *const UnknownTargetApplication) -> u32 {
    match app.as_ref() {
        Some(app) => match app.surface_cursor() {
            cg::surface::CursorIcon::Default => 0,
            cg::surface::CursorIcon::Pointer => 1,
            cg::surface::CursorIcon::Grab => 2,
            cg::surface::CursorIcon::Grabbing => 3,
            cg::surface::CursorIcon::Crosshair => 4,
            cg::surface::CursorIcon::Move => 5,
        },
        None => 0,
    }
}

#[no_mangle]
/// js::_surface_get_hovered_node
///
/// Returns a length-prefixed JSON string of the hovered node ID, or null.
pub unsafe extern "C" fn surface_get_hovered_node(
    app: *const UnknownTargetApplication,
) -> *const u8 {
    match app.as_ref() {
        Some(app) => match app.surface_hovered_node() {
            Some(id) => {
                // Convert internal NodeId to user-facing string ID
                match app.internal_id_to_user(*id) {
                    Some(user_id) => {
                        let json = serde_json::to_vec(&user_id).unwrap_or_default();
                        alloc_len_prefixed(&json)
                    }
                    None => std::ptr::null(),
                }
            }
            None => std::ptr::null(),
        },
        None => std::ptr::null(),
    }
}

#[no_mangle]
/// js::_surface_get_selected_nodes
///
/// Returns a length-prefixed JSON string of the selected node IDs (as user-facing strings).
pub unsafe extern "C" fn surface_get_selected_nodes(
    app: *const UnknownTargetApplication,
) -> *const u8 {
    match app.as_ref() {
        Some(app) => {
            let internal_ids = app.surface_selected_nodes();
            let user_ids = app.internal_ids_to_user(internal_ids.to_vec());
            let json = serde_json::to_vec(&user_ids).unwrap_or_default();
            alloc_len_prefixed(&json)
        }
        None => std::ptr::null(),
    }
}

#[no_mangle]
/// js::_surface_set_selection
///
/// Restore selection from a JSON array of node IDs (e.g. for undo/redo).
pub unsafe extern "C" fn surface_set_selection(
    app: *mut UnknownTargetApplication,
    json_ptr: *const u8,
    json_len: u32,
) {
    let Some(app) = app.as_mut() else { return };
    let slice = std::slice::from_raw_parts(json_ptr, json_len as usize);
    // JS sends user-facing string IDs — convert to internal NodeId
    if let Ok(user_ids) = serde_json::from_slice::<Vec<String>>(slice) {
        let internal_ids: Vec<cg::node::schema::NodeId> = user_ids
            .iter()
            .filter_map(|uid| app.user_id_to_internal(uid))
            .collect();
        app.surface_set_selection(internal_ids);
    }
}

#[no_mangle]
/// js::_set_surface_overlay_config
///
/// Configure surface overlay rendering from JSON.
/// Fields: { dpr, text_baseline_decoration, show_size_meter, show_frame_titles }
pub unsafe extern "C" fn set_surface_overlay_config(
    app: *mut UnknownTargetApplication,
    json_ptr: *const u8,
    json_len: u32,
) {
    let Some(app) = app.as_mut() else { return };
    let slice = std::slice::from_raw_parts(json_ptr, json_len as usize);

    #[derive(serde::Deserialize)]
    struct Config {
        #[serde(default = "default_dpr")]
        dpr: f32,
        #[serde(default)]
        text_baseline_decoration: bool,
        #[serde(default)]
        show_size_meter: bool,
        #[serde(default)]
        show_frame_titles: bool,
    }
    fn default_dpr() -> f32 {
        1.0
    }

    if let Ok(cfg) = serde_json::from_slice::<Config>(slice) {
        app.surface_overlay_config = cg::devtools::surface_overlay::SurfaceOverlayConfig {
            dpr: cfg.dpr,
            text_baseline_decoration: cfg.text_baseline_decoration,
            show_size_meter: cfg.show_size_meter,
            show_frame_titles: cfg.show_frame_titles,
        };
    }
}

// #endregion: surface interaction

#[no_mangle]
/// js::_command
pub unsafe extern "C" fn command(app: *mut UnknownTargetApplication, id: u32, a: f32, b: f32) {
    use cg::window::command::ApplicationCommand;
    if let Some(app) = app.as_mut() {
        let cmd = match id {
            1 => ApplicationCommand::ZoomIn,
            2 => ApplicationCommand::ZoomOut,
            3 => ApplicationCommand::ZoomDelta { delta: a },
            4 => ApplicationCommand::Pan { tx: a, ty: b },
            5 => ApplicationCommand::SelectAll,
            6 => ApplicationCommand::DeselectAll,
            _ => ApplicationCommand::None,
        };
        app.command(cmd);
    }
}

#[no_mangle]
/// js::_set_main_camera_transform
pub unsafe extern "C" fn set_main_camera_transform(
    app: *mut UnknownTargetApplication,
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
    app: *mut UnknownTargetApplication,
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
            return alloc_len_prefixed(json.as_bytes());
        }
    }
    std::ptr::null()
}

#[derive(Serialize)]
pub struct AddImageWithRidResult {
    pub width: u32,
    pub height: u32,
    #[serde(rename = "type")]
    pub r#type: String,
}

#[no_mangle]
/// js::_add_image_with_rid
pub unsafe extern "C" fn add_image_with_rid(
    app: *mut UnknownTargetApplication,
    data_ptr: *const u8,
    data_len: usize,
    rid_ptr: *const u8,
    rid_len: usize,
) -> *const u8 {
    if let (Some(app), Some(rid)) = (
        app.as_mut(),
        __str_from_ptr_len(rid_ptr, rid_len),
    ) {
        let data = std::slice::from_raw_parts(data_ptr, data_len);
        if let Some((width, height, r#type)) = app.add_image_with_rid(data, &rid) {
            let result = AddImageWithRidResult {
                width,
                height,
                r#type,
            };
            if let Ok(json) = serde_json::to_string(&result) {
                return alloc_len_prefixed(json.as_bytes());
            }
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_get_image_bytes
pub unsafe extern "C" fn get_image_bytes(
    app: *mut UnknownTargetApplication,
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
    app: *mut UnknownTargetApplication,
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
/// js::_add_font - Register font bytes. Multiple calls with the same family
/// and different font files are supported (e.g. Regular, Bold, Italic per family).
pub unsafe extern "C" fn add_font(
    app: *mut UnknownTargetApplication,
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
pub unsafe extern "C" fn has_missing_fonts(app: *mut UnknownTargetApplication) -> bool {
    if let Some(app) = app.as_ref() {
        app.has_missing_fonts()
    } else {
        false
    }
}

#[no_mangle]
/// js::_list_missing_fonts
pub unsafe extern "C" fn list_missing_fonts(app: *mut UnknownTargetApplication) -> *const u8 {
    use serde_json;

    if let Some(app) = app.as_ref() {
        let fonts = app
            .list_missing_fonts()
            .into_iter()
            .map(|family| FontKey { family })
            .collect::<Vec<FontKey>>();
        if let Ok(json) = serde_json::to_string(&fonts) {
            return alloc_len_prefixed(json.as_bytes());
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_list_available_fonts
pub unsafe extern "C" fn list_available_fonts(app: *mut UnknownTargetApplication) -> *const u8 {
    use serde_json;

    if let Some(app) = app.as_ref() {
        let fonts = app
            .list_available_fonts()
            .into_iter()
            .map(|family| FontKey { family })
            .collect::<Vec<FontKey>>();
        if let Ok(json) = serde_json::to_string(&fonts) {
            return alloc_len_prefixed(json.as_bytes());
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_set_default_fallback_fonts
pub unsafe extern "C" fn set_default_fallback_fonts(
    app: *mut UnknownTargetApplication,
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
pub unsafe extern "C" fn get_default_fallback_fonts(
    app: *mut UnknownTargetApplication,
) -> *const u8 {
    use serde_json;

    if let Some(app) = app.as_ref() {
        let fonts = app.get_default_fallback_fonts();
        if let Ok(json) = serde_json::to_string(&fonts) {
            return alloc_len_prefixed(json.as_bytes());
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
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
) -> *const u8 {
    if let Some(app) = app.as_mut() {
        if let Some(s) = app.get_node_id_from_point([x, y]) {
            return alloc_len_prefixed(s.as_bytes());
        }
    }
    std::ptr::null()
}

#[no_mangle]
/// js::_get_node_ids_from_point
pub unsafe extern "C" fn get_node_ids_from_point(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
) -> *const u8 {
    use serde_json;

    if let Some(app) = app.as_mut() {
        let ids = app.get_node_ids_from_point([x, y]);
        if let Ok(json) = serde_json::to_string(&ids) {
            return alloc_len_prefixed(json.as_bytes());
        }
    }

    std::ptr::null()
}

#[no_mangle]
/// js::_get_node_ids_from_envelope
pub unsafe extern "C" fn get_node_ids_from_envelope(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> *const u8 {
    use math2::rect::Rectangle;
    use serde_json;

    if let Some(app) = app.as_mut() {
        let ids = app.get_node_ids_from_envelope(Rectangle::from_xywh(x, y, w, h));
        if let Ok(json) = serde_json::to_string(&ids) {
            return alloc_len_prefixed(json.as_bytes());
        }
    }

    std::ptr::null()
}

#[no_mangle]
/// js::_get_node_absolute_bounding_box
pub unsafe extern "C" fn get_node_absolute_bounding_box(
    app: *mut UnknownTargetApplication,
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
    app: *mut UnknownTargetApplication,
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
    app: *mut UnknownTargetApplication,
    id_ptr: *const u8,
    id_len: usize,
) -> *const u8 {
    use serde_json;

    let (Some(app), Some(id)) = (app.as_mut(), __str_from_ptr_len(id_ptr, id_len)) else {
        return std::ptr::null();
    };

    if let Some(result) = app.to_vector_network(&id) {
        if let Ok(json) = serde_json::to_string(&result) {
            return alloc_len_prefixed(json.as_bytes());
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
pub unsafe extern "C" fn set_debug(app: *mut UnknownTargetApplication, debug: bool) {
    if let Some(app) = app.as_mut() {
        app.set_debug(debug);
    }
}

#[no_mangle]
/// js::_toggle_debug
pub unsafe extern "C" fn toggle_debug(app: *mut UnknownTargetApplication) {
    if let Some(app) = app.as_mut() {
        app.toggle_debug();
    }
}

#[no_mangle]
/// js::_set_verbose
pub unsafe extern "C" fn set_verbose(app: *mut UnknownTargetApplication, verbose: bool) {
    if let Some(app) = app.as_mut() {
        app.set_verbose(verbose);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_ruler
pub unsafe extern "C" fn devtools_rendering_set_show_ruler(
    app: *mut UnknownTargetApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_ruler(show);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_tiles
pub unsafe extern "C" fn devtools_rendering_set_show_tiles(
    app: *mut UnknownTargetApplication,
    enabled: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_tiles(enabled);
    }
}

#[no_mangle]
/// js::_runtime_renderer_set_layer_compositing
pub unsafe extern "C" fn runtime_renderer_set_layer_compositing(
    app: *mut UnknownTargetApplication,
    enabled: bool,
) {
    if let Some(app) = app.as_mut() {
        app.runtime_renderer_set_layer_compositing(enabled);
    }
}

#[no_mangle]
/// js::_runtime_renderer_set_pixel_preview_scale
pub unsafe extern "C" fn runtime_renderer_set_pixel_preview_scale(
    app: *mut UnknownTargetApplication,
    scale: u32,
) {
    if let Some(app) = app.as_mut() {
        app.runtime_renderer_set_pixel_preview_scale((scale as u8).min(2));
    }
}

#[no_mangle]
/// js::_runtime_renderer_set_pixel_preview_stable
pub unsafe extern "C" fn runtime_renderer_set_pixel_preview_stable(
    app: *mut UnknownTargetApplication,
    stable: bool,
) {
    if let Some(app) = app.as_mut() {
        app.runtime_renderer_set_pixel_preview_stable(stable);
    }
}

#[no_mangle]
/// js::_runtime_renderer_set_render_policy_flags
pub unsafe extern "C" fn runtime_renderer_set_render_policy_flags(
    app: *mut UnknownTargetApplication,
    flags: u32,
) {
    if let Some(app) = app.as_mut() {
        app.runtime_renderer_set_render_policy_flags(flags);
    }
}

#[no_mangle]
/// js::_runtime_renderer_set_outline_mode
///
/// Back-compat shim: delegates to `runtime_renderer_set_render_policy_flags`.
pub unsafe extern "C" fn runtime_renderer_set_outline_mode(
    app: *mut UnknownTargetApplication,
    enable: bool,
) {
    use cg::runtime::render_policy::{
        RenderPolicy, RenderPolicyFlags, FLAG_RENDER_OUTLINES_ALWAYS,
    };
    if let Some(app) = app.as_mut() {
        let flags: RenderPolicyFlags = if enable {
            FLAG_RENDER_OUTLINES_ALWAYS
        } else {
            RenderPolicy::STANDARD.to_flags()
        };
        app.runtime_renderer_set_render_policy_flags(flags);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_fps_meter
pub unsafe extern "C" fn devtools_rendering_set_show_fps_meter(
    app: *mut UnknownTargetApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_fps_meter(show);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_stats
pub unsafe extern "C" fn devtools_rendering_set_show_stats(
    app: *mut UnknownTargetApplication,
    show: bool,
) {
    if let Some(app) = app.as_mut() {
        app.devtools_rendering_set_show_stats(show);
    }
}

#[no_mangle]
/// js::_devtools_rendering_set_show_hit_testing
pub unsafe extern "C" fn devtools_rendering_set_show_hit_testing(
    app: *mut UnknownTargetApplication,
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
    app: *mut UnknownTargetApplication,
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
                        st.stroke = cg::cg::CGColor::from_rgba(
                            rgba.r,
                            rgba.g,
                            rgba.b,
                            (rgba.a * 255.0) as u8,
                        );
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
pub unsafe extern "C" fn load_dummy_scene(app: *mut UnknownTargetApplication) {
    if let Some(app) = app.as_mut() {
        app.load_dummy_scene();
    }
}

#[no_mangle]
/// js::_load_benchmark_scene
pub unsafe extern "C" fn load_benchmark_scene(
    app: *mut UnknownTargetApplication,
    cols: u32,
    rows: u32,
) {
    if let Some(app) = app.as_mut() {
        app.load_benchmark_scene(cols, rows);
    }
}

// #endregion
