//! Producer contract for ordered typed paints in Draft 0 `.grida.xml`.

use anchor_lab::grida_xml::{self, PrintError};
use anchor_lab::model::*;

const THREE_LAYER: &str = r##"
<grida version="0">
  <container width="320" height="180">
    <rect name="card" width="320" height="180">
      <fill>
        <solid color="#101828"/>
        <gradient kind="linear" from="0 0" to="1 1" opacity="0.8">
          <stop offset="0" color="#7C3AED"/>
          <stop offset="1" color="#2563EB"/>
        </gradient>
        <image src="./noise.png" fit="cover" opacity="0.15"/>
      </fill>
      <text>Example</text>
    </rect>
  </container>
</grida>
"##;

fn named(doc: &Document, name: &str) -> NodeId {
    (0..doc.capacity() as NodeId)
        .find(|id| {
            doc.get_opt(*id)
                .is_some_and(|node| node.header.name.as_deref() == Some(name))
        })
        .expect("named node")
}

#[test]
fn typed_fill_lowers_to_the_ordered_production_variants() {
    let doc = grida_xml::parse(THREE_LAYER).expect("typed fills parse");
    let card = doc.get(named(&doc, "card"));
    assert_eq!(card.fills.len(), 3);

    let Paint::Solid(solid) = &card.fills[0] else {
        panic!("first paint must be solid");
    };
    assert_eq!(solid.color.to_hex(), "#101828");

    let Paint::LinearGradient(linear) = &card.fills[1] else {
        panic!("second paint must be linear gradient");
    };
    assert_eq!(linear.xy1, Alignment::from_uv(0.0, 0.0));
    assert_eq!(linear.xy2, Alignment::from_uv(1.0, 1.0));
    assert_eq!(linear.opacity, 0.8);
    assert_eq!(linear.stops.len(), 2);
    assert_eq!(linear.stops[0].offset, 0.0);
    assert_eq!(linear.stops[1].offset, 1.0);

    let Paint::Image(image) = &card.fills[2] else {
        panic!("third paint must be image");
    };
    assert_eq!(image.image, ResourceRef::Rid("./noise.png".into()));
    assert_eq!(image.fit, ImagePaintFit::Fit(BoxFit::Cover));
    assert_eq!(image.opacity, 0.15);
}

#[test]
fn canonical_writer_preserves_rich_fill_order_and_uses_the_family_gradient() {
    let doc = grida_xml::parse(THREE_LAYER).unwrap();
    let printed = grida_xml::print(&doc).expect("rich paints print");
    let solid = printed.find("<solid").unwrap();
    let gradient = printed.find("<gradient kind=\"linear\"").unwrap();
    let image = printed.find("<image").unwrap();
    assert!(solid < gradient && gradient < image, "{printed}");
    assert!(printed.contains("<fill>"), "{printed}");
    assert!(!printed.contains("<fills"), "{printed}");
    assert!(!printed.contains("<linear-gradient"), "{printed}");
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
    assert_eq!(
        printed,
        grida_xml::print(&grida_xml::parse(&printed).unwrap()).unwrap()
    );
}

#[test]
fn shorthand_and_explicit_empty_fill_have_one_canonical_form() {
    let shorthand = grida_xml::parse(
        r##"<grida version="0"><container><rect name="short" width="1" height="1" fill="#fff"/></container></grida>"##,
    )
    .unwrap();
    let printed = grida_xml::print(&shorthand).unwrap();
    assert!(printed.contains("fill=\"#FFFFFF\""), "{printed}");
    assert!(!printed.contains("<fill>"), "{printed}");

    let structured = grida_xml::parse(
        r##"<grida version="0"><container><rect width="1" height="1"><fill><solid color="#abc"/></fill></rect></container></grida>"##,
    )
    .unwrap();
    let structured_printed = grida_xml::print(&structured).unwrap();
    assert!(
        structured_printed.contains("fill=\"#AABBCC\""),
        "{structured_printed}"
    );
    assert!(
        !structured_printed.contains("<fill>"),
        "{structured_printed}"
    );

    let defaulted = grida_xml::parse(
        r#"<grida version="0"><container><rect name="default" width="1" height="1"/></container></grida>"#,
    )
    .unwrap();
    assert_eq!(
        defaulted.get(named(&defaulted, "default")).fills,
        Paints::solid(Color::BLACK)
    );
    let default_printed = grida_xml::print(&defaulted).unwrap();
    assert!(!default_printed.contains(" fill="), "{default_printed}");
    assert!(!default_printed.contains("<fill"), "{default_printed}");

    let empty = grida_xml::parse(
        r#"<grida version="0"><container><rect name="empty" width="1" height="1"><fill/></rect></container></grida>"#,
    )
    .unwrap();
    assert!(empty.get(named(&empty, "empty")).fills.is_empty());
    let empty_printed = grida_xml::print(&empty).unwrap();
    assert!(empty_printed.contains("<fill/>"), "{empty_printed}");

    let empty_container = grida_xml::parse(
        r#"<grida version="0"><container name="empty-container"><fill/></container></grida>"#,
    )
    .unwrap();
    let empty_container_printed = grida_xml::print(&empty_container).unwrap();
    assert!(
        !empty_container_printed.contains("<fill"),
        "a container's empty fill equals its default: {empty_container_printed}"
    );

    let translucent = grida_xml::parse(
        r##"<grida version="0"><container><rect width="1" height="1"><fill><solid color="#fff" opacity="0.5"/></fill></rect></container></grida>"##,
    )
    .unwrap();
    let translucent_printed = grida_xml::print(&translucent).unwrap();
    assert!(
        translucent_printed.contains("<fill>"),
        "{translucent_printed}"
    );
    assert!(
        translucent_printed.contains("opacity=\"0.5019608\""),
        "{translucent_printed}"
    );

    let conflict = grida_xml::parse(
        r##"<grida version="0"><container><rect width="1" height="1" fill="#fff"><fill/></rect></container></grida>"##,
    )
    .unwrap_err();
    assert!(conflict
        .to_string()
        .contains("both the `fill` attribute and <fill>"));
}

#[test]
fn all_gradient_variants_and_common_properties_round_trip() {
    let source = r##"
<grida version="0"><container><rect name="painted" width="10" height="10"><fill>
  <solid color="#f00" visible="false" opacity="0.5" blend-mode="multiply"/>
  <gradient kind="radial" tile-mode="mirror" transform="1 0 0 1 0.1 0.2"><stop offset="0" color="#000" opacity="0.25"/><stop offset="1" color="#fff"/></gradient>
  <gradient kind="sweep"><stop offset="0" color="#f00"/><stop offset="0" color="#0f0"/><stop offset="1" color="#00f"/></gradient>
  <gradient kind="diamond"><stop offset="0" color="#fff"/><stop offset="1" color="#000"/></gradient>
</fill></rect></container></grida>
"##;
    let doc = grida_xml::parse(source).unwrap();
    let fills = &doc.get(named(&doc, "painted")).fills;
    assert!(matches!(fills[0], Paint::Solid(_)));
    assert!(matches!(fills[1], Paint::RadialGradient(_)));
    assert!(matches!(fills[2], Paint::SweepGradient(_)));
    assert!(matches!(fills[3], Paint::DiamondGradient(_)));
    let Paint::Solid(solid) = &fills[0] else {
        unreachable!()
    };
    assert!(!solid.active);
    assert_eq!(solid.color.alpha(), 128, "solid opacity quantizes to RGBA8");
    assert_eq!(solid.blend_mode, BlendMode::Multiply);

    let printed = grida_xml::print(&doc).unwrap();
    assert!(printed.contains("opacity=\"0.5019608\""), "{printed}");
    assert!(printed.contains("visible=\"false\""), "{printed}");
    assert!(printed.contains("tile-mode=\"mirror\""), "{printed}");
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn enumerated_paint_values_match_the_model_vocabulary() {
    for mode in [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
    ] {
        let source = format!(
            "<grida version=\"0\"><container><rect name=\"r\" width=\"1\" height=\"1\"><fill><solid color=\"#fff\" blend-mode=\"{mode}\"/></fill></rect></container></grida>"
        );
        let doc = grida_xml::parse(&source).unwrap();
        let Paint::Solid(solid) = &doc.get(named(&doc, "r")).fills[0] else {
            unreachable!()
        };
        assert_eq!(solid.blend_mode.as_str(), mode);
    }

    for fit in ["cover", "contain", "fill", "none"] {
        let source = format!(
            "<grida version=\"0\"><container><rect name=\"r\" width=\"1\" height=\"1\"><fill><image src=\"x.png\" fit=\"{fit}\"/></fill></rect></container></grida>"
        );
        let doc = grida_xml::parse(&source).unwrap();
        let Paint::Image(image) = &doc.get(named(&doc, "r")).fills[0] else {
            unreachable!()
        };
        let ImagePaintFit::Fit(actual) = image.fit else {
            unreachable!()
        };
        assert_eq!(actual.as_str(), fit);
    }

    for tile_mode in ["clamp", "repeated", "mirror", "decal"] {
        let source = format!(
            "<grida version=\"0\"><container><rect name=\"r\" width=\"1\" height=\"1\"><fill><gradient kind=\"linear\" tile-mode=\"{tile_mode}\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient></fill></rect></container></grida>"
        );
        let doc = grida_xml::parse(&source).unwrap();
        let Paint::LinearGradient(gradient) = &doc.get(named(&doc, "r")).fills[0] else {
            unreachable!()
        };
        assert_eq!(gradient.tile_mode.as_str(), tile_mode);
    }
}

#[test]
fn text_content_is_exact_around_a_structural_fill_child() {
    let source = "<grida version=\"0\"><container><text name=\"label\"><fill><solid color=\"#f00\" opacity=\"0.5\"/></fill>  hello\nworld  </text></container></grida>";
    let doc = grida_xml::parse(source).unwrap();
    let label = doc.get(named(&doc, "label"));
    let Payload::Text { content, .. } = &label.payload else {
        panic!("text payload")
    };
    assert_eq!(content, "  hello\nworld  ");
    let printed = grida_xml::print(&doc).unwrap();
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());
}

#[test]
fn paint_context_and_structure_errors_are_targeted() {
    let cases = [
        (
            r##"<grida version="0"><container><solid color="#fff"/></container></grida>"##,
            "direct child of <fill> or <stroke>",
        ),
        (
            r#"<grida version="0"><container><image src="x.png"/></container></grida>"#,
            "scene <image> is not supported",
        ),
        (
            r##"<grida version="0"><container><stop offset="0" color="#fff"/></container></grida>"##,
            "direct child of a gradient",
        ),
        (
            r#"<grida version="0"><container><group><fill/></group></container></grida>"#,
            "not valid on <group>",
        ),
        (
            r#"<grida version="0"><container><rect width="1" height="1"><fill/><fill/></rect></container></grida>"#,
            "duplicate <fill>",
        ),
        (
            r#"<grida version="0"><container><rect width="1" height="1"><fill><fill/></fill></rect></container></grida>"#,
            "nested <fill>",
        ),
        (
            r#"<grida version="0"><container><rect width="1" height="1"><text>x</text><fill/></rect></container></grida>"#,
            "must appear before",
        ),
    ];
    for (source, expected) in cases {
        let error = grida_xml::parse(source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected {expected}: {error}"
        );
    }
}

#[test]
fn bad_paint_values_are_rejected_without_coercion() {
    let cases = [
        ("<solid color=\"red\"/>", "#RGB or #RRGGBB"),
        ("<solid color=\"#fff\"></solid>", "must be empty"),
        ("<solid color=\"#fff\" visible=\"yes\"/>", "exactly `true` or `false`"),
        ("<solid color=\"#fff\" opacity=\"1.1\"/>", "between 0 and 1"),
        ("<solid color=\"#fff\" blend-mode=\"pass-through\"/>", "layer mode"),
        ("<image src=\"\"/>", "src must not be empty"),
        ("<image src=\"x\"></image>", "must be empty"),
        ("<image src=\"x\" fit=\"scale-down\"/>", "bad image fit"),
        ("<gradient><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "kind"),
        ("<gradient kind=\"mesh\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "kind"),
        ("<gradient kind=\"radial\" from=\"0 0\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "from"),
        ("<gradient kind=\"sweep\" tile-mode=\"mirror\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "tile-mode"),
        ("<gradient kind=\"radial\" transform=\"1 0 0\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "six numbers"),
        ("<gradient kind=\"diamond\">not-a-stop<stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "character content"),
        ("<gradient kind=\"linear\"><solid color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "only empty <stop>"),
        ("<gradient kind=\"linear\"><stop offset=\"0\" color=\"#000\"></stop><stop offset=\"1\" color=\"#fff\"/></gradient>", "must be empty"),
        ("<gradient kind=\"linear\"><stop color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "requires `offset`"),
        ("<gradient kind=\"linear\"><stop offset=\"0\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "requires `color`"),
        ("<gradient kind=\"linear\"><stop offset=\"0\" color=\"#000\" visible=\"false\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "visible"),
        ("<gradient kind=\"linear\"><stop offset=\"0\" color=\"#000\" opacity=\"-0.1\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "between 0 and 1"),
        ("<gradient kind=\"linear\"><stop offset=\"0\" color=\"#000\"/></gradient>", "at least two stops"),
        ("<gradient kind=\"linear\" from=\"0 0\" to=\"0 0\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "farther apart"),
        ("<gradient kind=\"linear\" from=\"0 0\" to=\"5e-324 0\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "farther apart"),
        ("<gradient kind=\"linear\" from=\"0 0\" to=\"0.00000001 0\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "farther apart"),
        ("<gradient kind=\"linear\" from=\"3.4028235e38 0\" to=\"0 0\"><stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "overflow after lowering"),
        ("<gradient kind=\"linear\"><stop offset=\"0.8\" color=\"#000\"/><stop offset=\"0.2\" color=\"#fff\"/></gradient>", "nondecreasing"),
        ("<gradient kind=\"radial\"><stop offset=\"-1\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/></gradient>", "between 0 and 1"),
    ];
    for (paint, expected) in cases {
        let source = format!(
            "<grida version=\"0\"><container><rect width=\"1\" height=\"1\"><fill>{paint}</fill></rect></container></grida>"
        );
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "expected {expected}: {error}"
        );
    }
}

#[test]
fn gradient_renderability_boundary_is_enforced_during_source_ingestion() {
    let source = |paint: &str| {
        format!(
            "<grida version=\"0\"><container><rect width=\"1\" height=\"1\"><fill>{paint}</fill></rect></container></grida>"
        )
    };
    let stops = "<stop offset=\"0\" color=\"#000\"/><stop offset=\"1\" color=\"#fff\"/>";

    let singular = source(&format!(
        "<gradient kind=\"radial\" transform=\"1 2 2 4 8 9\">{stops}</gradient>"
    ));
    let error = grida_xml::parse(&singular).unwrap_err();
    assert!(
        error.to_string().contains("transform must be invertible"),
        "{error}"
    );

    for distance in ["0.0000152587890625", "0.000030517578125"] {
        let degenerate = source(&format!(
            "<gradient kind=\"linear\" from=\"0 0.5\" to=\"{distance} 0.5\">{stops}</gradient>"
        ));
        let error = grida_xml::parse(&degenerate).unwrap_err();
        assert!(
            error.to_string().contains("farther apart"),
            "distance={distance}: {error}"
        );
    }

    let renderable = source(&format!(
        "<gradient kind=\"linear\" from=\"0 0.5\" to=\"0.00006103515625 0.5\">{stops}</gradient>"
    ));
    grida_xml::parse(&renderable)
        .expect("a linear gradient above Skia's degeneracy threshold remains valid source");
}

#[test]
fn linear_gradient_uv_boundary_is_exact_or_explicitly_unrepresentable() {
    for (u, v) in [
        (0.0, 0.0),
        (0.5, 0.5),
        (0.55, 0.125),
        (-2.5, 1.75),
        (f64::from_bits(1), f64::from_bits(2)),
    ] {
        let alignment = Alignment::from_uv_f64(u, v);
        let canonical = alignment
            .try_to_uv()
            .expect("values produced by the UV boundary are representable");
        assert_eq!(Alignment::from_uv_f64(canonical.0, canonical.1), alignment);
    }

    for alignment in [
        Alignment(0.1, -0.1),
        Alignment(0.25, -12345.678),
        Alignment(-1.0, 1.0),
        Alignment(f32::MAX, -f32::MAX),
    ] {
        let canonical = alignment
            .try_to_uv()
            .expect("ordinary and extreme finite alignments are representable");
        assert_eq!(Alignment::from_uv_f64(canonical.0, canonical.1), alignment);
    }

    let mut doc = grida_xml::parse(
        r##"<grida version="0"><container><rect name="r" width="1" height="1"><fill><gradient kind="linear"><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></gradient></fill></rect></container></grida>"##,
    )
    .unwrap();
    let r = named(&doc, "r");
    let Paint::LinearGradient(gradient) = &mut doc.get_mut(r).fills.as_mut_slice()[0] else {
        unreachable!()
    };
    gradient.xy1 = Alignment(0.1, 0.25);
    gradient.xy2 = Alignment(f32::MAX, -f32::MAX);
    let printed =
        grida_xml::print(&doc).expect("finite f64-representable alignments print exactly");
    assert_eq!(doc, grida_xml::parse(&printed).unwrap());

    let Paint::LinearGradient(gradient) = &mut doc.get_mut(r).fills.as_mut_slice()[0] else {
        unreachable!()
    };
    gradient.xy1 = Alignment(f32::from_bits(1), gradient.xy1.1);
    assert!(gradient.xy1.try_to_uv().is_none());
    assert!(matches!(
        grida_xml::print(&doc),
        Err(PrintError::InvalidDocument(message))
            if message.contains("from alignment is not representable")
                && message.contains("binary64 UV arithmetic")
    ));
}

#[test]
fn writer_refuses_unspellable_gradient_model_state_without_repair() {
    let source = r##"<grida version="0"><container><rect name="r" width="10" height="10"><fill><gradient kind="linear"><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></gradient></fill></rect></container></grida>"##;

    let mut too_few = grida_xml::parse(source).unwrap();
    let r = named(&too_few, "r");
    let Paint::LinearGradient(gradient) = &mut too_few.get_mut(r).fills.as_mut_slice()[0] else {
        unreachable!()
    };
    gradient.stops.pop();
    assert!(matches!(
        grida_xml::print(&too_few),
        Err(PrintError::InvalidDocument(message)) if message.contains("at least two stops")
    ));

    let mut descending = grida_xml::parse(source).unwrap();
    let r = named(&descending, "r");
    let Paint::LinearGradient(gradient) = &mut descending.get_mut(r).fills.as_mut_slice()[0] else {
        unreachable!()
    };
    gradient.stops[0].offset = 0.8;
    gradient.stops[1].offset = 0.2;
    assert!(matches!(
        grida_xml::print(&descending),
        Err(PrintError::InvalidDocument(message)) if message.contains("nondecreasing")
    ));

    let mut coincident = grida_xml::parse(source).unwrap();
    let r = named(&coincident, "r");
    let Paint::LinearGradient(gradient) = &mut coincident.get_mut(r).fills.as_mut_slice()[0] else {
        unreachable!()
    };
    gradient.xy2 = gradient.xy1;
    assert!(matches!(
        grida_xml::print(&coincident),
        Err(PrintError::InvalidDocument(message)) if message.contains("farther apart")
    ));
}

#[test]
fn line_is_stroke_only_and_rejects_both_fill_forms() {
    for source in [
        r##"<grida version="0"><container><line width="10" fill="#fff"/></container></grida>"##,
        r##"<grida version="0"><container><line width="10"><fill><solid color="#fff"/></fill></line></container></grida>"##,
    ] {
        let error = grida_xml::parse(source).unwrap_err();
        assert!(error.to_string().contains("fill"), "{error}");
        assert!(error.to_string().contains("line"), "{error}");
    }
}

#[test]
fn retired_paint_spellings_are_rejected_with_canonical_directions() {
    let cases = [
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fills><solid color="#fff"/></fills></rect></container></grida>"##,
            "<fill>",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill><linear-gradient><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></linear-gradient></fill></rect></container></grida>"##,
            "use <gradient kind=",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill><radial-gradient><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></radial-gradient></fill></rect></container></grida>"##,
            "use <gradient kind=",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill><sweep-gradient><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></sweep-gradient></fill></rect></container></grida>"##,
            "use <gradient kind=",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill><diamond-gradient><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></diamond-gradient></fill></rect></container></grida>"##,
            "use <gradient kind=",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill><paint kind="solid" color="#fff"/></fill></rect></container></grida>"##,
            "unknown paint element <paint>",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill><color value="#fff"/></fill></rect></container></grida>"##,
            "unknown paint element <color>",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><fill kind="solid"><solid color="#fff"/></fill></rect></container></grida>"##,
            "kind",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><paints target="fill"><solid color="#fff"/></paints></rect></container></grida>"##,
            "<paints>",
        ),
        (
            r##"<grida version="0"><container><rect width="1" height="1"><strokes><stroke><solid color="#fff"/></stroke></strokes></rect></container></grida>"##,
            "<stroke>",
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
fn frozen_textir_is_singleton_solid_and_rich_state_fails_writers() {
    let historical = anchor_lab::textir::parse(
        r##"<frame w="10" h="10"><shape kind="rect" w="1" h="1" fill="#abc"/></frame>"##,
    )
    .unwrap();
    let printed = anchor_lab::textir::try_print(&historical).unwrap();
    assert!(printed.contains("fill=\"#000000\""));
    assert_eq!(historical, anchor_lab::textir::parse(&printed).unwrap());

    for (legacy, canonical) in [
        ("112233", "#112233"),
        ("#445566", "#445566"),
        ("##778899", "#778899"),
    ] {
        let source = format!(
            r#"<frame w="10" h="10"><shape kind="rect" w="1" h="1" fill="{legacy}"/></frame>"#
        );
        let doc = anchor_lab::textir::parse(&source).unwrap();
        assert!(
            anchor_lab::textir::try_print(&doc)
                .unwrap()
                .contains(&format!(r#"fill="{canonical}""#)),
            "legacy color {legacy}"
        );
    }

    let grida_short = grida_xml::parse(
        r##"<grida version="0"><container><rect width="1" height="1" fill="#abc"/></container></grida>"##,
    )
    .unwrap();
    assert!(grida_xml::print(&grida_short)
        .unwrap()
        .contains("fill=\"#AABBCC\""));
    assert!(anchor_lab::textir::parse(
        r##"<frame w="10" h="10"><fills><solid color="#fff"/></fills></frame>"##
    )
    .is_err());

    let rich = grida_xml::parse(THREE_LAYER).unwrap();
    assert!(anchor_lab::textir::try_print(&rich).is_err());

    let mut unsupported_image = rich.clone();
    let card = named(&unsupported_image, "card");
    let Paint::Image(image) = &mut unsupported_image.get_mut(card).fills.as_mut_slice()[2] else {
        panic!("image paint")
    };
    image.quarter_turns = 1;
    assert!(matches!(
        grida_xml::print(&unsupported_image),
        Err(PrintError::InvalidDocument(message)) if message.contains("quarter-turns")
    ));
}
