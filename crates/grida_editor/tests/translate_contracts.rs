//! Translate structural conformance — `docs/wg/canvas/translate.md`
//! `TRL-1..9`: clone-on-translate (the clone moves, the origin rests)
//! and hierarchy change (the tree follows the pointer), both inside
//! the one exclusive translate gesture and its single history entry.
//!
//! Headless: a real editor over a working copy, a document-backed
//! [`InterpretScene`] that answers the drop-target queries (hit
//! chain, parent frames), and hand-built intent streams.

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use grida_editor::document::{Id, WorkingCopy};
use grida_editor::editor::Editor;
use grida_editor::hud::{HudPrim, Intent, Phase, Role};
use grida_editor::interpret::{InterpretScene, Interpreter, facts_for};

// ── Fixture ──────────────────────────────────────────────────────────

fn rect(nf: &NodeFactory, x: f32, y: f32, w: f32, h: f32) -> Node {
    let mut r = nf.create_rectangle_node();
    r.transform = AffineTransform::new(x, y, 0.0);
    r.size = Size {
        width: w,
        height: h,
    };
    Node::Rectangle(r)
}

fn container(nf: &NodeFactory, x: f32, y: f32, w: f32, h: f32) -> Node {
    let mut c = nf.create_container_node();
    c.position =
        grida::node::schema::LayoutPositioningBasis::Cartesian(grida::cg::types::CGPoint { x, y });
    c.layout_dimensions.layout_target_width = Some(w);
    c.layout_dimensions.layout_target_height = Some(h);
    Node::Container(c)
}

fn tray(nf: &NodeFactory, x: f32, y: f32, w: f32, h: f32) -> Node {
    let mut t = nf.create_tray_node();
    t.position =
        grida::node::schema::LayoutPositioningBasis::Cartesian(grida::cg::types::CGPoint { x, y });
    t.layout_dimensions.layout_target_width = Some(w);
    t.layout_dimensions.layout_target_height = Some(h);
    Node::Tray(t)
}

/// Root order: container `P` (100,100 200×200) holding rect `R`
/// (local 10,10 50×50) and container `C` (local 20,20 100×100);
/// container `Q` (400,100 200×200); rect `A` (600,0 80×80); rect `B`
/// (700,0 80×80); group `G` holding rect `G1` (600,300 40×40); tray
/// `T` (0,500 150×150); tray `T2` (300,500 150×150).
fn fixture() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let p = graph.append_child(container(&nf, 100.0, 100.0, 200.0, 200.0), Parent::Root);
    let r = graph.append_child(rect(&nf, 10.0, 10.0, 50.0, 50.0), Parent::NodeId(p));
    let c = graph.append_child(container(&nf, 20.0, 20.0, 100.0, 100.0), Parent::NodeId(p));
    let q = graph.append_child(container(&nf, 400.0, 100.0, 200.0, 200.0), Parent::Root);
    let a = graph.append_child(rect(&nf, 600.0, 0.0, 80.0, 80.0), Parent::Root);
    let b = graph.append_child(rect(&nf, 700.0, 0.0, 80.0, 80.0), Parent::Root);
    let g = graph.append_child(Node::Group(nf.create_group_node()), Parent::Root);
    let g1 = graph.append_child(rect(&nf, 600.0, 300.0, 40.0, 40.0), Parent::NodeId(g));
    let t = graph.append_child(tray(&nf, 0.0, 500.0, 150.0, 150.0), Parent::Root);
    let t2 = graph.append_child(tray(&nf, 300.0, 500.0, 150.0, 150.0), Parent::Root);
    let id_map: HashMap<NodeId, Id> = HashMap::from([
        (p, "P".to_string()),
        (r, "R".to_string()),
        (c, "C".to_string()),
        (q, "Q".to_string()),
        (a, "A".to_string()),
        (b, "B".to_string()),
        (g, "G".to_string()),
        (g1, "G1".to_string()),
        (t, "T".to_string()),
        (t2, "T2".to_string()),
    ]);
    let scene = Scene {
        name: "translate".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

// ── Document-backed scene ────────────────────────────────────────────

/// Recomputes world geometry from the document each event: world =
/// parent-frame origin + local position (all fixture frames are pure
/// translations), group bounds = child union, hit chain = reverse
/// pre-order (children above parents, later siblings on top).
struct HierScene {
    bounds: HashMap<Id, Rectangle>,
    parents: HashMap<Id, Option<Id>>,
    paint: Vec<Id>,
    origins: HashMap<Id, [f32; 2]>,
    /// Simulated non-pure frames (`frame_origin` → `None`): the
    /// rotated-container refusal.
    refused: Vec<Id>,
}

impl HierScene {
    fn of(editor: &Editor) -> Self {
        let mut s = Self {
            bounds: HashMap::new(),
            parents: HashMap::new(),
            paint: Vec::new(),
            origins: HashMap::new(),
            refused: Vec::new(),
        };
        collect(editor.document(), None, [0.0, 0.0], &mut s);
        s
    }
}

fn collect(
    doc: &WorkingCopy,
    parent: Option<&Id>,
    origin: [f32; 2],
    s: &mut HierScene,
) -> Option<Rectangle> {
    let mut union: Option<Rectangle> = None;
    for id in doc.children(parent) {
        let (x, y) = doc.node_position(&id).unwrap_or((0.0, 0.0));
        let world = [origin[0] + x, origin[1] + y];
        s.paint.push(id.clone());
        s.parents.insert(id.clone(), parent.cloned());
        if doc.node_adopts(&id) == Some(true) {
            s.origins.insert(id.clone(), world);
        }
        let child_union = collect(doc, Some(&id), world, s);
        let bounds = match doc.node_size(&id) {
            Some((w, h)) => Rectangle::from_xywh(world[0], world[1], w, h),
            None => child_union.unwrap_or(Rectangle::from_xywh(world[0], world[1], 0.0, 0.0)),
        };
        s.bounds.insert(id.clone(), bounds);
        union = Some(match union {
            Some(u) => math2::rect::union(&[u, bounds]),
            None => bounds,
        });
    }
    union
}

impl InterpretScene for HierScene {
    fn nodes_in_rect(&self, rect: &Rectangle) -> Vec<Id> {
        self.bounds
            .iter()
            .filter(|(_, b)| b.intersects(rect))
            .map(|(id, _)| id.clone())
            .collect()
    }
    fn world_bounds(&self, id: &Id) -> Option<Rectangle> {
        self.bounds.get(id).copied()
    }
    fn hit_chain(&self, p: [f32; 2]) -> Vec<Id> {
        self.paint
            .iter()
            .rev()
            .filter(|id| self.bounds.get(*id).is_some_and(|b| b.contains_point(p)))
            .cloned()
            .collect()
    }
    fn parent_of(&self, id: &Id) -> Option<Id> {
        self.parents.get(id).cloned().flatten()
    }
    fn frame_origin(&self, id: &Id) -> Option<[f32; 2]> {
        if self.refused.contains(id) {
            return None;
        }
        self.origins.get(id).copied()
    }
}

// ── Drivers ──────────────────────────────────────────────────────────

fn translate(
    ids: &[&str],
    dx: f32,
    dy: f32,
    pointer: [f32; 2],
    clone: bool,
    phase: Phase,
) -> Intent {
    Intent::Translate {
        ids: ids.iter().map(|s| s.to_string()).collect(),
        dx,
        dy,
        axis_lock: None,
        pointer,
        clone,
        phase,
    }
}

fn drive(interp: &mut Interpreter, editor: &mut Editor, intent: Intent) {
    drive_refusing(interp, editor, intent, &[]);
}

fn drive_refusing(interp: &mut Interpreter, editor: &mut Editor, intent: Intent, refused: &[&str]) {
    let facts = {
        let mut scene = HierScene::of(editor);
        scene.refused = refused.iter().map(|s| s.to_string()).collect();
        facts_for(&intent, &scene)
    };
    interp.apply(editor, &intent, &facts);
}

fn parent(editor: &Editor, id: &str) -> Option<Id> {
    editor.document().node_parent(&id.to_string()).flatten()
}

fn pos(editor: &Editor, id: &str) -> (f32, f32) {
    editor.node_position(&id.to_string()).unwrap()
}

fn roots(editor: &Editor) -> Vec<Id> {
    editor.children(None)
}

// ── Hierarchy change ─────────────────────────────────────────────────

// TRL-6/9: dragging into a container re-parents live, preserves the
// world position across the frame change, enters at the top of the
// new parent's z-order, and the whole ride is one history entry.
#[test]
fn trl6_reparent_into_container_preserves_world() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);

    // Over empty canvas: parent stays root.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], -100.0, 50.0, [550.0, 30.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "A"), None);

    // Pointer enters P: the move happens on this very frame — no
    // dwell — and the local position re-derives against P's frame.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], -450.0, 150.0, [280.0, 280.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "A"), Some("P".to_string()));
    assert_eq!(pos(&editor, "A"), (50.0, 50.0), "local = world − P frame");
    let scene = HierScene::of(&editor);
    assert_eq!(
        scene.world_bounds(&"A".to_string()).unwrap(),
        Rectangle::from_xywh(150.0, 150.0, 80.0, 80.0),
        "world position is continuous across the parent change (TRL-6)"
    );
    assert_eq!(
        editor.children(Some(&"P".to_string())).last(),
        Some(&"A".to_string()),
        "enters at the top of the new parent's z-order"
    );

    // Back out to empty canvas: re-parents to the scene root, world
    // still continuous.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], -100.0, 380.0, [550.0, 450.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "A"), None);
    assert_eq!(pos(&editor, "A"), (500.0, 380.0));

    // Commit through P again: one entry, one undo restores parent,
    // order, and position together (TRL-9).
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], -450.0, 150.0, [280.0, 280.0], false, Phase::Commit),
    );
    assert_eq!(parent(&editor, "A"), Some("P".to_string()));
    assert_eq!(editor.history_len(), 1, "one entry (TRL-9)");
    assert!(editor.undo());
    assert_eq!(parent(&editor, "A"), None);
    assert_eq!(pos(&editor, "A"), (600.0, 0.0));
    assert!(editor.redo());
    assert_eq!(parent(&editor, "A"), Some("P".to_string()));
    assert_eq!(pos(&editor, "A"), (50.0, 50.0));
}

// TRL-7: children of groups never re-parent by translate — a group is
// dissolved deliberately, never by dragging its children away. The
// honest overlay draws nothing for a held member.
#[test]
fn trl7_group_children_are_held() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    drive(
        &mut interp,
        &mut editor,
        translate(
            &["G1"],
            -400.0,
            -100.0,
            [280.0, 280.0],
            false,
            Phase::Preview,
        ),
    );
    assert_eq!(
        parent(&editor, "G1"),
        Some("G".to_string()),
        "the group holds its child (TRL-7)"
    );
    assert!(
        interp.drop_chrome().is_empty(),
        "no member would re-parent — no drop highlight (TRL-8)"
    );
    drive(&mut interp, &mut editor, Intent::Cancel);
}

// TRL-7: no pointer path re-parents a node into its own subtree — a
// container dragged over its own child container resolves past both
// to the root.
#[test]
fn trl7_no_self_adoption() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    // Pointer over C (a container inside dragged P).
    drive(
        &mut interp,
        &mut editor,
        translate(&["P"], 5.0, 5.0, [150.0, 150.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "P"), None, "P stays at the root");
    assert_eq!(parent(&editor, "C"), Some("P".to_string()));
    assert!(interp.drop_chrome().is_empty());
    drive(&mut interp, &mut editor, Intent::Cancel);
}

// TRL-7: a tray may only enter the scene root or another tray.
#[test]
fn trl7_tray_only_enters_root_or_tray() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    // Over container P: refused — the tray stays at the root.
    drive(
        &mut interp,
        &mut editor,
        translate(&["T"], 10.0, -10.0, [280.0, 280.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "T"), None);
    assert!(
        interp.drop_chrome().is_empty(),
        "a refused target draws no highlight"
    );
    // Over tray T2: adopted.
    drive(
        &mut interp,
        &mut editor,
        translate(&["T"], 10.0, 10.0, [350.0, 550.0], false, Phase::Commit),
    );
    assert_eq!(parent(&editor, "T"), Some("T2".to_string()));
    assert_eq!(
        pos(&editor, "T"),
        (-290.0, 10.0),
        "local re-derives against T2's frame (TRL-6)"
    );
}

// A container whose child frame is not a pure translation (rotated /
// scaled — `frame_origin` = None) is not a v1 adoption target: the
// chain resolves past it.
#[test]
fn rotated_frame_is_refused_as_target() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    drive_refusing(
        &mut interp,
        &mut editor,
        translate(&["A"], -450.0, 150.0, [280.0, 280.0], false, Phase::Preview),
        &["P"],
    );
    assert_eq!(
        parent(&editor, "A"),
        None,
        "an unresolvable frame refuses adoption; the root adopts instead"
    );
    drive(&mut interp, &mut editor, Intent::Cancel);
}

// TRL-8: the drop-target overlay marks the prospective parent exactly
// while a commit would re-parent, and vanishes when the target equals
// the gesture-start parent again.
#[test]
fn trl8_overlay_tells_the_truth() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    // Dragging R inside its own parent P: no highlight.
    drive(
        &mut interp,
        &mut editor,
        translate(&["R"], 5.0, 5.0, [280.0, 150.0], false, Phase::Preview),
    );
    assert!(interp.drop_chrome().is_empty(), "target == start parent");
    // Pointer over Q: R re-parents; Q highlights.
    drive(
        &mut interp,
        &mut editor,
        translate(&["R"], 400.0, 50.0, [500.0, 200.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "R"), Some("Q".to_string()));
    let chrome = interp.drop_chrome();
    assert_eq!(chrome.len(), 1);
    match &chrome[0] {
        HudPrim::Outline { corners, role } => {
            assert_eq!(*role, Role::DropTarget);
            assert_eq!(corners[0], [400.0, 100.0], "Q's world outline");
            assert_eq!(corners[2], [600.0, 300.0]);
        }
        other => panic!("expected the drop outline, got {other:?}"),
    }
    // Back over P (the gesture-start parent): re-parents back, and
    // the highlight goes out — a commit now would not re-parent.
    drive(
        &mut interp,
        &mut editor,
        translate(&["R"], 5.0, 5.0, [280.0, 150.0], false, Phase::Preview),
    );
    assert_eq!(parent(&editor, "R"), Some("P".to_string()));
    assert!(interp.drop_chrome().is_empty());
    // Commit: the chrome dies with the gesture.
    drive(
        &mut interp,
        &mut editor,
        translate(&["R"], 400.0, 50.0, [500.0, 200.0], false, Phase::Commit),
    );
    assert!(interp.drop_chrome().is_empty(), "disappears at commit");
}

// ── Clone on translate ───────────────────────────────────────────────

// TRL-1/2: the ON edge reverts the originals and moves fresh clones on
// that very event — no pointer movement — with each clone its origin's
// immediate next sibling; the OFF edge removes them and resumes the
// originals within the same event.
#[test]
fn trl1_clone_edges_are_live() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    let before = roots(&editor);

    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], false, Phase::Preview),
    );
    assert_eq!(pos(&editor, "A"), (630.0, 40.0));

    // ON edge: same delta, same pointer — the modifier alone flips it.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], true, Phase::Preview),
    );
    assert_eq!(pos(&editor, "A"), (600.0, 0.0), "the origin rests (TRL-1)");
    let after = roots(&editor);
    assert_eq!(after.len(), before.len() + 1);
    let ai = after.iter().position(|id| id == "A").unwrap();
    let clone_id = after[ai + 1].clone();
    assert!(
        !before.contains(&clone_id),
        "the clone is a fresh node, the origin's immediate next sibling (TRL-2)"
    );
    assert_eq!(
        editor.node_position(&clone_id).unwrap(),
        (630.0, 40.0),
        "the clone adopts the gesture's current delta"
    );
    assert_eq!(
        editor.selection(),
        std::slice::from_ref(&clone_id),
        "the selection retargets to the clone"
    );

    // OFF edge: the clone vanishes; the original resumes the pointer.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], false, Phase::Preview),
    );
    assert_eq!(roots(&editor), before, "abandoned clones leave nothing");
    assert_eq!(pos(&editor, "A"), (630.0, 40.0), "the original resumes");
    assert_eq!(editor.selection(), &["A".to_string()]);
    drive(&mut interp, &mut editor, Intent::Cancel);
}

// TRL-2: a multi-member clone set interleaves with its origins in
// document order.
#[test]
fn trl2_clone_set_interleaves_with_origins() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string(), "B".to_string()]);
    drive(
        &mut interp,
        &mut editor,
        translate(&["A", "B"], 30.0, 40.0, [630.0, 40.0], true, Phase::Preview),
    );
    let after = roots(&editor);
    let ai = after.iter().position(|id| id == "A").unwrap();
    let bi = after.iter().position(|id| id == "B").unwrap();
    assert_eq!(bi, ai + 2, "…A, A′, B, B′,… — clones interleave");
    let (ca, cb) = (after[ai + 1].clone(), after[bi + 1].clone());
    assert_eq!(editor.selection(), &[ca.clone(), cb.clone()]);
    assert_eq!(editor.node_position(&ca).unwrap(), (630.0, 40.0));
    assert_eq!(editor.node_position(&cb).unwrap(), (730.0, 40.0));
    drive(&mut interp, &mut editor, Intent::Cancel);
    assert_eq!(roots(&editor).len(), after.len() - 2, "cancel removes all");
}

// TRL-3: a cloned commit is one entry — undo removes the clones and
// restores the pre-gesture selection; cancel restores the document
// with no entry.
#[test]
fn trl3_cloned_commit_is_one_entry() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    let before = roots(&editor);

    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], true, Phase::Commit),
    );
    assert_eq!(roots(&editor).len(), before.len() + 1);
    assert_eq!(editor.history_len(), 1, "one entry (TRL-3)");
    assert!(editor.undo());
    assert_eq!(roots(&editor), before, "undo removes the clones entirely");
    assert_eq!(pos(&editor, "A"), (600.0, 0.0));
    assert_eq!(
        editor.selection(),
        &["A".to_string()],
        "undo restores the pre-gesture selection"
    );

    // Cancel: byte-exact restore, no entry.
    let len = editor.history_len();
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], true, Phase::Preview),
    );
    drive(&mut interp, &mut editor, Intent::Cancel);
    assert_eq!(roots(&editor), before);
    assert_eq!(pos(&editor, "A"), (600.0, 0.0));
    assert_eq!(editor.history_len(), len, "no new entry after cancel");
    assert_eq!(editor.selection(), &["A".to_string()]);
}

// TRL-5: ON→OFF→commit leaves no trace of the abandoned clones — not
// in the document, not in the entry's replay.
#[test]
fn trl5_abandoned_clones_never_commit() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    let before = roots(&editor);

    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], true, Phase::Preview),
    );
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], false, Phase::Preview),
    );
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 40.0, [630.0, 40.0], false, Phase::Commit),
    );
    assert_eq!(roots(&editor), before);
    assert_eq!(pos(&editor, "A"), (630.0, 40.0));
    // The entry replays clean: undo/redo never resurrects a clone.
    assert!(editor.undo());
    assert_eq!(roots(&editor), before);
    assert_eq!(pos(&editor, "A"), (600.0, 0.0));
    assert!(editor.redo());
    assert_eq!(roots(&editor), before);
    assert_eq!(pos(&editor, "A"), (630.0, 40.0));
}

// Snapping retargets with the selection: while cloning, the resting
// origin is an ordinary snap anchor — the step-and-repeat case.
#[test]
fn clone_snaps_against_its_own_origin() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    // 78 ≈ 80: the clone's left edge is within threshold of the
    // origin's right edge — only the clone session carries the origin
    // as an anchor.
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 78.0, 0.0, [690.0, 40.0], true, Phase::Preview),
    );
    let after = roots(&editor);
    let ai = after.iter().position(|id| id == "A").unwrap();
    let clone_id = after[ai + 1].clone();
    assert_eq!(
        editor.node_position(&clone_id).unwrap(),
        (680.0, 0.0),
        "the clone snapped to its origin's edge"
    );
    assert_eq!(pos(&editor, "A"), (600.0, 0.0));
    drive(&mut interp, &mut editor, Intent::Cancel);
}

// ── TRL-4: duplicate and the measured repeat offset ──────────────────

// A cloned commit with zero net movement is a duplicate-in-place.
#[test]
fn trl4_zero_move_cloned_commit_is_duplicate() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    let before = roots(&editor);
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 0.0, 0.0, [630.0, 40.0], true, Phase::Commit),
    );
    let after = roots(&editor);
    assert_eq!(after.len(), before.len() + 1);
    let ai = after.iter().position(|id| id == "A").unwrap();
    let clone_id = after[ai + 1].clone();
    assert_eq!(
        editor.node_position(&clone_id).unwrap(),
        (600.0, 0.0),
        "duplicate-in-place"
    );
    assert_eq!(editor.history_len(), 1);
}

// A cloned commit arms repeat-offset duplication with the *measured*
// delta — drag-clone then repeated duplicates step-and-repeat, and a
// nudge in between re-measures.
#[test]
fn trl4_cloned_commit_arms_measured_repeat() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], 30.0, 0.0, [630.0, 40.0], true, Phase::Commit),
    );
    let clone_id = editor.selection()[0].clone();
    assert_eq!(editor.node_position(&clone_id).unwrap(), (630.0, 0.0));

    let scene = HierScene::of(&editor);
    assert_eq!(
        interp.duplicate_offset(&editor, &scene),
        [30.0, 0.0],
        "armed with the clone gesture's offset"
    );

    // The repeat: one entry, the new clone lands at +30 again, and
    // the arming re-points so the next repeat steps once more.
    let offset = interp.duplicate_offset(&editor, &scene);
    interp.duplicate(&mut editor, offset);
    let second = editor.selection()[0].clone();
    assert_ne!(second, clone_id);
    assert_eq!(editor.node_position(&second).unwrap(), (660.0, 0.0));
    assert_eq!(editor.history_len(), 2, "duplicate is its own single entry");

    // Measured, not stored: nudge the newest clone, then repeat — the
    // offset is whatever the pair measures *now*.
    interp.nudge(&mut editor, std::slice::from_ref(&second), 10.0, 0.0);
    let scene = HierScene::of(&editor);
    assert_eq!(interp.duplicate_offset(&editor, &scene), [40.0, 0.0]);
    let offset = interp.duplicate_offset(&editor, &scene);
    interp.duplicate(&mut editor, offset);
    let third = editor.selection()[0].clone();
    assert_eq!(editor.node_position(&third).unwrap(), (710.0, 0.0));

    // Undo unwinds one duplicate at a time.
    assert!(editor.undo());
    assert!(!editor.document().contains(&third));
    assert!(editor.document().contains(&second));
}

// An unarmed duplicate (fresh selection) clones in place.
#[test]
fn duplicate_unarmed_is_in_place() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    let scene = HierScene::of(&editor);
    let offset = interp.duplicate_offset(&editor, &scene);
    assert_eq!(offset, [0.0, 0.0]);
    interp.duplicate(&mut editor, offset);
    let clone_id = editor.selection()[0].clone();
    assert_ne!(clone_id, "A".to_string());
    assert_eq!(editor.node_position(&clone_id).unwrap(), (600.0, 0.0));
    let after = roots(&editor);
    let ai = after.iter().position(|id| id == "A").unwrap();
    assert_eq!(after[ai + 1], clone_id, "next sibling of its origin");
}

// Clones re-parent like any moving content: dragging with the
// modifier over a container drops the *clone* in it; the origin rests
// where it was.
#[test]
fn clone_reparents_while_origin_rests() {
    let mut editor = fixture();
    let mut interp = Interpreter::new();
    editor.set_selection(vec!["A".to_string()]);
    drive(
        &mut interp,
        &mut editor,
        translate(&["A"], -450.0, 150.0, [280.0, 280.0], true, Phase::Commit),
    );
    assert_eq!(parent(&editor, "A"), None, "the origin rests at the root");
    assert_eq!(pos(&editor, "A"), (600.0, 0.0));
    let clone_id = editor.selection()[0].clone();
    assert_eq!(
        editor.document().node_parent(&clone_id).flatten(),
        Some("P".to_string()),
        "the clone entered the container"
    );
    assert_eq!(editor.node_position(&clone_id).unwrap(), (50.0, 50.0));
    // One undo unwinds the whole structural ride (TRL-3/9).
    assert!(editor.undo());
    assert!(!editor.document().contains(&clone_id));
    assert_eq!(editor.children(Some(&"P".to_string())).len(), 2);
}
