use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_fills() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Root container
    let mut root = nf.create_container_node();
    root.base.name = "Root".to_string();
    root.size = Size {
        width: 1200.0,
        height: 800.0,
    };

    let mut ids = Vec::new();
    let spacing = 200.0;
    let start_x = 100.0;
    let base_y = 100.0;

    // 1. Rectangle with multiple solid fills (layered colors)
    let mut multi_solid_rect = nf.create_rectangle_node();
    multi_solid_rect.base.name = "Multi Solid Fills".to_string();
    multi_solid_rect.transform = AffineTransform::new(start_x, base_y, 0.0);
    multi_solid_rect.size = Size {
        width: 150.0,
        height: 150.0,
    };
    multi_solid_rect.corner_radius = RectangularCornerRadius::all(20.0);
    multi_solid_rect.fills = vec![
        Paint::Solid(SolidPaint {
            color: Color(255, 0, 0, 255), // Red base
            opacity: 1.0,
        }),
        Paint::Solid(SolidPaint {
            color: Color(0, 255, 0, 255), // Green overlay
            opacity: 0.6,
        }),
        Paint::Solid(SolidPaint {
            color: Color(0, 0, 255, 255), // Blue overlay
            opacity: 0.4,
        }),
    ];
    multi_solid_rect.stroke_width = 3.0;
    ids.push(multi_solid_rect.base.id.clone());
    repository.insert(Node::Rectangle(multi_solid_rect));

    // 2. Rectangle with solid + linear gradient fills
    let mut solid_gradient_rect = nf.create_rectangle_node();
    solid_gradient_rect.base.name = "Solid + Linear Gradient".to_string();
    solid_gradient_rect.transform = AffineTransform::new(start_x + spacing, base_y, 0.0);
    solid_gradient_rect.size = Size {
        width: 150.0,
        height: 150.0,
    };
    solid_gradient_rect.corner_radius = RectangularCornerRadius::all(20.0);
    solid_gradient_rect.fills = vec![
        Paint::Solid(SolidPaint {
            color: Color(255, 255, 0, 255), // Yellow base
            opacity: 1.0,
        }),
        Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(45.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 255, 255), // Magenta
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(0, 255, 255, 255), // Cyan
                },
            ],
            opacity: 0.6,
        }),
    ];
    solid_gradient_rect.stroke_width = 3.0;
    ids.push(solid_gradient_rect.base.id.clone());
    repository.insert(Node::Rectangle(solid_gradient_rect));

    // 3. Rectangle with solid + radial gradient fills
    let mut solid_radial_rect = nf.create_rectangle_node();
    solid_radial_rect.base.name = "Solid + Radial Gradient".to_string();
    solid_radial_rect.transform = AffineTransform::new(start_x + spacing * 2.0, base_y, 0.0);
    solid_radial_rect.size = Size {
        width: 150.0,
        height: 150.0,
    };
    solid_radial_rect.corner_radius = RectangularCornerRadius::all(20.0);
    solid_radial_rect.fills = vec![
        Paint::Solid(SolidPaint {
            color: Color(128, 128, 128, 255), // Gray base
            opacity: 1.0,
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 255, 255, 255), // White center
                },
                GradientStop {
                    offset: 0.7,
                    color: Color(255, 255, 255, 255), // White
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 255, 255, 0), // Transparent edge
                },
            ],
            opacity: 0.7,
        }),
    ];
    solid_radial_rect.stroke_width = 3.0;
    ids.push(solid_radial_rect.base.id.clone());
    repository.insert(Node::Rectangle(solid_radial_rect));

    // 4. Rectangle with linear + radial gradient fills
    let mut gradient_gradient_rect = nf.create_rectangle_node();
    gradient_gradient_rect.base.name = "Linear + Radial Gradient".to_string();
    gradient_gradient_rect.transform = AffineTransform::new(start_x + spacing * 3.0, base_y, 0.0);
    gradient_gradient_rect.size = Size {
        width: 150.0,
        height: 150.0,
    };
    gradient_gradient_rect.corner_radius = RectangularCornerRadius::all(20.0);
    gradient_gradient_rect.fills = vec![
        Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(90.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 0, 255), // Red
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(0, 0, 255, 255), // Blue
                },
            ],
            opacity: 1.0,
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform {
                matrix: [[0.8, 0.0, 0.1], [0.0, 0.8, 0.1]],
            },
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 255, 0, 255), // Yellow center
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 255, 0, 0), // Transparent edge
                },
            ],
            opacity: 0.5,
        }),
    ];
    gradient_gradient_rect.stroke_width = 3.0;
    ids.push(gradient_gradient_rect.base.id.clone());
    repository.insert(Node::Rectangle(gradient_gradient_rect));

    // 5. Ellipse with multiple radial gradients (concentric circles effect)
    let mut multi_radial_ellipse = nf.create_ellipse_node();
    multi_radial_ellipse.base.name = "Multi Radial Gradients".to_string();
    multi_radial_ellipse.transform = AffineTransform::new(start_x, base_y + spacing, 0.0);
    multi_radial_ellipse.size = Size {
        width: 150.0,
        height: 150.0,
    };
    multi_radial_ellipse.fills = vec![
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 0, 255), // Red center
                },
                GradientStop {
                    offset: 0.33,
                    color: Color(255, 0, 0, 0), // Transparent
                },
            ],
            opacity: 1.0,
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.33,
                    color: Color(0, 255, 0, 255), // Green middle ring
                },
                GradientStop {
                    offset: 0.66,
                    color: Color(0, 255, 0, 0), // Transparent
                },
            ],
            opacity: 0.8,
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.66,
                    color: Color(0, 0, 255, 255), // Blue outer ring
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(0, 0, 255, 0), // Transparent
                },
            ],
            opacity: 0.6,
        }),
    ];
    multi_radial_ellipse.stroke_width = 3.0;
    ids.push(multi_radial_ellipse.base.id.clone());
    repository.insert(Node::Ellipse(multi_radial_ellipse));

    // 6. Polygon with solid + linear gradient + radial gradient
    let pentagon_points = (0..5)
        .map(|i| {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 5.0 - std::f32::consts::FRAC_PI_2;
            let radius = 75.0;
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            Point { x, y }
        })
        .collect::<Vec<_>>();

    let mut complex_fill_polygon = nf.create_polygon_node();
    complex_fill_polygon.base.name = "Complex Multi-Fill Polygon".to_string();
    complex_fill_polygon.transform = AffineTransform::new(start_x + spacing, base_y + spacing, 0.0);
    complex_fill_polygon.points = pentagon_points;
    complex_fill_polygon.fills = vec![
        Paint::Solid(SolidPaint {
            color: Color(255, 128, 0, 255), // Orange base
            opacity: 1.0,
        }),
        Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(30.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 255, 255, 255), // White overlay
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 255, 255, 0), // Transparent
                },
            ],
            opacity: 0.7,
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform {
                matrix: [[0.6, 0.0, 0.2], [0.0, 0.6, 0.2]],
            },
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 255, 255), // Magenta highlight
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 0, 255, 0), // Transparent
                },
            ],
            opacity: 0.5,
        }),
    ];
    complex_fill_polygon.stroke_width = 4.0;
    ids.push(complex_fill_polygon.base.id.clone());
    repository.insert(Node::Polygon(complex_fill_polygon));

    // 7. Regular polygon with multiple linear gradients at different angles
    let mut multi_linear_polygon = nf.create_regular_polygon_node();
    multi_linear_polygon.base.name = "Multi Linear Gradients".to_string();
    multi_linear_polygon.transform =
        AffineTransform::new(start_x + spacing * 2.0, base_y + spacing, 0.0);
    multi_linear_polygon.size = Size {
        width: 150.0,
        height: 150.0,
    };
    multi_linear_polygon.point_count = 6; // Hexagon
    multi_linear_polygon.fills = vec![
        Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(0.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 0, 255), // Red
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 0, 0, 0), // Transparent
                },
            ],
            opacity: 1.0,
        }),
        Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(60.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(0, 255, 0, 255), // Green
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(0, 255, 0, 0), // Transparent
                },
            ],
            opacity: 0.8,
        }),
        Paint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::from_rotatation(120.0),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(0, 0, 255, 255), // Blue
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(0, 0, 255, 0), // Transparent
                },
            ],
            opacity: 0.6,
        }),
    ];
    multi_linear_polygon.stroke_width = 3.0;
    ids.push(multi_linear_polygon.base.id.clone());
    repository.insert(Node::RegularPolygon(multi_linear_polygon));

    // 8. Container with multiple fills (demonstrating container fill capability)
    let mut multi_fill_container = nf.create_container_node();
    multi_fill_container.base.name = "Multi-Fill Container".to_string();
    multi_fill_container.transform =
        AffineTransform::new(start_x + spacing * 3.0, base_y + spacing, 0.0);
    multi_fill_container.size = Size {
        width: 150.0,
        height: 150.0,
    };
    multi_fill_container.fills = vec![
        Paint::Solid(SolidPaint {
            color: Color(128, 0, 128, 255), // Purple base
            opacity: 1.0,
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 255, 255, 255), // White center
                },
                GradientStop {
                    offset: 0.5,
                    color: Color(255, 255, 255, 255), // White
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 255, 255, 0), // Transparent edge
                },
            ],
            opacity: 0.6,
        }),
    ];
    multi_fill_container.stroke_width = 3.0;
    ids.push(multi_fill_container.base.id.clone());
    repository.insert(Node::Container(multi_fill_container));

    // Add all nodes to root
    root.children = ids.clone();
    let root_id = root.base.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Fills Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(Color(240, 240, 240, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_fills().await;
    window::run_demo_window(scene).await;
}
