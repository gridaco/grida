//! Create Outlines conformance (`OUTL-*`) —
//! [create-outlines.md](../../../docs/wg/feat-vector-network/create-outlines.md).
//!
//! Headless: [`grida_editor::mode::create_outlines`] takes an injected
//! outliner (`id -> network`), so the mutation logic — replace each text
//! node in place, leave non-text, one entry — is tested with a stub
//! network, no renderer or fonts. The font-backed conversion itself is
//! verified in the engine (`grida` crate, `tests/text_outline.rs`).

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::id::NodeId;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, Scene, Size};
use math2::transform::AffineTransform;

use grida_editor::document::{Id, WorkingCopy, polyline_network};
use grida_editor::editor::Editor;
use grida_editor::mode;

fn ids(list: &[&str]) -> Vec<Id> {
    list.iter().map(|s| s.to_string()).collect()
}

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

fn rect_child(
    nf: &NodeFactory,
    graph: &mut SceneGraph,
    id_map: &mut HashMap<NodeId, Id>,
    parent: Parent,
    id: &str,
) -> NodeId {
    let mut n = nf.create_rectangle_node();
    n.size = Size {
        width: 20.0,
        height: 20.0,
    };
    let iid = graph.append_child(Node::Rectangle(n), parent);
    id_map.insert(iid, id.to_string());
    iid
}

fn editor_with_text_and_rect() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    text_child(&nf, &mut graph, &mut id_map, Parent::Root, "T", 100.0, 50.0);
    rect_child(&nf, &mut graph, &mut id_map, Parent::Root, "R");
    Editor::new(WorkingCopy::from_scene(
        Scene {
            name: "outline-tests".to_string(),
            background_color: None,
            graph,
        },
        id_map,
    ))
}

/// A canned glyph-outline network the stub outliner hands back.
fn stub_network() -> grida::vectornetwork::VectorNetwork {
    polyline_network(&[(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)])
}

// ---------------------------------------------------------------------------
// OUTL-1 / OUTL-4 — per text node, in place; non-text left; not unioned
// ---------------------------------------------------------------------------

#[test]
fn outl_1_replaces_text_in_place_and_leaves_non_text() {
    let mut editor = editor_with_text_and_rect();
    let net = stub_network();

    let ok = mode::create_outlines(&mut editor, &ids(&["T", "R"]), |id| {
        (id.as_str() == "T").then(|| net.clone())
    });
    assert!(ok);

    let doc = editor.document();
    // T is now a vector at the SAME id and transform (OUTL-1).
    assert!(doc.node_vector_network(&"T".to_string()).is_some());
    assert_eq!(doc.node_parent(&"T".to_string()), Some(None));
    assert_eq!(doc.node_position(&"T".to_string()), Some((100.0, 50.0)));
    // R (a rectangle) is untouched (OUTL-1: text-only).
    assert!(doc.node_vector_network(&"R".to_string()).is_none());
    // No new node minted — the tree is still {T, R}, not a union (OUTL-4).
    assert_eq!(doc.children(None), ids(&["T", "R"]));
}

// ---------------------------------------------------------------------------
// OUTL-5 — one entry; undo restores the text
// ---------------------------------------------------------------------------

#[test]
fn outl_5_is_one_entry_and_undo_restores_text() {
    let mut editor = editor_with_text_and_rect();
    let net = stub_network();
    assert!(mode::create_outlines(&mut editor, &ids(&["T"]), |_| Some(
        net.clone()
    )));
    assert!(
        editor
            .document()
            .node_vector_network(&"T".to_string())
            .is_some()
    );

    // A single undo brings the editable text back (no longer a vector,
    // still present at the same id).
    assert!(editor.undo());
    assert!(
        editor
            .document()
            .node_vector_network(&"T".to_string())
            .is_none()
    );
    assert_eq!(editor.document().node_parent(&"T".to_string()), Some(None));
}

// ---------------------------------------------------------------------------
// OUTL-3 — declines when the outliner yields nothing (no fonts/backend)
// ---------------------------------------------------------------------------

#[test]
fn outl_3_declines_without_an_outline() {
    let mut editor = editor_with_text_and_rect();
    // Outliner returns None (no font backend): the text is left
    // unchanged — still present and not a vector.
    assert!(!mode::create_outlines(&mut editor, &ids(&["T"]), |_| None));
    assert!(
        editor
            .document()
            .node_vector_network(&"T".to_string())
            .is_none()
    );
    assert_eq!(editor.document().node_parent(&"T".to_string()), Some(None));
    // Also declines on an empty network.
    let empty = grida::vectornetwork::VectorNetwork::default();
    assert!(!mode::create_outlines(&mut editor, &ids(&["T"]), |_| Some(
        empty.clone()
    )));
}

// ---------------------------------------------------------------------------
// CTX-2 — enablement mirrors the command
// ---------------------------------------------------------------------------

#[test]
fn can_create_outlines_wants_a_text_node() {
    let editor = editor_with_text_and_rect();
    let doc = editor.document();
    assert!(mode::can_create_outlines(doc, &ids(&["T", "R"])));
    assert!(!mode::can_create_outlines(doc, &ids(&["R"])));
    assert!(!mode::can_create_outlines(doc, &ids(&[])));
}
