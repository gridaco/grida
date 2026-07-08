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
    assert_eq!(doc.gen_of(c), 0);
    let removed = doc.remove_subtree(c);
    assert_eq!(removed, 1);
    // The vacated slot's generation advanced; the root was untouched.
    assert_eq!(doc.gen_of(c), 1);
    assert_eq!(doc.gen_of(doc.root), 0);
}
