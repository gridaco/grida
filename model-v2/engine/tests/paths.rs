//! Unit-reference path materialization: one parsed artifact feeds bounds,
//! drawlist, damage, and raster paint. Pixel probes stay well away from AA
//! except where they deliberately distinguish the two authored stroke bands.

mod support;

use std::sync::Arc;

use anchor_engine::damage;
use anchor_engine::drawlist::ItemKind;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::path::FillRule;
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{surfaces, Color as SkColor, Paint as SkPaint, Rect};

const SOURCE: &str = include_str!("../rig/fixtures/unit-path.grida.xml");
const WIDTH: i32 = 96;
const HEIGHT: i32 = 80;

fn options() -> ResolveOptions {
    ResolveOptions {
        viewport: (WIDTH as f32, HEIGHT as f32),
        ..Default::default()
    }
}

#[test]
fn one_path_artifact_drives_fill_and_repeated_strokes() {
    let document = grida_xml::parse(SOURCE).expect("unit path fixture parses");
    let resolved = resolve(&document, &options());
    let list = anchor_engine::drawlist::build_glyphless_unchecked(&document, &resolved);

    assert_eq!(list.items.len(), 4, "container, fill, then two strokes");
    let ItemKind::PathFill {
        w,
        h,
        path: fill_path,
        ..
    } = &list.items[1].kind
    else {
        panic!("second item is the path fill");
    };
    assert_eq!((*w, *h), (80.0, 64.0));
    assert_eq!(fill_path.fill_rule, FillRule::EvenOdd);
    assert!((fill_path.source.unit_bounds.x - 0.05).abs() < 1.0e-6);
    assert!((fill_path.source.unit_bounds.y - 0.05).abs() < 1.0e-6);
    assert!((fill_path.source.unit_bounds.w - 0.9).abs() < 1.0e-6);
    assert!((fill_path.source.unit_bounds.h - 0.9).abs() < 1.0e-6);
    assert!((fill_path.local_bounds.x - 4.0).abs() < 1.0e-5);
    assert!((fill_path.local_bounds.y - 3.2).abs() < 1.0e-5);
    assert!((fill_path.local_bounds.w - 72.0).abs() < 1.0e-5);
    assert!((fill_path.local_bounds.h - 57.6).abs() < 1.0e-5);
    assert!(fill_path.all_contours_closed);

    for item in &list.items[2..] {
        let ItemKind::PathStroke { path, .. } = &item.kind else {
            panic!("path children paint before repeated path strokes");
        };
        assert!(
            Arc::ptr_eq(fill_path, path),
            "display-list items reuse the resolved parse"
        );
    }
}

#[test]
fn evenodd_fill_and_repeated_strokes_render_in_painter_order() {
    let (image, _) = support::render_xml(SOURCE, WIDTH, HEIGHT, &PaintCtx::default());

    assert_eq!(image.at(4, 40), [255, 255, 255, 255]); // backdrop
    assert_eq!(image.at(10, 40), [37, 99, 235, 255]); // wide blue stroke
    assert_eq!(image.at(12, 40), [255, 255, 255, 255]); // top white stroke
    assert_eq!(image.at(20, 20), [239, 68, 68, 255]); // path fill
    assert_eq!(image.at(48, 40), [255, 255, 255, 255]); // even-odd hole

    let nonzero = SOURCE.replace("fill-rule=\"evenodd\"", "fill-rule=\"nonzero\"");
    let (nonzero_image, _) = support::render_xml(&nonzero, WIDTH, HEIGHT, &PaintCtx::default());
    assert_eq!(nonzero_image.at(48, 40), [239, 68, 68, 255]);
}

#[test]
fn same_box_path_edit_is_material_damage() {
    let before = grida_xml::parse(SOURCE).unwrap();
    let edited_source = SOURCE.replace("M .35 .35 H .65", "M .45 .35 H .65");
    let after = grida_xml::parse(&edited_source).unwrap();
    let before_resolved = resolve(&before, &options());
    let after_resolved = resolve(&after, &options());

    let result = damage::diff(&before_resolved, &after_resolved);
    assert_eq!(result.changed, vec![2]);
    assert!(result.union_world.is_some());
}

#[test]
fn equivalent_path_spelling_is_not_visual_damage() {
    let before = grida_xml::parse(SOURCE).unwrap();
    let equivalent_source = SOURCE.replace(
        "M .05 .05 H .95 V .95 H .05 Z M .35 .35 H .65 V .65 H .35 Z",
        "m .05 .05 h .9 v .9 h -.9 z m .3 .3 h .3 v .3 h -.3 z",
    );
    let after = grida_xml::parse(&equivalent_source).unwrap();

    let before_resolved = resolve(&before, &options());
    let after_resolved = resolve(&after, &options());
    let result = damage::diff(&before_resolved, &after_resolved);
    assert!(result.is_empty());
    assert_eq!(
        anchor_engine::drawlist::build_glyphless_unchecked(&before, &before_resolved),
        anchor_engine::drawlist::build_glyphless_unchecked(&after, &after_resolved),
        "equivalent source spelling must not invalidate the visual display list"
    );
}

#[test]
fn path_children_paint_between_the_fill_and_parent_strokes() {
    let source = r##"<grida version="0"><container width="32" height="32"><path width="32" height="32" d="M 0 0 H 1 V 1 H 0 Z" fill="#EF4444"><stroke><solid color="#FFFFFF"/></stroke><rect x="8" y="8" width="16" height="16" fill="#2563EB"/></path></container></grida>"##;
    let document = grida_xml::parse(source).unwrap();
    let resolved = resolve(
        &document,
        &ResolveOptions {
            viewport: (32.0, 32.0),
            ..Default::default()
        },
    );
    let list = anchor_engine::drawlist::build_glyphless_unchecked(&document, &resolved);

    assert!(matches!(list.items[0].kind, ItemKind::PathFill { .. }));
    assert!(matches!(list.items[1].kind, ItemKind::RectFill { .. }));
    assert!(matches!(list.items[2].kind, ItemKind::PathStroke { .. }));
}

#[test]
fn svg_arcs_materialize_before_nonuniform_box_scaling() {
    let source = r##"<grida version="0"><container width="100" height="60" fill="#FFFFFF"><path x="10" y="10" width="80" height="40" d="M .5 .05 A .45 .45 0 0 1 .5 .95 A .45 .45 0 0 1 .5 .05 Z" fill="#EF4444"/></container></grida>"##;
    let (image, _) = support::render_xml(source, 100, 60, &PaintCtx::default());

    assert_eq!(image.at(50, 30), [239, 68, 68, 255]);
    assert_eq!(image.at(15, 15), [255, 255, 255, 255]);
    assert_eq!(image.at(85, 45), [255, 255, 255, 255]);
}

#[test]
fn path_gradient_and_image_paints_use_the_declared_box() {
    let source = r##"<grida version="0"><container width="100" height="40" fill="#FFFFFF"><path width="100" height="20" d="M .1 0 H .5 V 1 H .1 Z"><fill><gradient kind="linear" from="0 0" to="1 0"><stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/></gradient></fill></path><path y="20" width="100" height="20" d="M .1 0 H .5 V 1 H .1 Z"><fill><image src="stripe" fit="fill"/></fill></path></container></grida>"##;

    let mut stripe = surfaces::raster_n32_premul((100, 1)).unwrap();
    stripe.canvas().clear(SkColor::RED);
    let mut blue = SkPaint::default();
    blue.set_color(SkColor::BLUE);
    stripe
        .canvas()
        .draw_rect(Rect::from_xywh(50.0, 0.0, 50.0, 1.0), &blue);
    let mut context = PaintCtx::default();
    context.insert_image("stripe", stripe.image_snapshot());

    let (image, _) = support::render_xml(source, 100, 40, &context);
    let gradient = image.at(40, 10);
    assert!(
        (95..=110).contains(&gradient[0])
            && gradient[0] == gradient[1]
            && gradient[1] == gradient[2],
        "gradient must be evaluated at u=0.4 of the declared box: {gradient:?}"
    );
    let image_paint = image.at(40, 30);
    assert!(
        image_paint[0] >= 250 && image_paint[1] < 50 && image_paint[2] < 50,
        "image fit must be evaluated against the full declared box: {image_paint:?}"
    );
    assert_eq!(image.at(60, 10), [255, 255, 255, 255]);
    assert_eq!(image.at(60, 30), [255, 255, 255, 255]);
}
