pub mod fps;
pub mod hit_overlay;
pub mod scheduler;

use crate::font_loader::FontLoader;
use crate::font_loader::FontMessage;
use crate::image_loader::ImageMessage;
use crate::image_loader::{ImageLoader, load_scene_images};
use crate::node::schema::*;
use crate::repository::ResourceRepository;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, RenderStats, Renderer};
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
use math2::rect;
#[allow(deprecated)]
use raw_window_handle::HasRawWindowHandle;
use skia_safe::{Rect, Surface, gpu};
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
    ZoomDelta { delta: f32 },
    Pan { tx: f32, ty: f32 },
    Redraw,
    Resize { width: u32, height: u32 },
    None,
}

fn handle_window_event(event: &WindowEvent) -> Command {
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
        WindowEvent::PinchGesture {
            device_id: _,
            delta,
            phase: _,
        } => Command::ZoomDelta {
            delta: *delta as f32,
        },
        WindowEvent::MouseWheel { delta, .. } => match delta {
            MouseScrollDelta::PixelDelta(delta) => Command::Pan {
                tx: -(delta.x as f32),
                ty: -(delta.y as f32),
            },
            _ => Command::None,
        },
        WindowEvent::RedrawRequested => Command::Redraw,
        _ => Command::None,
    }
}

fn init_window(
    width: i32,
    height: i32,
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
        .with_inner_size(LogicalSize::new(width, height));

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
    input: crate::runtime::input::InputState,
    hit_result: Option<crate::node::schema::NodeId>,
    last_hit_test: std::time::Instant,
    window: Window,
    image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    font_rx: mpsc::UnboundedReceiver<FontMessage>,
    scheduler: scheduler::FrameScheduler,
    last_frame_time: std::time::Instant,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop) {}

    fn window_event(
        &mut self,
        event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        if let WindowEvent::CursorMoved { position, .. } = &event {
            self.input.cursor = [position.x as f32, position.y as f32];
            self.perform_hit_test();
        }

        match handle_window_event(&event) {
            Command::Close => {
                self.renderer.free();
                event_loop.exit();
            }
            Command::ZoomIn => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom * 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            Command::ZoomOut => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom / 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            Command::ZoomDelta { delta } => {
                let current_zoom = self.camera.get_zoom();
                let zoom_factor = 1.0 + delta;
                if zoom_factor.is_finite() && zoom_factor > 0.0 {
                    self.camera.set_zoom(current_zoom * zoom_factor);
                }
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            Command::Pan { tx, ty } => {
                let zoom = self.camera.get_zoom();
                self.camera.translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
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
            self.renderer.add_image(msg.src.clone(), &msg.data);
            println!("📝 Registered image with renderer: {}", msg.src);
            updated = true;
        }
        if updated {
            self.renderer.invalidate_cache();
        }
    }

    fn process_font_queue(&mut self) {
        let mut updated = false;
        let mut font_count = 0;
        while let Ok(msg) = self.font_rx.try_recv() {
            // Always use the base family name for registration
            let family_name = &msg.family;
            self.renderer.add_font(family_name, &msg.data);

            // Log the registration with style information if available
            if let Some(style) = &msg.style {
                println!(
                    "📝 Registered font with renderer: '{}' (style: {})",
                    family_name, style
                );
            } else {
                println!("📝 Registered font with renderer: '{}'", family_name);
            }
            font_count += 1;
            updated = true;
        }
        if updated {
            self.renderer.invalidate_cache();

            // Print font repository information after processing fonts
            if font_count > 0 {
                self.print_font_repository_info();
            }
        }
    }

    fn print_font_repository_info(&self) {
        let font_repo = self.renderer.font_repository.borrow();
        let family_count = font_repo.family_count();
        let total_font_count = font_repo.total_font_count();

        println!("\n🔍 Font Repository Status:");
        println!("===========================");
        println!("Font families: {}", family_count);
        println!("Total fonts: {}", total_font_count);

        if family_count > 0 {
            println!("\n📋 Registered font families:");
            println!("---------------------------");
            for (i, (family_name, font_variants)) in font_repo.iter().enumerate() {
                println!(
                    "  {}. {} ({} variants)",
                    i + 1,
                    family_name,
                    font_variants.len()
                );
                for (j, font_data) in font_variants.iter().enumerate() {
                    println!("     - Variant {}: {} bytes", j + 1, font_data.len());
                }
            }
        }
        println!("✅ Font repository information printed");
    }

    /// Hit test the current cursor position and store the result.
    fn perform_hit_test(&mut self) {
        const HIT_TEST_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
        if self.last_hit_test.elapsed() < HIT_TEST_INTERVAL {
            return;
        }
        self.last_hit_test = std::time::Instant::now();

        let camera = &self.camera;
        let point = camera.screen_to_canvas_point(self.input.cursor);
        let tester = crate::hit_test::HitTester::new(self.renderer.scene_cache());
        self.hit_result = tester.hit_first(point);
        println!("hit result: {:?}", self.hit_result);
    }

    fn redraw(&mut self) {
        let __frame_start = std::time::Instant::now();
        let __frame_delta = __frame_start.saturating_duration_since(self.last_frame_time);

        let __queue_start = std::time::Instant::now();
        self.process_image_queue();
        self.process_font_queue();
        let __queue_time = __queue_start.elapsed();

        let stats = match self.renderer.flush() {
            Some(stats) => stats,
            None => return,
        };

        // fps meter
        let fps = self.scheduler.average_fps();
        unsafe {
            let surface = &mut *self.surface_ptr;
            fps::FpsMeter::draw(surface, fps);
            let hit_rect = if let Some(id) = self.hit_result.as_ref() {
                if let Some(bounds) = self.renderer.scene_cache().geometry.get_render_bounds(id) {
                    let screen_rect = rect::transform(bounds, &self.camera.view_matrix());
                    Some(Rect::from_xywh(
                        screen_rect.x,
                        screen_rect.y,
                        screen_rect.width,
                        screen_rect.height,
                    ))
                } else {
                    None
                }
            } else {
                None
            };
            hit_overlay::HitOverlay::draw(surface, self.hit_result.as_deref().zip(hit_rect));
            if let Some(mut ctx) = surface.recording_context() {
                if let Some(mut direct) = ctx.as_direct_context() {
                    direct.flush_and_submit();
                }
            }
        }

        if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
            eprintln!("Error swapping buffers: {:?}", e);
        }

        // Apply frame pacing
        let __sleep_start = std::time::Instant::now();
        self.scheduler.sleep_to_maintain_fps();
        let __sleep_time = __sleep_start.elapsed();

        let __total_frame_time = __frame_start.elapsed();
        println!(
            "fps*: {:.0} | t: {:.2}ms | render: {:.1}ms | flush: {:.1}ms | frame: {:.1}ms | list: {:.1}ms ({:?}) | draw: {:.1}ms | $:pic: {:?} ({:?} use) | $:geo: {:?} | tiles: {:?} ({:?} use) | q: {:?} | z: {:?}",
            1.0 / __total_frame_time.as_secs_f64(),
            __total_frame_time.as_secs_f64() * 1000.0,
            stats.total_duration.as_secs_f64() * 1000.0,
            stats.flush_duration.as_secs_f64() * 1000.0,
            stats.frame_duration.as_secs_f64() * 1000.0,
            stats.frame.display_list_duration.as_secs_f64() * 1000.0,
            stats.frame.display_list_size_estimated,
            stats.draw.painter_duration.as_secs_f64() * 1000.0,
            stats.draw.cache_picture_size,
            stats.draw.cache_picture_used,
            stats.draw.cache_geometry_size,
            stats.draw.tiles_total,
            stats.draw.tiles_used,
            __queue_time,
            __sleep_time
        );

        self.last_frame_time = __frame_start;
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
        self.renderer.queue();
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
    let width = 1080;
    let height = 1080;

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
    ) = init_window(width, height);

    let (tx, rx) = mpsc::unbounded_channel();
    let (font_tx, font_rx) = mpsc::unbounded_channel();
    let proxy = el.create_proxy();

    let mut renderer = Renderer::new();
    renderer.set_raf_callback({
        let proxy = proxy.clone();
        move || {
            let _ = proxy.send_event(());
        }
    });
    renderer.set_backend(Backend::GL(surface_ptr));

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
    let camera = Camera2D::new(Size {
        width: width as f32 * scale_factor as f32,
        height: height as f32 * scale_factor as f32,
    });
    // let camera = Camera2D::new(Size {
    //     width: width as f32,
    //     height: height as f32,
    // });
    renderer.set_camera(camera.clone());
    renderer.load_scene(scene.clone());

    let mut app = App {
        renderer,
        surface_ptr,
        gl_surface,
        gl_context,
        gl_config,
        fb_info,
        gr_context,
        camera,
        input: crate::runtime::input::InputState::default(),
        hit_result: None,
        last_hit_test: std::time::Instant::now(),
        window,
        image_rx: rx,
        font_rx,
        scheduler: scheduler::FrameScheduler::new(144).with_max_fps(144),
        last_frame_time: std::time::Instant::now(),
    };

    println!("🎭 Starting event loop...");
    el.run_app(&mut app).unwrap();
}
