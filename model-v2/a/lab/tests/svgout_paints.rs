//! SVG snapshot output must either preserve the paint subset it supports or
//! reject the document. It must never choose a representative paint or invent
//! a fallback color.

use anchor_lab::grida_xml;
use anchor_lab::resolve::{resolve, ResolveOptions};
use anchor_lab::svgout::{self, SvgOptions};

fn render(source: &str) -> Result<String, svgout::SvgError> {
    let doc = grida_xml::parse(source).expect("fixture parses");
    let resolved = resolve(&doc, &ResolveOptions::default());
    svgout::render(
        &doc,
        &resolved,
        &SvgOptions {
            show_aabb: false,
            width: 100.0,
            height: 100.0,
        },
    )
}

#[test]
fn empty_paint_stacks_emit_none_without_snapshot_fallbacks() {
    let svg = render(
        r#"<grida version="0"><container><rect width="10" height="10"><fill/></rect></container></grida>"#,
    )
    .unwrap();
    assert!(svg.contains(r#"fill="none""#), "{svg}");
    for fallback in ["#f6f6f6", "#4a90d9", "#222"] {
        assert!(
            !svg.contains(fallback),
            "invented fallback {fallback}: {svg}"
        );
    }
}

#[test]
fn singleton_solid_preserves_rgba8_alpha_and_visibility() {
    let alpha = render(
        r##"<grida version="0"><container><rect width="10" height="10"><fill><solid color="#f00" opacity="0.5"/></fill></rect></container></grida>"##,
    )
    .unwrap();
    assert!(
        alpha.contains(r##"fill="#FF0000" fill-opacity="0.5019608""##),
        "{alpha}"
    );

    let hidden = render(
        r##"<grida version="0"><container><rect width="10" height="10"><fill><solid color="#f00" visible="false"/></fill></rect></container></grida>"##,
    )
    .unwrap();
    assert!(hidden.contains(r#"fill="none""#), "{hidden}");
    assert!(!hidden.contains("#FF0000"), "{hidden}");
}

#[test]
fn rich_and_ordered_stacks_fail_instead_of_being_narrowed() {
    let rich = render(
        r##"<grida version="0"><container><rect width="10" height="10"><fill><gradient kind="linear"><stop offset="0" color="#000"/><stop offset="1" color="#fff"/></gradient></fill></rect></container></grida>"##,
    )
    .unwrap_err();
    assert!(rich.to_string().contains("rich paint"), "{rich}");

    let ordered = render(
        r##"<grida version="0"><container><rect width="10" height="10"><fill><solid color="#000"/><solid color="#fff"/></fill></rect></container></grida>"##,
    )
    .unwrap_err();
    assert!(ordered.to_string().contains("2 paints"), "{ordered}");
}

#[test]
fn authored_strokes_fail_instead_of_disappearing() {
    let error = render(
        r##"<grida version="0"><container><rect width="10" height="10"><stroke><solid color="#000"/></stroke></rect></container></grida>"##,
    )
    .unwrap_err();
    assert!(error.to_string().contains("authored strokes"), "{error}");
}
