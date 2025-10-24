use cg::cache::scene::SceneCache;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

#[test]
fn layers_in_rect_include_partially_visible_nested() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.layout_dimensions.width = Some(100.0);
    container.layout_dimensions.height = Some(100.0);
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect.size = Size {
        width: 100.0,
        height: 100.0,
    };

    let container_id = graph.append_child(Node::Container(container), Parent::Root);
    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id.clone()));

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let mut cache = SceneCache::new();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    // Query area partially overlapping the rectangle only

    let layer_indices = cache.intersects(Rectangle {
        x: 140.0,
        y: 40.0,
        width: 20.0,
        height: 20.0,
    });
    assert_eq!(layer_indices.len(), 1);
    let layer = &cache.layers.layers[layer_indices[0]];
    assert_eq!(layer.id, rect_id);

    let layer_indices = cache.intersects(Rectangle {
        x: 50.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    });
    assert_eq!(layer_indices.len(), 2);
    let layer0 = &cache.layers.layers[layer_indices[0]];
    let layer1 = &cache.layers.layers[layer_indices[1]];
    assert_eq!(layer0.id, rect_id);
    assert_eq!(layer1.id, container_id);
}
