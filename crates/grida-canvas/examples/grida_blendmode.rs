// FIXME: broken demo - make this golden_ not grida_

use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_blendmode() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.layout_dimensions.width = Some(2000.0);
    root_container_node.layout_dimensions.height = Some(4000.0);

    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);
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
                    color: CGColor(255, 255, 255, 255), // White center
                },
                GradientStop {
                    offset: 0.5,
                    color: CGColor(255, 255, 255, 255), // White middle
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(255, 255, 255, 0), // Transparent edge
                },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            active: true,
        }));

        graph.append_child(
            Node::Rectangle(background),
            Parent::NodeId(root_container_id.clone()),
        );

        // Create a sweep gradient overlay (similar to C++ example's sweep gradient)
        let mut sweep_overlay = nf.create_rectangle_node();
        sweep_overlay.transform = AffineTransform::new(x, y, 0.0);
        sweep_overlay.size = Size {
            width: base_size,
            height: base_size,
        };
        sweep_overlay.corner_radius = RectangularCornerRadius::circular(20.0);
        sweep_overlay.blend_mode = LayerBlendMode::Blend(BlendMode::Multiply);

        // Create a sweep-like effect using a radial gradient with multiple color stops
        sweep_overlay.set_fill(Paint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::new(base_size / 2.0, base_size / 2.0, -90.0), // Rotate -90 degrees
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 0, 255, 255), // Magenta
                },
                GradientStop {
                    offset: 0.14,
                    color: CGColor(255, 0, 0, 255), // Red
                },
                GradientStop {
                    offset: 0.28,
                    color: CGColor(255, 255, 0, 255), // Yellow
                },
                GradientStop {
                    offset: 0.42,
                    color: CGColor(0, 255, 0, 255), // Green
                },
                GradientStop {
                    offset: 0.57,
                    color: CGColor(0, 255, 255, 255), // Cyan
                },
                GradientStop {
                    offset: 0.71,
                    color: CGColor(0, 0, 255, 255), // Blue
                },
                GradientStop {
                    offset: 0.85,
                    color: CGColor(255, 0, 255, 255), // Magenta
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(255, 0, 255, 255), // Magenta
                },
            ],
            opacity: 0.3, // Make it subtle
            blend_mode: BlendMode::Normal,
            active: true,
        }));

        graph.append_child(
            Node::Rectangle(sweep_overlay),
            Parent::NodeId(root_container_id.clone()),
        );

        // Create a group for the colored circles with the specific blend mode
        let mut circle_group = nf.create_group_node();
        circle_group.transform = Some(AffineTransform::new(x, y, 0.0));
        circle_group.blend_mode = LayerBlendMode::Blend(*blend_mode);

        // Add group to root container first
        let circle_group_id = graph.append_child(
            Node::Group(circle_group),
            Parent::NodeId(root_container_id.clone()),
        );

        // Create three colored circles (green, red, blue) like in the C++ example
        let circle_radius = 80.0;

        // Green circle (top)
        let mut green_circle = nf.create_ellipse_node();
        green_circle.transform = AffineTransform::new(base_size / 2.0, circle_radius, 0.0);
        green_circle.size = Size {
            width: circle_radius * 2.0,
            height: circle_radius * 2.0,
        };
        green_circle.set_fill(Paint::from(CGColor(0, 255, 0, 255)));
        green_circle.blend_mode = LayerBlendMode::default();
        graph.append_child(
            Node::Ellipse(green_circle),
            Parent::NodeId(circle_group_id.clone()),
        );

        // Red circle (bottom left)
        let mut red_circle = nf.create_ellipse_node();
        red_circle.transform = AffineTransform::new(circle_radius, base_size - circle_radius, 0.0);
        red_circle.size = Size {
            width: circle_radius * 2.0,
            height: circle_radius * 2.0,
        };
        red_circle.set_fill(Paint::from(CGColor(255, 0, 0, 255)));
        red_circle.blend_mode = LayerBlendMode::default();
        graph.append_child(
            Node::Ellipse(red_circle),
            Parent::NodeId(circle_group_id.clone()),
        );

        // Blue circle (bottom right)
        let mut blue_circle = nf.create_ellipse_node();
        blue_circle.transform =
            AffineTransform::new(base_size - circle_radius, base_size - circle_radius, 0.0);
        blue_circle.size = Size {
            width: circle_radius * 2.0,
            height: circle_radius * 2.0,
        };
        blue_circle.set_fill(Paint::from(CGColor(0, 0, 255, 255)));
        blue_circle.blend_mode = LayerBlendMode::default();
        graph.append_child(
            Node::Ellipse(blue_circle),
            Parent::NodeId(circle_group_id.clone()),
        );

        // Create a text label for the blend mode
        let mut label = nf.create_text_span_node();
        label.transform = AffineTransform::new(x + 10.0, y + 10.0, 0.0);
        label.width = Some(base_size - 20.0);
        label.text = format!("{:?}", blend_mode);
        label.text_style = TextStyleRec::from_font("Geist", 14.0);
        label.text_align = TextAlign::Left;
        label.text_align_vertical = TextAlignVertical::Top;
        label.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
        graph.append_child(
            Node::TextSpan(label),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    Scene {
        name: "Blend Mode Demo".to_string(),
        background_color: Some(CGColor(240, 240, 240, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_blendmode().await;
    window::run_demo_window(scene).await;
}
