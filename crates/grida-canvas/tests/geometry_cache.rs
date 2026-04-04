use cg::cache::geometry::GeometryCache;
use cg::cg::prelude::*;
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
    container.layout_dimensions.layout_target_width = Some(100.0);
    container.layout_dimensions.layout_target_height = Some(100.0);
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

/// Verify that Container.rotation (stored in degrees) is correctly
/// converted to radians when building the scene graph transform.
///
/// Before the fix, `AffineTransform::new(x, y, rotation)` received the
/// degree value directly, but `set_rotation` interprets its argument as
/// radians. A 90-degree container rotation was treated as 90-radian
/// rotation, producing a garbled matrix.
#[test]
fn rotated_container_world_transform_uses_degrees_correctly() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.position = CGPoint::new(100.0, 50.0).into();
    container.rotation = 90.0; // degrees
    container.layout_dimensions.layout_target_width = Some(200.0);
    container.layout_dimensions.layout_target_height = Some(150.0);

    // Place a rectangle at (10, 20) inside the container.
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 20.0, 0.0);
    rect.size = Size {
        width: 30.0,
        height: 40.0,
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

    // Container at (100, 50) rotated 90° around its origin.
    // AffineTransform::new(100, 50, π/2) should produce:
    //   cos(π/2) ≈ 0, sin(π/2) ≈ 1
    //   matrix: [[0, -1, 100], [1, 0, 50]]
    let ct = cache.get_world_transform(&container_id).unwrap();
    let cos_90 = ct.matrix[0][0];
    let sin_90 = ct.matrix[1][0];

    // cos(90°) ≈ 0, sin(90°) ≈ 1
    assert!(cos_90.abs() < 0.01, "cos(90°) should be ≈0, got {}", cos_90);
    assert!(
        (sin_90 - 1.0).abs() < 0.01,
        "sin(90°) should be ≈1, got {}",
        sin_90
    );

    // Child at (10, 20) in container space, rotated by container's 90°.
    // World transform = container_transform * child_transform
    // = [[0,-1,100],[1,0,50]] * [[1,0,10],[0,1,20]]
    // = [[0,-1, 100 + 0*10 + (-1)*20], [1,0, 50 + 1*10 + 0*20]]
    // = [[0,-1, 80], [1,0, 60]]
    let rt = cache.get_world_transform(&rect_id).unwrap();
    assert!(
        rt.matrix[0][0].abs() < 0.01,
        "child cos should be ≈0, got {}",
        rt.matrix[0][0]
    );
    assert!(
        (rt.matrix[1][0] - 1.0).abs() < 0.01,
        "child sin should be ≈1, got {}",
        rt.matrix[1][0]
    );
    assert!(
        (rt.matrix[0][2] - 80.0).abs() < 0.1,
        "child tx should be ≈80, got {}",
        rt.matrix[0][2]
    );
    assert!(
        (rt.matrix[1][2] - 60.0).abs() < 0.1,
        "child ty should be ≈60, got {}",
        rt.matrix[1][2]
    );
}
