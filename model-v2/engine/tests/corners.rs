//! Focused rounded-box materialization and raster probes.
//!
//! Native `.grida.xml` has no independent browser oracle for continuous
//! corners, so these tests assert stable model-to-drawlist projection and
//! high-contrast pixels away from antialiased boundaries.

mod support;

use anchor_engine::drawlist::ItemKind;
use anchor_engine::paint::PaintCtx;
use anchor_lab::model::{CornerSmoothing, Radius, RectangularCornerRadius};
use support::render_xml;

fn expected_asymmetric_radius() -> RectangularCornerRadius {
    RectangularCornerRadius {
        tl: Radius { rx: 24.0, ry: 18.0 },
        tr: Radius { rx: 12.0, ry: 10.0 },
        br: Radius { rx: 8.0, ry: 6.0 },
        bl: Radius { rx: 4.0, ry: 2.0 },
    }
}

#[test]
fn fill_clip_and_repeated_strokes_share_the_authored_outline() {
    let source = r##"<grida version="0">
  <container width="100" height="80" clips="true" corner-radius="24 12 8 4 / 18 10 6 2" fill="#101828">
    <stroke width="8" align="outside">
      <solid color="#EF4444"/>
    </stroke>
    <stroke width="3" align="inside">
      <solid color="#60A5FA"/>
    </stroke>
    <rect width="100" height="80" fill="#22C55E"/>
  </container>
</grida>
"##;
    let (_, list) = render_xml(source, 100, 80, &PaintCtx::new(None));
    let parent = list.items[0].node;
    let expected_radius = expected_asymmetric_radius();
    let expected_smoothing = CornerSmoothing::default();
    let mut projected = 0;

    for item in list.items.iter().filter(|item| item.node == parent) {
        let geometry = match &item.kind {
            ItemKind::RectFill {
                corner_radius,
                corner_smoothing,
                ..
            }
            | ItemKind::BeginClipRect {
                corner_radius,
                corner_smoothing,
                ..
            }
            | ItemKind::RectStroke {
                corner_radius,
                corner_smoothing,
                ..
            } => Some((*corner_radius, *corner_smoothing)),
            _ => None,
        };
        if let Some((radius, smoothing)) = geometry {
            assert_eq!(radius, expected_radius);
            assert_eq!(smoothing, expected_smoothing);
            projected += 1;
        }
    }

    assert_eq!(projected, 4, "fill + clip + two strokes use one outline");
}

#[test]
fn elliptical_axes_remain_independent() {
    let source = r##"<grida version="0">
  <container width="220" height="100" fill="#FFFFFF">
    <rect x="10" y="10" width="80" height="80" corner-radius="36 / 10" fill="#EF4444"/>
    <rect x="120" y="10" width="80" height="80" corner-radius="10 / 36" fill="#EF4444"/>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 220, 100, &PaintCtx::new(None));

    assert_eq!(image.at(12, 19), [239, 68, 68, 255]);
    assert_eq!(image.at(122, 19), [255, 255, 255, 255]);
    assert_eq!(image.at(50, 35), [239, 68, 68, 255]);
    assert_eq!(image.at(160, 35), [239, 68, 68, 255]);
}

#[test]
fn smoothing_changes_only_corner_coverage() {
    let source = r##"<grida version="0">
  <container width="200" height="100" fill="#FFFFFF">
    <rect x="10" y="10" width="80" height="80" corner-radius="24" fill="#7C3AED"/>
    <rect x="110" y="10" width="80" height="80" corner-radius="24" corner-smoothing="0.8" fill="#7C3AED"/>
  </container>
</grida>
"##;
    let (image, list) = render_xml(source, 200, 100, &PaintCtx::new(None));

    let mut different_pixels = 0;
    for y in 0..80 {
        for x in 0..80 {
            different_pixels += usize::from(image.at(10 + x, 10 + y) != image.at(110 + x, 10 + y));
        }
    }
    assert!(
        different_pixels > 40,
        "continuous smoothing must materially change corner coverage; diff={different_pixels}"
    );
    assert_eq!(image.at(50, 50), [124, 58, 237, 255]);
    assert_eq!(image.at(150, 50), [124, 58, 237, 255]);
    assert!(list.items.iter().any(|item| matches!(
        item.kind,
        ItemKind::RectFill {
            corner_smoothing: CornerSmoothing(value),
            ..
        } if value == 0.8
    )));
}

#[test]
fn rounded_container_clip_contains_descendants_but_not_its_stroke() {
    let source = r##"<grida version="0">
  <container width="100" height="100" fill="#FFFFFF">
    <container x="10" y="10" width="80" height="80" clips="true" corner-radius="30" fill="#111827">
      <stroke width="8" align="outside">
        <solid color="#EF4444"/>
      </stroke>
      <rect width="80" height="80" fill="#22C55E"/>
    </container>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 100, 100, &PaintCtx::new(None));

    assert_eq!(image.at(12, 12), [255, 255, 255, 255]);
    assert_eq!(image.at(50, 12), [34, 197, 94, 255]);
    assert_eq!(image.at(50, 7), [239, 68, 68, 255]);
    assert_eq!(image.at(50, 50), [34, 197, 94, 255]);
}

#[test]
fn rounded_clip_antialiases_like_the_same_filled_outline() {
    let source = r##"<grida version="0">
  <container width="220" height="100" fill="#FFFFFF">
    <rect x="10" y="10" width="80" height="80" corner-radius="24" corner-smoothing="0.8" fill="#22C55E"/>
    <container x="120" y="10" width="80" height="80" corner-radius="24" corner-smoothing="0.8" clips="true">
      <rect width="80" height="80" fill="#22C55E"/>
    </container>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 220, 100, &PaintCtx::new(None));

    let mut max_delta = 0;
    let mut partially_covered = 0;
    for y in 0..80 {
        for x in 0..80 {
            let fill = image.at(10 + x, 10 + y);
            let clip = image.at(120 + x, 10 + y);
            partially_covered +=
                usize::from(clip != [34, 197, 94, 255] && clip != [255, 255, 255, 255]);
            for channel in 0..4 {
                max_delta = max_delta.max(fill[channel].abs_diff(clip[channel]));
            }
        }
    }
    assert!(
        partially_covered > 0,
        "rounded descendant clip must retain fractional edge coverage"
    );
    assert!(
        max_delta <= 8,
        "rounded descendant clip must share the fill's antialiased edge; max delta={max_delta}"
    );
}

#[test]
fn oversized_radii_follow_ordinary_and_smoothed_resolution_profiles() {
    let source = r##"<grida version="0">
  <container width="600" height="120" fill="#FFFFFF">
    <rect x="10" y="30" width="100" height="60" corner-radius="80" fill="#7C3AED"/>
    <rect x="130" y="30" width="100" height="60" corner-radius="30" fill="#7C3AED"/>
    <rect x="250" y="10" width="160" height="100" corner-radius="80 0 0 0" corner-smoothing="0.6" fill="#22C55E"/>
    <rect x="430" y="10" width="160" height="100" corner-radius="50 0 0 0" corner-smoothing="0.6" fill="#22C55E"/>
  </container>
</grida>
"##;
    let (image, list) = render_xml(source, 600, 120, &PaintCtx::new(None));

    let mut ordinary_max_delta = 0;
    for y in 0..60 {
        for x in 0..100 {
            let oversized = image.at(10 + x, 30 + y);
            let resolved = image.at(130 + x, 30 + y);
            for channel in 0..4 {
                ordinary_max_delta =
                    ordinary_max_delta.max(oversized[channel].abs_diff(resolved[channel]));
            }
        }
    }
    assert!(
        ordinary_max_delta <= 8,
        "ordinary oversized radii must match their proportional result; max delta={ordinary_max_delta}"
    );

    let mut smoothed_max_delta = 0;
    for y in 0..100 {
        for x in 0..160 {
            let oversized = image.at(250 + x, 10 + y);
            let resolved = image.at(430 + x, 10 + y);
            for channel in 0..4 {
                smoothed_max_delta =
                    smoothed_max_delta.max(oversized[channel].abs_diff(resolved[channel]));
            }
        }
    }
    assert!(
        smoothed_max_delta <= 1,
        "smoothed oversized radii must match the production cap; max delta={smoothed_max_delta}"
    );

    let authored: Vec<f32> = list
        .items
        .iter()
        .filter_map(|item| match item.kind {
            ItemKind::RectFill { corner_radius, .. } if !corner_radius.is_zero() => {
                Some(corner_radius.tl.rx)
            }
            _ => None,
        })
        .collect();
    assert_eq!(authored, [80.0, 30.0, 80.0, 50.0]);
}

#[test]
fn rounded_dash_origin_is_the_top_left_curve_join() {
    let source = r##"<grida version="0">
  <container width="160" height="100" fill="#FFFFFF">
    <rect x="20" y="20" width="120" height="60" corner-radius="20" corner-smoothing="0.5">
      <fill/>
      <stroke width="4" align="center" dash-array="10 1000">
        <solid color="#EF4444"/>
      </stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 160, 100, &PaintCtx::new(None));

    // extent = (1 + 0.5) * 20 = 30, so the first dash starts at x=50 and
    // advances toward the top-right.
    assert_eq!(image.at(54, 20), [239, 68, 68, 255]);
    assert_eq!(image.at(68, 20), [255, 255, 255, 255]);
}

#[test]
fn repeated_strokes_follow_the_rounded_source_instead_of_a_square_box() {
    let source = r##"<grida version="0">
  <container width="120" height="100" fill="#FFFFFF">
    <rect x="20" y="20" width="80" height="60" corner-radius="20" fill="#111827">
      <stroke width="10" align="outside">
        <solid color="#EF4444"/>
      </stroke>
      <stroke width="6" align="inside">
        <solid color="#3B82F6"/>
      </stroke>
    </rect>
  </container>
</grida>
"##;
    let (image, _) = render_xml(source, 120, 100, &PaintCtx::new(None));

    assert_eq!(image.at(16, 16), [255, 255, 255, 255]);
    assert_eq!(image.at(60, 16), [239, 68, 68, 255]);
    assert_eq!(image.at(60, 23), [59, 130, 246, 255]);
    assert_eq!(image.at(60, 32), [17, 24, 39, 255]);
}
