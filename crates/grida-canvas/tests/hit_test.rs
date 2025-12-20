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
    container.layout_dimensions.layout_target_width = Some(40.0);
    container.layout_dimensions.layout_target_height = Some(40.0);
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

    assert_eq!(tester.hit_first_fast([15.0, 15.0]), Some(rect_id));
    assert_eq!(tester.hit_first_fast([5.0, 5.0]), Some(container_id));
    assert!(tester.hit_first_fast([100.0, 100.0]).is_none());
}

#[test]
fn path_hit_testing_uses_contains() {
    let nf = NodeFactory::new();

    let mut graph = SceneGraph::new();
    let mut path_node = nf.create_path_node();
    path_node.data = "M0 0 L10 0 L10 10 Z".into();
    let path_id = graph.append_child(Node::Path(path_node.clone()), Parent::Root);

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
    assert_eq!(tester.hit_first([9.0, 1.0]), Some(path_id));
}

#[test]
fn intersects_returns_all_nodes_in_rect() {
    let nf = NodeFactory::new();

    let mut container = nf.create_container_node();
    container.layout_dimensions.layout_target_width = Some(100.0);
    container.layout_dimensions.layout_target_height = Some(100.0);
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

#[test]
fn culled_items_not_hit_tested() {
    let nf = NodeFactory::new();

    // Create a container with clip=true
    let mut container = nf.create_container_node();
    container.layout_dimensions.layout_target_width = Some(100.0);
    container.layout_dimensions.layout_target_height = Some(100.0);
    container.clip = true; // Enable clipping

    // Create a child rectangle that extends outside the container bounds
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(50.0, 50.0, 0.0); // Position at (50, 50)
    rect.size = Size {
        width: 100.0,  // Extends to x=150 (outside container width of 100)
        height: 100.0, // Extends to y=150 (outside container height of 100)
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

    // Use with_graph to enable culling checks
    let tester = HitTester::with_graph(&cache, &scene.graph);

    // Verify container bounds
    let container_bounds = cache.geometry.get_world_bounds(&container_id).unwrap();
    assert_eq!(container_bounds.x, 0.0);
    assert_eq!(container_bounds.y, 0.0);
    assert_eq!(container_bounds.width, 100.0);
    assert_eq!(container_bounds.height, 100.0);

    // Verify rectangle bounds extend beyond container
    let rect_bounds = cache.geometry.get_world_bounds(&rect_id).unwrap();
    // Rectangle is at (50, 50) with size 100x100, so bounds are (50, 50) to (150, 150)
    assert!(rect_bounds.x + rect_bounds.width > container_bounds.x + container_bounds.width);

    // Point inside container bounds and inside the visible part of rectangle
    // This should hit the rectangle (the part that's not culled)
    let hit = tester.hit_first_fast([60.0, 60.0]);
    assert_eq!(hit, Some(rect_id.clone()));

    // Point on the culled part of the rectangle (outside container bounds)
    // The rectangle extends to (150, 150), but container only goes to (100, 100)
    // Point at (120, 120) is outside container bounds, so rectangle should be culled
    // This should NOT hit the rectangle
    let hit = tester.hit_first_fast([120.0, 120.0]);
    // After fix: should return container_id or None, not rect_id
    assert_ne!(
        hit,
        Some(rect_id),
        "Point at (120, 120) should not hit culled rectangle"
    );

    // Point outside container bounds entirely - should not hit anything
    assert!(tester.hit_first_fast([150.0, 150.0]).is_none());

    // Point just outside container bounds (100.1, 100.1) - should not hit rectangle
    // because rectangle extends beyond but is culled at container edge
    let hit = tester.hit_first_fast([100.1, 100.1]);
    // Rectangle bounds extend to 150, but it's culled at container edge (100)
    assert_ne!(
        hit,
        Some(rect_id),
        "Point just outside container should not hit culled rectangle"
    );
}
