//! Positive Draft 0 property coverage that complements `grida_xml_suite`.
//!
//! That suite already proves `name`, fixed `width`/`height`, all four size
//! constraints, `aspect-ratio`, bare start bindings, and `flip-y`. This file
//! covers the accepted value forms that otherwise lacked both direct model
//! assertions and a canonical parse -> print -> parse fixpoint.

use anchor_lab::grida_xml;
use anchor_lab::model::*;

fn canonical(source: &str) -> (Document, String) {
    let doc = grida_xml::parse(source).expect("Draft 0 source parses");
    let printed = grida_xml::print(&doc).expect("parsed Draft 0 source prints");
    let reparsed = grida_xml::parse(&printed).expect("canonical source reparses");
    assert_eq!(doc, reparsed, "semantic round-trip\n---\n{printed}");
    assert_eq!(
        printed,
        grida_xml::print(&reparsed).expect("canonical source reprints"),
        "writer fixpoint"
    );
    (doc, printed)
}

fn authored_root(doc: &Document) -> NodeId {
    doc.get(doc.root).children[0]
}

fn frame_layout(doc: &Document, id: NodeId) -> LayoutBehavior {
    match doc.get(id).payload {
        Payload::Frame { layout, .. } => layout,
        ref payload => panic!("expected container, got {payload:?}"),
    }
}

#[test]
fn binding_forms_auto_sizes_and_common_visual_attributes_materialize() {
    let source = r#"
<grida version="0">
  <container width="auto" height="auto" clips="true">
    <rect x="start -5" y="+7" width="10" height="11" rotation="-12.5" flip-x="true" flip-y="false" opacity="0.25" hidden="true"/>
    <ellipse x="end 8" y="end -2" width="12" height="13"/>
    <rect x="center" y="center 3" width="14" height="15"/>
    <rect x="span 1 2" y="start 4" height="16"/>
    <ellipse x="start 5" y="span 3 4" width="17"/>
    <text width="auto" height="auto" size="21" opacity="1" hidden="false">x</text>
    <container width="auto" height="auto" clips="false"/>
  </container>
</grida>
"#;
    let (doc, printed) = canonical(source);
    let root = authored_root(&doc);
    let root_node = doc.get(root);
    assert_eq!(root_node.header.width, SizeIntent::Auto);
    assert_eq!(root_node.header.height, SizeIntent::Auto);
    assert!(matches!(
        root_node.payload,
        Payload::Frame {
            clips_content: true,
            ..
        }
    ));

    let [start, end, center, span_x, span_y, text, unclipped] = root_node.children.as_slice()
    else {
        panic!("expected all property probes")
    };

    let start = doc.get(*start);
    assert_eq!(start.header.x, AxisBinding::start(-5.0));
    assert_eq!(start.header.y, AxisBinding::start(7.0));
    assert_eq!(start.header.rotation, -12.5);
    assert!(start.header.flip_x);
    assert!(!start.header.flip_y);
    assert_eq!(start.header.opacity, 0.25);
    assert!(!start.header.active);

    let end = doc.get(*end);
    assert_eq!(end.header.x, AxisBinding::end(8.0));
    assert_eq!(end.header.y, AxisBinding::end(-2.0));

    let center = doc.get(*center);
    assert_eq!(center.header.x, AxisBinding::center(0.0));
    assert_eq!(center.header.y, AxisBinding::center(3.0));

    let span_x = doc.get(*span_x);
    assert_eq!(
        span_x.header.x,
        AxisBinding::Span {
            start: 1.0,
            end: 2.0
        }
    );
    assert_eq!(span_x.header.y, AxisBinding::start(4.0));
    assert_eq!(span_x.header.width, SizeIntent::Auto);

    let span_y = doc.get(*span_y);
    assert_eq!(span_y.header.x, AxisBinding::start(5.0));
    assert_eq!(
        span_y.header.y,
        AxisBinding::Span {
            start: 3.0,
            end: 4.0
        }
    );
    assert_eq!(span_y.header.height, SizeIntent::Auto);

    let text = doc.get(*text);
    assert_eq!(text.header.width, SizeIntent::Auto);
    assert_eq!(text.header.height, SizeIntent::Auto);
    assert_eq!(text.header.opacity, 1.0);
    assert!(text.header.active);
    assert!(matches!(
        text.payload,
        Payload::Text {
            font_size: 21.0,
            ..
        }
    ));

    assert!(matches!(
        doc.get(*unclipped).payload,
        Payload::Frame {
            clips_content: false,
            ..
        }
    ));

    assert!(printed.contains("<container width=\"auto\" height=\"auto\" clips=\"true\">"));
    assert!(printed.contains("x=\"-5\" y=\"7\""), "{printed}");
    assert!(!printed.contains("x=\"start "), "{printed}");
    assert!(printed.contains("x=\"end 8\" y=\"end -2\""), "{printed}");
    assert!(printed.contains("x=\"center\" y=\"center 3\""), "{printed}");
    assert!(printed.contains("x=\"span 1 2\" y=\"4\""), "{printed}");
    assert!(printed.contains("x=\"5\" y=\"span 3 4\""), "{printed}");
    assert!(printed.contains("rotation=\"-12.5\""), "{printed}");
    assert!(printed.contains("flip-x=\"true\""), "{printed}");
    assert!(!printed.contains("flip-y="), "{printed}");
    assert!(printed.contains("opacity=\"0.25\""), "{printed}");
    assert!(printed.contains("hidden=\"true\""), "{printed}");
    assert!(!printed.contains("hidden=\"false\""), "{printed}");
    assert!(!printed.contains("clips=\"false\""), "{printed}");
    assert!(printed.contains("<text size=\"21\">x</text>"), "{printed}");
}

#[test]
fn every_lens_operation_materializes_in_source_order() {
    let source = r#"
<grida version="0">
  <container>
    <lens ops="translate(1,-2) rotate(45) scale(2) scale(3,4) skew-x(5) skew-y(-6) skew(7,8) matrix(1,2,3,4,5,6)">
      <rect width="1" height="1"/>
    </lens>
  </container>
</grida>
"#;
    let (doc, printed) = canonical(source);
    let root = authored_root(&doc);
    let lens = doc.get(root).children[0];
    assert_eq!(
        doc.get(lens).payload,
        Payload::Lens {
            ops: vec![
                LensOp::Translate { x: 1.0, y: -2.0 },
                LensOp::Rotate { deg: 45.0 },
                LensOp::Scale { x: 2.0, y: 2.0 },
                LensOp::Scale { x: 3.0, y: 4.0 },
                LensOp::Skew {
                    x_deg: 5.0,
                    y_deg: 0.0
                },
                LensOp::Skew {
                    x_deg: 0.0,
                    y_deg: -6.0
                },
                LensOp::Skew {
                    x_deg: 7.0,
                    y_deg: 8.0
                },
                LensOp::Matrix {
                    m: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
                },
            ]
        }
    );
    assert!(
        printed.contains(
            "ops=\"translate(1,-2) rotate(45) scale(2) scale(3,4) skew-x(5) skew-y(-6) skew(7,8) matrix(1,2,3,4,5,6)\""
        ),
        "{printed}"
    );
}

#[test]
fn layout_and_flex_enum_variants_materialize_and_canonicalize() {
    let (none, printed) =
        canonical(r#"<grida version="0"><container layout="none" padding="3"/></grida>"#);
    let none_layout = frame_layout(&none, authored_root(&none));
    assert_eq!(none_layout.mode, LayoutMode::None);
    assert_eq!(none_layout.padding, EdgeInsets::all(3.0));
    assert!(!printed.contains("layout="), "{printed}");
    assert!(printed.contains("padding=\"3\""), "{printed}");

    for (value, expected, canonical_attr) in [
        ("row", Direction::Row, None),
        ("column", Direction::Column, Some("direction=\"column\"")),
    ] {
        let source = format!(
            "<grida version=\"0\"><container layout=\"flex\" direction=\"{value}\"/></grida>"
        );
        let (doc, printed) = canonical(&source);
        let layout = frame_layout(&doc, authored_root(&doc));
        assert_eq!(layout.mode, LayoutMode::Flex);
        assert_eq!(layout.direction, expected);
        match canonical_attr {
            Some(attr) => assert!(printed.contains(attr), "{printed}"),
            None => assert!(!printed.contains("direction="), "{printed}"),
        }
    }

    for (value, expected) in [("false", false), ("true", true)] {
        let source =
            format!("<grida version=\"0\"><container layout=\"flex\" wrap=\"{value}\"/></grida>");
        let (doc, printed) = canonical(&source);
        assert_eq!(frame_layout(&doc, authored_root(&doc)).wrap, expected);
        assert_eq!(printed.contains("wrap=\"true\""), expected, "{printed}");
        assert!(!printed.contains("wrap=\"false\""), "{printed}");
    }

    for (value, expected, canonical_attr) in [
        ("start", MainAlign::Start, None),
        ("center", MainAlign::Center, Some("main=\"center\"")),
        ("end", MainAlign::End, Some("main=\"end\"")),
        (
            "space-between",
            MainAlign::SpaceBetween,
            Some("main=\"space-between\""),
        ),
        (
            "space-around",
            MainAlign::SpaceAround,
            Some("main=\"space-around\""),
        ),
        (
            "space-evenly",
            MainAlign::SpaceEvenly,
            Some("main=\"space-evenly\""),
        ),
    ] {
        let source =
            format!("<grida version=\"0\"><container layout=\"flex\" main=\"{value}\"/></grida>");
        let (doc, printed) = canonical(&source);
        assert_eq!(frame_layout(&doc, authored_root(&doc)).main_align, expected);
        match canonical_attr {
            Some(attr) => assert!(printed.contains(attr), "{printed}"),
            None => assert!(!printed.contains(" main="), "{printed}"),
        }
    }

    for (value, expected, canonical_attr) in [
        ("start", CrossAlign::Start, None),
        ("center", CrossAlign::Center, Some("cross=\"center\"")),
        ("end", CrossAlign::End, Some("cross=\"end\"")),
        ("stretch", CrossAlign::Stretch, Some("cross=\"stretch\"")),
    ] {
        let source =
            format!("<grida version=\"0\"><container layout=\"flex\" cross=\"{value}\"/></grida>");
        let (doc, printed) = canonical(&source);
        assert_eq!(
            frame_layout(&doc, authored_root(&doc)).cross_align,
            expected
        );
        match canonical_attr {
            Some(attr) => assert!(printed.contains(attr), "{printed}"),
            None => assert!(!printed.contains(" cross="), "{printed}"),
        }
    }
}

#[test]
fn gap_and_padding_grammars_materialize_and_normalize() {
    let cases = [
        ("7", "8", (7.0, 7.0), EdgeInsets::all(8.0), "7", "8"),
        (
            "4 9",
            "1 2 3 4",
            (4.0, 9.0),
            EdgeInsets {
                top: 1.0,
                right: 2.0,
                bottom: 3.0,
                left: 4.0,
            },
            "4 9",
            "1 2 3 4",
        ),
        ("6 6", "5 5 5 5", (6.0, 6.0), EdgeInsets::all(5.0), "6", "5"),
    ];

    for (gap, padding, expected_gap, expected_padding, canonical_gap, canonical_padding) in cases {
        let source = format!(
            "<grida version=\"0\"><container layout=\"flex\" gap=\"{gap}\" padding=\"{padding}\"/></grida>"
        );
        let (doc, printed) = canonical(&source);
        let layout = frame_layout(&doc, authored_root(&doc));
        assert_eq!((layout.gap_main, layout.gap_cross), expected_gap);
        assert_eq!(layout.padding, expected_padding);
        assert!(
            printed.contains(&format!("gap=\"{canonical_gap}\"")),
            "{printed}"
        );
        assert!(
            printed.contains(&format!("padding=\"{canonical_padding}\"")),
            "{printed}"
        );
    }
}

#[test]
fn flex_child_flow_grow_and_all_align_variants_materialize() {
    let source = r#"
<grida version="0">
  <container width="100" height="100" layout="flex">
    <rect flow="in" grow="0" align="start" width="10" height="10"/>
    <rect grow="2" align="center" width="10" height="10"/>
    <rect align="end" width="10" height="10"/>
    <rect align="stretch" width="10" height="10"/>
    <rect flow="absolute" x="end 2" y="center" width="10" height="10"/>
  </container>
</grida>
"#;
    let (doc, printed) = canonical(source);
    let root = authored_root(&doc);
    let children = &doc.get(root).children;
    assert_eq!(children.len(), 5);

    for (&id, align) in children[..4].iter().zip([
        SelfAlign::Start,
        SelfAlign::Center,
        SelfAlign::End,
        SelfAlign::Stretch,
    ]) {
        let header = &doc.get(id).header;
        assert_eq!(header.flow, Flow::InFlow);
        assert_eq!(header.self_align, align);
    }
    assert_eq!(doc.get(children[0]).header.grow, 0.0);
    assert_eq!(doc.get(children[1]).header.grow, 2.0);

    let absolute = &doc.get(children[4]).header;
    assert_eq!(absolute.flow, Flow::Absolute);
    assert_eq!(absolute.x, AxisBinding::end(2.0));
    assert_eq!(absolute.y, AxisBinding::center(0.0));
    assert_eq!(absolute.grow, 0.0);
    assert_eq!(absolute.self_align, SelfAlign::Auto);

    assert!(!printed.contains("flow=\"in\""), "{printed}");
    assert!(printed.contains("flow=\"absolute\""), "{printed}");
    assert!(!printed.contains("grow=\"0\""), "{printed}");
    assert!(printed.contains("grow=\"2\""), "{printed}");
    for value in ["start", "center", "end", "stretch"] {
        assert!(printed.contains(&format!("align=\"{value}\"")), "{printed}");
    }
}
