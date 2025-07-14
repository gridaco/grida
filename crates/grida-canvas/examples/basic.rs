use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
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
    image_node.base.name = "Test Image".to_string();
    image_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    image_node.size = Size {
        width: 200.0,
        height: 200.0,
    };
    image_node.corner_radius = RectangularCornerRadius::all(20.0);
    image_node.stroke_width = 2.0;
    image_node.effects = vec![FilterEffect::DropShadow(FeDropShadow {
        dx: 4.0,
        dy: 4.0,
        blur: 8.0,
        color: Color(0, 0, 0, 77),
    })];
    image_node.hash = demo_image_id.to_string();

    // Create a test rectangle node with linear gradient
    let mut rect_node = nf.create_rectangle_node();
    rect_node.base.name = "Test Rectangle".to_string();
    rect_node.transform = AffineTransform::new(300.0, 50.0, 0.0);
    rect_node.size = Size {
        width: 200.0,
        height: 100.0,
    };
    rect_node.corner_radius = RectangularCornerRadius::all(10.0);
    rect_node.set_fill(Paint::Solid(SolidPaint {
        color: Color(255, 0, 0, 255), // Red fill
        opacity: 1.0,
    }));
    rect_node.stroke_width = 2.0;
    rect_node.effects = vec![FilterEffect::DropShadow(FeDropShadow {
        dx: 4.0,
        dy: 4.0,
        blur: 8.0,
        color: Color(0, 0, 0, 77),
    })];

    // Create a test ellipse node with radial gradient and a visible stroke
    let mut ellipse_node = nf.create_ellipse_node();
    ellipse_node.base.name = "Test Ellipse".to_string();
    ellipse_node.blend_mode = BlendMode::Multiply;
    ellipse_node.transform = AffineTransform::new(550.0, 50.0, 0.0);
    ellipse_node.size = Size {
        width: 200.0,
        height: 200.0,
    };
    ellipse_node.fills = vec![Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(0, 255, 0, 255), // Green
            },
            GradientStop {
                offset: 0.5,
                color: Color(255, 255, 0, 255), // Yellow
            },
            GradientStop {
                offset: 1.0,
                color: Color(255, 0, 255, 255), // Magenta
            },
        ],
        opacity: 1.0,
    })];
    ellipse_node.stroke_width = 6.0;

    // Create a test polygon node (pentagon)
    let pentagon_points = (0..5)
        .map(|i| {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 5.0 - std::f32::consts::FRAC_PI_2;
            let radius = 100.0;
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            Point { x, y }
        })
        .collect::<Vec<_>>();

    let mut polygon_node = nf.create_polygon_node();
    polygon_node.base.name = "Test Polygon".to_string();
    polygon_node.blend_mode = BlendMode::Screen;
    polygon_node.transform = AffineTransform::new(800.0, 50.0, 0.0);
    polygon_node.points = pentagon_points;
    polygon_node.fills = vec![Paint::Solid(SolidPaint {
        color: Color(255, 200, 0, 255), // Orange fill
        opacity: 1.0,
    })];
    polygon_node.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255), // Black stroke
        opacity: 1.0,
    })];
    polygon_node.stroke_width = 5.0;

    // Create a test regular polygon node (hexagon)
    let mut regular_polygon_node = nf.create_regular_polygon_node();
    regular_polygon_node.base.name = "Test Regular Polygon".to_string();
    regular_polygon_node.blend_mode = BlendMode::Overlay;
    regular_polygon_node.transform = AffineTransform::new(50.0, 300.0, 0.0);
    regular_polygon_node.size = Size {
        width: 200.0,
        height: 200.0,
    };
    regular_polygon_node.point_count = 6; // hexagon
    regular_polygon_node.fills = vec![Paint::Solid(SolidPaint {
        color: Color(0, 200, 255, 255), // Cyan fill
        opacity: 1.0,
    })];
    regular_polygon_node.stroke_width = 4.0;
    regular_polygon_node.opacity = 0.5;

    // Create a test text span node
    let mut text_span_node = nf.create_text_span_node();
    text_span_node.base.name = "Test Text".to_string();
    text_span_node.transform = AffineTransform::new(300.0, 300.0, 0.0);
    text_span_node.size = Size {
        width: 300.0,
        height: 200.0,
    };
    text_span_node.text = "Grida Canvas SKIA Bindings Backend".to_string();
    text_span_node.text_style = TextStyle {
        text_decoration: TextDecoration::LineThrough,
        font_family: font_caveat_family.clone(),
        font_size: 32.0,
        font_weight: FontWeight::new(900),
        italic: false,
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    text_span_node.text_align = TextAlign::Center;
    text_span_node.text_align_vertical = TextAlignVertical::Center;
    text_span_node.stroke = Some(Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255), // Black stroke
        opacity: 1.0,
    }));
    text_span_node.stroke_width = Some(4.0);

    // Create a test path node
    let mut path_node = nf.create_path_node();
    path_node.base.name = "Test Path".to_string();
    path_node.transform = AffineTransform::new(550.0, 300.0, 0.0);
    path_node.data = "M50 150H0v-50h50v50ZM150 150h-50v-50h50v50ZM100 100H50V50h50v50ZM50 50H0V0h50v50ZM150 50h-50V0h50v50Z".to_string();
    path_node.stroke = Some(Paint::Solid(SolidPaint {
        color: Color(255, 0, 0, 255), // Red stroke
        opacity: 1.0,
    }));
    path_node.stroke_width = 4.0;

    // Create a test line node with solid color
    let mut line_node = nf.create_line_node();
    line_node.base.name = "Test Line".to_string();
    line_node.opacity = 0.8;
    line_node.transform = AffineTransform::new(800.0, 300.0, 0.0);
    line_node.size = Size {
        width: 200.0,
        height: 0.0, // ignored
    };
    line_node.strokes = vec![Paint::Solid(SolidPaint {
        color: Color(0, 255, 0, 255), // Green color
        opacity: 1.0,
    })];
    line_node.stroke_width = 4.0;

    // Create a group node for the shapes (rectangle, ellipse, polygon)
    let mut shapes_group_node = nf.create_group_node();
    shapes_group_node.base.name = "Shapes Group".to_string();
    shapes_group_node.transform = AffineTransform::new(0.0, 0.0, 0.0);

    // Create a root container node containing the shapes group, text, and line
    let mut root_container_node = nf.create_container_node();
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };
    root_container_node.base.name = "Root Container".to_string();

    // Create a node map and add all nodes
    let mut repository = NodeRepository::new();

    // First, collect all the IDs we'll need
    let rect_id = rect_node.base.id.clone();
    let ellipse_id = ellipse_node.base.id.clone();
    let polygon_id = polygon_node.base.id.clone();
    let regular_polygon_id = regular_polygon_node.base.id.clone();
    let text_span_id = text_span_node.base.id.clone();
    let line_id = line_node.base.id.clone();
    let image_id = image_node.base.id.clone();
    let path_id = path_node.base.id.clone();

    // Now add all nodes to the map
    repository.insert(Node::Rectangle(rect_node));
    repository.insert(Node::Ellipse(ellipse_node));
    repository.insert(Node::Polygon(polygon_node));
    repository.insert(Node::RegularPolygon(regular_polygon_node));
    repository.insert(Node::TextSpan(text_span_node));
    repository.insert(Node::Line(line_node));
    repository.insert(Node::Image(image_node));
    repository.insert(Node::SVGPath(path_node));

    // Now set up the shapes group with the IDs we collected
    shapes_group_node.children = vec![rect_id, ellipse_id, polygon_id, regular_polygon_id];
    let shapes_group_id = shapes_group_node.base.id.clone();
    repository.insert(Node::Group(shapes_group_node));

    // Finally set up the root container with all IDs
    root_container_node.children = vec![shapes_group_id, text_span_id, line_id, path_id, image_id];
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Demo".to_string(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_basic().await;

    window::run_demo_window(scene).await;
}
