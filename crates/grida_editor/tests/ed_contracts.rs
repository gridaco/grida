//! `ED-*` conformance tests for `crates/grida_editor/docs/editor.md`.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene};
use grida_editor::document::{Fragment, Id, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;

fn opacity_patch(id: &str, opacity: f32) -> Vec<Mutation> {
    vec![Mutation::Patch {
        id: id.to_string(),
        set: Box::new(PropPatch {
            opacity: Some(opacity),
            ..Default::default()
        }),
    }]
}

fn editor_with_rects(n: usize) -> Editor {
    let factory = NodeFactory::new();
    let mut wc = WorkingCopy::new_empty("test");
    let batch: Vec<Mutation> = (0..n)
        .map(|i| Mutation::Insert {
            parent: None,
            index: i,
            fragment: Box::new(Fragment {
                id: format!("r{i}"),
                name: None,
                node: Node::Rectangle(factory.create_rectangle_node()),
                children: vec![],
            }),
        })
        .collect();
    wc.apply(&batch).unwrap();
    Editor::new(wc)
}

/// Build the same scene deterministically: two rectangles under the
/// scene root, with explicit internal→stable id mapping.
fn make_scene() -> (Scene, HashMap<NodeId, Id>) {
    let factory = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let a = graph.append_child(
        Node::Rectangle(factory.create_rectangle_node()),
        Parent::Root,
    );
    let b = graph.append_child(
        Node::Rectangle(factory.create_rectangle_node()),
        Parent::Root,
    );
    graph.set_name(a, "alpha".to_string());
    graph.set_name(b, "beta".to_string());
    let scene = Scene {
        name: "fixture".to_string(),
        graph,
        background_color: None,
    };
    let id_map = HashMap::from([(a, "alpha".to_string()), (b, "beta".to_string())]);
    (scene, id_map)
}

// ---------------------------------------------------------------------------
// ED-1 — dispatch is atomic: observers see consistent state
// ---------------------------------------------------------------------------

#[test]
fn ed_1_observer_sees_consistent_post_dispatch_state() {
    let mut editor = editor_with_rects(1);

    type Seen = Rc<RefCell<Vec<(Option<f32>, usize)>>>;
    let seen: Seen = Rc::new(RefCell::new(Vec::new()));
    let sink = Rc::clone(&seen);
    editor.observe(Box::new(move |editor, _summary| {
        sink.borrow_mut()
            .push((editor.node_opacity(&"r0".to_string()), editor.history_len()));
    }));

    editor
        .dispatch(
            opacity_patch("r0", 0.5),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    assert_eq!(
        seen.borrow().as_slice(),
        &[(Some(0.5), 1)],
        "ED-1: during notification the document holds the post-dispatch \
         value and the history entry is already recorded"
    );
}

// ---------------------------------------------------------------------------
// ED-3 — origins honored end-to-end
// ---------------------------------------------------------------------------

#[test]
fn ed_3_remote_never_records_local_record_exactly_one() {
    let mut editor = editor_with_rects(2);

    editor
        .dispatch(
            opacity_patch("r0", 0.5),
            Origin::Remote,
            Recording::Record { label: None },
        )
        .unwrap();
    editor
        .dispatch(
            opacity_patch("r0", 0.4),
            Origin::Agent,
            Recording::Record { label: None },
        )
        .unwrap();
    assert_eq!(
        editor.history_len(),
        0,
        "ED-3: remote/agent origins never produce a local entry, even with Record"
    );

    editor
        .dispatch(
            opacity_patch("r1", 0.5),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    assert_eq!(
        editor.history_len(),
        1,
        "ED-3: a local record dispatch produces exactly one"
    );

    editor
        .dispatch(opacity_patch("r1", 0.25), Origin::Local, Recording::Silent)
        .unwrap();
    assert_eq!(
        editor.history_len(),
        1,
        "silent local dispatches do not record"
    );
}

// ---------------------------------------------------------------------------
// ED-5 — queries are pure
// ---------------------------------------------------------------------------

#[test]
fn ed_5_queries_are_pure() {
    let mut editor = editor_with_rects(3);
    editor
        .dispatch(
            opacity_patch("r1", 0.5),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    let notifications = Rc::new(RefCell::new(0usize));
    let sink = Rc::clone(&notifications);
    editor.observe(Box::new(move |_, _| *sink.borrow_mut() += 1));

    let first = (
        editor.node_opacity(&"r1".to_string()),
        editor.children(None),
        editor.selection().to_vec(),
        editor.history_len(),
    );
    let second = (
        editor.node_opacity(&"r1".to_string()),
        editor.children(None),
        editor.selection().to_vec(),
        editor.history_len(),
    );
    assert_eq!(
        first, second,
        "ED-5: repeated queries between dispatches are identical"
    );
    assert_eq!(
        *notifications.borrow(),
        0,
        "ED-5: queries fire no notifications"
    );
}

// ---------------------------------------------------------------------------
// ED-6 — no state leaks across loads
// ---------------------------------------------------------------------------

#[test]
fn ed_6_load_twice_yields_equal_working_copies() {
    let mut editor = Editor::new(WorkingCopy::new_empty("boot"));

    let (scene, id_map) = make_scene();
    editor.load(scene, id_map);

    // Edit + record, then reload the same document.
    editor
        .dispatch(
            opacity_patch("alpha", 0.5),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    editor.set_selection(vec!["alpha".to_string()]);

    let (scene, id_map) = make_scene();
    editor.load(scene, id_map);

    let mut fresh = Editor::new(WorkingCopy::new_empty("boot"));
    let (scene, id_map) = make_scene();
    fresh.load(scene, id_map);

    assert!(
        editor.document().structure_eq(fresh.document()),
        "ED-6: loading the same document again equals the first load"
    );
    assert_eq!(editor.history_len(), 0, "ED-6: history reset on load");
    assert!(
        editor.selection().is_empty(),
        "ED-6: selection reset on load"
    );
    assert_eq!(editor.node_opacity(&"alpha".to_string()), Some(1.0));
}

// ---------------------------------------------------------------------------
// ED-7 — selection integrity
// ---------------------------------------------------------------------------

/// ED-7 — the selection only ever holds ids that exist in the
/// document: unknown ids are dropped on entry, and a batch that
/// removes selected nodes (here a remote-origin sync removal) prunes
/// them in the same dispatch, so a selection-driven batch built
/// immediately after can never be rejected for a stale id.
#[test]
fn ed_7_selection_integrity() {
    let mut editor = editor_with_rects(2);

    // Unknown ids are dropped on entry.
    editor.set_selection(vec![
        "r0".to_string(),
        "r1".to_string(),
        "ghost".to_string(),
    ]);
    assert_eq!(editor.selection(), &["r0".to_string(), "r1".to_string()]);

    // A remote removal (the sync path — no local history) prunes the
    // removed id from the selection in the same dispatch.
    editor
        .dispatch(
            vec![Mutation::Remove {
                id: "r0".to_string(),
            }],
            Origin::Remote,
            Recording::Silent,
        )
        .expect("remote remove applies");
    assert_eq!(editor.selection(), &["r1".to_string()]);

    // A selection-driven delete built now applies cleanly.
    let batch: Vec<Mutation> = editor
        .selection()
        .iter()
        .map(|id| Mutation::Remove { id: id.clone() })
        .collect();
    editor
        .dispatch(batch, Origin::Local, Recording::Record { label: None })
        .expect("ED-7: no stale id can poison a selection-driven batch");
    assert!(editor.selection().is_empty());
    assert!(editor.children(None).is_empty());
}

// ---------------------------------------------------------------------------
// ED-8 — damage ledger completeness (frame.md's editor-side half)
// ---------------------------------------------------------------------------

#[test]
fn ed_8_damage_ledger_completeness() {
    let mut editor = editor_with_rects(2);
    assert!(
        editor.take_damage().is_empty(),
        "a fresh editor has no damage"
    );

    // A recorded property patch accrues property damage.
    editor
        .dispatch(
            opacity_patch("r0", 0.5),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    let damage = editor.take_damage();
    assert!(!damage.structural);
    assert_eq!(damage.nodes.len(), 1, "the touched node is in the ledger");
    assert!(
        editor.take_damage().is_empty(),
        "draining empties the ledger (exactly-once)"
    );

    // A silent preview accrues damage like a recorded edit.
    editor
        .dispatch(opacity_patch("r0", 0.25), Origin::Local, Recording::Silent)
        .unwrap();
    assert!(!editor.take_damage().is_empty(), "silent previews accrue");

    // A gesture abort's rollback accrues damage.
    editor.begin_gesture();
    editor
        .dispatch(opacity_patch("r0", 0.9), Origin::Local, Recording::Silent)
        .unwrap();
    editor.take_damage();
    editor.abort_gesture();
    assert!(
        !editor.take_damage().is_empty(),
        "the abort rollback accrues damage"
    );

    // Undo and redo accrue damage.
    assert!(editor.undo());
    assert!(!editor.take_damage().is_empty(), "undo accrues");
    assert!(editor.redo());
    assert!(!editor.take_damage().is_empty(), "redo accrues");

    // A remote-origin structural batch accrues structural damage.
    editor
        .dispatch(
            vec![Mutation::Remove {
                id: "r1".to_string(),
            }],
            Origin::Remote,
            Recording::Silent,
        )
        .unwrap();
    let damage = editor.take_damage();
    assert!(damage.structural, "a remove is structural damage");

    // Loading a document accrues structural damage.
    let (scene, id_map) = make_scene();
    editor.load(scene, id_map);
    assert!(editor.take_damage().structural, "a load is structural");
}

/// ED-6 — minting is deterministic across loads. Loading with an empty
/// id_map mints stable ids (n1, n2, … in document order) for every
/// node; two loads of the same graph must mint identically, or ids leak
/// across loads. The complete-map test above never mints anything.
#[test]
fn ed_6_minting_is_deterministic_across_loads() {
    let mut first = Editor::new(WorkingCopy::new_empty("mint"));
    let (scene_a, _) = make_scene();
    first.load(scene_a, HashMap::new());

    let mut second = Editor::new(WorkingCopy::new_empty("mint"));
    let (scene_b, _) = make_scene();
    second.load(scene_b, HashMap::new());

    let ids_first = first.children(None);
    assert!(!ids_first.is_empty(), "minting produced ids");
    assert_eq!(
        ids_first,
        second.children(None),
        "ED-6: two loads of the same graph mint identical ids"
    );
}
