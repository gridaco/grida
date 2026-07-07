//! E3 — the agent text IR: the §7 quartet parses, round-trips, and
//! resolves to the geometry the spec's worked examples promise.

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::textir::{parse, print};

const QUARTET: &str = r#"
<frame w="1000" h="1000">
  <shape kind="rect" x="10" y="20" w="120" h="80" rotation="15"/>
  <shape kind="rect" x="end 24" y="20" w="120" h="80"/>
  <frame layout="flex" direction="column" gap="8" padding="16" w="400" h="auto">
    <shape kind="rect" h="40" w="100" align="stretch"/>
    <text grow="1">hello</text>
  </frame>
  <group x="100" y="500" rotation="30">
    <shape kind="rect" w="40" h="40"/>
    <shape kind="ellipse" x="56" w="40" h="40"/>
  </group>
  <lens ops="skew-x(20)">
    <shape kind="rect" w="240" h="150"/>
  </lens>
</frame>
"#;

/// H1: the a.md §7 worked examples are expressible verbatim-ish and parse.
#[test]
fn quartet_parses_and_resolves() {
    let doc = parse(QUARTET).expect("quartet parses");
    let r = run(&doc);

    // (a) rotated rect: box as authored, world rotated about center
    let a = 1; // document order
    assert_rect(r.box_of(a), 10.0, 20.0, 120.0, 80.0, "(a) box");
    let c = r.world_of(a).apply((60.0, 40.0));
    assert_close(c.0, 70.0, "(a) center fixed");
    assert_close(c.1, 60.0, "(a) center fixed");

    // (b) end-pinned: x = 1000 − 24 − 120
    let b = 2;
    assert_close(r.box_of(b).x, 856.0, "(b) end pin");

    // (c) flex column hug: padding 16×2 + 40 + gap 8 + text(19.2) = 99.2
    let f = 3;
    assert_close(r.box_of(f).w, 400.0, "(c) fixed w");
    assert_close(r.box_of(f).h, 16.0 + 40.0 + 8.0 + 19.2 + 16.0, "(c) hug h");
    // stretch: rect fills 400 − 32
    let rect = 4;
    assert_close(r.box_of(rect).w, 368.0, "(c) stretch");

    // (d) group: derived box 96×40 placed at origin (100,500)
    let g = 6;
    assert_rect(r.box_of(g), 100.0, 500.0, 96.0, 40.0, "(d) union");

    // (e) lens: pre-ops box participates; world of child carries skew
    let lens = 9;
    assert_close(r.box_of(lens).w, 240.0, "(e) pre-ops box");
    let child = 10;
    let w = r.world_of(child);
    assert!((w.c - (20.0f32).to_radians().tan()).abs() < 1e-4, "(e) skew");
}

/// S-1 analogue: parse → print → parse is a fixpoint on the model.
#[test]
fn roundtrip_fixpoint() {
    let doc1 = parse(QUARTET).expect("parse 1");
    let text = print(&doc1);
    let doc2 = parse(&text).unwrap_or_else(|e| panic!("reparse failed: {e}\n---\n{text}"));
    assert_eq!(doc1, doc2, "canonical round-trip\n---\n{text}");
    // and the printer is itself a fixpoint
    assert_eq!(text, print(&doc2), "print is stable");
}

/// Amendment 2 boundary: malformed values are typed parse errors, never
/// silently coerced.
#[test]
fn parse_errors_are_typed() {
    assert!(parse(r#"<frame w="NaN"/>"#).is_err(), "NaN rejected (N-2)");
    assert!(parse(r#"<frame foo="1"/>"#).is_err(), "unknown attr rejected");
    assert!(parse(r#"<shape/>"#).is_err(), "shape without kind rejected");
    assert!(parse(r#"<frame x="left 10"/>"#).is_err(), "bad anchor word");
}

/// Kind defaults (§4): text defaults to auto/auto; line locks height.
#[test]
fn kind_defaults_in_ir() {
    let doc = parse(r#"<frame w="100" h="100"><text>hi</text><shape kind="line" w="80"/></frame>"#)
        .unwrap();
    let t = 1;
    assert_eq!(doc.get(t).header.width, SizeIntent::Auto);
    let l = 2;
    assert_eq!(doc.get(l).header.height, SizeIntent::Fixed(0.0), "line h locked");
}
