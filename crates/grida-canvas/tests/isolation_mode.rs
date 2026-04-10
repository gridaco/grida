//! Tests for Isolation Mode — a render-time viewport filter that restricts
//! which part of the scene is drawn and hit-tested.

use cg::cache::scene::SceneCache;
use cg::cg::prelude::*;
use cg::hittest::HitTester;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::resources::ByteStore;
use cg::runtime::camera::Camera2D;
use cg::runtime::filter::IsolationMode;
use cg::runtime::font_repository::FontRepository;
use cg::runtime::scene::{Backend, FrameFlushResult, Renderer};
use math2::transform::AffineTransform;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a scene with two root-level subtrees:
///
///   Root A (container at 0,0, 100x100)
///     +-- Rect A1 (at 10,10, 30x30)
///     +-- Rect A2 (at 50,50, 30x30)
///
///   Root B (container at 200,0, 100x100)
///     +-- Rect B1 (at 10,10, 30x30)  (world: 210,10 via parent offset)
///
/// Returns (scene, root_a, a1, a2, root_b, b1).
fn build_two_subtree_scene() -> (Scene, NodeId, NodeId, NodeId, NodeId, NodeId) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Subtree A — at the origin
    let mut container_a = nf.create_container_node();
    container_a.layout_dimensions.layout_target_width = Some(100.0);
    container_a.layout_dimensions.layout_target_height = Some(100.0);
    let root_a = graph.append_child(Node::Container(container_a), Parent::Root);

    let mut rect_a1 = nf.create_rectangle_node();
    rect_a1.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect_a1.size = Size {
        width: 30.0,
        height: 30.0,
    };
    rect_a1.set_fill(Paint::Solid(SolidPaint::RED));
    let a1 = graph.append_child(Node::Rectangle(rect_a1), Parent::NodeId(root_a));

    let mut rect_a2 = nf.create_rectangle_node();
    rect_a2.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect_a2.size = Size {
        width: 30.0,
        height: 30.0,
    };
    rect_a2.set_fill(Paint::Solid(SolidPaint::RED));
    let a2 = graph.append_child(Node::Rectangle(rect_a2), Parent::NodeId(root_a));

    // Subtree B — offset to x=200 via schema position
    let mut container_b = nf.create_container_node();
    container_b.position =
        LayoutPositioningBasis::Cartesian(cg::cg::types::CGPoint { x: 200.0, y: 0.0 });
    container_b.layout_dimensions.layout_target_width = Some(100.0);
    container_b.layout_dimensions.layout_target_height = Some(100.0);
    let root_b = graph.append_child(Node::Container(container_b), Parent::Root);

    let mut rect_b1 = nf.create_rectangle_node();
    rect_b1.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect_b1.size = Size {
        width: 30.0,
        height: 30.0,
    };
    rect_b1.set_fill(Paint::Solid(SolidPaint::RED));
    let b1 = graph.append_child(Node::Rectangle(rect_b1), Parent::NodeId(root_b));

    let scene = Scene {
        name: "isolation test".into(),
        background_color: None,
        graph,
    };

    (scene, root_a, a1, a2, root_b, b1)
}

fn make_renderer(scene: Scene, vp_w: i32, vp_h: i32) -> Renderer {
    // Disable layer compositing so display_list_size_estimated always equals
    // the total visible node count (no promoted/cached split).
    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(vp_w, vp_h),
        None,
        Camera2D::new(Size {
            width: vp_w as f32,
            height: vp_h as f32,
        }),
        cg::runtime::scene::RendererOptions {
            config: cg::runtime::config::RuntimeRendererConfig {
                layer_compositing: false,
                ..Default::default()
            },
            ..Default::default()
        },
    );
    renderer.load_scene(scene);
    renderer
}

fn flush_and_get_stats(renderer: &mut Renderer) -> cg::runtime::scene::FrameFlushStats {
    match renderer.flush() {
        FrameFlushResult::OK(stats) => stats,
        other => panic!(
            "Expected OK flush, got {:?}",
            match other {
                FrameFlushResult::NoPending => "NoPending",
                FrameFlushResult::NoFrame => "NoFrame",
                FrameFlushResult::NoScene => "NoScene",
                _ => "OK",
            }
        ),
    }
}

// ---------------------------------------------------------------------------
// Tests: frame plan filtering
// ---------------------------------------------------------------------------

#[test]
fn isolation_reduces_display_list() {
    let (scene, root_a, _a1, _a2, _root_b, _b1) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    // Frame 1: no isolation — all 5 nodes should appear.
    renderer.queue_stable();
    let stats_all = flush_and_get_stats(&mut renderer);
    let all_count = stats_all.frame.display_list_size_estimated;

    // Frame 2: isolate subtree A (root_a + a1 + a2 = 3 nodes).
    renderer.set_isolation_mode(Some(IsolationMode { root: root_a }));
    renderer.mark_changed(cg::runtime::changes::ChangeFlags::RENDER_FILTER);
    renderer.queue_stable();
    let stats_isolated = flush_and_get_stats(&mut renderer);
    let isolated_count = stats_isolated.frame.display_list_size_estimated;

    assert!(
        isolated_count < all_count,
        "Isolated display list ({isolated_count}) should be smaller than \
         full display list ({all_count})"
    );
    // Subtree A has 3 nodes (container + 2 rects), subtree B has 2.
    // With isolation on A, we expect exactly 3.
    assert_eq!(
        isolated_count, 3,
        "Expected 3 nodes in isolated subtree A, got {isolated_count}"
    );
}

#[test]
fn clearing_isolation_restores_full_scene() {
    let (scene, root_a, _a1, _a2, _root_b, _b1) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    // Baseline: draw without isolation first.
    renderer.queue_stable();
    let stats_before = flush_and_get_stats(&mut renderer);
    let all_count = stats_before.frame.display_list_size_estimated;

    // Enable isolation.
    renderer.set_isolation_mode(Some(IsolationMode { root: root_a }));
    renderer.mark_changed(cg::runtime::changes::ChangeFlags::RENDER_FILTER);
    renderer.queue_stable();
    let stats_iso = flush_and_get_stats(&mut renderer);
    let iso_count = stats_iso.frame.display_list_size_estimated;
    assert!(
        iso_count < all_count,
        "Isolated ({iso_count}) should be less than full ({all_count})"
    );

    // Clear isolation — count should be restored to baseline.
    renderer.set_isolation_mode(None);
    renderer.mark_changed(cg::runtime::changes::ChangeFlags::RENDER_FILTER);
    renderer.queue_stable();
    let stats = flush_and_get_stats(&mut renderer);

    assert_eq!(
        stats.frame.display_list_size_estimated, all_count,
        "After clearing isolation, display list should match baseline ({all_count}), got {}",
        stats.frame.display_list_size_estimated
    );
}

// ---------------------------------------------------------------------------
// Tests: hit-test filtering
// ---------------------------------------------------------------------------

#[test]
fn hit_test_respects_isolation() {
    let (scene, root_a, a1, _a2, _root_b, b1) = build_two_subtree_scene();

    // Build caches the same way the Renderer does.
    let mut cache = SceneCache::new();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    // Build the isolation set for subtree A.
    let mut iso_set = HashSet::new();
    iso_set.insert(root_a);
    let descendants = scene.graph.descendants(&root_a).unwrap();
    for id in &descendants {
        iso_set.insert(*id);
    }

    // Without isolation: hit inside subtree B returns b1.
    let ht = HitTester::new(&cache);
    assert_eq!(
        ht.hit_first_fast([220.0, 20.0]),
        Some(b1),
        "Without isolation, point in B should hit b1"
    );

    // With isolation on A: same point returns nothing.
    let ht_iso = HitTester::new(&cache).with_isolation_set(Some(&iso_set));
    assert!(
        ht_iso.hit_first_fast([220.0, 20.0]).is_none(),
        "With isolation on A, point in B should hit nothing"
    );

    // With isolation on A: point in A still works.
    let hit = ht_iso.hit_first_fast([15.0, 15.0]);
    assert_eq!(
        hit,
        Some(a1),
        "With isolation on A, point in A should hit a1"
    );
}

#[test]
fn hits_fast_respects_isolation() {
    let (scene, root_a, _a1, _a2, _root_b, _b1) = build_two_subtree_scene();

    let mut cache = SceneCache::new();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    let mut iso_set = HashSet::new();
    iso_set.insert(root_a);
    for id in scene.graph.descendants(&root_a).unwrap() {
        iso_set.insert(id);
    }

    // hits_fast at a point overlapping B should return empty under isolation A.
    let ht = HitTester::new(&cache).with_isolation_set(Some(&iso_set));
    let results = ht.hits_fast([220.0, 20.0]);
    assert!(
        results.is_empty(),
        "hits_fast with isolation on A should return empty for point in B"
    );
}

#[test]
fn scene_load_resets_isolation() {
    let (scene, root_a, _a1, _a2, _root_b, _b1) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    // Enable isolation.
    renderer.set_isolation_mode(Some(IsolationMode { root: root_a }));
    assert!(renderer.isolation_mode().is_some());

    // Load a new scene — isolation should be cleared.
    let (new_scene, _, _, _, _, _) = build_two_subtree_scene();
    renderer.load_scene(new_scene);
    assert!(
        renderer.isolation_mode().is_none(),
        "Isolation should be cleared after scene load"
    );
    assert!(
        renderer.isolation_set().is_none(),
        "Isolation set should be None after scene load"
    );
}

#[test]
fn change_flags_render_filter_is_not_dead() {
    // Ensure the flag exists and can be combined with others.
    let flags =
        cg::runtime::changes::ChangeFlags::RENDER_FILTER | cg::runtime::changes::ChangeFlags::NONE;
    assert!(flags.contains(cg::runtime::changes::ChangeFlags::RENDER_FILTER));
    assert!(!flags.contains(cg::runtime::changes::ChangeFlags::SCENE_LOAD));
}
