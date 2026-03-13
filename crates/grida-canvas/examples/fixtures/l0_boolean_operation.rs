use super::*;
use cg::cg::stroke_width::SingularStrokeWidth;
use math2::transform::AffineTransform;
use std::collections::HashMap;

/// All four boolean operations, each with two overlapping child rectangles.
pub fn build() -> Scene {
    let ops = [
        (BooleanPathOperation::Union, solid(220, 59, 59, 255)),
        (BooleanPathOperation::Intersection, solid(59, 100, 220, 255)),
        (BooleanPathOperation::Difference, solid(59, 180, 75, 255)),
        (BooleanPathOperation::Xor, solid(255, 200, 40, 255)),
    ];

    let gap = 160.0;
    let mut nodes: Vec<(u64, Node)> = Vec::new();
    let mut links: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut roots: Vec<u64> = Vec::new();
    let mut next_id = 1u64;

    for (i, (op, fill)) in ops.iter().enumerate() {
        let x = (i as f32) * gap;
        let bool_id = next_id;
        next_id += 1;

        let bool_node = Node::BooleanOperation(BooleanPathOperationNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            effects: LayerEffects::default(),
            transform: Some(AffineTransform::from_box_center(x, 0.0, 0.0, 0.0, 0.0)),
            op: *op,
            corner_radius: None,
            fills: Paints::new(vec![fill.clone()]),
            strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
            stroke_style: StrokeStyle::default(),
            stroke_width: SingularStrokeWidth(Some(1.0)),
        });

        // Two overlapping rectangles as children
        let child_a_id = next_id;
        next_id += 1;
        let child_a = Node::Rectangle(RectangleNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            transform: AffineTransform::from_box_center(0.0, 0.0, 80.0, 80.0, 0.0),
            size: Size { width: 80.0, height: 80.0 },
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing(0.0),
            fills: Paints::new(vec![]),
            strokes: Paints::new(vec![]),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::None,
            effects: LayerEffects::default(),
            layout_child: None,
        });

        let child_b_id = next_id;
        next_id += 1;
        let child_b = Node::Rectangle(RectangleNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            transform: AffineTransform::from_box_center(40.0, 40.0, 80.0, 80.0, 0.0),
            size: Size { width: 80.0, height: 80.0 },
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing(0.0),
            fills: Paints::new(vec![]),
            strokes: Paints::new(vec![]),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::None,
            effects: LayerEffects::default(),
            layout_child: None,
        });

        nodes.push((bool_id, bool_node));
        nodes.push((child_a_id, child_a));
        nodes.push((child_b_id, child_b));
        links.insert(bool_id, vec![child_a_id, child_b_id]);
        roots.push(bool_id);
    }

    build_scene("L0 Boolean Operation", None, nodes, links, roots)
}
