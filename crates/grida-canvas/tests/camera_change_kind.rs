//! Tests for CameraChangeKind classification through the full Renderer
//! queue/flush cycle.
//!
//! These reproduce real gesture sequences: pan, pinch-zoom, cmd+scroll zoom,
//! and transitions between them. Each test calls the same methods the app
//! layer calls (camera.translate, camera.set_zoom, camera.set_zoom_at,
//! renderer.queue_unstable, renderer.flush) so that any state-management
//! bugs surface here, not only in manual testing with a trackpad.

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::{Camera2D, CameraChangeKind};
use cg::runtime::scene::{Backend, FrameFlushResult, FrameFlushStats, Renderer};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn create_grid() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    for y in 0..10u32 {
        for x in 0..10u32 {
            let mut rect = nf.create_rectangle_node();
            rect.transform =
                math2::transform::AffineTransform::new(x as f32 * 30.0, y as f32 * 30.0, 0.0);
            rect.size = Size {
                width: 20.0,
                height: 20.0,
            };
            rect.set_fill(Paint::Solid(SolidPaint::RED));
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }
    Scene {
        name: "grid".into(),
        graph,
        background_color: None,
    }
}

fn make_renderer() -> Renderer {
    let mut r = Renderer::new(
        Backend::new_from_raster(200, 200),
        None,
        Camera2D::new(Size {
            width: 200.0,
            height: 200.0,
        }),
    );
    r.load_scene(create_grid());
    // load_scene queues a stable frame; flush it so we start clean.
    let _ = r.flush();
    r
}

/// Queue an unstable frame and flush, returning the stats.
/// This mirrors the app's: camera.mutate() → queue_unstable() → flush() →
/// consume_change(). The consume is the app's responsibility (not the
/// renderer's) so we do it here to match real behavior.
fn queue_flush(r: &mut Renderer) -> FrameFlushStats {
    r.queue_unstable();
    let result = match r.flush() {
        FrameFlushResult::OK(s) => s,
        other => panic!(
            "expected OK, got {:?}",
            match other {
                FrameFlushResult::NoPending => "NoPending",
                FrameFlushResult::NoFrame => "NoFrame",
                FrameFlushResult::NoScene => "NoScene",
                _ => "OK",
            }
        ),
    };
    r.camera.consume_change();
    result
}

fn cam_label(kind: CameraChangeKind) -> &'static str {
    match kind {
        CameraChangeKind::None => "none",
        CameraChangeKind::PanOnly => "pan",
        CameraChangeKind::ZoomIn => "zoom-in",
        CameraChangeKind::ZoomOut => "zoom-out",
        CameraChangeKind::PanAndZoom(true) => "pan+zoom-in",
        CameraChangeKind::PanAndZoom(false) => "pan+zoom-out",
    }
}

/// Simulate what the app's command(Pan) does: divide by zoom, translate, queue.
fn app_pan(r: &mut Renderer, tx: f32, ty: f32) {
    let zoom = r.camera.get_zoom();
    r.camera.translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
    r.queue_unstable();
}

/// Simulate what the app's command(ZoomDelta) does: multiply zoom, set_zoom_at.
fn app_zoom_delta(r: &mut Renderer, delta: f32, cursor: [f32; 2]) {
    let current_zoom = r.camera.get_zoom();
    let zoom_factor = 1.0 + delta;
    if zoom_factor.is_finite() && zoom_factor > 0.0 {
        r.camera.set_zoom_at(current_zoom * zoom_factor, cursor);
    }
    r.queue_unstable();
}

/// Simulate the app's redraw() → flush() → consume_change().
fn app_redraw(r: &mut Renderer) -> Option<FrameFlushStats> {
    match r.flush() {
        FrameFlushResult::OK(s) => {
            r.camera.consume_change();
            Some(s)
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn pan_only_reports_pan() {
    let mut r = make_renderer();
    r.camera.translate(5.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::PanOnly);
}

#[test]
fn set_zoom_reports_zoom_in() {
    let mut r = make_renderer();
    r.camera.set_zoom(2.0);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::ZoomIn);
}

#[test]
fn set_zoom_reports_zoom_out() {
    let mut r = make_renderer();
    r.camera.set_zoom(0.5);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::ZoomOut);
}

#[test]
fn set_zoom_at_center_reports_zoom_not_pan() {
    // Zooming at viewport center produces no translation shift.
    let mut r = make_renderer();
    r.camera.set_zoom_at(2.0, [100.0, 100.0]);
    let s = queue_flush(&mut r);
    assert!(
        !s.frame.camera_change.pan_changed(),
        "zoom at center should NOT report pan, got: {}",
        cam_label(s.frame.camera_change)
    );
    assert!(s.frame.camera_change.zoom_changed());
}

#[test]
fn set_zoom_at_off_center_reports_pan_and_zoom() {
    // Zooming off-center adjusts translation to keep the focal point fixed.
    let mut r = make_renderer();
    r.camera.set_zoom_at(2.0, [150.0, 150.0]);
    let s = queue_flush(&mut r);
    assert!(
        matches!(s.frame.camera_change, CameraChangeKind::PanAndZoom(_)),
        "zoom at off-center should be PanAndZoom, got: {:?}",
        s.frame.camera_change
    );
}

// --- Transition sequences ---

#[test]
fn pan_then_zoom_then_pan() {
    // User reports: "pan → zoom-in → pan shows pan" — correct.
    let mut r = make_renderer();

    r.camera.translate(5.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::PanOnly, "step 1: pan");

    r.camera.set_zoom(2.0);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::ZoomIn, "step 2: zoom-in");

    r.camera.translate(5.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::PanOnly, "step 3: pan after zoom");
}

#[test]
fn zoom_in_zoom_out_then_pan() {
    // User reports: "zoom in+out → stuck at pan+zoom when panning"
    let mut r = make_renderer();

    r.camera.set_zoom(2.0);
    let s = queue_flush(&mut r);
    assert!(s.frame.camera_change.zoom_changed(), "step 1: zoom-in");

    r.camera.set_zoom(0.5);
    let s = queue_flush(&mut r);
    assert!(s.frame.camera_change.zoom_changed(), "step 2: zoom-out");

    r.camera.translate(5.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::PanOnly,
        "step 3: pan after zoom-in+out should be PanOnly, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn pinch_zoom_in_out_then_pan() {
    // Pinch zoom (set_zoom_at) in+out then pan.
    // set_zoom_at off-center produces PanAndZoom. After gesture ends,
    // pure pan must report PanOnly.
    let mut r = make_renderer();

    r.camera.set_zoom_at(2.0, [150.0, 150.0]);
    let s = queue_flush(&mut r);
    assert!(matches!(s.frame.camera_change, CameraChangeKind::PanAndZoom(_)), "step 1: pinch-in, got: {:?}", s.frame.camera_change);

    r.camera.set_zoom_at(0.5, [150.0, 150.0]);
    let s = queue_flush(&mut r);
    assert!(s.frame.camera_change.zoom_changed(), "step 2: pinch-out");

    r.camera.translate(5.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::PanOnly,
        "step 3: pan after pinch in+out should be PanOnly, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn rapid_pinch_oscillation_then_pan() {
    // Rapid pinch in/out for 20 frames, then pure pan.
    let mut r = make_renderer();

    for i in 0..20 {
        let z = if i % 2 == 0 { 1.5 } else { 0.8 };
        r.camera.set_zoom_at(z, [120.0, 120.0]);
        let _ = queue_flush(&mut r);
    }

    r.camera.translate(10.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::PanOnly,
        "pan after rapid pinch oscillation should be PanOnly, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn no_change_after_flush_reports_none() {
    // After flush, queuing again without mutation should produce None.
    // (In practice, the app wouldn't queue without a mutation, but this
    // verifies consume_change works.)
    let mut r = make_renderer();

    r.camera.translate(5.0, 0.0);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::PanOnly);

    // Queue again without any camera change.
    let s = queue_flush(&mut r);
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::None,
        "no mutation after flush should be None, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn steady_after_zoom_reports_none() {
    // User reports: "when steady after zoom, shows zoom-out instead of none"
    let mut r = make_renderer();

    r.camera.set_zoom(0.5);
    let s = queue_flush(&mut r);
    assert_eq!(s.frame.camera_change, CameraChangeKind::ZoomOut);

    // Steady — queue again without mutation.
    let s = queue_flush(&mut r);
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::None,
        "steady after zoom should be None, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn steady_after_pinch_reports_none() {
    // Steady after pinch gesture.
    let mut r = make_renderer();

    r.camera.set_zoom_at(2.0, [150.0, 150.0]);
    let s = queue_flush(&mut r);
    assert!(s.frame.camera_change.zoom_changed());

    // Steady — queue again without mutation.
    let s = queue_flush(&mut r);
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::None,
        "steady after pinch should be None, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn cmd_scroll_zoom_out_reports_zoom_out() {
    // Cmd+scroll uses set_zoom (no focal point), should report ZoomOut.
    let mut r = make_renderer();

    // Simulate multiple cmd+scroll zoom-out steps
    for _ in 0..5 {
        let z = r.camera.get_zoom();
        r.camera.set_zoom(z * (1.0 - 0.01)); // zoom_factor slightly < 1
        let s = queue_flush(&mut r);
        assert_eq!(
            s.frame.camera_change,
            CameraChangeKind::ZoomOut,
            "cmd+scroll zoom-out should be ZoomOut, got: {}",
            cam_label(s.frame.camera_change)
        );
    }
}

#[test]
fn pinch_zoom_out_reports_zoom_changed() {
    // Pinch zoom-out uses set_zoom_at. Off-center: PanAndZoom is correct
    // because focal-point compensation IS a translation. At center: ZoomOut.
    let mut r = make_renderer();

    // Off-center pinch zoom-out
    r.camera.set_zoom_at(0.5, [150.0, 150.0]);
    let s = queue_flush(&mut r);
    assert!(
        s.frame.camera_change.zoom_changed(),
        "pinch zoom-out should have zoom_changed, got: {}",
        cam_label(s.frame.camera_change)
    );
    // Note: PanAndZoom is correct here — the translation shift is real.
}

#[test]
fn multiple_queue_without_flush_uses_last() {
    // If queue_unstable is called multiple times before flush, the last
    // plan wins. This simulates multiple events between redraws.
    let mut r = make_renderer();

    r.camera.translate(5.0, 0.0);
    r.queue_unstable(); // plan 1: PanOnly

    r.camera.set_zoom(2.0);
    r.queue_unstable(); // plan 2: ZoomIn (overwrites plan 1)

    let s = match r.flush() {
        FrameFlushResult::OK(s) => s,
        _ => panic!("expected OK"),
    };
    r.camera.consume_change();
    assert!(
        s.frame.camera_change.zoom_changed(),
        "last queue wins: should show zoom, got: {}",
        cam_label(s.frame.camera_change)
    );
}

// ---------------------------------------------------------------------------
// App-level simulation tests (exact app command flow)
// ---------------------------------------------------------------------------

#[test]
fn app_pan_only_never_zoom() {
    // "if pan only, and never zoom, all works perfectly fine"
    let mut r = make_renderer();

    for _ in 0..10 {
        app_pan(&mut r, 4.0, 2.0);
        let s = app_redraw(&mut r).expect("should render");
        assert_eq!(
            s.frame.camera_change,
            CameraChangeKind::PanOnly,
            "pure pan should always be PanOnly, got: {}",
            cam_label(s.frame.camera_change)
        );
    }
}

#[test]
fn app_steady_after_zoom_shows_none() {
    // "when steady, instead of `none` we see `zoom-out`"
    let mut r = make_renderer();
    let cursor = [100.0, 100.0];

    // Zoom out
    app_zoom_delta(&mut r, -0.01, cursor);
    let s = app_redraw(&mut r).expect("should render");
    assert!(s.frame.camera_change.zoom_changed(),
        "zoom frame should show zoom, got: {}", cam_label(s.frame.camera_change));

    // Steady: no mutation, but queue+flush again
    r.queue_unstable();
    let s = app_redraw(&mut r).expect("should render");
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::None,
        "steady after zoom should be None, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn app_zoom_out_via_pinch_classification() {
    // "when zoom out, we almost always see pan+zoom"
    // Pinch zoom uses set_zoom_at which adjusts translation for focal point.
    // At center: no translation → ZoomOut. Off-center: PanAndZoom.
    let mut r = make_renderer();

    // Pinch at center
    app_zoom_delta(&mut r, -0.01, [100.0, 100.0]);
    let s = app_redraw(&mut r).expect("should render");
    assert_eq!(s.frame.camera_change, CameraChangeKind::ZoomOut,
        "pinch at center should be ZoomOut, got: {}", cam_label(s.frame.camera_change));

    // Pinch at off-center (typical real-world)
    app_zoom_delta(&mut r, -0.01, [150.0, 150.0]);
    let s = app_redraw(&mut r).expect("should render");
    // PanAndZoom is CORRECT here — the focal-point translation is real.
    assert!(matches!(s.frame.camera_change, CameraChangeKind::PanAndZoom(_)),
        "pinch at off-center should be PanAndZoom, got: {}", cam_label(s.frame.camera_change));
}

#[test]
fn app_pinch_zoom_in_out_then_pan() {
    // "when we did both zoom in and out, it stucks at pan+zoom, and never hits pan"
    let mut r = make_renderer();
    let cursor = [120.0, 120.0];

    // Simulate 10 pinch-in events
    for _ in 0..10 {
        app_zoom_delta(&mut r, 0.01, cursor);
        let _ = app_redraw(&mut r);
    }

    // Simulate 10 pinch-out events
    for _ in 0..10 {
        app_zoom_delta(&mut r, -0.01, cursor);
        let _ = app_redraw(&mut r);
    }

    // Now pure pan
    for i in 0..5 {
        app_pan(&mut r, 4.0, 0.0);
        let s = app_redraw(&mut r).expect("should render");
        assert_eq!(
            s.frame.camera_change,
            CameraChangeKind::PanOnly,
            "pan frame {} after pinch in+out should be PanOnly, got: {}",
            i, cam_label(s.frame.camera_change)
        );
    }
}

#[test]
fn app_cmd_scroll_zoom_then_settle() {
    // "when zoom (in or out) via cmd+scroll, it will at least settle, to zoom-out"
    // cmd+scroll uses set_zoom (no focal point) → ZoomIn/ZoomOut (no pan component)
    let mut r = make_renderer();

    // Simulate cmd+scroll zoom out (set_zoom directly, not set_zoom_at)
    for _ in 0..5 {
        let z = r.camera.get_zoom();
        r.camera.set_zoom(z * 0.99);
        r.queue_unstable();
        let s = app_redraw(&mut r).expect("should render");
        assert_eq!(s.frame.camera_change, CameraChangeKind::ZoomOut,
            "cmd+scroll zoom-out should be ZoomOut, got: {}", cam_label(s.frame.camera_change));
    }
}

#[test]
fn app_pinch_never_settles_repro() {
    // "when zoom via pinch, it never settles, always showing pan+zoom"
    // After pinch ends, the next redraw without mutation should show None.
    let mut r = make_renderer();
    let cursor = [120.0, 120.0];

    // Pinch zoom (multiple events)
    for _ in 0..5 {
        app_zoom_delta(&mut r, 0.02, cursor);
        let _ = app_redraw(&mut r);
    }

    // Gesture ends. Simulate "idle" redraw.
    r.queue_unstable();
    let s = app_redraw(&mut r).expect("should render");
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::None,
        "after pinch gesture ends, idle frame should be None, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn app_first_pan_after_zoom_shows_pan_not_zoom() {
    // "show zoom-out on first frame, when even not zooming out (first frame when panning)"
    let mut r = make_renderer();
    let cursor = [120.0, 120.0];

    // Zoom out via pinch
    for _ in 0..5 {
        app_zoom_delta(&mut r, -0.02, cursor);
        let _ = app_redraw(&mut r);
    }

    // First pan after zoom
    app_pan(&mut r, 4.0, 0.0);
    let s = app_redraw(&mut r).expect("should render");
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::PanOnly,
        "first pan after zoom should be PanOnly, got: {}",
        cam_label(s.frame.camera_change)
    );
}

#[test]
fn app_float_drift_after_many_pinch_zoom_at() {
    // Reproduces the exact bug from debug.log: after many set_zoom_at calls,
    // the sin/cos extraction accumulates floating-point drift so that
    // has_zoom_changed() falsely returns true on subsequent pan-only frames.
    //
    // The sequence: zoom-out (many steps) → zoom-in (many steps) → pan.
    // The pan frames must report PanOnly, not PanAndZoom.
    let mut r = make_renderer();

    // Phase 1: pinch zoom out (20 steps, like lines 117-154 in debug.log)
    for _ in 0..20 {
        app_zoom_delta(&mut r, -0.02, [120.0, 80.0]);
        let _ = app_redraw(&mut r);
    }

    // Phase 2: pinch zoom in (30 steps, like lines 155-212)
    for _ in 0..30 {
        app_zoom_delta(&mut r, 0.015, [120.0, 80.0]);
        let _ = app_redraw(&mut r);
    }

    // Phase 3: pan only (like lines 213+ where zoom=constant but was PanAndZoom)
    for i in 0..20 {
        app_pan(&mut r, 4.0, 2.0);
        let s = app_redraw(&mut r).expect("should render");
        assert_eq!(
            s.frame.camera_change,
            CameraChangeKind::PanOnly,
            "pan frame {} after 50 pinch-zoom steps must be PanOnly (float drift bug), got: {}",
            i,
            cam_label(s.frame.camera_change)
        );
    }
}

// ---------------------------------------------------------------------------
// Original unit-level tests
// ---------------------------------------------------------------------------

#[test]
fn interleaved_pinch_and_scroll_events() {
    // Simulates macOS sending PinchGesture + MouseWheel in the same
    // frame, each triggering queue_unstable.
    let mut r = make_renderer();

    // Pinch event
    r.camera.set_zoom_at(1.5, [120.0, 120.0]);
    r.queue_unstable();

    // Scroll event in same frame
    r.camera.translate(5.0, 0.0);
    r.queue_unstable(); // overwrites the plan

    let s = match r.flush() {
        FrameFlushResult::OK(s) => s,
        _ => panic!("expected OK"),
    };
    r.camera.consume_change();
    // translate's before_change saved the post-zoom state; the delta is
    // only the translation. So the last plan should be PanOnly.
    assert_eq!(
        s.frame.camera_change,
        CameraChangeKind::PanOnly,
        "last event was translate → PanOnly, got: {}",
        cam_label(s.frame.camera_change)
    );
}
