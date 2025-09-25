use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::resources::{hash_bytes, load_image};
use cg::window;
use math2::{box_fit::BoxFit, transform::AffineTransform};

async fn demo_images() -> (Scene, Vec<u8>) {
    let nf = NodeFactory::new();
    let image_url = "https://grida.co/images/abstract-placeholder.jpg".to_string();
    let bytes = load_image(&image_url).await.unwrap();
    let hash = hash_bytes(&bytes);
    let hash_str = format!("{:016x}", hash);
    let url = format!("res://images/{}", hash_str);

    // Root container
    let mut root = nf.create_container_node();
    root.name = Some("Root".to_string());
    root.size = Size {
        width: 800.0,
        height: 600.0,
    };

    // First example: Rectangle with ImagePaint fill
    let mut rect1 = nf.create_rectangle_node();
    rect1.name = Some("ImageFillRect".to_string());
    rect1.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect1.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect1.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        repeat: ImageRepeat::NoRepeat,
        scale: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect1.strokes = Paints::new([Paint::from(CGColor(255, 0, 0, 255))]);
    rect1.stroke_width = 2.0;

    // Second example: Rectangle with ImagePaint fill and stroke
    let mut rect2 = nf.create_rectangle_node();
    rect2.name = Some("ImageFillAndStrokeRect".to_string());
    rect2.transform = AffineTransform::new(300.0, 50.0, 0.0);
    rect2.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect2.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        repeat: ImageRepeat::NoRepeat,
        scale: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect2.strokes = Paints::new([Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        repeat: ImageRepeat::NoRepeat,
        scale: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    })]);
    rect2.stroke_width = 10.0;

    // Third example: Rectangle with ImagePaint stroke only
    let mut rect3 = nf.create_rectangle_node();
    rect3.name = Some("ImageStrokeRect".to_string());
    rect3.transform = AffineTransform::new(550.0, 50.0, 0.0);
    rect3.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect3.corner_radius = RectangularCornerRadius::circular(40.0);
    rect3.set_fill(Paint::from(CGColor(240, 240, 240, 255)));
    rect3.strokes = Paints::new([Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        repeat: ImageRepeat::NoRepeat,
        scale: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    })]);
    rect3.stroke_width = 10.0;

    // Fourth example: Rectangle with ImagePaint fill using a custom transform
    let mut rect4 = nf.create_rectangle_node();
    rect4.name = Some("ImageTransformFillRect".to_string());
    rect4.transform = AffineTransform::new(50.0, 300.0, 0.0);
    rect4.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect4.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        // Rotate the image 45 degrees with BoxFit::None to showcase the paint transform
        fit: ImagePaintFit::Transform(AffineTransform {
            matrix: [
                [
                    std::f32::consts::FRAC_1_SQRT_2,
                    -std::f32::consts::FRAC_1_SQRT_2,
                    100.0,
                ],
                [
                    std::f32::consts::FRAC_1_SQRT_2,
                    std::f32::consts::FRAC_1_SQRT_2,
                    0.0,
                ],
            ],
        }),
        repeat: ImageRepeat::NoRepeat,
        scale: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));

    // Fifth example: Rectangle demonstrating repeating image tiles
    let mut rect5 = nf.create_rectangle_node();
    rect5.name = Some("ImageRepeatRect".to_string());
    rect5.transform = AffineTransform::new(300.0, 300.0, 0.0);
    rect5.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect5.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        fit: ImagePaintFit::Fit(BoxFit::None),
        repeat: ImageRepeat::Repeat,
        scale: 0.1,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));

    // Sixth example: Rectangle with rotated image (90 degrees)
    let mut rect6 = nf.create_rectangle_node();
    rect6.name = Some("ImageRotatedRect".to_string());
    rect6.transform = AffineTransform::new(550.0, 300.0, 0.0);
    rect6.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect6.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 1, // 90 degrees rotation
        opacity: 1.0,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        repeat: ImageRepeat::NoRepeat,
        scale: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));

    let mut repository = NodeRepository::new();

    let rect1_id = rect1.id.clone();
    let rect2_id = rect2.id.clone();
    let rect3_id = rect3.id.clone();
    let rect4_id = rect4.id.clone();
    let rect5_id = rect5.id.clone();
    let rect6_id = rect6.id.clone();

    repository.insert(Node::Rectangle(rect1));
    repository.insert(Node::Rectangle(rect2));
    repository.insert(Node::Rectangle(rect3));
    repository.insert(Node::Rectangle(rect4));
    repository.insert(Node::Rectangle(rect5));
    repository.insert(Node::Rectangle(rect6));

    root.children = vec![rect1_id, rect2_id, rect3_id, rect4_id, rect5_id, rect6_id];
    let root_id = root.id.clone();
    repository.insert(Node::Container(root));

    let scene = Scene {
        id: "scene".to_string(),
        name: "Images Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(CGColor(250, 250, 250, 255)),
    };

    (scene, bytes)
}

#[tokio::main]
async fn main() {
    let (scene, bytes) = demo_images().await;
    window::run_demo_window_with(scene, move |renderer, _, _, _| {
        renderer.add_image(&bytes);
    })
    .await;
}
