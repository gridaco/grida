use cg::cg::{types::*, *};
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
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
    root.layout_dimensions.width = Some(image8ksize.width);
    root.layout_dimensions.height = Some(image8ksize.height);

    // First example: Rectangle with ImagePaint fill
    let mut rect1 = nf.create_rectangle_node();
    rect1.transform = AffineTransform::identity();
    rect1.size = image8ksize.clone();
    let url = format!("res://images/{}", hash_str.clone());
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
    rect1.stroke_style.stroke_width = 2.0;

    let mut graph = SceneGraph::new();

    let root_id = graph.append_child(Node::Container(root), Parent::Root);
    graph.append_child(Node::Rectangle(rect1), Parent::NodeId(root_id));

    let scene = Scene {
        name: "Images Demo".to_string(),
        graph,
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
