//! The windowed shell (feature `shell`) — `crates/grida_editor/docs/shell.md`,
//! minimal M2 shape: one window, a full-window canvas view, no panels
//! yet.
//!
//! Per `ARCH-4` / `SHELL-3` the shell owns no editing capability: it
//! opens a document, hosts the render surface, translates window input
//! into surface events and [`ApplicationCommands`], and binds a few
//! keys — every edit flows through [`crate::editor::Editor`] and the
//! shared [`crate::bridge`], exactly like the headless slice tests.
//!
//! Bindings: click-select + drag-translate on the canvas; scroll /
//! pinch / primary+scroll to pan and zoom; primary+Z / primary+shift+Z
//! undo/redo; primary+C / primary+V copy/paste through the system
//! clipboard (IO-5); primary+S save; primary+= / primary+- zoom; Esc
//! deselects. The window title shows the history depth (plus " ⇅"
//! while a sync session is active).
//!
//! Flags: `--open <path>` (or a bare path) opens a document;
//! `--listen <port>` makes this instance the sync authority;
//! `--join <addr>` joins one (`docs/wg/feat-crdt/sync.md`).
//!
//! [`ApplicationCommands`]: grida::window::command::ApplicationCommand

mod app;
mod egui_panels;
mod menubar;
mod session;
mod window;

use std::collections::HashMap;

use futures::channel::mpsc;
use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use grida::runtime::camera::Camera2D;
use grida::runtime::scene::{Backend, RendererOptions};
use grida::window::application::{HostEvent, UnknownTargetApplication};
use grida::window::state::AnySurfaceState;
use math2::transform::AffineTransform;

use crate::bridge;
use crate::document::{Id, WorkingCopy};
use crate::editor::Editor;

/// Fixed properties-strip width, logical px (`crates/grida_editor/docs/shell.md`
/// dev-mode quality bar: fixed panel widths).
const PANEL_WIDTH: f32 = 240.0;

/// Fixed hierarchy-strip (layers tree) width, logical px.
const HIER_WIDTH: f32 = 220.0;

/// Register the editor's embedded **Geist** family as egui's default
/// proportional/monospace font, so the chrome typography matches the
/// canvas (which renders in Geist too). The bytes are already compiled
/// into the binary (`grida::embedded_fonts`) — no new asset. Geist is
/// inserted at the *front* of each family list, keeping egui's bundled
/// Ubuntu/Noto/emoji fonts as fallbacks for glyphs Geist lacks (the
/// panels use `▸ ▾ ✕ °`).
fn install_egui_fonts(ctx: &egui::Context) {
    use std::sync::Arc;

    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "Geist".to_owned(),
        Arc::new(egui::FontData::from_static(
            grida::embedded_fonts::geist::BYTES,
        )),
    );
    fonts.font_data.insert(
        "Geist Mono".to_owned(),
        Arc::new(egui::FontData::from_static(
            grida::embedded_fonts::geistmono::BYTES,
        )),
    );
    if let Some(family) = fonts.families.get_mut(&egui::FontFamily::Proportional) {
        family.insert(0, "Geist".to_owned());
    }
    if let Some(family) = fonts.families.get_mut(&egui::FontFamily::Monospace) {
        family.insert(0, "Geist Mono".to_owned());
    }
    ctx.set_fonts(fonts);
}

/// Shell startup error.
#[derive(Debug)]
pub enum ShellError {
    /// The document could not be opened (read/decode).
    Open(crate::io::IoError),
    /// The sync listener/connection could not be established.
    Net(std::io::Error),
    /// The winit event loop failed.
    EventLoop(winit::error::EventLoopError),
}

impl std::fmt::Display for ShellError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ShellError::Open(e) => write!(f, "failed to open document: {e}"),
            ShellError::Net(e) => write!(f, "failed to start sync session: {e}"),
            ShellError::EventLoop(e) => write!(f, "event loop error: {e}"),
        }
    }
}

impl std::error::Error for ShellError {}

/// Shell startup options (argv surface).
#[derive(Debug, Default)]
pub struct ShellOptions {
    /// `--open <path>`: document to open (default: built-in demo).
    pub open: Option<String>,
    /// `--listen <port>`: host a sync session as the authority.
    pub listen: Option<u16>,
    /// `--join <addr>`: join a sync session (e.g. `127.0.0.1:7878`).
    pub join: Option<String>,
}

/// Open a document (or the built-in demo scene) and run the shell
/// window until closed.
pub fn run(path: Option<&str>) -> Result<(), ShellError> {
    run_with(ShellOptions {
        open: path.map(str::to_string),
        ..Default::default()
    })
}

/// [`run`] with the full option surface.
pub fn run_with(options: ShellOptions) -> Result<(), ShellError> {
    let (scene, id_map) = match &options.open {
        Some(path) => crate::io::open(std::path::Path::new(path)).map_err(ShellError::Open)?,
        None => demo_scene(),
    };

    let doc = WorkingCopy::from_scene(scene, id_map);
    let mut editor = Editor::new(doc);

    // Sync session (at most one role; --listen wins when both given).
    let sync_session = if let Some(port) = options.listen {
        Some(session::SyncSession::listen(port).map_err(ShellError::Net)?)
    } else if let Some(addr) = &options.join {
        Some(session::SyncSession::join(addr).map_err(ShellError::Net)?)
    } else {
        None
    };
    if let Some(session) = &sync_session {
        session.install_tap(&mut editor);
    }

    let width = 1080;
    let height = 720;
    let window::WindowInit {
        state,
        el,
        window,
        gl_surface,
        gl_context,
        scale_factor,
        glow_context,
    } = window::create_window("grida_editor", width, height);

    let proxy = el.create_proxy();
    let camera = Camera2D::new(Size {
        width: width as f32 * scale_factor as f32,
        height: height as f32 * scale_factor as f32,
    });

    let mut state = AnySurfaceState::from_gpu(state);
    let backend = state.backend();
    let redraw_cb: std::sync::Arc<dyn Fn()> = {
        let redraw_proxy = proxy.clone();
        std::sync::Arc::new(move || {
            let _ = redraw_proxy.send_event(HostEvent::RedrawRequest);
        })
    };

    let (_image_tx, image_rx) = mpsc::unbounded();
    let (_font_tx, font_rx) = mpsc::unbounded();
    let renderer_options = RendererOptions {
        use_embedded_fonts: true,
        ..Default::default()
    };
    let mut app = UnknownTargetApplication::new(
        state,
        backend,
        camera,
        144,
        image_rx,
        font_rx,
        Some(redraw_cb),
        renderer_options,
    );
    app.surface_overlay_config.dpr = scale_factor as f32;
    // The engine's built-in selection chrome stays OFF: the HUD
    // machine owns chrome and interaction (`crates/grida_editor/docs/hud.md`);
    // the engine surface keeps only the camera gestures and the
    // text-edit session (which paints its own caret/selection).
    app.surface_overlay_config.show_selection_handles = false;
    app.surface_overlay_config.show_size_meter = false;
    app.surface_mut().readonly = false;

    // Load the document into the renderer from the editor's working
    // copy — the same seam the headless slice tests use.
    bridge::flush(editor.document(), app.renderer_mut());
    editor.set_selection(Vec::new());

    // Clock ticks (frame pacing) — the tick rate aims above the target
    // FPS, same as the grida_dev host.
    std::thread::spawn(move || {
        loop {
            let _ = proxy.send_event(HostEvent::Tick);
            std::thread::sleep(std::time::Duration::from_millis(1000 / 240));
        }
    });

    // egui spike state. Built here (before `window` moves into the
    // struct) so `State::new` can read the window's display handle. The
    // painter takes the shared glow context by value.
    let egui_ctx = egui::Context::default();
    // Follow the editor's light theme (canvas + panels are light), not
    // egui's dark default.
    egui_ctx.set_visuals(egui::Visuals::light());
    // Match the chrome typography to the canvas: use the embedded Geist
    // family (already compiled into the binary) instead of egui's default
    // Ubuntu-Light.
    install_egui_fonts(&egui_ctx);
    let egui_winit = egui_winit::State::new(
        egui_ctx.clone(),
        egui::ViewportId::ROOT,
        &window,
        Some(scale_factor as f32),
        None,
        None,
    );
    let egui_painter = egui_glow::Painter::new(glow_context, "", None, false)
        .expect("failed to create egui_glow painter");

    let mut shell = app::ShellApp {
        editor,
        app,
        gl_surface,
        gl_context,
        window,
        egui_ctx,
        egui_winit,
        egui_painter,
        egui_panels: egui_panels::EguiPanels::new(),
        menu_open: None,
        last_frame_ms: 0.0,
        modifiers: winit::keyboard::ModifiersState::default(),
        hud: crate::hud::Hud::new(),
        interp: crate::interpret::Interpreter::new(),
        epoch: std::time::Instant::now(),
        hud_font: skia_safe::FontMgr::new()
            .legacy_make_typeface(None, skia_safe::FontStyle::default())
            .map(|tf| skia_safe::Font::new(tf, 11.0)),
        pan_active: false,
        exiting: false,
        tools: crate::tool::ToolMachine::new(),
        ruler: true,
        pixelgrid: true,
        ui_visible: true,
        title: String::new(),
        dpr: scale_factor as f32,
        doc_path: options.open.map(std::path::PathBuf::from),
        clipboard: arboard::Clipboard::new().ok(),
        session: sync_session,
        mode: crate::mode::EditMode::None,
        pen_key_held: false,
        pen_pending: false,
        hold: None,
        hand_sticky: false,
        hold_pan: false,
        opacity_taps: crate::keys::OpacityTaps::default(),
        platform: crate::keys::Platform::current(),
        menu_bar: None,
        menu_selection: Vec::new(),
        menu_dirty: true,
    };
    // Wire the renderer's GL backend only now, *after* `app` reached
    // its final address inside `shell`: `surface_mut_ptr()` is an
    // interior pointer into the application struct, so taking it
    // before the move above would hand the renderer a pointer into
    // the dead stack slot (the launch segfault this ordering fixes).
    // `shell` is only borrowed by `run_app` below — it never moves
    // again. (`app.resize()` re-derives the backend on every window
    // resize; this seeds the pre-first-resize frames.)
    let surface_ptr = shell.app.surface_mut_ptr();
    shell.app.set_renderer_backend(Backend::GL(surface_ptr));
    // Seed the HUD's ruler mirrors (RUL-8): visibility, and the L's
    // corner — the canvas viewport's top-left, so the strip regions
    // sit between the panels. The guides mirror follows at every
    // reflect.
    shell.hud.set_ruler(shell.ruler);
    let ruler_origin = shell.ruler_origin();
    shell.hud.set_ruler_origin(ruler_origin);
    shell.update_title();
    // Derive the canvas viewport (window minus the properties strip,
    // SHELL-2 spirit) before the initial fit.
    let physical_w = (width as f64 * scale_factor) as u32;
    let physical_h = (height as f64 * scale_factor) as u32;
    shell.apply_viewport(physical_w, physical_h);
    shell.app.renderer_mut().fit_camera_to_scene();
    shell.app.renderer_mut().queue_stable();

    el.run_app(&mut shell).map_err(ShellError::EventLoop)
}

/// A built-in demo document: a few rectangles to select, translate,
/// and undo against.
fn demo_scene() -> (Scene, HashMap<NodeId, Id>) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();

    let rects: [(f32, f32, f32, f32, CGColor); 3] = [
        (
            80.0,
            80.0,
            240.0,
            180.0,
            CGColor::from_rgba(230, 90, 70, 255),
        ),
        (
            400.0,
            160.0,
            200.0,
            200.0,
            CGColor::from_rgba(80, 150, 230, 255),
        ),
        (
            240.0,
            420.0,
            320.0,
            140.0,
            CGColor::from_rgba(120, 200, 120, 255),
        ),
    ];
    for (i, (x, y, w, h, color)) in rects.into_iter().enumerate() {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(x, y, 0.0);
        rect.size = Size {
            width: w,
            height: h,
        };
        rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(color))]);
        let iid = graph.append_child(Node::Rectangle(rect), Parent::Root);
        let stable = format!("rect{}", i + 1);
        graph.set_name(iid, stable.clone());
        id_map.insert(iid, stable);
    }

    // A text node so the egui spike's font-size write (bind::apply) is
    // exercisable — the factory default text is empty, so seed content.
    let mut text = nf.create_text_span_node();
    text.transform = AffineTransform::new(120.0, 300.0, 0.0);
    text.text = "egui spike — edit my font size".to_string();
    let tid = graph.append_child(Node::TextSpan(text), Parent::Root);
    graph.set_name(tid, "text1".to_string());
    id_map.insert(tid, "text1".to_string());

    let scene = Scene {
        name: "demo".to_string(),
        // The default solid background. Clearing it (the scene
        // panel's background control, properties.md PROP-9) reveals
        // the transparency grid beneath (transparency-grid.md TG-2).
        background_color: Some(CGColor::from_rgba(245, 245, 245, 255)),
        graph,
    };
    (scene, id_map)
}
