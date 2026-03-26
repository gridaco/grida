//! Rich-text editor prototype built directly on winit + Skia.
//!
//! This example is a thin windowing/rendering shell. All editing logic lives
//! in [`TextEditSession`] (in `src/text_edit_session.rs`).
//!
//! Rich text shortcuts:
//!   Cmd/Ctrl+B           toggle bold
//!   Cmd/Ctrl+I           toggle italic
//!   Cmd/Ctrl+U           toggle underline
//!   Cmd/Ctrl+Shift+X     toggle strikethrough
//!   Cmd/Ctrl+Shift+>     increase font size (+1 pt)
//!   Cmd/Ctrl+Shift+<     decrease font size (-1 pt)

#![allow(clippy::single_match)]

use std::ffi::CString;
use std::fs;
use std::num::NonZeroU32;
use std::time::Duration;

use cg::text_edit::time::Instant;

use arboard::Clipboard;
use gl::types::GLint;
use glutin::{
    config::{ConfigTemplateBuilder, GlConfig},
    context::{ContextApi, ContextAttributesBuilder, PossiblyCurrentContext},
    display::{GetGlDisplay, GlDisplay},
    prelude::{GlSurface, NotCurrentGlContext},
    surface::{Surface as GlutinSurface, SurfaceAttributesBuilder, WindowSurface},
};
use glutin_winit::DisplayBuilder;
#[allow(deprecated)]
use raw_window_handle::HasRawWindowHandle;
use skia_safe::{
    gpu::{
        self, backend_render_targets, gl::FramebufferInfo, surfaces::wrap_backend_render_target,
    },
    Color, ColorType, Paint, Point, Rect, Surface,
};
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalPosition, LogicalSize, PhysicalSize},
    event::{ElementState, Ime, MouseButton, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    keyboard::{Key, KeyCode, ModifiersState, NamedKey, PhysicalKey},
    window::{Window, WindowAttributes, WindowId},
};

use cg::cg::color::CGColor;
use cg::text_edit::{
    attributed_text::{AttributedText, TextStyle as AttrTextStyle},
    selection_rects::EmptyLineSelectionPolicy,
    session::{ClickTracker, KeyAction, KeyName, TextEditSession},
    EditingCommand, SkiaLayoutEngine, TextLayoutEngine,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_W: u32 = 800;
const WINDOW_H: u32 = 600;
const PADDING: f32 = 24.0;
const FONT_SIZE: f32 = 18.0;
const CURSOR_WIDTH: f32 = 1.0;

// ---------------------------------------------------------------------------
// GL + Skia surface helpers (purely windowing boilerplate)
// ---------------------------------------------------------------------------

struct GlSkiaSurface {
    gr_context: skia_safe::gpu::DirectContext,
    fb_info: FramebufferInfo,
    surface: Surface,
    gl_surface: GlutinSurface<WindowSurface>,
    gl_context: PossiblyCurrentContext,
    num_samples: usize,
    stencil_bits: usize,
}

impl GlSkiaSurface {
    fn recreate_skia_surface(&mut self, width: i32, height: i32) {
        let backend = backend_render_targets::make_gl(
            (width, height),
            self.num_samples,
            self.stencil_bits,
            self.fb_info,
        );
        self.surface = wrap_backend_render_target(
            &mut self.gr_context,
            &backend,
            gpu::SurfaceOrigin::BottomLeft,
            ColorType::RGBA8888,
            None,
            None,
        )
        .expect("could not re-create skia surface");
    }

    fn flush_and_present(&mut self) {
        self.gr_context.flush_and_submit();
        self.gl_surface
            .swap_buffers(&self.gl_context)
            .expect("swap buffers");
    }
}

// ---------------------------------------------------------------------------
// Drawing (host-specific rendering using TextEditSession data)
// ---------------------------------------------------------------------------

fn draw_session(
    canvas: &skia_safe::Canvas,
    session: &mut TextEditSession<SkiaLayoutEngine>,
    _policy: EmptyLineSelectionPolicy,
) {
    canvas.clear(Color::WHITE);

    let origin = Point::new(PADDING, PADDING - session.scroll_y());

    let preedit = session
        .preedit()
        .filter(|p| !p.is_empty())
        .map(str::to_owned);

    if let Some(ref p) = preedit {
        // ---- preedit mode (per-block, same path as normal) ----
        // Build per-block layout with preedit text spliced in and
        // underlined, producing identical metrics to the normal path.
        let (display_text, preedit_range) =
            session
                .layout
                .rebuild_blocks_with_preedit(&session.content, session.state.cursor, p);

        // Selection (using the display_text which includes preedit)
        if let Some((lo, hi)) = session.selection_range() {
            if lo < hi {
                let sel_rects = session
                    .layout
                    .selection_rects_for_range(&display_text, lo, hi);
                let mut sp = Paint::default();
                sp.set_color(Color::from_argb(80, 66, 133, 244));
                sp.set_anti_alias(true);
                for r in &sel_rects {
                    canvas.draw_rect(
                        Rect::from_ltrb(
                            r.x + origin.x,
                            r.y + origin.y,
                            r.x + r.width + origin.x,
                            r.y + r.height + origin.y,
                        ),
                        &sp,
                    );
                }
            }
        }

        // Text (per-block paint, same as normal mode)
        session
            .layout
            .paint_paragraph_at(canvas, &display_text, origin);

        // Cursor at end of preedit (use caret_rect_at with display text)
        let preedit_end = preedit_range.end;
        let cr = session.layout.caret_rect_at(&display_text, preedit_end);
        let cursor_rect = Rect::from_xywh(
            cr.x + origin.x - CURSOR_WIDTH / 2.0,
            cr.y + origin.y,
            CURSOR_WIDTH,
            cr.height,
        );
        let mut cp = Paint::default();
        cp.set_color(Color::BLACK);
        cp.set_anti_alias(false);
        canvas.draw_rect(cursor_rect, &cp);
    } else {
        // ---- normal mode (rich text, per-block layout) ----
        session.layout.ensure_layout_attributed(&session.content);

        // Selection
        if let Some((lo, hi)) = session.selection_range() {
            if lo < hi {
                let sel_rects =
                    session
                        .layout
                        .selection_rects_for_range(&session.state.text, lo, hi);
                let mut sp = Paint::default();
                sp.set_color(Color::from_argb(80, 66, 133, 244));
                sp.set_anti_alias(true);
                for r in &sel_rects {
                    canvas.draw_rect(
                        Rect::from_ltrb(
                            r.x + origin.x,
                            r.y + origin.y,
                            r.x + r.width + origin.x,
                            r.y + r.height + origin.y,
                        ),
                        &sp,
                    );
                }
            }
        }

        // Text
        session
            .layout
            .paint_paragraph_at(canvas, &session.state.text, origin);

        // Cursor
        if session.should_show_caret() {
            let cr = session.caret_rect();
            let cursor_rect = Rect::from_xywh(
                cr.x + origin.x - CURSOR_WIDTH / 2.0,
                cr.y + origin.y,
                CURSOR_WIDTH,
                cr.height,
            );
            let mut cp = Paint::default();
            cp.set_color(Color::BLACK);
            cp.set_anti_alias(false);
            canvas.draw_rect(cursor_rect, &cp);
        }
    }
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

struct TextEditorApp {
    policy: EmptyLineSelectionPolicy,
    inner: Option<AppInner>,
    modifiers: ModifiersState,
    clipboard: Clipboard,
    last_mouse_pos: (f32, f32),
    clicks: ClickTracker,
}

struct AppInner {
    window: Window,
    gl_skia: GlSkiaSurface,
    session: TextEditSession<SkiaLayoutEngine>,
}

impl TextEditorApp {
    fn new(policy: EmptyLineSelectionPolicy) -> Self {
        Self {
            policy,
            inner: None,
            modifiers: ModifiersState::empty(),
            clipboard: Clipboard::new().expect("could not open system clipboard"),
            last_mouse_pos: (0.0, 0.0),
            clicks: ClickTracker::new(),
        }
    }
}

impl ApplicationHandler for TextEditorApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.inner.is_some() {
            return;
        }

        let window_attrs = WindowAttributes::default()
            .with_title("wd_text_editor – Skia text editor prototype")
            .with_inner_size(winit::dpi::LogicalSize::new(WINDOW_W, WINDOW_H));

        let template = ConfigTemplateBuilder::new().with_alpha_size(8);
        let display_builder = DisplayBuilder::new().with_window_attributes(window_attrs.into());

        let (window, gl_config) = display_builder
            .build(event_loop, template, |mut cfgs| {
                let mut best = cfgs.next().expect("no GL config");
                for c in cfgs {
                    if c.num_samples() < best.num_samples() {
                        best = c;
                    }
                }
                best
            })
            .expect("failed to build GL window");
        let window = window.expect("window creation failed");

        #[allow(deprecated)]
        let raw_handle = window.raw_window_handle().expect("raw window handle");

        let ctx_attrs = ContextAttributesBuilder::new().build(Some(raw_handle));
        let fallback_attrs = ContextAttributesBuilder::new()
            .with_context_api(ContextApi::Gles(None))
            .build(Some(raw_handle));

        let not_current = unsafe {
            gl_config
                .display()
                .create_context(&gl_config, &ctx_attrs)
                .unwrap_or_else(|_| {
                    gl_config
                        .display()
                        .create_context(&gl_config, &fallback_attrs)
                        .expect("GL context creation failed")
                })
        };

        let (w, h): (u32, u32) = window.inner_size().into();
        let surf_attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
            raw_handle,
            NonZeroU32::new(w).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
            NonZeroU32::new(h).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
        );
        let gl_surface = unsafe {
            gl_config
                .display()
                .create_window_surface(&gl_config, &surf_attrs)
                .expect("GL surface creation failed")
        };

        let gl_context = not_current.make_current(&gl_surface).expect("make current");

        gl::load_with(|s| {
            let Ok(c) = CString::new(s) else {
                return std::ptr::null();
            };
            gl_config.display().get_proc_address(c.as_c_str())
        });

        let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
            if name == "eglGetCurrentDisplay" {
                return std::ptr::null();
            }
            let Ok(c) = CString::new(name) else {
                return std::ptr::null();
            };
            gl_config.display().get_proc_address(c.as_c_str())
        })
        .expect("Skia GL interface");

        let mut gr_context =
            skia_safe::gpu::direct_contexts::make_gl(interface, None).expect("Skia DirectContext");

        let fb_info = {
            let mut fboid: GLint = 0;
            unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
            FramebufferInfo {
                fboid: fboid.try_into().unwrap_or_default(),
                format: skia_safe::gpu::gl::Format::RGBA8.into(),
                ..Default::default()
            }
        };

        let num_samples = gl_config.num_samples() as usize;
        let stencil_bits = gl_config.stencil_size() as usize;

        let backend = backend_render_targets::make_gl(
            (w as i32, h as i32),
            num_samples,
            stencil_bits,
            fb_info,
        );
        let skia_surface = wrap_backend_render_target(
            &mut gr_context,
            &backend,
            gpu::SurfaceOrigin::BottomLeft,
            ColorType::RGBA8888,
            None,
            None,
        )
        .expect("Skia surface");

        let gl_skia = GlSkiaSurface {
            gr_context,
            fb_info,
            surface: skia_surface,
            gl_surface,
            gl_context,
            num_samples,
            stencil_bits,
        };

        // ---------------------------------------------------------------
        // Create editing session
        // ---------------------------------------------------------------

        let default_style = AttrTextStyle {
            font_family: String::from("Inter"),
            font_size: FONT_SIZE,
            ..AttrTextStyle::default()
        };

        let layout_w = (w as f32) - PADDING * 2.0;
        let layout_h = (h as f32) - PADDING * 2.0;
        let layout = SkiaLayoutEngine::new(layout_w, layout_h);
        let mut session = TextEditSession::new(layout, default_style.clone());

        // Load fonts
        let inter_upright =
            include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
        let inter_italic =
            include_bytes!("../../../fixtures/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.ttf");
        let lora_upright =
            include_bytes!("../../../fixtures/fonts/Lora/Lora-VariableFont_wght.ttf");
        let lora_italic =
            include_bytes!("../../../fixtures/fonts/Lora/Lora-Italic-VariableFont_wght.ttf");
        let inconsolata = include_bytes!(
            "../../../fixtures/fonts/Inconsolata/Inconsolata-VariableFont_wdth,wght.ttf"
        );
        session
            .layout
            .add_font_family("Inter", &[inter_upright, inter_italic]);
        session
            .layout
            .add_font_family("Lora", &[lora_upright, lora_italic]);
        session
            .layout
            .add_font_family("Inconsolata", &[inconsolata]);
        session.layout.config.font_families = vec!["Inter".into()];

        // Demo content
        let demo_text = concat!(
            "Grida Rich Text Editor\n",
            "\n",
            "Formatting\n",
            "  Cmd+B  bold       Cmd+I  italic\n",
            "  Cmd+U  underline  Cmd+Shift+X  strikethrough\n",
            "\n",
            "Font Size\n",
            "  Cmd+Shift+>  increase    Cmd+Shift+<  decrease\n",
            "\n",
            "Fonts (dev)\n",
            "  F5  Inter (sans)  F6  Lora (serif)  F7  Inconsolata (mono)\n",
            "\n",
            "Colors (dev)\n",
            "  F1  black   F2  red   F3  blue\n",
            "\n",
            "Editing\n",
            "  Cmd+Z  undo   Cmd+Shift+Z  redo\n",
            "  Cmd+C  copy   Cmd+X  cut   Cmd+V  paste (with formatting)\n",
            "  Cmd+A  select all\n",
            "\n",
            "The quick brown fox jumps over 13 lazy dogs.\n",
        );

        session.content = AttributedText::new(demo_text, default_style);
        session.state.text = demo_text.to_string();

        // Pre-style the title: bold, 24px
        let title_end = "Grida Rich Text Editor".len();
        session.content.apply_style(0, title_end, |s| {
            s.font_weight = 700;
            s.font_size = 24.0;
        });

        session.state.cursor = session.state.text.len();

        window.set_ime_allowed(true);
        window.set_ime_cursor_area(
            LogicalPosition::new(PADDING as f64, PADDING as f64),
            LogicalSize::new(1.0f64, FONT_SIZE as f64),
        );
        window.request_redraw();

        self.inner = Some(AppInner {
            window,
            gl_skia,
            session,
        });
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        let next_blink: std::time::Instant = self
            .inner
            .as_ref()
            .map(|i| i.session.next_blink_deadline())
            .unwrap_or_else(|| Instant::now() + Duration::from_millis(500))
            .into();
        event_loop.set_control_flow(ControlFlow::WaitUntil(next_blink));

        let Some(inner) = self.inner.as_mut() else {
            return;
        };

        match event {
            WindowEvent::CloseRequested => {
                event_loop.exit();
            }
            WindowEvent::Resized(PhysicalSize { width, height }) => {
                let w = width.max(1);
                let h = height.max(1);
                inner.gl_skia.gl_surface.resize(
                    &inner.gl_skia.gl_context,
                    NonZeroU32::new(w).unwrap(),
                    NonZeroU32::new(h).unwrap(),
                );
                inner.gl_skia.recreate_skia_surface(w as i32, h as i32);
                inner.session.set_layout_width((w as f32) - PADDING * 2.0);
                inner.session.set_layout_height((h as f32) - PADDING * 2.0);
                inner.window.request_redraw();
            }

            WindowEvent::ModifiersChanged(m) => {
                self.modifiers = m.state();
            }

            // ---------------------------------------------------------
            // IME (Input Method Editor) composition events
            // ---------------------------------------------------------
            // On macOS, winit 0.30 suppresses KeyboardInput during active
            // IME composition at the platform level (view.rs key_down).
            // We only receive Preedit / Commit here; no duplicate
            // KeyboardInput for composed characters.
            //
            // Known issue (winit 0.30, macOS): when a non-composable
            // character (e.g. ".", "?", symbols) finalizes an active
            // composition, winit's insertText handler commits the
            // composed text but silently drops the finalizing character.
            // Neither Ime::Commit nor KeyboardInput is emitted for it,
            // so it is lost. The user must press the key a second time.
            // This is a winit bug — our handler is correct.
            // ---------------------------------------------------------
            WindowEvent::Ime(Ime::Preedit(text, _cursor_range)) => {
                if inner.session.handle_key_action(KeyAction::ImePreedit(text)) {
                    inner.window.request_redraw();
                }
            }
            WindowEvent::Ime(Ime::Commit(s)) => {
                if inner.session.handle_key_action(KeyAction::ImeCommit(s)) {
                    inner.window.request_redraw();
                }
            }
            WindowEvent::Ime(Ime::Enabled) => {
                // No-op. On macOS, Ime::Enabled fires when the first
                // preedit begins — cancelling preedit here would race
                // with the Preedit event and drop initial characters.
            }
            WindowEvent::Ime(Ime::Disabled) => {
                // Input source switched away from CJK. Clear any
                // in-progress composition.
                inner.session.cancel_preedit();
                inner.window.request_redraw();
            }

            WindowEvent::KeyboardInput { event: ke, .. } if ke.state == ElementState::Pressed => {
                // Drain the empty-preedit sentinel *before* processing
                // keys so that the session's preedit.is_some() guard
                // doesn't suppress the next insertion.
                inner.session.drain_empty_preedit();

                let meta = self.modifiers.super_key();
                let alt = self.modifiers.alt_key();
                let ctrl = self.modifiers.control_key();
                let shift = self.modifiers.shift_key();
                let cmd = meta || ctrl;
                let word = alt || ctrl;

                // Clipboard operations (host-specific I/O, not in KeyAction)
                let mut handled = false;
                if cmd {
                    match ke.physical_key {
                        PhysicalKey::Code(KeyCode::KeyC) => {
                            if let Some(html) = inner.session.selected_html() {
                                let plain = inner.session.selected_text().unwrap_or("").to_string();
                                let _ = self.clipboard.set_html(&html, Some(&plain));
                            }
                            handled = true;
                        }
                        PhysicalKey::Code(KeyCode::KeyX) if !shift => {
                            if let Some(html) = inner.session.selected_html() {
                                let plain = inner.session.selected_text().unwrap_or("").to_string();
                                let _ = self.clipboard.set_html(&html, Some(&plain));
                            }
                            inner.session.apply(EditingCommand::DeleteByCut);
                            inner.window.request_redraw();
                            handled = true;
                        }
                        PhysicalKey::Code(KeyCode::KeyV) => {
                            let mut pasted = false;
                            if let Ok(html) = self.clipboard.get().html() {
                                if let Ok(content) = inner.session.parse_html_paste(&html) {
                                    inner.session.paste_attributed(&content);
                                    pasted = true;
                                }
                            }
                            if !pasted {
                                if let Ok(text) = self.clipboard.get_text() {
                                    inner.session.insert_text(&text);
                                }
                            }
                            inner.window.request_redraw();
                            handled = true;
                        }
                        _ => {}
                    }
                }

                // Dev-only function key presets (host-specific)
                if !handled {
                    handled = match &ke.logical_key {
                        Key::Named(NamedKey::F1) => {
                            inner.session.set_color(CGColor::BLACK);
                            inner.window.request_redraw();
                            true
                        }
                        Key::Named(NamedKey::F2) => {
                            inner.session.set_color(CGColor::from_rgb(230, 51, 51));
                            inner.window.request_redraw();
                            true
                        }
                        Key::Named(NamedKey::F3) => {
                            inner.session.set_color(CGColor::from_rgb(51, 102, 230));
                            inner.window.request_redraw();
                            true
                        }
                        Key::Named(NamedKey::F5) => {
                            inner.session.set_font_family("Inter");
                            inner.window.request_redraw();
                            true
                        }
                        Key::Named(NamedKey::F6) => {
                            inner.session.set_font_family("Lora");
                            inner.window.request_redraw();
                            true
                        }
                        Key::Named(NamedKey::F7) => {
                            inner.session.set_font_family("Inconsolata");
                            inner.window.request_redraw();
                            true
                        }
                        _ => false,
                    };
                }

                // Universal key → action mapping
                if !handled {
                    let key = winit_key_to_key_name(&ke.logical_key, &ke.physical_key, cmd);
                    if let Some(key) = key {
                        if let Some(action) = KeyAction::from_key(cmd, word, shift, &key) {
                            if inner.session.handle_key_action(action) {
                                inner.window.request_redraw();
                            }
                        }
                    }
                }
            }

            WindowEvent::MouseWheel { delta, .. } => {
                let dy = match delta {
                    MouseScrollDelta::PixelDelta(pos) => pos.y as f32,
                    MouseScrollDelta::LineDelta(_, lines) => lines * FONT_SIZE * 3.0,
                };
                inner.session.scroll_by(-dy);
                inner.window.request_redraw();
            }

            WindowEvent::CursorMoved { position, .. } => {
                let x = position.x as f32;
                let y = position.y as f32;
                self.last_mouse_pos = (x, y);
                inner
                    .session
                    .on_pointer_move(x - PADDING, y - PADDING + inner.session.scroll_y());
                if inner.session.is_mouse_down() {
                    inner.window.request_redraw();
                }
            }

            WindowEvent::MouseInput {
                state,
                button: MouseButton::Left,
                ..
            } => match state {
                ElementState::Pressed => {
                    let (x, y) = self.last_mouse_pos;
                    let local_x = x - PADDING;
                    let layout_y = y - PADDING + inner.session.scroll_y();
                    let shift = self.modifiers.shift_key();
                    let click_count = self.clicks.register(x, y);
                    inner
                        .session
                        .handle_click(local_x, layout_y, click_count, shift);
                    inner.window.request_redraw();
                }
                ElementState::Released => {
                    inner.session.on_pointer_up();
                }
            },

            WindowEvent::RedrawRequested => {
                inner.session.tick_blink();
                {
                    let canvas = inner.gl_skia.surface.canvas();
                    draw_session(canvas, &mut inner.session, self.policy);
                }
                inner.gl_skia.flush_and_present();

                let cr = inner.session.caret_rect();
                let scroll_y = inner.session.scroll_y();
                inner.window.set_ime_cursor_area(
                    LogicalPosition::new(
                        (cr.x + PADDING) as f64,
                        (cr.y + PADDING - scroll_y) as f64,
                    ),
                    LogicalSize::new(1.0f64, cr.height as f64),
                );

                let deadline: std::time::Instant = inner.session.next_blink_deadline().into();
                event_loop.set_control_flow(ControlFlow::WaitUntil(deadline));
            }

            // Dev-only: drag-and-drop text files
            WindowEvent::DroppedFile(path) => {
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_ascii_lowercase());

                match ext.as_deref() {
                    Some("html" | "htm") => match fs::read_to_string(&path) {
                        Ok(html) => match inner.session.parse_html_paste(&html) {
                            Ok(content) => {
                                inner.session.load_attributed(content);
                                eprintln!("loaded HTML: {}", path.display());
                                inner.window.request_redraw();
                            }
                            Err(e) => {
                                eprintln!("malformed HTML in {}: {e}", path.display());
                            }
                        },
                        Err(err) => {
                            eprintln!("failed to read {}: {err}", path.display());
                        }
                    },
                    ext if is_text_file(ext) => match fs::read_to_string(&path) {
                        Ok(content) => {
                            inner.session.load_text(&content);
                            eprintln!("loaded plain text: {}", path.display());
                            inner.window.request_redraw();
                        }
                        Err(err) => {
                            eprintln!("failed to read {}: {err}", path.display());
                        }
                    },
                    _ => {
                        eprintln!("unsupported drop: {}", path.display());
                    }
                }
            }

            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        let Some(inner) = self.inner.as_mut() else {
            return;
        };
        if inner.session.tick_blink() {
            inner.window.request_redraw();
        }
        let deadline: std::time::Instant = inner.session.next_blink_deadline().into();
        event_loop.set_control_flow(ControlFlow::WaitUntil(deadline));
    }
}

// ---------------------------------------------------------------------------
// winit → KeyName translation (host-specific glue)
// ---------------------------------------------------------------------------

/// Translate a winit key event into a platform-neutral [`KeyName`].
///
/// Returns `None` for keys the text editor doesn't handle (function keys,
/// modifier-only presses, etc.).
fn winit_key_to_key_name(logical: &Key, physical: &PhysicalKey, cmd: bool) -> Option<KeyName> {
    match logical {
        Key::Named(NamedKey::ArrowLeft) => Some(KeyName::ArrowLeft),
        Key::Named(NamedKey::ArrowRight) => Some(KeyName::ArrowRight),
        Key::Named(NamedKey::ArrowUp) => Some(KeyName::ArrowUp),
        Key::Named(NamedKey::ArrowDown) => Some(KeyName::ArrowDown),
        Key::Named(NamedKey::Home) => Some(KeyName::Home),
        Key::Named(NamedKey::End) => Some(KeyName::End),
        Key::Named(NamedKey::PageUp) => Some(KeyName::PageUp),
        Key::Named(NamedKey::PageDown) => Some(KeyName::PageDown),
        Key::Named(NamedKey::Backspace) => Some(KeyName::Backspace),
        Key::Named(NamedKey::Delete) => Some(KeyName::Delete),
        Key::Named(NamedKey::Enter) => Some(KeyName::Enter),
        Key::Named(NamedKey::Tab) => Some(KeyName::Tab),
        Key::Named(NamedKey::Space) => Some(KeyName::Space),
        // When cmd is held, use physical key for shortcut matching
        _ if cmd => match physical {
            PhysicalKey::Code(KeyCode::KeyA) => Some(KeyName::Letter('a')),
            PhysicalKey::Code(KeyCode::KeyB) => Some(KeyName::Letter('b')),
            PhysicalKey::Code(KeyCode::KeyI) => Some(KeyName::Letter('i')),
            PhysicalKey::Code(KeyCode::KeyU) => Some(KeyName::Letter('u')),
            PhysicalKey::Code(KeyCode::KeyX) => Some(KeyName::Letter('x')),
            PhysicalKey::Code(KeyCode::KeyZ) => Some(KeyName::Letter('z')),
            PhysicalKey::Code(KeyCode::Period) => Some(KeyName::Period),
            PhysicalKey::Code(KeyCode::Comma) => Some(KeyName::Comma),
            _ => None,
        },
        // Character insertion
        Key::Character(c) => Some(KeyName::Character(c.to_string())),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Text file detection for drag-and-drop
// ---------------------------------------------------------------------------

/// Returns `true` if the file extension (lower-cased) is a known plain-text
/// format that can be loaded verbatim into the editor.
fn is_text_file(ext: Option<&str>) -> bool {
    matches!(
        ext,
        Some(
            // Plain text
            "txt" | "text" | "log"
            // Markup / documentation
            | "md" | "markdown" | "rst" | "adoc" | "asciidoc" | "tex" | "latex"
            // Configuration
            | "cfg" | "conf" | "ini" | "env" | "properties"
            | "yaml" | "yml" | "toml" | "json" | "json5" | "jsonc" | "jsonl"
            | "xml" | "svg" | "plist"
            // Source code
            | "rs" | "py" | "js" | "ts" | "jsx" | "tsx" | "mjs" | "cjs"
            | "c" | "h" | "cpp" | "hpp" | "cc" | "cxx" | "hxx"
            | "java" | "kt" | "kts" | "scala" | "groovy"
            | "go" | "rb" | "php" | "pl" | "pm" | "lua" | "zig" | "nim"
            | "swift" | "m" | "mm"
            | "cs" | "fs" | "fsx" | "vb"
            | "r" | "jl" | "ex" | "exs" | "erl" | "hrl"
            | "hs" | "lhs" | "ml" | "mli" | "clj" | "cljs" | "cljc" | "el" | "lisp" | "scm"
            | "dart" | "v" | "sv" | "vhd" | "vhdl"
            // Shell / scripting
            | "sh" | "bash" | "zsh" | "fish" | "ps1" | "bat" | "cmd"
            // Web
            | "css" | "scss" | "sass" | "less" | "vue" | "svelte" | "astro"
            // Data / query
            | "sql" | "graphql" | "gql" | "csv" | "tsv"
            // Build / CI
            | "dockerfile" | "makefile" | "cmake" | "just" | "gradle"
            // Documentation / misc
            | "diff" | "patch" | "gitignore" | "gitattributes" | "editorconfig"
        )
    )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    let policy = std::env::args()
        .find(|a| a.starts_with("--rect-mode="))
        .map(|a| match a.strip_prefix("--rect-mode=").unwrap() {
            "none" => EmptyLineSelectionPolicy::None,
            "tight" => EmptyLineSelectionPolicy::GlyphRect,
            "linebox" => EmptyLineSelectionPolicy::LineBox,
            other => {
                eprintln!("unknown --rect-mode={other}, using 'tight'");
                EmptyLineSelectionPolicy::GlyphRect
            }
        })
        .unwrap_or(EmptyLineSelectionPolicy::GlyphRect);

    let el = EventLoop::new().expect("event loop");
    let mut app = TextEditorApp::new(policy);
    el.run_app(&mut app).expect("run_app");
}
