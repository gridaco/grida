use cg::cg::{types::*, *};
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
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
        height: 800.0,
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
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
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
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect2.strokes = Paints::new([Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
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
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
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
        alignement: Alignment::CENTER,
        // Rotate the image 45 degrees with a smaller translation to keep it visible
        fit: ImagePaintFit::Transform(AffineTransform {
            matrix: [
                [
                    std::f32::consts::FRAC_1_SQRT_2,
                    -std::f32::consts::FRAC_1_SQRT_2,
                    0.0, // Reduced translation to keep image in bounds
                ],
                [
                    std::f32::consts::FRAC_1_SQRT_2,
                    std::f32::consts::FRAC_1_SQRT_2,
                    0.0,
                ],
            ],
        }),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect4.strokes = Paints::new([Paint::from(CGColor(0, 0, 255, 255))]);
    rect4.stroke_width = 2.0;

    // Fifth example: Rectangle demonstrating repeating image tiles
    let mut rect5 = nf.create_rectangle_node();
    rect5.name = Some("ImageTileRect".to_string());
    rect5.transform = AffineTransform::new(300.0, 300.0, 0.0);
    rect5.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect5.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Tile(ImageTile {
            repeat: ImageRepeat::Repeat,
            scale: 0.1,
        }),
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
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));

    // Seventh example: Rectangle with LEFT alignment
    let mut rect7 = nf.create_rectangle_node();
    rect7.name = Some("ImageLeftRect".to_string());
    rect7.transform = AffineTransform::new(50.0, 550.0, 0.0);
    rect7.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect7.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        alignement: Alignment::CENTER_LEFT,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect7.strokes = Paints::new([Paint::from(CGColor(0, 255, 0, 255))]);
    rect7.stroke_width = 2.0;

    // Eighth example: Rectangle with CENTER alignment
    let mut rect8 = nf.create_rectangle_node();
    rect8.name = Some("ImageCenterRect".to_string());
    rect8.transform = AffineTransform::new(300.0, 550.0, 0.0);
    rect8.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect8.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect8.strokes = Paints::new([Paint::from(CGColor(255, 165, 0, 255))]);
    rect8.stroke_width = 2.0;

    // Ninth example: Rectangle with RIGHT alignment
    let mut rect9 = nf.create_rectangle_node();
    rect9.name = Some("ImageRightRect".to_string());
    rect9.transform = AffineTransform::new(550.0, 550.0, 0.0);
    rect9.size = Size {
        width: 200.0,
        height: 200.0,
    };
    rect9.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
        quarter_turns: 0,
        opacity: 1.0,
        alignement: Alignment::CENTER_RIGHT,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        blend_mode: BlendMode::Normal,
        active: true,
        filters: ImageFilters::default(),
    }));
    rect9.strokes = Paints::new([Paint::from(CGColor(128, 0, 128, 255))]);
    rect9.stroke_width = 2.0;

    let mut graph = SceneGraph::new();

    let rect1_id = rect1.id.clone();
    let rect2_id = rect2.id.clone();
    let rect3_id = rect3.id.clone();
    let rect4_id = rect4.id.clone();
    let rect5_id = rect5.id.clone();
    let rect6_id = rect6.id.clone();
    let rect7_id = rect7.id.clone();
    let rect8_id = rect8.id.clone();
    let rect9_id = rect9.id.clone();

    graph.insert_node(Node::Rectangle(rect1));
    graph.insert_node(Node::Rectangle(rect2));
    graph.insert_node(Node::Rectangle(rect3));
    graph.insert_node(Node::Rectangle(rect4));
    graph.insert_node(Node::Rectangle(rect5));
    graph.insert_node(Node::Rectangle(rect6));
    graph.insert_node(Node::Rectangle(rect7));
    graph.insert_node(Node::Rectangle(rect8));
    graph.insert_node(Node::Rectangle(rect9));
    let root_id = root.id.clone();

    graph.insert(
        Parent::NodeId(root_id.clone()),
        vec![
            rect1_id, rect2_id, rect3_id, rect4_id, rect5_id, rect6_id, rect7_id, rect8_id,
            rect9_id,
        ],
    );
    graph.insert_node(Node::Container(root));

    graph.insert(Parent::Root, vec![root_id.clone()]);

    let scene = Scene {
        name: "Images Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
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
