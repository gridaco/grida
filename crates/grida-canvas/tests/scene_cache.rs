use cg::cache::scene::SceneCache;
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use cg::painter::layer::Layer;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

#[test]
fn layers_in_rect_include_partially_visible_nested() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect.size = Size {
        width: 100.0,
        height: 100.0,
    };
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 100.0,
        height: 100.0,
    };
    let container_id = container.base.id.clone();
    container.children.push(rect_id.clone());
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        transform: AffineTransform::identity(),
        children: vec![container_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let mut cache = SceneCache::new();
    cache.update_geometry(&scene);
    cache.update_layers(&scene);

    // Query area partially overlapping the rectangle only

    let layers = cache.layers_in_rect(Rectangle {
        x: 140.0,
        y: 40.0,
        width: 20.0,
        height: 20.0,
    });
    assert_eq!(layers.len(), 1);
    assert_eq!(layers[0].id(), &rect_id);

    let layers = cache.layers_in_rect(Rectangle {
        x: 50.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    });
    assert_eq!(layers.len(), 2);
    assert_eq!(layers[0].id(), &rect_id);
    assert_eq!(layers[1].id(), &container_id);
}
