//! Focused data and raster probes for the resolved text-line topology. The
//! bundled font keeps these backend observations deterministic; they are probe
//! tests, not external-reference reftests.

mod support;

use anchor_engine::drawlist::{build_glyphless_unchecked, DrawList, ItemKind};
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{
    AttributedString, Color, DocBuilder, Header, Paint as ModelPaint, Paints, Payload, SizeIntent,
    StyledTextRun, TextStyleRec,
};
use anchor_lab::resolve::Resolved;
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{surfaces, Color as SkColor, FontMgr};
use support::RgbaImage;

const INTER: &[u8] =
    include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");

fn paint_ctx() -> PaintCtx {
    let typeface = FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    PaintCtx::new(Some(typeface))
}

fn render(source: &str, width: i32, height: i32) -> (RgbaImage, DrawList) {
    support::render_xml(source, width, height, &paint_ctx())
}

fn render_document(
    document: &anchor_lab::model::Document,
    width: i32,
    height: i32,
) -> (RgbaImage, DrawList) {
    let (image, _, list) = render_document_full(document, width, height);
    (image, list)
}

fn render_document_full(
    document: &anchor_lab::model::Document,
    width: i32,
    height: i32,
) -> (RgbaImage, Resolved, DrawList) {
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let (product, _) = frame::render(
        surface.canvas(),
        document,
        &options,
        &Affine::IDENTITY,
        &paint_ctx(),
    )
    .expect("valid text frame");
    let (resolved, list, _) = product.into_parts();
    (
        RgbaImage::from_image(&surface.image_snapshot()),
        resolved,
        list,
    )
}

fn attributed_document(
    text: &str,
    runs: Vec<StyledTextRun>,
    default_style: TextStyleRec,
    width: f32,
) -> (anchor_lab::model::Document, u32) {
    let mut builder = DocBuilder::new();
    let text_id = builder.add(
        0,
        Header::new(SizeIntent::Fixed(width), SizeIntent::Auto),
        Payload::AttributedText {
            attributed_string: AttributedString::from_runs(text, runs).unwrap(),
            default_style,
        },
    );
    let mut document = builder.build();
    document.get_mut(text_id).fills = Paints::solid(Color::BLACK);
    (document, text_id)
}

fn count_pixels(
    image: &RgbaImage,
    width: i32,
    ys: std::ops::Range<i32>,
    predicate: impl Fn([u8; 4]) -> bool,
) -> usize {
    ys.flat_map(|y| (0..width).map(move |x| image.at(x, y)))
        .filter(|pixel| predicate(*pixel))
        .count()
}

#[test]
fn drawlist_materializes_shared_wrapping_and_explicit_empty_lines() {
    let source = "<grida version=\"0\"><container width=\"60\" height=\"60\"><text width=\"30\" font-size=\"10\" fill=\"#000000\">aa bb cc\nx\n</text></container></grida>";
    let doc = grida_xml::parse(source).unwrap();
    let resolved = resolve(&doc, &ResolveOptions::default());
    let list = build_glyphless_unchecked(&doc, &resolved);
    let lines = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextFill { layout, .. } => Some(&layout.lines),
            _ => None,
        })
        .expect("text fill item");
    assert_eq!(
        lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>(),
        ["aa bb", "cc", "x", ""]
    );
    assert_eq!(
        lines.iter().map(|line| line.baseline).collect::<Vec<_>>(),
        [8.5, 20.5, 32.5, 44.5]
    );
}

#[test]
fn fill_and_repeated_strokes_share_one_text_line_topology() {
    let source = r##"<grida version="0"><container width="80" height="40"><text width="60" font-size="10" fill="#000000"><stroke width="1" align="center"><solid color="#FF0000"/></stroke><stroke width="2" align="outside"><solid color="#0000FF"/></stroke>aa bb cc</text></container></grida>"##;
    let doc = grida_xml::parse(source).unwrap();
    let resolved = resolve(&doc, &ResolveOptions::default());
    let list = build_glyphless_unchecked(&doc, &resolved);
    let topologies = list
        .items
        .iter()
        .filter_map(|item| match &item.kind {
            ItemKind::TextFill { layout, .. } | ItemKind::TextStroke { layout, .. } => Some(layout),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(topologies.len(), 3);
    assert!(topologies[1..]
        .iter()
        .all(|layout| std::sync::Arc::ptr_eq(topologies[0], layout)));
}

#[test]
fn constrained_text_paints_each_soft_wrapped_line() {
    let source = "<grida version=\"0\"><container width=\"40\" height=\"32\"><text width=\"30\" font-size=\"10\" fill=\"#000000\">HI HI HI</text></container></grida>";
    let (image, _) = render(source, 40, 32);
    let dark = |[r, g, b, _]: [u8; 4]| r < 80 && g < 80 && b < 80;
    assert!(count_pixels(&image, 40, 0..12, dark) > 0);
    assert!(count_pixels(&image, 40, 12..25, dark) > 0);
    assert_eq!(count_pixels(&image, 40, 25..32, dark), 0);
}

#[test]
fn text_stroke_combines_nonempty_lines_around_an_explicit_empty_line() {
    let source = "<grida version=\"0\"><container width=\"50\" height=\"70\"><text x=\"5\" y=\"5\" width=\"30\" font-size=\"16\"><fill/><stroke width=\"2\" align=\"center\"><solid color=\"#FF0000\"/></stroke>I\n\nI</text></container></grida>";
    let (image, list) = render(source, 50, 70);
    let red = |[r, g, b, _]: [u8; 4]| r > 160 && g < 100 && b < 100;
    assert!(count_pixels(&image, 50, 4..24, red) > 0);
    assert_eq!(count_pixels(&image, 50, 25..42, red), 0);
    assert!(count_pixels(&image, 50, 42..65, red) > 0);

    let lines = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextStroke { layout, .. } => Some(&layout.lines),
            _ => None,
        })
        .expect("text stroke item");
    assert_eq!(
        lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>(),
        ["I", "", "I"]
    );
}

#[test]
fn attributed_drawlist_preserves_run_metrics_style_and_fill_fallback() {
    let small = TextStyleRec::from_font_size(10.0);
    let large = TextStyleRec {
        font_size: 20.0,
        font_weight: 700,
        font_style_italic: true,
    };
    let (document, _) = attributed_document(
        "ABCD",
        vec![
            StyledTextRun {
                start: 0,
                end: 1,
                style: small,
                fills: None,
            },
            StyledTextRun {
                start: 1,
                end: 2,
                style: large,
                fills: Some(Paints::solid("#FF0000".into())),
            },
            StyledTextRun {
                start: 2,
                end: 3,
                style: large,
                fills: Some(Paints::default()),
            },
            StyledTextRun {
                start: 3,
                end: 4,
                style: small,
                fills: Some(Paints::solid("#0000FF".into())),
            },
        ],
        small,
        80.0,
    );
    let resolved = resolve(&document, &ResolveOptions::default());
    let list = build_glyphless_unchecked(&document, &resolved);
    let (layout, paints, paint_w, paint_h) = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextFill {
                layout,
                paints,
                paint_w,
                paint_h,
            } => Some((layout, paints, *paint_w, *paint_h)),
            _ => None,
        })
        .expect("attributed fill item");
    assert_eq!((paint_w, paint_h), (80.0, 24.0));
    assert_eq!(layout.lines.len(), 1);
    assert_eq!(layout.lines[0].text, "ABCD");
    assert!(
        paints
            .for_source_run(Some(2))
            .expect("valid attributed run")
            .is_empty(),
        "explicit empty run fill suppresses fallback"
    );
    let colors = (0..4)
        .map(|index| {
            match paints
                .for_source_run(Some(index))
                .expect("valid attributed run")
                .as_slice()
            {
                [ModelPaint::Solid(paint)] => Some(paint.color),
                [] => None,
                _ => panic!("expected singleton solid or explicit empty fill"),
            }
        })
        .collect::<Vec<_>>();
    assert_eq!(
        colors,
        [
            Some(Color::BLACK),
            Some("#FF0000".into()),
            None,
            Some("#0000FF".into())
        ]
    );
}

#[test]
fn attributed_wrap_and_auto_height_share_run_aware_line_metrics() {
    let small = TextStyleRec::from_font_size(10.0);
    let large = TextStyleRec::from_font_size(20.0);
    let (document, text_id) = attributed_document(
        "AA bb",
        vec![
            StyledTextRun {
                start: 0,
                end: 3,
                style: small,
                fills: None,
            },
            StyledTextRun {
                start: 3,
                end: 5,
                style: large,
                fills: None,
            },
        ],
        small,
        30.0,
    );
    let resolved = resolve(&document, &ResolveOptions::default());
    assert_eq!(resolved.box_of(text_id).h, 36.0);
    let list = build_glyphless_unchecked(&document, &resolved);
    let lines = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextFill { layout, .. } => Some(&layout.lines),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>(),
        ["AA", "bb"]
    );
    assert_eq!(
        lines.iter().map(|line| line.baseline).collect::<Vec<_>>(),
        [8.5, 29.0]
    );
}

#[test]
fn attributed_painter_renders_mixed_sizes_and_colors() {
    let small = TextStyleRec::from_font_size(12.0);
    let large = TextStyleRec::from_font_size(30.0);
    let (document, _) = attributed_document(
        "I I",
        vec![
            StyledTextRun {
                start: 0,
                end: 2,
                style: small,
                fills: None,
            },
            StyledTextRun {
                start: 2,
                end: 3,
                style: large,
                fills: Some(Paints::solid("#FF0000".into())),
            },
        ],
        small,
        80.0,
    );
    let (image, _) = render_document(&document, 80, 40);
    let dark = |[r, g, b, _]: [u8; 4]| r < 80 && g < 80 && b < 80;
    let red = |[r, g, b, _]: [u8; 4]| r > 160 && g < 100 && b < 100;
    assert!(count_pixels(&image, 80, 0..40, dark) > 0);
    assert!(count_pixels(&image, 80, 0..40, red) > 0);
}

#[test]
fn frame_shares_one_shaped_layout_with_fill_and_every_stroke() {
    let source = r##"<grida version="0"><container width="180" height="80"><text width="120" font-size="20" fill="#000000"><stroke width="1" align="center"><solid color="#FF0000"/></stroke><stroke width="2" align="outside"><solid color="#0000FF"/></stroke>office AV</text></container></grida>"##;
    let document = grida_xml::parse(source).unwrap();
    let container = document.get(document.root).children[0];
    let text_id = document.get(container).children[0];
    let (_, resolved, list) = render_document_full(&document, 180, 80);
    let resolved_layout = resolved.text_layout_of(text_id);

    assert_eq!(
        resolved_layout.oracle,
        anchor_engine::oracle::TEXT_SKPARAGRAPH
    );
    assert!(!resolved_layout.glyph_runs.is_empty());
    assert!(resolved_layout.ink_bounds.is_some());
    assert!(resolved_layout.logical_bounds.unwrap().w <= resolved.box_of(text_id).w);
    assert!((resolved.box_of(text_id).h - resolved_layout.height).abs() < 0.001);

    let item_layouts = list
        .items
        .iter()
        .filter_map(|item| match &item.kind {
            ItemKind::TextFill { layout, .. } | ItemKind::TextStroke { layout, .. } => Some(layout),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(item_layouts.len(), 3);
    assert!(item_layouts
        .iter()
        .all(|layout| std::sync::Arc::ptr_eq(resolved_layout, layout)));
}

#[test]
fn real_shaping_drives_auto_width_for_proportional_glyphs() {
    let mut builder = DocBuilder::new();
    let narrow = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: "iiii".into(),
            font_size: 24.0,
        },
    );
    let wide = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: "WWWW".into(),
            font_size: 24.0,
        },
    );
    let document = builder.build();
    let (_, resolved, _) = render_document_full(&document, 200, 80);

    assert!(
        resolved.box_of(wide).w > resolved.box_of(narrow).w * 2.0,
        "a real proportional font must replace equal-character-count estimates"
    );
    assert_eq!(
        resolved.box_of(narrow).w.to_bits(),
        resolved.text_layout_of(narrow).width.to_bits()
    );
    assert_eq!(
        resolved.box_of(wide).w.to_bits(),
        resolved.text_layout_of(wide).width.to_bits()
    );
}

#[test]
fn paint_only_run_boundary_survives_shaping_without_ambiguous_glyph_ownership() {
    let style = TextStyleRec::from_font_size(30.0);
    let (document, text_id) = attributed_document(
        "fi",
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
                fills: Some(Paints::solid("#FF0000".into())),
            },
        ],
        style,
        80.0,
    );
    let (_, resolved, _) = render_document_full(&document, 80, 48);
    let layout = resolved.text_layout_of(text_id);
    assert_eq!(
        layout
            .glyph_runs
            .iter()
            .map(|run| run.source_run)
            .collect::<Vec<_>>(),
        [Some(0), Some(1)]
    );
    assert!(layout.glyph_runs.iter().all(|run| !run.glyphs.is_empty()));
}
