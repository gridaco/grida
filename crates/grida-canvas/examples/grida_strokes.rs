use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_strokes() -> Scene {
    let nf = NodeFactory::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.name = Some("Root Container".to_string());
    root_container_node.size = Size {
        width: 1000.0,
        height: 1200.0,
    };

    let mut graph = SceneGraph::new();

    let mut all_shape_ids = Vec::new();
    let spacing = 120.0;
    let start_x = 50.0;
    let base_size = 100.0;
    let items_per_row = 8;

    // Stroke Alignment Demo Row
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Stroke Alignment {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Solid color stroke
        rect.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        rect.stroke_width = 8.0; // Thick stroke to make alignment visible

        // Set different alignments
        rect.stroke_align = match i {
            0 => StrokeAlign::Inside,
            1 => StrokeAlign::Center,
            2 => StrokeAlign::Outside,
            _ => unreachable!(),
        };

        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));
    }

    // Stroke Width Demo Row
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 250.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Solid color stroke
        rect.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        rect.stroke_width = (i + 1) as f32 * 2.0; // Increasing stroke width
        rect.stroke_align = StrokeAlign::Center;

        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));
    }

    // Stroke with Different Shapes Row
    {
        // Rectangle
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Rectangle Stroke".to_string());
        rect.transform = AffineTransform::new(start_x, 400.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        rect.stroke_width = 4.0;
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));

        // Ellipse
        let mut ellipse = nf.create_ellipse_node();
        ellipse.name = Some("Ellipse Stroke".to_string());
        ellipse.transform = AffineTransform::new(start_x + spacing, 400.0, 0.0);
        ellipse.size = Size {
            width: base_size,
            height: base_size,
        };
        ellipse.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        ellipse.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        ellipse.stroke_width = 4.0;
        all_shape_ids.push(ellipse.id.clone());
        graph.insert_node(Node::Ellipse(ellipse));

        // Regular Polygon (Hexagon)
        let mut polygon = nf.create_regular_polygon_node();
        polygon.name = Some("Hexagon Stroke".to_string());
        polygon.transform = AffineTransform::new(start_x + spacing * 2.0, 400.0, 0.0);
        polygon.size = Size {
            width: base_size,
            height: base_size,
        };
        polygon.point_count = 6;
        polygon.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        polygon.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        polygon.stroke_width = 4.0;
        all_shape_ids.push(polygon.id.clone());
        graph.insert_node(Node::RegularPolygon(polygon));

        // Star
        let mut star = nf.create_regular_star_polygon_node();
        star.name = Some("Star Stroke".to_string());
        star.transform = AffineTransform::new(start_x + spacing * 3.0, 400.0, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.point_count = 5;
        star.inner_radius = 0.4;
        star.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        star.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        star.stroke_width = 4.0;
        all_shape_ids.push(star.id.clone());
        graph.insert_node(Node::RegularStarPolygon(star));
    }

    // Stroke with Effects Row
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Stroke with Effect {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 550.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Solid color stroke
        rect.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        rect.stroke_width = 4.0;

        // Add different effects
        rect.effects = match i {
            0 => LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0,
                spread: 0.0,
                color: CGColor(0, 0, 0, 128),
            })]),
            1 => LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeGaussianBlur {
                radius: 2.0,
            })]),
            2 => LayerEffects::from_array(vec![FilterEffect::BackdropBlur(FeGaussianBlur {
                radius: 4.0,
            })]),
            _ => unreachable!(),
        };

        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));
    }

    // Stroke Dash Array Demo Row
    for i in 0..4 {
        let mut rect = nf.create_rectangle_node();
        rect.name = Some(format!("Stroke Dash Array {}", i + 1));
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 700.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);

        // No fill
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));

        // Solid color stroke
        rect.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        rect.stroke_width = 4.0;

        // Add different dash patterns
        rect.stroke_dash_array = match i {
            0 => Some(vec![5.0, 5.0]),           // Basic dashed line
            1 => Some(vec![10.0, 5.0]),          // Longer dashes
            2 => Some(vec![5.0, 5.0, 1.0, 5.0]), // Dash-dot pattern
            3 => Some(vec![1.0, 1.0]),           // Dotted line
            _ => unreachable!(),
        };

        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));
    }

    // Stroke Paint Types Demo Row
    {
        // Linear Gradient Stroke
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Linear Gradient Stroke".to_string());
        rect.transform = AffineTransform::new(start_x, 850.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::new(0.0, 0.0, 0.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 0, 0, 255), // Red
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 0, 255, 255), // Blue
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        })]);
        rect.stroke_width = 8.0;
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));

        // Radial Gradient Stroke
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Radial Gradient Stroke".to_string());
        rect.transform = AffineTransform::new(start_x + spacing, 850.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::new(base_size / 2.0, base_size / 2.0, 0.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 255, 0, 255), // Yellow
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(255, 0, 255, 255), // Magenta
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        })]);
        rect.stroke_width = 8.0;
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));

        // Conic Gradient Stroke
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Conic Gradient Stroke".to_string());
        rect.transform = AffineTransform::new(start_x + spacing * 2.0, 850.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::new(base_size / 2.0, base_size / 2.0, 0.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(0, 255, 0, 255), // Green
                },
                GradientStop {
                    offset: 0.5,
                    color: CGColor(0, 255, 255, 255), // Cyan
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 255, 0, 255), // Green
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        })]);
        rect.stroke_width = 8.0;
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));

        // Multi-color Solid Stroke
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Multi-color Stroke".to_string());
        rect.transform = AffineTransform::new(start_x + spacing * 3.0, 850.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::from(CGColor(255, 128, 0, 255))]);
        rect.stroke_width = 8.0;
        rect.stroke_dash_array = Some(vec![20.0, 10.0, 5.0, 10.0]); // Complex dash pattern
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));
    }

    // Multiple Strokes Demo Row
    {
        // Rectangle with multiple solid strokes (layered strokes)
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Multiple Solid Strokes".to_string());
        rect.transform = AffineTransform::new(start_x, 1000.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([
            Paint::from(CGColor(255, 0, 0, 255)),
            Paint::from(CGColor(0, 255, 0, 255)),
            Paint::from(CGColor(0, 0, 255, 255)),
        ]);
        rect.stroke_width = 12.0; // Thick stroke to show layering
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));

        // Rectangle with solid + gradient strokes
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Solid + Gradient Strokes".to_string());
        rect.transform = AffineTransform::new(start_x + spacing, 1000.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([
            Paint::from(CGColor(255, 255, 0, 255)),
            Paint::LinearGradient(LinearGradientPaint {
                transform: AffineTransform::from_rotatation(45.0),
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(255, 0, 255, 255), // Magenta
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(0, 255, 255, 255), // Cyan
                    },
                ],
                opacity: 0.7,
                blend_mode: BlendMode::Normal,
                active: true,
            }),
        ]);
        rect.stroke_width = 10.0;
        all_shape_ids.push(rect.id.clone());
        graph.insert_node(Node::Rectangle(rect));

        // Ellipse with multiple gradient strokes
        let mut ellipse = nf.create_ellipse_node();
        ellipse.name = Some("Multiple Gradient Strokes".to_string());
        ellipse.transform = AffineTransform::new(start_x + spacing * 2.0, 1000.0, 0.0);
        ellipse.size = Size {
            width: base_size,
            height: base_size,
        };
        ellipse.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        ellipse.strokes = Paints::new([
            Paint::RadialGradient(RadialGradientPaint {
                transform: AffineTransform::identity(),
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(255, 0, 0, 255), // Red center
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(255, 0, 0, 0), // Transparent edge
                    },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
                active: true,
            }),
            Paint::LinearGradient(LinearGradientPaint {
                transform: AffineTransform::from_rotatation(90.0),
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(0, 255, 0, 255), // Green
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(0, 255, 0, 0), // Transparent
                    },
                ],
                opacity: 0.8,
                blend_mode: BlendMode::Normal,
                active: true,
            }),
        ]);
        ellipse.stroke_width = 12.0;
        all_shape_ids.push(ellipse.id.clone());
        graph.insert_node(Node::Ellipse(ellipse));

        // Polygon with complex multi-stroke pattern
        let mut polygon = nf.create_regular_polygon_node();
        polygon.name = Some("Complex Multi-Stroke".to_string());
        polygon.transform = AffineTransform::new(start_x + spacing * 3.0, 1000.0, 0.0);
        polygon.size = Size {
            width: base_size,
            height: base_size,
        };
        polygon.point_count = 5; // Pentagon
        polygon.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        polygon.strokes = Paints::new([
            Paint::from(CGColor(128, 0, 128, 255)),
            Paint::LinearGradient(LinearGradientPaint {
                transform: AffineTransform::from_rotatation(30.0),
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(255, 255, 255, 255), // White
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(255, 255, 255, 0), // Transparent
                    },
                ],
                opacity: 0.6,
                blend_mode: BlendMode::Normal,
                active: true,
            }),
            Paint::RadialGradient(RadialGradientPaint {
                transform: AffineTransform {
                    matrix: [[0.7, 0.0, 0.15], [0.0, 0.7, 0.15]],
                },
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(255, 255, 0, 255), // Yellow highlight
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(255, 255, 0, 0), // Transparent
                    },
                ],
                opacity: 0.5,
                blend_mode: BlendMode::Normal,
                active: true,
            }),
        ]);
        polygon.stroke_width = 15.0; // Very thick to show all layers
        polygon.stroke_dash_array = Some(vec![8.0, 4.0]); // Dashed pattern
        all_shape_ids.push(polygon.id.clone());
        graph.insert_node(Node::RegularPolygon(polygon));
    }

    // Set up the root container
    let root_container_id = root_container_node.id.clone();
    graph.insert_node(Node::Container(root_container_node));
    graph.insert(Parent::Root, vec![root_container_id.clone()]);
    graph.insert(Parent::NodeId(root_container_id), all_shape_ids);

    Scene {
        name: "Strokes Demo".to_string(),
        graph,
        background_color: Some(CGColor(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_strokes().await;
    window::run_demo_window(scene).await;
}
