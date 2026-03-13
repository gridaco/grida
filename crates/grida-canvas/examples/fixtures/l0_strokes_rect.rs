use super::*;
use cg::cg::stroke_width::RectangularStrokeWidth;

pub fn build() -> Scene {
    // Container with per-side stroke widths
    let c1 = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0, right: 0.0, bottom: 0.0, left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(300.0),
            layout_target_height: Some(200.0),
            layout_min_width: None, layout_max_width: None,
            layout_min_height: None, layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(250, 250, 250, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 1.0, stroke_right_width: 2.0, stroke_bottom_width: 3.0, stroke_left_width: 4.0,
        }),
        effects: LayerEffects::default(),
        clip: false,
    });

    // Container with uniform stroke + per-side corner radii
    let c2 = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0, right: 0.0, bottom: 0.0, left: 320.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(300.0),
            layout_target_height: Some(200.0),
            layout_min_width: None, layout_max_width: None,
            layout_min_height: None, layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: {
            use cg::cg::types::Radius;
            RectangularCornerRadius {
                tl: Radius::circular(0.0),
                tr: Radius::circular(8.0),
                bl: Radius::circular(16.0),
                br: Radius::circular(24.0),
            }
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(250, 250, 250, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(2.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    // Container with varying per-side stroke widths + dashed pattern
    let c3 = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 220.0, right: 0.0, bottom: 0.0, left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(300.0),
            layout_target_height: Some(200.0),
            layout_min_width: None, layout_max_width: None,
            layout_min_height: None, layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(250, 250, 250, 255)]),
        strokes: Paints::new(vec![solid(220, 59, 59, 255)]),
        stroke_style: StrokeStyle {
            stroke_align: StrokeAlign::Inside,
            stroke_cap: StrokeCap::Round,
            stroke_join: StrokeJoin::Round,
            stroke_miter_limit: StrokeMiterLimit(4.0),
            stroke_dash_array: Some(cg::cg::stroke_dasharray::StrokeDashArray(vec![12.0, 6.0, 4.0, 6.0])),
        },
        stroke_width: StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 2.0, stroke_right_width: 4.0, stroke_bottom_width: 6.0, stroke_left_width: 8.0,
        }),
        effects: LayerEffects::default(),
        clip: false,
    });

    // Container with per-side corners + per-side stroke widths + dashed pattern
    let c4 = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 220.0, right: 0.0, bottom: 0.0, left: 320.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(300.0),
            layout_target_height: Some(200.0),
            layout_min_width: None, layout_max_width: None,
            layout_min_height: None, layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: {
            use cg::cg::types::Radius;
            RectangularCornerRadius {
                tl: Radius::circular(12.0),
                tr: Radius::circular(0.0),
                bl: Radius::circular(0.0),
                br: Radius::circular(12.0),
            }
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(250, 250, 250, 255)]),
        strokes: Paints::new(vec![solid(59, 100, 220, 255)]),
        stroke_style: StrokeStyle {
            stroke_align: StrokeAlign::Center,
            stroke_cap: StrokeCap::Butt,
            stroke_join: StrokeJoin::Miter,
            stroke_miter_limit: StrokeMiterLimit(4.0),
            stroke_dash_array: Some(cg::cg::stroke_dasharray::StrokeDashArray(vec![8.0, 4.0])),
        },
        stroke_width: StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 1.0, stroke_right_width: 3.0, stroke_bottom_width: 5.0, stroke_left_width: 3.0,
        }),
        effects: LayerEffects::default(),
        clip: false,
    });

    let pairs = vec![(1u64, c1), (2u64, c2), (3u64, c3), (4u64, c4)];
    build_scene("L0 Strokes Rect", None, pairs, HashMap::new(), vec![1, 2, 3, 4])
}
