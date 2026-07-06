//! Align & distribute conformance (`ALIGN-*`) —
//! [align.md](../../../docs/wg/canvas/align.md).
//!
//! Headless: the resolver ([`grida_editor::align`]) is a pure function
//! of the working copy plus a world-bounds oracle. These tests supply
//! that oracle by composing each node's world AABB from the document
//! graph ([`WorkingCopy::node_world_transform`]) — the same placement
//! the renderer paints — so rotation (`ALIGN-3`) and transformed
//! ancestors (`ALIGN-4`) are exercised without a GL surface. Each test
//! resolves a batch, applies it as one recorded entry, then re-reads
//! the mutated graph.

use std::collections::HashMap;

use grida::cg::types::{CGPoint, LayoutMode, LayoutPositioning};
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{LayoutChildStyle, LayoutPositioningBasis, Node, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use grida_editor::align::{self, Align, Distribute};
use grida_editor::document::{Id, Mutation, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/// A rectangle spec: id, local `(x, y)`, size `(w, h)`.
struct Rect {
    id: &'static str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    rotation: f32,
}

fn rect(id: &'static str, x: f32, y: f32, w: f32, h: f32) -> Rect {
    Rect {
        id,
        x,
        y,
        w,
        h,
        rotation: 0.0,
    }
}

/// The world-space AABB the resolver's oracle returns for `id`: the
/// node's local box swept through its composed world transform.
fn world_aabb(doc: &WorkingCopy, id: &str, w: f32, h: f32) -> Rectangle {
    let m = doc.node_world_transform(&id.to_string()).matrix;
    let pt = |x: f32, y: f32| {
        [
            m[0][0] * x + m[0][1] * y + m[0][2],
            m[1][0] * x + m[1][1] * y + m[1][2],
        ]
    };
    Rectangle::from_points(&[pt(0.0, 0.0), pt(w, 0.0), pt(w, h), pt(0.0, h)])
}

/// Build the `(id → world AABB)` oracle over a size table against the
/// current document state.
fn oracle(doc: &WorkingCopy, sizes: &[(&str, f32, f32)]) -> HashMap<Id, Rectangle> {
    sizes
        .iter()
        .map(|(id, w, h)| ((*id).to_string(), world_aabb(doc, id, *w, *h)))
        .collect()
}

fn ids(list: &[&str]) -> Vec<Id> {
    list.iter().map(|s| s.to_string()).collect()
}

/// Apply a resolved batch as a single recorded entry (`ALIGN-7`).
fn apply(editor: &mut Editor, batch: Vec<Mutation>) {
    editor
        .dispatch(batch, Origin::Local, Recording::Record { label: None })
        .expect("batch applies");
}

/// An editor over a flat list of top-level rectangles.
fn flat_editor(rects: &[Rect]) -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    for r in rects {
        let mut node = nf.create_rectangle_node();
        node.transform = AffineTransform::new(r.x, r.y, r.rotation);
        node.size = Size {
            width: r.w,
            height: r.h,
        };
        let iid = graph.append_child(Node::Rectangle(node), Parent::Root);
        id_map.insert(iid, r.id.to_string());
    }
    Editor::new(WorkingCopy::from_scene(
        Scene {
            name: "align-tests".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ))
}

const EPS: f32 = 1e-3;

fn near(a: f32, b: f32) -> bool {
    (a - b).abs() < EPS
}

// ---------------------------------------------------------------------------
// ALIGN-1 — the reference-frame flip
// ---------------------------------------------------------------------------

#[test]
fn align_1_many_nodes_align_within_the_union_which_never_moves() {
    // Three rects at different x; align-left. The union's left edge is
    // the shared frame; every member's left lands on it and the union
    // is invariant.
    let rects = [
        rect("A", 0.0, 0.0, 80.0, 80.0),
        rect("B", 200.0, 0.0, 60.0, 80.0),
        rect("C", 500.0, 0.0, 40.0, 80.0),
    ];
    let sizes = [("A", 80.0, 80.0), ("B", 60.0, 80.0), ("C", 40.0, 80.0)];
    let mut editor = flat_editor(&rects);

    let before = oracle(editor.document(), &sizes);
    let union_before = math2::rect::union(&before.values().copied().collect::<Vec<_>>());

    let batch = align::align(
        editor.document(),
        &ids(&["A", "B", "C"]),
        |id| before.get(id).copied(),
        Align::Left,
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let after = oracle(editor.document(), &sizes);
    let union_after = math2::rect::union(&after.values().copied().collect::<Vec<_>>());
    // Every member's left edge is the union's left edge, and each stays
    // *within* the original union — alignment redistributes inside the
    // frame, it never pushes a member out (`ALIGN-1`).
    for r in &after {
        assert!(near(r.1.x, union_before.x), "member {} left", r.0);
        assert!(
            r.1.x + r.1.width <= union_before.x + union_before.width + EPS,
            "member {} stays within the union",
            r.0
        );
    }
    // The aligned edge — the union's left — is invariant (`ALIGN-1`).
    // (The union's *width* collapses as members stack left; only the
    // reference edge is preserved, not the whole AABB.)
    assert!(near(union_after.x, union_before.x));
}

#[test]
fn align_1_single_node_centers_in_its_parent_which_stays_fixed() {
    // A rect inside a (normal) container; align-h-centers targets the
    // parent frame.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();

    let mut c = nf.create_container_node();
    c.position = LayoutPositioningBasis::Cartesian(CGPoint { x: 0.0, y: 0.0 });
    c.layout_dimensions.layout_target_width = Some(400.0);
    c.layout_dimensions.layout_target_height = Some(300.0);
    let cid = graph.append_child(Node::Container(c), Parent::Root);
    id_map.insert(cid, "F".to_string());

    let mut child = nf.create_rectangle_node();
    child.transform = AffineTransform::new(10.0, 10.0, 0.0);
    child.size = Size {
        width: 80.0,
        height: 80.0,
    };
    let rid = graph.append_child(Node::Rectangle(child), Parent::NodeId(cid));
    id_map.insert(rid, "R".to_string());

    let mut editor = Editor::new(WorkingCopy::from_scene(
        Scene {
            name: "align-parent".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ));

    let sizes = [("F", 400.0, 300.0), ("R", 80.0, 80.0)];
    let before = oracle(editor.document(), &sizes);
    let parent_before = *before.get("F").unwrap();

    let batch = align::align(
        editor.document(),
        &ids(&["R"]),
        |id| before.get(id).copied(),
        Align::HCenter,
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let after = oracle(editor.document(), &sizes);
    // The child is centered in the parent; the parent did not move.
    assert!(near(
        after.get("R").unwrap().center()[0],
        parent_before.center()[0]
    ));
    assert!(near(after.get("F").unwrap().x, parent_before.x));
    assert!(near(after.get("F").unwrap().y, parent_before.y));
}

// ---------------------------------------------------------------------------
// ALIGN-2 — top-level single-node align declines
// ---------------------------------------------------------------------------

#[test]
fn align_2_top_level_single_node_declines() {
    let rects = [rect("A", 10.0, 10.0, 80.0, 80.0)];
    let editor = flat_editor(&rects);
    let bounds = oracle(editor.document(), &[("A", 80.0, 80.0)]);
    for op in [Align::Left, Align::HCenter, Align::Bottom] {
        assert!(
            align::align(
                editor.document(),
                &ids(&["A"]),
                |id| bounds.get(id).copied(),
                op
            )
            .is_none(),
            "top-level single node has no frame ({op:?})"
        );
    }
}

// ---------------------------------------------------------------------------
// ALIGN-3 — rotation aligns by world AABB
// ---------------------------------------------------------------------------

#[test]
fn align_3_rotated_member_aligns_by_its_world_aabb() {
    // A 90°-rotated non-square rect plus an upright one; align-left.
    let mut rotated = rect("R", 200.0, 50.0, 80.0, 40.0);
    rotated.rotation = std::f32::consts::FRAC_PI_2;
    let rects = [rotated, rect("U", 20.0, 0.0, 80.0, 80.0)];
    let sizes = [("R", 80.0, 40.0), ("U", 80.0, 80.0)];
    let mut editor = flat_editor(&rects);

    let before = oracle(editor.document(), &sizes);
    let frame = math2::rect::union(&before.values().copied().collect::<Vec<_>>());
    // Sanity: the rotated node's world AABB is not its 80×40 local box.
    assert!(before.get("R").unwrap().width > 39.0 && before.get("R").unwrap().width < 41.0);

    let batch = align::align(
        editor.document(),
        &ids(&["R", "U"]),
        |id| before.get(id).copied(),
        Align::Left,
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let after = oracle(editor.document(), &sizes);
    // After align-left the rotated node's *world AABB* left edge meets
    // the frame — its rotation is preserved (align never rotates).
    assert!(near(after.get("R").unwrap().x, frame.x));
}

// ---------------------------------------------------------------------------
// ALIGN-4 — mixed / transformed parents; commit in the member's frame
// ---------------------------------------------------------------------------

#[test]
fn align_4_member_under_scaled_parent_commits_in_parent_coordinates() {
    // A child under a 2× scaled + translated group, aligned to a shared
    // world frame with a root sibling. The world AABBs align exactly,
    // and the child's committed position is the world delta *projected*
    // into its parent frame (halved by the parent scale).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();

    let mut group = nf.create_group_node();
    group.transform = Some(AffineTransform::from_acebdf(
        2.0, 0.0, 300.0, 0.0, 2.0, 200.0,
    ));
    let gid = graph.append_child(Node::Group(group), Parent::Root);
    id_map.insert(gid, "G".to_string());

    let mut child = nf.create_rectangle_node();
    child.transform = AffineTransform::new(0.0, 0.0, 0.0);
    child.size = Size {
        width: 80.0,
        height: 80.0,
    };
    let cid = graph.append_child(Node::Rectangle(child), Parent::NodeId(gid));
    id_map.insert(cid, "C".to_string());

    // Root sibling at world x = 100 — the leftmost, so it anchors the
    // frame's left edge and does not move.
    let mut sib = nf.create_rectangle_node();
    sib.transform = AffineTransform::new(100.0, 500.0, 0.0);
    sib.size = Size {
        width: 80.0,
        height: 80.0,
    };
    let sid = graph.append_child(Node::Rectangle(sib), Parent::Root);
    id_map.insert(sid, "S".to_string());

    let mut editor = Editor::new(WorkingCopy::from_scene(
        Scene {
            name: "align-mixed".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ));

    let sizes = [("C", 80.0, 80.0), ("S", 80.0, 80.0)];
    let before = oracle(editor.document(), &sizes);
    // Child world AABB left starts at 300; sibling at 100.
    assert!(near(before.get("C").unwrap().x, 300.0));
    let frame = math2::rect::union(&before.values().copied().collect::<Vec<_>>());
    assert!(near(frame.x, 100.0));

    let batch = align::align(
        editor.document(),
        &ids(&["C", "S"]),
        |id| before.get(id).copied(),
        Align::Left,
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let after = oracle(editor.document(), &sizes);
    // World AABBs meet the frame (`ALIGN-4` exactness) …
    assert!(near(after.get("C").unwrap().x, 100.0));
    assert!(near(after.get("S").unwrap().x, 100.0));
    // … and the commit is expressed in the child's own (scaled) parent
    // frame: a −200 world shift becomes a −100 local move.
    let child_local = editor.document().node_position(&"C".to_string()).unwrap();
    assert!(
        near(child_local.0, -100.0),
        "child local x = {}",
        child_local.0
    );
}

// ---------------------------------------------------------------------------
// ALIGN-5 — distribute
// ---------------------------------------------------------------------------

#[test]
fn align_5_distribute_equalizes_gaps_and_holds_the_outermost() {
    // Three rects with uneven spacing; distribute horizontally.
    let rects = [
        rect("A", 0.0, 0.0, 80.0, 80.0),
        rect("B", 100.0, 0.0, 80.0, 80.0),
        rect("C", 300.0, 0.0, 80.0, 80.0),
    ];
    let sizes = [("A", 80.0, 80.0), ("B", 80.0, 80.0), ("C", 80.0, 80.0)];
    let mut editor = flat_editor(&rects);

    let before = oracle(editor.document(), &sizes);
    let (ax, cx) = (before.get("A").unwrap().x, before.get("C").unwrap().x);

    let batch = align::distribute(
        editor.document(),
        &ids(&["A", "B", "C"]),
        |id| before.get(id).copied(),
        Distribute::Horizontal,
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let after = oracle(editor.document(), &sizes);
    let a = after.get("A").unwrap();
    let b = after.get("B").unwrap();
    let c = after.get("C").unwrap();
    // Outermost members held their positions.
    assert!(near(a.x, ax));
    assert!(near(c.x, cx));
    // Adjacent edge-to-edge gaps are equal.
    let gap1 = b.x - (a.x + a.width);
    let gap2 = c.x - (b.x + b.width);
    assert!(near(gap1, gap2), "gaps {gap1} vs {gap2}");
}

#[test]
fn align_5_distribute_declines_below_three() {
    let rects = [
        rect("A", 0.0, 0.0, 80.0, 80.0),
        rect("B", 300.0, 0.0, 80.0, 80.0),
    ];
    let editor = flat_editor(&rects);
    let bounds = oracle(editor.document(), &[("A", 80.0, 80.0), ("B", 80.0, 80.0)]);
    assert!(
        align::distribute(
            editor.document(),
            &ids(&["A", "B"]),
            |id| bounds.get(id).copied(),
            Distribute::Horizontal,
        )
        .is_none()
    );
}

// ---------------------------------------------------------------------------
// ALIGN-6 — auto-layout members are excluded
// ---------------------------------------------------------------------------

/// A flex container holding two children; the second is optionally
/// `Absolute`. Returns the editor and the child ids.
fn flex_editor(second_absolute: bool) -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();

    let mut c = nf.create_container_node();
    c.layout_container.layout_mode = LayoutMode::Flex;
    c.layout_dimensions.layout_target_width = Some(400.0);
    c.layout_dimensions.layout_target_height = Some(400.0);
    let cid = graph.append_child(Node::Container(c), Parent::Root);
    id_map.insert(cid, "F".to_string());

    for (i, id) in ["X", "Y"].iter().enumerate() {
        let mut r = nf.create_rectangle_node();
        r.transform = AffineTransform::new(10.0 + i as f32 * 100.0, 10.0, 0.0);
        r.size = Size {
            width: 80.0,
            height: 80.0,
        };
        if *id == "Y" && second_absolute {
            r.layout_child = Some(LayoutChildStyle {
                layout_grow: 0.0,
                layout_positioning: LayoutPositioning::Absolute,
            });
        }
        let rid = graph.append_child(Node::Rectangle(r), Parent::NodeId(cid));
        id_map.insert(rid, id.to_string());
    }

    Editor::new(WorkingCopy::from_scene(
        Scene {
            name: "align-flex".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ))
}

#[test]
fn align_6_is_layout_owned_predicate() {
    // In-flow child under Flex is owned; the Absolute one opts out.
    let editor = flex_editor(true);
    let doc = editor.document();
    assert!(
        doc.is_layout_owned(&"X".to_string()),
        "Auto child under Flex"
    );
    assert!(
        !doc.is_layout_owned(&"Y".to_string()),
        "Absolute child under Flex"
    );
    assert!(
        !doc.is_layout_owned(&"F".to_string()),
        "the container itself"
    );

    // A child under a *normal* container is not layout-owned.
    let normal = flat_editor(&[rect("A", 0.0, 0.0, 80.0, 80.0)]);
    assert!(!normal.document().is_layout_owned(&"A".to_string()));
}

#[test]
fn align_6_all_in_flow_selection_declines() {
    // Both children ride the flow; align has nothing to author.
    let editor = flex_editor(false);
    let bounds = oracle(editor.document(), &[("X", 80.0, 80.0), ("Y", 80.0, 80.0)]);
    assert!(
        align::align(
            editor.document(),
            &ids(&["X", "Y"]),
            |id| bounds.get(id).copied(),
            Align::Left,
        )
        .is_none(),
        "an all-in-flow selection declines with no entry"
    );
}

// ---------------------------------------------------------------------------
// ALIGN-7 — one entry per action; undo restores every member
// ---------------------------------------------------------------------------

#[test]
fn align_7_one_history_entry_and_undo_restores_all() {
    let rects = [
        rect("A", 0.0, 0.0, 80.0, 80.0),
        rect("B", 200.0, 0.0, 80.0, 80.0),
        rect("C", 500.0, 0.0, 80.0, 80.0),
    ];
    let sizes = [("A", 80.0, 80.0), ("B", 80.0, 80.0), ("C", 80.0, 80.0)];
    let mut editor = flat_editor(&rects);

    let before: HashMap<Id, (f32, f32)> = ["A", "B", "C"]
        .iter()
        .map(|id| {
            (
                id.to_string(),
                editor.document().node_position(&id.to_string()).unwrap(),
            )
        })
        .collect();
    let depth = editor.history_len();

    let bounds = oracle(editor.document(), &sizes);
    let batch = align::align(
        editor.document(),
        &ids(&["A", "B", "C"]),
        |id| bounds.get(id).copied(),
        Align::Left,
    )
    .expect("resolves");
    apply(&mut editor, batch);

    // Exactly one entry for the whole multi-node align.
    assert_eq!(editor.history_len(), depth + 1);
    // Something actually moved.
    assert_ne!(
        editor.document().node_position(&"B".to_string()).unwrap(),
        before["B"]
    );

    // One undo restores every member's prior position.
    assert!(editor.undo());
    for id in ["A", "B", "C"] {
        assert_eq!(
            editor.document().node_position(&id.to_string()).unwrap(),
            before[id],
            "member {id} restored"
        );
    }
}
