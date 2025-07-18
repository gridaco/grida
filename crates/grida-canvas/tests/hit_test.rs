use cg::cache::scene::SceneCache;
use cg::hittest::HitTester;
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use math2::{rect::Rectangle, transform::AffineTransform};

#[test]
fn hit_first_returns_topmost() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.size = Size {
        width: 20.0,
        height: 20.0,
    };
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 40.0,
        height: 40.0,
    };
    let container_id = container.base.id.clone();
    container.children.push(rect_id.clone());
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![container_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let mut cache = SceneCache::new();
    cache.update_geometry(&scene);
    cache.update_layers(&scene);

    let tester = HitTester::new(&cache);

    assert_eq!(
        tester.hit_first_fast([15.0, 15.0]).as_deref(),
        Some(rect_id.as_str())
    );
    assert_eq!(
        tester.hit_first_fast([5.0, 5.0]).as_deref(),
        Some(container_id.as_str())
    );
    assert!(tester.hit_first_fast([100.0, 100.0]).is_none());
}

#[test]
fn path_hit_testing_uses_contains() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut path_node = nf.create_path_node();
    path_node.data = "M0 0 L10 0 L10 10 Z".into();
    let path_id = path_node.base.id.clone();
    repo.insert(Node::SVGPath(path_node.clone()));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![path_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let mut cache = SceneCache::new();
    cache.update_geometry(&scene);
    cache.update_layers(&scene);
    cache
        .path
        .borrow_mut()
        .get_or_create(&path_id, &path_node.data);

    let tester = HitTester::new(&cache);

    assert!(tester.hit_first([1.0, 9.0]).is_none());
    assert_eq!(
        tester.hit_first([9.0, 1.0]).as_deref(),
        Some(path_id.as_str())
    );
}

#[test]
fn intersects_returns_all_nodes_in_rect() {
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
        children: vec![container_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let mut cache = SceneCache::new();
    cache.update_geometry(&scene);
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
