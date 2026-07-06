//! Traversal conformance (`TRAV-*`) — `docs/wg/canvas/traversal.md` —
//! plus the scope-relative select-all (keybindings.md `Mod+A`).
//!
//! Headless: traversal is pure resolution over the working copy
//! ([`grida_editor::traverse`]); the shell only sets the returned
//! selection and follows with the camera reveal. The
//! enter-content-edit half of Enter's chain (`TRAV-1` case 1) is the
//! MODE-2 dispatch table, cited in `mode_contracts`.

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, Scene, Size};
use math2::transform::AffineTransform;

use grida_editor::document::{Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::traverse;

/// Container `G` holding `[X, Y]`, plus a top-level leaf `L` —
/// document order `[G, L]`.
fn tree_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();

    let g = graph.append_child(Node::Container(nf.create_container_node()), Parent::Root);
    graph.set_name(g, "G".to_string());
    id_map.insert(g, "G".to_string());

    for name in ["X", "Y"] {
        let leaf = graph.append_child(
            Node::Rectangle(nf.create_rectangle_node()),
            Parent::NodeId(g),
        );
        graph.set_name(leaf, name.to_string());
        id_map.insert(leaf, name.to_string());
    }

    let l = graph.append_child(Node::Rectangle(nf.create_rectangle_node()), Parent::Root);
    graph.set_name(l, "L".to_string());
    id_map.insert(l, "L".to_string());

    let scene = Scene {
        name: "trav-tests".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// Three top-level rectangles, document order `[A, B, C]`.
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
        name: "trav-tests".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

fn s(ids: &[&str]) -> Vec<String> {
    ids.iter().map(|i| i.to_string()).collect()
}

/// TRAV-1 — Enter's descent: the selection becomes exactly the union
/// of children; a childless selection resolves to an empty union (the
/// consumed no-op — Enter never falls through to the host).
#[test]
fn trav_1_enter_selects_children_union() {
    let editor = tree_editor();
    let doc = editor.document();
    assert_eq!(traverse::children_union(doc, &s(&["G"])), s(&["X", "Y"]));
    // Union across a multi-selection, document order per parent.
    assert_eq!(
        traverse::children_union(doc, &s(&["G", "L"])),
        s(&["X", "Y"])
    );
    // Childless: empty union.
    assert!(traverse::children_union(doc, &s(&["L"])).is_empty());
}

/// TRAV-2 — Shift+Enter's ascent: union of parents; top-level members
/// contribute themselves; an all-top-level selection changes nothing;
/// the scene root is never selected.
#[test]
fn trav_2_select_parent_union_stops_at_the_surface() {
    let editor = tree_editor();
    let doc = editor.document();
    assert_eq!(traverse::parents_union(doc, &s(&["X"])), Some(s(&["G"])));
    // Dedupe: two siblings collapse to one parent.
    assert_eq!(
        traverse::parents_union(doc, &s(&["X", "Y"])),
        Some(s(&["G"]))
    );
    // Mixed depth: the top-level member contributes itself.
    assert_eq!(
        traverse::parents_union(doc, &s(&["X", "L"])),
        Some(s(&["G", "L"]))
    );
    // All-top-level: no change (never the scene root).
    assert_eq!(traverse::parents_union(doc, &s(&["G", "L"])), None);
    assert_eq!(traverse::parents_union(doc, &[]), None);
}

/// TRAV-3 — Enter then Shift+Enter from a single container
/// round-trips to the original selection.
#[test]
fn trav_3_down_then_up_round_trips() {
    let editor = tree_editor();
    let doc = editor.document();
    let down = traverse::children_union(doc, &s(&["G"]));
    assert_eq!(down, s(&["X", "Y"]));
    let up = traverse::parents_union(doc, &down).expect("ascends");
    assert_eq!(up, s(&["G"]));
}

/// TRAV-4 — Tab cycles siblings in document order with wrap-around (N
/// siblings need exactly N Tabs to return); Shift+Tab reverses;
/// inactive siblings are skipped; a multi-selection collapses to the
/// anchor's neighbor; an empty selection enters at the first
/// top-level node.
#[test]
fn trav_4_sibling_cycle() {
    let mut editor = three_sibling_editor();
    let doc = editor.document();
    // Forward cycle: A → B → C → A in exactly 3 steps.
    let mut sel = s(&["A"]);
    let mut walk = Vec::new();
    for _ in 0..3 {
        let next = traverse::sibling(doc, &sel, true).expect("sibling");
        walk.push(next.clone());
        sel = vec![next];
    }
    assert_eq!(walk, s(&["B", "C", "A"]));
    // Reverse cycle.
    assert_eq!(traverse::sibling(doc, &s(&["A"]), false), Some("C".into()));
    // Multi-selection collapses to the anchor (most recent).
    assert_eq!(
        traverse::sibling(doc, &s(&["A", "B"]), true),
        Some("C".into())
    );
    // Empty selection: the entry point.
    assert_eq!(traverse::sibling(doc, &[], true), Some("A".into()));
    // Inactive siblings are skipped.
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "B".to_string(),
                set: Box::new(PropPatch {
                    active: Some(false),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    let doc = editor.document();
    assert_eq!(traverse::sibling(doc, &s(&["A"]), true), Some("C".into()));
    assert_eq!(traverse::sibling(doc, &s(&["C"]), false), Some("A".into()));
    // The entry point skips inactive too.
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: Box::new(PropPatch {
                    active: Some(false),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    assert_eq!(
        traverse::sibling(editor.document(), &[], true),
        Some("C".into())
    );
}

/// TRAV-5 (the document half) — traversal is view-safe: resolution
/// mutates nothing and records nothing; the selection is editor
/// state. The camera-reveal half is shell wiring (the minimal pan on
/// the live camera) and is exercised manually.
#[test]
fn trav_5_traversal_records_nothing() {
    let mut editor = tree_editor();
    let before = editor.history_len();
    // (Resolution is pure by type — `&WorkingCopy` in, ids out; the
    // walk below proves the full command sequence records no entry.)
    let down = traverse::children_union(editor.document(), &s(&["G"]));
    editor.set_selection(down);
    let across = traverse::sibling(editor.document(), editor.selection(), true).unwrap();
    editor.set_selection(vec![across]);
    let up = traverse::parents_union(editor.document(), editor.selection()).unwrap();
    editor.set_selection(up);
    assert_eq!(editor.history_len(), before);
}

/// The scope-relative select-all (keybindings.md `Mod+A`): with a
/// selection, all siblings in the anchor's scope; with nothing
/// selected, all top-level nodes.
#[test]
fn select_all_is_scope_relative() {
    let editor = tree_editor();
    let doc = editor.document();
    assert_eq!(traverse::select_all(doc, &[]), s(&["G", "L"]));
    assert_eq!(traverse::select_all(doc, &s(&["X"])), s(&["X", "Y"]));
    assert_eq!(traverse::select_all(doc, &s(&["G"])), s(&["G", "L"]));
}
