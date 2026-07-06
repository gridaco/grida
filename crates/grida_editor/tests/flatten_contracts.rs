//! Flatten conformance (`FLAT-*`) —
//! [flatten.md](../../../docs/wg/feat-vector-network/flatten.md).
//!
//! Headless: [`grida_editor::mode::flatten_selection`] combines each
//! selection partition's path-reducible members into one baked vector
//! and dispatches the result as one recorded entry. Tests build a
//! document, flatten, and re-read the mutated graph — the combined
//! vector's world bounds are composed from the graph
//! ([`WorkingCopy::node_world_transform`]), the same placement the
//! renderer paints.

use std::collections::HashMap;

use grida::cg::types::CGPoint;
use grida::node::factory::NodeFactory;
use grida::node::id::NodeId;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{LayoutPositioningBasis, Node, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use grida_editor::document::{Id, WorkingCopy};
use grida_editor::editor::Editor;
use grida_editor::mode::flatten_selection;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const EPS: f32 = 1e-2;

fn ids(list: &[&str]) -> Vec<Id> {
    list.iter().map(|s| s.to_string()).collect()
}

/// Deterministic minter for the combined vectors: `v1`, `v2`, …
fn minter() -> impl FnMut() -> Id {
    let mut n = 0;
    move || {
        n += 1;
        format!("v{n}")
    }
}

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
            name: "flat-tests".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ))
}

/// The combined vector's world-space vertex bounds — its network swept
/// through its composed world transform.
fn vector_world_bbox(doc: &WorkingCopy, id: &str) -> Rectangle {
    let net = doc
        .node_vector_network(&id.to_string())
        .expect("a vector node");
    let m = doc.node_world_transform(&id.to_string()).matrix;
    let pts: Vec<[f32; 2]> = net
        .vertices
        .iter()
        .map(|&(x, y)| {
            [
                m[0][0] * x + m[0][1] * y + m[0][2],
                m[1][0] * x + m[1][1] * y + m[1][2],
            ]
        })
        .collect();
    Rectangle::from_points(&pts)
}

fn near_rect(a: Rectangle, b: Rectangle) -> bool {
    (a.x - b.x).abs() < EPS
        && (a.y - b.y).abs() < EPS
        && (a.width - b.width).abs() < EPS
        && (a.height - b.height).abs() < EPS
}

// ---------------------------------------------------------------------------
// FLAT-1 — one baked vector per partition
// ---------------------------------------------------------------------------

#[test]
fn flat_1_combines_per_partition() {
    // A, B under F1; C under F2. Flattening the cross-parent selection
    // bakes one vector per partition (`FLAT-1`), never one across.
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
        20.0,
        20.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::NodeId(f1),
        "B",
        40.0,
        0.0,
        20.0,
        20.0,
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
        20.0,
        20.0,
    );
    let mut editor = editor_of(graph, id_map);

    assert!(flatten_selection(
        &mut editor,
        &ids(&["A", "B", "C"]),
        minter(),
        |_| None
    ));

    let doc = editor.document();
    // One baked vector under each parent; the originals are gone.
    assert_eq!(doc.children(Some(&"F1".to_string())), ids(&["v1"]));
    assert_eq!(doc.children(Some(&"F2".to_string())), ids(&["v2"]));
    assert!(doc.node_vector_network(&"v1".to_string()).is_some());
    assert!(doc.node_vector_network(&"v2".to_string()).is_some());
    // The originals no longer exist.
    assert_eq!(doc.node_parent(&"A".to_string()), None);
    assert_eq!(doc.node_parent(&"C".to_string()), None);
}

// ---------------------------------------------------------------------------
// FLAT-2 — non-path-reducible members are left in place
// ---------------------------------------------------------------------------

#[test]
fn flat_2_leaves_non_flattenable_members() {
    // Root: A, B (rects) + C (a container — not path-reducible).
    // Flattening {A, B, C} bakes A+B into one vector and leaves C.
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
        20.0,
        20.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "B",
        40.0,
        0.0,
        20.0,
        20.0,
    );
    container_child(&nf, &mut graph, &mut id_map, Parent::Root, "C", 100.0, 0.0);
    let mut editor = editor_of(graph, id_map);

    assert!(flatten_selection(
        &mut editor,
        &ids(&["A", "B", "C"]),
        minter(),
        |_| None
    ));

    let doc = editor.document();
    // The baked vector took the frontmost flattenable slot; C stayed.
    assert_eq!(doc.children(None), ids(&["v1", "C"]));
    assert!(doc.node_vector_network(&"v1".to_string()).is_some());
    // C is untouched — still a (non-vector) container.
    assert!(doc.node_vector_network(&"C".to_string()).is_none());
    assert_eq!(doc.node_parent(&"C".to_string()), Some(None));
}

#[test]
fn flat_declines_when_nothing_is_flattenable() {
    // A lone container — nothing to bake.
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    container_child(&nf, &mut graph, &mut id_map, Parent::Root, "C", 0.0, 0.0);
    let mut editor = editor_of(graph, id_map);
    assert!(!flatten_selection(
        &mut editor,
        &ids(&["C"]),
        minter(),
        |_| None
    ));
}

// ---------------------------------------------------------------------------
// FLAT-3 — world position preserved; one entry (undo restores)
// ---------------------------------------------------------------------------

#[test]
fn flat_3_world_position_preserved_and_undo_restores() {
    // A, B inside a translated container F. The baked vector must span
    // exactly their world union (`FLAT-3`), and one undo restores the
    // originals (a single recorded entry).
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

    // A world = (110, 60, 20, 20); B world = (160, 80, 20, 20).
    let union = Rectangle::from_points(&[[110.0, 60.0], [180.0, 100.0]]);
    let before_children = editor.document().children(Some(&"F".to_string()));

    assert!(flatten_selection(
        &mut editor,
        &ids(&["A", "B"]),
        minter(),
        |_| None
    ));

    // The baked vector spans the originals' world union exactly.
    assert!(
        near_rect(vector_world_bbox(editor.document(), "v1"), union),
        "baked vector world bounds == the members' union"
    );

    // One recorded entry — a single undo restores F's children.
    assert!(editor.undo());
    assert_eq!(
        editor.document().children(Some(&"F".to_string())),
        before_children
    );
    assert!(
        editor
            .document()
            .node_vector_network(&"v1".to_string())
            .is_none()
    );
}

// ---------------------------------------------------------------------------
// FLAT-2 — a vector node is itself flattenable (matches the web set)
// ---------------------------------------------------------------------------

#[test]
fn flat_includes_vector_members() {
    // Flattening rect A produces vector v1. A second flatten of {v1, B}
    // must include the VECTOR v1 — a vector node is flattenable (the
    // web's `self_flattenNode` uses its own network) — combining both
    // into v2.
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
        20.0,
        20.0,
    );
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "B",
        40.0,
        0.0,
        20.0,
        20.0,
    );
    let mut editor = editor_of(graph, id_map);
    let mut m = minter();

    // 1) rect A → vector v1.
    assert!(flatten_selection(&mut editor, &ids(&["A"]), &mut m, |_| {
        None
    }));
    assert!(
        editor
            .document()
            .node_vector_network(&"v1".to_string())
            .is_some()
    );

    // 2) {v1 (a vector), B (a rect)} → v2. If vectors were skipped, v1
    //    would survive and the combine would miss it.
    assert!(flatten_selection(
        &mut editor,
        &ids(&["v1", "B"]),
        &mut m,
        |_| None
    ));
    let doc = editor.document();
    assert_eq!(doc.children(None), ids(&["v2"]));
    assert!(doc.node_vector_network(&"v2".to_string()).is_some());
    assert_eq!(
        doc.node_parent(&"v1".to_string()),
        None,
        "the vector was consumed"
    );
    assert_eq!(doc.node_parent(&"B".to_string()), None);
}

// ---------------------------------------------------------------------------
// FLAT-2 — text delegates to the outliner and bakes into the union
// ---------------------------------------------------------------------------

fn text_child(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    id_map: &mut HashMap<NodeId, Id>,
    parent: Parent,
    id: &str,
    x: f32,
    y: f32,
) -> NodeId {
    let mut t = nf.create_text_span_node();
    t.transform = AffineTransform::new(x, y, 0.0);
    t.text = "Hi".to_string();
    let iid = graph.append_child(Node::TextSpan(t), parent);
    id_map.insert(iid, id.to_string());
    iid
}

#[test]
fn flat_delegates_text_into_the_union() {
    // A text node + a rect. Flattening with an outliner that outlines the
    // text bakes BOTH into one vector — text is delegated to the shared
    // Create Outlines conversion (`FLAT-2`).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    text_child(&nf, &mut graph, &mut id_map, Parent::Root, "T", 0.0, 0.0);
    rect_child(
        &nf,
        &mut graph,
        &mut id_map,
        Parent::Root,
        "B",
        40.0,
        0.0,
        20.0,
        20.0,
    );
    let mut editor = editor_of(graph, id_map);

    let glyphs = grida_editor::document::polyline_network(&[(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)]);
    let ok = flatten_selection(&mut editor, &ids(&["T", "B"]), minter(), |id| {
        (id.as_str() == "T").then(|| glyphs.clone())
    });
    assert!(ok);

    let doc = editor.document();
    // One combined vector; both originals (text + rect) consumed.
    assert_eq!(doc.children(None), ids(&["v1"]));
    assert!(doc.node_vector_network(&"v1".to_string()).is_some());
    assert_eq!(doc.node_parent(&"T".to_string()), None);
    assert_eq!(doc.node_parent(&"B".to_string()), None);

    // Without an outliner, the same text is left unflattened (`FLAT-2`).
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    text_child(&nf, &mut graph, &mut id_map, Parent::Root, "T", 0.0, 0.0);
    let mut editor = editor_of(graph, id_map);
    assert!(!flatten_selection(
        &mut editor,
        &ids(&["T"]),
        minter(),
        |_| None
    ));
    assert_eq!(editor.document().node_parent(&"T".to_string()), Some(None));
}
