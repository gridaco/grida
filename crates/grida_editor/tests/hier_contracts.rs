//! Hierarchy-panel + numeric-input conformance (`HIER-*`, `WID-1/2`)
//! — `docs/wg/canvas/hierarchy.md`, `widgets.md`.
//!
//! Headless throughout (`UI-7` / `WID-7`): the tree and the numeric
//! inputs are driven with the same normalized surface-event vocabulary
//! the canvas uses; assertions run on the editor/document plane and
//! the UI scene-state plane. No window, no pixels.
//!
//! Consciously deferred (noted per the task brief):
//! - **HIER-6** lock semantics — `lock` is not in the M1 `PropPatch`
//!   domain; the substitute asserted here is that an `active=false`
//!   node remains fully selectable from the tree.
//! - **HIER-5** range selection and **HIER-8** rename are out of this
//!   milestone's scope.

use std::collections::{HashMap, HashSet};

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use grida::overlay::{Modifiers, PointerButton, SurfaceEvent};
use grida::text_edit::session::KeyName;
use math2::transform::AffineTransform;

use grida_editor::document::{Id, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::ui::UiLayer;
use grida_editor::ui::bind;
use grida_editor::ui::hierarchy::{self, HierarchyPanel, SCROLL_ID, TREE_ID, scroll_height};
use grida_editor::ui::properties::{self, PropertiesPanel};
use grida_editor::ui::widget::WidgetState;
use grida_editor::ui::widgets::tree::{INDENT, ROW_H, TreeRow};

// ── Helpers ──────────────────────────────────────────────────────────────

const VIEWPORT: Size = Size {
    width: 800.0,
    height: 600.0,
};
const PANEL_W: f32 = 220.0;

fn down(point: [f32; 2]) -> SurfaceEvent {
    down_mod(point, Modifiers::default())
}

fn down_mod(point: [f32; 2], modifiers: Modifiers) -> SurfaceEvent {
    SurfaceEvent::PointerDown {
        canvas_point: point,
        screen_point: point,
        button: PointerButton::Primary,
        modifiers,
    }
}

fn mv(point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerMove {
        canvas_point: point,
        screen_point: point,
    }
}

fn up(point: [f32; 2]) -> SurfaceEvent {
    up_mod(point, Modifiers::default())
}

fn up_mod(point: [f32; 2], modifiers: Modifiers) -> SurfaceEvent {
    SurfaceEvent::PointerUp {
        canvas_point: point,
        screen_point: point,
        button: PointerButton::Primary,
        modifiers,
    }
}

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

fn mount(editor: &Editor) -> (UiLayer, HierarchyPanel) {
    let mut ui = UiLayer::new(VIEWPORT);
    let mut hier = HierarchyPanel::new(PANEL_W);
    hier.sync(&mut ui, editor);
    (ui, hier)
}

fn tree_bounds(ui: &UiLayer) -> math2::rect::Rectangle {
    ui.widget_bounds(&TREE_ID.to_string()).expect("tree bounds")
}

/// A point over visual row `i`, clear of the disclosure zone.
fn row_point(ui: &UiLayer, i: usize) -> [f32; 2] {
    let b = tree_bounds(ui);
    [b.x + 100.0, b.y + i as f32 * ROW_H + ROW_H / 2.0]
}

fn click_row(ui: &mut UiLayer, hier: &mut HierarchyPanel, editor: &mut Editor, i: usize) {
    click_row_mod(ui, hier, editor, i, Modifiers::default());
}

fn click_row_mod(
    ui: &mut UiLayer,
    hier: &mut HierarchyPanel,
    editor: &mut Editor,
    i: usize,
    modifiers: Modifiers,
) {
    let p = row_point(ui, i);
    ui.pointer(&down_mod(p, modifiers));
    ui.pointer(&up_mod(p, modifiers));
    hier.handle(ui, editor);
}

/// A scripted drag from row `from` to an absolute pointer position.
fn drag_to(
    ui: &mut UiLayer,
    hier: &mut HierarchyPanel,
    editor: &mut Editor,
    from: usize,
    to: [f32; 2],
) {
    let start = row_point(ui, from);
    ui.pointer(&down(start));
    // First move passes the threshold, second lands on the target.
    ui.pointer(&mv([start[0] + 8.0, start[1] + 8.0]));
    ui.pointer(&mv(to));
    ui.pointer(&up(to));
    hier.handle(ui, editor);
}

fn visual_ids(rows: &[TreeRow]) -> Vec<&str> {
    rows.iter().map(|r| r.id.as_str()).collect()
}

fn expanded_of(ui: &UiLayer) -> HashSet<Id> {
    match ui.state(&TREE_ID.to_string()) {
        Some(WidgetState::Tree(s)) => s.expanded.clone(),
        _ => HashSet::new(),
    }
}

// ── HIER-1 — order round-trip ────────────────────────────────────────────

/// HIER-1 — visual rows are document order reversed (row i ↔ document
/// index n−1−i), and a drop rendered between two rows commits the
/// `Move` that reproduces exactly that visual order.
#[test]
fn hier1_order_round_trip() {
    let mut editor = three_sibling_editor();
    let (mut ui, mut hier) = mount(&editor);

    // Visual top-to-bottom = document order reversed.
    let rows = hierarchy::flatten(&editor, &HashSet::new());
    assert_eq!(
        visual_ids(&rows),
        ["C", "B", "A"],
        "HIER-1: row i (visual) is document index n-1-i"
    );

    // Drag the top row (C) to the gap between B and A (visual gap 2).
    let b = tree_bounds(&ui);
    let gap = [b.x + 40.0, b.y + 2.0 * ROW_H + 1.0];
    drag_to(&mut ui, &mut hier, &mut editor, 0, gap);

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

    // Undo restores prior structure and order exactly.
    assert!(editor.undo());
    assert_eq!(
        editor.children(None),
        vec!["A".to_string(), "B".to_string(), "C".to_string()],
        "undo restores the pre-drag document order"
    );
}

// ── HIER-2 — multi-drag rule ─────────────────────────────────────────────

/// HIER-2 — dragging a selected row moves the whole selection in one
/// history entry; dragging an unselected row moves only it and leaves
/// the selection unchanged.
#[test]
fn hier2_multi_drag_rule() {
    // (a) Grabbed row selected → whole selection moves, one entry.
    let mut editor = three_sibling_editor();
    editor.set_selection(vec!["C".to_string(), "B".to_string()]);
    let (mut ui, mut hier) = mount(&editor);

    // Drag C (row 0, selected) to the bottom gap (visual gap 3).
    let b = tree_bounds(&ui);
    let bottom = [b.x + 40.0, b.y + 3.0 * ROW_H - 1.0];
    drag_to(&mut ui, &mut hier, &mut editor, 0, bottom);

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
    let (mut ui, mut hier) = mount(&editor);

    // Drag B (visual row 1, unselected) to the top gap (gap 0).
    let b = tree_bounds(&ui);
    let top = [b.x + 40.0, b.y + 1.0];
    drag_to(&mut ui, &mut hier, &mut editor, 1, top);

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

/// HIER-3 — a scripted drag into the dragged node's own subtree and a
/// drag into a non-container commit nothing.
#[test]
fn hier3_illegal_drops_commit_nothing() {
    let mut editor = container_editor();
    // Reveal X so G's subtree is visible: rows = [L, G, X].
    editor.set_selection(vec!["X".to_string()]);
    let (mut ui, mut hier) = mount(&editor);
    let rows = hierarchy::flatten(&editor, &expanded_of(&ui));
    assert_eq!(visual_ids(&rows), ["L", "G", "X"], "fixture rows");
    let children_before = editor.children(None);

    // (a) Into own descendant: drag G onto X's middle band.
    let b = tree_bounds(&ui);
    let into_x = [b.x + 60.0, b.y + 2.0 * ROW_H + ROW_H / 2.0];
    drag_to(&mut ui, &mut hier, &mut editor, 1, into_x);
    assert_eq!(editor.history_len(), 0, "HIER-3: no Move was committed");
    assert_eq!(editor.children(None), children_before);
    assert_eq!(
        editor.children(Some(&"G".to_string())),
        vec!["X".to_string()]
    );

    // (b) Into a non-container: drag G onto leaf L's middle band.
    let b = tree_bounds(&ui);
    let into_l = [b.x + 60.0, b.y + ROW_H / 2.0];
    drag_to(&mut ui, &mut hier, &mut editor, 1, into_l);
    assert_eq!(
        editor.history_len(),
        0,
        "HIER-3: a drop into a non-container commits nothing"
    );
    assert_eq!(editor.children(None), children_before);
}

// ── HIER-4 — reveal ──────────────────────────────────────────────────────

/// HIER-4 — selecting a deeply nested node expands exactly its
/// ancestor chain (collapsing nothing) and scrolls its row into the
/// visible window.
#[test]
fn hier4_reveal_expands_ancestors_and_scrolls() {
    // 30 root leaves + G > H > N: enough rows that N starts outside
    // the scroll viewport.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map: HashMap<NodeId, Id> = HashMap::new();
    let g = graph.append_child(Node::Container(nf.create_container_node()), Parent::Root);
    id_map.insert(g, "G".to_string());
    let h = graph.append_child(
        Node::Container(nf.create_container_node()),
        Parent::NodeId(g),
    );
    id_map.insert(h, "H".to_string());
    let n = graph.append_child(
        Node::Rectangle(nf.create_rectangle_node()),
        Parent::NodeId(h),
    );
    id_map.insert(n, "N".to_string());
    for i in 0..30 {
        let iid = graph.append_child(Node::Rectangle(nf.create_rectangle_node()), Parent::Root);
        id_map.insert(iid, format!("leaf{i}"));
    }
    let scene = Scene {
        name: "hier-tests".to_string(),
        background_color: None,
        graph,
    };
    let mut editor = Editor::new(WorkingCopy::from_scene(scene, id_map));

    // Mount collapsed, nothing selected.
    let (mut ui, mut hier) = mount(&editor);
    assert_eq!(expanded_of(&ui), HashSet::new(), "starts fully collapsed");
    let rows = hierarchy::flatten(&editor, &expanded_of(&ui));
    assert!(
        !rows.iter().any(|r| r.id == "N"),
        "fixture: N is hidden while its ancestors are collapsed"
    );

    // Canvas-side selection lands on N.
    editor.set_selection(vec!["N".to_string()]);
    hier.sync(&mut ui, &editor);

    // Exactly the ancestor chain expanded — additively, nothing else.
    assert_eq!(
        expanded_of(&ui),
        HashSet::from(["G".to_string(), "H".to_string()]),
        "HIER-4: exactly the ancestor chain is expanded"
    );

    // N's row exists and sits inside the scrolled viewport window.
    let rows = hierarchy::flatten(&editor, &expanded_of(&ui));
    let i = rows
        .iter()
        .position(|r| r.id == "N")
        .expect("HIER-4: N has a visible row after reveal");
    // G is at the document *start*, so visually at the bottom: N's row
    // begins below the initial viewport (the scroll must move).
    let viewport_h = scroll_height(VIEWPORT.height);
    let row_top = i as f32 * ROW_H;
    assert!(
        row_top + ROW_H > viewport_h,
        "fixture: N's row ({row_top}) starts outside the unscrolled viewport ({viewport_h})"
    );
    let offset = match ui.state(&SCROLL_ID.to_string()) {
        Some(WidgetState::Scroll(s)) => s.offset,
        _ => 0.0,
    };
    assert!(
        row_top >= offset && row_top + ROW_H <= offset + viewport_h,
        "HIER-4: the revealed row [{row_top}, {}] lies inside the scrolled window [{offset}, {}]",
        row_top + ROW_H,
        offset + viewport_h
    );
}

// ── HIER-6 (substitute — see module docs) ────────────────────────────────

/// `lock` is outside the M1 PropPatch domain, so HIER-6 proper is not
/// testable yet; the tree-side half asserted here: an `active=false`
/// (hidden) node renders dimmed data and remains fully selectable
/// from the tree.
#[test]
fn hier6_substitute_inactive_node_selectable_from_tree() {
    let mut editor = three_sibling_editor();
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "B".to_string(),
                set: PropPatch {
                    active: Some(false),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .expect("active patch applies");
    let (mut ui, mut hier) = mount(&editor);

    let rows = hierarchy::flatten(&editor, &HashSet::new());
    let b_row = rows.iter().find(|r| r.id == "B").expect("B has a row");
    assert!(!b_row.active, "the hidden node's row carries active=false");

    // Row 1 is B (visual [C, B, A]); clicking it selects it.
    click_row(&mut ui, &mut hier, &mut editor, 1);
    assert_eq!(
        editor.selection(),
        &["B".to_string()],
        "an active=false node is still selectable from the tree"
    );
}

// ── HIER-7 (spirit) — windowed rendering ─────────────────────────────────

/// Windowing: the flatten covers expanded rows only, and the built
/// node count is bounded by the viewport, not the document size.
#[test]
fn hier7_windowed_build_is_viewport_bounded() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map: HashMap<NodeId, Id> = HashMap::new();
    for i in 0..1000 {
        let iid = graph.append_child(Node::Rectangle(nf.create_rectangle_node()), Parent::Root);
        id_map.insert(iid, format!("n{i}"));
    }
    let scene = Scene {
        name: "hier-tests".to_string(),
        background_color: None,
        graph,
    };
    let editor = Editor::new(WorkingCopy::from_scene(scene, id_map));
    let (ui, _hier) = mount(&editor);

    assert_eq!(
        hierarchy::flatten(&editor, &HashSet::new()).len(),
        1000,
        "all root rows are logical rows"
    );

    let mut node_count = 0usize;
    for root in ui.scene().graph.roots().to_vec() {
        ui.scene()
            .graph
            .walk_preorder(&root, &mut |_| node_count += 1)
            .expect("walk ui scene");
    }
    assert!(
        node_count < 200,
        "HIER-7 spirit: built UI nodes ({node_count}) are bounded by the viewport, not the 1000-row document"
    );
}

// ── Tree-select round trip ───────────────────────────────────────────────

/// Click row → editor selection updated → the canvas-side id
/// translation (stable ↔ internal) is consistent with the document.
#[test]
fn tree_select_round_trip() {
    let mut editor = three_sibling_editor();
    let (mut ui, mut hier) = mount(&editor);

    // Row 0 is C (visual top = document end).
    click_row(&mut ui, &mut hier, &mut editor, 0);
    assert_eq!(editor.selection(), &["C".to_string()]);

    let internal = editor
        .document()
        .internal_id(&"C".to_string())
        .expect("C maps to a renderer id");
    assert_eq!(
        editor.document().stable_id(internal),
        Some(&"C".to_string()),
        "the canvas-side selection translates back to the clicked row"
    );

    // Toggle modifier adds membership.
    let toggle = Modifiers {
        ctrl_or_cmd: true,
        ..Default::default()
    };
    click_row_mod(&mut ui, &mut hier, &mut editor, 2, toggle);
    assert_eq!(
        editor.selection(),
        &["C".to_string(), "A".to_string()],
        "ctrl/cmd-click toggles membership in"
    );
    click_row_mod(&mut ui, &mut hier, &mut editor, 0, toggle);
    assert_eq!(
        editor.selection(),
        &["A".to_string()],
        "ctrl/cmd-click toggles membership out"
    );
}

// ── Disclosure ───────────────────────────────────────────────────────────

/// Disclosure click toggles expansion (transient panel state, not in
/// history).
#[test]
fn disclosure_click_toggles_expansion() {
    let mut editor = container_editor();
    let (mut ui, mut hier) = mount(&editor);
    // Rows: [L, G] — G collapsed.
    assert_eq!(
        visual_ids(&hierarchy::flatten(&editor, &expanded_of(&ui))),
        ["L", "G"]
    );

    // Click G's disclosure zone (depth 0: x within [0, DISCLOSURE_W)).
    let b = tree_bounds(&ui);
    let p = [b.x + INDENT / 2.0, b.y + ROW_H + ROW_H / 2.0];
    ui.pointer(&down(p));
    ui.pointer(&up(p));
    hier.handle(&mut ui, &mut editor);

    assert_eq!(expanded_of(&ui), HashSet::from(["G".to_string()]));
    assert_eq!(
        visual_ids(&hierarchy::flatten(&editor, &expanded_of(&ui))),
        ["L", "G", "X"],
        "expanding G reveals X"
    );
    assert_eq!(editor.history_len(), 0, "expansion is never in history");
    assert!(editor.selection().is_empty(), "disclosure does not select");

    // Toggle back.
    ui.pointer(&down(p));
    ui.pointer(&up(p));
    hier.handle(&mut ui, &mut editor);
    assert_eq!(expanded_of(&ui), HashSet::new());
}

// ── Reparent into a container ────────────────────────────────────────────

/// A middle-band drop on a container reparents into it (one recorded
/// Move; undo restores).
#[test]
fn drop_into_container_reparents() {
    let mut editor = container_editor();
    let (mut ui, mut hier) = mount(&editor);
    // Rows: [L, G]. Drag L into G's middle band.
    let b = tree_bounds(&ui);
    let into_g = [b.x + 60.0, b.y + ROW_H + ROW_H / 2.0];
    drag_to(&mut ui, &mut hier, &mut editor, 0, into_g);

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

// ── WID-1 — numeric typed entry ──────────────────────────────────────────

/// One rectangle at (10, 20), size 80×60, selected.
fn one_rect_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 20.0, 0.0);
    rect.size = Size {
        width: 80.0,
        height: 60.0,
    };
    let mut graph = SceneGraph::new();
    let a = graph.append_child(Node::Rectangle(rect), Parent::Root);
    graph.set_name(a, "rect".to_string());
    let scene = Scene {
        name: "wid-tests".to_string(),
        background_color: None,
        graph,
    };
    let mut editor = Editor::new(WorkingCopy::from_scene(
        scene,
        HashMap::from([(a, "A".to_string())]),
    ));
    editor.set_selection(vec!["A".to_string()]);
    editor
}

/// Feed a key to the focused widget and apply its emissions.
fn press(ui: &mut UiLayer, props: &mut PropertiesPanel, editor: &mut Editor, key: KeyName) {
    let result = ui.key(&key, &Modifiers::default());
    bind::apply(editor, &result.emissions);
    props.sync(ui, editor);
}

fn focus_number(ui: &mut UiLayer, id: &str) {
    let b = ui.widget_bounds(&id.to_string()).expect("number bounds");
    let p = [b.x + b.width / 2.0, b.y + b.height / 2.0];
    ui.pointer(&down(p));
    ui.pointer(&up(p));
    assert_eq!(ui.focused(), Some(&id.to_string()), "click focuses");
}

/// WID-1 — typed entry: type a value, Enter → one commit with `set`;
/// Escape instead → no commit, prior value intact.
#[test]
fn wid1_typed_entry_commit_and_revert() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    focus_number(&mut ui, properties::X_ID);
    assert_eq!(
        editor.history_len(),
        0,
        "click-to-focus commits nothing (no empty history entry)"
    );

    // Type "42" and confirm.
    press(
        &mut ui,
        &mut props,
        &mut editor,
        KeyName::Character("4".into()),
    );
    press(
        &mut ui,
        &mut props,
        &mut editor,
        KeyName::Character("2".into()),
    );
    // The buffer is shown in place (retained state drives the build).
    match ui.state(&properties::X_ID.to_string()) {
        Some(WidgetState::Number(s)) => assert_eq!(s.buffer.as_deref(), Some("42")),
        other => panic!("number state expected, got {other:?}"),
    }
    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((10.0, 20.0)),
        "typing previews nothing on the document"
    );
    press(&mut ui, &mut props, &mut editor, KeyName::Enter);

    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((42.0, 20.0)),
        "WID-1: Enter commits one absolute set"
    );
    assert_eq!(editor.history_len(), 1, "WID-1: exactly one commit");

    // Type "7" and cancel.
    press(
        &mut ui,
        &mut props,
        &mut editor,
        KeyName::Character("7".into()),
    );
    press(&mut ui, &mut props, &mut editor, KeyName::Escape);
    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((42.0, 20.0)),
        "WID-1: Escape leaves the prior value intact"
    );
    assert_eq!(editor.history_len(), 1, "WID-1: cancel commits nothing");

    // Undo round-trips the typed commit.
    assert!(editor.undo());
    assert_eq!(editor.node_position(&"A".to_string()), Some((10.0, 20.0)));
}

// ── WID-2 — numeric step ─────────────────────────────────────────────────

/// WID-2 — one arrow press is ONE history entry carrying `delta`
/// semantics: on a multi-selection each node moves relative to its own
/// value.
#[test]
fn wid2_arrow_step_is_one_delta_entry() {
    // Two rects at different x; both selected — the panel displays the
    // head's value but a step must move each by ±1 from its OWN x.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    for (id, x) in [("A", 10.0f32), ("B", 50.0f32)] {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(x, 0.0, 0.0);
        rect.size = Size {
            width: 10.0,
            height: 10.0,
        };
        let iid = graph.append_child(Node::Rectangle(rect), Parent::Root);
        id_map.insert(iid, id.to_string());
    }
    let scene = Scene {
        name: "wid-tests".to_string(),
        background_color: None,
        graph,
    };
    let mut editor = Editor::new(WorkingCopy::from_scene(scene, id_map));
    editor.set_selection(vec!["A".to_string(), "B".to_string()]);

    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    focus_number(&mut ui, properties::X_ID);
    press(&mut ui, &mut props, &mut editor, KeyName::ArrowUp);

    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((11.0, 0.0)),
        "WID-2: A stepped from its own value"
    );
    assert_eq!(
        editor.node_position(&"B".to_string()),
        Some((51.0, 0.0)),
        "WID-2: B stepped from its own value (per-node relative delta)"
    );
    assert_eq!(
        editor.history_len(),
        1,
        "WID-2: one arrow press → exactly one history entry"
    );

    // The next press is its own entry: committed entries never merge
    // (HISB-3; burst framing, when it lands, will frame at the
    // interaction layer, not the stack).
    press(&mut ui, &mut props, &mut editor, KeyName::ArrowDown);
    assert_eq!(editor.node_position(&"A".to_string()), Some((10.0, 0.0)));
    assert_eq!(editor.node_position(&"B".to_string()), Some((50.0, 0.0)));
    assert_eq!(editor.history_len(), 2, "each press is its own entry");

    // Undo one step: only the newest delta reverts.
    assert!(editor.undo());
    assert_eq!(editor.node_position(&"A".to_string()), Some((11.0, 0.0)));
    assert_eq!(editor.node_position(&"B".to_string()), Some((51.0, 0.0)));
}

// ── WID-3 (number scrub) ─────────────────────────────────────────────────

/// Label-scrub on the numeric input: previews at input cadence, one
/// commit on release equal to the last preview (the slider's UI-4
/// pattern on the number widget).
#[test]
fn number_scrub_previews_and_commits_once() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    let x_id = properties::X_ID.to_string();
    let b = ui.widget_bounds(&x_id).expect("x bounds");
    let start = [b.x + 5.0, b.y + b.height / 2.0];
    let result = ui.pointer(&down(start));
    bind::apply(&mut editor, &result.emissions);
    props.sync(&mut ui, &editor);

    // Scrub +30px in 3 moves: previews land live, nothing recorded.
    for dx in [10.0, 20.0, 30.0] {
        let result = ui.pointer(&mv([start[0] + dx, start[1]]));
        bind::apply(&mut editor, &result.emissions);
        props.sync(&mut ui, &editor);
        assert_eq!(
            editor.node_position(&"A".to_string()),
            Some((10.0 + dx, 20.0)),
            "scrub preview applied live"
        );
        assert_eq!(editor.history_len(), 0, "previews are never recorded");
    }

    let result = ui.pointer(&up([start[0] + 30.0, start[1]]));
    let applied = bind::apply(&mut editor, &result.emissions);
    assert!(applied.committed);
    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((40.0, 20.0)),
        "commit equals the last preview"
    );
    assert_eq!(editor.history_len(), 1, "one scrub → one history entry");

    assert!(editor.undo());
    assert_eq!(
        editor.node_position(&"A".to_string()),
        Some((10.0, 20.0)),
        "undo restores the pre-scrub value"
    );
}
