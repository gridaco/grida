//! ENG-5.2/5.3 · a replay is (canonical IR + op log). It round-trips through
//! text, and playing it twice is bit-identical (document print, resolved tier,
//! and result sequence) — the determinism the whole optimization program
//! stands on. Ops are recorded against the NORMALIZED doc (ids the round-trip
//! law pins), found here by name.

use anchor_engine::oracle::OracleTags;
use anchor_engine::replay::{parse_string, play, resolved_bits_eq, write_string};
use anchor_lab::model::*;
use anchor_lab::ops::{apply, Axis, Op, ResizeDrag};
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};
use anchor_lab::textir;

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

fn named(w: f32, h: f32, name: &str, x: f32, y: f32) -> (Header, Payload) {
    let mut h0 = Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h));
    h0.x = AxisBinding::start(x);
    h0.y = AxisBinding::start(y);
    h0.name = Some(name.to_string());
    (
        h0,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

/// A named scene: free shape 'card' and group 'chips' of two shapes.
fn scene() -> Document {
    let mut b = DocBuilder::new();
    let (sh, sp) = named(80.0, 40.0, "card", 20.0, 20.0);
    b.add(0, sh, sp);

    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(200.0);
    gh.y = AxisBinding::start(60.0);
    gh.name = Some("chips".to_string());
    let g = b.add(0, gh, Payload::Group);
    let (c1, c1p) = named(30.0, 30.0, "chip.a", 0.0, 0.0);
    b.add(g, c1, c1p);
    let (c2, c2p) = named(30.0, 30.0, "chip.b", 40.0, 0.0);
    b.add(g, c2, c2p);

    b.build()
}

fn by_name(doc: &Document, name: &str) -> NodeId {
    (0..doc.capacity() as NodeId)
        .find(|&id| doc.get_opt(id).and_then(|n| n.header.name.as_deref()) == Some(name))
        .expect("named node")
}

/// Normalize + build the crosszero-then-ungroup op script against it.
fn recorded() -> (Document, Vec<Op>) {
    let doc = textir::parse(&textir::print(&scene())).expect("normalize");
    let r = resolve(&doc, &opts());
    let card = by_name(&doc, "card");
    let chips = by_name(&doc, "chips");

    // card: drag the right edge past the left → cross-zero flip.
    let drag = ResizeDrag::begin(&doc, &r, card, Axis::X, AnchorEdge::End).unwrap();
    let b = r.box_of(card);
    let ops = vec![
        Op::ResizeDrag {
            id: card,
            drag,
            target: b.x + b.w + 30.0,
        },
        Op::Ungroup { id: chips },
    ];
    (doc, ops)
}

#[test]
fn round_trips_through_text() {
    let (doc, ops) = recorded();
    let text = write_string(&doc, &ops, &OracleTags::default(), &opts());
    let replay = parse_string(&text).expect("parse replay");

    assert!(replay.doc == doc, "initial doc survives the round-trip");
    assert_eq!(replay.ops, ops, "op log survives the round-trip");
    assert_eq!(replay.tags, OracleTags::default(), "oracle tags survive");
    assert_eq!(replay.opts.viewport, opts().viewport, "viewport survives");
}

#[test]
fn playing_twice_is_bit_identical() {
    let (doc, ops) = recorded();
    let replay = parse_string(&write_string(&doc, &ops, &OracleTags::default(), &opts())).unwrap();

    let (d1, res1) = play(&replay);
    let (d2, res2) = play(&replay);

    assert_eq!(
        textir::print(&d1),
        textir::print(&d2),
        "document print equal"
    );
    assert!(
        resolved_bits_eq(&resolve(&d1, &opts()), &resolve(&d2, &opts())),
        "resolved tier bit-identical"
    );
    assert_eq!(res1, res2, "result sequence equal");

    // Not a trivial no-op run: the script actually mutated the document.
    assert!(
        textir::print(&d1) != textir::print(&replay.doc),
        "the ops must have changed the document"
    );
}

#[test]
fn play_equals_direct_application() {
    let (doc, ops) = recorded();
    let replay = parse_string(&write_string(&doc, &ops, &OracleTags::default(), &opts())).unwrap();
    let (played, _) = play(&replay);

    // Apply the same ops directly to the same start — play must match.
    let mut direct = replay.doc.clone();
    for op in &ops {
        let r = resolve(&direct, &opts());
        let _ = apply(&mut direct, &r, op);
    }
    assert_eq!(textir::print(&played), textir::print(&direct));
}
