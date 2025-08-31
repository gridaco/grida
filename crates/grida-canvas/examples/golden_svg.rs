use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{rect::Rectangle, transform::AffineTransform};
use skia_safe::{svg, Rect as SkRect};
use std::fs::File;
use std::io::Write;

async fn demo_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    // Create a root container
    let mut root_container = nf.create_container_node();
    root_container.name = Some("Root Container".to_string());
    root_container.size = Size {
        width: 900.0,
        height: 700.0,
    };

    let mut all_node_ids = Vec::new();

    // Title text
    let mut title_text = nf.create_text_span_node();
    title_text.name = Some("Title".to_string());
    title_text.transform = AffineTransform::new(50.0, 50.0, 0.0);
    title_text.width = Some(700.0);
    title_text.text = "Grida Canvas SVG Demo".to_string();
    title_text.text_style = TextStyleRec {
        text_decoration: None,
        font_family: "".to_string(),
        font_size: 36.0,
        font_weight: FontWeight::new(700),
        font_features: None,
        font_variations: None,
        font_optical_sizing: Default::default(),
        italic: false,
        letter_spacing: None,
        line_height: None,
        text_transform: TextTransform::None,
    };
    title_text.text_align = TextAlign::Center;
    title_text.text_align_vertical = TextAlignVertical::Center;
    title_text.fill = Paint::Solid(SolidPaint {
        color: CGColor(50, 50, 50, 255),
        opacity: 1.0,
    });
    all_node_ids.push(title_text.id.clone());
    repo.insert(Node::TextSpan(title_text));

    // Subtitle text
    let mut subtitle_text = nf.create_text_span_node();
    subtitle_text.name = Some("Subtitle".to_string());
    subtitle_text.transform = AffineTransform::new(50.0, 120.0, 0.0);
    subtitle_text.width = Some(700.0);
    subtitle_text.text =
        "Rich content demonstration with shapes, gradients, and effects".to_string();
    subtitle_text.text_style = TextStyleRec::from_font("", 18.0);
    subtitle_text.text_align = TextAlign::Center;
    subtitle_text.text_align_vertical = TextAlignVertical::Center;
    subtitle_text.fill = Paint::Solid(SolidPaint {
        color: CGColor(100, 100, 100, 255),
        opacity: 1.0,
    });
    all_node_ids.push(subtitle_text.id.clone());
    repo.insert(Node::TextSpan(subtitle_text));

    // Rectangle with gradient fill
    let mut rect_gradient = nf.create_rectangle_node();
    rect_gradient.name = Some("Gradient Rectangle".to_string());
    rect_gradient.transform = AffineTransform::new(50.0, 200.0, 0.0);
    rect_gradient.size = Size {
        width: 200.0,
        height: 150.0,
    };
    rect_gradient.corner_radius = RectangularCornerRadius::circular(20.0);
    rect_gradient.set_fill(Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::from_rotatation(45.0),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 100, 100, 255),
            },
            GradientStop {
                offset: 0.5,
                color: CGColor(100, 100, 255, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(100, 255, 100, 255),
            },
        ],
        opacity: 1.0,
    }));
    rect_gradient.stroke_width = 3.0;
    rect_gradient.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 0, 255),
        opacity: 1.0,
    })];
    rect_gradient.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 10.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 100),
    })]);
    all_node_ids.push(rect_gradient.id.clone());
    repo.insert(Node::Rectangle(rect_gradient));

    // Ellipse with radial gradient
    let mut ellipse_radial = nf.create_ellipse_node();
    ellipse_radial.name = Some("Radial Ellipse".to_string());
    ellipse_radial.transform = AffineTransform::new(300.0, 200.0, 0.0);
    ellipse_radial.size = Size {
        width: 180.0,
        height: 150.0,
    };
    ellipse_radial.fills = vec![Paint::RadialGradient(RadialGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 255, 0, 255),
            },
            GradientStop {
                offset: 0.7,
                color: CGColor(255, 128, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(255, 0, 0, 255),
            },
        ],
        opacity: 1.0,
    })];
    ellipse_radial.stroke_width = 4.0;
    ellipse_radial.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 0, 255),
        opacity: 1.0,
    })];
    all_node_ids.push(ellipse_radial.id.clone());
    repo.insert(Node::Ellipse(ellipse_radial));

    // Polygon (hexagon)
    let hexagon_points = (0..6)
        .map(|i| {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 6.0 - std::f32::consts::FRAC_PI_2;
            let radius = 60.0;
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            CGPoint { x, y }
        })
        .collect::<Vec<_>>();

    let mut hexagon = nf.create_polygon_node();
    hexagon.name = Some("Hexagon".to_string());
    hexagon.transform = AffineTransform::new(550.0, 200.0, 0.0);
    hexagon.points = hexagon_points;
    hexagon.fills = vec![Paint::Solid(SolidPaint {
        color: CGColor(128, 0, 255, 255),
        opacity: 1.0,
    })];
    hexagon.stroke_width = 3.0;
    hexagon.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(255, 255, 255, 255),
        opacity: 1.0,
    })];
    hexagon.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 3.0,
        dy: 3.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 150),
    })]);
    all_node_ids.push(hexagon.id.clone());
    repo.insert(Node::Polygon(hexagon));

    // Star polygon
    let mut star = nf.create_regular_star_polygon_node();
    star.name = Some("Star".to_string());
    star.transform = AffineTransform::new(50.0, 400.0, 0.0);
    star.size = Size {
        width: 120.0,
        height: 120.0,
    };
    star.point_count = 5;
    star.inner_radius = 0.4;
    star.fills = vec![Paint::Solid(SolidPaint {
        color: CGColor(255, 215, 0, 255), // Gold
        opacity: 1.0,
    })];
    star.stroke_width = 2.0;
    star.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(139, 69, 19, 255), // Brown
        opacity: 1.0,
    })];
    all_node_ids.push(star.id.clone());
    repo.insert(Node::RegularStarPolygon(star));

    // Path (complex shape)
    let mut path = nf.create_path_node();
    path.name = Some("Complex Path".to_string());
    path.transform = AffineTransform::new(220.0, 400.0, 0.0);
    path.data = "M50,0 L61,35 L98,35 L68,57 L79,91 L50,71 L21,91 L32,57 L2,35 L39,35 Z".to_string();
    path.fill = Paint::Solid(SolidPaint {
        color: CGColor(255, 20, 147, 255), // Deep pink
        opacity: 1.0,
    });
    path.stroke_width = 2.0;
    path.stroke = Some(Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 0, 255),
        opacity: 1.0,
    }));
    all_node_ids.push(path.id.clone());
    repo.insert(Node::SVGPath(path));

    // Line with gradient stroke
    let mut line = nf.create_line_node();
    line.name = Some("Gradient Line".to_string());
    line.transform = AffineTransform::new(400.0, 400.0, 0.0);
    line.size = Size {
        width: 200.0,
        height: 0.0,
    };
    line.strokes = vec![Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 0, 0, 255),
            },
            GradientStop {
                offset: 0.5,
                color: CGColor(0, 255, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(0, 0, 255, 255),
            },
        ],
        opacity: 1.0,
    })];
    line.stroke_width = 8.0;
    all_node_ids.push(line.id.clone());
    repo.insert(Node::Line(line));

    // Regular polygon (octagon)
    let mut octagon = nf.create_regular_polygon_node();
    octagon.name = Some("Octagon".to_string());
    octagon.transform = AffineTransform::new(650.0, 400.0, 0.0);
    octagon.size = Size {
        width: 100.0,
        height: 100.0,
    };
    octagon.point_count = 8;
    octagon.fills = vec![Paint::Solid(SolidPaint {
        color: CGColor(0, 255, 255, 255), // Cyan
        opacity: 0.8,
    })];
    octagon.stroke_width = 3.0;
    octagon.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 0, 255),
        opacity: 1.0,
    })];
    all_node_ids.push(octagon.id.clone());
    repo.insert(Node::RegularPolygon(octagon));

    // Description text
    let mut description_text = nf.create_text_span_node();
    description_text.name = Some("Description".to_string());
    description_text.transform = AffineTransform::new(50.0, 550.0, 0.0);
    description_text.width = Some(700.0);
    description_text.text = "This PDF demonstrates various rendering capabilities including gradients, shapes, text, and effects.".to_string();
    description_text.text_style = TextStyleRec::from_font("", 14.0);
    description_text.text_align = TextAlign::Center;
    description_text.text_align_vertical = TextAlignVertical::Center;
    description_text.fill = Paint::Solid(SolidPaint {
        color: CGColor(80, 80, 80, 255),
        opacity: 1.0,
    });
    all_node_ids.push(description_text.id.clone());
    repo.insert(Node::TextSpan(description_text));

    // Set up the root container
    root_container.children = all_node_ids;
    let root_container_id = root_container.id.clone();
    repo.insert(Node::Container(root_container));

    Scene {
        id: "scene".into(),
        name: "SVG Demo".into(),
        children: vec![root_container_id],
        nodes: repo,
        background_color: Some(CGColor(255, 255, 255, 255)),
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

    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, scene_width, scene_height)),
        RendererOptions {
            font_fallback: true,
        },
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
