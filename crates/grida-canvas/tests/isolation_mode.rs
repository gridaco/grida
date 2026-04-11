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
use cg::runtime::filter::{
    IsolationMode, IsolationModeDimStyle, IsolationModeFlags, IsolationModeOutside,
    IsolationModeStagePreset,
};
use cg::runtime::font_repository::FontRepository;
use cg::runtime::scene::{Backend, FrameFlushResult, Renderer};
use math2::transform::AffineTransform;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/// Two root-level subtrees:
///
/// ```text
/// Root A (container 0,0  100×100)
///   ├── Rect A1 (10,10  30×30)
///   └── Rect A2 (50,50  30×30)
///
/// Root B (container 200,0  100×100)
///   └── Rect B1 (10,10  30×30)
/// ```
fn build_two_subtree_scene() -> (Scene, NodeId, NodeId, NodeId, NodeId, NodeId) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Subtree A
    let mut ca = nf.create_container_node();
    ca.layout_dimensions.layout_target_width = Some(100.0);
    ca.layout_dimensions.layout_target_height = Some(100.0);
    let root_a = graph.append_child(Node::Container(ca), Parent::Root);

    let mut ra1 = nf.create_rectangle_node();
    ra1.transform = AffineTransform::new(10.0, 10.0, 0.0);
    ra1.size = Size {
        width: 30.0,
        height: 30.0,
    };
    ra1.set_fill(Paint::Solid(SolidPaint::RED));
    let a1 = graph.append_child(Node::Rectangle(ra1), Parent::NodeId(root_a));

    let mut ra2 = nf.create_rectangle_node();
    ra2.transform = AffineTransform::new(50.0, 50.0, 0.0);
    ra2.size = Size {
        width: 30.0,
        height: 30.0,
    };
    ra2.set_fill(Paint::Solid(SolidPaint::RED));
    let a2 = graph.append_child(Node::Rectangle(ra2), Parent::NodeId(root_a));

    // Subtree B — offset to x=200
    let mut cb = nf.create_container_node();
    cb.position = LayoutPositioningBasis::Cartesian(cg::cg::types::CGPoint { x: 200.0, y: 0.0 });
    cb.layout_dimensions.layout_target_width = Some(100.0);
    cb.layout_dimensions.layout_target_height = Some(100.0);
    let root_b = graph.append_child(Node::Container(cb), Parent::Root);

    let mut rb1 = nf.create_rectangle_node();
    rb1.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rb1.size = Size {
        width: 30.0,
        height: 30.0,
    };
    rb1.set_fill(Paint::Solid(SolidPaint::RED));
    let b1 = graph.append_child(Node::Rectangle(rb1), Parent::NodeId(root_b));

    let scene = Scene {
        name: "isolation test".into(),
        background_color: None,
        graph,
    };
    (scene, root_a, a1, a2, root_b, b1)
}

fn make_renderer(scene: Scene, vp_w: i32, vp_h: i32) -> Renderer {
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

fn flush_ok(renderer: &mut Renderer) -> cg::runtime::scene::FrameFlushStats {
    match renderer.flush() {
        FrameFlushResult::OK(s) => s,
        FrameFlushResult::NoPending => panic!("flush: NoPending"),
        FrameFlushResult::NoFrame => panic!("flush: NoFrame"),
        FrameFlushResult::NoScene => panic!("flush: NoScene"),
    }
}

/// Enable isolation, mark changed, queue, flush — returns stats.
fn isolate_and_flush(
    renderer: &mut Renderer,
    mode: IsolationMode,
) -> cg::runtime::scene::FrameFlushStats {
    renderer.set_isolation_mode(Some(mode));
    renderer.mark_changed(cg::runtime::changes::ChangeFlags::RENDER_FILTER);
    renderer.queue_stable();
    flush_ok(renderer)
}

// ═══════════════════════════════════════════════════════════════════════
// Frame plan filtering
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn isolation_reduces_display_list() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    // Full scene.
    renderer.queue_stable();
    let all = flush_ok(&mut renderer).frame.display_list_size_estimated;

    // Isolated subtree A (container + 2 rects = 3 nodes).
    let iso = isolate_and_flush(&mut renderer, IsolationMode::hidden(root_a));
    let count = iso.frame.display_list_size_estimated;

    assert!(count < all, "isolated ({count}) < full ({all})");
    assert_eq!(count, 3, "subtree A has 3 nodes, got {count}");
}

#[test]
fn clearing_isolation_restores_full_scene() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.queue_stable();
    let baseline = flush_ok(&mut renderer).frame.display_list_size_estimated;

    isolate_and_flush(&mut renderer, IsolationMode::hidden(root_a));

    renderer.set_isolation_mode(None);
    renderer.mark_changed(cg::runtime::changes::ChangeFlags::RENDER_FILTER);
    renderer.queue_stable();
    let restored = flush_ok(&mut renderer).frame.display_list_size_estimated;

    assert_eq!(restored, baseline, "should match baseline after clearing");
}

// ═══════════════════════════════════════════════════════════════════════
// Hit-test filtering
// ═══════════════════════════════════════════════════════════════════════

fn build_cache_and_iso_set(scene: &Scene, root: NodeId) -> (SceneCache, HashSet<NodeId>) {
    let mut cache = SceneCache::new();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    cache.update_geometry(scene, &fonts);
    cache.update_layers(scene);

    let mut set = HashSet::new();
    set.insert(root);
    for id in scene.graph.descendants(&root).unwrap() {
        set.insert(id);
    }
    (cache, set)
}

#[test]
fn hit_test_respects_isolation() {
    let (scene, root_a, a1, _, _, b1) = build_two_subtree_scene();
    let (cache, iso_set) = build_cache_and_iso_set(&scene, root_a);

    // Without isolation: B-region hit returns b1.
    let ht = HitTester::new(&cache);
    assert_eq!(ht.hit_first_fast([220.0, 20.0]), Some(b1));

    // With isolation on A: B-region → nothing, A-region → a1.
    let ht = HitTester::new(&cache).with_isolation_set(Some(&iso_set));
    assert!(ht.hit_first_fast([220.0, 20.0]).is_none());
    assert_eq!(ht.hit_first_fast([15.0, 15.0]), Some(a1));
}

#[test]
fn hits_fast_respects_isolation() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let (cache, iso_set) = build_cache_and_iso_set(&scene, root_a);

    let ht = HitTester::new(&cache).with_isolation_set(Some(&iso_set));
    assert!(ht.hits_fast([220.0, 20.0]).is_empty());
}

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn scene_load_resets_isolation() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.set_isolation_mode(Some(IsolationMode::hidden(root_a)));
    assert!(renderer.isolation_mode().is_some());

    let (new_scene, ..) = build_two_subtree_scene();
    renderer.load_scene(new_scene);
    assert!(renderer.isolation_mode().is_none());
    assert!(renderer.isolation_set().is_none());
}

// ═══════════════════════════════════════════════════════════════════════
// ChangeFlags
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn render_filter_flag() {
    let f =
        cg::runtime::changes::ChangeFlags::RENDER_FILTER | cg::runtime::changes::ChangeFlags::NONE;
    assert!(f.contains(cg::runtime::changes::ChangeFlags::RENDER_FILTER));
    assert!(!f.contains(cg::runtime::changes::ChangeFlags::SCENE_LOAD));
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeOutside
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn viewport_mode_stored() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.set_isolation_mode(Some(IsolationMode {
        root: root_a,
        outside: IsolationModeOutside::Viewport(IsolationModeDimStyle { opacity: 0.2 }),
        stage_preset: IsolationModeStagePreset::None,
    }));

    let mode = renderer.isolation_mode().unwrap();
    match &mode.outside {
        IsolationModeOutside::Viewport(dim) => {
            assert!((dim.opacity - 0.2).abs() < f32::EPSILON);
        }
        other => panic!("expected Viewport, got {other:?}"),
    }
}

#[test]
fn hidden_is_default() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.set_isolation_mode(Some(IsolationMode::hidden(root_a)));
    assert!(matches!(
        renderer.isolation_mode().unwrap().outside,
        IsolationModeOutside::Hidden
    ));
}

#[test]
fn outside_mode_does_not_affect_isolation_set() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.set_isolation_mode(Some(IsolationMode::hidden(root_a)));
    let set_hidden: HashSet<_> = renderer.isolation_set().unwrap().clone();

    renderer.set_isolation_mode(Some(IsolationMode {
        root: root_a,
        outside: IsolationModeOutside::Viewport(IsolationModeDimStyle { opacity: 0.3 }),
        stage_preset: IsolationModeStagePreset::None,
    }));
    let set_viewport: HashSet<_> = renderer.isolation_set().unwrap().clone();

    assert_eq!(set_hidden, set_viewport);
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeFlags (C-ABI)
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn overflow_dim_flag() {
    assert_eq!(IsolationModeFlags::OVERFLOW_DIM, 1);
    assert_eq!(0u32 & IsolationModeFlags::OVERFLOW_DIM, 0);
}

// ═══════════════════════════════════════════════════════════════════════
// Stage presets
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn stage_preset_shadow_xl_resolves() {
    let style = IsolationModeStagePreset::ShadowXL.resolve().unwrap();
    assert!(style.fills.is_none(), "ShadowXL should have no fills");
    assert!(style.strokes.is_none(), "ShadowXL should have no strokes");
    assert!(
        style.stroke_width.is_none(),
        "ShadowXL should have no stroke width"
    );
    assert!(
        style.corner_radius.is_none(),
        "ShadowXL should have no corner radius"
    );
    assert_eq!(
        style.shadows.as_ref().unwrap().len(),
        2,
        "shadow-xl has 2 layers"
    );
}

#[test]
fn stage_preset_none_resolves_to_none() {
    assert!(IsolationModeStagePreset::None.resolve().is_none());
}

#[test]
fn stage_preset_from_u32() {
    assert_eq!(
        IsolationModeStagePreset::from_u32(0),
        IsolationModeStagePreset::None
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(1),
        IsolationModeStagePreset::ShadowXL
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(999),
        IsolationModeStagePreset::None
    );
}

#[test]
fn stage_preset_set_on_renderer() {
    let (scene, root_a, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.set_isolation_mode(Some(IsolationMode::hidden(root_a)));

    renderer.set_isolation_stage_preset(IsolationModeStagePreset::ShadowXL);
    assert_eq!(
        renderer.isolation_mode().unwrap().stage_preset,
        IsolationModeStagePreset::ShadowXL
    );

    renderer.set_isolation_stage_preset(IsolationModeStagePreset::None);
    assert_eq!(
        renderer.isolation_mode().unwrap().stage_preset,
        IsolationModeStagePreset::None
    );
}

#[test]
fn stage_preset_noop_without_isolation() {
    let (scene, ..) = build_two_subtree_scene();
    let mut renderer = make_renderer(scene, 400, 200);

    renderer.set_isolation_stage_preset(IsolationModeStagePreset::ShadowXL);
    assert!(renderer.isolation_mode().is_none());
}
