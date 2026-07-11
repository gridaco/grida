//! Draft 0 stroke-channel contract: repeated geometry applications, target-
//! specific attributes, ordered paints, canonical defaults, and strict errors.

use anchor_lab::grida_xml::{self, PrintError};
use anchor_lab::model::*;

fn named(doc: &Document, name: &str) -> NodeId {
    (0..doc.capacity() as NodeId)
        .find(|id| {
            doc.get_opt(*id)
                .is_some_and(|node| node.header.name.as_deref() == Some(name))
        })
        .expect("named node")
}

#[test]
fn repeated_strokes_preserve_geometry_paint_and_source_order() {
    let source = r##"
<grida version="0">
  <container>
    <rect name="road" width="100" height="60" fill="#101828">
      <stroke width="12" align="outside" join="round" miter-limit="6" dash-array="4 2 1">
        <solid color="#111827"/>
      </stroke>
      <stroke width="3" align="inside">
        <solid color="#2563EB"/>
        <gradient kind="linear" from="0 0" to="1 1" opacity="0.8">
          <stop offset="0" color="#A78BFA"/>
          <stop offset="1" color="#60A5FA"/>
        </gradient>
      </stroke>
    </rect>
  </container>
</grida>
"##;
    let doc = grida_xml::parse(source).expect("repeated strokes parse");
    let road = doc.get(named(&doc, "road"));
    assert_eq!(road.strokes.len(), 2);

    let bottom = &road.strokes[0];
    assert_eq!(bottom.width, StrokeWidth::Uniform(12.0));
    assert_eq!(bottom.align, StrokeAlign::Outside);
    assert_eq!(bottom.join, StrokeJoin::Round);
    assert_eq!(bottom.miter_limit, 6.0);
    assert_eq!(
        bottom.dash_array.as_deref(),
        Some(&[4.0, 2.0, 1.0, 4.0, 2.0, 1.0][..]),
        "odd dash arrays repeat once"
    );
    assert!(matches!(bottom.paints[0], Paint::Solid(_)));

    let top = &road.strokes[1];
    assert_eq!(top.width, StrokeWidth::Uniform(3.0));
    assert_eq!(top.align, StrokeAlign::Inside);
    assert_eq!(top.paints.len(), 2);
    assert!(matches!(top.paints[0], Paint::Solid(_)));
    assert!(matches!(top.paints[1], Paint::LinearGradient(_)));

    let printed = grida_xml::print(&doc).expect("repeated strokes print");
    let bottom_at = printed.find("width=\"12\"").unwrap();
    let top_at = printed.find("width=\"3\"").unwrap();
    assert!(bottom_at < top_at, "{printed}");
    assert!(printed.contains("dash-array=\"4 2 1 4 2 1\""), "{printed}");
    assert!(printed.contains("<gradient kind=\"linear\""), "{printed}");
    assert!(!printed.contains("<linear-gradient"), "{printed}");
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
    assert_eq!(
        printed,
        grida_xml::print(&grida_xml::parse(&printed).unwrap()).unwrap()
    );
}

#[test]
fn stroke_defaults_are_target_specific_and_round_trip() {
    let source = r##"
<grida version="0"><container>
  <rect name="rect" width="10" height="10"><stroke><solid color="#f00"/></stroke></rect>
  <ellipse name="ellipse" width="10" height="10"><stroke><solid color="#0f0"/></stroke></ellipse>
  <line name="line" width="10"><stroke><solid color="#00f"/></stroke></line>
  <text name="text"><stroke><solid color="#fff"/></stroke>x</text>
</container></grida>
"##;
    let doc = grida_xml::parse(source).unwrap();
    for name in ["rect", "ellipse", "text"] {
        let stroke = &doc.get(named(&doc, name)).strokes[0];
        assert_eq!(stroke.width, StrokeWidth::Uniform(1.0), "{name}");
        assert_eq!(stroke.align, StrokeAlign::Inside, "{name}");
        assert_eq!(stroke.cap, StrokeCap::Butt, "{name}");
        assert_eq!(stroke.join, StrokeJoin::Miter, "{name}");
        assert_eq!(stroke.miter_limit, 4.0, "{name}");
        assert_eq!(stroke.dash_array, None, "{name}");
    }
    assert_eq!(
        doc.get(named(&doc, "line")).strokes[0].align,
        StrokeAlign::Center
    );

    let printed = grida_xml::print(&doc).unwrap();
    assert!(
        !printed.contains("width=\"1\""),
        "defaults are omitted: {printed}"
    );
    assert!(!printed.contains("align=\"inside\""), "{printed}");
    assert!(!printed.contains("align=\"center\""), "{printed}");
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn enumerated_stroke_geometry_values_match_the_model_vocabulary() {
    for (value, expected) in [
        ("inside", StrokeAlign::Inside),
        ("center", StrokeAlign::Center),
        ("outside", StrokeAlign::Outside),
    ] {
        let source = format!(
            r##"<grida version="0"><container><rect name="r" width="10" height="10"><stroke align="{value}"><solid color="#000"/></stroke></rect></container></grida>"##
        );
        let doc = grida_xml::parse(&source).unwrap();
        assert_eq!(doc.get(named(&doc, "r")).strokes[0].align, expected);
    }

    for (value, expected) in [
        ("butt", StrokeCap::Butt),
        ("round", StrokeCap::Round),
        ("square", StrokeCap::Square),
    ] {
        let source = format!(
            r##"<grida version="0"><container><line name="line" width="10"><stroke cap="{value}"><solid color="#000"/></stroke></line></container></grida>"##
        );
        let doc = grida_xml::parse(&source).unwrap();
        assert_eq!(doc.get(named(&doc, "line")).strokes[0].cap, expected);
    }

    for (value, expected) in [
        ("miter", StrokeJoin::Miter),
        ("round", StrokeJoin::Round),
        ("bevel", StrokeJoin::Bevel),
    ] {
        let source = format!(
            r##"<grida version="0"><container><rect name="r" width="10" height="10"><stroke join="{value}"><solid color="#000"/></stroke></rect></container></grida>"##
        );
        let doc = grida_xml::parse(&source).unwrap();
        assert_eq!(doc.get(named(&doc, "r")).strokes[0].join, expected);
    }
}

#[test]
fn default_empty_stroke_is_invalid_but_non_default_empty_geometry_survives() {
    for source in [
        r#"<grida version="0"><container><rect width="10" height="10"><stroke/></rect></container></grida>"#,
        r#"<grida version="0"><container><line width="10"><stroke/></line></container></grida>"#,
    ] {
        let error = grida_xml::parse(source).unwrap_err();
        assert!(error.to_string().contains("default empty"), "{error}");
        assert!(
            error
                .to_string()
                .contains("indistinguishable from omission"),
            "{error}"
        );
    }

    let doc = grida_xml::parse(
        r#"<grida version="0"><container><rect name="dormant" width="10" height="10"><stroke width="2"/></rect></container></grida>"#,
    )
    .expect("non-default empty geometry remains authored state");
    let stroke = &doc.get(named(&doc, "dormant")).strokes[0];
    assert!(stroke.paints.is_empty());
    assert_eq!(stroke.width, StrokeWidth::Uniform(2.0));
    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains("<stroke width=\"2\"/>"), "{printed}");
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn target_specific_stroke_attributes_and_numeric_domains_are_strict() {
    let cases = [
        (
            r##"<rect width="10" height="10"><stroke cap="round"><solid color="#000"/></stroke></rect>"##,
            "cap",
        ),
        (
            r##"<ellipse width="10" height="10"><stroke join="round"><solid color="#000"/></stroke></ellipse>"##,
            "join",
        ),
        (
            r##"<text><stroke dash-array="1 1"><solid color="#000"/></stroke>x</text>"##,
            "dash-array",
        ),
        (
            r##"<line width="10"><stroke align="inside"><solid color="#000"/></stroke></line>"##,
            "center",
        ),
        (
            r##"<line width="10"><stroke join="bevel"><solid color="#000"/></stroke></line>"##,
            "join",
        ),
        (
            r##"<rect width="10" height="10"><stroke width="-1"><solid color="#000"/></stroke></rect>"##,
            "non-negative",
        ),
        (
            r##"<rect width="10" height="10"><stroke miter-limit="0"><solid color="#000"/></stroke></rect>"##,
            "greater than zero",
        ),
        (
            r##"<rect width="10" height="10"><stroke dash-array=""><solid color="#000"/></stroke></rect>"##,
            "dash-array",
        ),
        (
            r##"<rect width="10" height="10"><stroke dash-array="0 0"><solid color="#000"/></stroke></rect>"##,
            "all zero",
        ),
        (
            r##"<rect width="10" height="10"><stroke dash-array="1 -1"><solid color="#000"/></stroke></rect>"##,
            "non-negative",
        ),
        (
            r##"<group><stroke width="2"><solid color="#000"/></stroke></group>"##,
            "group",
        ),
        (
            r##"<lens><stroke width="2"><solid color="#000"/></stroke></lens>"##,
            "lens",
        ),
    ];

    for (node, expected) in cases {
        let source = format!("<grida version=\"0\"><container>{node}</container></grida>");
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}` for {node}"
        );
    }
}

#[test]
fn stroke_structure_and_property_order_are_strict() {
    let cases = [
        (
            r##"<grida version="0"><container><rect width="10" height="10"><stroke><stroke><solid color="#000"/></stroke></stroke></rect></container></grida>"##,
            "nested <stroke>",
        ),
        (
            r##"<grida version="0"><container><rect width="10" height="10"><stroke><solid color="#000"/></stroke><fill/></rect></container></grida>"##,
            "<fill>",
        ),
        (
            r##"<grida version="0"><container><rect width="10" height="10"><text>x</text><stroke><solid color="#000"/></stroke></rect></container></grida>"##,
            "must appear before",
        ),
        (
            r##"<grida version="0"><container><rect width="10" height="10"><stroke><fill><solid color="#000"/></fill></stroke></rect></container></grida>"##,
            "nested <fill>",
        ),
    ];
    for (source, expected) in cases {
        let error = grida_xml::parse(source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

#[test]
fn text_content_is_exact_around_fill_and_stroke_properties() {
    let source = r##"<grida version="0"><container><text name="label">
  <fill><solid color="#f00" opacity="0.5"/></fill>
  <stroke width="2"><solid color="#00f"/></stroke>  hello
world  </text></container></grida>"##;
    let doc = grida_xml::parse(source).unwrap();
    let label = doc.get(named(&doc, "label"));
    let Payload::Text { content, .. } = &label.payload else {
        panic!("text payload")
    };
    assert_eq!(content, "  hello\nworld  ");
    assert_eq!(label.strokes.len(), 1);
    let printed = grida_xml::print(&doc).unwrap();
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn writer_omits_default_empty_stroke_and_refuses_invalid_stroke_state() {
    let mut doc = grida_xml::parse(
        r#"<grida version="0"><container><rect name="r" width="10" height="10"/></container></grida>"#,
    )
    .unwrap();
    let r = named(&doc, "r");
    let payload = doc.get(r).payload.clone();
    doc.get_mut(r)
        .strokes
        .push(Stroke::default_for(&payload).unwrap());
    let printed = grida_xml::print(&doc).expect("default empty stroke normalizes to omission");
    assert!(!printed.contains("<stroke"), "{printed}");

    let payload = doc.get(r).payload.clone();
    let mut invalid = Stroke::default_for(&payload).unwrap();
    invalid.width = StrokeWidth::Uniform(-1.0);
    invalid
        .paints
        .push(Paint::Solid(SolidPaint::new(Color::BLACK)));
    doc.get_mut(r).strokes = vec![invalid];
    assert!(matches!(
        grida_xml::print(&doc),
        Err(PrintError::InvalidDocument(message)) if message.contains("stroke") && message.contains("width")
    ));

    let mut line = grida_xml::parse(
        r##"<grida version="0"><container><line name="line" width="10"><stroke><solid color="#000"/></stroke></line></container></grida>"##,
    )
    .unwrap();
    let line_id = named(&line, "line");
    line.get_mut(line_id).strokes[0].align = StrokeAlign::Inside;
    assert!(matches!(
        grida_xml::print(&line),
        Err(PrintError::InvalidDocument(message)) if message.contains("line") && message.contains("center")
    ));
}

#[test]
fn writer_normalizes_programmatic_odd_dash_cycles_without_losing_semantics() {
    let mut doc = grida_xml::parse(
        r##"<grida version="0"><container><rect name="r" width="20" height="20"><stroke><solid color="#000"/></stroke></rect></container></grida>"##,
    )
    .unwrap();
    let r = named(&doc, "r");
    doc.get_mut(r).strokes[0].dash_array = Some(vec![3.0, 2.0, 1.0]);

    let printed = grida_xml::print(&doc).expect("odd dash cycles have an even canonical form");
    assert!(printed.contains("dash-array=\"3 2 1 3 2 1\""), "{printed}");
    let reparsed = grida_xml::parse(&printed).unwrap();
    assert_eq!(
        reparsed.get(named(&reparsed, "r")).strokes[0]
            .dash_array
            .as_deref(),
        Some(&[3.0, 2.0, 1.0, 3.0, 2.0, 1.0][..])
    );
}
