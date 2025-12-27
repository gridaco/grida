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

#[test]
fn hits_returns_siblings_in_browser_order() {
    let nf = NodeFactory::new();

    // Create 3 overlapping rectangles as siblings (same depth)
    // DOM order: back, middle, front (created in this order)
    // Visual order: front is on top (created last), middle, back (created first)
    // Browser's elementsFromPoint returns: [front, middle, back] (topmost first)

    let mut back = nf.create_rectangle_node();
    back.transform = AffineTransform::new(0.0, 0.0, 0.0);
    back.size = Size {
        width: 100.0,
        height: 100.0,
    };

    let mut middle = nf.create_rectangle_node();
    middle.transform = AffineTransform::new(10.0, 10.0, 0.0);
    middle.size = Size {
        width: 80.0,
        height: 80.0,
    };

    let mut front = nf.create_rectangle_node();
    front.transform = AffineTransform::new(20.0, 20.0, 0.0);
    front.size = Size {
        width: 60.0,
        height: 60.0,
    };

    let mut graph = SceneGraph::new();
    // Append in DOM order: back first (bottom), then middle, then front (top)
    let back_id = graph.append_child(Node::Rectangle(back), Parent::Root);
    let middle_id = graph.append_child(Node::Rectangle(middle), Parent::Root);
    let front_id = graph.append_child(Node::Rectangle(front), Parent::Root);

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

    // Test point at (50, 50) - inside all three overlapping rectangles
    // back: (0,0) to (100,100) - contains (50,50)
    // middle: (10,10) to (90,90) - contains (50,50)
    // front: (20,20) to (80,80) - contains (50,50)
    let hits = tester.hits([50.0, 50.0]);

    // Should return in reverse paint order: topmost first
    // Since front was created last (DOM order), it has highest z-index and appears on top
    // Browser's elementsFromPoint returns: [front, middle, back] (topmost first)
    assert_eq!(
        hits.len(),
        3,
        "All three overlapping rectangles should be hit"
    );
    assert_eq!(hits[0], front_id, "First element should be front (topmost)");
    assert_eq!(hits[1], middle_id, "Second element should be middle");
    assert_eq!(
        hits[2], back_id,
        "Third element should be back (bottommost)"
    );

    // Verify hit_first also returns topmost
    assert_eq!(tester.hit_first([50.0, 50.0]), Some(front_id));
    assert_eq!(tester.hit_first_fast([50.0, 50.0]), Some(front_id));
}

#[test]
fn hits_returns_nodes_in_dom_order_correctly() {
    let nf = NodeFactory::new();

    // Create 2 overlapping rectangles - DOM order determines visual order
    // Later siblings (added later) appear on top
    let mut bottom = nf.create_rectangle_node();
    bottom.transform = AffineTransform::new(0.0, 0.0, 0.0);
    bottom.size = Size {
        width: 100.0,
        height: 100.0,
    };

    let mut top = nf.create_rectangle_node();
    top.transform = AffineTransform::new(10.0, 10.0, 0.0);
    top.size = Size {
        width: 80.0,
        height: 80.0,
    };

    let mut graph = SceneGraph::new();
    // Add bottom first (DOM order), then top (appears on top)
    let bottom_id = graph.append_child(Node::Rectangle(bottom), Parent::Root);
    let top_id = graph.append_child(Node::Rectangle(top), Parent::Root);

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

    // Point at (50, 50) - inside both rectangles
    // bottom: (0,0) to (100,100) - contains (50,50)
    // top: (10,10) to (90,90) - contains (50,50)
    let hits = tester.hits([50.0, 50.0]);

    // Later sibling (added later in DOM) should come first (topmost)
    assert_eq!(hits.len(), 2);
    assert_eq!(
        hits[0], top_id,
        "Later sibling (added later) should be topmost"
    );
    assert_eq!(
        hits[1], bottom_id,
        "Earlier sibling (added first) should be bottommost"
    );

    assert_eq!(tester.hit_first([50.0, 50.0]), Some(top_id));
}

#[test]
fn hits_returns_mixed_depth_nodes_correctly() {
    let nf = NodeFactory::new();

    // Create a container with a child ellipse
    let mut container = nf.create_container_node();
    container.layout_dimensions.layout_target_width = Some(200.0);
    container.layout_dimensions.layout_target_height = Some(200.0);

    let mut child = nf.create_ellipse_node();
    child.transform = AffineTransform::new(50.0, 50.0, 0.0);
    child.size = Size {
        width: 100.0,
        height: 100.0,
    };

    let mut graph = SceneGraph::new();
    let container_id = graph.append_child(Node::Container(container), Parent::Root);
    let child_id = graph.append_child(Node::Ellipse(child), Parent::NodeId(container_id.clone()));

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

    // Point at center of child (inside container bounds)
    let hits = tester.hits([100.0, 100.0]);

    // Deeper (child) should come first, then parent (shallower)
    // This matches browser behavior: deepest to shallowest
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0], child_id, "Deeper node (child) should be first");
    assert_eq!(
        hits[1], container_id,
        "Shallower node (parent) should be second"
    );
}
