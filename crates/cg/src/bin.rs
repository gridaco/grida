use cg::schema::{BaseNode, Color, EllipseNode, RectNode, Size, Transform};
use cg::{draw_ellipse_node, draw_rect_node, free, init};

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
        transform: Transform {
            x: 200.0,
            y: 100.0,
            z: 0,
            rotation: 0.0,
            opacity: 1.0,
        },
        size: Size {
            width: 200.0,
            height: 150.0,
        },
        corner_radius: 10.0,
        fill: Color(255, 0, 0, 255), // Red color
    };

    // Create a test ellipse node
    let ellipse_node = EllipseNode {
        base: BaseNode {
            id: "test_ellipse".to_string(),
            name: "Test Ellipse".to_string(),
            active: true,
        },
        transform: Transform {
            x: 500.0,
            y: 300.0,
            z: 0,
            rotation: 45.0, // Rotated 45 degrees
            opacity: 1.0,
        },
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
