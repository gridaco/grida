use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_blendmode() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.size = Size {
        width: 2000.0,
        height: 4000.0,
    };
    root_container_node.name = Some("Root Container".to_string());

    let mut all_blendmode_ids = Vec::new();
    let spacing = 400.0;
    let start_x = 50.0;
    let base_size = 256.0;

    // Define all blend modes to demonstrate
    let blend_modes = vec![
        BlendMode::Normal,
        BlendMode::Multiply,
        BlendMode::Screen,
        BlendMode::Overlay,
        BlendMode::Darken,
        BlendMode::Lighten,
        BlendMode::ColorDodge,
        BlendMode::ColorBurn,
        BlendMode::HardLight,
        BlendMode::SoftLight,
        BlendMode::Difference,
        BlendMode::Exclusion,
        BlendMode::Hue,
        BlendMode::Saturation,
        BlendMode::Color,
        BlendMode::Luminosity,
    ];

    for (i, blend_mode) in blend_modes.iter().enumerate() {
        let row = i / 4; // 4 items per row
        let col = i % 4;
        let x = start_x + spacing * col as f32;
        let y = 50.0 + spacing * row as f32;

        // Create background with radial gradient
        let mut background = nf.create_rectangle_node();
        background.name = Some(format!("Background {}", i));
        background.transform = AffineTransform::new(x, y, 0.0);
        background.size = Size {
            width: base_size,
            height: base_size,
        };
        background.corner_radius = RectangularCornerRadius::circular(20.0);

        // Create a complex background with radial gradient (similar to C++ example)
        background.set_fill(Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::identity(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 255, 255, 255), // White center
                },
                GradientStop {
                    offset: 0.5,
                    color: Color(255, 255, 255, 255), // White middle
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 255, 255, 0), // Transparent edge
                },
            ],
            opacity: 1.0,
        }));

        let background_id = background.id.clone();
        repository.insert(Node::Rectangle(background));

        // Create a sweep gradient overlay (similar to C++ example's sweep gradient)
        let mut sweep_overlay = nf.create_rectangle_node();
        sweep_overlay.name = Some(format!("Sweep Overlay {}", i));
        sweep_overlay.transform = AffineTransform::new(x, y, 0.0);
        sweep_overlay.size = Size {
            width: base_size,
            height: base_size,
        };
        sweep_overlay.corner_radius = RectangularCornerRadius::circular(20.0);
        sweep_overlay.blend_mode = BlendMode::Multiply; // Modulate equivalent

        // Create a sweep-like effect using a radial gradient with multiple color stops
        sweep_overlay.set_fill(Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::new(base_size / 2.0, base_size / 2.0, -90.0), // Rotate -90 degrees
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color(255, 0, 255, 255), // Magenta
                },
                GradientStop {
                    offset: 0.14,
                    color: Color(255, 0, 0, 255), // Red
                },
                GradientStop {
                    offset: 0.28,
                    color: Color(255, 255, 0, 255), // Yellow
                },
                GradientStop {
                    offset: 0.42,
                    color: Color(0, 255, 0, 255), // Green
                },
                GradientStop {
                    offset: 0.57,
                    color: Color(0, 255, 255, 255), // Cyan
                },
                GradientStop {
                    offset: 0.71,
                    color: Color(0, 0, 255, 255), // Blue
                },
                GradientStop {
                    offset: 0.85,
                    color: Color(255, 0, 255, 255), // Magenta
                },
                GradientStop {
                    offset: 1.0,
                    color: Color(255, 0, 255, 255), // Magenta
                },
            ],
            opacity: 0.3, // Make it subtle
        }));

        let sweep_overlay_id = sweep_overlay.id.clone();
        repository.insert(Node::Rectangle(sweep_overlay));

        // Create a group for the colored circles with the specific blend mode
        let mut circle_group = nf.create_group_node();
        circle_group.name = Some(format!("Circle Group {}", i));
        circle_group.transform = AffineTransform::new(x, y, 0.0);
        circle_group.blend_mode = *blend_mode;

        let mut circle_ids = Vec::new();

        // Create three colored circles (green, red, blue) like in the C++ example
        let circle_radius = 80.0;

        // Green circle (top)
        let mut green_circle = nf.create_ellipse_node();
        green_circle.name = Some(format!("Green Circle {}", i));
        green_circle.transform = AffineTransform::new(base_size / 2.0, circle_radius, 0.0);
        green_circle.size = Size {
            width: circle_radius * 2.0,
            height: circle_radius * 2.0,
        };
        green_circle.set_fill(Paint::Solid(SolidPaint {
            color: Color(0, 255, 0, 255), // Green
            opacity: 1.0,
        }));
        green_circle.blend_mode = BlendMode::Normal; // Plus equivalent
        let green_circle_id = green_circle.id.clone();
        repository.insert(Node::Ellipse(green_circle));
        circle_ids.push(green_circle_id);

        // Red circle (bottom left)
        let mut red_circle = nf.create_ellipse_node();
        red_circle.name = Some(format!("Red Circle {}", i));
        red_circle.transform = AffineTransform::new(circle_radius, base_size - circle_radius, 0.0);
        red_circle.size = Size {
            width: circle_radius * 2.0,
            height: circle_radius * 2.0,
        };
        red_circle.set_fill(Paint::Solid(SolidPaint {
            color: Color(255, 0, 0, 255), // Red
            opacity: 1.0,
        }));
        red_circle.blend_mode = BlendMode::Normal; // Plus equivalent
        let red_circle_id = red_circle.id.clone();
        repository.insert(Node::Ellipse(red_circle));
        circle_ids.push(red_circle_id);

        // Blue circle (bottom right)
        let mut blue_circle = nf.create_ellipse_node();
        blue_circle.name = Some(format!("Blue Circle {}", i));
        blue_circle.transform =
            AffineTransform::new(base_size - circle_radius, base_size - circle_radius, 0.0);
        blue_circle.size = Size {
            width: circle_radius * 2.0,
            height: circle_radius * 2.0,
        };
        blue_circle.set_fill(Paint::Solid(SolidPaint {
            color: Color(0, 0, 255, 255), // Blue
            opacity: 1.0,
        }));
        blue_circle.blend_mode = BlendMode::Normal; // Plus equivalent
        let blue_circle_id = blue_circle.id.clone();
        repository.insert(Node::Ellipse(blue_circle));
        circle_ids.push(blue_circle_id);

        // Set up the circle group
        circle_group.children = circle_ids;
        let circle_group_id = circle_group.id.clone();
        repository.insert(Node::Group(circle_group));

        // Create a text label for the blend mode
        let mut label = nf.create_text_span_node();
        label.name = Some(format!("Label {}", i));
        label.transform = AffineTransform::new(x + 10.0, y + 10.0, 0.0);
        label.size = Size {
            width: base_size - 20.0,
            height: 30.0,
        };
        label.text = format!("{:?}", blend_mode);
        label.text_style = TextStyle {
            text_decoration: TextDecoration::None,
            font_family: "".to_string(),
            font_size: 14.0,
            font_weight: FontWeight::new(700),
            italic: false,
            letter_spacing: None,
            line_height: None,
            text_transform: TextTransform::None,
        };
        label.text_align = TextAlign::Left;
        label.text_align_vertical = TextAlignVertical::Top;
        label.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255), // Black text
            opacity: 1.0,
        });
        let label_id = label.id.clone();
        repository.insert(Node::TextSpan(label));

        // Add all elements for this blend mode
        all_blendmode_ids.push(background_id);
        all_blendmode_ids.push(sweep_overlay_id);
        all_blendmode_ids.push(circle_group_id);
        all_blendmode_ids.push(label_id);
    }

    // Set up the root container
    root_container_node.children = all_blendmode_ids;
    let root_container_id = root_container_node.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Blend Mode Demo".to_string(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(240, 240, 240, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_blendmode().await;
    window::run_demo_window(scene).await;
}
