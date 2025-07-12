use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::{box_fit::BoxFit, transform::AffineTransform};

async fn demo_image() -> Scene {
    let nf = NodeFactory::new();
    // let image4k = "../fixtures/images/4k.jpg".to_string();
    // let image4ksize = Size {
    //     width: 4000.0,
    //     height: 6000.0,
    // };
    let image8k = "../fixtures/images/8k.jpg".to_string();
    let image8ksize = Size {
        width: 8070.0,
        height: 5196.0,
    };

    // Root container
    let mut root = nf.create_container_node();
    root.base.name = "Root".to_string();
    root.size = image8ksize.clone();

    // First example: Rectangle with ImagePaint fill
    let mut rect1 = nf.create_rectangle_node();
    rect1.base.name = "ImageFillRect".to_string();
    rect1.transform = AffineTransform::identity();
    rect1.size = image8ksize.clone();
    rect1.set_fill(Paint::Image(ImagePaint {
        hash: image8k.clone(),
        opacity: 1.0,
        transform: AffineTransform::identity(),
        fit: BoxFit::Cover,
    }));
    rect1.stroke = Paint::Solid(SolidPaint {
        color: Color(255, 0, 0, 255),
        opacity: 1.0,
    });
    rect1.stroke_width = 2.0;

    let mut repository = NodeRepository::new();

    let rect1_id = rect1.base.id.clone();

    repository.insert(Node::Rectangle(rect1));

    root.children = vec![rect1_id];
    let root_id = root.base.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Images Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_image().await;
    window::run_demo_window(scene).await;
}
