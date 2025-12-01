use cg::cg::prelude::*;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{rect::Rectangle, transform::AffineTransform};

async fn scene() -> Scene {
    let mut graph = SceneGraph::new();

    // Text with Outside stroke alignment
    let text_outside = TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(50.0, 50.0, 0.0),
        width: None,
        height: None,
        text: "Stroke Outside".to_string(),
        text_style: TextStyleRec::from_font("Geist", 80.0),
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 255))]),
        strokes: Paints::new([Paint::from(CGColor::GREEN)]),
        stroke_width: 2.0,
        stroke_align: StrokeAlign::Outside,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
        effects: LayerEffects::default(),
        layout_child: None,
    };

    // Text with Center stroke alignment
    let text_center = TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(50.0, 150.0, 0.0),
        width: None,
        height: None,
        text: "Stroke Center".to_string(),
        text_style: TextStyleRec::from_font("Geist", 80.0),
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 255))]),
        strokes: Paints::new([Paint::from(CGColor::GREEN)]),
        stroke_width: 2.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
        effects: LayerEffects::default(),
        layout_child: None,
    };

    // Text with Inside stroke alignment
    let text_inside = TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(50.0, 250.0, 0.0),
        width: None,
        height: None,
        text: "Stroke Inside".to_string(),
        text_style: TextStyleRec::from_font("Geist", 80.0),
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 255))]),
        strokes: Paints::new([Paint::from(CGColor::GREEN)]),
        stroke_width: 2.0,
        stroke_align: StrokeAlign::Inside,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
        effects: LayerEffects::default(),
        layout_child: None,
    };

    // Add all text nodes as root children in one operation
    graph.append_children(
        vec![
            Node::TextSpan(text_outside),
            Node::TextSpan(text_center),
            Node::TextSpan(text_inside),
        ],
        Parent::Root,
    );

    Scene {
        name: "type stroke".into(),
        graph,
        background_color: Some(CGColor::from_rgba(255, 255, 255, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = scene().await;

    let width = 800.0;
    let height = 400.0;
    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );
    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, width, height);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/type_stroke.png"),
        data.as_bytes(),
    )
    .unwrap();

    renderer.free();
}
