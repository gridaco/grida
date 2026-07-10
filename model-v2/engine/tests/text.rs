//! Focused data and raster probes for the resolved text-line topology. The
//! bundled font keeps these backend observations deterministic; they are probe
//! tests, not external-reference reftests.

use anchor_engine::drawlist::{build, DrawList, ItemKind};
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{
    image::CachingHint, surfaces, AlphaType, Color, ColorType, FontMgr, IPoint, Image, ImageInfo,
};

const INTER: &[u8] =
    include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");

fn paint_ctx() -> PaintCtx {
    let typeface = FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    PaintCtx::new(Some(typeface))
}

fn render(source: &str, width: i32, height: i32) -> (Image, DrawList) {
    let doc = grida_xml::parse(source).expect("text fixture parses");
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("raster surface");
    surface.canvas().clear(Color::WHITE);
    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let (_, list, _) = frame::render(
        surface.canvas(),
        &doc,
        &options,
        &Affine::IDENTITY,
        &paint_ctx(),
    );
    (surface.image_snapshot(), list)
}

fn rgba_at(image: &Image, x: i32, y: i32) -> [u8; 4] {
    let info = ImageInfo::new((1, 1), ColorType::RGBA8888, AlphaType::Unpremul, None);
    let mut rgba = [0u8; 4];
    assert!(image.read_pixels(
        &info,
        &mut rgba,
        4,
        IPoint::new(x, y),
        CachingHint::Disallow,
    ));
    rgba
}

fn count_pixels(
    image: &Image,
    width: i32,
    ys: std::ops::Range<i32>,
    predicate: impl Fn([u8; 4]) -> bool,
) -> usize {
    let mut count = 0;
    for y in ys {
        for x in 0..width {
            count += usize::from(predicate(rgba_at(image, x, y)));
        }
    }
    count
}

#[test]
fn drawlist_materializes_shared_wrapping_and_explicit_empty_lines() {
    let source = "<grida version=\"0\"><container width=\"60\" height=\"60\"><text width=\"30\" size=\"10\" fill=\"#000000\">aa bb cc\nx\n</text></container></grida>";
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
    let source = r##"<grida version="0"><container width="80" height="40"><text width="60" size="10" fill="#000000"><stroke width="1" align="center"><solid color="#FF0000"/></stroke><stroke width="2" align="outside"><solid color="#0000FF"/></stroke>aa bb cc</text></container></grida>"##;
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
    let source = "<grida version=\"0\"><container width=\"40\" height=\"32\"><text width=\"30\" size=\"10\" fill=\"#000000\">HI HI HI</text></container></grida>";
    let (image, _) = render(source, 40, 32);
    let dark = |[r, g, b, _]: [u8; 4]| r < 80 && g < 80 && b < 80;
    assert!(count_pixels(&image, 40, 0..12, dark) > 0);
    assert!(count_pixels(&image, 40, 12..25, dark) > 0);
    assert_eq!(count_pixels(&image, 40, 25..32, dark), 0);
}

#[test]
fn text_stroke_combines_nonempty_lines_around_an_explicit_empty_line() {
    let source = "<grida version=\"0\"><container width=\"50\" height=\"70\"><text x=\"5\" y=\"5\" width=\"30\" size=\"16\"><fill/><stroke width=\"2\" align=\"center\"><solid color=\"#FF0000\"/></stroke>I\n\nI</text></container></grida>";
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
