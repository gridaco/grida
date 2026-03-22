use super::winit::{winit_window, WinitResult};
use cg::node::schema::{Scene, Size};
use cg::resources::{load_scene_images, FontMessage, ImageMessage};
use cg::runtime::camera::Camera2D;
use cg::window::application::{ApplicationApi, HostEvent, HostEventCallback, UnknownTargetApplication};
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

fn handle_window_event(
    event: &WindowEvent,
    modifiers: &winit::keyboard::ModifiersState,
) -> ApplicationCommand {
    match event {
        WindowEvent::KeyboardInput {
            event:
                KeyEvent {
                    logical_key: key,
                    state: ElementState::Pressed,
                    ..
                },
            ..
        } => handle_key_pressed(key, modifiers),
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
                    _ => ApplicationCommand::None,
                }
            }
            _ => ApplicationCommand::None,
        }
    } else {
        match key {
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
    file_drop_tx: Option<UnboundedSender<PathBuf>>,
    fit_scene_on_load: bool,
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

        let app = NativeApplication {
            app: UnknownTargetApplication::new(
                state,
                backend,
                camera,
                144,
                image_rx,
                font_rx,
                Some(redraw_cb),
                options,
            ),
            gl_surface,
            gl_context,
            window,
            modifiers: winit::keyboard::ModifiersState::default(),
            file_drop_tx,
            fit_scene_on_load,
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
            self.app.renderer_mut().free();
            event_loop.exit();
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

        if let WindowEvent::CursorMoved { position, .. } = &event {
            self.app
                .set_cursor_position([position.x as f32, position.y as f32]);
            self.app.perform_hit_test_host();
        }

        if let WindowEvent::MouseInput { state, button, .. } = &event {
            if *state == ElementState::Pressed && *button == MouseButton::Left {
                self.app.capture_hit_test_selection();
            }
        }

        if let WindowEvent::DroppedFile(path) = &event {
            if let Some(tx) = &self.file_drop_tx {
                let _ = tx.send(path.clone());
            }
        }

        let cmd = handle_window_event(&event, &self.modifiers);
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
                                    load_scene_images(&scene_for_images, image_tx, event_cb).await;
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
                    // Schedule a settle redraw ~50ms after the last interaction
                    // so the overlay shows "none" when the gesture ends.
                    // The 240Hz tick decrements the countdown (~12 ticks ≈ 50ms).
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

    fn user_event(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop, event: HostEvent) {
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
                        self.app.renderer_mut().queue_unstable();
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
