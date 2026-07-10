//! Draft 0 `.grida.xml` producer contract: structural envelope, canonical
//! vocabulary, primitive-local composition, strict roots, and E3 compatibility.

use anchor_lab::grida_xml::{self, PrintError};
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions};
use std::collections::BTreeMap;

const COMPOSED: &str = r#"
<grida version="0">
  <container width="800" height="450">
    <rect x="100" y="50" width="200" height="100">
      <text x="10" y="12" size="10">content</text>
    </rect>
  </container>
</grida>
"#;

/// The envelope is not a node. The model keeps its canonical viewport root,
/// then the authored container → rect → text tree below it. A primitive owns
/// a free-positioned child coordinate space without gaining layout behavior.
#[test]
fn draft0_preserves_primitive_children_and_local_geometry() {
    let doc = grida_xml::parse(COMPOSED).expect("Draft 0 parses");
    let document_root = doc.get(doc.root);

    assert_eq!(doc.root, 0);
    assert_eq!(
        document_root.header.x,
        AxisBinding::Span {
            start: 0.0,
            end: 0.0
        }
    );
    assert_eq!(
        document_root.header.y,
        AxisBinding::Span {
            start: 0.0,
            end: 0.0
        }
    );
    assert_eq!(document_root.children.len(), 1);

    let container = document_root.children[0];
    let shape = doc.get(container).children[0];
    let text = doc.get(shape).children[0];
    assert!(matches!(doc.get(container).payload, Payload::Frame { .. }));
    assert!(matches!(doc.get(shape).payload, Payload::Shape { .. }));
    assert!(matches!(doc.get(text).payload, Payload::Text { .. }));

    let resolved = resolve(
        &doc,
        &ResolveOptions {
            viewport: (1024.0, 768.0),
            ..Default::default()
        },
    );
    assert_eq!(resolved.xywh(doc.root), (0.0, 0.0, 1024.0, 768.0));
    assert_eq!(resolved.xywh(container), (0.0, 0.0, 800.0, 450.0));
    assert_eq!(resolved.xywh(shape), (100.0, 50.0, 200.0, 100.0));
    assert_eq!(resolved.box_of(text).x, 10.0);
    assert_eq!(resolved.box_of(text).y, 12.0);
    let world = resolved.world_of(text);
    assert_eq!((world.e, world.f), (110.0, 62.0));
}

/// Canonical output names the real source format rather than the E3
/// experiment, and normalized parse → print → parse remains a fixpoint.
#[test]
fn draft0_canonical_print_is_a_semantic_fixpoint() {
    let doc = grida_xml::parse(COMPOSED).unwrap();
    let printed = grida_xml::print(&doc).unwrap();

    assert!(printed.starts_with("<grida version=\"0\">\n"));
    assert!(printed.contains("<container width=\"800\" height=\"450\">"));
    assert!(printed.contains("<rect x=\"100\" y=\"50\" width=\"200\" height=\"100\">"));
    assert!(!printed.contains("<shape"));
    assert!(!printed.contains(" kind=\""));
    assert!(!printed.contains("<frame"));
    assert!(!printed.contains(" w=\""));
    assert!(!printed.contains(" h=\""));

    let reparsed = grida_xml::parse(&printed).unwrap();
    assert_eq!(doc, reparsed);
    assert_eq!(printed, grida_xml::print(&reparsed).unwrap());
}

#[test]
fn direct_primitives_map_to_shape_descriptors_and_preserve_children() {
    let source = r#"
<grida version="0">
  <container width="200" height="100">
    <rect name="rect" width="100" height="50">
      <ellipse name="ellipse" width="20" height="10"/>
      <line name="line" width="30"/>
      <text name="label">content</text>
    </rect>
  </container>
</grida>
"#;
    let doc = grida_xml::parse(source).expect("direct primitives parse");
    let container = doc.get(doc.root).children[0];
    let rect = doc.get(container).children[0];
    let children = &doc.get(rect).children;

    assert!(matches!(
        doc.get(rect).payload,
        Payload::Shape {
            desc: ShapeDesc::Rect
        }
    ));
    assert_eq!(children.len(), 3);
    assert!(matches!(
        doc.get(children[0]).payload,
        Payload::Shape {
            desc: ShapeDesc::Ellipse
        }
    ));
    assert!(matches!(
        doc.get(children[1]).payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        }
    ));
    assert!(matches!(doc.get(children[2]).payload, Payload::Text { .. }));
    assert_eq!(doc.get(children[0]).header.name.as_deref(), Some("ellipse"));
    assert_eq!(doc.get(children[1]).header.height, SizeIntent::Fixed(0.0));

    let printed = grida_xml::print(&doc).expect("direct primitives print");
    assert!(printed.contains("<rect name=\"rect\" width=\"100\" height=\"50\">"));
    assert!(printed.contains("<ellipse name=\"ellipse\" width=\"20\" height=\"10\"/>"));
    assert!(printed.contains("<line name=\"line\" width=\"30\"/>"));
    assert!(!printed.contains("<shape"));
    assert!(!printed.contains(" kind=\""));
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn direct_primitives_are_exclusive_to_grida_xml() {
    let reserved = grida_xml::parse(
        r#"<grida version="0"><container><shape kind="rect" width="1" height="1"/></container></grida>"#,
    )
    .unwrap_err();
    assert!(reserved.to_string().contains("<shape> is reserved"));

    let kind_alias = grida_xml::parse(
        r#"<grida version="0"><container><rect kind="rect" width="1" height="1"/></container></grida>"#,
    )
    .unwrap_err();
    assert!(kind_alias.to_string().contains("unknown attribute `kind`"));

    for primitive in [
        r#"<rect w="1" h="1"/>"#,
        r#"<ellipse w="1" h="1"/>"#,
        r#"<line w="1"/>"#,
    ] {
        let source = format!("<frame w=\"10\" h=\"10\">{primitive}</frame>");
        let error = anchor_lab::textir::parse(&source).unwrap_err();
        assert!(
            error.to_string().contains("unknown element"),
            "historical TextIr must reject {primitive}: {error}"
        );
    }

    let historical = anchor_lab::textir::parse(
        r#"<frame w="10" h="10"><shape kind="ellipse" w="2" h="3"/></frame>"#,
    )
    .expect("historical TextIr keeps <shape kind>");
    let printed = anchor_lab::textir::print(&historical);
    assert!(printed.contains(r#"<shape w="2" h="3" kind="ellipse"/>"#));
}

#[test]
fn canonical_print_escapes_attribute_values() {
    let source = r#"<grida version="0"><container name="A &amp; &quot;B&quot;" width="10" height="10"/></grida>"#;
    let doc = grida_xml::parse(source).unwrap();
    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains("name=\"A &amp; &quot;B&quot;\""));
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn draft0_uses_long_constraint_vocabulary() {
    let source = r#"
<grida version="0">
  <container width="100" height="100">
    <rect width="20" min-width="10" max-width="40" min-height="15" max-height="50" aspect-ratio="2:3" flip-x="false" flip-y="true"/>
  </container>
</grida>
"#;
    let doc = grida_xml::parse(source).unwrap();
    let container = doc.get(doc.root).children[0];
    let shape = doc.get(container).children[0];
    assert_eq!(
        resolve(&doc, &ResolveOptions::default()).box_of(shape).h,
        30.0
    );
    let printed = grida_xml::print(&doc).unwrap();
    for spelling in [
        "min-width=\"10\"",
        "max-width=\"40\"",
        "min-height=\"15\"",
        "max-height=\"50\"",
        "aspect-ratio=\"2:3\"",
        "flip-y=\"true\"",
    ] {
        assert!(printed.contains(spelling), "missing {spelling}:\n{printed}");
    }
    assert!(!printed.contains(" min-w=\""));
    assert!(!printed.contains(" aspect=\""));
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn direct_text_whitespace_is_preserved() {
    let source =
        "<grida version=\"0\"><container><text>  hello\nworld  </text></container></grida>";
    let doc = grida_xml::parse(source).unwrap();
    let container = doc.get(doc.root).children[0];
    let text = doc.get(container).children[0];
    match &doc.get(text).payload {
        Payload::Text { content, .. } => assert_eq!(content, "  hello\nworld  "),
        payload => panic!("expected text, got {payload:?}"),
    }
    let printed = grida_xml::print(&doc).unwrap();
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());

    let historical =
        anchor_lab::textir::parse("<frame w=\"10\" h=\"10\"><text>  hello\nworld  </text></frame>")
            .unwrap();
    let historical_text = historical.get(historical.root).children[0];
    match &historical.get(historical_text).payload {
        Payload::Text { content, .. } => assert_eq!(content, "hello\nworld"),
        payload => panic!("expected text, got {payload:?}"),
    }
}

#[test]
fn booleans_are_exactly_true_or_false() {
    let cases = [
        r#"<grida version="0"><container><rect width="1" height="1" flip-x="yes"/></container></grida>"#,
        r#"<grida version="0"><container><text hidden="0">x</text></container></grida>"#,
        r#"<grida version="0"><container layout="flex" wrap="TRUE"/></grida>"#,
        r#"<grida version="0"><container clips="1"/></grida>"#,
    ];
    for source in cases {
        let error = grida_xml::parse(source).unwrap_err();
        assert!(error.to_string().contains("exactly `true` or `false`"));
    }
}

#[test]
fn numeric_domains_are_checked_at_parse_time() {
    let cases = [
        (
            r#"<grida version="0"><container><rect width="-1" height="1"/></container></grida>"#,
            "width must be non-negative",
        ),
        (
            r#"<grida version="0"><container><text size="0">x</text></container></grida>"#,
            "size must be greater than zero",
        ),
        (
            r#"<grida version="0"><container><text opacity="1.1">x</text></container></grida>"#,
            "opacity must be between 0 and 1",
        ),
        (
            r#"<grida version="0"><container><text min-width="-1">x</text></container></grida>"#,
            "min-width must be non-negative",
        ),
        (
            r#"<grida version="0"><container><text aspect-ratio="0:1">x</text></container></grida>"#,
            "aspect-ratio must be greater than zero",
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
fn grow_gap_and_padding_are_non_negative_only_in_draft0() {
    let cases = [
        (
            r#"<grida version="0"><container><rect width="1" height="1" grow="-1"/></container></grida>"#,
            "grow must be non-negative",
        ),
        (
            r#"<grida version="0"><container layout="flex" gap="-1"/></grida>"#,
            "gap must be non-negative",
        ),
        (
            r#"<grida version="0"><container layout="flex" gap="1 -2"/></grida>"#,
            "gap must be non-negative",
        ),
        (
            r#"<grida version="0"><container padding="0 -1 0 0"/></grida>"#,
            "padding must be non-negative",
        ),
    ];
    for (source, expected) in cases {
        let error = grida_xml::parse(source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }

    anchor_lab::textir::parse(
        r#"<frame w="10" h="10" layout="flex" gap="-1" padding="-2"><shape kind="rect" w="1" h="1" grow="-1"/></frame>"#,
    )
    .expect("historical TextIr keeps its prior numeric behavior");
}

#[test]
fn flex_child_attributes_are_context_strict() {
    let rejected = [
        r#"<grida version="0"><container layout="flex"><rect x="0" width="1" height="1"/></container></grida>"#,
        r#"<grida version="0"><container layout="flex"><rect y="0" width="1" height="1"/></container></grida>"#,
        r#"<grida version="0"><container><rect flow="in" width="1" height="1"/></container></grida>"#,
        r#"<grida version="0"><container><rect grow="0" width="1" height="1"/></container></grida>"#,
        r#"<grida version="0"><container><rect align="center" width="1" height="1"/></container></grida>"#,
        r#"<grida version="0"><container layout="flex"><rect flow="absolute" grow="1" width="1" height="1"/></container></grida>"#,
    ];
    for source in rejected {
        assert!(grida_xml::parse(source).is_err(), "must reject: {source}");
    }

    for source in [
        r#"<grida version="0"><container layout="flex"><rect grow="1" align="center" width="1" height="1"/></container></grida>"#,
        r#"<grida version="0"><container layout="flex"><rect flow="absolute" x="0" y="0" width="1" height="1"/></container></grida>"#,
    ] {
        grida_xml::parse(source).expect("applicable flex attributes accepted");
    }

    anchor_lab::textir::parse(
        r#"<frame w="10" h="10" layout="flex"><shape kind="rect" x="0" y="0" w="1" h="1"/></frame>"#,
    )
    .expect("historical TextIr retains resolver-reported applicability");
}

#[test]
fn strict_lens_ops_reject_empty_arguments() {
    for ops in [
        "translate(1,,2)",
        "translate(1,2",
        "translate(1,2)scale(2)",
        "translate(1,2), scale(2)",
        "translate(1,2))",
    ] {
        let strict =
            format!("<grida version=\"0\"><container><lens ops=\"{ops}\"/></container></grida>");
        assert!(grida_xml::parse(&strict).is_err(), "must reject `{ops}`");
    }

    anchor_lab::textir::parse(r#"<frame w="10" h="10"><lens ops="translate(1,,2)"/></frame>"#)
        .expect("historical TextIr retains empty-argument filtering");
}

#[test]
fn xml_declaration_is_single_and_before_the_envelope() {
    for valid in [
        r#"<?xml version="1.0"?><grida version="0"><container/></grida>"#,
        r#"<?xml version="1.0" encoding="UTF-8"?><grida version="0"><container/></grida>"#,
        r#"<?xml version="1.0" encoding="utf-8"?><grida version="0"><container/></grida>"#,
    ] {
        grida_xml::parse(valid).expect("supported leading declaration is accepted");
    }

    for source in [
        r#"<?xml version="1.0"?><?xml version="1.0"?><grida version="0"><container/></grida>"#,
        r#"<grida version="0"><?xml version="1.0"?><container/></grida>"#,
        r#"<grida version="0"><container/></grida><?xml version="1.0"?>"#,
        r#"<!--c--><?xml version="1.0"?><grida version="0"><container/></grida>"#,
        " \n<?xml version=\"1.0\"?><grida version=\"0\"><container/></grida>",
        r#"<?xml foo="bar"?><grida version="0"><container/></grida>"#,
        r#"<?xml version="2.0"?><grida version="0"><container/></grida>"#,
        r#"<?xml version="1.0" encoding="ISO-8859-1"?><grida version="0"><container/></grida>"#,
        r#"<?xml version="1.0" standalone="yes"?><grida version="0"><container/></grida>"#,
        r#"<?xml version="1.0" encoding="UTF-8" foo="bar"?><grida version="0"><container/></grida>"#,
    ] {
        assert!(grida_xml::parse(source).is_err(), "must reject: {source}");
    }

    anchor_lab::textir::parse(r#"<?xml foo="bar"?><frame w="10" h="10"/>"#)
        .expect("historical TextIr continues to ignore declaration contents");
}

#[test]
fn authored_root_and_shape_constraints_are_structural() {
    for attr in [
        "x=\"1\"",
        "y=\"1\"",
        "flow=\"absolute\"",
        "grow=\"1\"",
        "align=\"center\"",
    ] {
        let source = format!("<grida version=\"0\"><container {attr}/></grida>");
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(error.to_string().contains("authored root <container>"));
    }

    for source in [
        r#"<grida version="0"><container width="100" height="100"><rect x="span 0 0" height="10"/></container></grida>"#,
        r#"<grida version="0"><container width="100" height="100"><ellipse x="span 0 0" aspect-ratio="2:1"/></container></grida>"#,
        r#"<grida version="0"><container width="100" height="100"><line x="span 0 0"/></container></grida>"#,
    ] {
        let doc = grida_xml::parse(source).expect("Span supplies the primitive axis");
        grida_xml::print(&doc).expect("accepted primitive sizing prints and reparses");
    }

    let cases = [
        (
            r#"<grida version="0"><container><rect width="10"/></container></grida>"#,
            "require both axes supplied",
        ),
        (
            r#"<grida version="0"><container><ellipse width="auto" height="10"/></container></grida>"#,
            "require both axes supplied",
        ),
        (
            r#"<grida version="0"><container><line width="10" height="0"/></container></grida>"#,
            "must not declare height",
        ),
        (
            r#"<grida version="0"><container><line width="10" min-height="1"/></container></grida>"#,
            "must not declare min-height/max-height",
        ),
        (
            r#"<grida version="0"><container><line width="10" y="span 0 0"/></container></grida>"#,
            "must not declare a y Span",
        ),
        (
            r#"<grida version="0"><container><rect x="span 0 0" width="10" height="10"/></container></grida>"#,
            "span x binding cannot also declare width",
        ),
        (
            r#"<grida version="0"><container><text x="span 0 0" min-width="10">x</text></container></grida>"#,
            "span x binding cannot also declare width/min-width/max-width",
        ),
        (
            r#"<grida version="0"><container><text y="span 0 0" max-height="10">x</text></container></grida>"#,
            "span y binding cannot also declare height/min-height/max-height",
        ),
        (
            r#"<grida version="0"><container><group min-width="1"/></container></grida>"#,
            "derived box",
        ),
        (
            r#"<grida version="0"><container><group x="span 0 0"/></container></grida>"#,
            "derived origin and cannot use Span",
        ),
        (
            r#"<grida version="0"><container><lens y="span 0 0"/></container></grida>"#,
            "derived origin and cannot use Span",
        ),
        (
            r#"<grida version="0"><container><rect width="10" height="10" aspect-ratio="1:1"/></container></grida>"#,
            "require both axes supplied",
        ),
        (
            r#"<grida version="0"><container><rect aspect-ratio="1:1"/></container></grida>"#,
            "require both axes supplied",
        ),
        (
            r#"<grida version="0"><container><line width="10" aspect-ratio="1:1"/></container></grida>"#,
            "must not declare aspect-ratio",
        ),
        (
            r#"<grida version="0"><container aspect-ratio="1:1"/></grida>"#,
            "only valid on <rect> and <ellipse>",
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
fn fill_shorthand_normalizes_and_is_not_valid_on_derived_kinds() {
    for fill in ["112233", "#GG0000", "#12"] {
        let source = format!(
            "<grida version=\"0\"><container><rect width=\"1\" height=\"1\" fill=\"{fill}\"/></container></grida>"
        );
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(error.to_string().contains("#RGB or #RRGGBB"));
    }
    let group = r##"<grida version="0"><container><group fill="#112233"/></container></grida>"##;
    assert!(grida_xml::parse(group)
        .unwrap_err()
        .to_string()
        .contains("fill is not valid"));

    let valid = r##"<grida version="0"><container><rect width="1" height="1" fill="#abc"/></container></grida>"##;
    let printed = grida_xml::print(&grida_xml::parse(valid).unwrap()).unwrap();
    assert!(printed.contains("fill=\"#AABBCC\""));
    assert!(!printed.contains("<fill>"));
}

/// Draft 0 has one vocabulary. Historical spellings remain available only
/// through the explicitly historical E3 surface.
#[test]
fn historical_vocabulary_is_textir_only() {
    for source in [
        r#"<grida version="0"><frame width="300" height="200"/></grida>"#,
        r#"<grida version="0"><container w="300" height="200"/></grida>"#,
        r#"<grida version="0"><container width="300" h="200"/></grida>"#,
    ] {
        assert!(
            grida_xml::parse(source).is_err(),
            "Draft 0 rejected: {source}"
        );
    }

    let historical = anchor_lab::textir::parse(r#"<frame w="300" h="200"/>"#)
        .expect("historical E3 parser remains available");
    assert!(anchor_lab::textir::print(&historical).starts_with("<frame w=\"300\" h=\"200\""));
}

/// Versioning and the one-render-root boundary are parse-time walls, not
/// conventions a consumer has to reconstruct after parsing.
#[test]
fn malformed_document_boundaries_are_typed_errors() {
    let cases = [
        (
            r#"<grida version="1"><container width="1" height="1"/></grida>"#,
            "unsupported",
        ),
        (
            r#"<grida><container width="1" height="1"/></grida>"#,
            "requires version",
        ),
        (
            r#"<grida version="0"><container/><container/></grida>"#,
            "multiple render roots",
        ),
        (r#"<grida version="0"></grida>"#, "exactly one render root"),
        (r#"<container width="1" height="1"/>"#, "must be inside"),
        (
            r#"<grida version="0"><container width="1" w="2"/></grida>"#,
            "unknown attribute `w`",
        ),
        (
            r#"<grida version="0"><container><text><rect width="1" height="1"/></text></container></grida>"#,
            "cannot contain child",
        ),
        (
            r#"<grida version="0"><container><rect width="10" height="10" layout="flex"/></container></grida>"#,
            "only valid on <container>",
        ),
        (
            r#"<grida version="0"><rect width="10" height="10"/></grida>"#,
            "root must be <container>",
        ),
        (
            r#"<grida version="0"><container><text><![CDATA[content]]></text></container></grida>"#,
            "CDATA is not supported",
        ),
    ];

    for (source, expected) in cases {
        let error: grida_xml::ParseError = grida_xml::parse(source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

/// Printing cannot omit or invent model state to force a document into the
/// envelope. Non-normalized roots and forests are rejected explicitly.
#[test]
fn print_rejects_documents_outside_the_draft0_root_contract() {
    let empty = DocBuilder::new().build();
    assert_eq!(
        grida_xml::print(&empty),
        Err(PrintError::RenderRootCount { found: 0 })
    );

    let mut parsed = grida_xml::parse(COMPOSED).unwrap();
    parsed.get_mut(parsed.root).header.width = SizeIntent::Fixed(10.0);
    assert_eq!(
        grida_xml::print(&parsed),
        Err(PrintError::NonCanonicalDocumentRoot)
    );

    let mut shape_root = DocBuilder::new();
    shape_root.add(
        0,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    assert_eq!(
        grida_xml::print(&shape_root.build()),
        Err(PrintError::RenderRootMustBeContainer { found: "shape" })
    );

    let mut invalid_authored_root = grida_xml::parse(COMPOSED).unwrap();
    let authored_root = invalid_authored_root
        .get(invalid_authored_root.root)
        .children[0];
    invalid_authored_root.get_mut(authored_root).header.x = AxisBinding::start(10.0);
    assert!(matches!(
        grida_xml::print(&invalid_authored_root),
        Err(PrintError::InvalidDocument(_))
    ));

    let mut derived_span = DocBuilder::new();
    let authored_root = derived_span.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let mut group_header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    group_header.x = AxisBinding::Span {
        start: 0.0,
        end: 0.0,
    };
    derived_span.add(authored_root, group_header, Payload::Group);
    assert!(matches!(
        grida_xml::print(&derived_span.build()),
        Err(PrintError::InvalidDocument(_))
    ));
}

#[test]
fn print_roundtrip_ignores_arena_ids_but_not_tree_integrity() {
    let source = r#"
<grida version="0">
  <container width="100" height="100">
    <rect name="A" width="10" height="10"/>
    <rect name="B" width="20" height="20"/>
  </container>
</grida>
"#;
    let mut tombstoned = grida_xml::parse(source).unwrap();
    let container = tombstoned.get(tombstoned.root).children[0];
    let removed = tombstoned.get(container).children[0];
    let survivor = tombstoned.get(container).children[1];
    tombstoned.remove_subtree(removed);
    assert_eq!(tombstoned.get(container).children, vec![survivor]);
    let printed = grida_xml::print(&tombstoned).expect("tombstoned ids are storage only");
    assert!(!printed.contains("name=\"A\""));
    assert!(printed.contains("name=\"B\""));
    grida_xml::parse(&printed).expect("printed survivor reparses");

    let mut sparse = DocBuilder::new();
    let authored_root = sparse.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let mut sparse = sparse.build();
    sparse.add_child(
        authored_root,
        Node {
            id: 9,
            header: Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
            payload: Payload::Shape {
                desc: ShapeDesc::Rect,
            },
            children: vec![],
            fills: Paints::default(),
            strokes: vec![],
        },
    );
    grida_xml::print(&sparse).expect("non-DFS arena ids are storage only");

    let canonical = DocBuilder::new().build();
    let mut relocated_root = canonical.get(canonical.root).clone();
    relocated_root.id = 7;
    relocated_root.children = vec![9];
    let relocated_container = Node {
        id: 9,
        header: Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        payload: Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
        children: vec![],
        fills: Paints::default(),
        strokes: vec![],
    };
    let relocated = Document::from_map(
        BTreeMap::from([(7, relocated_root), (9, relocated_container)]),
        7,
    );
    grida_xml::print(&relocated).expect("root ids are storage only");

    let mut unreachable = grida_xml::parse(COMPOSED).unwrap();
    let container = unreachable.get(unreachable.root).children[0];
    unreachable.get_mut(container).children.clear();
    assert!(matches!(
        grida_xml::print(&unreachable),
        Err(PrintError::InvalidDocument(_))
    ));

    let mut dead_edge = grida_xml::parse(COMPOSED).unwrap();
    dead_edge.get_mut(dead_edge.root).children[0] = 99;
    assert!(matches!(
        grida_xml::print(&dead_edge),
        Err(PrintError::InvalidDocument(_))
    ));

    let mut dead_root = DocBuilder::new().build();
    dead_root.remove_subtree(dead_root.root);
    assert!(matches!(
        grida_xml::print(&dead_root),
        Err(PrintError::InvalidDocument(_))
    ));
}
