use cg::factory::NodeFactory;
use cg::repository::NodeRepository;
use cg::schema::*;
use math2::transform::AffineTransform;

mod window;

async fn demo_booleans() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.base.name = "Root Container".to_string();
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };

    let mut all_shape_ids = Vec::new();
    let spacing = 200.0;
    let start_x = 100.0;
    let base_size = 100.0;

    // Example 1: Rectangle and Circle Union
    {
        let y_offset = 150.0; // Increased from 100.0 to give more room at top

        // Create shapes
        let mut rect = nf.create_rectangle_node();
        rect.base.name = "Rectangle".to_string();
        rect.transform = AffineTransform::new(start_x, y_offset, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        let mut circle = nf.create_ellipse_node();
        circle.base.name = "Circle".to_string();
        circle.transform = AffineTransform::new(start_x + spacing, y_offset, 0.0);
        circle.size = Size {
            width: base_size,
            height: base_size,
        };
        circle.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        // Add description text
        let mut text = nf.create_text_span_node();
        text.base.name = "Description".to_string();
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0); // Moved text up slightly
        text.size = Size {
            width: 500.0, // Increased width for better text display
            height: 20.0,
        };
        text.text = "Union (A ∪ B): Combines two shapes into one".to_string();
        text.text_style.font_size = 16.0;
        text.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });

        // Create boolean operation
        let mut bool_node = BooleanPathOperationNode {
            base: BaseNode {
                id: "bool_union_1".to_string(),
                name: "Union Operation".to_string(),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0),
            op: BooleanPathOperation::Union,
            children: vec![rect.base.id.clone(), circle.base.id.clone()],
            fill: Paint::Solid(SolidPaint {
                color: Color(100, 100, 200, 255),
                opacity: 1.0,
            }),
            stroke: Some(Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            })),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effect: None,
        };

        // Collect IDs before moving nodes
        all_shape_ids.push(rect.base.id.clone());
        all_shape_ids.push(circle.base.id.clone());
        all_shape_ids.push(text.base.id.clone());
        all_shape_ids.push(bool_node.base.id.clone());

        // Insert all nodes
        repository.insert(Node::Rectangle(rect));
        repository.insert(Node::Ellipse(circle));
        repository.insert(Node::TextSpan(text));
        repository.insert(Node::BooleanOperation(bool_node));
    }

    // Example 2: Two Circles Intersection
    {
        let y_offset = 400.0; // Increased from 300.0

        // Create shapes
        let mut circle1 = nf.create_ellipse_node();
        circle1.base.name = "Circle 1".to_string();
        circle1.transform = AffineTransform::new(start_x, y_offset, 0.0);
        circle1.size = Size {
            width: base_size,
            height: base_size,
        };
        circle1.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        let mut circle2 = nf.create_ellipse_node();
        circle2.base.name = "Circle 2".to_string();
        circle2.transform = AffineTransform::new(start_x + 100.0, y_offset, 0.0);
        circle2.size = Size {
            width: base_size,
            height: base_size,
        };
        circle2.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        // Add description text
        let mut text = nf.create_text_span_node();
        text.base.name = "Description".to_string();
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0);
        text.size = Size {
            width: 500.0,
            height: 20.0,
        };
        text.text = "Intersection (A ∩ B): Shows only the overlapping area".to_string();
        text.text_style.font_size = 16.0;
        text.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });

        // Create boolean operation
        let mut bool_node = BooleanPathOperationNode {
            base: BaseNode {
                id: "bool_intersection_1".to_string(),
                name: "Intersection Operation".to_string(),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0),
            op: BooleanPathOperation::Intersection,
            children: vec![circle1.base.id.clone(), circle2.base.id.clone()],
            fill: Paint::Solid(SolidPaint {
                color: Color(100, 100, 200, 255),
                opacity: 1.0,
            }),
            stroke: Some(Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            })),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effect: None,
        };

        // Collect IDs before moving nodes
        all_shape_ids.push(circle1.base.id.clone());
        all_shape_ids.push(circle2.base.id.clone());
        all_shape_ids.push(text.base.id.clone());
        all_shape_ids.push(bool_node.base.id.clone());

        // Insert all nodes
        repository.insert(Node::Ellipse(circle1));
        repository.insert(Node::Ellipse(circle2));
        repository.insert(Node::TextSpan(text));
        repository.insert(Node::BooleanOperation(bool_node));
    }

    // Example 3: Star and Rectangle Difference
    {
        let y_offset = 650.0; // Increased from 500.0

        // Create shapes
        let mut star = nf.create_regular_star_polygon_node();
        star.base.name = "Star".to_string();
        star.transform = AffineTransform::new(start_x, y_offset, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        let mut rect = nf.create_rectangle_node();
        rect.base.name = "Rectangle".to_string();
        rect.transform = AffineTransform::new(start_x + spacing * 0.5, y_offset, 0.0);
        rect.size = Size {
            width: base_size * 0.8,
            height: base_size * 0.8,
        };
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        // Add description text
        let mut text = nf.create_text_span_node();
        text.base.name = "Description".to_string();
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0);
        text.size = Size {
            width: 500.0,
            height: 20.0,
        };
        text.text = "Difference (A - B): Removes the second shape from the first".to_string();
        text.text_style.font_size = 16.0;
        text.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });

        // Create boolean operation
        let mut bool_node = BooleanPathOperationNode {
            base: BaseNode {
                id: "bool_difference_1".to_string(),
                name: "Difference Operation".to_string(),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0),
            op: BooleanPathOperation::Difference,
            children: vec![star.base.id.clone(), rect.base.id.clone()],
            fill: Paint::Solid(SolidPaint {
                color: Color(100, 100, 200, 255),
                opacity: 1.0,
            }),
            stroke: Some(Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            })),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effect: None,
        };

        // Collect IDs before moving nodes
        all_shape_ids.push(star.base.id.clone());
        all_shape_ids.push(rect.base.id.clone());
        all_shape_ids.push(text.base.id.clone());
        all_shape_ids.push(bool_node.base.id.clone());

        // Insert all nodes
        repository.insert(Node::RegularStarPolygon(star));
        repository.insert(Node::Rectangle(rect));
        repository.insert(Node::TextSpan(text));
        repository.insert(Node::BooleanOperation(bool_node));
    }

    // Example 4: Two Squares XOR
    {
        let y_offset = 900.0; // Increased from 700.0

        // Create shapes
        let mut square1 = nf.create_rectangle_node();
        square1.base.name = "Square 1".to_string();
        square1.transform = AffineTransform::new(start_x, y_offset, 0.0);
        square1.size = Size {
            width: base_size,
            height: base_size,
        };
        square1.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        let mut square2 = nf.create_rectangle_node();
        square2.base.name = "Square 2".to_string();
        square2.transform = AffineTransform::new(start_x + spacing * 0.5, y_offset, 0.0);
        square2.size = Size {
            width: base_size,
            height: base_size,
        };
        square2.fill = Paint::Solid(SolidPaint {
            color: Color(200, 200, 200, 255),
            opacity: 1.0,
        });

        // Add description text
        let mut text = nf.create_text_span_node();
        text.base.name = "Description".to_string();
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0);
        text.size = Size {
            width: 500.0,
            height: 20.0,
        };
        text.text = "XOR (A ⊕ B): Shows areas that don't overlap".to_string();
        text.text_style.font_size = 16.0;
        text.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        });

        // Create boolean operation
        let mut bool_node = BooleanPathOperationNode {
            base: BaseNode {
                id: "bool_xor_1".to_string(),
                name: "XOR Operation".to_string(),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0),
            op: BooleanPathOperation::Xor,
            children: vec![square1.base.id.clone(), square2.base.id.clone()],
            fill: Paint::Solid(SolidPaint {
                color: Color(100, 100, 200, 255),
                opacity: 1.0,
            }),
            stroke: Some(Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            })),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effect: None,
        };

        // Collect IDs before moving nodes
        all_shape_ids.push(square1.base.id.clone());
        all_shape_ids.push(square2.base.id.clone());
        all_shape_ids.push(text.base.id.clone());
        all_shape_ids.push(bool_node.base.id.clone());

        // Insert all nodes
        repository.insert(Node::Rectangle(square1));
        repository.insert(Node::Rectangle(square2));
        repository.insert(Node::TextSpan(text));
        repository.insert(Node::BooleanOperation(bool_node));
    }

    // Set up the root container
    root_container_node.children.extend(all_shape_ids);
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Boolean Operations Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_booleans().await;
    window::run_demo_window(scene).await;
}
