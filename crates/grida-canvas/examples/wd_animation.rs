use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window::{self, application::HostEvent};
use math2::transform::AffineTransform;
use std::time::Instant;

fn create_scene(t: f32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 100.0,
        height: 100.0,
    };
    let x = 300.0 + t.cos() * 150.0;
    let y = 300.0 + t.sin() * 150.0;
    rect.transform = AffineTransform::new(x, y, t);
    let r = ((t.sin() * 0.5 + 0.5) * 255.0) as u8;
    let g = ((t.cos() * 0.5 + 0.5) * 255.0) as u8;
    rect.set_fill(Paint::from(CGColor(r, g, 200, 255)));
    let rect_id = rect.id.clone();
    graph.insert_node(Node::Rectangle(rect));
    graph.insert(Parent::Root, vec![rect_id]);

    Scene {
        name: "Animated".to_string(),
        background_color: Some(CGColor(255, 255, 255, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = create_scene(0.0);
    window::run_demo_window_with(scene, |_, _img_tx, _font_tx, proxy| {
        std::thread::spawn(move || {
            let start = Instant::now();
            loop {
                let t = start.elapsed().as_secs_f32();
                let scene = create_scene(t);
                let _ = proxy.send_event(HostEvent::LoadScene(scene));
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
        });
    })
    .await;
}
