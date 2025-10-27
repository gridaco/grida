use cg::cache::geometry::GeometryCache;
use cg::cg::types::*;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

#[test]
fn geometry_cache_builds_recursively() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut group2 = nf.create_group_node();
    group2.transform = Some(AffineTransform::new(2.0, 3.0, 0.0));
    let mut group1 = nf.create_group_node();
    group1.transform = Some(AffineTransform::new(5.0, 5.0, 0.0));
    let mut container = nf.create_container_node();
    container.position = CGPoint::new(10.0, 20.0).into();
    container.rotation = 0.0;
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(4.0, 6.0, 0.0);

    let container_id = graph.append_child(Node::Container(container), Parent::Root);
    let group1_id = graph.append_child(Node::Group(group1), Parent::NodeId(container_id.clone()));
    let group2_id = graph.append_child(Node::Group(group2), Parent::NodeId(group1_id.clone()));
    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(group2_id.clone()));

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph: graph.clone(),
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    assert_eq!(cache.len(), graph.node_count());

    let expected = AffineTransform::new(21.0, 34.0, 0.0);
    assert_eq!(
        cache.get_world_transform(&rect_id).unwrap().matrix,
        expected.matrix
    );
    assert!(cache.has(&container_id));
    assert!(cache.has(&group1_id));
    assert!(cache.has(&group2_id));
}

#[test]
fn container_world_bounds_include_children() {
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

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_world_bounds(&container_id).unwrap();
    assert_eq!(bounds.x, 0.0);
    assert_eq!(bounds.y, 0.0);
    assert_eq!(bounds.width, 100.0);
    assert_eq!(bounds.height, 100.0);
    // child bounds also exist
    assert!(cache.has(&rect_id));
}
