//! Intent interpretation conformance — `crates/grida_editor/docs/hud.md`
//! `HUD-7`: interpretation is one host module, replay is
//! deterministic, and refusals live here without the HUD knowing.
//!
//! Headless: a real editor over a working copy, a document-backed
//! [`InterpretScene`], and hand-built intent streams (the machine's
//! own emission is pinned by `hud_contracts.rs`).

use std::f32::consts::FRAC_PI_2;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use grida_editor::document::{Id, WorkingCopy};
use grida_editor::editor::Editor;
use grida_editor::hud::{Intent, Phase, ResizeDirection, SelectMode, SelectionShape};
use grida_editor::interpret::{InterpretScene, Interpreter, SceneFacts, facts_for};

use std::collections::HashMap;

// ── Fixture ──────────────────────────────────────────────────────────

/// rect A (10,10) 80×80, rect B (200,10) 80×80, container K (400,10)
/// 100×100 — K is outside the rotation patch domain (the refusal
/// target).
fn fixture() -> Editor {
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
    let mut container = nf.create_container_node();
    container.position =
        grida::node::schema::LayoutPositioningBasis::Cartesian(grida::cg::types::CGPoint {
            x: 400.0,
            y: 10.0,
        });
    container.layout_dimensions.layout_target_width = Some(100.0);
    container.layout_dimensions.layout_target_height = Some(100.0);

    let mut graph = SceneGraph::new();
    let a = graph.append_child(Node::Rectangle(rect_a), Parent::Root);
    let b = graph.append_child(Node::Rectangle(rect_b), Parent::Root);
    let k = graph.append_child(Node::Container(container), Parent::Root);
    let id_map: HashMap<NodeId, Id> = HashMap::from([
        (a, "A".to_string()),
        (b, "B".to_string()),
        (k, "K".to_string()),
    ]);
    let scene = Scene {
        name: "interpret".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// Document-backed scene: root-level nodes, so world == position.
struct DocScene {
    bounds: HashMap<Id, Rectangle>,
}

impl DocScene {
    fn of(editor: &Editor) -> Self {
        let mut bounds = HashMap::new();
        for id in editor.children(None) {
            if let (Some(pos), Some(size)) = (editor.node_position(&id), editor.node_size(&id)) {
                bounds.insert(id, Rectangle::from_xywh(pos.0, pos.1, size.0, size.1));
            }
        }
        Self { bounds }
    }
}

impl InterpretScene for DocScene {
    fn nodes_in_rect(&self, rect: &Rectangle) -> Vec<Id> {
        let mut ids: Vec<Id> = self
            .bounds
            .iter()
            .filter(|(_, b)| b.intersects(rect))
            .map(|(id, _)| id.clone())
            .collect();
        ids.sort();
        ids
    }
    fn world_bounds(&self, id: &Id) -> Option<Rectangle> {
        self.bounds.get(id).copied()
    }
}

/// Drive one intent through facts → apply.
fn apply(interp: &mut Interpreter, editor: &mut Editor, intent: Intent) {
    let facts = {
        let scene = DocScene::of(editor);
        facts_for(&intent, &scene)
    };
    interp.apply(editor, &intent, &facts);
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

// ── Translate ────────────────────────────────────────────────────────

// HUD-2 → HISB-2: previews ride one gesture frame; the commit is one
// endpoint-minimal history entry; undo restores the baseline.
#[test]
fn translate_stream_is_one_history_entry() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();

    apply(
        &mut interp,
        &mut editor,
        translate(&["A"], 10.0, 5.0, Phase::Preview),
    );
    assert_eq!(editor.node_position(&"A".to_string()), Some((20.0, 15.0)));
    apply(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 20.0, Phase::Preview),
    );
    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((40.0, 30.0)),
        "cumulative deltas apply from the baseline — drift-free"
    );
    apply(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 20.0, Phase::Commit),
    );
    assert_eq!(editor.history_len(), 1, "SURF-2: one entry per gesture");

    assert!(editor.undo());
    assert_eq!(editor.node_position(&"A".to_string()), Some((10.0, 10.0)));
}

// HISB-4: cancel aborts the frame — the document restores, nothing
// records.
#[test]
fn translate_cancel_restores_and_records_nothing() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    apply(
        &mut interp,
        &mut editor,
        translate(&["A"], 25.0, 0.0, Phase::Preview),
    );
    apply(&mut interp, &mut editor, Intent::Cancel);
    assert_eq!(editor.node_position(&"A".to_string()), Some((10.0, 10.0)));
    assert_eq!(editor.history_len(), 0);
}

// ── Selection + marquee ──────────────────────────────────────────────

// The marquee intent carries the rect; resolution is the host's, and
// additive unions against the selection captured when the marquee
// began. Cancel restores it.
#[test]
fn marquee_resolves_additively_and_cancel_restores() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["B".to_string()]);

    let sweep_a = Intent::Marquee {
        rect: Rectangle::from_xywh(0.0, 0.0, 150.0, 100.0),
        additive: true,
        phase: Phase::Preview,
    };
    apply(&mut interp, &mut editor, sweep_a);
    let mut sel = editor.selection().to_vec();
    sel.sort();
    assert_eq!(sel, vec!["A".to_string(), "B".to_string()]);

    apply(&mut interp, &mut editor, Intent::Cancel);
    assert_eq!(editor.selection(), &["B".to_string()], "cancel restores");
}

#[test]
fn select_toggle_adds_and_removes() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    let toggle_b = Intent::Select {
        ids: vec!["B".to_string()],
        mode: SelectMode::Toggle,
    };
    apply(&mut interp, &mut editor, toggle_b.clone());
    assert_eq!(editor.selection(), &["B".to_string()]);
    apply(&mut interp, &mut editor, toggle_b);
    assert!(editor.selection().is_empty());
}

// ── Rotation: the HUD-7 showcase ─────────────────────────────────────

// The intent carries a bare angle. The interpretation — recompose the
// rotation patch domain AND compensate the position so the node spins
// about its visual center (the document's rotation pivots at the
// transform origin) — happens here, once.
#[test]
fn hud_7_rotate_recomposes_and_holds_the_center() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();

    apply(
        &mut interp,
        &mut editor,
        Intent::Rotate {
            ids: vec!["A".to_string()],
            angle: FRAC_PI_2,
            phase: Phase::Commit,
        },
    );

    let rotation = editor.node_rotation(&"A".to_string()).expect("in domain");
    assert!((rotation - FRAC_PI_2).abs() < 1e-4);
    // A 90° spin of the 80×80 rect about its center (50,50) moves the
    // transform origin to (90,10).
    let (x, y) = editor
        .node_position(&"A".to_string())
        .expect("has position");
    assert!((x - 90.0).abs() < 1e-3 && (y - 10.0).abs() < 1e-3);
    assert_eq!(editor.history_len(), 1);
}

// The refusal lives in the interpreter, once: a kind outside the
// rotation patch domain (Container) is skipped; the rect beside it
// still rotates; the HUD needed no knowledge of any of this.
#[test]
fn hud_7_rotate_refuses_kinds_outside_the_domain() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();

    apply(
        &mut interp,
        &mut editor,
        Intent::Rotate {
            ids: vec!["A".to_string(), "K".to_string()],
            angle: FRAC_PI_2,
            phase: Phase::Commit,
        },
    );

    assert!(
        editor.node_rotation(&"K".to_string()).is_none(),
        "the container stays outside the domain"
    );
    assert_eq!(
        editor.node_position(&"K".to_string()),
        Some((400.0, 10.0)),
        "refused: untouched, not half-applied"
    );
    let rotation = editor.node_rotation(&"A".to_string()).expect("in domain");
    assert!((rotation - FRAC_PI_2).abs() < 1e-4, "A still rotates");
}

// A rotation-only refusal edge: rotating ONLY refused kinds records
// no history entry (the gesture frame closes empty).
#[test]
fn rotate_of_only_refused_kinds_records_nothing() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    apply(
        &mut interp,
        &mut editor,
        Intent::Rotate {
            ids: vec!["K".to_string()],
            angle: FRAC_PI_2,
            phase: Phase::Commit,
        },
    );
    assert_eq!(editor.history_len(), 0);
}

// ── Resize ───────────────────────────────────────────────────────────

// Single node: the union IS the node — exact size + position mapping,
// one history entry.
#[test]
fn resize_single_node_maps_exactly() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    apply(
        &mut interp,
        &mut editor,
        Intent::Resize {
            ids: vec!["A".to_string()],
            anchor: ResizeDirection::SE,
            shape: SelectionShape::Rect(Rectangle::from_xywh(10.0, 10.0, 100.0, 90.0)),
            phase: Phase::Commit,
        },
    );
    assert_eq!(editor.node_size(&"A".to_string()), Some((100.0, 90.0)));
    assert_eq!(editor.node_position(&"A".to_string()), Some((10.0, 10.0)));
    assert_eq!(editor.history_len(), 1);
}

// Multi: members map through the linear union-to-union transform.
#[test]
fn resize_multi_scales_members_through_the_union() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    // Union of A+B is (10,10) 270×80; double it, NW-anchored.
    apply(
        &mut interp,
        &mut editor,
        Intent::Resize {
            ids: vec!["A".to_string(), "B".to_string()],
            anchor: ResizeDirection::SE,
            shape: SelectionShape::Rect(Rectangle::from_xywh(10.0, 10.0, 540.0, 160.0)),
            phase: Phase::Commit,
        },
    );
    assert_eq!(editor.node_size(&"A".to_string()), Some((160.0, 160.0)));
    assert_eq!(editor.node_position(&"A".to_string()), Some((10.0, 10.0)));
    assert_eq!(editor.node_size(&"B".to_string()), Some((160.0, 160.0)));
    assert_eq!(
        editor.node_position(&"B".to_string()),
        Some((390.0, 10.0)),
        "B's offset inside the union scales with it"
    );
}

// ── Replay determinism (HUD-7) ───────────────────────────────────────

// The same intent stream with the same facts produces the same
// document.
#[test]
fn hud_7_replay_is_deterministic() {
    let stream = |editor: &mut Editor| {
        let mut interp = Interpreter::new();
        apply(
            &mut interp,
            editor,
            translate(&["A"], 7.0, 3.0, Phase::Preview),
        );
        apply(
            &mut interp,
            editor,
            translate(&["A"], 12.0, 9.0, Phase::Commit),
        );
        apply(
            &mut interp,
            editor,
            Intent::Rotate {
                ids: vec!["A".to_string()],
                angle: 0.5,
                phase: Phase::Commit,
            },
        );
    };
    let mut one = fixture();
    let mut two = fixture();
    stream(&mut one);
    stream(&mut two);
    assert_eq!(
        one.node_position(&"A".to_string()),
        two.node_position(&"A".to_string())
    );
    assert_eq!(
        one.node_rotation(&"A".to_string()),
        two.node_rotation(&"A".to_string())
    );
    assert_eq!(one.history_len(), two.history_len());
}

// facts_for gathers exactly what an intent needs.
#[test]
fn facts_gathering_matches_intent_needs() {
    let editor = fixture();
    let scene = DocScene::of(&editor);

    let facts: SceneFacts = facts_for(
        &Intent::Marquee {
            rect: Rectangle::from_xywh(0.0, 0.0, 500.0, 200.0),
            additive: false,
            phase: Phase::Preview,
        },
        &scene,
    );
    assert_eq!(
        facts.marquee_hits.as_deref(),
        Some(&["A".to_string(), "B".to_string(), "K".to_string()][..])
    );

    let facts = facts_for(&translate(&["A"], 1.0, 1.0, Phase::Preview), &scene);
    assert!(facts.world_bounds.contains_key("A"));
}

// ── Resize refusal (HUD-7): an all-refused resize records nothing ────────

/// When every selected member is refused (here: a rotated rect, outside
/// the linear-union resize domain), the gesture opens but must not leave
/// an empty history entry. Verifies `commit_gesture`'s empty-redo guard
/// covers the resize path (HISB-2: *at most* one entry, none when empty).
#[test]
fn resize_all_refused_records_no_entry() {
    let nf = NodeFactory::new();
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 10.0, FRAC_PI_2); // rotated → refused
    rect.size = Size {
        width: 80.0,
        height: 80.0,
    };
    let mut graph = SceneGraph::new();
    let a = graph.append_child(Node::Rectangle(rect), Parent::Root);
    let id_map: HashMap<NodeId, Id> = HashMap::from([(a, "A".to_string())]);
    let scene = Scene {
        name: "resize".to_string(),
        background_color: None,
        graph,
    };
    let mut editor = Editor::new(WorkingCopy::from_scene(scene, id_map));
    let mut interp = Interpreter::new();

    let before = editor.history_len();
    apply(
        &mut interp,
        &mut editor,
        Intent::Resize {
            ids: vec!["A".to_string()],
            anchor: ResizeDirection::SE,
            shape: SelectionShape::Rect(Rectangle::from_xywh(10.0, 10.0, 120.0, 120.0)),
            phase: Phase::Commit,
        },
    );
    assert_eq!(
        editor.history_len(),
        before,
        "an all-refused resize must record no history entry"
    );
}
