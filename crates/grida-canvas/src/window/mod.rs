pub mod command;
pub mod fps;
pub mod hit_overlay;
pub mod ruler;
pub mod scheduler;
pub mod state;
pub mod stats_overlay;
pub mod tile_overlay;

use crate::font_loader::FontLoader;
use crate::font_loader::FontMessage;
use crate::image_loader::ImageMessage;
use crate::image_loader::{ImageLoader, load_scene_images};
use crate::node::schema::*;
use crate::repository::ResourceRepository;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, Renderer};
use crate::window::command::WindowCommand;
use crate::window::state::GpuState;
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

fn handle_window_event(event: &WindowEvent) -> WindowCommand {
    match event {
        WindowEvent::CloseRequested => WindowCommand::Close,
        WindowEvent::Resized(size) => WindowCommand::Resize {
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
            Key::Character(c) if c == "=" => WindowCommand::ZoomIn,
            Key::Character(c) if c == "-" => WindowCommand::ZoomOut,
            _ => WindowCommand::None,
        },
        WindowEvent::PinchGesture {
            device_id: _,
            delta,
            phase: _,
        } => WindowCommand::ZoomDelta {
            delta: *delta as f32,
        },
        WindowEvent::MouseWheel { delta, .. } => match delta {
            MouseScrollDelta::PixelDelta(delta) => WindowCommand::Pan {
                tx: -(delta.x as f32),
                ty: -(delta.y as f32),
            },
            _ => WindowCommand::None,
        },
        WindowEvent::RedrawRequested => WindowCommand::Redraw,
        _ => WindowCommand::None,
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

    // Get framebuffer info
    let fb_info = {
        let mut fboid: GLint = 0;
        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
        gpu::gl::FramebufferInfo {
            fboid: fboid.try_into().unwrap_or_default(),
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
    gpu_state: GpuState,
    camera: Camera2D,
    input: crate::runtime::input::InputState,
    hit_result: Option<crate::node::schema::NodeId>,
    last_hit_test: std::time::Instant,
    window: Window,
    image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    font_rx: mpsc::UnboundedReceiver<FontMessage>,
    scheduler: scheduler::FrameScheduler,
    last_frame_time: std::time::Instant,
    last_stats: Option<String>,
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
            WindowCommand::Close => {
                self.renderer.free();
                event_loop.exit();
            }
            WindowCommand::ZoomIn => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom * 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::ZoomOut => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom / 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::ZoomDelta { delta } => {
                let current_zoom = self.camera.get_zoom();
                let zoom_factor = 1.0 + delta;
                if zoom_factor.is_finite() && zoom_factor > 0.0 {
                    self.camera
                        .set_zoom_at(current_zoom * zoom_factor, self.input.cursor);
                }
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::Pan { tx, ty } => {
                let zoom = self.camera.get_zoom();
                self.camera.translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::Resize { width, height } => {
                self.resize(width, height);
            }
            WindowCommand::Redraw => {
                self.redraw();
            }
            WindowCommand::None => {}
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
        const HIT_TEST_INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);
        if self.last_hit_test.elapsed() < HIT_TEST_INTERVAL {
            return;
        }
        self.last_hit_test = std::time::Instant::now();

        let camera = &self.camera;
        let point = camera.screen_to_canvas_point(self.input.cursor);
        let tester = crate::hit_test::HitTester::new(self.renderer.scene_cache());

        let new_hit_result = tester.hit_first(point);
        if self.hit_result != new_hit_result {
            self.renderer.queue();
        }
        self.hit_result = new_hit_result;
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

        let mut overlay_flush_time = std::time::Duration::ZERO;
        let overlay_draw_time: std::time::Duration;

        unsafe {
            let __overlay_start = std::time::Instant::now();
            let surface = &mut *self.surface_ptr;
            fps::FpsMeter::draw(surface, self.scheduler.average_fps());
            if let Some(s) = self.last_stats.as_deref() {
                stats_overlay::StatsOverlay::draw(surface, s);
            }
            hit_overlay::HitOverlay::draw(
                surface,
                self.hit_result.as_ref(),
                &self.camera,
                self.renderer.scene_cache(),
                &self.renderer.font_repository,
            );
            if self.renderer.debug_tiles() {
                tile_overlay::TileOverlay::draw(
                    surface,
                    &self.camera,
                    self.renderer.scene_cache().tile.tiles(),
                );
            }
            ruler::Ruler::draw(surface, &self.camera);
            if let Some(mut ctx) = surface.recording_context() {
                if let Some(mut direct) = ctx.as_direct_context() {
                    let __overlay_flush_start = std::time::Instant::now();
                    direct.flush_and_submit();
                    overlay_flush_time = __overlay_flush_start.elapsed();
                }
            }
            overlay_draw_time = __overlay_start.elapsed();
        }

        if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
            eprintln!("Error swapping buffers: {:?}", e);
        }

        // Apply frame pacing
        let __sleep_start = std::time::Instant::now();
        self.scheduler.sleep_to_maintain_fps();
        let __sleep_time = __sleep_start.elapsed();

        let __total_frame_time = __frame_start.elapsed();
        let stat_string = format!(
            "fps*: {:.0} | t: {:.2}ms | render: {:.1}ms | flush: {:.1}ms | overlays: {:.1}ms | frame: {:.1}ms | list: {:.1}ms ({:?}) | draw: {:.1}ms | $:pic: {:?} ({:?} use) | $:geo: {:?} | tiles: {:?} ({:?} use) | q: {:?} | z: {:?}",
            1.0 / __total_frame_time.as_secs_f64(),
            __total_frame_time.as_secs_f64() * 1000.0,
            stats.total_duration.as_secs_f64() * 1000.0,
            stats.flush_duration.as_secs_f64() * 1000.0,
            (overlay_flush_time.as_secs_f64() + overlay_draw_time.as_secs_f64()) * 1000.0,
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
        println!("{}", stat_string);
        self.last_stats = Some(stat_string);

        self.last_frame_time = __frame_start;

        if stats.frame.should_repaint_all {
            self.renderer.queue();
        }
    }

    fn resize(&mut self, width: u32, height: u32) {
        // Resize the existing GL surface instead of recreating it
        self.gl_surface.resize(
            &self.gl_context,
            NonZeroU32::new(width).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
            NonZeroU32::new(height).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
        );

        // Recreate Skia surface
        let backend_render_target = gpu::backend_render_targets::make_gl(
            (width as i32, height as i32),
            self.gl_config.num_samples() as usize,
            self.gl_config.stencil_size() as usize,
            self.gpu_state.framebuffer_info,
        );
        let surface = gpu::surfaces::wrap_backend_render_target(
            &mut self.gpu_state.context,
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

        // Update camera viewport size to match the new surface dimensions
        self.camera.size = Size {
            width: width as f32,
            height: height as f32,
        };
        if self.renderer.set_camera(self.camera.clone()) {
            self.renderer.queue();
        }
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

    renderer.set_debug_tiles(true);
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
        gpu_state: GpuState {
            context: gr_context,
            framebuffer_info: fb_info,
        },
        camera,
        input: crate::runtime::input::InputState::default(),
        hit_result: None,
        last_hit_test: std::time::Instant::now(),
        window,
        image_rx: rx,
        font_rx,
        scheduler: scheduler::FrameScheduler::new(144).with_max_fps(144),
        last_frame_time: std::time::Instant::now(),
        last_stats: None,
    };

    println!("🎭 Starting event loop...");
    if let Err(e) = el.run_app(&mut app) {
        eprintln!("Event loop error: {:?}", e);
    }
}
