//! Selection partition & grouping conformance (`PART-*`, `GRP-*`) —
//! [selection-partition.md](../../../docs/wg/canvas/ux-surface/selection-partition.md)
//! and [grouping.md](../../../docs/wg/canvas/grouping.md).
//!
//! Headless, like [`align_contracts`]: the resolvers
//! ([`grida_editor::grouping`]) are pure functions of the working copy
//! plus a world-bounds oracle composed from the document graph
//! ([`WorkingCopy::node_world_transform`]) — the same placement the
//! renderer paints. Each test resolves a batch, applies it as one
//! recorded entry, and re-reads the mutated graph.

use std::collections::HashMap;

use grida::cg::types::CGPoint;
use grida::node::factory::NodeFactory;
use grida::node::id::NodeId;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{LayoutPositioningBasis, Node, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use grida_editor::document::{Id, Mutation, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::grouping::{self, WrapKind};
use grida_editor::history::Origin;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const EPS: f32 = 1e-3;

fn near(a: f32, b: f32) -> bool {
    (a - b).abs() < EPS
}

fn ids(list: &[&str]) -> Vec<Id> {
    list.iter().map(|s| s.to_string()).collect()
}

/// The world-space AABB for `id`: its local box swept through the
/// composed world transform (the oracle the resolver consumes).
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

fn oracle(doc: &WorkingCopy, sizes: &[(&str, f32, f32)]) -> HashMap<Id, Rectangle> {
    sizes
        .iter()
        .map(|(id, w, h)| ((*id).to_string(), world_aabb(doc, id, *w, *h)))
        .collect()
}

/// Apply a resolved batch as a single recorded entry.
fn apply(editor: &mut Editor, batch: Vec<Mutation>) {
    editor
        .dispatch(batch, Origin::Local, Recording::Record { label: None })
        .expect("batch applies");
}

/// Deterministic wrapper-id minter: `grp1`, `grp2`, … (the ids a test
/// can predict without capturing the closure).
fn minter() -> impl FnMut() -> Id {
    let mut n = 0;
    move || {
        n += 1;
        format!("grp{n}")
    }
}

/// A rectangle under `parent`, local `(x, y)`, size `(w, h)`.
fn rect_child(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    id_map: &mut HashMap<NodeId, Id>,
    parent: Parent,
    id: &str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> NodeId {
    let mut n = nf.create_rectangle_node();
    n.transform = AffineTransform::new(x, y, 0.0);
    n.size = Size {
        width: w,
        height: h,
    };
    let iid = graph.append_child(Node::Rectangle(n), parent);
    id_map.insert(iid, id.to_string());
    iid
}

/// A cartesian container under `parent`.
fn container_child(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    id_map: &mut HashMap<NodeId, Id>,
    parent: Parent,
    id: &str,
    x: f32,
    y: f32,
) -> NodeId {
    let mut c = nf.create_container_node();
    c.position = LayoutPositioningBasis::Cartesian(CGPoint { x, y });
    let iid = graph.append_child(Node::Container(c), parent);
    id_map.insert(iid, id.to_string());
    iid
}

fn editor_of(graph: SceneGraph, id_map: HashMap<NodeId, Id>) -> Editor {
    Editor::new(WorkingCopy::from_scene(
        Scene {
            name: "grp-tests".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ))
}

// ---------------------------------------------------------------------------
// PART-1 — the partition function
// ---------------------------------------------------------------------------

#[test]
fn part_1_partitions_by_direct_parent_in_sibling_order() {
    // F1 { A, B }, F2 { C }, and a root-level D.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    let f1 = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F1", 0.0, 0.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f1),
        "A",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f1),
        "B",
        20.0,
        0.0,
        10.0,
        10.0,
    );
    let f2 = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F2", 300.0, 0.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f2),
        "C",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "D",
        500.0,
        0.0,
        10.0,
        10.0,
    );
    let editor = editor_of(graph, id_map);

    // Selection order is scrambled; the partition orders by first
    // appearance, members by *document sibling* order (so [A, B], not
    // [B, A]).
    let parts = editor
        .document()
        .partition_selection(&ids(&["B", "C", "D", "A"]));

    assert_eq!(parts.len(), 3, "three parents → three partitions");
    assert_eq!(parts[0], (Some("F1".to_string()), ids(&["A", "B"])));
    assert_eq!(parts[1], (Some("F2".to_string()), ids(&["C"])));
    // Root-level members share the scene (`None`) partition (`PART-1`).
    assert_eq!(parts[2], (None, ids(&["D"])));
}

// ---------------------------------------------------------------------------
// GRP-1 — one wrapper per partition
// ---------------------------------------------------------------------------

#[test]
fn grp_1_wraps_once_per_partition() {
    // A, B under F1; C under F2. Grouping the cross-parent selection
    // yields one wrapper per partition, never one across (`GRP-1`).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    let f1 = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F1", 0.0, 0.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f1),
        "A",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f1),
        "B",
        40.0,
        0.0,
        10.0,
        10.0,
    );
    let f2 = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F2", 300.0, 0.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f2),
        "C",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    let mut editor = editor_of(graph, id_map);

    let ob = oracle(
        editor.document(),
        &[("A", 10.0, 10.0), ("B", 10.0, 10.0), ("C", 10.0, 10.0)],
    );
    let batch = grouping::group(
        editor.document(),
        &ids(&["A", "B", "C"]),
        |id| ob.get(id).copied(),
        WrapKind::Group,
        minter(),
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let doc = editor.document();
    // grp1 under F1 adopts {A, B}; grp2 under F2 adopts {C}.
    assert_eq!(doc.children(Some(&"grp1".to_string())), ids(&["A", "B"]));
    assert_eq!(doc.children(Some(&"grp2".to_string())), ids(&["C"]));
    assert_eq!(
        doc.node_parent(&"grp1".to_string()),
        Some(Some("F1".to_string()))
    );
    assert_eq!(
        doc.node_parent(&"grp2".to_string()),
        Some(Some("F2".to_string()))
    );
    // F1 now holds the wrapper in place of its former children.
    assert_eq!(doc.children(Some(&"F1".to_string())), ids(&["grp1"]));
    assert!(doc.node_is_group(&"grp1".to_string()));
}

// ---------------------------------------------------------------------------
// GRP-2 — world position preserved
// ---------------------------------------------------------------------------

#[test]
fn grp_2_world_position_preserved_under_a_nested_parent() {
    // A, B inside a translated container F. Grouping them must not move
    // their painted position (`GRP-2`) — the wrapper sits at their union
    // and each member re-anchors into it.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    let f = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F", 100.0, 50.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f),
        "A",
        10.0,
        10.0,
        20.0,
        20.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f),
        "B",
        60.0,
        30.0,
        20.0,
        20.0,
    );
    let mut editor = editor_of(graph, id_map);

    let sizes = [("A", 20.0, 20.0), ("B", 20.0, 20.0)];
    let before = oracle(editor.document(), &sizes);
    let batch = grouping::group(
        editor.document(),
        &ids(&["A", "B"]),
        |id| before.get(id).copied(),
        WrapKind::Group,
        minter(),
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let after = oracle(editor.document(), &sizes);
    for id in ["A", "B"] {
        let b = before.get(id).unwrap();
        let a = after.get(id).unwrap();
        assert!(near(a.x, b.x) && near(a.y, b.y), "{id} world position held");
    }
}

// ---------------------------------------------------------------------------
// GRP-3 — depth: the wrapper takes the frontmost slot
// ---------------------------------------------------------------------------

#[test]
fn grp_3_wrapper_lands_at_the_partitions_lowest_index() {
    // Root order: X, A, Y, B. Grouping {A, B} inserts the wrapper at
    // index 1 (A's slot, the lowest among the members), leaving X ahead
    // and Y after (`GRP-3`).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "X",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "A",
        20.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "Y",
        40.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "B",
        60.0,
        0.0,
        10.0,
        10.0,
    );
    let mut editor = editor_of(graph, id_map);

    let ob = oracle(editor.document(), &[("A", 10.0, 10.0), ("B", 10.0, 10.0)]);
    let batch = grouping::group(
        editor.document(),
        &ids(&["A", "B"]),
        |id| ob.get(id).copied(),
        WrapKind::Group,
        minter(),
    )
    .expect("resolves");
    apply(&mut editor, batch);

    assert_eq!(editor.document().children(None), ids(&["X", "grp1", "Y"]));
}

// ---------------------------------------------------------------------------
// GRP-4 — ungroup is the inverse
// ---------------------------------------------------------------------------

#[test]
fn grp_4_ungroup_restores_tree_and_geometry() {
    // Group {A, B} under F, then ungroup: the tree and every member's
    // world position return to the start (`GRP-4`).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    let f = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F", 100.0, 50.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f),
        "A",
        10.0,
        10.0,
        20.0,
        20.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f),
        "B",
        60.0,
        30.0,
        20.0,
        20.0,
    );
    let mut editor = editor_of(graph, id_map);

    let sizes = [("A", 20.0, 20.0), ("B", 20.0, 20.0)];
    let before = oracle(editor.document(), &sizes);
    let before_children = editor.document().children(Some(&"F".to_string()));

    let batch = grouping::group(
        editor.document(),
        &ids(&["A", "B"]),
        |id| before.get(id).copied(),
        WrapKind::Group,
        minter(),
    )
    .expect("group resolves");
    apply(&mut editor, batch);

    let batch =
        grouping::ungroup(editor.document(), &"grp1".to_string()).expect("ungroup resolves");
    apply(&mut editor, batch);

    // The wrapper is gone; F holds A, B again in order, at their
    // original world positions.
    assert!(!editor.document().node_is_group(&"grp1".to_string()));
    assert_eq!(
        editor.document().children(Some(&"F".to_string())),
        before_children
    );
    let after = oracle(editor.document(), &sizes);
    for id in ["A", "B"] {
        let b = before.get(id).unwrap();
        let a = after.get(id).unwrap();
        assert!(
            near(a.x, b.x) && near(a.y, b.y),
            "{id} world position restored"
        );
    }
}

#[test]
fn grp_4_multi_group_ungroup_composes_in_descending_index() {
    // Two sibling groups under root. The ungroup resolver is single-id;
    // dissolving both in one batch is index-safe only when they are
    // processed front-to-back in *descending* sibling index (an earlier,
    // higher-index dissolve can't shift a later, lower-index target slot)
    // — the shell's `ungroup_selection` ordering. This is that ordering's
    // arbiter: the concatenated batch restores the tree and geometry.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    for (id, x) in [("A", 0.0), ("B", 20.0), ("C", 40.0), ("D", 60.0)] {
        rect_child(
            &nf,
            &mut graph,
            &mut id_map,
            Parent::Root,
            id,
            x,
            0.0,
            10.0,
            10.0,
        );
    }
    let mut editor = editor_of(graph, id_map);
    let sizes = [
        ("A", 10.0, 10.0),
        ("B", 10.0, 10.0),
        ("C", 10.0, 10.0),
        ("D", 10.0, 10.0),
    ];
    let before = oracle(editor.document(), &sizes);

    // Two single-parent group calls sharing one minter → grp1 {A,B} at
    // index 0, grp2 {C,D} at index 1.
    let mut mint = minter();
    let ob = oracle(editor.document(), &sizes);
    let b1 = grouping::group(
        editor.document(),
        &ids(&["A", "B"]),
        |id| ob.get(id).copied(),
        WrapKind::Group,
        &mut mint,
    )
    .expect("g1 resolves");
    apply(&mut editor, b1);
    let ob = oracle(editor.document(), &sizes);
    let b2 = grouping::group(
        editor.document(),
        &ids(&["C", "D"]),
        |id| ob.get(id).copied(),
        WrapKind::Group,
        &mut mint,
    )
    .expect("g2 resolves");
    apply(&mut editor, b2);
    assert_eq!(editor.document().children(None), ids(&["grp1", "grp2"]));

    // Dissolve both, ordered descending by sibling index (grp2 before
    // grp1), concatenated as one batch — the shell's composition.
    let mut groups = ids(&["grp1", "grp2"]);
    {
        let doc = editor.document();
        let sibs = doc.children(None);
        groups.sort_by_key(|id| std::cmp::Reverse(sibs.iter().position(|s| s == id).unwrap_or(0)));
    }
    let mut batch = Vec::new();
    for g in &groups {
        batch.extend(grouping::ungroup(editor.document(), g).expect("ungroup resolves"));
    }
    apply(&mut editor, batch);

    // Tree and every member's world position restored exactly.
    assert_eq!(editor.document().children(None), ids(&["A", "B", "C", "D"]));
    let after = oracle(editor.document(), &sizes);
    for id in ["A", "B", "C", "D"] {
        let b = before.get(id).unwrap();
        let a = after.get(id).unwrap();
        assert!(
            near(a.x, b.x) && near(a.y, b.y),
            "{id} world position restored"
        );
    }
}

#[test]
fn grp_5_retarget_targets_are_resolver_derived() {
    // GRP-5's selection retarget runs shell-side (`set_selection`); its
    // *targets* are resolver-derived and asserted here: after a wrap the
    // targets are the minted wrappers, after an ungroup they are the
    // promoted children (now under the wrapper's old parent).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    // A, B at root; C inside a container F — a cross-parent selection so
    // the wrap mints two wrappers.
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "A",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "B",
        20.0,
        0.0,
        10.0,
        10.0,
    );
    let f = container_child(&nf, &mut graph, &mut id_map, Parent::Root, "F", 300.0, 0.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f),
        "C",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    let mut editor = editor_of(graph, id_map);

    let ob = oracle(
        editor.document(),
        &[("A", 10.0, 10.0), ("B", 10.0, 10.0), ("C", 10.0, 10.0)],
    );
    // The shell's capturing minter: it records exactly what it hands out
    // (the wrap-retarget target set).
    let mut n = 0;
    let mut minted: Vec<Id> = Vec::new();
    let batch = grouping::group(
        editor.document(),
        &ids(&["A", "B", "C"]),
        |id| ob.get(id).copied(),
        WrapKind::Group,
        || {
            n += 1;
            let id = format!("grp{n}");
            minted.push(id.clone());
            id
        },
    )
    .expect("group resolves");
    apply(&mut editor, batch);
    // GRP-5 (wrap): the retarget targets are exactly the new wrappers.
    assert_eq!(minted, ids(&["grp1", "grp2"]));
    for w in &minted {
        assert!(editor.document().node_is_group(w), "{w} is a new wrapper");
    }

    // GRP-5 (ungroup): the targets are the wrapper's children, read before
    // the dissolve, and they land under the wrapper's old parent (root).
    let promoted = editor.document().children(Some(&"grp1".to_string()));
    assert_eq!(promoted, ids(&["A", "B"]));
    let batch =
        grouping::ungroup(editor.document(), &"grp1".to_string()).expect("ungroup resolves");
    apply(&mut editor, batch);
    assert!(!editor.document().node_is_group(&"grp1".to_string()));
    let root = editor.document().children(None);
    for c in &promoted {
        assert!(root.contains(c), "{c} promoted to the wrapper's parent");
    }
}

#[test]
fn grp_4_ungroup_declines_on_a_non_group() {
    // A plain rectangle is not a dissolvable wrapper.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "A",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    let editor = editor_of(graph, id_map);
    assert!(grouping::ungroup(editor.document(), &"A".to_string()).is_none());
}

// ---------------------------------------------------------------------------
// Container wrap — the other WrapKind
// ---------------------------------------------------------------------------

#[test]
fn grp_1_container_wrap_produces_a_container_not_a_group() {
    // `group with container` (Mod+Alt+G) wraps into a container, which
    // is not a dissolvable group.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "A",
        0.0,
        0.0,
        10.0,
        10.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "B",
        40.0,
        0.0,
        10.0,
        10.0,
    );
    let mut editor = editor_of(graph, id_map);

    let ob = oracle(editor.document(), &[("A", 10.0, 10.0), ("B", 10.0, 10.0)]);
    let batch = grouping::group(
        editor.document(),
        &ids(&["A", "B"]),
        |id| ob.get(id).copied(),
        WrapKind::Container,
        minter(),
    )
    .expect("resolves");
    apply(&mut editor, batch);

    let doc = editor.document();
    assert_eq!(doc.children(Some(&"grp1".to_string())), ids(&["A", "B"]));
    // A container is an adoption target and not a dissolvable group.
    assert_eq!(doc.node_adopts(&"grp1".to_string()), Some(true));
    assert!(!doc.node_is_group(&"grp1".to_string()));
}
