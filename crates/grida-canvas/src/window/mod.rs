pub mod scheduler;

use crate::font_loader::FontLoader;
use crate::font_loader::FontMessage;
use crate::image_loader::ImageMessage;
use crate::image_loader::{ImageLoader, load_scene_images};
use crate::node::schema::*;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, Renderer};
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
use skia_safe::{Surface, gpu};
use std::{ffi::CString, num::NonZeroU32};
use tokio::sync::mpsc;
use winit::event::{ElementState, KeyEvent, MouseScrollDelta, WindowEvent};
use winit::keyboard::Key;
use winit::{
    application::ApplicationHandler,
    dpi::LogicalSize,
    event_loop::EventLoop,
    window::{Window, WindowAttributes},
};

#[derive(Debug)]
enum Command {
    Close,
    ZoomIn,
    ZoomOut,
    Pan { x: f32, y: f32, zoom: f32 },
    Redraw,
    Resize { width: u32, height: u32 },
    None,
}

fn handle_window_event(event: WindowEvent, current_zoom: f32) -> Command {
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
                    x: -x * pan_speed,
                    y: -y * pan_speed,
                    zoom: current_zoom,
                }
            }
            MouseScrollDelta::PixelDelta(delta) => {
                let pan_speed = 0.5;
                Command::Pan {
                    x: -(delta.x as f32) * pan_speed,
                    y: -(delta.y as f32) * pan_speed,
                    zoom: current_zoom,
                }
            }
        },
        WindowEvent::RedrawRequested => Command::Redraw,
        _ => Command::None,
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
    println!("🔄 Window process started with PID: {}", std::process::id());

    // Create event loop and window
    let el = EventLoop::new().expect("Failed to create event loop");
    let window_attributes = WindowAttributes::default()
        .with_title("Grida - grida-canvas / glutin / skia-safe::gpu::gl")
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
    #[allow(deprecated)]
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
    camera: Camera2D,
    scene: Scene,
    window: Window,
    image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    font_rx: mpsc::UnboundedReceiver<FontMessage>,
    scheduler: scheduler::FrameScheduler,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop) {}

    fn window_event(
        &mut self,
        event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        match handle_window_event(event, self.camera.get_zoom()) {
            Command::Close => {
                self.renderer.free();
                event_loop.exit();
            }
            Command::ZoomIn => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom / 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.redraw();
                }
            }
            Command::ZoomOut => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom * 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.redraw();
                }
            }
            Command::Pan { x, y, zoom } => {
                let current_x = self.camera.transform.x();
                let current_y = self.camera.transform.y();
                self.camera
                    .set_position(current_x + x * zoom, current_y + y * zoom);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.redraw();
                }
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

    fn user_event(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop, _event: ()) {
        self.window.request_redraw();
    }
}

impl App {
    fn process_image_queue(&mut self) {
        let mut updated = false;
        while let Ok(msg) = self.image_rx.try_recv() {
            println!("📥 Received image data for: {}", msg.src);
            if let Some(image) = self.renderer.create_image(&msg.data) {
                println!("✅ Successfully created image from data: {}", msg.src);
                self.renderer.register_image(msg.src.clone(), image);
                println!("📝 Registered image with renderer: {}", msg.src);
                updated = true;
            } else {
                println!("❌ Failed to create image from data: {}", msg.src);
            }
        }
        if updated {
            self.renderer.invalidate_cache();
            self.renderer.cache_scene(&self.scene);
        }
    }

    fn process_font_queue(&mut self) {
        let mut updated = false;
        while let Ok(msg) = self.font_rx.try_recv() {
            println!("📥 Received font data for family: '{}'", msg.family);
            // Use postscript name as alias if available, otherwise fallback to family
            let alias = &msg.family;
            self.renderer.add_font(alias, &msg.data);
            println!("📝 Registered font with renderer: '{}'", alias);

            updated = true;
        }
        if updated {
            self.renderer.invalidate_cache();
            self.renderer.cache_scene(&self.scene);
        }
    }

    fn redraw(&mut self) {
        // println!("🎨 redraw...");
        self.process_image_queue();
        self.process_font_queue();
        let surface = unsafe { &mut *self.surface_ptr };
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);

        self.renderer.render_scene(&self.scene);
        self.renderer.flush();

        if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
            eprintln!("Error swapping buffers: {:?}", e);
        }

        // Apply frame pacing
        self.scheduler.sleep_to_maintain_fps();
    }

    fn resize(&mut self, width: u32, height: u32) {
        // Recreate GL surface
        let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
            #[allow(deprecated)]
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
        unsafe { _ = Box::from_raw(self.surface_ptr) };
        self.surface_ptr = Box::into_raw(Box::new(surface));
        self.renderer.set_backend(Backend::GL(self.surface_ptr));
        self.renderer.invalidate_cache();
        self.redraw();
    }
}

#[allow(dead_code)]
pub async fn run_demo_window(scene: Scene) {
    run_demo_window_with(scene, |_, _, _, _| {}).await;
}

pub async fn run_demo_window_with<F>(scene: Scene, init: F)
where
    F: FnOnce(
        &mut Renderer,
        mpsc::UnboundedSender<ImageMessage>,
        mpsc::UnboundedSender<FontMessage>,
        winit::event_loop::EventLoopProxy<()>,
    ),
{
    println!("🚀 Starting demo window...");
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
    ) = init_window(1080, 1080);

    let (tx, rx) = mpsc::unbounded_channel();
    let (font_tx, font_rx) = mpsc::unbounded_channel();
    let proxy = el.create_proxy();

    let mut renderer = Renderer::new(1080.0, 1080.0, scale_factor as f32);
    renderer.set_backend(Backend::GL(surface_ptr));
    renderer.set_cache_strategy(crate::cache::picture::PictureCacheStrategy { depth: 1 });

    // Initialize the image loader in lifecycle mode
    println!("📸 Initializing image loader...");
    let mut image_loader = ImageLoader::new_lifecycle(tx.clone(), proxy.clone());
    let _font_loader = FontLoader::new_lifecycle(font_tx.clone(), proxy.clone());

    // Load all images in the scene - non-blocking
    println!("🔄 Starting to load scene images in background...");
    let scene_clone = scene.clone();
    tokio::spawn(async move {
        load_scene_images(&mut image_loader, &scene_clone).await;
        println!("✅ Scene images loading completed in background");
    });

    // Call the init function
    init(&mut renderer, tx, font_tx, proxy);

    // Create and set up camera
    let viewport_size = Size {
        width: 1080.0,
        height: 1080.0,
    };
    let camera = Camera2D::new(viewport_size);
    renderer.set_camera(camera.clone());
    renderer.cache_scene(&scene);

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
        image_rx: rx,
        font_rx,
        scheduler: scheduler::FrameScheduler::new(120).with_max_fps(144),
    };

    println!("🎭 Starting event loop...");
    el.run_app(&mut app).unwrap();
}
