use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_basic() -> Scene {
    let font_caveat_family = "Caveat".to_string();

    let nf = NodeFactory::new();

    // Preload image before timing
    let demo_image_id = "demo_image";

    // Create a test image node with URL
    let mut image_node = nf.create_image_node();
    image_node.name = Some("Test Image".to_string());
    image_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    image_node.size = Size {
        width: 200.0,
        height: 200.0,
    };
    image_node.corner_radius = RectangularCornerRadius::circular(20.0);
    image_node.stroke_width = 2.0;
    image_node.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 4.0,
        dy: 4.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 77),
    })]);
    image_node.image = ResourceRef::RID(format!("res://images/{}", demo_image_id));

    // Create a test rectangle node with linear gradient
    let mut rect_node = nf.create_rectangle_node();
    rect_node.name = Some("Test Rectangle".to_string());
    rect_node.transform = AffineTransform::new(300.0, 50.0, 0.0);
    rect_node.size = Size {
        width: 200.0,
        height: 100.0,
    };
    rect_node.corner_radius = RectangularCornerRadius::circular(10.0);
    rect_node.set_fill(Paint::from(CGColor(255, 0, 0, 255)));
    rect_node.stroke_width = 2.0;
    rect_node.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 4.0,
        dy: 4.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 77),
    })]);

    // Create a test ellipse node with radial gradient and a visible stroke
    let mut ellipse_node = nf.create_ellipse_node();
    ellipse_node.name = Some("Test Ellipse".to_string());
    ellipse_node.blend_mode = BlendMode::Multiply.into();
    ellipse_node.transform = AffineTransform::new(550.0, 50.0, 0.0);
    ellipse_node.size = Size {
        width: 200.0,
        height: 200.0,
    };
    ellipse_node.fills = Paints::new([Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(0, 255, 0, 255), // Green
            },
            GradientStop {
                offset: 0.5,
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
    ellipse_node.stroke_width = 6.0;

    // Create a test polygon node (pentagon)
    let pentagon_points = (0..5)
        .map(|i| {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 5.0 - std::f32::consts::FRAC_PI_2;
            let radius = 100.0;
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            CGPoint { x, y }
        })
        .collect::<Vec<_>>();

    let mut polygon_node = nf.create_polygon_node();
    polygon_node.name = Some("Test Polygon".to_string());
    polygon_node.blend_mode = BlendMode::Screen.into();
    polygon_node.transform = AffineTransform::new(600.0, 50.0, 0.0);
    polygon_node.points = pentagon_points;
    polygon_node.fills = Paints::new([Paint::from(CGColor(255, 200, 0, 255))]);
    polygon_node.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
    polygon_node.stroke_width = 5.0;

    // Create a test regular polygon node (hexagon)
    let mut regular_polygon_node = nf.create_regular_polygon_node();
    regular_polygon_node.name = Some("Test Regular Polygon".to_string());
    regular_polygon_node.blend_mode = BlendMode::Overlay.into();
    regular_polygon_node.transform = AffineTransform::new(50.0, 300.0, 0.0);
    regular_polygon_node.size = Size {
        width: 200.0,
        height: 200.0,
    };
    regular_polygon_node.point_count = 6; // hexagon
    regular_polygon_node.fills = Paints::new([Paint::from(CGColor(0, 200, 255, 255))]);
    regular_polygon_node.stroke_width = 4.0;
    regular_polygon_node.opacity = 0.5;

    // Create a test text span node
    let mut text_span_node = nf.create_text_span_node();
    text_span_node.name = Some("Test Text".to_string());
    text_span_node.transform = AffineTransform::new(300.0, 300.0, 0.0);
    text_span_node.width = Some(300.0);
    text_span_node.text = "Grida Canvas SKIA Bindings Backend".to_string();
    text_span_node.text_style = TextStyleRec::from_font(font_caveat_family.as_str(), 32.0);
    text_span_node.text_align = TextAlign::Center;
    text_span_node.text_align_vertical = TextAlignVertical::Center;
    text_span_node.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
    text_span_node.stroke_width = 4.0;

    // Create a test path node
    let mut path_node = nf.create_path_node();
    path_node.name = Some("Test Path".to_string());
    path_node.transform = AffineTransform::new(550.0, 300.0, 0.0);
    path_node.data = "M50 150H0v-50h50v50ZM150 150h-50v-50h50v50ZM100 100H50V50h50v50ZM50 50H0V0h50v50ZM150 50h-50V0h50v50Z".to_string();
    path_node.strokes = Paints::new([Paint::from(CGColor(255, 0, 0, 255))]);
    path_node.stroke_width = 4.0;

    // Create a test line node with solid color
    let mut line_node = nf.create_line_node();
    line_node.name = Some("Test Line".to_string());
    line_node.opacity = 0.8;
    line_node.transform = AffineTransform::new(800.0, 300.0, 0.0);
    line_node.size = Size {
        width: 200.0,
        height: 0.0, // ignored
    };
    line_node.strokes = Paints::new([Paint::from(CGColor(0, 255, 0, 255))]);
    line_node.stroke_width = 4.0;

    // Create a group node for the shapes (rectangle, ellipse, polygon)
    let shapes_group_node = nf.create_group_node();

    // Create a root container node containing the shapes group, text, and line
    let mut root_container_node = nf.create_container_node();
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };
    root_container_node.name = Some("Root Container".to_string());

    // Build the scene graph
    let mut graph = SceneGraph::new();

    // Add root container
    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);

    // Add shapes group to container
    let shapes_group_id = graph.append_child(
        Node::Group(shapes_group_node),
        Parent::NodeId(root_container_id.clone()),
    );

    // Add shapes to group
    graph.append_children(
        vec![
            Node::Rectangle(rect_node),
            Node::Ellipse(ellipse_node),
            Node::Polygon(polygon_node),
            Node::RegularPolygon(regular_polygon_node),
        ],
        Parent::NodeId(shapes_group_id),
    );

    // Add other elements to container
    graph.append_children(
        vec![
            Node::TextSpan(text_span_node),
            Node::Line(line_node),
            Node::SVGPath(path_node),
            Node::Image(image_node),
        ],
        Parent::NodeId(root_container_id),
    );

    Scene {
        name: "Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_basic().await;

    window::run_demo_window(scene).await;
}
