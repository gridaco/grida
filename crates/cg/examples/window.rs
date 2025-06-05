use cg::camera::Camera;
use cg::draw::{Backend, Renderer};
use cg::io::parse;
use cg::schema::*;
use cg::transform::AffineTransform;
use console_error_panic_hook::set_once as init_panic_hook;
use gl::types::*;
use gl_rs as gl;
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
use reqwest;
use skia_safe::{Surface, gpu};
use std::fs;
use std::{ffi::CString, num::NonZeroU32};
use winit::event::{ElementState, Event, KeyEvent, MouseScrollDelta, WindowEvent};
use winit::keyboard::Key;
use winit::{
    application::ApplicationHandler,
    dpi::LogicalSize,
    event_loop::{ControlFlow, EventLoop},
    window::{Window, WindowAttributes},
};

#[derive(Debug)]
enum Command {
    Close,
    ZoomIn,
    ZoomOut,
    Pan { x: f32, y: f32 },
    Redraw,
    Resize { width: u32, height: u32 },
    None,
}

fn handle_window_event(event: WindowEvent) -> Command {
    match event {
        WindowEvent::CloseRequested => Command::Close,
        WindowEvent::Resized(size) => Command::Resize {
            width: size.width,
            height: size.height,
        },
        WindowEvent::KeyboardInput {
            event:
                KeyEvent {
                    logical_key: key,
                    state: ElementState::Pressed,
                    ..
                },
            ..
        } => match key {
            Key::Character(c) if c == "=" => Command::ZoomIn,
            Key::Character(c) if c == "-" => Command::ZoomOut,
            _ => Command::None,
        },
        WindowEvent::MouseWheel { delta, .. } => match delta {
            MouseScrollDelta::LineDelta(x, y) => {
                let pan_speed = 10.0;
                Command::Pan {
                    x: x * pan_speed,
                    y: y * pan_speed,
                }
            }
            MouseScrollDelta::PixelDelta(delta) => {
                let pan_speed = 0.5;
                Command::Pan {
                    x: delta.x as f32 * pan_speed,
                    y: delta.y as f32 * pan_speed,
                }
            }
        },
        WindowEvent::RedrawRequested => Command::Redraw,
        _ => Command::None,
    }
}

pub async fn fetch_font_data(path: &str) -> Vec<u8> {
    // read from file or url
    if path.starts_with("http") {
        let response = reqwest::get(path).await.unwrap();
        response.bytes().await.unwrap().to_vec()
    } else {
        fs::read(path).expect("failed to read file")
    }
}

pub async fn fetch_image_data(path: &str) -> Vec<u8> {
    if path.starts_with("http") {
        let response = reqwest::get(path).await.unwrap();
        response.bytes().await.unwrap().to_vec()
    } else {
        fs::read(path).expect("failed to read file")
    }
}

fn init_window(
    _width: i32,
    _height: i32,
) -> (
    *mut Surface,
    EventLoop<()>,
    Window,
    GlutinSurface<WindowSurface>,
    PossiblyCurrentContext,
    glutin::config::Config,
    gpu::gl::FramebufferInfo,
    skia_safe::gpu::DirectContext,
    f64, // scale factor
) {
    init_panic_hook();

    // Create event loop and window
    let el = EventLoop::new().expect("Failed to create event loop");
    let window_attributes = WindowAttributes::default()
        .with_title("Grida Canvas")
        .with_inner_size(LogicalSize::new(1080, 1080));

    // Create GL config template
    let template = ConfigTemplateBuilder::new()
        .with_alpha_size(8)
        .with_transparency(true);

    // Build display and get window
    let display_builder = DisplayBuilder::new().with_window_attributes(window_attributes.into());
    let (window, gl_config) = display_builder
        .build(&el, template, |configs| {
            // Find the config with the minimum number of samples. Usually Skia takes care of
            // anti-aliasing and may not be able to create appropriate Surfaces for samples > 0.
            // See https://github.com/rust-skia/rust-skia/issues/782
            // And https://github.com/rust-skia/rust-skia/issues/764
            configs
                .reduce(|accum, config| {
                    let transparency_check = config.supports_transparency().unwrap_or(false)
                        & !accum.supports_transparency().unwrap_or(false);

                    if transparency_check || config.num_samples() < accum.num_samples() {
                        config
                    } else {
                        accum
                    }
                })
                .unwrap()
        })
        .unwrap();
    println!("Picked a config with {} samples", gl_config.num_samples());
    let window = window.expect("Could not create window with OpenGL context");
    let raw_window_handle = window
        .raw_window_handle()
        .expect("Failed to retrieve RawWindowHandle");

    // --- DPI handling ---
    let scale_factor = window.scale_factor();
    // ---

    // The context creation part. It can be created before surface and that's how
    // it's expected in multithreaded + multiwindow operation mode, since you
    // can send NotCurrentContext, but not Surface.
    let context_attributes = ContextAttributesBuilder::new().build(Some(raw_window_handle));

    // Since glutin by default tries to create OpenGL core context, which may not be
    // present we should try gles.
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
        NonZeroU32::new(width).unwrap(),
        NonZeroU32::new(height).unwrap(),
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
        gl_config
            .display()
            .get_proc_address(CString::new(s).unwrap().as_c_str())
    });

    let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
        if name == "eglGetCurrentDisplay" {
            return std::ptr::null();
        }
        gl_config
            .display()
            .get_proc_address(CString::new(name).unwrap().as_c_str())
    })
    .expect("Could not create interface");

    let mut gr_context = skia_safe::gpu::direct_contexts::make_gl(interface, None)
        .expect("Could not create direct context");

    // Get framebuffer info
    let fb_info = {
        let mut fboid: GLint = 0;
        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
        gpu::gl::FramebufferInfo {
            fboid: fboid.try_into().unwrap(),
            format: skia_safe::gpu::gl::Format::RGBA8.into(),
            ..Default::default()
        }
    };

    // Create Skia surface
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

    (
        Box::into_raw(Box::new(surface)),
        el,
        window,
        gl_surface,
        gl_context,
        gl_config,
        fb_info,
        gr_context,
        scale_factor,
    )
}

struct App {
    renderer: Renderer,
    surface_ptr: *mut Surface,
    gl_surface: GlutinSurface<WindowSurface>,
    gl_context: PossiblyCurrentContext,
    gl_config: glutin::config::Config,
    fb_info: gpu::gl::FramebufferInfo,
    gr_context: skia_safe::gpu::DirectContext,
    camera: Camera,
    scene: Scene,
    window: Window,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop) {}

    fn window_event(
        &mut self,
        event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        match handle_window_event(event) {
            Command::Close => {
                self.renderer.free();
                event_loop.exit();
            }
            Command::ZoomIn => {
                self.camera.zoom *= 1.1;
                self.renderer.set_camera(self.camera.clone());
                self.redraw();
            }
            Command::ZoomOut => {
                self.camera.zoom *= 0.9;
                self.renderer.set_camera(self.camera.clone());
                self.redraw();
            }
            Command::Pan { x, y } => {
                let current_x = self.camera.transform.x();
                let current_y = self.camera.transform.y();
                self.camera.set_position(current_x + x, current_y + y);
                self.renderer.set_camera(self.camera.clone());
                self.redraw();
            }
            Command::Resize { width, height } => {
                self.resize(width, height);
            }
            Command::Redraw => {
                self.redraw();
            }
            Command::None => {}
        }
    }
}

impl App {
    fn redraw(&mut self) {
        let surface = unsafe { &mut *self.surface_ptr };
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);

        self.renderer.render_scene(&self.scene);
        self.renderer.flush();

        if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
            eprintln!("Error swapping buffers: {:?}", e);
        }
    }

    fn resize(&mut self, width: u32, height: u32) {
        // Recreate GL surface
        let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
            self.window
                .raw_window_handle()
                .expect("Failed to get window handle"),
            NonZeroU32::new(width).unwrap(),
            NonZeroU32::new(height).unwrap(),
        );
        self.gl_surface = unsafe {
            self.gl_config
                .display()
                .create_window_surface(&self.gl_config, &attrs)
                .expect("Could not create gl window surface")
        };

        // Recreate Skia surface
        let backend_render_target = gpu::backend_render_targets::make_gl(
            (width as i32, height as i32),
            self.gl_config.num_samples() as usize,
            self.gl_config.stencil_size() as usize,
            self.fb_info,
        );
        let surface = gpu::surfaces::wrap_backend_render_target(
            &mut self.gr_context,
            &backend_render_target,
            skia_safe::gpu::SurfaceOrigin::BottomLeft,
            skia_safe::ColorType::RGBA8888,
            None,
            None,
        )
        .expect("Could not create skia surface");

        // Update surface pointer
        unsafe { Box::from_raw(self.surface_ptr) };
        self.surface_ptr = Box::into_raw(Box::new(surface));
        self.renderer.set_backend(Backend::GL(self.surface_ptr));
        self.redraw();
    }
}

pub async fn run_demo_window(scene: Scene) {
    let width = 1080;
    let height = 1080;

    let (
        surface_ptr,
        el,
        window,
        gl_surface,
        gl_context,
        gl_config,
        fb_info,
        gr_context,
        scale_factor,
    ) = init_window(width, height);

    // Log DPI and size info
    let logical_size = window.inner_size();
    let physical_width = (logical_size.width as f64 * scale_factor).round() as u32;
    let physical_height = (logical_size.height as f64 * scale_factor).round() as u32;
    println!("[DPI DEBUG] scale_factor: {}", scale_factor);
    println!(
        "[DPI DEBUG] logical_size: {} x {}",
        logical_size.width, logical_size.height
    );
    println!(
        "[DPI DEBUG] physical_size: {} x {}",
        physical_width, physical_height
    );

    let mut renderer = Renderer::new(
        logical_size.width as f32,
        logical_size.height as f32,
        scale_factor as f32,
    );
    renderer.set_backend(Backend::GL(surface_ptr));

    // Create and set up camera
    let viewport_size = Size {
        width: physical_width as f32,
        height: physical_height as f32,
    };
    let camera = Camera::new(viewport_size);
    renderer.set_camera(camera.clone());

    let mut app = App {
        renderer,
        surface_ptr,
        gl_surface,
        gl_context,
        gl_config,
        fb_info,
        gr_context,
        camera,
        scene,
        window,
    };

    // Initial render
    app.redraw();

    // Set up the event loop to wait for events
    el.set_control_flow(ControlFlow::Wait);
    el.run_app(&mut app).expect("Failed to run event loop");
}

pub async fn load_scene_from_file(file_path: &str) -> Scene {
    let file: String = fs::read_to_string(file_path).expect("failed to read file");
    let canvas_file = parse(&file).expect("failed to parse file");
    let nodes = canvas_file.document.nodes;
    // entry_scene_id or scenes[0]
    let scene_id = canvas_file.document.entry_scene_id.unwrap_or(
        canvas_file
            .document
            .scenes
            .keys()
            .next()
            .unwrap()
            .to_string(),
    );
    let scene = canvas_file.document.scenes.get(&scene_id).unwrap();
    Scene {
        nodes: nodes.into_iter().map(|(k, v)| (k, v.into())).collect(),
        id: scene_id,
        name: scene.name.clone(),
        transform: AffineTransform::identity(),
        children: scene.children.clone(),
    }
}

fn main() {
    println!("No-op");
    // no-op
}
