//! Snap conformance — `docs/wg/canvas/snap.md` (`SNAP-1..11`): the
//! snap family (geometry on translate + resize moving edges, space,
//! pixel grid) as interpretation stages — the session freezes at
//! gesture start, the disable modifier is live, nudges are exact, and
//! the guide chrome is honest.
//!
//! Headless: a real editor over a working copy, a document-backed
//! scene, and hand-built intent streams — plus one real HUD drive for
//! `SNAP-1` (the machine emits raw deltas; only interpretation
//! corrects them).

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;
use math2::vector2::Axis;

use grida_editor::document::{Id, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::hud::{
    Hud, HudEvent, HudPrim, HudScene, Intent, Modifiers, Phase, PointerButton, ResizeDirection,
    Role, SelectionShape,
};
use grida_editor::interpret::{InterpretScene, Interpreter, SceneFacts, facts_for};
use grida_editor::snap::Guide;

// ── Fixture ──────────────────────────────────────────────────────────

/// Root-level rectangles at the given `(id, x, y, w, h)` frames.
fn fixture(nodes: &[(&str, f32, f32, f32, f32)]) -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map: HashMap<NodeId, Id> = HashMap::new();
    for (id, x, y, w, h) in nodes {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(*x, *y, 0.0);
        rect.size = Size {
            width: *w,
            height: *h,
        };
        let iid = graph.append_child(Node::Rectangle(rect), Parent::Root);
        id_map.insert(iid, id.to_string());
    }
    let scene = Scene {
        name: "snap".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// A (10,10) 80×80 with sibling S (200,10) 80×80 — dragging A right
/// by 107 leaves a 3-canvas-px gap to S's left edge, inside the
/// zoom-1 threshold (4.5).
fn ab() -> Editor {
    fixture(&[
        ("A", 10.0, 10.0, 80.0, 80.0),
        ("S", 200.0, 10.0, 80.0, 80.0),
    ])
}

/// Document-backed scene: root-level nodes, so world == position.
/// Answers the snap neighborhood as "every other root node".
struct DocScene {
    bounds: Vec<(Id, Rectangle)>,
}

impl DocScene {
    fn of(editor: &Editor) -> Self {
        let mut bounds = Vec::new();
        for id in editor.children(None) {
            if let (Some(pos), Some(size)) = (editor.node_position(&id), editor.node_size(&id)) {
                bounds.push((id, Rectangle::from_xywh(pos.0, pos.1, size.0, size.1)));
            }
        }
        Self { bounds }
    }
}

impl InterpretScene for DocScene {
    fn nodes_in_rect(&self, rect: &Rectangle) -> Vec<Id> {
        self.bounds
            .iter()
            .filter(|(_, b)| b.intersects(rect))
            .map(|(id, _)| id.clone())
            .collect()
    }
    fn world_bounds(&self, id: &Id) -> Option<Rectangle> {
        self.bounds.iter().find(|(i, _)| i == id).map(|(_, b)| *b)
    }
    fn snap_anchors(&self, moving: &[Id]) -> Vec<Rectangle> {
        self.bounds
            .iter()
            .filter(|(id, _)| !moving.contains(id))
            .map(|(_, b)| *b)
            .collect()
    }
}

impl HudScene for DocScene {
    fn pick(&self, p: [f32; 2]) -> Option<Id> {
        self.bounds
            .iter()
            .rev()
            .find(|(_, b)| b.contains_point(p))
            .map(|(id, _)| id.clone())
    }
    fn shape_of(&self, id: &Id) -> Option<SelectionShape> {
        self.world_bounds(id).map(SelectionShape::Rect)
    }
}

fn translate(ids: &[&str], dx: f32, dy: f32, phase: Phase) -> Intent {
    Intent::Translate {
        ids: ids.iter().map(|s| s.to_string()).collect(),
        dx,
        dy,
        axis_lock: None,
        pointer: [0.0, 0.0],
        clone: false,
        phase,
    }
}

fn resize(ids: &[&str], anchor: ResizeDirection, rect: Rectangle, phase: Phase) -> Intent {
    Intent::Resize {
        ids: ids.iter().map(|s| s.to_string()).collect(),
        anchor,
        shape: SelectionShape::Rect(rect),
        phase,
    }
}

/// Drive one intent: facts from the live document, host state
/// (`zoom`, disable modifier, guides) layered on top.
fn drive(
    interp: &mut Interpreter,
    editor: &mut Editor,
    intent: Intent,
    zoom: f32,
    disabled: bool,
    guides: &[Guide],
) {
    let mut facts: SceneFacts = facts_for(&intent, &DocScene::of(editor));
    facts.zoom = zoom;
    facts.snap_disabled = disabled;
    facts.snap_guides = guides.to_vec();
    interp.apply(editor, &intent, &facts);
}

fn pos(editor: &Editor, id: &str) -> (f32, f32) {
    editor.node_position(&id.to_string()).expect("has position")
}

// ── SNAP-1: snapping lives in interpretation only ────────────────────

// The HUD emits raw pointer deltas — the identical stream, replayed
// through interpreters with snapping on and off, lands on different
// values. No snap knowledge exists on the HUD side of the seam.
#[test]
fn snap_1_hud_emits_raw_deltas_interpretation_corrects() {
    let editor = ab();
    let scene = DocScene::of(&editor);
    let mut hud = Hud::new();
    let mut stream: Vec<Intent> = Vec::new();
    let m = Modifiers::default();
    stream.extend(
        hud.dispatch(
            HudEvent::PointerDown {
                screen: [50.0, 50.0],
                button: PointerButton::Primary,
                modifiers: m,
            },
            &scene,
            0,
        )
        .intents,
    );
    stream.extend(
        hud.dispatch(
            HudEvent::PointerMove {
                screen: [157.0, 50.0],
            },
            &scene,
            10,
        )
        .intents,
    );
    stream.extend(
        hud.dispatch(
            HudEvent::PointerUp {
                screen: [157.0, 50.0],
                button: PointerButton::Primary,
                modifiers: m,
            },
            &scene,
            20,
        )
        .intents,
    );

    let raw: Vec<(f32, f32)> = stream
        .iter()
        .filter_map(|i| match i {
            Intent::Translate { dx, dy, .. } => Some((*dx, *dy)),
            _ => None,
        })
        .collect();
    assert_eq!(
        raw,
        vec![(107.0, 0.0), (107.0, 0.0)],
        "the machine's deltas are the pointer's, uncorrected"
    );

    let replay = |snap_on: bool| -> (f32, f32) {
        let mut editor = ab();
        let mut interp = Interpreter::new();
        if !snap_on {
            interp.snap.geometry = false;
            interp.snap.pixel_grid = false;
        }
        for intent in &stream {
            drive(&mut interp, &mut editor, intent.clone(), 1.0, false, &[]);
        }
        pos(&editor, "A")
    };
    assert_eq!(replay(true), (120.0, 10.0), "snapped in interpretation");
    assert_eq!(replay(false), (117.0, 10.0), "raw with snapping off");
}

// ── SNAP-2: geometry snap within threshold, raw beyond ───────────────

#[test]
fn snap_2_translate_aligns_within_threshold() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (120.0, 10.0), "3 px gap: captured");
    assert_eq!(editor.history_len(), 1);

    let mut editor = ab();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 100.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (110.0, 10.0), "10 px gap: raw value");
}

#[test]
fn snap_2_translate_aligns_to_guides() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    let guides = [Guide {
        axis: Axis::X,
        offset: 300.0,
    }];
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 288.0, 0.0, Phase::Commit),
        1.0,
        false,
        &guides,
    );
    assert_eq!(
        pos(&editor, "A"),
        (300.0, 10.0),
        "left edge 2 px from the guide: captured onto it"
    );
}

// ── SNAP-3: the disable modifier is live, both directions ────────────

#[test]
fn snap_3_disable_modifier_is_live() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (120.0, 10.0), "engaged: snapped");
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Preview),
        1.0,
        true,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (117.0, 10.0), "held: raw, same gesture");
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (120.0, 10.0), "released: re-engaged");
    assert_eq!(editor.history_len(), 1);
}

// ── SNAP-4: quantization, anchored at gesture start ──────────────────

#[test]
fn snap_4_quantization_anchors_at_gesture_start() {
    let mut editor = fixture(&[("A", 10.4, 10.25, 80.0, 80.0)]);
    let mut interp = Interpreter::new();
    // First correction lands the fractional start on the lattice…
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 0.3, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (10.0, 10.0));
    // …and the rounding grid never drifts across previews: every
    // value is round(start + delta), not an accumulation.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 0.8, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (11.0, 10.0));
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 1.3, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (11.0, 10.0), "no per-preview drift");
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 1.7, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (12.0, 10.0), "commit is on the lattice");
}

#[test]
fn snap_4_nudge_commits_exact_integer_deltas() {
    let mut editor = fixture(&[("A", 10.4, 10.25, 80.0, 80.0)]);
    let mut interp = Interpreter::new();
    interp.nudge(&mut editor, &["A".to_string()], 1.0, 0.0);
    assert_eq!(
        pos(&editor, "A"),
        (11.4, 10.25),
        "the step is exact — a deliberate fractional offset survives"
    );
    interp.nudge(&mut editor, &["A".to_string()], 0.0, 10.0);
    assert_eq!(pos(&editor, "A"), (11.4, 20.25));
    // Each press is its own entry — committed entries never merge
    // (HISB-3). Burst framing (NUDGE-2: one entry per rapid burst,
    // via a dwell-closed gesture at the interaction layer) is
    // pending; until it lands, undo steps press by press.
    assert_eq!(editor.history_len(), 2, "one press, one entry");
    assert!(editor.undo());
    assert_eq!(pos(&editor, "A"), (11.4, 10.25));
    assert!(editor.undo());
    assert_eq!(pos(&editor, "A"), (10.4, 10.25));
}

// ── SNAP-5: panel-typed values commit verbatim ───────────────────────

// Quantization is a gesture-interpretation stage: a value dispatched
// directly (the properties panel's path) reaches the document
// untouched — no snap code lives in the editor core.
#[test]
fn snap_5_direct_values_commit_verbatim() {
    let mut editor = ab();
    let batch = vec![Mutation::Patch {
        id: "A".to_string(),
        set: Box::new(PropPatch {
            position: Some((10.37, 20.11)),
            ..Default::default()
        }),
    }];
    editor
        .dispatch(batch, Origin::Local, Recording::Record { label: None })
        .expect("applies");
    assert_eq!(pos(&editor, "A"), (10.37, 20.11));
}

// ── SNAP-6: a nudge is never geometry-snapped ────────────────────────

#[test]
fn snap_6_nudge_never_geometry_snapped() {
    // A's right edge sits 3 px from S — inside the drag threshold.
    let mut editor = fixture(&[
        ("A", 117.0, 10.0, 80.0, 80.0),
        ("S", 200.0, 10.0, 80.0, 80.0),
    ]);
    let mut interp = Interpreter::new();
    interp.nudge(&mut editor, &["A".to_string()], 1.0, 0.0);
    assert_eq!(
        pos(&editor, "A"),
        (118.0, 10.0),
        "exactly the step — the nearby edge never captures a nudge"
    );
}

// ── SNAP-7: the session freezes at gesture start ─────────────────────

#[test]
fn snap_7_session_is_frozen_at_gesture_start() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    // Open the gesture — anchors freeze from THIS event's facts.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 10.0, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    // Later facts lie: an anchor at x=150 that would capture the next
    // preview. The frozen session must ignore it…
    let intent = translate(&["A"], 57.0, 0.0, Phase::Preview);
    let mut facts = facts_for(&intent, &DocScene::of(&editor));
    facts.snap_anchors = vec![Rectangle::from_xywh(150.0, 10.0, 80.0, 80.0)];
    interp.apply(&mut editor, &intent, &facts);
    assert_eq!(
        pos(&editor, "A"),
        (67.0, 10.0),
        "an anchor introduced mid-gesture never captures"
    );
    // …and keep honoring the anchors captured at the start, even when
    // later facts no longer list them.
    let intent = translate(&["A"], 107.0, 0.0, Phase::Commit);
    let mut facts = facts_for(&intent, &DocScene::of(&editor));
    facts.snap_anchors = Vec::new();
    interp.apply(&mut editor, &intent, &facts);
    assert_eq!(
        pos(&editor, "A"),
        (120.0, 10.0),
        "the frozen anchor still captures"
    );
}

// ── SNAP-8: chrome honesty ───────────────────────────────────────────

#[test]
fn snap_8_chrome_marks_the_cause_and_only_the_cause() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    assert!(interp.snap_guides().is_empty(), "idle: no chrome");

    // Beyond threshold: no snap, no chrome.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 50.0, 200.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    assert!(
        interp.snap_guides().is_empty(),
        "nothing snapped: nothing paints"
    );

    // Within threshold: the vertical hairline runs through the
    // aligned edge (x = 200), spanning agent and anchor extents.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    let prims = interp.snap_guides();
    assert!(prims.contains(&HudPrim::Line {
        a: [200.0, 10.0],
        b: [200.0, 90.0],
        dashed: false,
        role: Role::Snap,
    }));
    assert!(
        prims.iter().any(|p| matches!(
            p,
            HudPrim::Point {
                anchor: [200.0, 10.0],
                role: Role::Snap
            }
        )),
        "exact hit points get crosshair markers"
    );

    // The disable modifier silences the correction AND its chrome.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Preview),
        1.0,
        true,
        &[],
    );
    assert!(interp.snap_guides().is_empty(), "disabled: no chrome");

    // Chrome dies with the gesture.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert!(interp.snap_guides().is_empty(), "vanishes with the gesture");
}

#[test]
fn snap_8_guide_hits_draw_rules() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    let guides = [Guide {
        axis: Axis::X,
        offset: 300.0,
    }];
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 288.0, 0.0, Phase::Preview),
        1.0,
        false,
        &guides,
    );
    assert!(interp.snap_guides().contains(&HudPrim::Rule {
        axis: Axis::X,
        offset: 300.0,
        role: Role::Snap,
    }));
}

// ── SNAP-9: threshold is a screen-space constant ─────────────────────

#[test]
fn snap_9_threshold_is_zoom_invariant_in_screen_space() {
    // The same 3-canvas-px gap: inside the zone at zoom 1 (4.5 canvas
    // px), far outside it at zoom 8 (0.5 canvas px).
    let run = |zoom: f32| -> (f32, f32) {
        let mut editor = ab();
        let mut interp = Interpreter::new();
        drive(
            &mut interp,
            &mut editor,
            translate(&["A"], 107.0, 0.0, Phase::Commit),
            zoom,
            false,
            &[],
        );
        pos(&editor, "A")
    };
    assert_eq!(run(1.0), (120.0, 10.0), "zoom 1: captured");
    assert_eq!(run(8.0), (117.0, 10.0), "zoom 8: the same gap reads far");
}

// ── Pipeline order: axis-lock precedes geometry snap ─────────────────

// A locked axis is frozen for the whole pipeline: geometry snap never
// pulls it toward an anchor, however close.
#[test]
fn snap_pipeline_axis_lock_precedes_geometry() {
    // S sits 3 px below A's bottom edge — a y-capture bait.
    let nodes = [("A", 10.0, 10.0, 80.0, 80.0), ("S", 10.0, 93.0, 80.0, 80.0)];

    // Unlocked: the bait works (y snaps to 13).
    let mut editor = fixture(&nodes);
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (40.0, 13.0));

    // Locked to x: y is untouchable.
    let mut editor = fixture(&nodes);
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        Intent::Translate {
            ids: vec!["A".to_string()],
            dx: 30.0,
            dy: 0.0,
            axis_lock: Some(Axis::X),
            pointer: [0.0, 0.0],
            clone: false,
            phase: Phase::Commit,
        },
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (40.0, 10.0), "the frozen axis stays put");
}

// ── The toggles: each stage gates independently ──────────────────────

#[test]
fn snap_toggles_gate_each_stage() {
    // Geometry off: the near edge no longer captures; pixel grid
    // still rounds.
    let mut editor = ab();
    let mut interp = Interpreter::new();
    interp.snap.geometry = false;
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.3, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (117.0, 10.0));

    // Pixel grid off: fractional values survive; geometry still
    // captures.
    let mut editor = ab();
    let mut interp = Interpreter::new();
    interp.snap.pixel_grid = false;
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 20.3, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (30.3, 10.0), "verbatim fractional delta");

    // Both off: the pipeline is the identity.
    let mut editor = ab();
    let mut interp = Interpreter::new();
    interp.snap.geometry = false;
    interp.snap.pixel_grid = false;
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 107.3, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (117.3, 10.0));
}

// ── SNAP-11: space snap (equal-gap distribution) ─────────────────────

/// R1/R2 in a row with a 40-gap: [200,280] and [320,400] on x, both
/// at y 10..90.
fn run_fixture(agent: (&str, f32, f32, f32, f32)) -> Editor {
    fixture(&[
        agent,
        ("R1", 200.0, 10.0, 80.0, 80.0),
        ("R2", 320.0, 10.0, 80.0, 80.0),
    ])
}

#[test]
fn snap_11_space_extends_a_uniform_run() {
    // Leading flank: A dragged past R2, its left edge 3 px short of
    // the equal-spacing slot at 440 (= R2.max + gap).
    let mut editor = run_fixture(("A", 10.0, 10.0, 80.0, 80.0));
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 427.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (440.0, 10.0), "gap extension captures");

    // Trailing flank: A dragged before R1, its right edge 3 px short
    // of the slot ending at 160 (= R1.min − gap).
    let mut editor = run_fixture(("A", 10.0, 10.0, 80.0, 80.0));
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 67.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (80.0, 10.0), "both flanks project");
}

#[test]
fn snap_11_center_fit_inside_a_wider_gap() {
    // A 20-wide agent centered in the 40-gap sits at x = 290; drag it
    // to 288 (within threshold), vertically overlapping the run.
    let mut editor = run_fixture(("A", 10.0, 200.0, 20.0, 20.0));
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 278.0, -170.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!((pos(&editor, "A").0), 290.0, "centered fit captures");
}

#[test]
fn snap_11_only_direction_aligned_anchors_project() {
    // The same drag, but far below the run: no counter-axis overlap,
    // so the equal-spacing slot at 440 must NOT capture.
    let mut editor = run_fixture(("A", 10.0, 300.0, 80.0, 80.0));
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 427.0, 0.0, Phase::Commit),
        1.0,
        false,
        &[],
    );
    assert_eq!(
        pos(&editor, "A"),
        (437.0, 300.0),
        "misaligned anchors never project spacing candidates"
    );
}

#[test]
fn snap_8_space_chrome_labels_the_gap() {
    let mut editor = run_fixture(("A", 10.0, 10.0, 80.0, 80.0));
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 427.0, 0.0, Phase::Preview),
        1.0,
        false,
        &[],
    );
    let prims = interp.snap_guides();
    // The new equal gap: R2.max (400) → the landed edge (440), on the
    // run's midline, labelled with the spacing value.
    assert!(prims.contains(&HudPrim::Line {
        a: [400.0, 50.0],
        b: [440.0, 50.0],
        dashed: false,
        role: Role::Snap,
    }));
    // The pair gap it extends: R1.max (280) → R2.min (320).
    assert!(prims.contains(&HudPrim::Line {
        a: [280.0, 50.0],
        b: [320.0, 50.0],
        dashed: false,
        role: Role::Snap,
    }));
    assert!(
        prims
            .iter()
            .any(|p| matches!(p, HudPrim::Pill { text, role: Role::Snap, .. } if text == "40")),
        "gap labels carry the shared spacing value"
    );
}

// ── SNAP-10: resize snaps moving edges only ──────────────────────────

#[test]
fn snap_10_resize_snaps_the_moving_edge() {
    // E-drag: the right edge lands 3 px short of S's left edge.
    let mut editor = ab();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(10.0, 10.0, 187.0, 80.0),
            Phase::Commit,
        ),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (10.0, 10.0), "the anchored edge holds");
    assert_eq!(
        editor.node_size(&"A".to_string()),
        Some((190.0, 80.0)),
        "the moving edge lands on the alignment; the size absorbs it"
    );

    // Beyond threshold: the raw value.
    let mut editor = ab();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(10.0, 10.0, 180.0, 80.0),
            Phase::Commit,
        ),
        1.0,
        false,
        &[],
    );
    assert_eq!(editor.node_size(&"A".to_string()), Some((180.0, 80.0)));
}

#[test]
fn snap_10_axis_without_a_moving_edge_is_never_corrected() {
    // An N-drag with an x-bait: S's left edge sits 3 px from A's
    // right edge, but the handle moves nothing on x.
    let mut editor = fixture(&[
        ("A", 10.0, 10.0, 80.0, 80.0),
        ("S", 93.0, 300.0, 80.0, 80.0),
    ]);
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::N,
            Rectangle::from_xywh(10.0, 7.0, 80.0, 83.0),
            Phase::Commit,
        ),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (10.0, 7.0), "x untouched, y raw");
    assert_eq!(editor.node_size(&"A".to_string()), Some((80.0, 83.0)));
}

#[test]
fn snap_10_center_resize_holds_the_center() {
    // Alt-E: both edges moved symmetrically; the moving edge is 3 px
    // short of S at 97 — the correction must land it there while the
    // center (50) holds.
    let mut editor = fixture(&[("A", 10.0, 10.0, 80.0, 80.0), ("S", 97.0, 10.0, 80.0, 80.0)]);
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(6.0, 10.0, 88.0, 80.0),
            Phase::Commit,
        ),
        1.0,
        false,
        &[],
    );
    assert_eq!(pos(&editor, "A"), (3.0, 10.0));
    assert_eq!(
        editor.node_size(&"A".to_string()),
        Some((94.0, 80.0)),
        "symmetric correction: the moving edge lands, the center holds"
    );
}

#[test]
fn snap_10_resize_aligns_to_guides() {
    let mut editor = fixture(&[("A", 10.0, 10.0, 80.0, 80.0)]);
    let mut interp = Interpreter::new();
    let guides = [Guide {
        axis: Axis::X,
        offset: 250.0,
    }];
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(10.0, 10.0, 238.0, 80.0),
            Phase::Commit,
        ),
        1.0,
        false,
        &guides,
    );
    assert_eq!(editor.node_size(&"A".to_string()), Some((240.0, 80.0)));
}

#[test]
fn snap_10_resize_chrome_is_rules_and_disable_is_live() {
    let mut editor = ab();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(10.0, 10.0, 187.0, 80.0),
            Phase::Preview,
        ),
        1.0,
        false,
        &[],
    );
    assert!(interp.snap_guides().contains(&HudPrim::Rule {
        axis: Axis::X,
        offset: 200.0,
        role: Role::Snap,
    }));
    // The disable modifier silences the correction and the chrome,
    // mid-gesture (SNAP-3 covers resize too).
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(10.0, 10.0, 187.0, 80.0),
            Phase::Commit,
        ),
        1.0,
        true,
        &[],
    );
    assert!(interp.snap_guides().is_empty());
    assert_eq!(editor.node_size(&"A".to_string()), Some((187.0, 80.0)));
}

// SNAP-4 (resize clause): the moving corner quantizes; the anchored
// edge is not a gesture-produced value and never rounds.
#[test]
fn snap_4_resize_quantizes_the_moving_corner_only() {
    let mut editor = fixture(&[("A", 10.4, 10.0, 80.0, 80.0)]);
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        resize(
            &["A"],
            ResizeDirection::E,
            Rectangle::from_xywh(10.4, 10.0, 84.8, 80.0),
            Phase::Commit,
        ),
        1.0,
        false,
        &[],
    );
    let (x, _) = pos(&editor, "A");
    let (w, _) = editor.node_size(&"A".to_string()).unwrap();
    assert!((x - 10.4).abs() < 1e-4, "the anchored edge never rounds");
    assert!(
        ((x + w) - 95.0).abs() < 1e-4,
        "the moving edge lands on the lattice"
    );
}
