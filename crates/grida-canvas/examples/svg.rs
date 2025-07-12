use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use math2::{rect::Rectangle, transform::AffineTransform};
use skia_safe::{svg, Rect as SkRect};
use std::fs::File;
use std::io::Write;

async fn demo_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    // Create a root container
    let mut root_container = nf.create_container_node();
    root_container.base.name = "Root Container".to_string();
    root_container.size = Size {
        width: 900.0,
        height: 700.0,
    };

    let mut all_node_ids = Vec::new();

    // Title text
    let mut title_text = nf.create_text_span_node();
    title_text.base.name = "Title".to_string();
    title_text.transform = AffineTransform::new(50.0, 50.0, 0.0);
    title_text.size = Size {
        width: 700.0,
        height: 60.0,
    };
    title_text.text = "Grida Canvas SVG Demo".to_string();
    title_text.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Arial".to_string(),
        font_size: 36.0,
        font_weight: FontWeight::new(700),
        italic: false,
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    title_text.text_align = TextAlign::Center;
    title_text.text_align_vertical = TextAlignVertical::Center;
    title_text.fill = Paint::Solid(SolidPaint {
        color: Color(50, 50, 50, 255),
        opacity: 1.0,
    });
    all_node_ids.push(title_text.base.id.clone());
    repo.insert(Node::TextSpan(title_text));

    // Subtitle text
    let mut subtitle_text = nf.create_text_span_node();
    subtitle_text.base.name = "Subtitle".to_string();
    subtitle_text.transform = AffineTransform::new(50.0, 120.0, 0.0);
    subtitle_text.size = Size {
        width: 700.0,
        height: 40.0,
    };
    subtitle_text.text =
        "Rich content demonstration with shapes, gradients, and effects".to_string();
    subtitle_text.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Arial".to_string(),
        font_size: 18.0,
        font_weight: FontWeight::new(400),
        italic: true,
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    subtitle_text.text_align = TextAlign::Center;
    subtitle_text.text_align_vertical = TextAlignVertical::Center;
    subtitle_text.fill = Paint::Solid(SolidPaint {
        color: Color(100, 100, 100, 255),
        opacity: 1.0,
    });
    all_node_ids.push(subtitle_text.base.id.clone());
    repo.insert(Node::TextSpan(subtitle_text));

    // Rectangle with gradient fill
    let mut rect_gradient = nf.create_rectangle_node();
    rect_gradient.base.name = "Gradient Rectangle".to_string();
    rect_gradient.transform = AffineTransform::new(50.0, 200.0, 0.0);
    rect_gradient.size = Size {
        width: 200.0,
        height: 150.0,
    };
    rect_gradient.corner_radius = RectangularCornerRadius::all(20.0);
    rect_gradient.fill = Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::from_rotatation(45.0),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(255, 100, 100, 255),
            },
            GradientStop {
                offset: 0.5,
                color: Color(100, 100, 255, 255),
            },
            GradientStop {
                offset: 1.0,
                color: Color(100, 255, 100, 255),
            },
        ],
        opacity: 1.0,
    });
    rect_gradient.stroke_width = 3.0;
    rect_gradient.stroke = Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255),
        opacity: 1.0,
    });
    rect_gradient.effect = Some(FilterEffect::DropShadow(FeDropShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 10.0,
        color: Color(0, 0, 0, 100),
    }));
    all_node_ids.push(rect_gradient.base.id.clone());
    repo.insert(Node::Rectangle(rect_gradient));

    // Ellipse with radial gradient
    let mut ellipse_radial = nf.create_ellipse_node();
    ellipse_radial.base.name = "Radial Ellipse".to_string();
    ellipse_radial.transform = AffineTransform::new(300.0, 200.0, 0.0);
    ellipse_radial.size = Size {
        width: 180.0,
        height: 150.0,
    };
    ellipse_radial.fill = Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(255, 255, 0, 255),
            },
            GradientStop {
                offset: 0.7,
                color: Color(255, 128, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: Color(255, 0, 0, 255),
            },
        ],
        opacity: 1.0,
    });
    ellipse_radial.stroke_width = 4.0;
    ellipse_radial.stroke = Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255),
        opacity: 1.0,
    });
    all_node_ids.push(ellipse_radial.base.id.clone());
    repo.insert(Node::Ellipse(ellipse_radial));

    // Polygon (hexagon)
    let hexagon_points = (0..6)
        .map(|i| {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 6.0 - std::f32::consts::FRAC_PI_2;
            let radius = 60.0;
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            Point { x, y }
        })
        .collect::<Vec<_>>();

    let mut hexagon = nf.create_polygon_node();
    hexagon.base.name = "Hexagon".to_string();
    hexagon.transform = AffineTransform::new(550.0, 200.0, 0.0);
    hexagon.points = hexagon_points;
    hexagon.fill = Paint::Solid(SolidPaint {
        color: Color(128, 0, 255, 255),
        opacity: 1.0,
    });
    hexagon.stroke_width = 3.0;
    hexagon.stroke = Paint::Solid(SolidPaint {
        color: Color(255, 255, 255, 255),
        opacity: 1.0,
    });
    hexagon.effect = Some(FilterEffect::DropShadow(FeDropShadow {
        dx: 3.0,
        dy: 3.0,
        blur: 8.0,
        color: Color(0, 0, 0, 150),
    }));
    all_node_ids.push(hexagon.base.id.clone());
    repo.insert(Node::Polygon(hexagon));

    // Star polygon
    let mut star = nf.create_regular_star_polygon_node();
    star.base.name = "Star".to_string();
    star.transform = AffineTransform::new(50.0, 400.0, 0.0);
    star.size = Size {
        width: 120.0,
        height: 120.0,
    };
    star.point_count = 5;
    star.inner_radius = 0.4;
    star.fill = Paint::Solid(SolidPaint {
        color: Color(255, 215, 0, 255), // Gold
        opacity: 1.0,
    });
    star.stroke_width = 2.0;
    star.stroke = Paint::Solid(SolidPaint {
        color: Color(139, 69, 19, 255), // Brown
        opacity: 1.0,
    });
    all_node_ids.push(star.base.id.clone());
    repo.insert(Node::RegularStarPolygon(star));

    // Path (complex shape)
    let mut path = nf.create_path_node();
    path.base.name = "Complex Path".to_string();
    path.transform = AffineTransform::new(220.0, 400.0, 0.0);
    path.data = "M50,0 L61,35 L98,35 L68,57 L79,91 L50,71 L21,91 L32,57 L2,35 L39,35 Z".to_string();
    path.fill = Paint::Solid(SolidPaint {
        color: Color(255, 20, 147, 255), // Deep pink
        opacity: 1.0,
    });
    path.stroke_width = 2.0;
    path.stroke = Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255),
        opacity: 1.0,
    });
    all_node_ids.push(path.base.id.clone());
    repo.insert(Node::Path(path));

    // Line with gradient stroke
    let mut line = nf.create_line_node();
    line.base.name = "Gradient Line".to_string();
    line.transform = AffineTransform::new(400.0, 400.0, 0.0);
    line.size = Size {
        width: 200.0,
        height: 0.0,
    };
    line.stroke = Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(255, 0, 0, 255),
            },
            GradientStop {
                offset: 0.5,
                color: Color(0, 255, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: Color(0, 0, 255, 255),
            },
        ],
        opacity: 1.0,
    });
    line.stroke_width = 8.0;
    all_node_ids.push(line.base.id.clone());
    repo.insert(Node::Line(line));

    // Regular polygon (octagon)
    let mut octagon = nf.create_regular_polygon_node();
    octagon.base.name = "Octagon".to_string();
    octagon.transform = AffineTransform::new(650.0, 400.0, 0.0);
    octagon.size = Size {
        width: 100.0,
        height: 100.0,
    };
    octagon.point_count = 8;
    octagon.fill = Paint::Solid(SolidPaint {
        color: Color(0, 255, 255, 255), // Cyan
        opacity: 0.8,
    });
    octagon.stroke_width = 3.0;
    octagon.stroke = Paint::Solid(SolidPaint {
        color: Color(0, 0, 0, 255),
        opacity: 1.0,
    });
    all_node_ids.push(octagon.base.id.clone());
    repo.insert(Node::RegularPolygon(octagon));

    // Description text
    let mut description_text = nf.create_text_span_node();
    description_text.base.name = "Description".to_string();
    description_text.transform = AffineTransform::new(50.0, 550.0, 0.0);
    description_text.size = Size {
        width: 700.0,
        height: 40.0,
    };
    description_text.text = "This PDF demonstrates various rendering capabilities including gradients, shapes, text, and effects.".to_string();
    description_text.text_style = TextStyle {
        text_decoration: TextDecoration::None,
        font_family: "Arial".to_string(),
        font_size: 14.0,
        font_weight: FontWeight::new(400),
        italic: false,
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    description_text.text_align = TextAlign::Center;
    description_text.text_align_vertical = TextAlignVertical::Center;
    description_text.fill = Paint::Solid(SolidPaint {
        color: Color(80, 80, 80, 255),
        opacity: 1.0,
    });
    all_node_ids.push(description_text.base.id.clone());
    repo.insert(Node::TextSpan(description_text));

    // Set up the root container
    root_container.children = all_node_ids;
    let root_container_id = root_container.base.id.clone();
    repo.insert(Node::Container(root_container));

    Scene {
        id: "scene".into(),
        name: "SVG Demo".into(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repo,
        background_color: Some(Color(255, 255, 255, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_scene().await;

    // Calculate scene bounds to ensure all content is visible
    // Content extends from (50, 50) to approximately (750, 590)
    let scene_width = 800.0;
    let scene_height = 650.0;

    // Use a larger page size with some padding
    let width = 900.0;
    let height = 750.0;

    let mut renderer = Renderer::new(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, scene_width, scene_height)),
    );
    renderer.load_scene(scene);

    let bounds = SkRect::from_wh(width, height);
    let canvas = svg::Canvas::new(bounds, None);

    renderer.render_to_canvas(&canvas, width, height);

    let data = canvas.end();
    let mut file = File::create("goldens/svg.svg").expect("failed to create svg");
    file.write_all(data.as_bytes())
        .expect("failed to write svg");

    renderer.free();
}
