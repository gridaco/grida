use crate::node::schema::Size;
use crate::os::winit::{winit_window, WinitResult};
use crate::resource::{FontMessage, ImageMessage};
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::Backend;
use crate::window::application::ApplicationApi;
use crate::window::application::{HostEvent, UnknownTargetApplication};
use crate::window::command::ApplicationCommand;
use futures::channel::mpsc;
use glutin::{
    context::PossiblyCurrentContext,
    prelude::GlSurface,
    surface::{Surface as GlutinSurface, WindowSurface},
};
use std::num::NonZeroU32;
#[allow(deprecated)]
use std::sync::Arc;
use winit::event::{ElementState, KeyEvent, MouseScrollDelta, WindowEvent};
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
            Key::Character(c) => match c.as_str() {
                "=" => ApplicationCommand::ZoomIn,
                "-" => ApplicationCommand::ZoomOut,
                "i" => ApplicationCommand::ToggleDebugMode,
                _ => ApplicationCommand::None,
            },
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
}

impl NativeApplication {
    /// Create a new [`NativeApplication`] and corresponding [`EventLoop`].
    pub fn new(
        width: i32,
        height: i32,
        image_rx: mpsc::UnboundedReceiver<ImageMessage>,
        font_rx: mpsc::UnboundedReceiver<FontMessage>,
    ) -> (Self, EventLoop<HostEvent>) {
        let WinitResult {
            mut state,
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

        let backend = Backend::GL(state.surface_mut_ptr());
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
            ),
            gl_surface,
            gl_context,
            window,
            modifiers: winit::keyboard::ModifiersState::default(),
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
        if let WindowEvent::ModifiersChanged(modifiers) = &event {
            self.modifiers = modifiers.state();
        }

        if let WindowEvent::CursorMoved { position, .. } = &event {
            self.app.input.cursor = [position.x as f32, position.y as f32];
            self.app.perform_hit_test();
        }

        if let WindowEvent::RedrawRequested = &event {
            self.app.redraw_requested();
            if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
                eprintln!("Error swapping buffers: {:?}", e);
            }
        }

        if let WindowEvent::CloseRequested = &event {
            self.app.renderer.free();
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

        match handle_window_event(&event, &self.modifiers) {
            cmd => {
                self.app.command(cmd);
            }
        }
    }

    fn user_event(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop, event: HostEvent) {
        match event {
            HostEvent::Tick => {
                let now = self.app.clock.now()
                    + self.app.last_frame_time.elapsed().as_secs_f64() * 1000.0;
                self.app.tick(now);
            }
            HostEvent::RedrawRequest => self.window.request_redraw(),
            HostEvent::FontLoaded(_f) => {
                self.app.resource_loaded();
            }
            HostEvent::ImageLoaded(_i) => {
                self.app.resource_loaded();
            }
            HostEvent::LoadScene(scene) => {
                self.app.renderer.load_scene(scene);
                self.app.renderer.queue_unstable();
                self.window.request_redraw();
            }
        }
    }
}
