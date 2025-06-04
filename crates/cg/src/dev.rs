use cg::draw::{Backend, Renderer};
use cg::io::parse;
use cg::schema::FeDropShadow;
use cg::schema::FilterEffect;
use cg::schema::{
    BaseNode, BlendMode, Color, ContainerNode, EllipseNode, FontWeight, GradientStop, GroupNode,
    ImageNode, LineNode, Node, NodeMap, Paint, PathNode, PolygonNode, RadialGradientPaint,
    RectangleNode, RectangularCornerRadius, Scene, Size, SolidPaint, TextAlign, TextAlignVertical,
    TextDecoration, TextSpanNode, TextStyle,
};
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
use skia_safe::{Image, Surface, gpu};
use std::fs;
use std::{
    ffi::CString,
    num::NonZeroU32,
    time::{Duration, Instant},
};
use winit::{
    application::ApplicationHandler,
    dpi::LogicalSize,
    event::WindowEvent,
    event_loop::{ControlFlow, EventLoop},
    window::{Window, WindowAttributes},
};

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
}

impl ApplicationHandler for App {
    fn resumed(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop) {}

    fn window_event(
        &mut self,
        event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        match event {
            WindowEvent::CloseRequested => {
                self.renderer.free();
                event_loop.exit();
            }
            WindowEvent::Resized(_) => {
                // Ignore resize events
            }
            WindowEvent::RedrawRequested => {
                // Do nothing - we only render once at startup
            }
            _ => {}
        }
    }
}

async fn demo_json() -> Scene {
    let path = "resources/document-2.json";
    // let path = "resources/document.json";
    // let path = "resources/hero-main-demo.grida";
    let file: String = fs::read_to_string(path).expect("failed to read file");
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

async fn demo_static(renderer: &mut Renderer) -> Scene {
    let font_caveat_path: &str = "resources/Caveat-VariableFont_wght.ttf";
    let font_caveat_data = fs::read(font_caveat_path).expect("failed to read file");
    let font_caveat_family = "Caveat".to_string();
    let font_roboto_url = "https://storage.googleapis.com/skia-cdn/misc/Roboto-Regular.ttf";
    let font_roboto_family = "Roboto".to_string();

    // load the font
    let font_load_start = Instant::now();
    let font_data = reqwest::get(font_roboto_url)
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();

    renderer.add_font(&font_caveat_data);
    renderer.add_font(&font_data);

    println!("Font load time: {:?}", font_load_start.elapsed());

    // Add a background rectangle node
    let background_rect_node = RectangleNode {
        base: BaseNode {
            id: "background_rect".to_string(),
            name: "Background Rect".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        opacity: 1.0,
        transform: AffineTransform::identity(),
        size: Size {
            width: 800.0,
            height: 600.0,
        },
        corner_radius: RectangularCornerRadius::all(0.0),
        fill: Paint::Solid(SolidPaint {
            color: Color(230, 240, 255, 255), // Light blue for visibility
        }),
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0), // No stroke
        }),
        stroke_width: 0.0,
        effect: None,
    };

    // Preload image before timing
    let demo_image_id = "demo_image";
    let demo_image_url = "https://grida.co/images/abstract-placeholder.jpg".to_string();
    println!("Loading image...");
    let image_load_start = Instant::now();
    if let Ok(response) = reqwest::get(&demo_image_url).await {
        if let Ok(bytes) = response.bytes().await {
            if let Some(image) = Image::from_encoded(skia_safe::Data::new_copy(&bytes)) {
                renderer.add_image(demo_image_id.to_string(), image);
            }
        }
    }
    println!("Image load time: {:?}", image_load_start.elapsed());

    // Create a test image node with URL
    let image_node = ImageNode {
        base: BaseNode {
            id: "test_image".to_string(),
            name: "Test Image".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        transform: AffineTransform::new(50.0, 50.0, 0.0),
        size: Size {
            width: 200.0,
            height: 200.0,
        },
        corner_radius: RectangularCornerRadius::all(20.0),
        fill: Paint::Solid(SolidPaint {
            color: Color(255, 255, 255, 255),
        }),
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
        }),
        stroke_width: 2.0,
        effect: Some(FilterEffect::DropShadow(FeDropShadow {
            dx: 4.0,
            dy: 4.0,
            blur: 8.0,
            color: Color(0, 0, 0, 77),
        })),
        opacity: 1.0,
        _ref: demo_image_id.to_string(),
    };

    // Create a test rectangle node with linear gradient
    let rect_node = RectangleNode {
        base: BaseNode {
            id: "test_rect".to_string(),
            name: "Test Rectangle".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        opacity: 1.0,
        transform: AffineTransform::new(50.0, 300.0, 45.0),
        size: Size {
            width: 200.0,
            height: 100.0,
        },
        corner_radius: RectangularCornerRadius::all(10.0),
        fill: Paint::Solid(SolidPaint {
            color: Color(255, 0, 0, 255), // Red fill
        }),
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
        }),
        stroke_width: 2.0,
        effect: Some(FilterEffect::DropShadow(FeDropShadow {
            dx: 4.0,
            dy: 4.0,
            blur: 8.0,
            color: Color(0, 0, 0, 77), // Semi-transparent black (0.3 * 255 ≈ 77)
        })),
    };

    // Create a test ellipse node with radial gradient and a visible stroke
    let ellipse_node = EllipseNode {
        base: BaseNode {
            id: "test_ellipse".to_string(),
            name: "Test Ellipse".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Multiply, // Example of using a different blend mode
        opacity: 1.0,
        transform: AffineTransform::new(300.0, 300.0, 45.0), // Rotated 45 degrees
        size: Size {
            width: 200.0,
            height: 200.0,
        },
        fill: Paint::RadialGradient(RadialGradientPaint {
            id: "gradient2".to_string(),
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(0, 255, 0, 255), // Green
                },
                GradientStop {
                    offset: 0.5,
                    color: Color(255, 255, 0, 255), // Yellow
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 0, 255, 255), // Magenta
                },
            ],
        }),
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
        }),
        stroke_width: 6.0,
    };

    // Create a test polygon node (pentagon)
    let pentagon_points = (0..5)
        .map(|i| {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 5.0 - std::f32::consts::FRAC_PI_2;
            let radius = 100.0;
            let x = 550.0 + radius * angle.cos();
            let y = 150.0 + radius * angle.sin();
            (x, y)
        })
        .collect::<Vec<_>>();
    let polygon_node = PolygonNode {
        base: BaseNode {
            id: "test_polygon".to_string(),
            name: "Test Polygon".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Screen, // Example of using Screen blend mode
        transform: AffineTransform::identity(),
        points: pentagon_points,
        fill: Paint::Solid(SolidPaint {
            color: Color(255, 200, 0, 255), // Orange fill
        }),
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
        }),
        stroke_width: 5.0,
        opacity: 1.0,
    };

    // Create a test regular polygon node (hexagon)
    let regular_polygon_node = cg::schema::RegularPolygonNode {
        base: BaseNode {
            id: "test_regular_polygon".to_string(),
            name: "Test Regular Polygon".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Overlay, // Example of using Overlay blend mode
        transform: AffineTransform::new(300.0, 300.0, 0.0),
        size: Size {
            width: 200.0,
            height: 200.0,
        },
        point_count: 6, // hexagon
        fill: Paint::Solid(SolidPaint {
            color: Color(0, 200, 255, 255), // Cyan fill
        }),
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
        }),
        stroke_width: 4.0,
        opacity: 0.5,
    };

    // Create a test text span node
    let text_span_node = TextSpanNode {
        base: BaseNode {
            id: "test_text".to_string(),
            name: "Test Text".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        transform: AffineTransform::new(50.0, 50.0, 15.0),
        size: Size {
            width: 300.0,
            height: 200.0,
        },
        text: "Grida Canvas SKIA Bindings Backend".to_string(),
        text_style: TextStyle {
            text_decoration: TextDecoration::LineThrough,
            // font_family: font_roboto_family.clone(),
            font_family: font_caveat_family.clone(),
            font_size: 32.0,
            font_weight: FontWeight::new(900),
            letter_spacing: None,
            line_height: None,
        },
        text_align: TextAlign::Center,
        text_align_vertical: TextAlignVertical::Center,
        fill: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // White text
        }),
        stroke: Some(Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
        })),
        stroke_width: Some(4.0),
        opacity: 1.0,
    };

    // Create a test path node
    let path_node = PathNode {
        base: BaseNode {
            id: "test_path".to_string(),
            name: "Test Path".to_string(),
            active: true,
        },
        // blend_mode: BlendMode::Normal,
        opacity: 1.0,
        transform: AffineTransform::new(200.0, 200.0, 0.0),
        fill: Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black fill
        }),
        data: "M50 150H0v-50h50v50ZM150 150h-50v-50h50v50ZM100 100H50V50h50v50ZM50 50H0V0h50v50ZM150 50h-50V0h50v50Z".to_string(),
        stroke: Paint::Solid(SolidPaint {
            color: Color(255, 0, 0, 255), // Red stroke
        }),
        stroke_width: 4.0,
    };

    // Create a test line node with solid color
    let line_node = LineNode {
        base: BaseNode {
            id: "test_line".to_string(),
            name: "Test Line".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        opacity: 0.8,
        transform: AffineTransform::new(0.0, 700.0, 0.0),
        size: Size {
            width: 800.0,
            height: 0.0, // ignored
        },
        stroke: Paint::Solid(SolidPaint {
            color: Color(0, 255, 0, 255), // Green color
        }),
        stroke_width: 4.0,
    };

    // Create a group node for the shapes (rectangle, ellipse, polygon)
    let shapes_group_node = GroupNode {
        base: BaseNode {
            id: "shapes_group".to_string(),
            name: "Shapes Group".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        transform: AffineTransform::new(0.0, 0.0, -15.0),
        children: vec![
            "test_rect".to_string(),
            "test_ellipse".to_string(),
            "test_polygon".to_string(),
            "test_regular_polygon".to_string(),
        ],
        opacity: 0.8,
    };

    // Create a root group node containing the shapes group, text, and line
    let root_container_node = ContainerNode {
        base: BaseNode {
            id: "root_container".to_string(),
            name: "Root Container".to_string(),
            active: true,
        },
        blend_mode: BlendMode::Normal,
        transform: AffineTransform::identity(),
        children: vec![
            "background_rect".to_string(),
            "shapes_group".to_string(),
            "test_text".to_string(),
            "test_line".to_string(),
            "test_path".to_string(),
            "test_image".to_string(),
        ],
        opacity: 1.0,
        size: Size {
            width: 1080.0,
            height: 1080.0,
        },
        corner_radius: RectangularCornerRadius::all(0.0),
        fill: Paint::Solid(SolidPaint {
            color: Color(255, 255, 255, 255),
        }),
        stroke: None,
        stroke_width: 0.0,
        effect: None,
    };

    // Create a node map and add all nodes
    let mut nodemap = NodeMap::new();
    nodemap.insert(
        "background_rect".to_string(),
        Node::Rectangle(background_rect_node),
    );
    nodemap.insert("test_rect".to_string(), Node::Rectangle(rect_node));
    nodemap.insert("test_ellipse".to_string(), Node::Ellipse(ellipse_node));
    nodemap.insert("test_polygon".to_string(), Node::Polygon(polygon_node));
    nodemap.insert(
        "test_regular_polygon".to_string(),
        Node::RegularPolygon(regular_polygon_node),
    );
    nodemap.insert("shapes_group".to_string(), Node::Group(shapes_group_node));
    nodemap.insert("test_text".to_string(), Node::TextSpan(text_span_node));
    nodemap.insert("test_line".to_string(), Node::Line(line_node));
    nodemap.insert("test_image".to_string(), Node::Image(image_node));
    nodemap.insert("test_path".to_string(), Node::Path(path_node));
    nodemap.insert(
        "root_container".to_string(),
        Node::Container(root_container_node),
    );

    Scene {
        id: "scene".to_string(),
        name: "Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec!["root_container".to_string()],
        nodes: nodemap,
    }
}

#[tokio::main]
async fn main() {
    let width = 1080;
    let height = 1080;

    // Initialize the renderer with image cache
    let mut renderer = Renderer::new();
    let (
        surface_ptr,
        el,
        window,
        gl_surface,
        gl_context,
        _gl_config,
        _fb_info,
        _gr_context,
        scale_factor,
    ) = init_window(width, height);
    renderer.set_backend(Backend::GL(surface_ptr));

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
    // Get logical canvas size for background
    // let logical_size = window.inner_size();

    // let scene = demo_static(&mut renderer).await;
    let scene = demo_json().await;

    let mut app = App {
        renderer,
        surface_ptr,
        gl_surface,
        gl_context,
    };

    // Render once at startup
    let surface = unsafe { &mut *app.surface_ptr };
    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::WHITE);

    app.renderer.render_scene(&scene);
    app.renderer.flush();
    if let Err(e) = app.gl_surface.swap_buffers(&app.gl_context) {
        eprintln!("Error swapping buffers: {:?}", e);
    }

    // Set up the event loop to wait for events
    el.set_control_flow(ControlFlow::Wait);
    el.run_app(&mut app).expect("Failed to run event loop");
}
