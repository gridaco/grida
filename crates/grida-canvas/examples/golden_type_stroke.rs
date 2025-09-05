use cg::cg::types::*;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{rect::Rectangle, transform::AffineTransform};
use uuid::Uuid;

async fn scene() -> Scene {
    let mut repo = NodeRepository::new();

    let text = TextSpanNodeRec {
        id: Uuid::new_v4().to_string(),
        name: None,
        active: true,
        transform: AffineTransform::new(50.0, 150.0, 0.0),
        width: None,
        text: "Stroke".to_string(),
        text_style: TextStyleRec::from_font("Geist", 120.0),
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fill: Paint::Solid(SolidPaint {
            color: CGColor(0, 0, 0, 255),
            opacity: 1.0,
        }),
        stroke: Some(Paint::Solid(SolidPaint {
            color: CGColor::BLUE,
            opacity: 1.0,
        })),
        stroke_width: Some(4.0),
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        effects: LayerEffects::new_empty(),
    };
    let text_id = text.id.clone();
    repo.insert(Node::TextSpan(text));

    Scene {
        id: "scene".into(),
        name: "type stroke".into(),
        children: vec![text_id],
        nodes: repo,
        background_color: Some(CGColor(255, 255, 255, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = scene().await;

    let width = 600.0;
    let height = 300.0;
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
    std::fs::write("goldens/type_stroke.png", data.as_bytes()).unwrap();

    renderer.free();
}
