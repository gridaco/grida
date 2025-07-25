use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::{box_fit::BoxFit, transform::AffineTransform};

async fn demo_images() -> Scene {
    let nf = NodeFactory::new();
    let image_url = "https://grida.co/images/abstract-placeholder.jpg".to_string();

    // Root container
    let mut root = nf.create_container_node();
    root.name = Some("Root".to_string());
    root.size = Size {
        width: 800.0,
        height: 600.0,
    };

    // First example: Rectangle with ImagePaint fill
    let mut rect1 = nf.create_rectangle_node();
    rect1.name = Some("ImageFillRect".to_string());
    rect1.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect1.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect1.set_fill(Paint::Image(ImagePaint {
        hash: image_url.clone(),
        opacity: 1.0,
        transform: AffineTransform::identity(),
        fit: BoxFit::Cover,
    }));
    rect1.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(255, 0, 0, 255),
        opacity: 1.0,
    })];
    rect1.stroke_width = 2.0;

    // Second example: Rectangle with ImagePaint fill and stroke
    let mut rect2 = nf.create_rectangle_node();
    rect2.name = Some("ImageFillAndStrokeRect".to_string());
    rect2.transform = AffineTransform::new(300.0, 50.0, 0.0);
    rect2.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect2.set_fill(Paint::Image(ImagePaint {
        hash: image_url.clone(),
        opacity: 1.0,
        transform: AffineTransform::identity(),
        fit: BoxFit::Cover,
    }));
    rect2.strokes = vec![Paint::Image(ImagePaint {
        hash: image_url.clone(),
        opacity: 1.0,
        transform: AffineTransform::identity(),
        fit: BoxFit::Cover,
    })];
    rect2.stroke_width = 10.0;

    // Third example: Rectangle with ImagePaint stroke only
    let mut rect3 = nf.create_rectangle_node();
    rect3.name = Some("ImageStrokeRect".to_string());
    rect3.transform = AffineTransform::new(550.0, 50.0, 0.0);
    rect3.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect3.corner_radius = RectangularCornerRadius::circular(40.0);
    rect3.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(240, 240, 240, 255),
        opacity: 1.0,
    }));
    rect3.strokes = vec![Paint::Image(ImagePaint {
        hash: image_url.clone(),
        opacity: 1.0,
        transform: AffineTransform::identity(),
        fit: BoxFit::Cover,
    })];
    rect3.stroke_width = 10.0;

    // Fourth example: Rectangle with ImagePaint fill using a custom transform
    let mut rect4 = nf.create_rectangle_node();
    rect4.name = Some("ImageTransformFillRect".to_string());
    rect4.transform = AffineTransform::new(50.0, 300.0, 0.0);
    rect4.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect4.set_fill(Paint::Image(ImagePaint {
        hash: image_url.clone(),
        opacity: 1.0,
        // Rotate the image 45 degrees with BoxFit::None to showcase the paint transform
        transform: AffineTransform {
            matrix: [[0.7071, -0.7071, 100.0], [0.7071, 0.7071, 0.0]],
        },
        fit: BoxFit::None,
    }));

    let mut repository = NodeRepository::new();

    let rect1_id = rect1.id.clone();
    let rect2_id = rect2.id.clone();
    let rect3_id = rect3.id.clone();
    let rect4_id = rect4.id.clone();

    repository.insert(Node::Rectangle(rect1));
    repository.insert(Node::Rectangle(rect2));
    repository.insert(Node::Rectangle(rect3));
    repository.insert(Node::Rectangle(rect4));

    root.children = vec![rect1_id, rect2_id, rect3_id, rect4_id];
    let root_id = root.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Images Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(CGColor(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_images().await;
    window::run_demo_window(scene).await;
}
