use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{rect::Rectangle, transform::AffineTransform};
use skia_safe::{svg, Rect as SkRect};
use std::fs::File;
use std::io::Write;

async fn demo_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create a root container
    let mut root_container = nf.create_container_node();
    root_container.size = Size {
        width: 900.0,
        height: 700.0,
    };

    let root_container_id = graph.append_child(Node::Container(root_container), Parent::Root);

    // Title text
    let mut title_text = nf.create_text_span_node();
    title_text.transform = AffineTransform::new(50.0, 50.0, 0.0);
    title_text.width = Some(700.0);
    title_text.text = "Grida Canvas SVG Demo".to_string();
    title_text.text_style = TextStyleRec {
        text_decoration: None,
        font_family: "".to_string(),
        font_size: 36.0,
        font_weight: FontWeight::new(700),
        font_width: None,
        font_kerning: true,
        font_features: None,
        font_variations: None,
        font_optical_sizing: Default::default(),
        font_style_italic: false,
        letter_spacing: Default::default(),
        word_spacing: Default::default(),
        line_height: Default::default(),
        text_transform: TextTransform::None,
    };
    title_text.text_align = TextAlign::Center;
    title_text.text_align_vertical = TextAlignVertical::Center;
    title_text.fills = Paints::new([Paint::from(CGColor(50, 50, 50, 255))]);

    // Subtitle text
    let mut subtitle_text = nf.create_text_span_node();
    subtitle_text.transform = AffineTransform::new(50.0, 120.0, 0.0);
    subtitle_text.width = Some(700.0);
    subtitle_text.text =
        "Rich content demonstration with shapes, gradients, and effects".to_string();
    subtitle_text.text_style = TextStyleRec::from_font("", 18.0);
    subtitle_text.text_align = TextAlign::Center;
    subtitle_text.text_align_vertical = TextAlignVertical::Center;
    subtitle_text.fills = Paints::new([Paint::from(CGColor(100, 100, 100, 255))]);

    // Rectangle with gradient fill
    let mut rect_gradient = nf.create_rectangle_node();
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
        blend_mode: BlendMode::Normal,
        active: true,
    }));
    rect_gradient.stroke_width = 3.0;
    rect_gradient.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
    rect_gradient.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 10.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 100),
    })]);

    // Ellipse with radial gradient
    let mut ellipse_radial = nf.create_ellipse_node();
    ellipse_radial.transform = AffineTransform::new(300.0, 200.0, 0.0);
    ellipse_radial.size = Size {
        width: 180.0,
        height: 150.0,
    };
    ellipse_radial.fills = Paints::new([Paint::RadialGradient(RadialGradientPaint {
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
        blend_mode: BlendMode::Normal,
        active: true,
    })]);
    ellipse_radial.stroke_width = 4.0;
    ellipse_radial.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

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
    hexagon.transform = AffineTransform::new(550.0, 200.0, 0.0);
    hexagon.points = hexagon_points;
    hexagon.fills = Paints::new([Paint::from(CGColor(128, 0, 255, 255))]);
    hexagon.stroke_width = 3.0;
    hexagon.strokes = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);
    hexagon.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 3.0,
        dy: 3.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 150),
    })]);

    // Star polygon
    let mut star = nf.create_regular_star_polygon_node();
    star.transform = AffineTransform::new(50.0, 400.0, 0.0);
    star.size = Size {
        width: 120.0,
        height: 120.0,
    };
    star.point_count = 5;
    star.inner_radius = 0.4;
    star.fills = Paints::new([Paint::from(CGColor(255, 215, 0, 255))]);
    star.stroke_width = 2.0;
    star.strokes = Paints::new([Paint::from(CGColor(139, 69, 19, 255))]);

    // Path (complex shape)
    let mut path = nf.create_path_node();
    path.transform = AffineTransform::new(220.0, 400.0, 0.0);
    path.data = "M50,0 L61,35 L98,35 L68,57 L79,91 L50,71 L21,91 L32,57 L2,35 L39,35 Z".to_string();
    path.fills = Paints::new([Paint::from(CGColor(255, 20, 147, 255))]);
    path.stroke_width = 2.0;
    path.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

    // Line with gradient stroke
    let mut line = nf.create_line_node();
    line.transform = AffineTransform::new(400.0, 400.0, 0.0);
    line.size = Size {
        width: 200.0,
        height: 0.0,
    };
    line.strokes = Paints::new([Paint::LinearGradient(LinearGradientPaint {
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
        blend_mode: BlendMode::default(),
        active: true,
    })]);
    line.stroke_width = 8.0;

    // Regular polygon (octagon)
    let mut octagon = nf.create_regular_polygon_node();
    octagon.transform = AffineTransform::new(650.0, 400.0, 0.0);
    octagon.size = Size {
        width: 100.0,
        height: 100.0,
    };
    octagon.point_count = 8;
    octagon.fills = Paints::new([Paint::from(CGColor(0, 255, 255, 255))]);
    octagon.stroke_width = 3.0;
    octagon.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

    // Description text
    let mut description_text = nf.create_text_span_node();
    description_text.transform = AffineTransform::new(50.0, 550.0, 0.0);
    description_text.width = Some(700.0);
    description_text.text = "This PDF demonstrates various rendering capabilities including gradients, shapes, text, and effects.".to_string();
    description_text.text_style = TextStyleRec::from_font("", 14.0);
    description_text.text_align = TextAlign::Center;
    description_text.text_align_vertical = TextAlignVertical::Center;
    description_text.fills = Paints::new([Paint::from(CGColor(80, 80, 80, 255))]);

    // Add all nodes to root container
    graph.append_children(
        vec![
            Node::TextSpan(title_text),
            Node::TextSpan(subtitle_text),
            Node::Rectangle(rect_gradient),
            Node::Ellipse(ellipse_radial),
            Node::Polygon(hexagon),
            Node::RegularStarPolygon(star),
            Node::SVGPath(path),
            Node::Line(line),
            Node::RegularPolygon(octagon),
            Node::TextSpan(description_text),
        ],
        Parent::NodeId(root_container_id),
    );

    Scene {
        name: "SVG Demo".into(),
        background_color: Some(CGColor(255, 255, 255, 255)),
        graph,
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
            use_embedded_fonts: true,
        },
    );
    renderer.load_scene(scene);

    let bounds = SkRect::from_wh(width, height);
    let canvas = svg::Canvas::new(bounds, None);

    renderer.render_to_canvas(&canvas, width, height);

    let data = canvas.end();
    let mut file = File::create(concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/svg.svg"))
        .expect("failed to create svg");
    file.write_all(data.as_bytes())
        .expect("failed to write svg");

    renderer.free();
}
