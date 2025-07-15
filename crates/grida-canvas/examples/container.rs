use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_clip() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a single container with solid fill
    let mut container = nf.create_container_node();
    container.base.name = "Simple Container".to_string();
    container.transform = AffineTransform::new(100.0, 100.0, 0.0);
    container.size = Size {
        width: 300.0,
        height: 300.0,
    };
    container.corner_radius = RectangularCornerRadius::all(20.0);
    container.set_fill(Paint::Solid(SolidPaint {
        color: Color(240, 100, 100, 255), // Light red
        opacity: 1.0,
    }));
    container.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(200, 50, 50, 255), // Darker red
        opacity: 1.0,
    })];
    container.effects = vec![FilterEffect::DropShadow(FeDropShadow {
        dx: 0.0,
        dy: 0.0,
        blur: 10.0,
        spread: 0.0,
        color: Color(0, 0, 0, 255),
    })];
    container.clip = true;
    container.stroke_width = 2.0;

    // Create an ellipse
    let mut ellipse = nf.create_ellipse_node();
    ellipse.base.name = "Simple Ellipse".to_string();
    ellipse.transform = AffineTransform::new(100.0, 150.0, 0.0); // Position below container
    ellipse.size = Size {
        width: 300.0,
        height: 200.0,
    };
    ellipse.fills = vec![Paint::Solid(SolidPaint {
        color: Color(100, 200, 100, 255), // Light green
        opacity: 1.0,
    })];
    ellipse.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(50, 150, 50, 255), // Darker green
        opacity: 1.0,
    })];
    ellipse.stroke_width = 2.0;

    // Add nodes to repository and collect their IDs
    let ellipse_id = ellipse.base.id.clone();
    repository.insert(Node::Ellipse(ellipse));

    // Add ellipse as child of container
    container.children = vec![ellipse_id];

    let container_id = container.base.id.clone();
    repository.insert(Node::Container(container));

    Scene {
        id: "scene".to_string(),
        name: "Simple Container Demo".to_string(),
        children: vec![container_id],
        nodes: repository,
        background_color: None,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_clip().await;
    window::run_demo_window(scene).await;
}
