use cg::draw::Renderer;
use cg::schema::{
    BaseNode, Color, EllipseNode, GradientStop, LineNode, LinearGradientPaint, Paint,
    RadialGradientPaint, RectNode, RectangularCornerRadius, Size, SolidPaint,
};
use cg::transform::AffineTransform;

fn main() {
    let width = 800;
    let height = 600;

    // Initialize the surface using the Renderer
    let surface_ptr = Renderer::init(width, height);

    // Create a test rectangle node with linear gradient
    let rect_node = RectNode {
        base: BaseNode {
            id: "test_rect".to_string(),
            name: "Test Rectangle".to_string(),
            active: true,
        },
        opacity: 1.0,
        transform: AffineTransform::new(200.0, 100.0, 15.0),
        size: Size {
            width: 200.0,
            height: 150.0,
        },
        corner_radius: RectangularCornerRadius {
            tl: 0.0,
            tr: 25.0,
            bl: 50.0,
            br: 100.0,
        },
        fill: Paint::LinearGradient(LinearGradientPaint {
            id: "gradient1".to_string(),
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 0, 255), // Red
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(0, 0, 255, 255), // Blue
                },
            ],
        }),
    };

    // Create a test ellipse node with radial gradient
    let ellipse_node = EllipseNode {
        base: BaseNode {
            id: "test_ellipse".to_string(),
            name: "Test Ellipse".to_string(),
            active: true,
        },
        opacity: 1.0,
        transform: AffineTransform::new(500.0, 300.0, 45.0), // Rotated 45 degrees
        size: Size {
            width: 150.0,
            height: 100.0,
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
    };

    // Create a test line node with solid color
    let line_node = LineNode {
        base: BaseNode {
            id: "test_line".to_string(),
            name: "Test Line".to_string(),
            active: true,
        },
        opacity: 0.8,
        transform: AffineTransform::new(100.0, 400.0, 30.0),
        size: Size {
            width: 200.0,
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
