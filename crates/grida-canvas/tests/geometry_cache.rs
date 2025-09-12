use cg::cache::geometry::GeometryCache;
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

#[test]
fn geometry_cache_builds_recursively() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(4.0, 6.0, 0.0);
    let rect_id = rect.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut group2 = nf.create_group_node();
    group2.transform = Some(AffineTransform::new(2.0, 3.0, 0.0));
    group2.children.push(rect_id.clone());
    let group2_id = group2.id.clone();
    repo.insert(Node::Group(group2));

    let mut group1 = nf.create_group_node();
    group1.transform = Some(AffineTransform::new(5.0, 5.0, 0.0));
    group1.children.push(group2_id.clone());
    let group1_id = group1.id.clone();
    repo.insert(Node::Group(group1));

    let mut container = nf.create_container_node();
    container.transform = AffineTransform::new(10.0, 20.0, 0.0);
    container.children.push(group1_id.clone());
    let container_id = container.id.clone();
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![container_id.clone()],
        nodes: repo.clone(),
        background_color: None,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    assert_eq!(cache.len(), repo.len());

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
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect.size = Size {
        width: 100.0,
        height: 100.0,
    };
    let rect_id = rect.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 100.0,
        height: 100.0,
    };
    container.children.push(rect_id.clone());
    let container_id = container.id.clone();
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![container_id.clone()],
        nodes: repo,
        background_color: None,
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
