//! Focused data and raster probes for the resolved text-line topology. The
//! bundled font keeps these backend observations deterministic; they are probe
//! tests, not external-reference reftests.

mod support;

use anchor_engine::drawlist::{build, DrawList, ItemKind};
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{
    AttributedString, Color, DocBuilder, Header, Paint as ModelPaint, Paints, Payload, SizeIntent,
    StyledTextRun, TextStyleRec,
};
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
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let (_, list, _) = frame::render(
        surface.canvas(),
        document,
        &options,
        &Affine::IDENTITY,
        &paint_ctx(),
    );
    (RgbaImage::from_image(&surface.image_snapshot()), list)
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
    let list = build(&doc, &resolved);
    let lines = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextFill { lines, .. } => Some(lines),
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
        lines.iter().map(|line| line.baseline_y).collect::<Vec<_>>(),
        [8.5, 20.5, 32.5, 44.5]
    );
}

#[test]
fn fill_and_repeated_strokes_share_one_text_line_topology() {
    let source = r##"<grida version="0"><container width="80" height="40"><text width="60" font-size="10" fill="#000000"><stroke width="1" align="center"><solid color="#FF0000"/></stroke><stroke width="2" align="outside"><solid color="#0000FF"/></stroke>aa bb cc</text></container></grida>"##;
    let doc = grida_xml::parse(source).unwrap();
    let resolved = resolve(&doc, &ResolveOptions::default());
    let list = build(&doc, &resolved);
    let topologies = list
        .items
        .iter()
        .filter_map(|item| match &item.kind {
            ItemKind::TextFill { lines, .. } | ItemKind::TextStroke { lines, .. } => Some(lines),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(topologies.len(), 3);
    assert!(topologies[1..]
        .iter()
        .all(|lines| std::sync::Arc::ptr_eq(topologies[0], lines)));
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
            ItemKind::TextStroke { lines, .. } => Some(lines),
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
    let list = build(&document, &resolved);
    let (lines, paint_w, paint_h) = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextFill {
                lines,
                paint_w,
                paint_h,
            } => Some((lines, *paint_w, *paint_h)),
            _ => None,
        })
        .expect("attributed fill item");
    assert_eq!((paint_w, paint_h), (80.0, 24.0));
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].text, "ABCD");
    let fragments = &lines[0].fragments;
    assert_eq!(fragments.len(), 4);
    assert_eq!(
        fragments.iter().map(|run| run.x).collect::<Vec<_>>(),
        [0.0, 6.0, 18.0, 30.0]
    );
    assert_eq!(fragments[1].style, large);
    assert!(
        fragments[2].paints.is_empty(),
        "explicit empty run fill suppresses fallback"
    );
    let colors = fragments
        .iter()
        .map(|fragment| match fragment.paints.as_slice() {
            [ModelPaint::Solid(paint)] => Some(paint.color),
            [] => None,
            _ => panic!("expected singleton solid or explicit empty fill"),
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
    let list = build(&document, &resolved);
    let lines = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::TextFill { lines, .. } => Some(lines),
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
        lines.iter().map(|line| line.baseline_y).collect::<Vec<_>>(),
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
