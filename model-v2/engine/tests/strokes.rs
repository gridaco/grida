//! Focused data and pixel-probe coverage for authored stroke applications and
//! the display-list scopes they interact with. Native `.grida.xml` has no
//! external visual oracle, so these are data/probe tests rather than reftests.

use anchor_engine::drawlist::{DrawList, ItemKind};
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{Paint, StrokeAlign, StrokeJoin};
use anchor_lab::resolve::ResolveOptions;
use skia_safe::{
    image::CachingHint, surfaces, AlphaType, Color, ColorType, FontMgr, IPoint, Image, ImageInfo,
};

fn render(source: &str, width: i32, height: i32, ctx: &PaintCtx) -> (Image, DrawList) {
    render_on(source, width, height, Color::WHITE, ctx)
}

fn render_on(
    source: &str,
    width: i32,
    height: i32,
    clear: Color,
    ctx: &PaintCtx,
) -> (Image, DrawList) {
    let doc = grida_xml::parse(source).expect("stroke fixture parses");
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("raster surface");
    surface.canvas().clear(clear);
    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let (_, list, _) = frame::render(surface.canvas(), &doc, &options, &Affine::IDENTITY, ctx);
    assert_eq!(
        surface.canvas().save_count(),
        1,
        "display-list scopes leaked canvas state"
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

#[test]
fn drawlist_keeps_repeated_strokes_and_each_ordered_paint_stack() {
    let source = r##"
<grida version="0"><container width="60" height="60">
  <rect x="10" y="10" width="40" height="40" fill="#FFFFFF">
    <stroke width="8" align="outside" join="round" dash-array="8 4">
      <solid color="#FF0000"/>
      <gradient kind="linear" from="0 0.5" to="1 0.5">
        <stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/>
      </gradient>
    </stroke>
    <stroke width="2" align="inside"><solid color="#0000FF"/></stroke>
  </rect>
</container></grida>
"##;
    let (_, list) = render(source, 60, 60, &PaintCtx::new(None));
    let strokes = list
        .items
        .iter()
        .filter_map(|item| match &item.kind {
            ItemKind::RectStroke { stroke, .. } => Some(stroke),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(strokes.len(), 2);
    assert_eq!(strokes[0].width, 8.0);
    assert_eq!(strokes[0].align, StrokeAlign::Outside);
    assert_eq!(strokes[0].join, StrokeJoin::Round);
    assert_eq!(strokes[0].dash_array.as_deref(), Some(&[8.0, 4.0][..]));
    assert!(matches!(strokes[0].paints[0], Paint::Solid(_)));
    assert!(matches!(strokes[0].paints[1], Paint::LinearGradient(_)));
    assert_eq!(strokes[1].width, 2.0);
    assert_eq!(strokes[1].align, StrokeAlign::Inside);
}

#[test]
fn container_clip_applies_to_children_but_not_parent_strokes() {
    let source = r##"
<grida version="0"><container width="100" height="100">
  <container x="20" y="20" width="60" height="60" clips="true" fill="#FFFFFF">
    <stroke width="6" align="outside"><solid color="#FF0000"/></stroke>
    <stroke width="6" align="inside"><solid color="#0000FF"/></stroke>
    <rect x="-20" y="15" width="90" height="30" fill="#00FF00"/>
  </container>
</container></grida>
"##;
    let (image, list) = render(source, 100, 100, &PaintCtx::new(None));
    assert_eq!(rgba_at(&image, 2, 40), [255, 255, 255, 255]);
    assert_eq!(rgba_at(&image, 17, 40), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&image, 22, 40), [0, 0, 255, 255]);
    assert_eq!(rgba_at(&image, 40, 40), [0, 255, 0, 255]);

    let tags = list
        .items
        .iter()
        .map(|item| match &item.kind {
            ItemKind::BeginClipRect { .. } => "clip-begin",
            ItemKind::EndClip => "clip-end",
            ItemKind::RectStroke { .. } => "stroke",
            ItemKind::RectFill { .. } => "fill",
            _ => "other",
        })
        .collect::<Vec<_>>();
    assert_eq!(
        tags,
        ["fill", "clip-begin", "fill", "clip-end", "stroke", "stroke"]
    );
}

#[test]
fn node_opacity_composites_overlapping_children_as_one_group() {
    let source = r##"
<grida version="0"><container width="60" height="40" opacity="0.5">
  <rect width="40" height="40" fill="#000000"/>
  <rect x="20" width="40" height="40" fill="#000000"/>
</container></grida>
"##;
    let (image, list) = render(source, 60, 40, &PaintCtx::new(None));
    let single = rgba_at(&image, 10, 20);
    let overlap = rgba_at(&image, 30, 20);
    assert_eq!(single, overlap, "group overlap must not accumulate alpha");
    // Skia's premultiplied save-layer round-trip lands at 126 on this raster
    // backend; the equality with the overlap pixel is the semantic assertion.
    assert!((125..=128).contains(&overlap[0]), "{overlap:?}");
    assert_eq!(overlap[0], overlap[1]);
    assert_eq!(overlap[1], overlap[2]);
    assert!(matches!(
        list.items.first().map(|item| &item.kind),
        Some(ItemKind::BeginOpacity { opacity: 0.5 })
    ));
    assert!(matches!(
        list.items.last().map(|item| &item.kind),
        Some(ItemKind::EndOpacity)
    ));
}

#[test]
fn node_opacity_preserves_the_backdrop_for_descendant_blend_modes() {
    let source = r##"
<grida version="0"><container width="40" height="40" fill="#808080">
  <rect width="40" height="40" opacity="0.5">
    <fill><solid color="#FF0000" blend-mode="multiply"/></fill>
  </rect>
</container></grida>
"##;
    let (image, _) = render(source, 40, 40, &PaintCtx::new(None));
    let pixel = rgba_at(&image, 20, 20);
    assert!(
        (127..=129).contains(&pixel[0]),
        "multiply must still see the gray backdrop: {pixel:?}"
    );
    assert!((62..=65).contains(&pixel[1]), "{pixel:?}");
    assert!((62..=65).contains(&pixel[2]), "{pixel:?}");
    assert_eq!(pixel[3], 255);
}

#[test]
fn empty_opacity_group_does_not_recomposite_a_translucent_backdrop() {
    let source = r##"
<grida version="0"><container width="20" height="20">
  <rect width="20" height="20"><fill><solid color="#000000" opacity="0.5"/></fill></rect>
  <container width="20" height="20" opacity="0.5"/>
</container></grida>
"##;
    let (image, _) = render_on(source, 20, 20, Color::TRANSPARENT, &PaintCtx::new(None));
    let pixel = rgba_at(&image, 10, 10);
    assert_eq!(pixel[..3], [0, 0, 0]);
    assert_eq!(
        pixel[3], 128,
        "an empty group must leave its backdrop intact"
    );
}

#[test]
fn stroke_alignment_controls_inside_center_and_outside_coverage() {
    let source = r##"
<grida version="0"><container width="140" height="60">
  <rect x="20" y="20" width="20" height="20" fill="#00FF00">
    <stroke width="6" align="inside"><solid color="#FF0000"/></stroke>
  </rect>
  <rect x="60" y="20" width="20" height="20" fill="#00FF00">
    <stroke width="6" align="center"><solid color="#0000FF"/></stroke>
  </rect>
  <rect x="100" y="20" width="20" height="20" fill="#00FF00">
    <stroke width="6" align="outside"><solid color="#FF00FF"/></stroke>
  </rect>
</container></grida>
"##;
    let (image, _) = render(source, 140, 60, &PaintCtx::new(None));
    assert_eq!(rgba_at(&image, 18, 30), [255, 255, 255, 255]);
    assert_eq!(rgba_at(&image, 22, 30), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&image, 58, 30), [0, 0, 255, 255]);
    assert_eq!(rgba_at(&image, 65, 30), [0, 255, 0, 255]);
    assert_eq!(rgba_at(&image, 98, 30), [255, 0, 255, 255]);
    assert_eq!(rgba_at(&image, 102, 30), [0, 255, 0, 255]);
}

#[test]
fn line_cap_and_dash_geometry_have_stable_interior_probes() {
    let source = r##"
<grida version="0"><container width="90" height="80">
  <line x="20" y="15" width="20">
    <stroke width="10" cap="butt"><solid color="#FF0000"/></stroke>
  </line>
  <line x="20" y="40" width="20">
    <stroke width="10" cap="square"><solid color="#0000FF"/></stroke>
  </line>
  <line x="10" y="65" width="60">
    <stroke width="4" dash-array="10 10"><solid color="#00AA00"/></stroke>
  </line>
</container></grida>
"##;
    let (image, _) = render(source, 90, 80, &PaintCtx::new(None));
    assert_eq!(rgba_at(&image, 16, 15), [255, 255, 255, 255]);
    assert_eq!(rgba_at(&image, 16, 40), [0, 0, 255, 255]);
    assert_eq!(rgba_at(&image, 15, 65), [0, 170, 0, 255]);
    assert_eq!(rgba_at(&image, 25, 65), [255, 255, 255, 255]);
    assert_eq!(rgba_at(&image, 35, 65), [0, 170, 0, 255]);
}

#[test]
fn inside_ellipse_dash_starts_at_the_rightmost_point() {
    let source = r##"
<grida version="0"><container width="100" height="100">
  <ellipse x="10" y="10" width="80" height="80" fill="#FFFFFF">
    <stroke width="8" dash-array="20 300"><solid color="#FF0000"/></stroke>
  </ellipse>
</container></grida>
"##;
    let (image, _) = render(source, 100, 100, &PaintCtx::new(None));
    assert_eq!(rgba_at(&image, 87, 55), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&image, 55, 13), [255, 255, 255, 255]);
}

#[test]
fn miter_and_bevel_joins_differ_at_the_outer_corner() {
    let source = r##"
<grida version="0"><container width="110" height="60">
  <rect x="20" y="20" width="20" height="20" fill="#FFFFFF">
    <stroke width="10" align="center" join="miter" miter-limit="4"><solid color="#FF0000"/></stroke>
  </rect>
  <rect x="70" y="20" width="20" height="20" fill="#FFFFFF">
    <stroke width="10" align="center" join="bevel"><solid color="#0000FF"/></stroke>
  </rect>
</container></grida>
"##;
    let (image, _) = render(source, 110, 60, &PaintCtx::new(None));
    assert_eq!(rgba_at(&image, 16, 16), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&image, 66, 16), [255, 255, 255, 255]);
}

#[test]
fn gradient_strokes_use_the_node_paint_box_not_the_stroke_bounds() {
    let source = r##"
<grida version="0"><container width="120" height="80">
  <rect x="10" y="10" width="100" height="20" fill="#FFFFFF">
    <stroke width="4" align="inside"><gradient kind="linear" from="0 0.5" to="1 0.5">
      <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
    </gradient></stroke>
  </rect>
  <rect x="10" y="50" width="100" height="20" fill="#FFFFFF">
    <stroke width="12" align="inside"><gradient kind="linear" from="0 0.5" to="1 0.5">
      <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
    </gradient></stroke>
  </rect>
</container></grida>
"##;
    let (image, _) = render(source, 120, 80, &PaintCtx::new(None));
    let thin = rgba_at(&image, 50, 12);
    let wide = rgba_at(&image, 50, 52);
    for channel in 0..4 {
        assert!(
            thin[channel].abs_diff(wide[channel]) <= 1,
            "thin={thin:?} wide={wide:?}"
        );
    }
    assert!(rgba_at(&image, 15, 12)[0] > rgba_at(&image, 15, 12)[2]);
    assert!(rgba_at(&image, 105, 12)[2] > rgba_at(&image, 105, 12)[0]);
}

#[test]
fn line_gradient_uses_a_centered_one_pixel_box_for_its_degenerate_axis() {
    let source = r##"
<grida version="0"><container width="100" height="40">
  <line x="10" y="20" width="80"><stroke width="8">
    <gradient kind="linear" from="0 0.5" to="1 0.5">
      <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
    </gradient>
  </stroke></line>
</container></grida>
"##;
    let (image, _) = render(source, 100, 40, &PaintCtx::new(None));
    let left = rgba_at(&image, 15, 20);
    let right = rgba_at(&image, 85, 20);
    assert!(left[0] > left[2], "left={left:?}");
    assert!(right[2] > right[0], "right={right:?}");
}

#[test]
fn image_and_text_strokes_use_the_existing_paint_pipeline() {
    const RID: &str = "fixture://border-diamonds";
    const IMAGE: &[u8] = include_bytes!("../../../fixtures/images/border-diamonds.png");
    const INTER: &[u8] =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
    let source = format!(
        r##"
<grida version="0"><container width="180" height="100">
  <rect x="5" y="5" width="90" height="90" fill="#FFFFFF">
    <stroke width="12" align="inside"><image src="{RID}" fit="fill"/></stroke>
  </rect>
  <text x="115" y="15" width="55" size="60"><fill/>
    <stroke width="3" align="outside"><solid color="#FF0000"/></stroke>I</text>
</container></grida>
"##
    );
    let typeface = FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    let mut ctx = PaintCtx::new(Some(typeface));
    ctx.insert_encoded(RID, IMAGE).unwrap();
    let (image, list) = render(&source, 180, 100, &ctx);
    assert_ne!(rgba_at(&image, 50, 8), [255, 255, 255, 255]);
    assert_eq!(rgba_at(&image, 50, 50), [255, 255, 255, 255]);
    assert!(list
        .items
        .iter()
        .any(|item| matches!(&item.kind, ItemKind::TextStroke { .. })));
    let mut red_pixels = 0;
    for y in 0..100 {
        for x in 100..180 {
            let [r, g, b, _] = rgba_at(&image, x, y);
            red_pixels += usize::from(r > 180 && g < 100 && b < 100);
        }
    }
    assert!(red_pixels > 0, "text stroke emitted no red glyph pixels");
}
