use cg::cache::geometry::GeometryCache;
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use math2::transform::AffineTransform;

#[test]
fn geometry_cache_builds_recursively() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(4.0, 6.0, 0.0);
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut group2 = nf.create_group_node();
    group2.transform = AffineTransform::new(2.0, 3.0, 0.0);
    group2.children.push(rect_id.clone());
    let group2_id = group2.base.id.clone();
    repo.insert(Node::Group(group2));

    let mut group1 = nf.create_group_node();
    group1.transform = AffineTransform::new(5.0, 5.0, 0.0);
    group1.children.push(group2_id.clone());
    let group1_id = group1.base.id.clone();
    repo.insert(Node::Group(group1));

    let mut container = nf.create_container_node();
    container.transform = AffineTransform::new(10.0, 20.0, 0.0);
    container.children.push(group1_id.clone());
    let container_id = container.base.id.clone();
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        transform: AffineTransform::identity(),
        children: vec![container_id.clone()],
        nodes: repo.clone(),
        background_color: None,
    };

    let cache = GeometryCache::from_scene(&scene);
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
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 100.0,
        height: 100.0,
    };
    container.children.push(rect_id.clone());
    let container_id = container.base.id.clone();
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        transform: AffineTransform::identity(),
        children: vec![container_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let cache = GeometryCache::from_scene(&scene);
    let bounds = cache.get_world_bounds(&container_id).unwrap();
    assert_eq!(bounds.x, 0.0);
    assert_eq!(bounds.y, 0.0);
    assert_eq!(bounds.width, 100.0);
    assert_eq!(bounds.height, 100.0);
    // child bounds also exist
    assert!(cache.has(&rect_id));
}
