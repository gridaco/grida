use cg::cache::geometry::GeometryCache;
use cg::cg::{alignment::Alignment, types::*};
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use std::sync::{Arc, Mutex};

#[test]
fn stroke_affects_render_bounds() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.stroke_width = 10.0;
    rect.stroke_align = StrokeAlign::Outside;

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    assert_eq!(bounds.x, -10.0);
    assert_eq!(bounds.y, -10.0);
    assert_eq!(bounds.width, 120.0);
    assert_eq!(bounds.height, 120.0);
}

#[test]
fn gaussian_blur_expands_render_bounds() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.effects = LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeBlur::Gaussian(
        FeGaussianBlur { radius: 5.0 },
    ))]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    // Gaussian blur uses 3x sigma for proper coverage
    assert_eq!(bounds.x, -15.0); // 5.0 * 3.0
    assert_eq!(bounds.y, -15.0);
    assert_eq!(bounds.width, 130.0); // 100 + 2 * 15
    assert_eq!(bounds.height, 130.0);
}

#[test]
fn drop_shadow_expands_render_bounds() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 10.0,
        spread: 0.0,
        color: CGColor(0, 0, 0, 255),
    })]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    // Shadow: offset by (5, 5), then blur expansion of 10 * 3 = 30
    // Bounds: rect offset by shadow, then inflated by blur*3
    assert_eq!(bounds.x, -25.0); // 5 - 30
    assert_eq!(bounds.y, -25.0); // 5 - 30
    assert_eq!(bounds.width, 160.0); // 100 + 30*2
    assert_eq!(bounds.height, 160.0);
}

#[test]
fn drop_shadow_spread_expands_render_bounds() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 0.0,
        dy: 0.0,
        blur: 0.0,
        spread: 10.0,
        color: CGColor(0, 0, 0, 255),
    })]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    assert_eq!(bounds.x, -10.0);
    assert_eq!(bounds.y, -10.0);
    assert_eq!(bounds.width, 120.0);
    assert_eq!(bounds.height, 120.0);
}

#[test]
fn progressive_blur_expands_render_bounds_increasing() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    // Progressive blur from 0 to 20 pixels (increasing)
    rect.effects = LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeBlur::Progressive(
        FeProgressiveBlur {
            start: Alignment(0.0, -1.0), // Top edge
            end: Alignment(0.0, 1.0),    // Bottom edge
            radius: 0.0,                 // No blur at start
            radius2: 20.0,               // Max blur at end
        },
    ))]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();

    // Should use max radius (20.0) * 3.0 for bounds expansion (3-sigma coverage)
    assert_eq!(bounds.x, -60.0); // 20.0 * 3.0
    assert_eq!(bounds.y, -60.0);
    assert_eq!(bounds.width, 220.0); // 100 + 60*2
    assert_eq!(bounds.height, 220.0);
}

#[test]
fn progressive_blur_expands_render_bounds_decreasing() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    // Progressive blur from 30 to 5 pixels (decreasing)
    rect.effects = LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeBlur::Progressive(
        FeProgressiveBlur {
            start: Alignment(0.0, -1.0), // Top edge
            end: Alignment(0.0, 1.0),    // Bottom edge
            radius: 30.0,                // Max blur at start
            radius2: 5.0,                // Min blur at end
        },
    ))]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();

    // Should use max radius (30.0) * 3.0 for bounds expansion, even though it's radius (not radius2)
    assert_eq!(bounds.x, -90.0); // 30.0 * 3.0
    assert_eq!(bounds.y, -90.0);
    assert_eq!(bounds.width, 280.0); // 100 + 90*2
    assert_eq!(bounds.height, 280.0);
}

#[test]
fn progressive_backdrop_blur_does_not_expand_render_bounds() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    // Progressive backdrop blur - blurs content behind, not the shape itself
    rect.effects = LayerEffects::from_array(vec![FilterEffect::BackdropBlur(FeBlur::Progressive(
        FeProgressiveBlur {
            start: Alignment(-1.0, -1.0), // Top-left corner
            end: Alignment(1.0, 1.0),     // Bottom-right corner
            radius: 10.0,
            radius2: 40.0,
        },
    ))]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();

    // Backdrop blur doesn't expand render bounds (it only blurs content behind the shape)
    assert_eq!(bounds.x, 0.0);
    assert_eq!(bounds.y, 0.0);
    assert_eq!(bounds.width, 100.0);
    assert_eq!(bounds.height, 100.0);
}
