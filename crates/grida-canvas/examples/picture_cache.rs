use cg::scheduler::FrameScheduler;
use gl_rs as gl;
use glutin::{
    config::{ConfigTemplateBuilder, GlConfig},
    context::{ContextApi, ContextAttributesBuilder, PossiblyCurrentContext},
    display::{GetGlDisplay, GlDisplay},
    prelude::{GlSurface, NotCurrentGlContext},
    surface::{Surface as GlutinSurface, SurfaceAttributesBuilder, SwapInterval, WindowSurface},
};
use glutin_winit::DisplayBuilder;
use raw_window_handle::HasRawWindowHandle;
use skia_safe::{Canvas, Color, Paint, Picture, PictureRecorder, Rect, Surface};
use std::{ffi::CString, num::NonZeroU32, time::Instant};
use winit::{
    event::{Event, WindowEvent},
    event_loop::EventLoop,
    window::{Window, WindowAttributes},
};

struct CachedScene {
    picture: Picture,
    width: f32,
    height: f32,
}

impl CachedScene {
    fn new(width: f32, height: f32) -> Self {
        // Create a recorder to capture the static scene
        let mut recorder = PictureRecorder::new();
        let bounds = Rect::new(0.0, 0.0, width, height);
        let canvas = recorder.begin_recording(bounds, None);

        // Draw some static content
        Self::draw_static_content(canvas);

        // End recording and create the picture
        let picture = recorder.finish_recording_as_picture(None).unwrap();

        Self {
            picture,
            width,
            height,
        }
    }

    fn draw_static_content(canvas: &Canvas) {
        println!("[cache] Drawing static content (should only appear once)");
        // Draw a grid of rectangles
        for i in 0..10 {
            for j in 0..10 {
                let mut paint = Paint::default();
                paint.set_color(Color::from_argb(255, 100, 100, 100));

                let x = i as f32 * 100.0;
                let y = j as f32 * 100.0;
                let rect = Rect::new(x, y, x + 50.0, y + 50.0);
                canvas.draw_rect(rect, &paint);
            }
        }
    }

    fn render(&self, canvas: &Canvas, camera_x: f32, camera_y: f32, zoom: f32) {
        canvas.save();

        // Apply camera transform
        canvas.translate((camera_x, camera_y));
        canvas.scale((zoom, zoom));

        // Draw the cached picture
        canvas.draw_picture(&self.picture, None, None);

        canvas.restore();
    }
}

fn init_window(
    width: i32,
    height: i32,
) -> (
    *mut Surface,
    EventLoop<()>,
    winit::window::Window,
    GlutinSurface<WindowSurface>,
    PossiblyCurrentContext,
    glutin::config::Config,
    skia_safe::gpu::gl::FramebufferInfo,
    skia_safe::gpu::DirectContext,
    f64,
) {
    let el = EventLoop::new().expect("Failed to create event loop");
    let window_attributes = winit::window::WindowAttributes::default()
        .with_title("Skia Picture Cache Demo")
        .with_inner_size(winit::dpi::LogicalSize::new(width, height));
    let template = ConfigTemplateBuilder::new()
        .with_alpha_size(8)
        .with_transparency(true);
    let display_builder = DisplayBuilder::new().with_window_attributes(window_attributes.into());
    let (window, gl_config) = display_builder
        .build(&el, template, |configs| {
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
    let window = window.expect("Could not create window with OpenGL context");
    let raw_window_handle = window
        .raw_window_handle()
        .expect("Failed to get window handle");
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

    // Enable VSync
    gl_surface
        .set_swap_interval(&gl_context, SwapInterval::Wait(NonZeroU32::new(1).unwrap()))
        .expect("Failed to set swap interval");

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
    let fb_info = {
        let mut fboid: gl::types::GLint = 0;
        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
        skia_safe::gpu::gl::FramebufferInfo {
            fboid: fboid.try_into().unwrap(),
            format: skia_safe::gpu::gl::Format::RGBA8.into(),
            ..Default::default()
        }
    };
    let backend_render_target = skia_safe::gpu::backend_render_targets::make_gl(
        (width as i32, height as i32),
        gl_config.num_samples() as usize,
        gl_config.stencil_size() as usize,
        fb_info,
    );
    let surface = skia_safe::gpu::surfaces::wrap_backend_render_target(
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

fn main() {
    let (
        surface_ptr,
        el,
        window,
        mut gl_surface,
        gl_context,
        gl_config,
        fb_info,
        mut gr_context,
        scale_factor,
    ) = init_window(800, 600);

    // SAFETY: We own the surface pointer
    let surface = unsafe { &mut *surface_ptr };
    let size = window.inner_size();
    let scene = CachedScene::new(size.width as f32, size.height as f32);
    let mut camera_x = 0.0;
    let mut camera_y = 0.0;
    let mut zoom = 1.0;
    let start_time = Instant::now();
    let mut frame_count = 0;
    let mut last_fps_time = Instant::now();
    let mut last_frame_time = Instant::now();

    // Create frame scheduler with 120 FPS target and 144 FPS max
    let mut scheduler = FrameScheduler::new(120).with_max_fps(144);

    // Enable pre-present notification for better frame timing
    window.pre_present_notify();

    el.run(move |event, elwt| {
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                elwt.exit();
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(size),
                ..
            } => {
                // Recreate GL surface and Skia surface on resize
                let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
                    window
                        .raw_window_handle()
                        .expect("Failed to get window handle"),
                    NonZeroU32::new(size.width).unwrap(),
                    NonZeroU32::new(size.height).unwrap(),
                );
                gl_surface = unsafe {
                    gl_config
                        .display()
                        .create_window_surface(&gl_config, &attrs)
                        .expect("Could not create gl window surface")
                };
                let backend_render_target = skia_safe::gpu::backend_render_targets::make_gl(
                    (size.width as i32, size.height as i32),
                    gl_config.num_samples() as usize,
                    gl_config.stencil_size() as usize,
                    fb_info,
                );
                let new_surface = skia_safe::gpu::surfaces::wrap_backend_render_target(
                    &mut gr_context,
                    &backend_render_target,
                    skia_safe::gpu::SurfaceOrigin::BottomLeft,
                    skia_safe::ColorType::RGBA8888,
                    None,
                    None,
                )
                .expect("Could not create skia surface");
                unsafe { _ = Box::from_raw(surface_ptr) };
                let new_surface_ptr = Box::into_raw(Box::new(new_surface));
                // SAFETY: update surface pointer
                let surface = unsafe { &mut *new_surface_ptr };
                // Optionally, re-record the scene if you want to match new size
                // scene = CachedScene::new(size.width as f32, size.height as f32);
            }
            Event::WindowEvent {
                event: WindowEvent::RedrawRequested,
                ..
            } => {
                let now = Instant::now();
                let elapsed = now.duration_since(start_time).as_secs_f32();
                let angle = elapsed * 2.0;
                camera_x = angle.cos() * 100.0;
                camera_y = angle.sin() * 100.0;

                // Add zoom animation
                let zoom_angle = elapsed * 1.0; // Slower zoom cycle
                zoom = 1.0 + zoom_angle.sin() * 0.5; // Oscillate between 0.5 and 1.5

                // Clear and render
                let canvas = surface.canvas();
                canvas.clear(Color::from_argb(255, 255, 255, 255));
                scene.render(canvas, camera_x, camera_y, zoom);

                // Flush GPU commands
                if let Some(mut gr_ctx) = surface.recording_context() {
                    if let Some(mut direct_ctx) = gr_ctx.as_direct_context() {
                        direct_ctx.flush_and_submit();
                        // Wait for GPU to finish using flush_and_submit
                        direct_ctx.flush_and_submit();
                    }
                }

                // Swap buffers
                if let Err(e) = gl_surface.swap_buffers(&gl_context) {
                    eprintln!("Error swapping buffers: {:?}", e);
                }

                // Frame timing and pacing
                let frame_time = now.duration_since(last_frame_time);
                scheduler.sleep_to_maintain_fps();
                last_frame_time = now;

                // FPS calculation
                frame_count += 1;
                if now.duration_since(last_fps_time).as_secs_f32() >= 1.0 {
                    println!(
                        "FPS: {} (Target: {:.1}, Frame Time: {:.2}ms)",
                        frame_count,
                        scheduler.average_fps(),
                        frame_time.as_secs_f32() * 1000.0
                    );
                    frame_count = 0;
                    last_fps_time = now;
                }

                // Request next frame
                window.request_redraw();
            }
            _ => {}
        }
    })
    .unwrap();
}
