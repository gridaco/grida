//! Integration tests for the surface interaction state machine.
//!
//! These tests construct real scenes with known node positions, populate
//! the full cache pipeline (`GeometryCache` + `LayerList` + R-tree), and
//! exercise `SurfaceState::dispatch` with real `SurfaceEvent` values.

use cg::cache::scene::SceneCache;
use cg::hittest::HitTester;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use cg::surface::event::{Modifiers, PointerButton, SurfaceEvent};
use cg::surface::gesture::SurfaceGesture;
use cg::surface::state::SurfaceState;
use cg::surface::ui::hit_region::HitRegions;
use cg::surface::CursorIcon;
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

// ── Helpers ──────────────────────────────────────────────────────────────

/// Build a scene with two non-overlapping rectangles:
///
/// ```text
///   rect_a: (10,10) 80×80       rect_b: (200,10) 80×80
///   ┌────────┐                  ┌────────┐
///   │        │                  │        │
///   │   A    │                  │   B    │
///   │        │                  │        │
///   └────────┘                  └────────┘
/// ```
///
/// Returns `(scene, cache, rect_a_id, rect_b_id)`.
fn two_rect_scene() -> (Scene, SceneCache, NodeId, NodeId) {
    let nf = NodeFactory::new();

    let mut rect_a = nf.create_rectangle_node();
    rect_a.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect_a.size = Size {
        width: 80.0,
        height: 80.0,
    };

    let mut rect_b = nf.create_rectangle_node();
    rect_b.transform = AffineTransform::new(200.0, 10.0, 0.0);
    rect_b.size = Size {
        width: 80.0,
        height: 80.0,
    };

    let mut graph = SceneGraph::new();
    let id_a = graph.append_child(Node::Rectangle(rect_a), Parent::Root);
    let id_b = graph.append_child(Node::Rectangle(rect_b), Parent::Root);

    let scene = Scene {
        name: "test".into(),
        background_color: None,
        graph,
    };

    let mut cache = SceneCache::new();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    (scene, cache, id_a, id_b)
}

fn pointer_down(canvas_point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerDown {
        canvas_point,
        screen_point: canvas_point,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn pointer_move(canvas_point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerMove {
        canvas_point,
        screen_point: canvas_point,
    }
}

fn pointer_up(canvas_point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerUp {
        canvas_point,
        screen_point: canvas_point,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn editing_surface() -> SurfaceState {
    let mut s = SurfaceState::new();
    s.readonly = false;
    s
}

// ── Basic selection tests (work in both readonly and editing modes) ───────

#[test]
fn click_selects_node() {
    let (scene, cache, id_a, _id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = SurfaceState::new(); // readonly

    // Click center of rect_a → selects it.
    let r = surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert!(r.selection_changed);
    assert_eq!(surface.selection.as_slice(), &[id_a]);
}

#[test]
fn click_empty_clears_selection() {
    let (scene, cache, id_a, _) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = SurfaceState::new();

    // Select rect_a first.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.as_slice(), &[id_a]);

    // Click on empty space (far away) → clears selection, starts marquee.
    let r = surface.dispatch(pointer_down([500.0, 500.0]), &ht, &scene.graph, &regions);
    assert!(r.selection_changed);
    assert!(surface.selection.is_empty());
    assert!(matches!(
        surface.gesture,
        SurfaceGesture::MarqueeSelect { .. }
    ));
}

#[test]
fn click_switches_selection() {
    let (scene, cache, id_a, id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = SurfaceState::new();

    // Select rect_a.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.as_slice(), &[id_a]);

    // Click rect_b → selection switches.
    surface.dispatch(pointer_down([240.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.as_slice(), &[id_b]);
}

// ── Editing mode: deferred selection + translate ─────────────────────────

#[test]
fn editing_click_already_selected_defers_then_applies() {
    let (scene, cache, id_a, _id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = editing_surface();

    // Select both nodes via two shift-clicks (first click selects A, second
    // shift-click adds B).
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);

    surface.dispatch(
        SurfaceEvent::PointerDown {
            canvas_point: [240.0, 50.0],
            screen_point: [240.0, 50.0],
            button: PointerButton::Primary,
            modifiers: Modifiers {
                shift: true,
                ..Default::default()
            },
        },
        &ht,
        &scene.graph,
        &regions,
    );
    surface.dispatch(pointer_up([240.0, 50.0]), &ht, &scene.graph, &regions);

    assert_eq!(surface.selection.len(), 2);

    // Now click on rect_a (already selected, no shift) → deferred.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    // Selection should still be [A, B] (deferred, not applied yet).
    assert_eq!(surface.selection.len(), 2);

    // Release without dragging → deferred applies, resets to [A].
    let r = surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert!(r.selection_changed);
    assert_eq!(surface.selection.len(), 1);
    assert!(surface.selection.contains(&id_a));
}

#[test]
fn editing_drag_selected_starts_translate_preserves_selection() {
    let (scene, cache, id_a, id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = editing_surface();

    // Select both via shift-click.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(
        SurfaceEvent::PointerDown {
            canvas_point: [240.0, 50.0],
            screen_point: [240.0, 50.0],
            button: PointerButton::Primary,
            modifiers: Modifiers {
                shift: true,
                ..Default::default()
            },
        },
        &ht,
        &scene.graph,
        &regions,
    );
    surface.dispatch(pointer_up([240.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.len(), 2);

    // Pointer-down on rect_a (already selected) → deferred.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.len(), 2);

    // Move → translate starts, deferred cancelled.
    let r = surface.dispatch(pointer_move([60.0, 60.0]), &ht, &scene.graph, &regions);
    assert!(matches!(surface.gesture, SurfaceGesture::Translate { .. }));
    assert!(r.needs_redraw);
    // Both nodes remain selected.
    assert_eq!(surface.selection.len(), 2);
    assert!(surface.selection.contains(&id_a));
    assert!(surface.selection.contains(&id_b));
}

#[test]
fn editing_drag_inside_selection_rect_translates() {
    let (scene, cache, _id_a, _id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = editing_surface();

    // Select both nodes.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(
        SurfaceEvent::PointerDown {
            canvas_point: [240.0, 50.0],
            screen_point: [240.0, 50.0],
            button: PointerButton::Primary,
            modifiers: Modifiers {
                shift: true,
                ..Default::default()
            },
        },
        &ht,
        &scene.graph,
        &regions,
    );
    surface.dispatch(pointer_up([240.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.len(), 2);

    // The union bounding rect of the two rects spans from (10,10) to (280,90).
    // Click at (140, 50) — empty space between the two rects, but inside
    // the selection bounding rect.
    surface.dispatch(pointer_down([140.0, 50.0]), &ht, &scene.graph, &regions);
    // Selection should be preserved (not cleared, no marquee).
    assert_eq!(surface.selection.len(), 2);
    assert!(matches!(surface.gesture, SurfaceGesture::Idle));

    // Move → translate starts.
    surface.dispatch(pointer_move([150.0, 55.0]), &ht, &scene.graph, &regions);
    assert!(matches!(surface.gesture, SurfaceGesture::Translate { .. }));
    assert_eq!(surface.selection.len(), 2);
}

#[test]
fn editing_drag_outside_selection_rect_marquees() {
    let (scene, cache, id_a, _) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = editing_surface();

    // Select rect_a.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.as_slice(), &[id_a]);

    // Click far outside the selection bounding rect → clears + marquee.
    surface.dispatch(pointer_down([500.0, 500.0]), &ht, &scene.graph, &regions);
    assert!(surface.selection.is_empty());
    assert!(matches!(
        surface.gesture,
        SurfaceGesture::MarqueeSelect { .. }
    ));
}

#[test]
fn editing_move_cursor_inside_selection_bounds() {
    let (scene, cache, _id_a, _) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = editing_surface();

    // Select rect_a.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);

    // Hover over rect_a (selected) → Move cursor.
    surface.dispatch(pointer_move([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.cursor, CursorIcon::Move);

    // Hover over empty space → Default cursor.
    surface.dispatch(pointer_move([500.0, 500.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.cursor, CursorIcon::Default);
}

#[test]
fn editing_translate_gesture_tracks_and_ends() {
    let (scene, cache, id_a, _) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = editing_surface();

    // Select and start translate.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_move([70.0, 70.0]), &ht, &scene.graph, &regions);
    assert!(matches!(surface.gesture, SurfaceGesture::Translate { .. }));

    // Verify position tracking (incremental: prev_canvas = current point).
    if let SurfaceGesture::Translate { prev_canvas } = surface.gesture {
        assert_eq!(prev_canvas, [70.0, 70.0]);
    }

    // Continue moving.
    surface.dispatch(pointer_move([90.0, 80.0]), &ht, &scene.graph, &regions);
    if let SurfaceGesture::Translate { prev_canvas } = surface.gesture {
        assert_eq!(prev_canvas, [90.0, 80.0]);
    }

    // Pointer-up ends translate.
    let r = surface.dispatch(pointer_up([90.0, 80.0]), &ht, &scene.graph, &regions);
    assert!(matches!(surface.gesture, SurfaceGesture::Idle));
    assert!(r.needs_redraw);
    // Selection preserved.
    assert_eq!(surface.selection.as_slice(), &[id_a]);
}

// ── Readonly mode: no translate, no move cursor ──────────────────────────

#[test]
fn readonly_no_translate_on_drag() {
    let (scene, cache, id_a, _id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = SurfaceState::new(); // readonly = true

    // Select rect_a.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.as_slice(), &[id_a]);

    // In readonly mode, clicking an already-selected node immediately
    // re-selects (no deferral). Simulate by clicking again.
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);

    // Move — should NOT start a Translate gesture.
    surface.dispatch(pointer_move([60.0, 60.0]), &ht, &scene.graph, &regions);
    assert!(
        !matches!(surface.gesture, SurfaceGesture::Translate { .. }),
        "readonly mode should never enter Translate gesture"
    );
}

#[test]
fn readonly_no_move_cursor_on_selected_hover() {
    let (scene, cache, id_a, _) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = SurfaceState::new(); // readonly

    // Select rect_a.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.as_slice(), &[id_a]);

    // Hover over rect_a → cursor should remain Default in readonly.
    surface.dispatch(pointer_move([50.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.cursor, CursorIcon::Default);
}

#[test]
fn readonly_click_inside_selection_rect_clears() {
    let (scene, cache, _id_a, _id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);
    let regions = HitRegions::new();
    let mut surface = SurfaceState::new(); // readonly

    // Select both via shift-clicks.
    surface.dispatch(pointer_down([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(pointer_up([50.0, 50.0]), &ht, &scene.graph, &regions);
    surface.dispatch(
        SurfaceEvent::PointerDown {
            canvas_point: [240.0, 50.0],
            screen_point: [240.0, 50.0],
            button: PointerButton::Primary,
            modifiers: Modifiers {
                shift: true,
                ..Default::default()
            },
        },
        &ht,
        &scene.graph,
        &regions,
    );
    surface.dispatch(pointer_up([240.0, 50.0]), &ht, &scene.graph, &regions);
    assert_eq!(surface.selection.len(), 2);

    // In readonly mode, clicking empty space between rects (inside
    // selection union rect) should CLEAR selection, not start translate.
    surface.dispatch(pointer_down([140.0, 50.0]), &ht, &scene.graph, &regions);
    assert!(
        surface.selection.is_empty(),
        "readonly mode: click on empty space inside selection rect should clear"
    );
    assert!(matches!(
        surface.gesture,
        SurfaceGesture::MarqueeSelect { .. }
    ));
}

// ── Selection-rect hit test accuracy ─────────────────────────────────────

#[test]
fn selection_rect_hit_test_accuracy() {
    let (scene, cache, id_a, id_b) = two_rect_scene();
    let ht = HitTester::with_graph(&cache, &scene.graph);

    // Both selected: union rect is (10,10)→(280,90).
    assert!(ht.point_in_selection_bounds([140.0, 50.0], &[id_a, id_b]));
    assert!(ht.point_in_selection_bounds([10.0, 10.0], &[id_a, id_b]));
    assert!(ht.point_in_selection_bounds([279.0, 89.0], &[id_a, id_b]));

    // Outside the union rect.
    assert!(!ht.point_in_selection_bounds([5.0, 50.0], &[id_a, id_b]));
    assert!(!ht.point_in_selection_bounds([300.0, 50.0], &[id_a, id_b]));
    assert!(!ht.point_in_selection_bounds([140.0, 0.0], &[id_a, id_b]));
    assert!(!ht.point_in_selection_bounds([140.0, 100.0], &[id_a, id_b]));

    // Single node: rect_a bounds are (10,10)→(90,90).
    assert!(ht.point_in_selection_bounds([50.0, 50.0], &[id_a]));
    assert!(!ht.point_in_selection_bounds([5.0, 50.0], &[id_a]));

    // Empty selection.
    assert!(!ht.point_in_selection_bounds([50.0, 50.0], &[]));
}

// ── Schema accessor tests ────────────────────────────────────────────────
// Test Node::transform_mut(), Node::size_mut(), refresh_node_geo_data()
// via direct scene graph manipulation + full geometry rebuild.
// (Mutation e2e tests live in grida-dev/src/editor/.)

#[test]
fn translate_node_moves_bounds() {
    let (mut scene, mut cache, id_a, _id_b) = two_rect_scene();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));

    // Original bounds of rect_a: (10,10)→(90,90).
    let before = cache.geometry.get_world_bounds(&id_a).unwrap();
    assert!((before.x - 10.0).abs() < 0.1);
    assert!((before.y - 10.0).abs() < 0.1);

    // Mutate: translate rect_a by (+50, +30).
    {
        let node = scene.graph.get_node_mut(&id_a).unwrap();
        if let Node::Rectangle(n) = node {
            n.transform.translate(50.0, 30.0);
        }
        scene.graph.refresh_node_geo_data(&id_a);
    }

    // Rebuild caches.
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    // Verify bounds moved.
    let after = cache.geometry.get_world_bounds(&id_a).unwrap();
    assert!(
        (after.x - 60.0).abs() < 0.1,
        "expected x≈60, got {}",
        after.x
    );
    assert!(
        (after.y - 40.0).abs() < 0.1,
        "expected y≈40, got {}",
        after.y
    );
    assert!((after.width - 80.0).abs() < 0.1);
    assert!((after.height - 80.0).abs() < 0.1);
}

#[test]
fn resize_node_changes_bounds() {
    let (mut scene, mut cache, id_a, _) = two_rect_scene();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));

    // Original size: 80×80.
    let before = cache.geometry.get_world_bounds(&id_a).unwrap();
    assert!((before.width - 80.0).abs() < 0.1);

    // Mutate: resize to 120×40.
    {
        let node = scene.graph.get_node_mut(&id_a).unwrap();
        if let Node::Rectangle(n) = node {
            n.size.width = 120.0;
            n.size.height = 40.0;
        }
        scene.graph.refresh_node_geo_data(&id_a);
    }

    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    let after = cache.geometry.get_world_bounds(&id_a).unwrap();
    assert!(
        (after.width - 120.0).abs() < 0.1,
        "expected w≈120, got {}",
        after.width
    );
    assert!(
        (after.height - 40.0).abs() < 0.1,
        "expected h≈40, got {}",
        after.height
    );
    // Position should be unchanged.
    assert!((after.x - 10.0).abs() < 0.1);
}

#[test]
fn rotate_node_changes_geo_data() {
    let (mut scene, _cache, id_a, _) = two_rect_scene();

    // Original rotation: 0.
    let geo_before = scene.graph.geo_data().get(&id_a).unwrap().schema_transform;
    assert!((geo_before.rotation()).abs() < 0.01);

    // Mutate: rotate by π/4 radians (45°).
    let delta = std::f32::consts::FRAC_PI_4;
    {
        let node = scene.graph.get_node_mut(&id_a).unwrap();
        if let Node::Rectangle(n) = node {
            let tx = n.transform.x();
            let ty = n.transform.y();
            let current = n.transform.rotation();
            n.transform = math2::transform::AffineTransform::new(tx, ty, current + delta);
        }
        scene.graph.refresh_node_geo_data(&id_a);
    }

    let geo_after = scene.graph.geo_data().get(&id_a).unwrap().schema_transform;
    assert!(
        (geo_after.rotation() - delta).abs() < 0.01,
        "expected rotation≈{}, got {}",
        delta,
        geo_after.rotation()
    );
}

#[test]
fn translate_updates_hit_test() {
    let (mut scene, mut cache, id_a, _) = two_rect_scene();
    let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));

    // Before: rect_a at (10,10)→(90,90). Hit at (50,50) should find it.
    let ht = HitTester::with_graph(&cache, &scene.graph);
    assert_eq!(ht.hit_first_fast([50.0, 50.0]), Some(id_a));
    // Hit at (150,50) should miss.
    assert!(ht.hit_first_fast([150.0, 50.0]).is_none());

    // Translate rect_a by +100 in x.
    {
        let node = scene.graph.get_node_mut(&id_a).unwrap();
        if let Node::Rectangle(n) = node {
            n.transform.translate(100.0, 0.0);
        }
        scene.graph.refresh_node_geo_data(&id_a);
    }
    cache.update_geometry(&scene, &fonts);
    cache.update_layers(&scene);

    // After: rect_a at (110,10)→(190,90).
    let ht = HitTester::with_graph(&cache, &scene.graph);
    // Old position should miss.
    assert_ne!(ht.hit_first_fast([50.0, 50.0]), Some(id_a));
    // New position should hit.
    assert_eq!(ht.hit_first_fast([150.0, 50.0]), Some(id_a));
}
