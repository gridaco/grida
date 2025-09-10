use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_nested() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();
    let n = 5; // number of nesting levels

    // Create innermost rectangle
    let mut rect = nf.create_rectangle_node();
    rect.name = Some("Inner Rect".to_string());
    rect.size = Size {
        width: 100.0,
        height: 100.0,
    };
    rect.set_fill(Paint::from(CGColor(255, 0, 0, 255)));
    let mut current_id = rect.id.clone();
    repository.insert(Node::Rectangle(rect));

    // Create nested structure
    for i in 0..n {
        if i % 2 == 0 {
            // Create group with rotation transform
            let mut group = nf.create_group_node();
            group.name = Some(format!("Group {}", i));
            group.transform = Some(AffineTransform::new(
                50.0 * (i as f32 + 1.0), // x offset
                50.0 * (i as f32 + 1.0), // y offset
                0.0,
            ));

            // Add a rectangle to the group
            let mut group_rect = nf.create_rectangle_node();
            group_rect.name = Some(format!("Group {} Rect", i));
            group_rect.size = Size {
                width: 100.0,
                height: 100.0,
            };
            group_rect.set_fill(Paint::from(CGColor(0, 255, 0, 255)));
            let group_rect_id = group_rect.id.clone();
            repository.insert(Node::Rectangle(group_rect));

            group.children = vec![current_id, group_rect_id];
            current_id = group.id.clone();
            repository.insert(Node::Group(group));
        } else {
            // Create container with scale transform
            let mut container = nf.create_container_node();
            container.name = Some(format!("Container {}", i));
            container.transform = AffineTransform::new(
                -30.0 * (i as f32 + 1.0), // x offset
                -30.0 * (i as f32 + 1.0), // y offset
                0.0,
            );

            // Add a rectangle to the container
            let mut container_rect = nf.create_rectangle_node();
            container_rect.name = Some(format!("Container {} Rect", i));
            container_rect.size = Size {
                width: 100.0,
                height: 100.0,
            };
            container_rect.set_fill(Paint::from(CGColor(0, 0, 255, 255)));
            let container_rect_id = container_rect.id.clone();
            repository.insert(Node::Rectangle(container_rect));

            container.children = vec![current_id, container_rect_id];
            current_id = container.id.clone();
            repository.insert(Node::Container(container));
        }
    }

    Scene {
        id: "nested".to_string(),
        name: "Nested Demo".to_string(),
        children: vec![current_id],
        nodes: repository,
        background_color: Some(CGColor(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_nested().await;

    window::run_demo_window(scene).await;
}
