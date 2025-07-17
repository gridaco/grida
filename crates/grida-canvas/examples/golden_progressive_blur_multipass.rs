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
    radius2: 50.0,
};

async fn demo_progressive_blur_multipass() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a root container
    let mut root_container = nf.create_container_node();
    root_container.size = Size {
        width: 400.0,
        height: 400.0,
    };
    root_container.base.name = "Root Container".to_string();

    // Create some shapes to demonstrate the progressive blur effect
    let mut circle = nf.create_ellipse_node();
    circle.base.name = "Blurred Circle".to_string();
    circle.transform = AffineTransform::new(50.0, 50.0, 0.0);
    circle.size = Size {
        width: 300.0,
        height: 300.0,
    };
    circle.set_fill(Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(255, 100, 100, 255), // Red center
            },
            GradientStop {
                offset: 0.5,
                color: Color(100, 255, 100, 255), // Green middle
            },
            GradientStop {
                offset: 1.0,
                color: Color(100, 100, 255, 255), // Blue edge
            },
        ],
        opacity: 1.0,
    }));
    
    // Apply progressive blur effect
    circle.effects = LayerEffects::from_array(vec![
        FilterEffect::ProgressiveBlur(BLUR_EFFECT)
    ]);

    // Add nodes to repository
    let circle_id = circle.base.id.clone();
    let root_id = root_container.base.id.clone();

    repository.insert(Node::Ellipse(circle));

    // Set up container hierarchy
    root_container.children = vec![circle_id];
    repository.insert(Node::Container(root_container));

    Scene {
        repository,
        entry: root_id,
        background_color: Some(Color(240, 240, 240, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_progressive_blur_multipass().await;
    
    window::run_with_scene(
        scene,
        "Progressive Blur Multipass Example".to_string(),
    )
    .await;
}
