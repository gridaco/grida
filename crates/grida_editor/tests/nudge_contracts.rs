//! Nudge conformance (`NUDGE-*`) — `docs/wg/canvas/nudge.md`.
//!
//! Headless: translate and resize nudge are interpreter entry points
//! over the editor. Named remainders (nudge.md's own deferred tails):
//! `NUDGE-2` burst framing (a dwell-closed gesture at the interaction
//! layer) and `NUDGE-4` in-flow reorder are pending; `NUDGE-5`'s
//! camera motion is engine view state — its binding-table half (the
//! arrow chain falls through to the pan command on an empty
//! selection) is asserted here, the camera itself in the shell.

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, Scene, Size};
use math2::transform::AffineTransform;

use grida_editor::document::{Mutation, WorkingCopy, polyline_network};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::interpret::Interpreter;
use grida_editor::keys::{self, Command, KeyCode, Mods, Platform};
use grida_editor::tool::vector_fragment;

/// Two top-level rectangles `[A, B]` (80×80 at x = 10 / 110).
fn rect_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    for (i, id) in ["A", "B"].iter().enumerate() {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(10.0 + i as f32 * 100.0, 10.0, 0.0);
        rect.size = Size {
            width: 80.0,
            height: 80.0,
        };
        let iid = graph.append_child(Node::Rectangle(rect), Parent::Root);
        graph.set_name(iid, id.to_string());
        id_map.insert(iid, id.to_string());
    }
    let scene = Scene {
        name: "nudge-tests".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// NUDGE-1 — exactness: a nudge of (+1, 0) moves the target by
/// exactly (+1, 0); repeated sub-unit nudges accumulate without
/// drift; each press records one entry and one undo restores it.
#[test]
fn nudge_1_translate_is_exact() {
    let mut editor = rect_editor();
    let mut interp = Interpreter::new();
    let ids = vec!["A".to_string()];
    let before = editor.node_position(&"A".to_string()).unwrap();
    interp.nudge(&mut editor, &ids, 1.0, 0.0);
    let after = editor.node_position(&"A".to_string()).unwrap();
    assert_eq!(after, (before.0 + 1.0, before.1));
    // Sub-unit nudges accumulate.
    let depth = editor.history_len();
    for _ in 0..10 {
        interp.nudge(&mut editor, &ids, 0.1, 0.0);
    }
    let accumulated = editor.node_position(&"A".to_string()).unwrap();
    assert!((accumulated.0 - (after.0 + 1.0)).abs() < 1e-4);
    // One entry per press (burst framing — NUDGE-2 — is a named
    // pending behavior; committed entries never merge, HISB-3).
    assert_eq!(editor.history_len(), depth + 10);
    // Undo restores exactly one step.
    assert!(editor.undo());
    let stepped_back = editor.node_position(&"A".to_string()).unwrap();
    assert!((stepped_back.0 - (accumulated.0 - 0.1)).abs() < 1e-4);
}

/// NUDGE-3 — resize nudge anchors the origin: position unchanged,
/// size grows by the delta, one entry for the whole selection; the
/// all-or-nothing gate declines the whole selection when any member
/// refuses (no size domain, or a degenerating delta).
#[test]
fn nudge_3_resize_nudge_is_origin_anchored_and_all_or_nothing() {
    let mut editor = rect_editor();
    let mut interp = Interpreter::new();
    let a = "A".to_string();
    let b = "B".to_string();
    let ids = vec![a.clone(), b.clone()];
    let pos_before = editor.node_position(&a).unwrap();
    let depth = editor.history_len();
    assert!(interp.resize_nudge(&mut editor, &ids, 1.0, 0.0));
    assert_eq!(editor.node_size(&a), Some((81.0, 80.0)));
    assert_eq!(editor.node_size(&b), Some((81.0, 80.0)));
    assert_eq!(editor.node_position(&a).unwrap(), pos_before);
    assert_eq!(editor.history_len(), depth + 1);
    // One undo restores every member (NUDGE-3 rides ALIGN-7's
    // one-entry shape).
    assert!(editor.undo());
    assert_eq!(editor.node_size(&a), Some((80.0, 80.0)));
    assert_eq!(editor.node_size(&b), Some((80.0, 80.0)));
    // A degenerating delta declines the whole selection.
    assert!(!interp.resize_nudge(&mut editor, &ids, -80.0, 0.0));
    assert_eq!(editor.node_size(&a), Some((80.0, 80.0)));
    // A member with no size domain (a vector node) declines the whole
    // selection — nothing resizes a subset.
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 2,
                fragment: Box::new(vector_fragment(
                    "V".to_string(),
                    "Vector",
                    [300.0, 10.0],
                    polyline_network(&[(0.0, 0.0), (40.0, 40.0)]),
                )),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    let mixed = vec![a.clone(), "V".to_string()];
    assert!(!interp.resize_nudge(&mut editor, &mixed, 1.0, 0.0));
    assert_eq!(editor.node_size(&a), Some((80.0, 80.0)));
}

/// NUDGE-5 (the binding half) — with an empty selection the arrow
/// chord's chain falls through from the (declining) selection nudge
/// to the fixed screen-space camera pan; the pan command records
/// nothing (camera motion is view state, asserted in the shell).
#[test]
fn nudge_5_arrow_chain_falls_through_to_camera_pan() {
    let p = Platform::current();
    let binding = keys::resolve(KeyCode::ArrowRight, Mods::default(), p).unwrap();
    assert_eq!(
        binding.chain,
        &[
            Command::NudgeSelection { dx: 1.0, dy: 0.0 },
            Command::PanCamera {
                dx: keys::PAN_STEP_PX,
                dy: 0.0
            },
        ][..]
    );
    // Shift applies the big-nudge factor to both members.
    let big = keys::resolve(
        KeyCode::ArrowRight,
        Mods {
            shift: true,
            ..Default::default()
        },
        p,
    )
    .unwrap();
    assert_eq!(
        big.chain,
        &[
            Command::NudgeSelection { dx: 10.0, dy: 0.0 },
            Command::PanCamera {
                dx: 10.0 * keys::PAN_STEP_PX,
                dy: 0.0
            },
        ][..]
    );
}
