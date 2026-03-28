use super::winit::{winit_window, WinitResult};
use cg::node::schema::{Scene, Size};
use cg::resources::{load_scene_images, FontMessage, ImageMessage};
use cg::runtime::camera::Camera2D;
use cg::window::application::{
    ApplicationApi, HostEvent, HostEventCallback, UnknownTargetApplication,
};
use cg::window::command::ApplicationCommand;
use cg::window::state::AnySurfaceState;
use futures::channel::mpsc;
use glutin::{
    context::PossiblyCurrentContext,
    prelude::GlSurface,
    surface::{Surface as GlutinSurface, WindowSurface},
};

use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use winit::event::{ElementState, KeyEvent, MouseButton, MouseScrollDelta, WindowEvent};
use winit::keyboard::Key;
use winit::{
    application::ApplicationHandler as NativeApplicationHandler, event_loop::EventLoop,
    window::Window,
};

/// Convert a winit KeyEvent to a SurfaceEvent::KeyDown.
fn winit_key_to_surface_key_down(
    event: &KeyEvent,
    modifiers: &winit::keyboard::ModifiersState,
) -> Option<cg::surface::SurfaceEvent> {
    use cg::text_edit::session::KeyName;

    let key = match &event.logical_key {
        Key::Named(winit::keyboard::NamedKey::ArrowLeft) => KeyName::ArrowLeft,
        Key::Named(winit::keyboard::NamedKey::ArrowRight) => KeyName::ArrowRight,
        Key::Named(winit::keyboard::NamedKey::ArrowUp) => KeyName::ArrowUp,
        Key::Named(winit::keyboard::NamedKey::ArrowDown) => KeyName::ArrowDown,
        Key::Named(winit::keyboard::NamedKey::Home) => KeyName::Home,
        Key::Named(winit::keyboard::NamedKey::End) => KeyName::End,
        Key::Named(winit::keyboard::NamedKey::PageUp) => KeyName::PageUp,
        Key::Named(winit::keyboard::NamedKey::PageDown) => KeyName::PageDown,
        Key::Named(winit::keyboard::NamedKey::Backspace) => KeyName::Backspace,
        Key::Named(winit::keyboard::NamedKey::Delete) => KeyName::Delete,
        Key::Named(winit::keyboard::NamedKey::Enter) => KeyName::Enter,
        Key::Named(winit::keyboard::NamedKey::Tab) => KeyName::Tab,
        Key::Named(winit::keyboard::NamedKey::Space) => KeyName::Space,
        Key::Named(winit::keyboard::NamedKey::Escape) => KeyName::Escape,
        Key::Character(c) => {
            let s = c.as_str();
            // Map single letters for shortcut detection.
            if s.len() == 1 {
                let ch = s.chars().next().unwrap();
                match ch {
                    'a'..='z' | 'A'..='Z' => KeyName::Letter(ch.to_ascii_lowercase()),
                    '.' => KeyName::Period,
                    ',' => KeyName::Comma,
                    _ => KeyName::Character(s.to_string()),
                }
            } else {
                KeyName::Character(s.to_string())
            }
        }
        _ => return None,
    };

    let mods = cg::surface::Modifiers {
        shift: modifiers.shift_key(),
        alt: modifiers.alt_key(),
        ctrl_or_cmd: if cfg!(target_os = "macos") {
            modifiers.super_key()
        } else {
            modifiers.control_key()
        },
    };

    Some(cg::surface::SurfaceEvent::KeyDown {
        key,
        modifiers: mods,
    })
}

fn handle_non_keyboard_window_event(
    event: &WindowEvent,
    modifiers: &winit::keyboard::ModifiersState,
) -> ApplicationCommand {
    match event {
        WindowEvent::PinchGesture { delta, .. } => {
            // Deadzone: ignore tiny pinch deltas that macOS trackpads
            // generate incidentally during two-finger scroll. Without this,
            // every pan gesture registers as PanAndZoom, defeating pan-only
            // optimizations (pan image cache, etc.).
            let d = *delta as f32;
            if d.abs() < 0.002 {
                ApplicationCommand::None
            } else {
                ApplicationCommand::ZoomDelta { delta: d }
            }
        }
        WindowEvent::MouseWheel { delta, .. } => {
            if modifiers.super_key() || modifiers.control_key() {
                // Cmd+scroll (macOS) or Ctrl+scroll → zoom, same as pinch
                let dy = match delta {
                    MouseScrollDelta::PixelDelta(d) => d.y as f32,
                    MouseScrollDelta::LineDelta(_, y) => *y * 16.0,
                };
                let sensitivity: f32 = 0.002;
                let zoom_delta = dy * sensitivity;
                ApplicationCommand::ZoomDelta { delta: zoom_delta }
            } else {
                match delta {
                    MouseScrollDelta::PixelDelta(delta) => ApplicationCommand::Pan {
                        tx: -(delta.x as f32),
                        ty: -(delta.y as f32),
                    },
                    _ => ApplicationCommand::None,
                }
            }
        }
        _ => ApplicationCommand::None,
    }
}

fn handle_key_pressed(
    key: &Key,
    modifiers: &winit::keyboard::ModifiersState,
) -> ApplicationCommand {
    if modifiers.super_key() {
        match key {
            Key::Character(c) => {
                if modifiers.shift_key() && c.as_str().to_lowercase() == "c" {
                    return ApplicationCommand::TryCopyAsPNG;
                }

                match c.as_str() {
                    "=" => ApplicationCommand::ZoomIn,
                    "-" => ApplicationCommand::ZoomOut,
                    "i" => ApplicationCommand::ToggleDebugMode,
                    "a" => ApplicationCommand::SelectAll,
                    _ => ApplicationCommand::None,
                }
            }
            _ => ApplicationCommand::None,
        }
    } else {
        match key {
            Key::Named(winit::keyboard::NamedKey::Escape) => ApplicationCommand::DeselectAll,
            Key::Named(winit::keyboard::NamedKey::PageDown) => ApplicationCommand::NextScene,
            Key::Named(winit::keyboard::NamedKey::PageUp) => ApplicationCommand::PrevScene,
            _ => ApplicationCommand::None,
        }
    }
}

pub struct NativeApplication {
    pub(crate) app: UnknownTargetApplication,
    pub(crate) gl_surface: GlutinSurface<WindowSurface>,
    pub(crate) gl_context: PossiblyCurrentContext,
    pub(crate) window: Window,
    pub(crate) modifiers: winit::keyboard::ModifiersState,
    /// System clipboard for text editing copy/cut/paste.
    system_clipboard: Option<arboard::Clipboard>,
    file_drop_tx: Option<UnboundedSender<PathBuf>>,
    fit_scene_on_load: bool,
    /// Set to `true` after `CloseRequested` to prevent event processing on
    /// a partially-torn-down application (the tick thread may still deliver
    /// events between `event_loop.exit()` and actual termination).
    exiting: bool,
    /// When >0, the next N ticks should request a redraw to produce a
    /// settle frame (showing "none" after a gesture ends).
    settle_countdown: u8,
    /// All scenes loaded from the file (for PageUp/PageDown switching).
    pub(crate) scenes: Vec<Scene>,
    /// Index of the currently displayed scene in `scenes`.
    pub(crate) scene_index: usize,
    /// Image channel sender for loading scene images on scene switch.
    pub(crate) image_tx: Option<mpsc::UnboundedSender<ImageMessage>>,
    /// Host event callback for notifying the event loop of image load completion.
    pub(crate) event_cb: Option<HostEventCallback>,
    /// Receives replacement scene lists from the drop task (for multi-scene pagination).
    pub(crate) scenes_rx: Option<UnboundedReceiver<Vec<Scene>>>,
}

impl NativeApplication {
    pub fn new(
        width: i32,
        height: i32,
        image_rx: mpsc::UnboundedReceiver<ImageMessage>,
        font_rx: mpsc::UnboundedReceiver<FontMessage>,
    ) -> (Self, EventLoop<HostEvent>) {
        Self::new_with_options(
            width,
            height,
            image_rx,
            font_rx,
            cg::runtime::scene::RendererOptions::default(),
            None,
            false,
            None,
        )
    }

    pub fn new_with_options(
        width: i32,
        height: i32,
        image_rx: mpsc::UnboundedReceiver<ImageMessage>,
        font_rx: mpsc::UnboundedReceiver<FontMessage>,
        options: cg::runtime::scene::RendererOptions,
        file_drop_tx: Option<UnboundedSender<PathBuf>>,
        fit_scene_on_load: bool,
        scenes_rx: Option<UnboundedReceiver<Vec<Scene>>>,
    ) -> (Self, EventLoop<HostEvent>) {
        let WinitResult {
            state,
            el,
            window,
            gl_surface,
            gl_context,
            scale_factor,
        } = winit_window(width, height);
        let proxy = el.create_proxy();

        let camera = Camera2D::new(Size {
            width: width as f32 * scale_factor as f32,
            height: height as f32 * scale_factor as f32,
        });

        let mut state = AnySurfaceState::from_gpu(state);
        let backend = state.backend();
        let redraw_cb: Arc<dyn Fn()> = {
            let redraw_proxy = proxy.clone();
            Arc::new(move || {
                let _ = redraw_proxy.send_event(HostEvent::RedrawRequest);
            })
        };

        let mut uta = UnknownTargetApplication::new(
            state,
            backend,
            camera,
            144,
            image_rx,
            font_rx,
            Some(redraw_cb),
            options,
        );
        uta.surface_overlay_config.dpr = scale_factor as f32;
        uta.surface_overlay_config.text_baseline_decoration = true;
        uta.surface_overlay_config.show_size_meter = true;
        uta.surface_overlay_config.show_frame_titles = true;

        let app = NativeApplication {
            app: uta,
            gl_surface,
            gl_context,
            window,
            modifiers: winit::keyboard::ModifiersState::default(),
            system_clipboard: arboard::Clipboard::new().ok(),
            file_drop_tx,
            fit_scene_on_load,
            exiting: false,
            settle_countdown: 0,
            scenes: Vec::new(),
            scene_index: 0,
            image_tx: None,
            event_cb: None,
            scenes_rx,
        };

        std::thread::spawn(move || loop {
            let _ = proxy.send_event(HostEvent::Tick);
            std::thread::sleep(std::time::Duration::from_millis(1000 / 240));
        });

        (app, el)
    }

    fn build_modifiers(&self) -> cg::surface::Modifiers {
        cg::surface::Modifiers {
            shift: self.modifiers.shift_key(),
            alt: self.modifiers.alt_key(),
            ctrl_or_cmd: if cfg!(target_os = "macos") {
                self.modifiers.super_key()
            } else {
                self.modifiers.control_key()
            },
        }
    }

    /// Copy the current text edit selection to the system clipboard (HTML + plain text).
    fn text_edit_copy_selection(&mut self) {
        if let Some(html) = self.app.text_edit_get_selected_html() {
            let plain = self.app.text_edit_get_selected_text().unwrap_or_default();
            if let Some(ref mut cb) = self.system_clipboard {
                let _ = cb.set_html(&html, Some(&plain));
            }
        }
    }

    /// Try to handle a clipboard operation (Cmd+C/X/V) during text editing.
    /// Returns `true` if the key was consumed.
    fn try_text_edit_clipboard(&mut self, key_event: &KeyEvent) -> bool {
        use winit::keyboard::{KeyCode, PhysicalKey};

        match key_event.physical_key {
            PhysicalKey::Code(KeyCode::KeyC) => {
                self.text_edit_copy_selection();
                true
            }
            PhysicalKey::Code(KeyCode::KeyX) if !self.modifiers.shift_key() => {
                self.text_edit_copy_selection();
                self.app
                    .text_edit_command(cg::text_edit_session::EditCommand::DeleteByCut);
                self.window.request_redraw();
                true
            }
            PhysicalKey::Code(KeyCode::KeyV) => {
                let mut pasted = false;
                if let Some(ref mut cb) = self.system_clipboard {
                    if let Ok(html) = cb.get().html() {
                        self.app.text_edit_paste_html(&html);
                        pasted = true;
                    }
                    if !pasted {
                        if let Ok(text) = cb.get_text() {
                            self.app.text_edit_paste_text(&text);
                            pasted = true;
                        }
                    }
                }
                if pasted {
                    self.window.request_redraw();
                }
                true
            }
            _ => false,
        }
    }
}

impl NativeApplicationHandler<HostEvent> for NativeApplication {
    fn resumed(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop) {}

    fn window_event(
        &mut self,
        event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        if let WindowEvent::RedrawRequested = &event {
            self.app.redraw_requested();
            if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
                eprintln!("Error swapping buffers: {:?}", e);
            }
        }

        if let WindowEvent::CloseRequested = &event {
            self.exiting = true;
            event_loop.exit();
            return;
        }

        if self.exiting {
            return;
        }

        if let WindowEvent::Resized(size) = &event {
            self.gl_surface.resize(
                &self.gl_context,
                NonZeroU32::new(size.width).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
                NonZeroU32::new(size.height).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
            );
            self.app.resize(size.width, size.height);
        }

        if let WindowEvent::ModifiersChanged(modifiers) = &event {
            self.modifiers = modifiers.state();
        }

        // -- Pointer events: routed through handle_surface_event for
        //    double-click detection and text edit pointer routing.
        if let WindowEvent::CursorMoved { position, .. } = &event {
            self.app
                .set_cursor_position([position.x as f32, position.y as f32]);
            let canvas_point = self
                .app
                .renderer()
                .camera
                .screen_to_canvas_point([position.x as f32, position.y as f32]);
            let screen_point = [position.x as f32, position.y as f32];

            let surface_event = cg::surface::SurfaceEvent::PointerMove {
                canvas_point,
                screen_point,
            };
            let response = self.app.handle_surface_event(surface_event);
            if response.cursor_changed {
                let cursor = match self.app.surface_cursor() {
                    cg::surface::CursorIcon::Default => winit::window::CursorIcon::Default,
                    cg::surface::CursorIcon::Pointer => winit::window::CursorIcon::Pointer,
                    cg::surface::CursorIcon::Grab => winit::window::CursorIcon::Grab,
                    cg::surface::CursorIcon::Grabbing => winit::window::CursorIcon::Grabbing,
                    cg::surface::CursorIcon::Crosshair => winit::window::CursorIcon::Crosshair,
                    cg::surface::CursorIcon::Move => winit::window::CursorIcon::Move,
                };
                self.window.set_cursor(cursor);
            }
            if response.needs_redraw {
                self.window.request_redraw();
            }
            // Keep legacy hit test updated for devtools overlay
            self.app.perform_hit_test_host();
        }

        if let WindowEvent::MouseInput { state, button, .. } = &event {
            let was_editing = self.app.text_edit_is_active();
            let modifiers = self.build_modifiers();
            let pointer_button = match button {
                MouseButton::Left => cg::surface::PointerButton::Primary,
                MouseButton::Right => cg::surface::PointerButton::Secondary,
                MouseButton::Middle => cg::surface::PointerButton::Middle,
                _ => cg::surface::PointerButton::Primary,
            };
            let [sx, sy] = self.app.input_cursor();
            let canvas_point = self.app.renderer().camera.screen_to_canvas_point([sx, sy]);
            let screen_point = [sx, sy];

            let surface_event = match state {
                ElementState::Pressed => cg::surface::SurfaceEvent::PointerDown {
                    canvas_point,
                    screen_point,
                    button: pointer_button,
                    modifiers,
                },
                ElementState::Released => cg::surface::SurfaceEvent::PointerUp {
                    canvas_point,
                    screen_point,
                    button: pointer_button,
                    modifiers,
                },
            };
            let response = self.app.handle_surface_event(surface_event);
            if response.needs_redraw {
                self.window.request_redraw();
            }

            // Toggle IME on text edit mode transitions.
            let is_editing = self.app.text_edit_is_active();
            if is_editing && !was_editing {
                self.window.set_ime_allowed(true);
            } else if !is_editing && was_editing {
                self.window.set_ime_allowed(false);
            }

            // Keep legacy selection for devtools
            if *state == ElementState::Pressed && *button == MouseButton::Left {
                self.app.capture_hit_test_selection();
            }
        }

        // -- IME events (Korean, Japanese, Chinese text composition) --
        if let WindowEvent::Ime(ref ime) = event {
            if self.app.text_edit_is_active() {
                use winit::event::Ime;
                match ime {
                    Ime::Preedit(text, _cursor_range) => {
                        let surface_event = cg::surface::SurfaceEvent::Ime(
                            cg::surface::ImeEvent::Preedit(text.clone()),
                        );
                        let response = self.app.handle_surface_event(surface_event);
                        if response.needs_redraw {
                            self.window.request_redraw();
                        }
                    }
                    Ime::Commit(text) => {
                        let surface_event = cg::surface::SurfaceEvent::Ime(
                            cg::surface::ImeEvent::Commit(text.clone()),
                        );
                        let response = self.app.handle_surface_event(surface_event);
                        if response.needs_redraw {
                            self.window.request_redraw();
                        }
                    }
                    Ime::Enabled => {
                        // No-op. On macOS, Ime::Enabled fires when the first
                        // preedit begins — cancelling preedit here would race.
                    }
                    Ime::Disabled => {
                        self.app.text_edit_ime_cancel();
                        self.window.request_redraw();
                    }
                }
                return;
            }
        }

        // -- Keyboard events: try text edit first, fall through to app commands.
        if let WindowEvent::KeyboardInput {
            event: ref key_event,
            ..
        } = event
        {
            if key_event.state == ElementState::Pressed {
                let is_editing = self.app.text_edit_is_active();
                let cmd_held = self.build_modifiers().ctrl_or_cmd;

                // Clipboard operations (Cmd+C/X/V) require host-specific
                // system clipboard access — handled here, not in
                // handle_surface_event.
                if is_editing && cmd_held && self.try_text_edit_clipboard(key_event) {
                    return;
                }

                // Route KeyDown through handle_surface_event for text edit
                // navigation, deletion, and shortcuts.
                if let Some(surface_event) =
                    winit_key_to_surface_key_down(key_event, &self.modifiers)
                {
                    let response = self.app.handle_surface_event(surface_event);
                    if response.needs_redraw {
                        self.window.request_redraw();
                    }
                }

                // Detect text edit exit (e.g. Escape) and disable IME.
                if is_editing && !self.app.text_edit_is_active() {
                    self.window.set_ime_allowed(false);
                }

                // If text editing is active, also route text input for
                // character insertion (separate from KeyDown to avoid
                // double insertion). Skip when cmd is held — modifier
                // shortcuts should not produce text input.
                if self.app.text_edit_is_active() {
                    if !cmd_held {
                        if let Some(ref text) = key_event.text {
                            let s = text.as_str();
                            // Filter out control characters (Enter, Tab, etc.
                            // are already handled as KeyDown actions).
                            if !s.is_empty() && s.chars().all(|c| !c.is_control()) {
                                let surface_event = cg::surface::SurfaceEvent::TextInput {
                                    text: s.to_string(),
                                };
                                let response = self.app.handle_surface_event(surface_event);
                                if response.needs_redraw {
                                    self.window.request_redraw();
                                }
                            }
                        }
                    }
                    return; // Don't fall through to app commands while editing.
                }

                // If we were editing before KeyDown but exited (e.g. Escape),
                // don't fall through to app commands for this key.
                if is_editing {
                    return;
                }
            }
        }

        if let WindowEvent::DroppedFile(path) = &event {
            if let Some(tx) = &self.file_drop_tx {
                let _ = tx.send(path.clone());
            }
        }

        // -- Non-keyboard app commands (scroll, pinch, etc.)
        let cmd = handle_non_keyboard_window_event(&event, &self.modifiers);
        if !matches!(cmd, ApplicationCommand::None) {
            let ok = self.app.command(cmd);
            if ok {
                self.settle_countdown = 12;
            }
            return;
        }

        // -- Keyboard app commands (only if not consumed by text edit above).
        if let WindowEvent::KeyboardInput {
            event:
                KeyEvent {
                    logical_key: ref key,
                    state: ElementState::Pressed,
                    ..
                },
            ..
        } = event
        {
            let cmd = handle_key_pressed(key, &self.modifiers);
            match &cmd {
                ApplicationCommand::NextScene | ApplicationCommand::PrevScene => {
                    if !self.scenes.is_empty() {
                        let new_index = match &cmd {
                            ApplicationCommand::NextScene => {
                                (self.scene_index + 1) % self.scenes.len()
                            }
                            ApplicationCommand::PrevScene => {
                                (self.scene_index + self.scenes.len() - 1) % self.scenes.len()
                            }
                            _ => unreachable!(),
                        };
                        if new_index != self.scene_index {
                            self.scene_index = new_index;
                            let scene = self.scenes[new_index].clone();
                            let title = format!(
                                "[{}/{}] {}",
                                new_index + 1,
                                self.scenes.len(),
                                scene.name,
                            );
                            eprintln!("{title}");

                            // Load scene images in background for the new scene.
                            if let (Some(image_tx), Some(event_cb)) =
                                (self.image_tx.clone(), self.event_cb.clone())
                            {
                                let scene_for_images = scene.clone();
                                std::thread::spawn(move || {
                                    futures::executor::block_on(async move {
                                        load_scene_images(&scene_for_images, image_tx, event_cb)
                                            .await;
                                    });
                                });
                            }

                            let renderer = self.app.renderer_mut();
                            renderer.load_scene(scene);
                            fit_camera_to_scene(renderer);
                            renderer.queue_unstable();
                            self.window.request_redraw();
                            self.window.set_title(&title);
                        }
                    }
                }
                _ => {
                    let is_copy_png = matches!(cmd, ApplicationCommand::TryCopyAsPNG);
                    let ok = self.app.command(cmd);
                    if ok {
                        self.settle_countdown = 12;
                    }

                    if ok && is_copy_png {
                        use std::io::Write;
                        let path = "clipboard.png".to_string();
                        let mut file = std::fs::File::create(path).unwrap();
                        if let Some(bytes) = self.app.clipboard_bytes() {
                            file.write_all(bytes).unwrap();
                        }
                    }
                }
            }
        }
    }

    fn user_event(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop, event: HostEvent) {
        if self.exiting {
            return;
        }
        match event {
            HostEvent::Tick => {
                // Poll for new scenes from the drop task.
                if let Some(rx) = &mut self.scenes_rx {
                    if let Ok(scenes) = rx.try_recv() {
                        if let Some(first) = scenes.first().cloned() {
                            let total = scenes.len();
                            self.scenes = scenes;
                            self.scene_index = 0;

                            let title = if total > 1 {
                                format!("[1/{}] {}", total, first.name)
                            } else {
                                first.name.clone()
                            };

                            let renderer = self.app.renderer_mut();
                            renderer.load_scene(first);
                            if self.fit_scene_on_load {
                                fit_camera_to_scene(renderer);
                            }
                            renderer.queue_unstable();
                            self.window.set_title(&title);
                            self.window.request_redraw();
                        }
                    }
                }
                self.app.tick_with_current_time();

                // Settle frame: after the last interaction, request one more
                // redraw so the overlay shows "none" and the renderer
                // can capture a clean pan-image-cache snapshot.
                if self.settle_countdown > 0 {
                    self.settle_countdown -= 1;
                    if self.settle_countdown == 0 {
                        // Use queue_stable() so the settle frame:
                        // 1. Clears pan/zoom image caches
                        // 2. Renders at full quality (no reduced effects)
                        // 3. Fills in any white edges left by cached blits
                        self.app.renderer_mut().queue_stable();
                        self.window.request_redraw();
                    }
                }
            }
            HostEvent::RedrawRequest => self.window.request_redraw(),
            HostEvent::FontLoaded(_f) => {
                self.app.notify_resource_loaded();
            }
            HostEvent::ImageLoaded(_i) => {
                self.app.notify_resource_loaded();
            }
            HostEvent::LoadScene(scene) => {
                {
                    let renderer = self.app.renderer_mut();
                    renderer.load_scene(scene);
                    if self.fit_scene_on_load {
                        fit_camera_to_scene(renderer);
                    }
                    renderer.queue_unstable();
                }
                self.window.request_redraw();
            }
        }
    }
}

fn fit_camera_to_scene(renderer: &mut cg::runtime::scene::Renderer) {
    renderer.fit_camera_to_scene();
}
