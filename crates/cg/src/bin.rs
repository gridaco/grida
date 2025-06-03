use cg::draw::{draw_ellipse_node, draw_rect_node, free, init};
use cg::schema::{BaseNode, Color, EllipseNode, RectNode, RectangularCornerRadius, Size};
use cg::transform::AffineTransform;

fn main() {
    let width = 800;
    let height = 600;

    // Initialize the surface using the library function
    let surface_ptr = init(width, height);

    // Create a test rectangle node
    let rect_node = RectNode {
        base: BaseNode {
            id: "test_rect".to_string(),
            name: "Test Rectangle".to_string(),
            active: true,
        },
        opacity: 0.3,
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
        fill: Color(255, 0, 0, 255), // Red color
    };

    // Create a test ellipse node
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
        fill: Color(0, 0, 255, 255), // Blue color
    };

    // Draw the rectangle using our schema
    draw_rect_node(surface_ptr, &rect_node);

    // Draw the ellipse using our schema
    draw_ellipse_node(surface_ptr, &ellipse_node);

    // Get the surface from the pointer to save the image
    let surface = unsafe { &mut *surface_ptr };
    let image = surface.image_snapshot();
    image
        .encode_to_data(skia_safe::EncodedImageFormat::PNG)
        .and_then(|data| std::fs::write("output.png", data.as_bytes()).ok())
        .expect("Failed to save PNG");

    // Free the surface
    free(surface_ptr);

    println!("Saved output.png");
}
