use cg::cache::scene::SceneCache;
use cg::hittest::HitTester;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use math2::{rect::Rectangle, transform::AffineTransform};
use std::sync::{Arc, Mutex};

#[test]
fn hit_first_returns_topmost() {
    let nf = NodeFactory::new();

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 40.0,
        height: 40.0,
    };
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.size = Size {
        width: 20.0,
        height: 20.0,
    };

    let mut graph = SceneGraph::new();
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

    let tester = HitTester::new(&cache);

    assert_eq!(
        tester.hit_first_fast([15.0, 15.0]),
        Some(rect_id)
    );
    assert_eq!(
        tester.hit_first_fast([5.0, 5.0]),
        Some(container_id)
    );
    assert!(tester.hit_first_fast([100.0, 100.0]).is_none());
}

#[test]
fn path_hit_testing_uses_contains() {
    let nf = NodeFactory::new();

    let mut graph = SceneGraph::new();
    let mut path_node = nf.create_path_node();
    path_node.data = "M0 0 L10 0 L10 10 Z".into();
    let path_id = graph.append_child(Node::SVGPath(path_node.clone()), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let mut cache = SceneCache::new();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);
    cache
        .path
        .borrow_mut()
        .get_or_create(&path_id, &path_node.data);

    let tester = HitTester::new(&cache);

    assert!(tester.hit_first([1.0, 9.0]).is_none());
    assert_eq!(
        tester.hit_first([9.0, 1.0]),
        Some(path_id)
    );
}

#[test]
fn intersects_returns_all_nodes_in_rect() {
    let nf = NodeFactory::new();

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 100.0,
        height: 100.0,
    };
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect.size = Size {
        width: 100.0,
        height: 100.0,
    };

    let mut graph = SceneGraph::new();
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

    let tester = HitTester::new(&cache);

    let ids = tester.intersects(&Rectangle {
        x: 140.0,
        y: 40.0,
        width: 20.0,
        height: 20.0,
    });
    assert_eq!(ids.len(), 1);
    assert_eq!(ids[0], rect_id);

    let ids = tester.intersects(&Rectangle {
        x: 50.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    });
    assert_eq!(ids.len(), 2);
    assert_eq!(ids[0], rect_id);
    assert_eq!(ids[1], container_id);
}
