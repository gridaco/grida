//! The per-slot generation column (engine setup, step 3; ENG-2.3). Live
//! nodes sit at generation 0; tombstoning a slot bumps it, so a future
//! reused slot cannot alias a prior node's cache key. That generations do
//! NOT affect document equality is proven by the existing MM-7 test
//! (`mm_laws.rs`) still passing — the semantic PartialEq never reads them.

mod common;

use anchor_lab::model::*;

fn one_child() -> (Document, NodeId) {
    let mut b = DocBuilder::new();
    let c = b.add(
        0,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    (b.build(), c)
}

#[test]
fn live_nodes_are_generation_zero() {
    let (doc, c) = one_child();
    assert_eq!(doc.gen_of(doc.root), 0);
    assert_eq!(doc.gen_of(c), 0);
    assert_eq!(doc.gen_of(9999), 0); // out of range reads 0
}

#[test]
fn tombstone_bumps_generation() {
    let (mut doc, c) = one_child();
    let key = doc.key_of(c).unwrap();
    assert!(doc.contains_key(key));
    assert_eq!(doc.gen_of(c), 0);
    let removed = doc.remove_subtree(c);
    assert_eq!(removed, 1);
    // The vacated slot's generation advanced; the root was untouched.
    assert_eq!(doc.gen_of(c), 1);
    assert_eq!(doc.gen_of(doc.root), 0);
    assert!(!doc.contains_key(key));
    assert!(doc.node_for_key(key).is_none());
    assert!(doc.key_of(c).is_none());
}

#[test]
fn reused_slot_mints_a_new_generation_without_reviving_the_old_key() {
    let (mut doc, child) = one_child();
    let old = doc.key_of(child).unwrap();
    doc.remove_subtree(child);
    let replacement = Node {
        id: child,
        header: Header::new(SizeIntent::Fixed(2.0), SizeIntent::Fixed(3.0)),
        payload: Payload::Shape {
            desc: ShapeDesc::Ellipse,
        },
        children: vec![],
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing::default(),
        fills: Paints::default(),
        strokes: vec![],
    };
    doc.add_child(doc.root, replacement);

    let current = doc.key_of(child).unwrap();
    assert_eq!(current.generation(), old.generation() + 1);
    assert_ne!(current, old);
    assert!(doc.contains_key(current));
    assert!(!doc.contains_key(old));
}

#[test]
fn keys_are_scoped_to_one_exact_document_arena() {
    let (a, child_a) = one_child();
    let (b, child_b) = one_child();
    assert_eq!(child_a, child_b, "the arena slots deliberately coincide");
    let key_a = a.key_of(child_a).unwrap();
    assert!(
        !b.contains_key(key_a),
        "an identical fresh arena is not owner A"
    );

    let clone = a.clone();
    assert_eq!(clone, a, "arena identity is not semantic document state");
    assert!(
        !clone.contains_key(key_a),
        "a clone gets a new arena owner because it may diverge"
    );
    assert_ne!(clone.key_of(child_a).unwrap().arena(), key_a.arena());
}
