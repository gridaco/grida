use super::*;
use cg::cg::stroke_width::SingularStrokeWidth;
use math2::transform::AffineTransform;

/// Regular polygons and star polygons with varying point counts and parameters.
pub fn build() -> Scene {
    let s = 120.0;
    let gap = 140.0;

    // Triangle (3 sides)
    let tri = Node::RegularPolygon(RegularPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(0.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 3,
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(220, 59, 59, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    // Pentagon (5 sides, rounded corners)
    let pent = Node::RegularPolygon(RegularPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(gap, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 5,
        corner_radius: 10.0,
        fills: Paints::new(vec![solid(59, 100, 220, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(Some(1.5)),
        layout_child: None,
    });

    // Hexagon (6 sides)
    let hex = Node::RegularPolygon(RegularPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(gap * 2.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 6,
        corner_radius: 5.0,
        fills: Paints::new(vec![solid(59, 180, 75, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    // Octagon (8 sides)
    let oct = Node::RegularPolygon(RegularPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(gap * 3.0, 0.0, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 8,
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(255, 200, 40, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    // 4-point star (sharp)
    let star4 = Node::RegularStarPolygon(RegularStarPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(0.0, gap, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 4,
        inner_radius: 0.3,
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(128, 60, 200, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    // 5-point star (classic)
    let star5 = Node::RegularStarPolygon(RegularStarPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(gap, gap, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 5,
        inner_radius: 0.4,
        corner_radius: 3.0,
        fills: Paints::new(vec![solid(255, 215, 0, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(Some(1.0)),
        layout_child: None,
    });

    // 6-point star (Star of David shape)
    let star6 = Node::RegularStarPolygon(RegularStarPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(gap * 2.0, gap, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 6,
        inner_radius: 0.5,
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(59, 180, 180, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    // 8-point star (rounded)
    let star8 = Node::RegularStarPolygon(RegularStarPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(gap * 3.0, gap, s, s, 0.0),
        size: Size {
            width: s,
            height: s,
        },
        point_count: 8,
        inner_radius: 0.7,
        corner_radius: 6.0,
        fills: Paints::new(vec![solid(220, 120, 60, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    flat_scene(
        "L0 Shape Polygon",
        vec![tri, pent, hex, oct, star4, star5, star6, star8],
    )
}
