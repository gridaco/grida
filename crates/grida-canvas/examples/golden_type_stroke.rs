use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{rect::Rectangle, transform::AffineTransform};

async fn scene() -> Scene {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut text = nf.create_text_span_node();
    text.text = "Stroke".to_string();
    text.text_style = TextStyleRec::from_font("Geist", 120.0);
    text.transform = AffineTransform::new(50.0, 150.0, 0.0);
    text.fill = Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 0, 255),
        opacity: 1.0,
    });
    text.stroke = Some(Paint::Solid(SolidPaint {
        color: CGColor(0, 128, 255, 255),
        opacity: 1.0,
    }));
    text.stroke_width = Some(8.0);
    text.text_align = TextAlign::Left;
    text.text_align_vertical = TextAlignVertical::Top;
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
