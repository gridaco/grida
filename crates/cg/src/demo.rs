use cg::draw::Renderer;
use cg::schema::FeDropShadow;
use cg::schema::FilterEffect;
use cg::schema::{
    BaseNode, BlendMode, Color, EllipseNode, FontWeight, GradientStop, LineNode,
    LinearGradientPaint, Paint, RadialGradientPaint, RectangleNode, RectangularCornerRadius, Size,
    SolidPaint, TextAlign, TextAlignVertical, TextDecoration, TextSpanNode, TextStyle,
};
use cg::transform::AffineTransform;

fn main() {
    let width = 800;
    let height = 600;

    // Initialize the surface using the Renderer
    let surface_ptr = Renderer::init(width, height);

    // Create a test rectangle node with linear gradient
    let rect_node = RectangleNode {
        base: BaseNode {
            id: "test_rect".to_string(),
            name: "Test Rectangle".to_string(),
            active: true,
            blend_mode: BlendMode::Normal,
        },
        opacity: 1.0,
        transform: AffineTransform::new(50.0, 50.0, 45.0),
        size: Size {
            width: 200.0,
            height: 100.0,
        },
        corner_radius: RectangularCornerRadius {
            tl: 10.0,
            tr: 10.0,
            bl: 10.0,
            br: 10.0,
        },
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
        transform: AffineTransform::new(300.0, 50.0, 45.0), // Rotated 45 degrees
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
        opacity: 1.0,
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

    // Draw the rectangle using our schema
    Renderer::draw_rect_node(surface_ptr, &rect_node);

    // Draw the ellipse using our schema
    Renderer::draw_ellipse_node(surface_ptr, &ellipse_node);

    // Draw the polygon using our schema
    Renderer::draw_polygon_node(surface_ptr, &polygon_node);

    // Draw the regular polygon using our schema
    Renderer::draw_regular_polygon_node(surface_ptr, &regular_polygon_node);

    // Draw the text span node
    Renderer::draw_text_span_node(surface_ptr, &text_span_node);

    // Draw the line using our schema
    Renderer::draw_line_node(surface_ptr, &line_node);

    // Get the surface from the pointer to save the image
    let surface = unsafe { &mut *surface_ptr };
    let image = surface.image_snapshot();
    image
        .encode_to_data(skia_safe::EncodedImageFormat::PNG)
        .and_then(|data| std::fs::write("output.png", data.as_bytes()).ok())
        .expect("Failed to save PNG");

    // Free the surface
    Renderer::free(surface_ptr);

    println!("Saved output.png");
}
