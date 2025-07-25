use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_paints() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.name = Some("Root Container".to_string());
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };

    let mut all_shape_ids = Vec::new();
    let spacing = 100.0;
    let start_x = 50.0;
    let base_size = 80.0;
    let items_per_row = 10;

    // Solid Colors Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Solid Color {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor(
                255 - (i * 25) as u8,
                100 + (i * 15) as u8,
                50 + (i * 20) as u8,
                255,
            ),
            opacity: 1.0,
        }));
        all_shape_ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Linear Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Linear Gradient {}", i + 1));
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
            opacity: 1.0,
        }));
        all_shape_ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Radial Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Radial Gradient {}", i + 1));
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
        }));
        all_shape_ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Stroke Solid Colors Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Stroke Solid Color {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 400.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor(0, 0, 0, 0), // Transparent
            opacity: 1.0,
        }));

        // Solid color stroke with varying colors
        rect.strokes = vec![Paint::Solid(SolidPaint {
            color: CGColor(
                255 - (i * 25) as u8,
                100 + (i * 15) as u8,
                50 + (i * 20) as u8,
                255,
            ),
            opacity: 1.0,
        })];
        rect.stroke_width = 4.0; // Consistent stroke width

        all_shape_ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Stroke Linear Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Stroke Linear Gradient {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor(0, 0, 0, 0), // Transparent
            opacity: 1.0,
        }));

        // Create a linear gradient that changes angle based on index
        let angle = (i as f32 * 36.0) * std::f32::consts::PI / 180.0; // 0 to 360 degrees
        let transform = AffineTransform::new(0.0, 0.0, angle);

        rect.strokes = vec![Paint::LinearGradient(LinearGradientPaint {
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
            opacity: 1.0,
        })];
        rect.stroke_width = 4.0; // Consistent stroke width

        all_shape_ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Stroke Radial Gradient Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Stroke Radial Gradient {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 600.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor(0, 0, 0, 0), // Transparent
            opacity: 1.0,
        }));

        // Create a radial gradient with varying center positions
        let center_x = 0.2 + (i as f32 * 0.06); // 0.2 to 0.8
        let center_y = 0.2 + (i as f32 * 0.06); // 0.2 to 0.8
        let transform = AffineTransform::new(center_x * base_size, center_y * base_size, 0.0);

        rect.strokes = vec![Paint::RadialGradient(RadialGradientPaint {
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
        })];
        rect.stroke_width = 4.0; // Consistent stroke width

        all_shape_ids.push(rect.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Set up the root container
    root_container_node.children.extend(all_shape_ids);
    let root_container_id = root_container_node.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Paints Demo".to_string(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(CGColor(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_paints().await;
    window::run_demo_window(scene).await;
}
