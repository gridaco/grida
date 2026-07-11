//! Focused contract for the flat `<text>` + direct-child `<tspan>` surface.

use anchor_lab::grida_xml;
use anchor_lab::model::*;

fn parse_text(source: &str) -> (Document, NodeId) {
    let source = format!("<grida version=\"0\"><container>{source}</container></grida>");
    let doc = grida_xml::parse(&source).expect("attributed text source parses");
    let container = doc.get(doc.root).children[0];
    let text = doc.get(container).children[0];
    (doc, text)
}

fn attributed(node: &Node) -> (&AttributedString, TextStyleRec) {
    match &node.payload {
        Payload::AttributedText {
            attributed_string,
            default_style,
        } => (attributed_string, *default_style),
        payload => panic!("expected attributed text, got {payload:?}"),
    }
}

#[test]
fn mixed_content_lowers_to_complete_utf8_byte_runs() {
    let (doc, text_id) = parse_text(
        r##"<text font-size="18" font-weight="500" font-style="italic"> A🙂<tspan font-size="24" font-weight="700" font-style="normal" fill="#f00">中</tspan>
Z</text>"##,
    );
    let (value, default_style) = attributed(doc.get(text_id));

    assert_eq!(value.text, " A🙂中\nZ");
    assert_eq!(
        default_style,
        TextStyleRec {
            font_size: 18.0,
            font_weight: 500,
            font_style_italic: true,
        }
    );
    assert_eq!(value.runs.len(), 3);
    assert_eq!((value.runs[0].start, value.runs[0].end), (0, 6));
    assert_eq!((value.runs[1].start, value.runs[1].end), (6, 9));
    assert_eq!((value.runs[2].start, value.runs[2].end), (9, 11));
    assert_eq!(value.run_text(&value.runs[0]), " A🙂");
    assert_eq!(value.run_text(&value.runs[1]), "中");
    assert_eq!(value.run_text(&value.runs[2]), "\nZ");
    assert_eq!(value.runs[0].style, default_style);
    assert_eq!(value.runs[2].style, default_style);
    assert_eq!(
        value.runs[1].style,
        TextStyleRec {
            font_size: 24.0,
            font_weight: 700,
            font_style_italic: false,
        }
    );
    let fills = value.runs[1].fills.as_ref().expect("explicit run fill");
    let [Paint::Solid(solid)] = fills.as_slice() else {
        panic!("solid shorthand must lower to one solid paint")
    };
    assert_eq!(solid.color.to_hex(), "#FF0000");

    let printed = grida_xml::print(&doc).expect("attributed text prints");
    assert!(printed.contains(
        r##"<text font-size="18" font-weight="500" font-style="italic"> A🙂<tspan font-size="24" font-weight="700" font-style="normal" fill="#FF0000">中</tspan>
Z</text>"##
    ));
    let reparsed = grida_xml::parse(&printed).unwrap();
    assert_eq!(printed, grida_xml::print(&reparsed).unwrap());
}

#[test]
fn adjacent_equal_runs_coalesce_and_semantically_uniform_markup_disappears() {
    let (doc, text_id) = parse_text(
        r#"<text>x<tspan font-weight="700">a</tspan><tspan font-weight="700">b</tspan>y</text>"#,
    );
    let (value, _) = attributed(doc.get(text_id));
    assert_eq!(value.text, "xaby");
    assert_eq!(value.runs.len(), 3);
    assert_eq!(value.run_text(&value.runs[1]), "ab");

    let printed = grida_xml::print(&doc).unwrap();
    assert_eq!(printed.matches("<tspan").count(), 1, "{printed}");
    assert!(
        printed.contains(r#"<tspan font-weight="700">ab</tspan>"#),
        "{printed}"
    );

    let (uniform, uniform_id) = parse_text(r#"<text>a<tspan font-size="16">b</tspan>c</text>"#);
    assert!(matches!(
        &uniform.get(uniform_id).payload,
        Payload::Text { content, font_size }
            if content == "abc" && *font_size == TextStyleRec::DEFAULT_FONT_SIZE
    ));
    let uniform_printed = grida_xml::print(&uniform).unwrap();
    assert!(!uniform_printed.contains("<tspan"), "{uniform_printed}");
}

#[test]
fn structured_run_fills_preserve_order_and_explicit_emptiness() {
    let (doc, text_id) = parse_text(
        r##"<text>A<tspan><fill><solid color="#101828"/><gradient kind="linear"><stop offset="0" color="#7C3AED"/><stop offset="1" color="#2563EB"/></gradient><image src="./texture.png" fit="cover" opacity="0.25"/></fill>B</tspan><tspan><fill/>C</tspan>D</text>"##,
    );
    let (value, _) = attributed(doc.get(text_id));
    assert_eq!(value.text, "ABCD");
    assert_eq!(value.runs.len(), 4);

    let painted = value.runs[1].fills.as_ref().expect("paint override");
    assert_eq!(painted.len(), 3);
    assert!(matches!(painted[0], Paint::Solid(_)));
    assert!(matches!(painted[1], Paint::LinearGradient(_)));
    let Paint::Image(image) = &painted[2] else {
        panic!("third run paint must be the image resource")
    };
    assert_eq!(image.image, ResourceRef::Rid("./texture.png".into()));
    assert_eq!(image.fit, ImagePaintFit::Fit(BoxFit::Cover));
    assert_eq!(image.opacity, 0.25);
    assert!(value.runs[2]
        .fills
        .as_ref()
        .expect("explicit empty override")
        .is_empty());
    assert!(value.runs[0].fills.is_none());
    assert!(value.runs[3].fills.is_none());

    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains("<tspan><fill>"), "{printed}");
    assert!(
        printed.contains(r#"<image src="./texture.png" opacity="0.25"/>"#),
        "{printed}"
    );
    assert!(printed.contains("</fill>B</tspan>"), "{printed}");
    assert!(printed.contains("<tspan><fill/>C</tspan>"), "{printed}");
    let reparsed = grida_xml::parse(&printed).unwrap();
    assert_eq!(printed, grida_xml::print(&reparsed).unwrap());
}

#[test]
fn canonical_writer_normalizes_programmatic_run_boundaries() {
    let (mut doc, text_id) = parse_text("<text>ab</text>");
    let default_style = TextStyleRec::default();
    let bold = TextStyleRec {
        font_weight: 700,
        ..default_style
    };
    let attributed_string = AttributedString::from_runs(
        "ab",
        vec![
            StyledTextRun {
                start: 0,
                end: 1,
                style: bold,
                fills: None,
            },
            StyledTextRun {
                start: 1,
                end: 2,
                style: bold,
                fills: None,
            },
        ],
    )
    .unwrap();
    doc.get_mut(text_id).payload = Payload::AttributedText {
        attributed_string,
        default_style,
    };

    let printed = grida_xml::print(&doc).expect("writer compares normalized text semantics");
    assert_eq!(printed.matches("<tspan").count(), 1, "{printed}");
    assert!(
        printed.contains(r#"<tspan font-weight="700">ab</tspan>"#),
        "{printed}"
    );
    assert_eq!(
        printed,
        grida_xml::print(&grida_xml::parse(&printed).unwrap()).unwrap()
    );
}

#[test]
fn attributed_text_rejects_lossy_or_ambiguous_inline_syntax() {
    let cases = [
        (
            r#"<text><tspan><tspan>x</tspan></tspan></text>"#,
            "nested <tspan>",
        ),
        (r#"<text><tspan/></text>"#, "at least one character"),
        (r#"<text><tspan></tspan></text>"#, "at least one character"),
        (
            r#"<text><strong>x</strong></text>"#,
            "no lossless attributed-text destination",
        ),
        (
            r#"<text><br/></text>"#,
            "use explicit <tspan> styling and a newline character",
        ),
        (r#"<text><span>x</span></text>"#, "use <tspan>"),
        (
            r#"<text><tspan x="1">x</tspan></text>"#,
            "SVG positioning attribute `x`",
        ),
        (
            r#"<text><tspan dx="1">x</tspan></text>"#,
            "SVG positioning attribute `dx`",
        ),
        (
            r#"<text><tspan font-weight="0">x</tspan></text>"#,
            "integer from 1 through 1000",
        ),
        (
            r#"<text><tspan font-weight="1001">x</tspan></text>"#,
            "integer from 1 through 1000",
        ),
        (
            r#"<text><tspan font-weight="bold">x</tspan></text>"#,
            "integer from 1 through 1000",
        ),
        (
            r#"<text><tspan font-style="oblique">x</tspan></text>"#,
            "must be `normal` or `italic`",
        ),
        (
            r#"<text><tspan font-size="0">x</tspan></text>"#,
            "font-size on <tspan> must be greater than zero",
        ),
        (
            r#"<text><tspan style="font-weight: 700">x</tspan></text>"#,
            "unknown attribute `style` on <tspan>",
        ),
        (
            r#"<text><tspan width="100">x</tspan></text>"#,
            "unknown attribute `width` on <tspan>",
        ),
        (
            r#"<text><tspan> <fill/>x</tspan></text>"#,
            "must be the first child/event",
        ),
        (
            r#"<text><tspan><!--before--><fill/>x</tspan></text>"#,
            "must be the first child/event",
        ),
        (
            r##"<text><tspan fill="#fff"><fill/>x</tspan></text>"##,
            "both the `fill` attribute and <fill>",
        ),
        (
            r#"<text><tspan><stroke/>x</tspan></text>"#,
            "run stroke geometry",
        ),
        (
            r#"<text><tspan><rect width="1" height="1"/>x</tspan></text>"#,
            "not allowed inside <tspan>",
        ),
        (r#"<text size="12">x</text>"#, "use `font-size`"),
    ];

    for (text, expected) in cases {
        let source = format!("<grida version=\"0\"><container>{text}</container></grida>");
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` for {text}, got {error}"
        );
    }

    let outside =
        grida_xml::parse(r#"<grida version="0"><container><tspan>x</tspan></container></grida>"#)
            .unwrap_err();
    assert!(outside.to_string().contains("direct child of <text>"));
}

#[test]
fn attributed_string_validation_is_utf8_and_override_aware() {
    let style = TextStyleRec::default();
    let bad_boundary = AttributedString::from_runs(
        "🙂x",
        vec![
            StyledTextRun {
                start: 0,
                end: 1,
                style,
                fills: None,
            },
            StyledTextRun {
                start: 1,
                end: 5,
                style,
                fills: None,
            },
        ],
    )
    .unwrap_err();
    assert!(bad_boundary.contains("UTF-8 character boundaries"));

    let mut value = AttributedString::from_runs(
        "abc",
        vec![
            StyledTextRun {
                start: 0,
                end: 1,
                style,
                fills: None,
            },
            StyledTextRun {
                start: 1,
                end: 2,
                style,
                fills: None,
            },
            StyledTextRun {
                start: 2,
                end: 3,
                style,
                fills: Some(Paints::default()),
            },
        ],
    )
    .unwrap();
    value.merge_adjacent_runs();
    assert_eq!(value.runs.len(), 2);
    assert_eq!((value.runs[0].start, value.runs[0].end), (0, 2));
    assert!(value.runs[0].fills.is_none());
    assert!(value.runs[1].fills.as_ref().unwrap().is_empty());
}
