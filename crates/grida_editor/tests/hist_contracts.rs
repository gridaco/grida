//! `HISB-*` conformance tests for `crates/grida_editor/docs/history.md`.
//!
//! The history module is pure (no `grida` imports), so most contracts
//! are exercised with a toy batch type (`Vec<i32>`). Round-trip
//! (`HISB-1`), gesture framing (`HISB-2`), origin isolation (`HISB-5`),
//! and tolerant application (`HISB-9`) are additionally proven
//! end-to-end through the `Editor`.

use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::{Context, Entry, History, Origin};

fn entry(label: Option<&str>, redo: Vec<i32>, undo: Vec<i32>, after_sel: &str) -> Entry<Vec<i32>> {
    Entry {
        redo,
        undo,
        context: (
            Context::default(),
            Context {
                selection: vec![after_sel.to_string()],
                scene: None,
            },
        ),
        origin: Origin::Local,
        label: label.map(str::to_string),
    }
}

fn opacity_patch(id: &str, opacity: f32) -> Vec<Mutation> {
    vec![Mutation::Patch {
        id: id.to_string(),
        set: PropPatch {
            opacity: Some(opacity),
            ..Default::default()
        },
    }]
}

/// An editor whose document has `n` root-level rectangles `r0..`.
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

// ---------------------------------------------------------------------------
// HISB-2 — one interaction, one entry (end-to-end via Editor)
// ---------------------------------------------------------------------------

#[test]
fn hisb_2_gesture_yields_one_entry() {
    let mut editor = editor_with_rects(1);
    let r0 = "r0".to_string();
    assert_eq!(editor.node_opacity(&r0), Some(1.0));

    editor.begin_gesture();
    for preview in [0.9, 0.7, 0.4, 0.2] {
        editor
            .dispatch(
                opacity_patch("r0", preview),
                Origin::Local,
                Recording::Silent,
            )
            .unwrap();
    }
    editor.commit_gesture(Some("patch:opacity".to_string()));

    assert_eq!(
        editor.history_len(),
        1,
        "HISB-2: N previews + commit = one entry"
    );
    assert_eq!(editor.node_opacity(&r0), Some(0.2));

    assert!(editor.undo());
    assert_eq!(
        editor.node_opacity(&r0),
        Some(1.0),
        "HISB-2: one undo restores the pre-drag value"
    );
}

// ---------------------------------------------------------------------------
// HISB-1 — undo/redo round-trip restores document and context
// ---------------------------------------------------------------------------

#[test]
fn hisb_1_round_trip_restores_document_and_context() {
    let mut editor = editor_with_rects(2);
    let r0 = "r0".to_string();
    let r1 = "r1".to_string();

    // Authoring context at record time: r0 selected.
    editor.set_selection(vec![r0.clone()]);
    editor
        .dispatch(
            opacity_patch("r1", 0.5),
            Origin::Local,
            Recording::Record {
                label: Some("opacity".to_string()),
            },
        )
        .unwrap();

    // The user then moves on: different selection.
    editor.set_selection(vec![r1.clone()]);

    assert!(editor.undo());
    assert_eq!(
        editor.node_opacity(&r1),
        Some(1.0),
        "HISB-1: undo restores the document value"
    );
    assert_eq!(
        editor.selection(),
        std::slice::from_ref(&r0),
        "HISB-1: undo restores the before-context selection"
    );

    assert!(editor.redo());
    assert_eq!(
        editor.node_opacity(&r1),
        Some(0.5),
        "HISB-1: redo restores the document value"
    );
    assert_eq!(
        editor.selection(),
        &[r0],
        "HISB-1: redo restores the after-context selection"
    );
}

// ---------------------------------------------------------------------------
// HISB-3 — committed entries are immutable: the stack never merges (pure)
// ---------------------------------------------------------------------------

#[test]
fn hisb_3_committed_entries_never_merge() {
    let mut history: History<Vec<i32>> = History::new(64);

    // Rapid same-label records — the shape the old bucket coalescing
    // would have merged. Each stays its own entry.
    history.record(entry(Some("translate"), vec![2], vec![1], "a"));
    history.record(entry(Some("translate"), vec![3], vec![2], "b"));
    history.record(entry(Some("translate"), vec![4], vec![3], "c"));

    assert_eq!(
        history.len(),
        3,
        "HISB-3: K same-label commits = K entries, regardless of timing"
    );

    // Each undo reverts exactly one interaction, newest first.
    assert_eq!(history.undo().unwrap().undo, vec![3]);
    assert_eq!(history.undo().unwrap().undo, vec![2]);
    assert_eq!(history.undo().unwrap().undo, vec![1]);
}

#[test]
fn hisb_3_labels_have_no_stack_semantics() {
    let mut history: History<Vec<i32>> = History::new(64);

    // Mixed labels, `None` labels — all irrelevant to the stack shape.
    history.record(entry(Some("k"), vec![1], vec![0], "a"));
    history.record(entry(Some("other"), vec![2], vec![1], "b"));
    history.record(entry(None, vec![3], vec![2], "c"));
    history.record(entry(None, vec![4], vec![3], "d"));
    history.record(entry(Some("k"), vec![5], vec![4], "e"));

    assert_eq!(history.len(), 5, "one record, one entry — always");
}

// ---------------------------------------------------------------------------
// HISB-3 (end-to-end) — two same-label gestures are two undo steps
// ---------------------------------------------------------------------------

#[test]
fn hisb_3_two_gestures_are_two_steps() {
    let mut editor = editor_with_rects(2);
    let r0 = "r0".to_string();
    let r1 = "r1".to_string();

    // Two same-label commits back-to-back, touching *different* nodes —
    // the exact shape the removed bucket coalescing corrupted (its
    // merge kept r0's undo and r1's redo, stranding r1 on undo).
    for id in ["r0", "r1"] {
        editor.begin_gesture();
        editor
            .dispatch(opacity_patch(id, 0.3), Origin::Local, Recording::Silent)
            .unwrap();
        editor.commit_gesture(Some("translate".to_string()));
    }
    assert_eq!(
        editor.history_len(),
        2,
        "HISB-3: two interactions, two entries"
    );

    assert!(editor.undo());
    assert_eq!(editor.node_opacity(&r1), Some(1.0), "first undo reverts r1");
    assert_eq!(editor.node_opacity(&r0), Some(0.3), "r0 still edited");

    assert!(editor.undo());
    assert_eq!(
        editor.node_opacity(&r0),
        Some(1.0),
        "second undo reverts r0"
    );
}

// ---------------------------------------------------------------------------
// HISB-4 — abort leaves no trace (end-to-end via Editor)
// ---------------------------------------------------------------------------

#[test]
fn hisb_4_abort_restores_state_and_records_nothing() {
    let mut editor = editor_with_rects(1);
    let r0 = "r0".to_string();

    // An entry *before* the gesture, so undo-after-abort has a target.
    editor
        .dispatch(
            opacity_patch("r0", 0.8),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    assert_eq!(editor.history_len(), 1);

    editor.begin_gesture();
    for preview in [0.6, 0.3] {
        editor
            .dispatch(
                opacity_patch("r0", preview),
                Origin::Local,
                Recording::Silent,
            )
            .unwrap();
    }
    editor.abort_gesture();

    assert_eq!(
        editor.node_opacity(&r0),
        Some(0.8),
        "HISB-4: pre-gesture state restored"
    );
    assert_eq!(editor.history_len(), 1, "HISB-4: history length unchanged");

    assert!(editor.undo());
    assert_eq!(
        editor.node_opacity(&r0),
        Some(1.0),
        "HISB-4: the next undo targets the entry before the gesture"
    );
}

// ---------------------------------------------------------------------------
// HISB-5 — origin isolation (end-to-end via Editor)
// ---------------------------------------------------------------------------

#[test]
fn hisb_5_remote_dispatches_do_not_disturb_the_local_stack() {
    let mut editor = editor_with_rects(2);
    let r0 = "r0".to_string();
    let r1 = "r1".to_string();

    editor
        .dispatch(
            opacity_patch("r0", 0.5),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    editor
        .dispatch(
            opacity_patch("r1", 0.9),
            Origin::Remote,
            Recording::Record { label: None },
        )
        .unwrap();
    editor
        .dispatch(
            opacity_patch("r0", 0.25),
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    editor
        .dispatch(opacity_patch("r1", 0.7), Origin::Remote, Recording::Silent)
        .unwrap();

    assert_eq!(
        editor.history_len(),
        2,
        "HISB-5: remote dispatches add no entries"
    );

    assert!(editor.undo());
    assert_eq!(
        editor.node_opacity(&r0),
        Some(0.5),
        "undo targets the local change"
    );
    assert_eq!(
        editor.node_opacity(&r1),
        Some(0.7),
        "remote state is untouched by local undo"
    );

    assert!(editor.undo());
    assert_eq!(editor.node_opacity(&r0), Some(1.0));
    assert_eq!(editor.history_len(), 0);
}

// ---------------------------------------------------------------------------
// HISB-7 — depth bound (pure)
// ---------------------------------------------------------------------------

#[test]
fn hisb_7_depth_bound_evicts_oldest_only() {
    let mut history: History<Vec<i32>> = History::new(3);

    for i in 0..5 {
        history.record(entry(None, vec![i], vec![i - 1], "s"));
    }
    assert_eq!(history.len(), 3, "HISB-7: bounded depth");

    // Retained entries undo in order, newest first: 4, 3, 2.
    assert_eq!(history.undo().unwrap().redo, vec![4]);
    assert_eq!(history.undo().unwrap().redo, vec![3]);
    assert_eq!(history.undo().unwrap().redo, vec![2]);
    assert!(
        history.undo().is_none(),
        "oldest entries (0, 1) were evicted"
    );
}

// ---------------------------------------------------------------------------
// Linearity — a new record clears the redo stack
// ---------------------------------------------------------------------------

#[test]
fn hisb_linear_record_clears_future() {
    let mut history: History<Vec<i32>> = History::new(64);
    history.record(entry(None, vec![1], vec![0], "a"));
    history.record(entry(None, vec![2], vec![1], "b"));

    assert!(history.undo().is_some());
    assert_eq!(history.future_len(), 1);

    history.record(entry(None, vec![9], vec![1], "c"));
    assert_eq!(history.future_len(), 0, "recording clears the redo stack");
    assert_eq!(history.len(), 2);
}

// ---------------------------------------------------------------------------
// HISB-9 — tolerant application: stale entries drop, never panic
// ---------------------------------------------------------------------------

#[test]
fn hisb_9_stale_entry_drops_and_next_undo_proceeds() {
    let mut editor = editor_with_rects(2);
    let r0 = "r0".to_string();

    // Two local entries: one on r0, then one on r1.
    for id in ["r0", "r1"] {
        editor
            .dispatch(
                opacity_patch(id, 0.5),
                Origin::Local,
                Recording::Record { label: None },
            )
            .unwrap();
    }
    assert_eq!(editor.history_len(), 2);

    // A remote peer removes r1 — the newest entry's undo batch now
    // targets a node that no longer exists.
    editor
        .dispatch(
            vec![Mutation::Remove {
                id: "r1".to_string(),
            }],
            Origin::Remote,
            Recording::Silent,
        )
        .unwrap();

    // Undo: the stale entry drops (no panic, document unchanged) …
    assert!(!editor.undo(), "HISB-9: stale entry reports failure");
    assert_eq!(
        editor.node_opacity(&r0),
        Some(0.5),
        "HISB-9: failed undo leaves the document unchanged"
    );
    assert_eq!(
        editor.history_len(),
        1,
        "HISB-9: the stale entry is removed"
    );
    assert_eq!(editor.history().future_len(), 0, "…not parked as redoable");

    // … and the next undo targets the adjacent entry.
    assert!(editor.undo(), "HISB-9: next undo proceeds");
    assert_eq!(editor.node_opacity(&r0), Some(1.0));
}

// ---------------------------------------------------------------------------
// Rescind (vector-edit.md VEC-2's history mechanism)
// ---------------------------------------------------------------------------

#[test]
fn rescind_discards_entry_and_clears_redo() {
    let mut history: History<Vec<i32>> = History::new(64);
    history.record(entry(None, vec![1], vec![-1], "a"));
    history.record(entry(None, vec![2], vec![-2], "b"));
    history.record(entry(None, vec![3], vec![-3], "c"));

    // Undo one: it moves to the redo stack.
    assert!(history.undo().is_some());
    assert_eq!(history.len(), 2);
    assert_eq!(history.future_len(), 1);

    // Rescind: the newest past entry is returned and *discarded*, and
    // the redo stack clears — a rescinded timeline cannot be redone
    // into.
    let rescinded = history.rescind().expect("entry to rescind");
    assert_eq!(rescinded.redo, vec![2]);
    assert_eq!(history.len(), 1);
    assert_eq!(history.future_len(), 0);
}

#[test]
fn editor_rescind_to_rolls_back_silently() {
    let mut editor = editor_with_rects(1);
    for (i, opacity) in [0.8, 0.6, 0.4].into_iter().enumerate() {
        editor
            .dispatch(
                opacity_patch("r0", opacity),
                Origin::Local,
                Recording::Record { label: None },
            )
            .unwrap();
        assert_eq!(editor.history_len(), i + 1);
    }

    assert!(editor.rescind_to(1));
    assert_eq!(editor.history_len(), 1);
    // The document rolled back to the state after the surviving entry.
    assert_eq!(editor.node_opacity(&"r0".to_string()), Some(0.8));
    // Nothing to redo: the rescinded entries ceased to exist.
    assert_eq!(editor.history().future_len(), 0);
    assert!(!editor.redo());

    // Idempotent at the floor.
    assert!(!editor.rescind_to(1));
}

/// A coalesced gesture must preserve *every* patch field across the
/// undo/redo round-trip. Two preview patches on one node — the second
/// carrying `corner_radius` — coalesce to one endpoint entry; redo must
/// reproduce the corner radius the gesture produced. Guards the
/// `merge_patch_over` exhaustiveness leg of HISB-1 (a mirror that drops
/// a field silently corrupts redo — the failure the crate exists to
/// prevent).
#[test]
fn hisb_coalesced_gesture_preserves_all_patch_fields() {
    let mut editor = editor_with_rects(1);
    let id = "r0".to_string();
    editor.begin_gesture();
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: id.clone(),
                set: PropPatch {
                    position: Some((10.0, 10.0)),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: id.clone(),
                set: PropPatch {
                    position: Some((20.0, 20.0)),
                    corner_radius: Some(8.0),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();
    editor.commit_gesture(Some("resize".to_string()));

    assert_eq!(
        editor.node_corner_radius(&id),
        Some(8.0),
        "the gesture applied the radius live"
    );
    assert!(editor.undo(), "one coalesced entry to undo");
    assert!(editor.redo(), "and to redo");
    assert_eq!(
        editor.node_corner_radius(&id),
        Some(8.0),
        "redo of the coalesced entry must reproduce corner_radius"
    );
}
