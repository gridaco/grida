use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::resources::{hash_bytes, load_image};
use cg::window;
use math2::{box_fit::BoxFit, transform::AffineTransform};

async fn demo_image() -> (Scene, Vec<u8>) {
    let nf = NodeFactory::new();
    // let image4k = "../../fixtures/images/4k.jpg".to_string();
    // let image4ksize = Size {
    //     width: 4000.0,
    //     height: 6000.0,
    // };
    let image8k = "../../fixtures/images/8k.jpg".to_string();
    let bytes = load_image(&image8k).await.unwrap();
    let hash = hash_bytes(&bytes);
    let hash_str = format!("{:016x}", hash);
    let image8ksize = Size {
        width: 8070.0,
        height: 5196.0,
    };

    // Root container
    let mut root = nf.create_container_node();
    root.name = Some("Root".to_string());
    root.size = image8ksize.clone();

    // First example: Rectangle with ImagePaint fill
    let mut rect1 = nf.create_rectangle_node();
    rect1.name = Some("ImageFillRect".to_string());
    rect1.transform = AffineTransform::identity();
    rect1.size = image8ksize.clone();
    let url = format!("res://images/{}", hash_str.clone());
    rect1.set_fill(Paint::Image(ImagePaint {
        image: ResourceRef::RID(url.clone()),
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

    let mut repository = NodeRepository::new();

    let rect1_id = rect1.id.clone();

    repository.insert(Node::Rectangle(rect1));

    root.children = vec![rect1_id];
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
    let (scene, bytes) = demo_image().await;
    window::run_demo_window_with(scene, move |renderer, _, _, _| {
        renderer.add_image(&bytes);
    })
    .await;
}
