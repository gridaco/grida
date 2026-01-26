use super::winit::{winit_window, WinitResult};
use cg::node::schema::Size;
use cg::resources::{FontMessage, ImageMessage};
use cg::runtime::camera::Camera2D;
use cg::window::application::{ApplicationApi, HostEvent, UnknownTargetApplication};
use cg::window::command::ApplicationCommand;
use cg::window::state::AnySurfaceState;
use futures::channel::mpsc;
use glutin::{
    context::PossiblyCurrentContext,
    prelude::GlSurface,
    surface::{Surface as GlutinSurface, WindowSurface},
};
use math2::{rect, rect::Rectangle};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;
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
        WindowEvent::PinchGesture { delta, .. } => ApplicationCommand::ZoomDelta {
            delta: *delta as f32,
        },
        WindowEvent::MouseWheel { delta, .. } => match delta {
            MouseScrollDelta::PixelDelta(delta) => ApplicationCommand::Pan {
                tx: -(delta.x as f32),
                ty: -(delta.y as f32),
            },
            _ => ApplicationCommand::None,
        },
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
        ApplicationCommand::None
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

        match handle_window_event(&event, &self.modifiers) {
            cmd => {
                let is_copy_png = matches!(cmd, ApplicationCommand::TryCopyAsPNG);
                let ok = self.app.command(cmd);

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
                self.app.tick_with_current_time();
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
    let Some(scene) = renderer.scene.as_ref() else {
        return;
    };

    let geometry = renderer.get_cache().geometry();
    let mut union: Option<Rectangle> = None;
    for root in scene.graph.roots() {
        if let Some(bounds) = geometry.get_world_bounds(&root) {
            union = Some(match union {
                Some(existing) => rect::union(&[existing, bounds]),
                None => bounds,
            });
        }
    }

    let Some(bounds) = union else {
        return;
    };

    let padding = 64.0;
    let padded = Rectangle {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: (bounds.width + padding * 2.0).max(1.0),
        height: (bounds.height + padding * 2.0).max(1.0),
    };

    let viewport = renderer.camera.get_size();
    let zoom_x = viewport.width / padded.width.max(1.0);
    let zoom_y = viewport.height / padded.height.max(1.0);
    let target_zoom = zoom_x.min(zoom_y) * 0.98;
    if target_zoom.is_finite() && target_zoom > 0.0 {
        renderer.camera.set_zoom(target_zoom);
    }

    let center_x = padded.x + padded.width * 0.5;
    let center_y = padded.y + padded.height * 0.5;
    renderer.camera.set_center(center_x, center_y);
}
