use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use grida_dev::platform::native_demo;
use math2::transform::AffineTransform;

async fn demo_paints() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.layout_dimensions.width = Some(1080.0);
    root_container_node.layout_dimensions.height = Some(1080.0);

    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);
    let spacing = 100.0;
    let start_x = 50.0;
    let base_size = 80.0;
    let items_per_row = 10;

    // Solid Colors Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(
            255 - (i * 25) as u8,
            100 + (i * 15) as u8,
            50 + (i * 20) as u8,
            255,
        )));
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Linear Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 200.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // Create a linear gradient that changes angle based on index
        let angle = (i as f32 * 36.0) * std::f32::consts::PI / 180.0; // 0 to 360 degrees
        let transform = AffineTransform::new(0.0, 0.0, angle);

        rect.set_fill(Paint::LinearGradient(LinearGradientPaint {
            transform,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 100, 100, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(100, 100, 255, 255),
                },
            ],
            ..Default::default()
        }));
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Radial Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // Create a radial gradient with varying center positions
        let center_x = 0.2 + (i as f32 * 0.06); // 0.2 to 0.8
        let center_y = 0.2 + (i as f32 * 0.06); // 0.2 to 0.8
        let transform = AffineTransform::new(center_x * base_size, center_y * base_size, 0.0);

        rect.set_fill(Paint::RadialGradient(RadialGradientPaint {
            transform,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 255, 100, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(100, 255, 100, 255),
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
            ..Default::default()
        }));
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke Solid Colors Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 400.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Solid color stroke with varying colors
        rect.strokes = Paints::new([Paint::from(CGColor(
            255 - (i * 25) as u8,
            100 + (i * 15) as u8,
            50 + (i * 20) as u8,
            255,
        ))]);
        rect.stroke_width = 4.0.into(); // Consistent stroke width

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke Linear Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Create a linear gradient that changes angle based on index
        let angle = (i as f32 * 36.0) * std::f32::consts::PI / 180.0; // 0 to 360 degrees
        let transform = AffineTransform::new(0.0, 0.0, angle);

        rect.strokes = Paints::new([Paint::LinearGradient(LinearGradientPaint {
            transform,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 100, 100, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(100, 100, 255, 255),
                },
            ],
            ..Default::default()
        })]);
        rect.stroke_width = 4.0.into(); // Consistent stroke width

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke Radial Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 600.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Create a radial gradient with varying center positions
        let center_x = 0.2 + (i as f32 * 0.06); // 0.2 to 0.8
        let center_y = 0.2 + (i as f32 * 0.06); // 0.2 to 0.8
        let transform = AffineTransform::new(center_x * base_size, center_y * base_size, 0.0);

        rect.strokes = Paints::new([Paint::RadialGradient(RadialGradientPaint {
            transform,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 255, 100, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(100, 255, 100, 255),
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
            ..Default::default()
        })]);
        rect.stroke_width = 4.0.into(); // Consistent stroke width

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    Scene {
        name: "Paints Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_paints().await;
    native_demo::run_demo_window(scene).await;
}
