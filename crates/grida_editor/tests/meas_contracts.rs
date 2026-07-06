//! Measurement readout conformance — `docs/wg/canvas/measurement.md`
//! (`MEAS-*`).
//!
//! Headless and engine-free: the readout is a pure function of
//! (modifier, idle, subject bounds) — `measurement::readout` — and
//! its chrome a pure function of the result. The idle conjunct and
//! the read-only guarantee are driven through a real HUD machine
//! with a mock scene; assertions are on the readout decision, the
//! measured distances, the prim list, and the hit registry.

use grida_editor::hud::{
    Hud, HudEvent, HudPrim, HudScene, Id, Intent, Modifiers, PointerButton, Role, SelectionShape,
};
use grida_editor::measurement;
use math2::rect::Rectangle;

fn r(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle::from_xywh(x, y, w, h)
}

// ── Fixture: two disjoint rects, as in the hud suite ─────────────────

struct MockScene {
    nodes: Vec<(Id, Rectangle)>,
}

impl MockScene {
    fn ab() -> Self {
        Self {
            nodes: vec![
                ("A".into(), r(10.0, 10.0, 80.0, 80.0)),
                ("B".into(), r(200.0, 10.0, 80.0, 80.0)),
            ],
        }
    }
    fn bounds(&self, id: &str) -> Rectangle {
        self.nodes.iter().find(|(n, _)| n == id).unwrap().1
    }
}

impl HudScene for MockScene {
    fn pick(&self, p: [f32; 2]) -> Option<Id> {
        self.nodes
            .iter()
            .rev()
            .find(|(_, r)| r.contains_point(p))
            .map(|(id, _)| id.clone())
    }
    fn shape_of(&self, id: &Id) -> Option<SelectionShape> {
        self.nodes
            .iter()
            .find(|(n, _)| n == id)
            .map(|(_, r)| SelectionShape::Rect(*r))
    }
}

fn down(p: [f32; 2]) -> HudEvent {
    HudEvent::PointerDown {
        screen: p,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn mv(p: [f32; 2]) -> HudEvent {
    HudEvent::PointerMove { screen: p }
}

fn up(p: [f32; 2]) -> HudEvent {
    HudEvent::PointerUp {
        screen: p,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn solid_lines(prims: &[HudPrim]) -> usize {
    prims
        .iter()
        .filter(|p| matches!(p, HudPrim::Line { dashed: false, .. }))
        .count()
}

fn dashed_lines(prims: &[HudPrim]) -> usize {
    prims
        .iter()
        .filter(|p| matches!(p, HudPrim::Line { dashed: true, .. }))
        .count()
}

fn pills(prims: &[HudPrim]) -> Vec<&str> {
    prims
        .iter()
        .filter_map(|p| match p {
            HudPrim::Pill { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect()
}

// ── MEAS-1: the trigger truth-table ──────────────────────────────────

// The readout exists exactly when modifier ∧ idle ∧ selection ∧
// target ∧ a ≠ b; the function is pure, so recomputing with any
// conjunct dropped dismisses within the same dispatched event.
#[test]
fn meas_1_readout_requires_every_conjunct() {
    let a = Some(r(0.0, 0.0, 10.0, 10.0));
    let b = Some(r(30.0, 0.0, 10.0, 10.0));
    assert!(measurement::readout(true, true, a, b).is_some());

    assert!(
        measurement::readout(false, true, a, b).is_none(),
        "modifier released"
    );
    assert!(
        measurement::readout(true, false, a, b).is_none(),
        "gesture active (not idle)"
    );
    assert!(
        measurement::readout(true, true, None, b).is_none(),
        "selection empty"
    );
    assert!(
        measurement::readout(true, true, a, None).is_none(),
        "no hover target"
    );
    assert!(measurement::readout(true, true, a, a).is_none(), "a = b");
}

// The idle conjunct through a real HUD: mid-translate the machine is
// not idle, so the readout is gone the same event the drag promotes;
// pointer-up restores it. (A pending, un-promoted press is idle — no
// gesture is active.)
#[test]
fn meas_1_gesture_dismisses_and_restores() {
    let scene = MockScene::ab();
    let mut hud = Hud::new();
    hud.set_selection(&["A".into()]);
    let _ = hud.chrome(&scene);
    let a = Some(scene.bounds("A"));
    let b = Some(scene.bounds("B"));

    let readout_now = |hud: &Hud| measurement::readout(true, !hud.gesture_active(), a, b);
    assert!(readout_now(&hud).is_some(), "idle: readout present");

    // Press on A's body (pending, still idle), then promote past the
    // drag threshold into a translate gesture.
    let _ = hud.dispatch(down([50.0, 50.0]), &scene, 0);
    assert!(readout_now(&hud).is_some(), "pending press is still idle");
    let _ = hud.dispatch(mv([60.0, 60.0]), &scene, 10);
    assert!(hud.gesture_active());
    assert!(readout_now(&hud).is_none(), "mid-gesture: dismissed");

    let _ = hud.dispatch(up([60.0, 60.0]), &scene, 20);
    assert!(readout_now(&hud).is_some(), "idle again: restored");
}

// ── MEAS-2: read-only, no hit regions ────────────────────────────────

// Measurement prims ride the draw list only — appending them cannot
// touch the hit registry, so a point on a spacing line hits nothing
// before and after.
#[test]
fn meas_2_extras_never_hit() {
    let scene = MockScene::ab();
    let mut hud = Hud::new();
    hud.set_selection(&["A".into()]);
    let mut draw = hud.chrome(&scene);

    // The A→B spacing line runs along y = 50 between x 90 and 200;
    // (150, 50) sits on it, outside every chrome region.
    let on_line = [150.0, 50.0];
    assert!(hud.hit_test(on_line).is_none());

    let m = measurement::readout(true, true, Some(scene.bounds("A")), Some(scene.bounds("B")))
        .expect("readout");
    let extras = measurement::chrome(&m);
    assert!(solid_lines(&extras) > 0, "non-vacuous: lines exist");
    draw.prims.extend(extras);

    assert!(
        hud.hit_test(on_line).is_none(),
        "extras are draw-only; the registry is untouched"
    );
}

// Holding the modifier while idle changes nothing the HUD owns:
// identical event streams with and without the alt flip produce the
// same hover, cursor, and intent stream.
#[test]
fn meas_2_modifier_changes_nothing_while_idle() {
    let scene = MockScene::ab();
    let run = |with_alt: bool| -> (Option<Id>, Vec<Intent>) {
        let mut hud = Hud::new();
        hud.set_selection(&["A".into()]);
        let _ = hud.chrome(&scene);
        let mut intents = Vec::new();
        let mut push = |r: grida_editor::hud::HudResponse| intents.extend(r.intents);
        push(hud.dispatch(mv([240.0, 50.0]), &scene, 0));
        if with_alt {
            push(hud.dispatch(
                HudEvent::ModifiersChanged {
                    modifiers: Modifiers {
                        alt: true,
                        ..Default::default()
                    },
                },
                &scene,
                5,
            ));
        }
        push(hud.dispatch(mv([250.0, 60.0]), &scene, 10));
        (hud.hover().cloned(), intents)
    };
    assert_eq!(run(false), run(true));
}

// ── MEAS-3: distance correctness across the three relations ─────────
//
// All values are canvas units: neither `readout` nor `chrome` takes a
// camera, so zoom-invariance holds by construction.

#[test]
fn meas_3_disjoint_gaps_from_a() {
    // B below-right of A: box = A, gaps toward B.
    let a = r(0.0, 0.0, 10.0, 10.0);
    let b = r(30.0, 40.0, 10.0, 10.0);
    let m = measurement::readout(true, true, Some(a), Some(b)).unwrap();
    assert_eq!(m.box_rect, a);
    assert_eq!(m.distance, [0.0, 20.0, 30.0, 0.0]);
}

#[test]
fn meas_3_intersecting_reaches_extremities() {
    // Overlapping corner: box = the intersection; distances reach the
    // pair's outer extremities.
    let a = r(0.0, 0.0, 20.0, 20.0);
    let b = r(10.0, 10.0, 20.0, 20.0);
    let m = measurement::readout(true, true, Some(a), Some(b)).unwrap();
    assert_eq!(m.box_rect, r(10.0, 10.0, 10.0, 10.0));
    assert_eq!(m.distance, [10.0, 10.0, 10.0, 10.0]);
}

#[test]
fn meas_3_contained_insets() {
    // A inside B: box = the inner rect, distances = the insets — the
    // padding readout.
    let a = r(10.0, 20.0, 30.0, 40.0);
    let b = r(0.0, 0.0, 100.0, 100.0);
    let m = measurement::readout(true, true, Some(a), Some(b)).unwrap();
    assert_eq!(m.box_rect, a);
    assert_eq!(m.distance, [20.0, 60.0, 40.0, 10.0]);
}

// ── MEAS-4: zero omission ────────────────────────────────────────────

#[test]
fn meas_4_zero_sides_draw_nothing() {
    // One-axis gap: exactly one spacing line, one label.
    let a = r(0.0, 0.0, 10.0, 10.0);
    let below = r(0.0, 30.0, 10.0, 10.0);
    let m = measurement::readout(true, true, Some(a), Some(below)).unwrap();
    let prims = measurement::chrome(&m);
    assert_eq!(solid_lines(&prims), 1);
    assert_eq!(pills(&prims), vec!["20"]);

    // Flush neighbors: all four distances zero — outlines only.
    let flush = r(10.0, 0.0, 10.0, 10.0);
    let m = measurement::readout(true, true, Some(a), Some(flush)).unwrap();
    let prims = measurement::chrome(&m);
    assert_eq!(solid_lines(&prims), 0);
    assert_eq!(dashed_lines(&prims), 0);
    assert!(pills(&prims).is_empty());
    assert_eq!(prims.len(), 2, "the two subject outlines remain");
}

// The auxiliary line: drawn only when a spacing line's far end misses
// B's edge, dashed, projecting onto it.
#[test]
fn meas_4_auxiliary_projects_to_offset_target() {
    // B offset diagonally: the right spacing line ends at (30, 5),
    // off B's y-range — one dashed projection down to B's top edge.
    let a = r(0.0, 0.0, 10.0, 10.0);
    let b = r(30.0, 40.0, 10.0, 10.0);
    let m = measurement::readout(true, true, Some(a), Some(b)).unwrap();
    let prims = measurement::chrome(&m);
    assert!(prims.contains(&HudPrim::Line {
        a: [30.0, 5.0],
        b: [30.0, 40.0],
        dashed: true,
        role: Role::Measurement,
    }));

    // B aligned with A's midline: the spacing line lands on B's edge —
    // no auxiliary.
    let aligned = r(30.0, 0.0, 10.0, 10.0);
    let m = measurement::readout(true, true, Some(a), Some(aligned)).unwrap();
    assert_eq!(dashed_lines(&measurement::chrome(&m)), 0);
}

// ── MEAS-5: liveness ─────────────────────────────────────────────────

// The readout is stateless: it always describes the current
// (selection, hover) pair, never a previous one.
#[test]
fn meas_5_readout_tracks_current_pair() {
    let a = r(0.0, 0.0, 10.0, 10.0);
    let b1 = r(30.0, 0.0, 10.0, 10.0);
    let b2 = r(0.0, 50.0, 10.0, 10.0);

    let m1 = measurement::readout(true, true, Some(a), Some(b1)).unwrap();
    assert_eq!(m1.b, b1);
    assert_eq!(m1.distance, [0.0, 20.0, 0.0, 0.0]);

    let m2 = measurement::readout(true, true, Some(a), Some(b2)).unwrap();
    assert_eq!(m2.b, b2);
    assert_eq!(m2.distance, [0.0, 0.0, 40.0, 0.0]);
}

// ── MEAS-6: determinism (refines SURF-5) ─────────────────────────────

#[test]
fn meas_6_chrome_is_pure() {
    let a = Some(r(0.0, 0.0, 20.0, 20.0));
    let b = Some(r(50.0, 35.0, 10.0, 10.0));
    let m1 = measurement::readout(true, true, a, b).unwrap();
    let m2 = measurement::readout(true, true, a, b).unwrap();
    assert_eq!(m1, m2);
    assert_eq!(measurement::chrome(&m1), measurement::chrome(&m2));
}

// Labels format like every chrome pill: one decimal, integer-clean.
#[test]
fn meas_labels_are_one_decimal() {
    let a = r(0.0, 0.0, 10.0, 10.0);
    let b = r(30.25, 0.0, 10.0, 10.0);
    let m = measurement::readout(true, true, Some(a), Some(b)).unwrap();
    assert_eq!(pills(&measurement::chrome(&m)), vec!["20.3"]);
}
