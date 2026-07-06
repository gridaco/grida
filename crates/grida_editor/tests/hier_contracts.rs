//! Hierarchy flatten + drag→drop geometry conformance (`HIER-1/2/3`) —
//! `docs/wg/canvas/hierarchy.md`.
//!
//! These test the pure `crate::ui::hierarchy` functions the egui panel
//! drives: `flatten` (document → visual rows) and `resolve_drop` /
//! `dragged_ids` (the drop resolution). The panel *view* is egui and is
//! exercised in the shell; here we assert the geometry directly on the
//! editor/document plane — no window, no widgets.
//!
//! The retired `UiLayer`-driven versions of these tests (and the widget
//! numeric-input cases) went away with the widget framework; the drop
//! resolution they covered moved into the functions tested below.

use std::collections::{HashMap, HashSet};

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use grida_editor::document::{Id, Mutation, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::ui::hierarchy::{self, ROW_H, TreeRow};

// ── Helpers ──────────────────────────────────────────────────────────────

const PANEL_W: f32 = 220.0;

/// Three root-level rectangles, document order `[A, B, C]`.
fn three_sibling_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    for (i, id) in ["A", "B", "C"].iter().enumerate() {
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
        name: "hier-tests".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// A container `G` holding leaf `X`, plus a root-level leaf `L`
/// (document order `[G, L]`; `G` children `[X]`).
fn container_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();

    let g = graph.append_child(Node::Container(nf.create_container_node()), Parent::Root);
    graph.set_name(g, "G".to_string());
    id_map.insert(g, "G".to_string());

    let x = graph.append_child(
        Node::Rectangle(nf.create_rectangle_node()),
        Parent::NodeId(g),
    );
    graph.set_name(x, "X".to_string());
    id_map.insert(x, "X".to_string());

    let l = graph.append_child(Node::Rectangle(nf.create_rectangle_node()), Parent::Root);
    graph.set_name(l, "L".to_string());
    id_map.insert(l, "L".to_string());

    let scene = Scene {
        name: "hier-tests".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

fn expanded(ids: &[&str]) -> HashSet<Id> {
    ids.iter().map(|s| s.to_string()).collect()
}

fn visual_ids(rows: &[TreeRow]) -> Vec<&str> {
    rows.iter().map(|r| r.id.as_str()).collect()
}

/// The rows' content rect (origin at 0,0), the space `resolve_drop`
/// reads `point` in.
fn bounds(rows: &[TreeRow]) -> Rectangle {
    Rectangle {
        x: 0.0,
        y: 0.0,
        width: PANEL_W,
        height: rows.len() as f32 * ROW_H,
    }
}

/// A point in the gap **above** visual row `i` (`frac < 0.25` → gap `i`);
/// `x` is clear of the disclosure gutter.
fn gap_above(i: usize) -> [f32; 2] {
    [40.0, i as f32 * ROW_H + 1.0]
}

/// A point in the gap **below** visual row `i` (`frac > 0.75` → gap i+1).
fn gap_below(i: usize) -> [f32; 2] {
    [40.0, (i + 1) as f32 * ROW_H - 1.0]
}

/// A point in the middle band of visual row `i` ("into", `0.25..0.75`).
fn into_row(i: usize) -> [f32; 2] {
    [60.0, i as f32 * ROW_H + ROW_H / 2.0]
}

/// Resolve + commit a drag grabbing visual row `from`, released at
/// `point` — the exact flow the egui panel runs: `dragged_ids` →
/// `resolve_drop` → one recorded `Move` (nothing on a `None` target).
fn drag_apply(editor: &mut Editor, rows: &[TreeRow], from: usize, point: [f32; 2]) {
    let dragged = hierarchy::dragged_ids(rows, from);
    if let Some(t) = hierarchy::resolve_drop(rows, &dragged, point, bounds(rows)) {
        editor
            .dispatch(
                vec![Mutation::Move {
                    ids: dragged,
                    parent: t.parent,
                    index: t.index,
                }],
                Origin::Local,
                Recording::Record {
                    label: Some("hier.move".to_string()),
                },
            )
            .expect("move applies");
    }
}

// ── HIER-1 — order round-trip ────────────────────────────────────────────

/// HIER-1 — visual rows are document order reversed (row i ↔ document
/// index n−1−i), and a drop rendered between two rows commits the `Move`
/// that reproduces exactly that visual order.
#[test]
fn hier1_order_round_trip() {
    let mut editor = three_sibling_editor();

    let rows = hierarchy::flatten(&editor, &HashSet::new());
    assert_eq!(
        visual_ids(&rows),
        ["C", "B", "A"],
        "HIER-1: row i (visual) is document index n-1-i"
    );

    // Drag the top row (C, visual 0) to the gap between B and A (gap 2).
    drag_apply(&mut editor, &rows, 0, gap_above(2));

    assert_eq!(
        editor.children(None),
        vec!["A".to_string(), "C".to_string(), "B".to_string()],
        "HIER-1: the committed Move reproduces the indicated visual order in document order"
    );
    let rows = hierarchy::flatten(&editor, &HashSet::new());
    assert_eq!(
        visual_ids(&rows),
        ["B", "C", "A"],
        "HIER-1: C landed exactly where the drop indicator was (between B and A)"
    );
    assert_eq!(editor.history_len(), 1, "one drop → one history entry");

    assert!(editor.undo());
    assert_eq!(
        editor.children(None),
        vec!["A".to_string(), "B".to_string(), "C".to_string()],
        "undo restores the pre-drag document order"
    );
}

// ── HIER-2 — multi-drag rule ─────────────────────────────────────────────

/// HIER-2 — dragging a selected row moves the whole selection in one
/// history entry; dragging an unselected row moves only it and leaves the
/// selection unchanged.
#[test]
fn hier2_multi_drag_rule() {
    // (a) Grabbed row selected → whole selection moves, one entry.
    let mut editor = three_sibling_editor();
    editor.set_selection(vec!["C".to_string(), "B".to_string()]);
    let rows = hierarchy::flatten(&editor, &HashSet::new());

    // Grab C (visual 0, selected), drop at the bottom gap (gap 3).
    drag_apply(&mut editor, &rows, 0, gap_below(2));

    assert_eq!(
        editor.children(None),
        vec!["B".to_string(), "C".to_string(), "A".to_string()],
        "HIER-2: the whole selection moved below A, relative visual order preserved"
    );
    assert_eq!(
        editor.history_len(),
        1,
        "HIER-2: a multi-drag is ONE history entry"
    );
    assert_eq!(
        editor.selection(),
        &["C".to_string(), "B".to_string()],
        "the dragged selection persists"
    );

    // (b) Grabbed row NOT selected → only it moves, selection intact.
    let mut editor = three_sibling_editor();
    editor.set_selection(vec!["A".to_string()]);
    let rows = hierarchy::flatten(&editor, &HashSet::new());

    // Grab B (visual 1, unselected), drop at the top gap (gap 0).
    drag_apply(&mut editor, &rows, 1, gap_above(0));

    assert_eq!(
        editor.children(None),
        vec!["A".to_string(), "C".to_string(), "B".to_string()],
        "HIER-2: only the grabbed (unselected) row moved — to the visual top = document end"
    );
    assert_eq!(
        editor.selection(),
        &["A".to_string()],
        "HIER-2: dragging an unselected row leaves the selection unchanged"
    );
}

// ── HIER-3 — illegal drops are unreachable ───────────────────────────────

/// HIER-3 — a drag into the dragged node's own subtree, and a drag into a
/// non-container, both resolve to no target (commit nothing).
#[test]
fn hier3_illegal_drops_commit_nothing() {
    let mut editor = container_editor();
    // Reveal X (expand G): rows = [L, G, X].
    let rows = hierarchy::flatten(&editor, &expanded(&["G"]));
    assert_eq!(visual_ids(&rows), ["L", "G", "X"], "fixture rows");
    let children_before = editor.children(None);

    // (a) Into own descendant: grab G (visual 1), drop onto X's middle.
    drag_apply(&mut editor, &rows, 1, into_row(2));
    assert_eq!(editor.history_len(), 0, "HIER-3: no Move was committed");
    assert_eq!(editor.children(None), children_before);
    assert_eq!(
        editor.children(Some(&"G".to_string())),
        vec!["X".to_string()]
    );

    // (b) Into a non-container: grab G, drop onto leaf L's middle.
    drag_apply(&mut editor, &rows, 1, into_row(0));
    assert_eq!(
        editor.history_len(),
        0,
        "HIER-3: a drop into a non-container commits nothing"
    );
    assert_eq!(editor.children(None), children_before);
}

// ── Reparent into a container ────────────────────────────────────────────

/// A middle-band drop on a container reparents into it (one recorded
/// Move; undo restores). "Into" appends at the document end (visual top
/// inside the container).
#[test]
fn drop_into_container_reparents() {
    let mut editor = container_editor();
    // G collapsed → rows = [L, G]. Grab L (visual 0), drop into G's middle.
    let rows = hierarchy::flatten(&editor, &HashSet::new());
    assert_eq!(visual_ids(&rows), ["L", "G"], "fixture rows");
    drag_apply(&mut editor, &rows, 0, into_row(1));

    assert_eq!(
        editor.children(Some(&"G".to_string())),
        vec!["X".to_string(), "L".to_string()],
        "into = append at document end (visual top inside G)"
    );
    assert_eq!(editor.children(None), vec!["G".to_string()]);
    assert_eq!(editor.history_len(), 1);

    assert!(editor.undo());
    assert_eq!(
        editor.children(None),
        vec!["G".to_string(), "L".to_string()],
        "undo restores the pre-drop structure"
    );
    assert_eq!(
        editor.children(Some(&"G".to_string())),
        vec!["X".to_string()]
    );
}

// ── Flatten expansion + selection mirror ─────────────────────────────────

/// `flatten` descends only into `expanded` containers, and each row's
/// `selected` mirrors the editor selection (the reveal the egui panel
/// does before flattening is just expanding the ancestor chain).
#[test]
fn flatten_expansion_and_selection() {
    let mut editor = container_editor();

    // Collapsed: G's child X is hidden.
    let rows = hierarchy::flatten(&editor, &HashSet::new());
    assert_eq!(visual_ids(&rows), ["L", "G"]);
    let g = rows.iter().find(|r| r.id == "G").unwrap();
    assert!(g.is_container && !g.expanded && g.child_count == 1);

    // Expanded: X appears one level deeper.
    let rows = hierarchy::flatten(&editor, &expanded(&["G"]));
    assert_eq!(visual_ids(&rows), ["L", "G", "X"]);
    let x = rows.iter().find(|r| r.id == "X").unwrap();
    assert_eq!(x.depth, 1, "X is a child level below G");
    assert!(!x.selected, "nothing selected yet");

    // Selection mirrors into the flattened rows.
    editor.set_selection(vec!["X".to_string()]);
    let rows = hierarchy::flatten(&editor, &expanded(&["G"]));
    let x = rows.iter().find(|r| r.id == "X").unwrap();
    assert!(x.selected, "the row reflects the editor selection");
}
