use cg::draw::{Backend, Renderer};
use cg::schema::FeDropShadow;
use cg::schema::FilterEffect;
use cg::schema::{
    BaseNode, BlendMode, Color, EllipseNode, FontWeight, GradientStop, GroupNode, ImageNode,
    LineNode, LinearGradientPaint, Node, NodeMap, Paint, PolygonNode, RadialGradientPaint,
    RectangleNode, RectangularCornerRadius, Size, SolidPaint, TextAlign, TextAlignVertical,
    TextDecoration, TextSpanNode, TextStyle,
};
use cg::transform::AffineTransform;
use console_error_panic_hook::set_once as init_panic_hook;
use gl::types::*;
use glutin::prelude::*;
use glutin::{
    config::{ConfigTemplateBuilder, GlConfig},
    context::{ContextApi, ContextAttributesBuilder, PossiblyCurrentContext},
    display::{GetGlDisplay, GlDisplay},
    prelude::{GlSurface, NotCurrentGlContext},
    surface::{Surface as GlutinSurface, SurfaceAttributesBuilder, WindowSurface},
};
use glutin_winit::DisplayBuilder;
use raw_window_handle::HasRawWindowHandle;
use reqwest;
use skia_safe::{Image, Surface, gpu};
use std::time::Instant;
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalSize, PhysicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{Window, WindowAttributes},
};

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
) {
    init_panic_hook();

    // Create event loop and window
    let el = EventLoop::new().expect("Failed to create event loop");
    let window_attributes = WindowAttributes::default()
        .with_title("Grida Canvas")
        .with_inner_size(LogicalSize::new(width as f64, height as f64))
        .with_visible(true)
        .with_transparent(true);

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
        .expect("Failed to retrieve RawWindowHandle");

    // Create GL context
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

    // Create GL surface
    let (width, height): (u32, u32) = window.inner_size().into();
    let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
        raw_window_handle,
        std::num::NonZeroU32::new(width).unwrap(),
        std::num::NonZeroU32::new(height).unwrap(),
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

    // Load GL functions
    gl::load_with(|s| {
        gl_config
            .display()
            .get_proc_address(std::ffi::CString::new(s).unwrap().as_c_str())
    });

    // Create Skia GL interface
    let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
        if name == "eglGetCurrentDisplay" {
            return std::ptr::null();
        }
        gl_config
            .display()
            .get_proc_address(std::ffi::CString::new(name).unwrap().as_c_str())
    })
    .expect("Could not create interface");

    // Create Skia GPU context
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
    )
}

#[tokio::main]
async fn main() {
    let width = 800;
    let height = 600;

    // Initialize the renderer with image cache
    let mut renderer = Renderer::new();
    let (surface_ptr, el, window, mut gl_surface, gl_context, gl_config, fb_info, mut gr_context) =
        init_window(width, height);
    renderer.set_backend(Backend::GL(surface_ptr));

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
            blend_mode: BlendMode::Normal,
        },
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
            blend_mode: BlendMode::Normal,
        },
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
            blend_mode: BlendMode::Multiply, // Example of using a different blend mode
        },
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
    let polygon_node = cg::schema::PolygonNode {
        base: BaseNode {
            id: "test_polygon".to_string(),
            name: "Test Polygon".to_string(),
            active: true,
            blend_mode: BlendMode::Screen, // Example of using Screen blend mode
        },
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
            blend_mode: BlendMode::Overlay, // Example of using Overlay blend mode
        },
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
            blend_mode: BlendMode::Normal,
        },
        transform: AffineTransform::identity(),
        size: Size {
            width: 300.0,
            height: 200.0,
        },
        text: "Grida Canvas SKIA Bindings Backend".to_string(),
        text_style: TextStyle {
            text_decoration: TextDecoration::None,
            font_family: None,
            font_size: 32.0,
            font_weight: FontWeight::W400,
            letter_spacing: None,
            line_height: None,
        },
        text_align: TextAlign::Center,
        text_align_vertical: TextAlignVertical::Center,
        fill: Paint::Solid(SolidPaint {
            color: Color(255, 255, 255, 255), // White text
        }),
        stroke: Some(Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
        })),
        stroke_width: Some(4.0),
        opacity: 1.0,
    };

    // Create a test line node with solid color
    let line_node = LineNode {
        base: BaseNode {
            id: "test_line".to_string(),
            name: "Test Line".to_string(),
            active: true,
            blend_mode: BlendMode::Normal,
        },
        opacity: 0.8,
        transform: AffineTransform::new(0.0, height as f32 - 50.0, 0.0),
        size: Size {
            width: width as f32,
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
            blend_mode: BlendMode::Normal,
        },
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
    let root_group_node = GroupNode {
        base: BaseNode {
            id: "root_group".to_string(),
            name: "Root Group".to_string(),
            active: true,
            blend_mode: BlendMode::Normal,
        },
        transform: AffineTransform::identity(),
        children: vec![
            "shapes_group".to_string(),
            "test_text".to_string(),
            "test_line".to_string(),
            "test_image".to_string(),
        ],
        opacity: 1.0,
    };

    // Create a node map and add all nodes
    let mut nodemap = NodeMap::new();
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
    nodemap.insert("root_group".to_string(), Node::Group(root_group_node));

    struct App {
        renderer: Renderer,
        surface_ptr: *mut Surface,
        gl_surface: GlutinSurface<WindowSurface>,
        gl_context: PossiblyCurrentContext,
        window: Window,
        nodemap: NodeMap,
        gl_config: glutin::config::Config,
        fb_info: gpu::gl::FramebufferInfo,
        gr_context: skia_safe::gpu::DirectContext,
    }

    let mut app = App {
        renderer,
        surface_ptr,
        gl_surface,
        gl_context,
        window,
        nodemap,
        gl_config,
        fb_info,
        gr_context,
    };

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
                WindowEvent::Resized(new_size) => {
                    self.gl_surface.resize(
                        &self.gl_context,
                        new_size.width.try_into().unwrap(),
                        new_size.height.try_into().unwrap(),
                    );
                    // Fix: skip if window is minimized or has zero size
                    if new_size.width == 0 || new_size.height == 0 {
                        return;
                    }
                    // Fix: ensure GL context is current before recreating surface
                    self.gl_context.make_current(&self.gl_surface).unwrap();
                    // Recreate Skia surface to match new window size
                    let backend_render_target = gpu::backend_render_targets::make_gl(
                        (new_size.width as i32, new_size.height as i32),
                        self.gl_config.num_samples() as usize,
                        self.gl_config.stencil_size() as usize,
                        self.fb_info,
                    );
                    let new_surface = gpu::surfaces::wrap_backend_render_target(
                        &mut self.gr_context,
                        &backend_render_target,
                        skia_safe::gpu::SurfaceOrigin::BottomLeft,
                        skia_safe::ColorType::RGBA8888,
                        None,
                        None,
                    )
                    .expect("Could not recreate skia surface");
                    // Free the old surface
                    self.renderer.free();
                    // Update surface_ptr and backend
                    self.surface_ptr = Box::into_raw(Box::new(new_surface));
                    self.renderer.set_backend(Backend::GL(self.surface_ptr));
                }
                WindowEvent::RedrawRequested => {
                    let size = self.window.inner_size();
                    let width = size.width as f32;
                    let height = size.height as f32;

                    let surface = unsafe { &mut *self.surface_ptr };
                    let canvas = surface.canvas();
                    let mut paint = skia_safe::Paint::default();
                    paint.set_color(skia_safe::Color::TRANSPARENT);
                    canvas.draw_rect(skia_safe::Rect::from_xywh(0.0, 0.0, width, height), &paint);

                    self.renderer
                        .render_node(&"root_group".to_string(), &self.nodemap);
                    self.renderer.flush();

                    self.gl_surface.swap_buffers(&self.gl_context).unwrap();
                }
                _ => {}
            }
        }
    }

    el.run_app(&mut app).expect("Failed to run event loop");
}
