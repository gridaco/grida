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
    root_container_node.layout_dimensions.width = Some(1000.0);
    root_container_node.layout_dimensions.height = Some(1200.0);

    let mut graph = SceneGraph::new();

    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);
    let spacing = 120.0;
    let start_x = 50.0;
    let base_size = 100.0;
    let items_per_row = 8;

    // Stroke Alignment Demo Row
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 8.0; // Thick stroke to make alignment visible

        // Set different alignments
        rect.stroke_style.stroke_align = match i {
            0 => StrokeAlign::Inside,
            1 => StrokeAlign::Center,
            2 => StrokeAlign::Outside,
            _ => unreachable!(),
        };

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
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
        rect.stroke_style.stroke_width = (i + 1) as f32 * 2.0; // Increasing stroke width
        rect.stroke_style.stroke_align = StrokeAlign::Center;

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke with Different Shapes Row
    {
        // Rectangle
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x, 400.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        rect.stroke_style.stroke_width = 4.0;
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );

        // Ellipse
        let mut ellipse = nf.create_ellipse_node();
        ellipse.transform = AffineTransform::new(start_x + spacing, 400.0, 0.0);
        ellipse.size = Size {
            width: base_size,
            height: base_size,
        };
        ellipse.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        ellipse.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        ellipse.stroke_style.stroke_width = 4.0;
        graph.append_child(
            Node::Ellipse(ellipse),
            Parent::NodeId(root_container_id.clone()),
        );

        // Regular Polygon (Hexagon)
        let mut polygon = nf.create_regular_polygon_node();
        polygon.transform = AffineTransform::new(start_x + spacing * 2.0, 400.0, 0.0);
        polygon.size = Size {
            width: base_size,
            height: base_size,
        };
        polygon.point_count = 6;
        polygon.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        polygon.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        polygon.stroke_style.stroke_width = 4.0;
        graph.append_child(
            Node::RegularPolygon(polygon),
            Parent::NodeId(root_container_id.clone()),
        );

        // Star
        let mut star = nf.create_regular_star_polygon_node();
        star.transform = AffineTransform::new(start_x + spacing * 3.0, 400.0, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.point_count = 5;
        star.inner_radius = 0.4;
        star.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 0))]);
        star.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        star.stroke_style.stroke_width = 4.0;
        graph.append_child(
            Node::RegularStarPolygon(star),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke with Effects Row
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 4.0;

        // Add different effects
        rect.effects = match i {
            0 => LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0,
                spread: 0.0,
                color: CGColor(0, 0, 0, 128),
            })]),
            1 => LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeBlur::Gaussian(
                FeGaussianBlur { radius: 2.0 },
            ))]),
            2 => LayerEffects::from_array(vec![FilterEffect::BackdropBlur(FeBlur::Gaussian(
                FeGaussianBlur { radius: 4.0 },
            ))]),
            _ => unreachable!(),
        };

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke Dash Array Demo Row
    for i in 0..4 {
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 4.0;

        // Add different dash patterns
        rect.stroke_style.stroke_dash_array = match i {
            0 => Some([5.0, 5.0].into()),           // Basic dashed line
            1 => Some([10.0, 5.0].into()),          // Longer dashes
            2 => Some([5.0, 5.0, 1.0, 5.0].into()), // Dash-dot pattern
            3 => Some([1.0, 1.0].into()),           // Dotted line
            _ => unreachable!(),
        };

        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Stroke Paint Types Demo Row
    {
        // Linear Gradient Stroke
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 8.0;
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );

        // Radial Gradient Stroke
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 8.0;
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );

        // Conic Gradient Stroke
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 8.0;
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );

        // Multi-color Solid Stroke
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * 3.0, 850.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(8.0);
        rect.set_fill(Paint::from(CGColor(0, 0, 0, 0)));
        rect.strokes = Paints::new([Paint::from(CGColor(255, 128, 0, 255))]);
        rect.stroke_style.stroke_width = 8.0;
        rect.stroke_style.stroke_dash_array = Some([20.0, 10.0, 5.0, 10.0].into()); // Complex dash pattern
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Multiple Strokes Demo Row
    {
        // Rectangle with multiple solid strokes (layered strokes)
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 12.0; // Thick stroke to show layering
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );

        // Rectangle with solid + gradient strokes
        let mut rect = nf.create_rectangle_node();
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
        rect.stroke_style.stroke_width = 10.0;
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );

        // Ellipse with multiple gradient strokes
        let mut ellipse = nf.create_ellipse_node();
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
        ellipse.stroke_style.stroke_width = 12.0;
        graph.append_child(
            Node::Ellipse(ellipse),
            Parent::NodeId(root_container_id.clone()),
        );

        // Polygon with complex multi-stroke pattern
        let mut polygon = nf.create_regular_polygon_node();
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
        polygon.stroke_style.stroke_width = 15.0; // Very thick to show all layers
        polygon.stroke_style.stroke_dash_array = Some([8.0, 4.0].into()); // Dashed pattern
        graph.append_child(
            Node::RegularPolygon(polygon),
            Parent::NodeId(root_container_id.clone()),
        );
    }

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
