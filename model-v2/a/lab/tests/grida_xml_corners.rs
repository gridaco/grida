//! Draft 0 rounded-box syntax is a lossless projection of Grida's existing
//! per-corner elliptical radii plus normalized corner smoothing.

use anchor_lab::grida_xml::{self, PrintError};
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions};
use anchor_lab::{svgout, textir};

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

fn one_rect(attributes: &str) -> String {
    format!(
        "<grida version=\"0\"><container><rect width=\"100\" height=\"80\" {attributes}/></container></grida>"
    )
}

#[test]
fn per_corner_elliptical_radii_materialize_in_tl_tr_br_bl_order() {
    let (doc, printed) = canonical(&one_rect(r#"corner-radius="1 2 3 4 / 5 6 7 8""#));
    let rect = doc.get(authored_root(&doc)).children[0];
    assert_eq!(
        doc.get(rect).corner_radius,
        RectangularCornerRadius {
            tl: Radius { rx: 1.0, ry: 5.0 },
            tr: Radius { rx: 2.0, ry: 6.0 },
            br: Radius { rx: 3.0, ry: 7.0 },
            bl: Radius { rx: 4.0, ry: 8.0 },
        }
    );
    assert!(
        printed.contains(r#"corner-radius="1 2 3 4 / 5 6 7 8""#),
        "{printed}"
    );
}

#[test]
fn canonical_writer_compresses_only_the_defined_one_or_four_value_grammar() {
    let (_, uniform) = canonical(&one_rect(r#"corner-radius="9 9 9 9""#));
    assert!(uniform.contains(r#"corner-radius="9""#), "{uniform}");

    let (_, elliptical) = canonical(&one_rect(r#"corner-radius="5 5 5 5 / 6 6 6 6""#));
    assert!(
        elliptical.contains(r#"corner-radius="5 / 6""#),
        "{elliptical}"
    );

    let (_, circular) = canonical(&one_rect(r#"corner-radius="1 2 3 4 / 1 2 3 4""#));
    assert!(
        circular.contains(r#"corner-radius="1 2 3 4""#),
        "{circular}"
    );
    assert!(!circular.contains(" / "), "{circular}");
}

#[test]
fn smoothing_is_normalized_and_may_be_dormant_with_zero_radii() {
    let (doc, printed) = canonical(&one_rect(r#"corner-smoothing="0.6""#));
    let rect = doc.get(authored_root(&doc)).children[0];
    assert_eq!(
        doc.get(rect).corner_radius,
        RectangularCornerRadius::default()
    );
    assert_eq!(doc.get(rect).corner_smoothing, CornerSmoothing(0.6));
    assert!(printed.contains(r#"corner-smoothing="0.6""#), "{printed}");

    let (_, rounded) = canonical(&one_rect(
        r#"corner-radius="12 18 24 30" corner-smoothing="1""#,
    ));
    assert!(rounded.contains(r#"corner-smoothing="1""#), "{rounded}");
}

#[test]
fn explicit_zero_corner_defaults_are_omitted() {
    let (_, printed) = canonical(&one_rect(
        r#"corner-radius="0 0 0 0 / 0" corner-smoothing="0""#,
    ));
    assert!(!printed.contains("corner-radius="), "{printed}");
    assert!(!printed.contains("corner-smoothing="), "{printed}");
}

#[test]
fn malformed_corner_values_have_focused_parse_errors() {
    for (attributes, expected) in [
        (r#"corner-radius="""#, "takes 1 or 4 numbers"),
        (r#"corner-radius="1 2""#, "takes 1 or 4 numbers"),
        (r#"corner-radius="1 2 3""#, "takes 1 or 4 numbers"),
        (r#"corner-radius="1 2 3 4 5""#, "takes 1 or 4 numbers"),
        (r#"corner-radius="/ 2""#, "both sides"),
        (r#"corner-radius="2 /""#, "both sides"),
        (r#"corner-radius="1 / 2 / 3""#, "at most one"),
        (r#"corner-radius="-1""#, "non-negative"),
        (r#"corner-radius="NaN""#, "non-finite"),
        (r#"corner-smoothing="-0.1""#, "between 0 and 1"),
        (r#"corner-smoothing="1.1""#, "between 0 and 1"),
        (r#"corner-smoothing="NaN""#, "non-finite"),
    ] {
        let error = grida_xml::parse(&one_rect(attributes)).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "{attributes}: expected `{expected}`, got `{error}`"
        );
    }
}

#[test]
fn corner_attributes_are_box_primitive_only() {
    for node in [
        r#"<ellipse width="10" height="10" corner-radius="2"/>"#,
        r#"<line width="10" corner-smoothing="0.2"/>"#,
        r#"<text corner-radius="2">x</text>"#,
        r#"<group corner-radius="2"/>"#,
    ] {
        let source = format!("<grida version=\"0\"><container>{node}</container></grida>");
        let error = grida_xml::parse(&source).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("only valid on <container> and <rect>"),
            "{node}: {error}"
        );
    }

    canonical(
        r#"<grida version="0"><container corner-radius="8" corner-smoothing="0.5"/></grida>"#,
    );
}

#[test]
fn smooth_elliptical_corners_are_rejected_instead_of_narrowed() {
    let error = grida_xml::parse(&one_rect(
        r#"corner-radius="12 / 8" corner-smoothing="0.5""#,
    ))
    .unwrap_err();
    assert!(error.to_string().contains("requires circular"), "{error}");
}

#[test]
fn writer_validates_programmatic_corner_states() {
    let mut doc = grida_xml::parse(&one_rect("")).unwrap();
    let rect = doc.get(authored_root(&doc)).children[0];

    doc.get_mut(rect).corner_radius = RectangularCornerRadius::circular(-1.0);
    let error = grida_xml::print(&doc).unwrap_err();
    assert!(
        error.to_string().contains("negative corner radii"),
        "{error}"
    );

    doc.get_mut(rect).corner_radius = RectangularCornerRadius::default();
    doc.get_mut(rect).corner_smoothing = CornerSmoothing(f32::NAN);
    let error = grida_xml::print(&doc).unwrap_err();
    assert!(error.to_string().contains("must be finite"), "{error}");

    doc.get_mut(rect).corner_radius = RectangularCornerRadius::all(Radius { rx: 8.0, ry: 4.0 });
    doc.get_mut(rect).corner_smoothing = CornerSmoothing(0.4);
    let error = grida_xml::print(&doc).unwrap_err();
    assert!(error.to_string().contains("cannot render"), "{error}");

    let mut ellipse = grida_xml::parse(
        r#"<grida version="0"><container><ellipse width="10" height="10"/></container></grida>"#,
    )
    .unwrap();
    let ellipse_id = ellipse.get(authored_root(&ellipse)).children[0];
    ellipse.get_mut(ellipse_id).corner_radius = RectangularCornerRadius::circular(2.0);
    let error = grida_xml::print(&ellipse).unwrap_err();
    assert!(error.to_string().contains("cannot carry"), "{error}");
}

#[test]
fn implicit_document_root_corner_state_is_part_of_canonicality() {
    let mut doc = grida_xml::parse(r#"<grida version="0"><container/></grida>"#).unwrap();
    doc.get_mut(doc.root).corner_radius = RectangularCornerRadius::circular(1.0);
    assert_eq!(
        grida_xml::print(&doc),
        Err(PrintError::NonCanonicalDocumentRoot)
    );
}

#[test]
fn historical_textir_and_svg_snapshot_export_refuse_corner_loss() {
    let mut historical =
        textir::parse(r#"<frame w="100" h="100"><shape kind="rect" w="10" h="10"/></frame>"#)
            .unwrap();
    historical.get_mut(1).corner_radius = RectangularCornerRadius::circular(3.0);
    let text_error = textir::try_print(&historical).unwrap_err();
    assert!(
        text_error.to_string().contains("cannot represent"),
        "{text_error}"
    );

    let doc = grida_xml::parse(&one_rect(r#"corner-radius="3""#)).unwrap();
    let resolved = resolve(&doc, &ResolveOptions::default());
    let svg_error = svgout::render(
        &doc,
        &resolved,
        &svgout::SvgOptions {
            show_aabb: false,
            width: 100.0,
            height: 100.0,
        },
    )
    .unwrap_err();
    assert!(svg_error.to_string().contains("losslessly"), "{svg_error}");
}
