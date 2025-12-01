use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use grida_dev::platform::native_demo;
use math2::transform::AffineTransform;

async fn demo_clip() -> Scene {
    let nf = NodeFactory::new();

    // Create a single container with solid fill
    let mut container = nf.create_container_node();
    container.position = CGPoint::new(100.0, 100.0).into();
    container.rotation = 0.0;
    container.layout_dimensions.width = Some(300.0);
    container.layout_dimensions.height = Some(300.0);
    container.corner_radius = RectangularCornerRadius::circular(20.0);
    container.set_fill(Paint::from(CGColor(240, 100, 100, 255)));
    container.strokes = Paints::new([Paint::from(CGColor(200, 50, 50, 255))]);
    container.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 0.0,
        dy: 0.0,
        blur: 10.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 255),
        active: true,
    })]);
    container.clip = true;
    container.stroke_width = 2.0.into();

    // Create an ellipse
    let mut ellipse = nf.create_ellipse_node();
    ellipse.transform = AffineTransform::new(100.0, 150.0, 0.0); // Position below container
    ellipse.size = Size {
        width: 300.0,
        height: 200.0,
    };
    ellipse.fills = Paints::new([Paint::from(CGColor(100, 200, 100, 255))]);
    ellipse.strokes = Paints::new([Paint::from(CGColor(50, 150, 50, 255))]);
    ellipse.stroke_width = 2.0.into();

    // Build scene graph
    let mut graph = SceneGraph::new();
    let container_id = graph.append_child(Node::Container(container), Parent::Root);
    graph.append_child(Node::Ellipse(ellipse), Parent::NodeId(container_id));

    Scene {
        name: "Simple Container Demo".to_string(),
        background_color: None,
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_clip().await;
    native_demo::run_demo_window(scene).await;
}
