use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_gradients() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // root container
    let mut root = nf.create_container_node();
    root.layout_dimensions.width = Some(1200.0);
    root.layout_dimensions.height = Some(800.0);

    let root_id = graph.append_child(Node::Container(root), Parent::Root);

    let spacing = 160.0;
    let start_x = 60.0;
    let base = 120.0;

    // Linear gradient fills
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 80.0, 0.0);
        rect.size = Size {
            width: base,
            height: base,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        let angle = (i as f32) * 45.0;
        rect.set_fill(Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(angle),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 0, 0, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 0, 255, 255),
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        }));
        graph.append_child(Node::Rectangle(rect), Parent::NodeId(root_id.clone()));
    }

    // Radial gradient fills
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 280.0, 0.0);
        rect.size = Size {
            width: base,
            height: base,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        let offset = -0.25 + 0.125 * i as f32;
        rect.set_fill(Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform {
                matrix: [[1.0, 0.0, offset], [0.0, 1.0, offset]],
            },
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 255, 0, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 255, 0, 255),
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        }));
        graph.append_child(Node::Rectangle(rect), Parent::NodeId(root_id.clone()));
    }

    // Linear gradient strokes
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 480.0, 0.0);
        rect.size = Size {
            width: base,
            height: base,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        let angle = (i as f32) * 45.0;
        rect.strokes = Paints::new([Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(angle),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 0, 255, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 255, 255, 255),
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        })]);
        rect.stroke_width = 8.0;
        graph.append_child(Node::Rectangle(rect), Parent::NodeId(root_id.clone()));
    }

    // Radial gradient strokes
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 680.0, 0.0);
        rect.size = Size {
            width: base,
            height: base,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        let offset = -0.25 + 0.125 * i as f32;
        rect.strokes = Paints::new([Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform {
                matrix: [[1.0, 0.0, offset], [0.0, 1.0, offset]],
            },
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 128, 0, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 128, 255, 255),
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        })]);
        rect.stroke_width = 8.0;
        graph.append_child(Node::Rectangle(rect), Parent::NodeId(root_id.clone()));
    }

    Scene {
        name: "Gradients Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_gradients().await;
    window::run_demo_window(scene).await;
}
