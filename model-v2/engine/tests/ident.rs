//! ENG-2.3 · key_of mints a generation-stamped cache key from the arena.
//! A tombstoned slot's key advances, so no future occupant can alias it.

use anchor_engine::ident::{key_of, Key};
use anchor_lab::model::*;

#[test]
fn key_of_reads_generation() {
    let mut b = DocBuilder::new();
    let c = b.add(
        0,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut doc = b.build();

    assert_eq!(key_of(&doc, c), Key { id: c, gen: 0 });

    doc.remove_subtree(c);
    assert_eq!(key_of(&doc, c), Key { id: c, gen: 1 });
}
