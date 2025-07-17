use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    x1: 0.0,
    y1: 0.0,
    x2: 400.0,
    y2: 400.0,
    radius: 0.0,
    radius2: 20.0,
};

async fn demo_progressive_blur() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.size = Size {
        width: 400.0,
        height: 400.0,
    };
    root_container_node.base.name = "Root Container".to_string();

    // Create an image node with progressive blur effect
    let mut image_node = nf.create_image_node();
    image_node.base.name = "Progressive Blur Image".to_string();
    image_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    image_node.size = Size {
        width: 300.0,
        height: 300.0,
    };
    image_node.hash = "demo_image".to_string();
    
    // Apply progressive blur effect
    image_node.effects = LayerEffects::from_array(vec![
        FilterEffect::ProgressiveBlur(BLUR_EFFECT)
    ]);

    // Create a background rectangle with solid color to showcase the effect
    let mut background_rect = nf.create_rectangle_node();
    background_rect.base.name = "Background".to_string();
    background_rect.transform = AffineTransform::new(0.0, 0.0, 0.0);
    background_rect.size = Size {
        width: 400.0,
        height: 400.0,
    };
    background_rect.set_fill(Paint::Solid(SolidPaint {
        color: Color(200, 220, 255, 255), // Light blue background
        opacity: 1.0,
    }));

    // Add nodes to repository
    let background_id = background_rect.base.id.clone();
    let image_id = image_node.base.id.clone();
    let root_id = root_container_node.base.id.clone();

    repository.insert(Node::Rectangle(background_rect));
    repository.insert(Node::Image(image_node));

    // Set up container hierarchy
    root_container_node.children = vec![background_id, image_id];
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "progressive_blur_scene".to_string(),
        name: "Progressive Blur Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(Color(255, 255, 255, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_progressive_blur().await;
    
    // Load test image
    let image_bytes = include_bytes!("../../fixtures/images/checker.png");
    
    // For now, we'll use the simple demo window runner and manually add the image
    // TODO: Create a proper window::run_with_scene_and_image function
    window::run_demo_window(scene).await;
}
