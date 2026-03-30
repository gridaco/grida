use super::*;
use cg::cg::stroke_dasharray::StrokeDashArray;
use math2::transform::AffineTransform;

fn stroked_rect(
    x: f32,
    y: f32,
    align: StrokeAlign,
    cap: StrokeCap,
    join: StrokeJoin,
    width: f32,
    color: Paint,
    dash: Option<StrokeDashArray>,
) -> Node {
    Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, y, 120.0, 80.0, 0.0),
        size: Size {
            width: 120.0,
            height: 80.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(240, 240, 240, 255)]),
        strokes: Paints::new(vec![color]),
        stroke_style: StrokeStyle {
            stroke_align: align,
            stroke_cap: cap,
            stroke_join: join,
            stroke_miter_limit: StrokeMiterLimit(4.0),
            stroke_dash_array: dash,
        },
        stroke_width: StrokeWidth::Uniform(width),
        effects: LayerEffects::default(),
        layout_child: None,
    })
}

fn marker_line(x: f32, y: f32, start: StrokeMarkerPreset, end: StrokeMarkerPreset) -> Node {
    Node::Line(LineNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::new(x, y, 0.0),
        size: Size {
            width: 150.0,
            height: 0.0,
        },
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_width: 2.0,
        stroke_cap: StrokeCap::Round,
        stroke_miter_limit: StrokeMiterLimit(4.0),
        stroke_dash_array: None,
        _data_stroke_align: StrokeAlign::Center,
        marker_start_shape: start,
        marker_end_shape: end,
        layout_child: None,
    })
}

pub fn build() -> Scene {
    let gap = 140.0;

    let r1 = stroked_rect(
        0.0,
        0.0,
        StrokeAlign::Center,
        StrokeCap::Butt,
        StrokeJoin::Miter,
        2.0,
        solid(0, 0, 0, 255),
        None,
    );
    let r2 = stroked_rect(
        gap,
        0.0,
        StrokeAlign::Inside,
        StrokeCap::Round,
        StrokeJoin::Round,
        3.0,
        solid(59, 100, 220, 255),
        None,
    );
    let r3 = stroked_rect(
        gap * 2.0,
        0.0,
        StrokeAlign::Outside,
        StrokeCap::Square,
        StrokeJoin::Bevel,
        4.0,
        solid(59, 180, 75, 255),
        None,
    );
    let r4 = stroked_rect(
        gap * 3.0,
        0.0,
        StrokeAlign::Center,
        StrokeCap::Round,
        StrokeJoin::Miter,
        2.0,
        solid(0, 0, 0, 255),
        Some(StrokeDashArray(vec![10.0, 5.0])),
    );

    let l1 = marker_line(
        0.0,
        120.0,
        StrokeMarkerPreset::Circle,
        StrokeMarkerPreset::EquilateralTriangle,
    );
    let l2 = marker_line(
        200.0,
        120.0,
        StrokeMarkerPreset::Diamond,
        StrokeMarkerPreset::VerticalBar,
    );

    flat_scene("L0 Strokes", vec![r1, r2, r3, r4, l1, l2])
}
