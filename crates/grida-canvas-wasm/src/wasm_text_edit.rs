//! WASM C ABI for text editing operations.
//!
//! Thin delegates to `UnknownTargetApplication` methods. All orchestration
//! logic (session creation, layout, decoration updates, frame queuing)
//! lives in `grida-canvas`'s Application — this file is purely the C ABI
//! boundary.

use crate::_internal::*;
use cg::text_edit_session::DEFAULT_CARET_WIDTH;
use cg::window::application::UnknownTargetApplication;
use serde::Deserialize;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn alloc_len_prefixed(bytes: &[u8]) -> *const u8 {
    let Ok(len_u32) = u32::try_from(bytes.len()) else {
        return std::ptr::null();
    };
    let total = 4 + bytes.len();
    let out = allocate(total);
    let len_bytes = len_u32.to_le_bytes();
    unsafe {
        std::ptr::copy_nonoverlapping(len_bytes.as_ptr(), out, 4);
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out.add(4), bytes.len());
    }
    out
}

/// Encode `f32` values as little-endian bytes (safe, no alignment concerns).
fn f32_slice_to_le_bytes(floats: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(floats.len() * 4);
    for &f in floats {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

use cg::text_edit_session::EditCommand;

/// JSON-serializable editing command from TS.
#[derive(Deserialize)]
#[serde(tag = "type")]
enum WasmEditCommand {
    Insert { text: String },
    Backspace,
    BackspaceWord,
    BackspaceLine,
    Delete,
    DeleteWord,
    DeleteLine,
    DeleteByCut,
    MoveLeft { extend: bool },
    MoveRight { extend: bool },
    MoveUp { extend: bool },
    MoveDown { extend: bool },
    MoveHome { extend: bool },
    MoveEnd { extend: bool },
    MoveDocStart { extend: bool },
    MoveDocEnd { extend: bool },
    MovePageUp { extend: bool },
    MovePageDown { extend: bool },
    MoveWordLeft { extend: bool },
    MoveWordRight { extend: bool },
    SelectAll,
    Undo,
    Redo,
}

fn wasm_cmd_to_editing(cmd: WasmEditCommand) -> Option<EditCommand> {
    Some(match cmd {
        WasmEditCommand::Insert { text } => EditCommand::Insert(text),
        WasmEditCommand::Backspace => EditCommand::Backspace,
        WasmEditCommand::BackspaceWord => EditCommand::BackspaceWord,
        WasmEditCommand::BackspaceLine => EditCommand::BackspaceLine,
        WasmEditCommand::Delete => EditCommand::Delete,
        WasmEditCommand::DeleteWord => EditCommand::DeleteWord,
        WasmEditCommand::DeleteLine => EditCommand::DeleteLine,
        WasmEditCommand::DeleteByCut => EditCommand::DeleteByCut,
        WasmEditCommand::MoveLeft { extend } => EditCommand::MoveLeft { extend },
        WasmEditCommand::MoveRight { extend } => EditCommand::MoveRight { extend },
        WasmEditCommand::MoveUp { extend } => EditCommand::MoveUp { extend },
        WasmEditCommand::MoveDown { extend } => EditCommand::MoveDown { extend },
        WasmEditCommand::MoveHome { extend } => EditCommand::MoveHome { extend },
        WasmEditCommand::MoveEnd { extend } => EditCommand::MoveEnd { extend },
        WasmEditCommand::MoveDocStart { extend } => EditCommand::MoveDocStart { extend },
        WasmEditCommand::MoveDocEnd { extend } => EditCommand::MoveDocEnd { extend },
        WasmEditCommand::MovePageUp { extend } => EditCommand::MovePageUp { extend },
        WasmEditCommand::MovePageDown { extend } => EditCommand::MovePageDown { extend },
        WasmEditCommand::MoveWordLeft { extend } => EditCommand::MoveWordLeft { extend },
        WasmEditCommand::MoveWordRight { extend } => EditCommand::MoveWordRight { extend },
        WasmEditCommand::SelectAll => EditCommand::SelectAll,
        WasmEditCommand::Undo | WasmEditCommand::Redo => return None,
    })
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/// Enter text editing mode for a node.
///
/// The Application reads all text properties directly from the scene node
/// to guarantee the editing layout matches the Painter exactly.
#[no_mangle]
pub unsafe extern "C" fn text_edit_enter(
    app: *mut UnknownTargetApplication,
    node_id_ptr: *const u8,
    node_id_len: usize,
) -> bool {
    let Some(app) = app.as_mut() else {
        return false;
    };
    let Some(node_id) = __str_from_ptr_len(node_id_ptr, node_id_len) else {
        return false;
    };
    app.text_edit_enter(&node_id)
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_exit(
    app: *mut UnknownTargetApplication,
    commit: bool,
) -> *const u8 {
    let Some(app) = app.as_mut() else {
        return std::ptr::null();
    };
    match app.text_edit_exit(commit) {
        Some(text) => alloc_len_prefixed(text.as_bytes()),
        None => std::ptr::null(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_is_active(app: *mut UnknownTargetApplication) -> bool {
    app.as_ref()
        .map(|a| a.text_edit_is_active())
        .unwrap_or(false)
}

/// Returns the current text of the active editing session.
///
/// Returns a length-prefixed UTF-8 string, or null if no session is active.
#[no_mangle]
pub unsafe extern "C" fn text_edit_get_text(app: *mut UnknownTargetApplication) -> *const u8 {
    let Some(app) = app.as_ref() else {
        return std::ptr::null();
    };
    match app.text_edit_get_text() {
        Some(text) => alloc_len_prefixed(text.as_bytes()),
        None => std::ptr::null(),
    }
}

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_command(
    app: *mut UnknownTargetApplication,
    json_ptr: *const u8,
    json_len: usize,
) {
    let Some(app) = app.as_mut() else { return };
    let Some(json) = __str_from_ptr_len(json_ptr, json_len) else {
        return;
    };

    let cmd: WasmEditCommand = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("text_edit_command: {e}");
            return;
        }
    };

    match cmd {
        WasmEditCommand::Undo => {
            app.text_edit_undo();
        }
        WasmEditCommand::Redo => {
            app.text_edit_redo();
        }
        other => {
            if let Some(c) = wasm_cmd_to_editing(other) {
                app.text_edit_command(c);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

/// Undo within the text editing session.
///
/// The session owns all undo during editing. Document-level undo is not
/// involved until the session exits.
#[no_mangle]
pub unsafe extern "C" fn text_edit_undo(app: *mut UnknownTargetApplication) -> bool {
    let Some(app) = app.as_mut() else {
        return false;
    };
    app.text_edit_undo()
}

/// Redo within the text editing session.
#[no_mangle]
pub unsafe extern "C" fn text_edit_redo(app: *mut UnknownTargetApplication) -> bool {
    let Some(app) = app.as_mut() else {
        return false;
    };
    app.text_edit_redo()
}

// ---------------------------------------------------------------------------
// Pointer events
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_pointer_down(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
    shift: bool,
    click_count: u32,
) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_pointer_down(x, y, shift, click_count);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_pointer_move(
    app: *mut UnknownTargetApplication,
    x: f32,
    y: f32,
) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_pointer_move(x, y);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_pointer_up(app: *mut UnknownTargetApplication) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_pointer_up();
}

// ---------------------------------------------------------------------------
// IME
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_ime_set_preedit(
    app: *mut UnknownTargetApplication,
    text_ptr: *const u8,
    text_len: usize,
) {
    let Some(app) = app.as_mut() else { return };
    let text = __str_from_ptr_len(text_ptr, text_len).unwrap_or_default();
    app.text_edit_ime_set_preedit(text);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_ime_commit(
    app: *mut UnknownTargetApplication,
    text_ptr: *const u8,
    text_len: usize,
) {
    let Some(app) = app.as_mut() else { return };
    let text = __str_from_ptr_len(text_ptr, text_len).unwrap_or_default();
    app.text_edit_ime_commit(&text);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_ime_cancel(app: *mut UnknownTargetApplication) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_ime_cancel();
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_get_selected_text(
    app: *mut UnknownTargetApplication,
) -> *const u8 {
    let Some(app) = app.as_ref() else {
        return std::ptr::null();
    };
    match app.text_edit_get_selected_text() {
        Some(text) => alloc_len_prefixed(text.as_bytes()),
        None => std::ptr::null(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_get_selected_html(
    app: *mut UnknownTargetApplication,
) -> *const u8 {
    let Some(app) = app.as_ref() else {
        return std::ptr::null();
    };
    match app.text_edit_get_selected_html() {
        Some(html) => alloc_len_prefixed(html.as_bytes()),
        None => std::ptr::null(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_paste_text(
    app: *mut UnknownTargetApplication,
    text_ptr: *const u8,
    text_len: usize,
) {
    let Some(app) = app.as_mut() else { return };
    let Some(text) = __str_from_ptr_len(text_ptr, text_len) else {
        return;
    };
    app.text_edit_paste_text(&text);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_paste_html(
    app: *mut UnknownTargetApplication,
    html_ptr: *const u8,
    html_len: usize,
) {
    let Some(app) = app.as_mut() else { return };
    let Some(html) = __str_from_ptr_len(html_ptr, html_len) else {
        return;
    };
    app.text_edit_paste_html(&html);
}

// ---------------------------------------------------------------------------
// Geometry queries
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_get_caret_rect(app: *mut UnknownTargetApplication) -> *const u8 {
    let Some(app) = app.as_mut() else {
        return std::ptr::null();
    };
    let Some(cr) = app.text_edit_get_caret_rect() else {
        return std::ptr::null();
    };
    let floats: [f32; 4] = [cr.x, cr.y, DEFAULT_CARET_WIDTH, cr.height];
    alloc_len_prefixed(&f32_slice_to_le_bytes(&floats))
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_get_selection_rects(
    app: *mut UnknownTargetApplication,
) -> *const u8 {
    let Some(app) = app.as_mut() else {
        return std::ptr::null();
    };
    let Some(rects) = app.text_edit_get_selection_rects() else {
        return std::ptr::null();
    };

    #[derive(serde::Serialize)]
    struct R {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
    }

    let json_rects: Vec<R> = rects
        .iter()
        .map(|r| R {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
        })
        .collect();

    match serde_json::to_string(&json_rects) {
        Ok(json) => alloc_len_prefixed(json.as_bytes()),
        Err(_) => std::ptr::null(),
    }
}

// ---------------------------------------------------------------------------
// Style commands
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_toggle_bold(app: *mut UnknownTargetApplication) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_toggle_bold();
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_toggle_italic(app: *mut UnknownTargetApplication) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_toggle_italic();
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_toggle_underline(app: *mut UnknownTargetApplication) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_toggle_underline();
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_toggle_strikethrough(app: *mut UnknownTargetApplication) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_toggle_strikethrough();
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_set_font_size(app: *mut UnknownTargetApplication, size: f32) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_set_font_size(size);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_set_font_family(
    app: *mut UnknownTargetApplication,
    family_ptr: *const u8,
    family_len: usize,
) {
    let Some(app) = app.as_mut() else { return };
    let Some(family) = __str_from_ptr_len(family_ptr, family_len) else {
        return;
    };
    app.text_edit_set_font_family(&family);
}

#[no_mangle]
pub unsafe extern "C" fn text_edit_set_color(
    app: *mut UnknownTargetApplication,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) {
    let Some(app) = app.as_mut() else { return };
    app.text_edit_set_color(r, g, b, a);
}

// ---------------------------------------------------------------------------
// Blink tick
// ---------------------------------------------------------------------------

#[no_mangle]
pub unsafe extern "C" fn text_edit_tick(app: *mut UnknownTargetApplication) -> bool {
    let Some(app) = app.as_mut() else {
        return false;
    };
    app.text_edit_tick()
}
