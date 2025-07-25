use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_gradients() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // root container
    let mut root = nf.create_container_node();
    root.name = Some("Root".to_string());
    root.size = Size {
        width: 1200.0,
        height: 800.0,
    };

    let mut ids = Vec::new();
    let spacing = 160.0;
    let start_x = 60.0;
    let base = 120.0;

    // Linear gradient fills
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Linear Fill {}", i));
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
        }));
        ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Radial gradient fills
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Radial Fill {}", i));
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
        }));
        ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Linear gradient strokes
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Linear Stroke {}", i));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 480.0, 0.0);
        rect.size = Size {
            width: base,
            height: base,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor(0, 0, 0, 0),
            opacity: 1.0,
        }));
        let angle = (i as f32) * 45.0;
        rect.strokes = vec![Paint::LinearGradient(LinearGradientPaint {
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
        })];
        rect.stroke_width = 8.0;
        ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Radial gradient strokes
    for i in 0..5 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Radial Stroke {}", i));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 680.0, 0.0);
        rect.size = Size {
            width: base,
            height: base,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor(0, 0, 0, 0),
            opacity: 1.0,
        }));
        let offset = -0.25 + 0.125 * i as f32;
        rect.strokes = vec![Paint::RadialGradient(RadialGradientPaint {
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
        })];
        rect.stroke_width = 8.0;
        ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    root.children = ids.clone();
    let root_id = root.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Gradients Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(CGColor(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_gradients().await;
    window::run_demo_window(scene).await;
}
