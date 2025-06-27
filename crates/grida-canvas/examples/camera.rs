use cg::node::factory::NodeFactory;
use cg::{
    node::schema::*,
    runtime::camera::Camera2D,
    runtime::scene::{Backend, Renderer},
};
use glutin::{
    config::{ConfigTemplateBuilder, GlConfig},
    context::{ContextApi, ContextAttributesBuilder, PossiblyCurrentContext},
    display::{GetGlDisplay, GlDisplay},
    prelude::{GlSurface, NotCurrentGlContext},
    surface::{Surface as GlutinSurface, SurfaceAttributesBuilder, WindowSurface},
};
use glutin_winit::DisplayBuilder;
use math2::transform::AffineTransform;
use raw_window_handle::HasRawWindowHandle;
use skia_safe::{gpu, Surface};
use std::{ffi::CString, num::NonZeroU32};
use winit::{
    event::{Event, WindowEvent},
    event_loop::EventLoop,
    window::{Window, WindowAttributes},
};

fn create_static_scene() -> Scene {
    let mut repository = cg::node::repository::NodeRepository::new();
    let nf = NodeFactory::new();

    // Create a grid of rectangles
    let mut ids = Vec::new();
    for i in 0..10 {
        for j in 0..10 {
            let mut rect = nf.create_rectangle_node();
            let id = rect.base.id.clone();
            rect.base.name = format!("Rectangle {}-{}", i, j);
            rect.transform = AffineTransform::new(i as f32 * 100.0, j as f32 * 100.0, 0.0);
            rect.size = Size {
                width: 50.0,
                height: 50.0,
            };
            repository.insert(Node::Rectangle(rect));
            ids.push(id);
        }
    }

    // Create a root group containing all rectangles
    let root_group = GroupNode {
        base: BaseNode {
            id: "root".to_string(),
            name: "Root Group".to_string(),
            active: true,
        },
        transform: AffineTransform::identity(),
        children: ids,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };

    repository.insert(Node::Group(root_group));

    Scene {
        id: "scene".to_string(),
        name: "Test Scene".to_string(),
        transform: AffineTransform::identity(),
        children: vec!["root".to_string()],
        nodes: repository,
        background_color: Some(Color(255, 255, 255, 255)),
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
    f64,
) {
    // Create event loop and window
    let el = EventLoop::new().expect("Failed to create event loop");
    let window_attributes = WindowAttributes::default()
        .with_title("Grida Canvas - Caching Demo")
        .with_inner_size(winit::dpi::LogicalSize::new(width, height));

    // Create GL config template
    let template = ConfigTemplateBuilder::new()
        .with_alpha_size(8)
        .with_transparency(true);

    // Build display and get window
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

    // Create context
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

    // Initialize GL
    gl::load_with(|s| {
        gl_config
            .display()
            .get_proc_address(CString::new(s).unwrap().as_c_str())
    });

    // Create Skia interface
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
        let mut fboid: gl::types::GLint = 0;
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

fn main() {
    let (
        surface_ptr,
        el,
        window,
        gl_surface,
        gl_context,
        gl_config,
        fb_info,
        mut gr_context,
        scale_factor,
    ) = init_window(800, 600);

    // Create renderer
    let window_ptr = &window as *const Window;
    let mut renderer = Renderer::new(
        Backend::GL(surface_ptr),
        Box::new(move || unsafe {
            (*window_ptr).request_redraw();
        }),
        Camera2D::new(Size {
            width: 800.0,
            height: 600.0,
        }),
    );

    // Create static scene
    let scene = create_static_scene();

    renderer.camera.set_position(400.0, 300.0);
    renderer.camera.set_zoom(1.0);
    renderer.update_camera();

    // Load and warm up the scene cache
    renderer.load_scene(scene.clone());
    renderer.queue();
    renderer.flush();

    // Benchmark rendering with camera transformations
    let mut frame_count = 0;
    let mut total_time = 0.0;
    let start_time = std::time::Instant::now();

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
                // Recreate GL surface
                let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
                    window
                        .raw_window_handle()
                        .expect("Failed to get window handle"),
                    NonZeroU32::new(size.width).unwrap(),
                    NonZeroU32::new(size.height).unwrap(),
                );
                let new_gl_surface = unsafe {
                    gl_config
                        .display()
                        .create_window_surface(&gl_config, &attrs)
                        .expect("Could not create gl window surface")
                };

                // Recreate Skia surface
                let backend_render_target = gpu::backend_render_targets::make_gl(
                    (size.width as i32, size.height as i32),
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

                // Update surface pointer
                unsafe { _ = Box::from_raw(surface_ptr) };
                let new_surface_ptr = Box::into_raw(Box::new(surface));
                renderer.backend = Backend::GL(new_surface_ptr);
            }
            Event::AboutToWait => {
                let frame_start = std::time::Instant::now();

                // Update camera position in a circular motion
                let elapsed = start_time.elapsed().as_secs_f32();
                let angle = elapsed * 2.0;
                let x = 400.0 + angle.cos() * 100.0;
                let y = 300.0 + angle.sin() * 100.0;
                renderer.camera.set_position(x, y);
                renderer.update_camera();

                // Render the scene
                renderer.queue();
                renderer.flush();

                if let Err(e) = gl_surface.swap_buffers(&gl_context) {
                    eprintln!("Error swapping buffers: {:?}", e);
                }

                let frame_time = frame_start.elapsed().as_secs_f32();
                total_time += frame_time;
                frame_count += 1;

                if frame_count % 60 == 0 {
                    let avg_time = total_time / frame_count as f32;
                    println!(
                        "Frame {}: {:.3}ms (avg: {:.3}ms, FPS: {:.1})",
                        frame_count,
                        frame_time * 1000.0,
                        avg_time * 1000.0,
                        1.0 / avg_time
                    );
                }

                window.request_redraw();
            }
            _ => {}
        }
    })
    .unwrap();

    // Clean up
    unsafe {
        _ = Box::from_raw(surface_ptr);
    }
}
