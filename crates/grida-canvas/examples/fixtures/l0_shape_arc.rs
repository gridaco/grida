use super::*;
use cg::cg::stroke_width::SingularStrokeWidth;
use math2::transform::AffineTransform;

/// Ellipse arc variants: full, semicircle, donut, pie wedge, rounded arc.
pub fn build() -> Scene {
    let s = 120.0;
    let gap = 140.0;

    // Full ellipse (defaults — no arc)
    let full = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(0.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        fills: Paints::new(vec![solid(59, 100, 220, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // Semicircle (180° sweep)
    let semi = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(gap, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        fills: Paints::new(vec![solid(220, 59, 59, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: Some(180.0),
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // Donut (inner_radius = 0.5)
    let donut = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(gap * 2.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        fills: Paints::new(vec![solid(59, 180, 75, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: Some(0.5),
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // Pie wedge (90° sweep, start at 45°)
    let pie = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(gap * 3.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        fills: Paints::new(vec![solid(255, 200, 40, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 45.0,
        angle: Some(90.0),
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // Rounded arc (270° sweep, inner_radius 0.6, corner_radius 8)
    let rounded_arc = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(gap * 4.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        fills: Paints::new(vec![solid(128, 60, 200, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(Some(2.0)),
        inner_radius: Some(0.6),
        start_angle: 0.0,
        angle: Some(270.0),
        corner_radius: Some(8.0),
        effects: LayerEffects::default(),
        layout_child: None,
    });

    flat_scene("L0 Shape Arc", vec![full, semi, donut, pie, rounded_arc])
}
