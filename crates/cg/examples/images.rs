use cg::factory::NodeFactory;
use cg::repository::NodeRepository;
use cg::schema::*;
use grida_cmath::transform::AffineTransform;

mod window;

async fn demo_images() -> Scene {
    let nf = NodeFactory::new();

    // Root container
    let mut root = nf.create_container_node();
    root.base.name = "Root".to_string();
    root.size = Size {
        width: 800.0,
        height: 600.0,
    };

    // First image - will be loaded lazily
    let mut img1 = nf.create_image_node();
    img1.base.name = "Image1".to_string();
    img1.transform = AffineTransform::new(50.0, 50.0, 0.0);
    img1.size = Size {
        width: 200.0,
        height: 200.0,
    };
    img1.stroke = Paint::Solid(SolidPaint {
        color: Color(255, 0, 0, 255),
        opacity: 1.0,
    });
    img1.stroke_width = 1.0;
    img1._ref = "https://grida.co/images/abstract-placeholder.jpg".to_string();

    let mut repository = NodeRepository::new();

    let img1_id = img1.base.id.clone();
    repository.insert(Node::Image(img1));

    root.children = vec![img1_id];
    let root_id = root.base.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Images Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_id],
        nodes: repository,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_images().await;

    let urls: Vec<String> = scene
        .nodes
        .iter()
        .filter_map(|(_, n)| match n {
            Node::Image(img) => Some(img._ref.clone()),
            _ => None,
        })
        .collect();

    window::run_demo_window_with(scene, move |_, tx, proxy| {
        for url in urls {
            let tx_clone = tx.clone();
            let proxy_clone = proxy.clone();
            let url = url.clone(); // Clone the String for the async block
            tokio::spawn(async move {
                let data = window::fetch_image_data(&url).await;
                let _ = tx_clone.send(window::ImageMessage { src: url, data });
                let _ = proxy_clone.send_event(());
            });
        }
    })
    .await;
}
