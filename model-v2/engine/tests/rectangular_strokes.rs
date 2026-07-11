//! Focused data and raster probes for Grida's rectangular stroke-width union.
//!
//! Native `.grida.xml` has no independent visual oracle, so these tests use
//! high-contrast probes away from antialiased boundaries and assert the
//! model-to-drawlist projection separately.

mod support;

use anchor_engine::drawlist::ItemKind;
use anchor_engine::paint::PaintCtx;
use anchor_lab::model::{
    Radius, RectangularCornerRadius, RectangularStrokeWidth, StrokeAlign, StrokeWidth,
};
use support::render_xml;

#[test]
fn drawlist_preserves_top_right_bottom_left_widths() {
    let source = r##"<grida version="0">
  <container width="80" height="70">
    <rect x="10" y="10" width="60" height="50" corner-radius="12 8 4 2 / 4 8 12 16">
      <stroke width="2 8 12 4" align="outside"><solid color="#7C3AED"/></stroke>
    </rect>
  </container>
</grida>
"##;
    let (_, list) = render_xml(source, 80, 70, &PaintCtx::new(None));
    let (corner_radius, stroke) = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::RectStroke {
                corner_radius,
                stroke,
                ..
            } => Some((corner_radius, stroke)),
            _ => None,
        })
        .expect("rectangular stroke draw item");
    assert_eq!(
        *corner_radius,
        RectangularCornerRadius {
            tl: Radius { rx: 12.0, ry: 4.0 },
            tr: Radius { rx: 8.0, ry: 8.0 },
            br: Radius { rx: 4.0, ry: 12.0 },
            bl: Radius { rx: 2.0, ry: 16.0 },
        }
    );
    assert_eq!(stroke.align, StrokeAlign::Outside);
    assert_eq!(
        stroke.width,
        StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 2.0,
            stroke_right_width: 8.0,
            stroke_bottom_width: 12.0,
            stroke_left_width: 4.0,
        })
    );
}

#[test]
fn inside_widths_cover_each_side_independently() {
    let source = r##"<grida version="0">
  <container width="80" height="80" fill="#FFFFFF">
    <rect x="20" y="20" width="40" height="40" fill="#22C55E">
      <stroke width="4 8 12 16"><solid color="#EF4444"/></stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 80, 80, &PaintCtx::new(None));

    assert_eq!(image.at(40, 22), [239, 68, 68, 255], "top");
    assert_eq!(image.at(56, 40), [239, 68, 68, 255], "right");
    assert_eq!(image.at(40, 54), [239, 68, 68, 255], "bottom");
    assert_eq!(image.at(24, 40), [239, 68, 68, 255], "left");
    assert_eq!(image.at(40, 40), [34, 197, 94, 255], "interior");
    assert_eq!(image.at(18, 40), [255, 255, 255, 255], "outside");
}

#[test]
fn outside_widths_expand_each_side_without_changing_the_fill_box() {
    let source = r##"<grida version="0">
  <container width="90" height="90" fill="#FFFFFF">
    <rect x="25" y="25" width="40" height="40" fill="#22C55E">
      <stroke width="4 8 12 16" align="outside"><solid color="#2563EB"/></stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 90, 90, &PaintCtx::new(None));

    assert_eq!(image.at(45, 22), [37, 99, 235, 255], "top");
    assert_eq!(image.at(70, 45), [37, 99, 235, 255], "right");
    assert_eq!(image.at(45, 72), [37, 99, 235, 255], "bottom");
    assert_eq!(image.at(12, 45), [37, 99, 235, 255], "left");
    assert_eq!(image.at(45, 45), [34, 197, 94, 255], "fill box");
}

#[test]
fn zero_width_sides_suppress_coverage_without_inventing_segments() {
    let source = r##"<grida version="0">
  <container width="80" height="80" fill="#FFFFFF">
    <rect x="20" y="20" width="40" height="40" fill="#111827">
      <stroke width="0 10 0 0"><solid color="#F59E0B"/></stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 80, 80, &PaintCtx::new(None));

    assert_eq!(image.at(56, 40), [245, 158, 11, 255], "right side");
    assert_eq!(image.at(40, 21), [17, 24, 39, 255], "zero top");
    assert_eq!(image.at(40, 58), [17, 24, 39, 255], "zero bottom");
    assert_eq!(image.at(21, 40), [17, 24, 39, 255], "zero left");
}

#[test]
fn overconsumed_inner_extent_saturates_instead_of_inverting() {
    let source = r##"<grida version="0">
  <container width="60" height="60" fill="#FFFFFF">
    <rect x="20" y="20" width="20" height="20">
      <fill/>
      <stroke width="14 0 14 0"><solid color="#DC2626"/></stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 60, 60, &PaintCtx::new(None));

    assert_eq!(image.at(30, 30), [220, 38, 38, 255]);
    assert_eq!(image.at(19, 30), [255, 255, 255, 255]);
}

#[test]
fn dashed_per_side_stroke_keeps_one_contour_phase() {
    let source = r##"<grida version="0">
  <container width="100" height="80" fill="#FFFFFF">
    <rect x="20" y="20" width="60" height="40" corner-radius="10">
      <fill/>
      <stroke width="4 12 8 6" align="center" dash-array="14 1000">
        <solid color="#7C3AED"/>
      </stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 100, 80, &PaintCtx::new(None));

    // Dash origin is the top-left curve join at local x=10 and advances
    // clockwise along the top edge. The huge gap suppresses later sides.
    assert_eq!(image.at(34, 20), [124, 58, 237, 255]);
    assert_eq!(image.at(58, 20), [255, 255, 255, 255]);
    assert_eq!(image.at(80, 40), [255, 255, 255, 255]);
}

#[test]
fn image_paint_uses_the_same_per_side_ring_and_node_paint_box() {
    const RID: &str = "fixture://rectangular-stroke-image";
    const IMAGE: &[u8] = include_bytes!("../../../fixtures/images/border-diamonds.png");
    let source = format!(
        r##"<grida version="0">
  <container width="100" height="100" fill="#FFFFFF">
    <rect x="5" y="5" width="90" height="90" fill="#FFFFFF">
      <stroke width="12 0 0 0"><image src="{RID}" fit="fill"/></stroke>
    </rect>
  </container>
</grida>
"##
    );
    let mut ctx = PaintCtx::new(None);
    ctx.insert_encoded(RID, IMAGE).unwrap();
    let (image, _) = render_xml(&source, 100, 100, &ctx);

    assert_ne!(image.at(50, 8), [255, 255, 255, 255]);
    assert_eq!(image.at(50, 50), [255, 255, 255, 255]);
}
