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
fn stage_preset_none_resolves_to_none() {
    assert!(IsolationModeStagePreset::None.resolve().is_none());
}

/// Every non-None preset must resolve to shadow-only (no fills/strokes/radius)
/// with the expected number of shadow layers.
#[test]
fn stage_preset_all_variants_resolve() {
    let cases: &[(IsolationModeStagePreset, usize, &str)] = &[
        (IsolationModeStagePreset::Shadow2XS, 1, "shadow-2xs"),
        (IsolationModeStagePreset::ShadowXS, 1, "shadow-xs"),
        (IsolationModeStagePreset::ShadowSM, 2, "shadow-sm"),
        (IsolationModeStagePreset::ShadowMD, 2, "shadow-md"),
        (IsolationModeStagePreset::ShadowLG, 2, "shadow-lg"),
        (IsolationModeStagePreset::ShadowXL, 2, "shadow-xl"),
        (IsolationModeStagePreset::Shadow2XL, 1, "shadow-2xl"),
    ];
    for &(preset, expected_layers, name) in cases {
        let style = preset
            .resolve()
            .unwrap_or_else(|| panic!("{name} should resolve"));
        assert!(style.fills.is_none(), "{name} should have no fills");
        assert!(style.strokes.is_none(), "{name} should have no strokes");
        assert!(
            style.stroke_width.is_none(),
            "{name} should have no stroke width"
        );
        assert!(
            style.corner_radius.is_none(),
            "{name} should have no corner radius"
        );
        assert_eq!(
            style.shadows.as_ref().unwrap().len(),
            expected_layers,
            "{name} layer count"
        );
    }
}

#[test]
fn stage_preset_from_u32() {
    assert_eq!(
        IsolationModeStagePreset::from_u32(0),
        IsolationModeStagePreset::None
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(1),
        IsolationModeStagePreset::Shadow2XS
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(2),
        IsolationModeStagePreset::ShadowXS
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(3),
        IsolationModeStagePreset::ShadowSM
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(4),
        IsolationModeStagePreset::ShadowMD
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(5),
        IsolationModeStagePreset::ShadowLG
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(6),
        IsolationModeStagePreset::ShadowXL
    );
    assert_eq!(
        IsolationModeStagePreset::from_u32(7),
        IsolationModeStagePreset::Shadow2XL
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

// ═══════════════════════════════════════════════════════════════════════
// Stage shadow pixel probe — verify shadows actually render
// ═══════════════════════════════════════════════════════════════════════

/// Read one pixel from a Skia Image, returning `[R, G, B, A]`.
fn pixel_at(img: &skia_safe::Image, x: i32, y: i32) -> [u8; 4] {
    let info = img
        .image_info()
        .with_dimensions(skia_safe::ISize::new(1, 1));
    let mut buf = [0u8; 4];
    img.read_pixels(
        &info,
        &mut buf,
        4,
        skia_safe::IPoint::new(x, y),
        skia_safe::image::CachingHint::Allow,
    );
    // N32 premul on little-endian = BGRA → swizzle to RGBA.
    [buf[2], buf[1], buf[0], buf[3]]
}

/// Bounding box of all non-transparent pixels, or `None`.
fn content_bbox(img: &skia_safe::Image) -> Option<(i32, i32, i32, i32)> {
    let (w, h) = (img.width(), img.height());
    let (mut mn_x, mut mn_y, mut mx_x, mut mx_y) = (w, h, 0i32, 0i32);
    for y in 0..h {
        for x in 0..w {
            if pixel_at(img, x, y)[3] > 0 {
                mn_x = mn_x.min(x);
                mn_y = mn_y.min(y);
                mx_x = mx_x.max(x);
                mx_y = mx_y.max(y);
            }
        }
    }
    if mx_x >= mn_x {
        Some((mn_x, mn_y, mx_x, mx_y))
    } else {
        None
    }
}

/// Render a 100×100 white container with isolation + the given stage
/// shadow preset on a 400×400 canvas. Returns the backend surface snapshot.
///
/// Uses `flush` (live draw path) rather than `snapshot()` because the
/// latter uses `draw_nocache` which bypasses isolation mode entirely.
fn render_stage_shadow(preset: IsolationModeStagePreset) -> skia_safe::Image {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.layout_dimensions.layout_target_width = Some(100.0);
    container.layout_dimensions.layout_target_height = Some(100.0);
    container.set_fill(Paint::Solid(SolidPaint::WHITE));
    let root = graph.append_child(Node::Container(container), Parent::Root);

    let scene = Scene {
        name: "stage shadow probe".into(),
        background_color: None,
        graph,
    };

    let mut renderer = make_renderer(scene, 400, 400);
    renderer.set_isolation_mode(Some(IsolationMode::hidden(root)));
    renderer.set_isolation_stage_preset(preset);
    renderer.mark_changed(cg::runtime::changes::ChangeFlags::RENDER_FILTER);
    renderer.queue_stable();
    flush_ok(&mut renderer);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    surface.image_snapshot()
}

#[test]
fn stage_shadow_xl_renders_pixels() {
    let img = render_stage_shadow(IsolationModeStagePreset::ShadowXL);
    let w = img.width();
    let h = img.height();

    let (_, _, max_x, max_y) = content_bbox(&img).expect("ShadowXL should render pixels");
    let cx = (max_x + (max_x - 100)) / 2 + 50; // horizontal center of container
    let cy = (max_y + (max_y - 100)) / 2 + 50;

    // Container center: opaque white.
    let (_, _, bx, by) = content_bbox(&img).unwrap();
    let center = pixel_at(&img, (bx - 50).max(0), (by - 50).max(0));
    assert!(
        center[3] > 200,
        "container should be opaque, got {:?}",
        center
    );

    // Shadow pixels exist somewhere outside the pure-white container area.
    let has_shadow = (0..h).any(|y| {
        (0..w).any(|x| {
            let px = pixel_at(&img, x, y);
            px[3] > 0 && !(px[0] > 240 && px[1] > 240 && px[2] > 240 && px[3] == 255)
        })
    });
    assert!(
        has_shadow,
        "no shadow pixels found — shadow is NOT rendering"
    );

    // Far corner: transparent.
    assert_eq!(
        pixel_at(&img, 0, 0)[3],
        0,
        "far corner should be transparent"
    );
}

/// ShadowXL bbox should extend beyond None bbox (shadow adds pixels).
#[test]
fn stage_shadow_none_has_no_shadow_pixels() {
    let bbox_with = content_bbox(&render_stage_shadow(IsolationModeStagePreset::ShadowXL))
        .expect("ShadowXL should render");
    let bbox_without = content_bbox(&render_stage_shadow(IsolationModeStagePreset::None))
        .expect("None should render");

    assert!(
        bbox_with.3 > bbox_without.3,
        "ShadowXL bottom ({}) should exceed None bottom ({})",
        bbox_with.3,
        bbox_without.3
    );
}

/// Every non-None preset should produce a content bbox that extends
/// beyond the None preset's bbox (shadow pixels exist outside the container).
#[test]
fn stage_shadow_all_presets_produce_pixels() {
    let none_img = render_stage_shadow(IsolationModeStagePreset::None);
    let none_bbox = content_bbox(&none_img).expect("None should render the container");

    let presets = [
        (IsolationModeStagePreset::Shadow2XS, "shadow-2xs"),
        (IsolationModeStagePreset::ShadowXS, "shadow-xs"),
        (IsolationModeStagePreset::ShadowSM, "shadow-sm"),
        (IsolationModeStagePreset::ShadowMD, "shadow-md"),
        (IsolationModeStagePreset::ShadowLG, "shadow-lg"),
        (IsolationModeStagePreset::ShadowXL, "shadow-xl"),
        (IsolationModeStagePreset::Shadow2XL, "shadow-2xl"),
    ];

    for (preset, name) in presets {
        let img = render_stage_shadow(preset);
        let bbox = content_bbox(&img)
            .unwrap_or_else(|| panic!("{name}: no pixels at all! Stage shadow NOT rendering."));

        // Shadow must extend the bbox beyond the None-preset container.
        let extends = bbox.0 < none_bbox.0
            || bbox.1 < none_bbox.1
            || bbox.2 > none_bbox.2
            || bbox.3 > none_bbox.3;
        assert!(
            extends,
            "{name}: bbox {:?} does not extend beyond None bbox {:?}. \
             Shadow is NOT rendering!",
            bbox, none_bbox
        );
    }
}
