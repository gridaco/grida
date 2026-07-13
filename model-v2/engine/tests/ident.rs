//! ENG-2.3 · the engine reuses the model's arena-scoped generational key.
//! Dead slots mint nothing; deletion and document replacement invalidate old
//! runtime identities.

use anchor_engine::ident::key_of;
use anchor_lab::model::*;

#[test]
fn key_of_mints_only_live_model_keys() {
    let mut b = DocBuilder::new();
    let c = b.add(
        0,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut doc = b.build();

    let key = key_of(&doc, c).expect("live key");
    assert_eq!(key.id(), c);
    assert_eq!(key.generation(), 0);
    assert!(doc.contains_key(key));

    doc.remove_subtree(c);
    assert_eq!(key_of(&doc, c), None);
    assert!(!doc.contains_key(key));
}

#[test]
fn engine_keys_cannot_cross_document_incarnations() {
    let build = || {
        let mut builder = DocBuilder::new();
        let node = builder.add(
            0,
            Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
            Payload::Shape {
                desc: ShapeDesc::Rect,
            },
        );
        (builder.build(), node)
    };
    let (document, node) = build();
    let key = key_of(&document, node).unwrap();
    let (other, other_node) = build();

    assert_eq!(node, other_node, "the slot alone deliberately aliases");
    assert!(!other.contains_key(key));
    assert_ne!(key.arena(), key_of(&other, other_node).unwrap().arena());
}
