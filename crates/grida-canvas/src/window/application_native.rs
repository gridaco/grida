use crate::node::schema::Size;
use crate::resource::{FontMessage, ImageMessage};
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::Backend;
use crate::window::application::ApplicationApi;
use crate::window::application::{HostEvent, UnknownTargetApplication};
use crate::window::command::ApplicationCommand;
use futures::channel::mpsc;
use gl::types::*;
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
use skia_safe::gpu;
use std::{ffi::CString, num::NonZeroU32};
use winit::event::{ElementState, KeyEvent, MouseScrollDelta, WindowEvent};
use winit::keyboard::Key;
use winit::{
    application::ApplicationHandler as NativeApplicationHandler,
    dpi::LogicalSize,
    event_loop::EventLoop,
    window::{Window, WindowAttributes},
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

pub(crate) fn init_native_window(
    width: i32,
    height: i32,
) -> (
    crate::window::state::SurfaceState,
    EventLoop<HostEvent>,
    Window,
    GlutinSurface<WindowSurface>,
    PossiblyCurrentContext,
    f64,
) {
    println!("🔄 Window process started with PID: {}", std::process::id());

    let el = EventLoop::<HostEvent>::with_user_event().build().unwrap();

    let window_attributes = WindowAttributes::default()
        .with_title("Grida - grida-canvas / glutin / skia-safe::gpu::gl")
        .with_inner_size(LogicalSize::new(width, height));

    let template = ConfigTemplateBuilder::new()
        .with_alpha_size(8)
        .with_transparency(true);

    let display_builder = DisplayBuilder::new().with_window_attributes(window_attributes.into());
    let (window, gl_config) = display_builder
        .build(&el, template, |mut configs| {
            let mut best = configs.next().expect("no gl config available");
            for config in configs {
                let transparency_check = config.supports_transparency().unwrap_or(false)
                    & !best.supports_transparency().unwrap_or(false);
                if transparency_check || config.num_samples() < best.num_samples() {
                    best = config;
                }
            }
            best
        })
        .expect("failed to build window");
    println!("Picked a config with {} samples", gl_config.num_samples());
    let window = window.expect("Could not create window with OpenGL context");
    #[allow(deprecated)]
    let raw_window_handle = window
        .raw_window_handle()
        .expect("Failed to retrieve RawWindowHandle");

    let scale_factor = window.scale_factor();

    let context_attributes = ContextAttributesBuilder::new().build(Some(raw_window_handle));
    let fallback_context_attributes = ContextAttributesBuilder::new()
        .with_context_api(ContextApi::Gles(None))
        .build(Some(raw_window_handle));

    let not_current_gl_context = unsafe {
        gl_config
            .display()
            .create_context(&gl_config, &context_attributes)
            .unwrap_or_else(|_| {
                gl_config
                    .display()
                    .create_context(&gl_config, &fallback_context_attributes)
                    .expect("failed to create context")
            })
    };

    let (width, height): (u32, u32) = window.inner_size().into();

    let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
        raw_window_handle,
        NonZeroU32::new(width).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
        NonZeroU32::new(height).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
    );

    let gl_surface = unsafe {
        gl_config
            .display()
            .create_window_surface(&gl_config, &attrs)
            .expect("Could not create gl window surface")
    };

    let gl_context = not_current_gl_context
        .make_current(&gl_surface)
        .expect("Could not make GL context current");

    gl::load_with(|s| {
        let Ok(cstr) = CString::new(s) else {
            return std::ptr::null();
        };
        gl_config.display().get_proc_address(cstr.as_c_str())
    });

    let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
        if name == "eglGetCurrentDisplay" {
            return std::ptr::null();
        }
        let Ok(cstr) = CString::new(name) else {
            return std::ptr::null();
        };
        gl_config.display().get_proc_address(cstr.as_c_str())
    })
    .expect("Could not create interface");

    let mut gr_context = skia_safe::gpu::direct_contexts::make_gl(interface, None)
        .expect("Could not create direct context");

    let fb_info = {
        let mut fboid: GLint = 0;
        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
        gpu::gl::FramebufferInfo {
            fboid: fboid.try_into().unwrap_or_default(),
            format: skia_safe::gpu::gl::Format::RGBA8.into(),
            ..Default::default()
        }
    };

    let backend_render_target = gpu::backend_render_targets::make_gl(
        (width as i32, height as i32),
        gl_config.num_samples() as usize,
        gl_config.stencil_size() as usize,
        fb_info,
    );

    let surface = gpu::surfaces::wrap_backend_render_target(
        &mut gr_context,
        &backend_render_target,
        skia_safe::gpu::SurfaceOrigin::BottomLeft,
        skia_safe::ColorType::RGBA8888,
        None,
        None,
    )
    .expect("Could not create skia surface");

    let state = crate::window::state::SurfaceState::from_parts(gr_context, fb_info, surface);

    (state, el, window, gl_surface, gl_context, scale_factor)
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
        let (mut state, el, window, gl_surface, gl_context, scale_factor) =
            init_native_window(width, height);
        let proxy = el.create_proxy();

        let camera = Camera2D::new(Size {
            width: width as f32 * scale_factor as f32,
            height: height as f32 * scale_factor as f32,
        });

        let backend = Backend::GL(state.surface_mut_ptr());
        let mut app = NativeApplication {
            app: UnknownTargetApplication::new(state, backend, camera, 144, image_rx, font_rx),
            gl_surface,
            gl_context,
            window,
            modifiers: winit::keyboard::ModifiersState::default(),
        };

        // set the redraw callback to dispatch a user event for redraws
        let redraw_proxy = proxy.clone();
        app.app.set_request_redraw(Box::new(move || {
            let _ = redraw_proxy.send_event(HostEvent::RedrawRequest);
        }));

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
            HostEvent::Tick => self.app.tick(),
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
            _ => {}
        }
    }
}
