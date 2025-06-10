use cg::node::factory::NodeFactory;
use cg::node::schema::*;
use cg::repository::NodeRepository;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_strokes() -> Scene {
    let nf = NodeFactory::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.base.name = "Root Container".to_string();
    root_container_node.size = Size {
        width: 1000.0,
        height: 1000.0,
    };

    let mut repository = NodeRepository::new();

    let mut all_shape_ids = Vec::new();
    let spacing = 120.0;
    let start_x = 50.0;
    let base_size = 100.0;
    let items_per_row = 8;

    // Stroke Alignment Demo Row
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
        rect.base.name = format!("Stroke Alignment {}", i + 1);
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(8.0);

        // No fill
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0), // Transparent
            opacity: 1.0,
        });

        // Solid color stroke
        rect.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
            opacity: 1.0,
        });
        rect.stroke_width = 8.0; // Thick stroke to make alignment visible

        // Set different alignments
        rect.stroke_align = match i {
            0 => StrokeAlign::Inside,
            1 => StrokeAlign::Center,
            2 => StrokeAlign::Outside,
            _ => unreachable!(),
        };

        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Stroke Width Demo Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.base.name = format!("Stroke Width {}", i + 1);
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 250.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(8.0);

        // No fill
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0), // Transparent
            opacity: 1.0,
        });

        // Solid color stroke
        rect.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black stroke
            opacity: 1.0,
        });
        rect.stroke_width = (i + 1) as f32 * 2.0; // Increasing stroke width
        rect.stroke_align = StrokeAlign::Center;

        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Stroke with Different Shapes Row
    {
        // Rectangle
        let mut rect = nf.create_rectangle_node();
        rect.base.name = "Rectangle Stroke".to_string();
        rect.transform = AffineTransform::new(start_x, 400.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(8.0);
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0),
            opacity: 1.0,
        });
        rect.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });
        rect.stroke_width = 4.0;
        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));

        // Ellipse
        let mut ellipse = nf.create_ellipse_node();
        ellipse.base.name = "Ellipse Stroke".to_string();
        ellipse.transform = AffineTransform::new(start_x + spacing, 400.0, 0.0);
        ellipse.size = Size {
            width: base_size,
            height: base_size,
        };
        ellipse.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0),
            opacity: 1.0,
        });
        ellipse.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });
        ellipse.stroke_width = 4.0;
        all_shape_ids.push(ellipse.base.id.clone());
        repository.insert(Node::Ellipse(ellipse));

        // Regular Polygon (Hexagon)
        let mut polygon = nf.create_regular_polygon_node();
        polygon.base.name = "Hexagon Stroke".to_string();
        polygon.transform = AffineTransform::new(start_x + spacing * 2.0, 400.0, 0.0);
        polygon.size = Size {
            width: base_size,
            height: base_size,
        };
        polygon.point_count = 6;
        polygon.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0),
            opacity: 1.0,
        });
        polygon.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });
        polygon.stroke_width = 4.0;
        all_shape_ids.push(polygon.base.id.clone());
        repository.insert(Node::RegularPolygon(polygon));

        // Star
        let mut star = nf.create_regular_star_polygon_node();
        star.base.name = "Star Stroke".to_string();
        star.transform = AffineTransform::new(start_x + spacing * 3.0, 400.0, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.point_count = 5;
        star.inner_radius = 0.4;
        star.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0),
            opacity: 1.0,
        });
        star.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });
        star.stroke_width = 4.0;
        all_shape_ids.push(star.base.id.clone());
        repository.insert(Node::RegularStarPolygon(star));
    }

    // Stroke with Effects Row
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
        rect.base.name = format!("Stroke with Effect {}", i + 1);
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 550.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(8.0);

        // No fill
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0),
            opacity: 1.0,
        });

        // Solid color stroke
        rect.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });
        rect.stroke_width = 4.0;

        // Add different effects
        rect.effect = match i {
            0 => Some(FilterEffect::DropShadow(FeDropShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0,
                color: Color(0, 0, 0, 128),
            })),
            1 => Some(FilterEffect::GaussianBlur(FeGaussianBlur { radius: 2.0 })),
            2 => Some(FilterEffect::BackdropBlur(FeBackdropBlur { radius: 4.0 })),
            _ => unreachable!(),
        };

        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Stroke Dash Array Demo Row
    for i in 0..4 {
        let mut rect = nf.create_rectangle_node();
        rect.base.name = format!("Stroke Dash Array {}", i + 1);
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 700.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(8.0);

        // No fill
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 0),
            opacity: 1.0,
        });

        // Solid color stroke
        rect.stroke = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });
        rect.stroke_width = 4.0;

        // Add different dash patterns
        rect.stroke_dash_array = match i {
            0 => Some(vec![5.0, 5.0]),           // Basic dashed line
            1 => Some(vec![10.0, 5.0]),          // Longer dashes
            2 => Some(vec![5.0, 5.0, 1.0, 5.0]), // Dash-dot pattern
            3 => Some(vec![1.0, 1.0]),           // Dotted line
            _ => unreachable!(),
        };

        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Set up the root container
    root_container_node.children.extend(all_shape_ids);
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Strokes Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_strokes().await;
    window::run_demo_window(scene).await;
}
