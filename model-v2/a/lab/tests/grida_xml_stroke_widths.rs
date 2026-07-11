//! Draft 0 rectangular stroke-width grammar and model projection.

use anchor_lab::grida_xml;
use anchor_lab::model::*;

fn named(doc: &Document, name: &str) -> NodeId {
    (0..doc.capacity() as NodeId)
        .find(|id| {
            doc.get_opt(*id)
                .is_some_and(|node| node.header.name.as_deref() == Some(name))
        })
        .expect("named node")
}

fn rect_document(node_attributes: &str, stroke_attributes: &str) -> String {
    format!(
        r##"<grida version="0"><container><rect name="target" width="100" height="60" {node_attributes}><stroke {stroke_attributes}><solid color="#000000"/></stroke></rect></container></grida>"##
    )
}

#[test]
fn four_widths_project_to_the_production_shaped_model_and_round_trip() {
    let source = rect_document("", r#"width="2 4 6 8" align="outside" dash-array="5 3""#);
    let doc = grida_xml::parse(&source).unwrap();
    let stroke = &doc.get(named(&doc, "target")).strokes[0];
    assert_eq!(
        stroke.width,
        StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 2.0,
            stroke_right_width: 4.0,
            stroke_bottom_width: 6.0,
            stroke_left_width: 8.0,
        })
    );
    assert_eq!(stroke.dash_array.as_deref(), Some(&[5.0, 3.0][..]));

    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains(r#"width="2 4 6 8""#), "{printed}");
    assert_eq!(
        grida_xml::print(&grida_xml::parse(&printed).unwrap()).unwrap(),
        printed
    );
}

#[test]
fn container_strokes_accept_the_same_four_side_geometry() {
    let source = r##"<grida version="0"><container name="target"><stroke width="3 5 7 9"><solid color="#000000"/></stroke></container></grida>"##;
    let doc = grida_xml::parse(source).unwrap();
    assert_eq!(
        doc.get(named(&doc, "target")).strokes[0].width,
        StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 3.0,
            stroke_right_width: 5.0,
            stroke_bottom_width: 7.0,
            stroke_left_width: 9.0,
        })
    );
    assert!(grida_xml::print(&doc)
        .unwrap()
        .contains(r#"width="3 5 7 9""#));
}

#[test]
fn equal_and_zero_side_lists_normalize_to_the_shortest_scalar_form() {
    let equal = grida_xml::parse(&rect_document("", r#"width="7 7 7 7""#)).unwrap();
    let stroke = &equal.get(named(&equal, "target")).strokes[0];
    assert_eq!(stroke.width, StrokeWidth::Uniform(7.0));
    let printed = grida_xml::print(&equal).unwrap();
    assert!(printed.contains(r#"width="7""#), "{printed}");
    assert!(!printed.contains(r#"width="7 7 7 7""#), "{printed}");

    let zero = grida_xml::parse(&rect_document("", r#"width="0 0 0 0""#)).unwrap();
    let stroke = &zero.get(named(&zero, "target")).strokes[0];
    assert_eq!(stroke.width, StrokeWidth::None);
    let printed = grida_xml::print(&zero).unwrap();
    assert!(printed.contains(r#"width="0""#), "{printed}");

    let default = grida_xml::parse(&rect_document("", r#"width="1 1 1 1""#)).unwrap();
    let printed = grida_xml::print(&default).unwrap();
    assert!(!printed.contains("<stroke width="), "{printed}");
}

#[test]
fn nondefault_empty_per_side_geometry_survives_but_default_alias_does_not() {
    let source = r#"<grida version="0"><container><rect name="target" width="100" height="60"><stroke width="0 2 0 4"/></rect></container></grida>"#;
    let doc = grida_xml::parse(source).unwrap();
    let printed = grida_xml::print(&doc).unwrap();
    assert!(
        printed.contains(r#"<stroke width="0 2 0 4"/>"#),
        "{printed}"
    );
    assert_eq!(grida_xml::parse(&printed).unwrap(), doc);

    let default_alias = r#"<grida version="0"><container><rect width="100" height="60"><stroke width="1 1 1 1"/></rect></container></grida>"#;
    let error = grida_xml::parse(default_alias).unwrap_err();
    assert!(
        error.0.contains("indistinguishable from omission"),
        "{error}"
    );
}

#[test]
fn writer_normalizes_equivalent_programmatic_width_variants() {
    let mut doc = grida_xml::parse(&rect_document("", r#"width="3""#)).unwrap();
    let target = named(&doc, "target");
    doc.get_mut(target).strokes[0].width =
        StrokeWidth::Rectangular(RectangularStrokeWidth::all(3.0));
    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains(r#"width="3""#), "{printed}");

    doc.get_mut(target).strokes[0].width = StrokeWidth::Uniform(0.0);
    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains(r#"width="0""#), "{printed}");
}

#[test]
fn malformed_or_negative_side_lists_are_rejected() {
    let cases = [
        (r#"width="""#, "takes 1 or exactly 4 numbers"),
        (r#"width="1 2""#, "got 2"),
        (r#"width="1 2 3""#, "got 3"),
        (r#"width="1 2 3 4 5""#, "got 5"),
        (r#"width="1 -2 3 4""#, "stroke width right"),
        (r#"width="1 NaN 3 4""#, "non-finite"),
    ];
    for (attributes, expected) in cases {
        let error = grida_xml::parse(&rect_document("", attributes)).unwrap_err();
        assert!(error.0.contains(expected), "{attributes}: {error}");
    }
}

#[test]
fn four_value_syntax_is_rectangular_only_even_when_the_values_are_equal() {
    let targets = [
        r##"<ellipse width="40" height="40"><stroke width="2 2 2 2"><solid color="#000000"/></stroke></ellipse>"##,
        r##"<line width="40"><stroke width="2 2 2 2"><solid color="#000000"/></stroke></line>"##,
        r##"<text><stroke width="2 2 2 2"><solid color="#000000"/></stroke>x</text>"##,
    ];
    for target in targets {
        let source = format!(r#"<grida version="0"><container>{target}</container></grida>"#);
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(
            error.0.contains("four-value stroke width is valid only"),
            "{error}"
        );
    }
}

#[test]
fn per_side_width_rejects_renderer_states_that_production_cannot_preserve() {
    let cases = [
        (
            "corner-radius=\"8\" corner-smoothing=\"0.25\"",
            r#"width="1 2 3 4""#,
            "corner-smoothing",
        ),
        ("", r#"width="1 2 3 4" join="round""#, "default join"),
        (
            "",
            r#"width="1 2 3 4" miter-limit="6""#,
            "miter-limit=\"4\"",
        ),
    ];
    for (node_attributes, stroke_attributes, expected) in cases {
        let error =
            grida_xml::parse(&rect_document(node_attributes, stroke_attributes)).unwrap_err();
        assert!(error.0.contains(expected), "{error}");
    }
}

#[test]
fn writer_applies_the_same_cross_geometry_gates() {
    let mut doc = grida_xml::parse(&rect_document("", r#"width="1 2 3 4""#)).unwrap();
    let target = named(&doc, "target");
    doc.get_mut(target).corner_smoothing = CornerSmoothing(0.5);
    let error = grida_xml::print(&doc).unwrap_err();
    assert!(error.to_string().contains("corner-smoothing"), "{error}");

    doc.get_mut(target).corner_smoothing = CornerSmoothing::default();
    doc.get_mut(target).strokes[0].join = StrokeJoin::Bevel;
    let error = grida_xml::print(&doc).unwrap_err();
    assert!(error.to_string().contains("default join"), "{error}");

    let source = r##"<grida version="0"><container><ellipse name="target" width="40" height="40"><stroke width="2"><solid color="#000000"/></stroke></ellipse></container></grida>"##;
    let mut ellipse = grida_xml::parse(source).unwrap();
    let target = named(&ellipse, "target");
    ellipse.get_mut(target).strokes[0].width = StrokeWidth::Rectangular(RectangularStrokeWidth {
        stroke_top_width: 1.0,
        stroke_right_width: 2.0,
        stroke_bottom_width: 3.0,
        stroke_left_width: 4.0,
    });
    let error = grida_xml::print(&ellipse).unwrap_err();
    assert!(
        error.to_string().contains("cannot carry per-side"),
        "{error}"
    );
}

#[test]
fn writer_reports_the_nonfinite_side_before_tree_integrity() {
    let mut doc = grida_xml::parse(&rect_document("", r#"width="1 2 3 4""#)).unwrap();
    let target = named(&doc, "target");
    let StrokeWidth::Rectangular(widths) = &mut doc.get_mut(target).strokes[0].width else {
        panic!("rectangular width")
    };
    widths.stroke_right_width = f32::NAN;

    let error = grida_xml::print(&doc).unwrap_err();
    assert!(
        error.to_string().contains("width right must be finite"),
        "{error}"
    );
    assert!(!error.to_string().contains("scene tree"), "{error}");
}
