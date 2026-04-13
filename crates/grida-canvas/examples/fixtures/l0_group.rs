use super::*;
use math2::transform::AffineTransform;
use std::collections::HashMap;

/// Group node features: grouping children, opacity inheritance, blend modes, nesting.
pub fn build() -> Scene {
    // ── [1] Simple group with two children ──────────────────────────────
    let g1 = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(0.0, 0.0, 0.0, 0.0, 0.0)),
    });
    let g1_a = rect(0.0, 0.0, 80.0, 80.0, solid(220, 59, 59, 255));
    let g1_b = rect(40.0, 40.0, 80.0, 80.0, solid(59, 100, 220, 200));

    // ── [4] Group with reduced opacity (children inherit) ───────────────
    let g2 = Node::Group(GroupNodeRec {
        active: true,
        opacity: 0.4,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(200.0, 0.0, 0.0, 0.0, 0.0)),
    });
    let g2_a = rect(0.0, 0.0, 80.0, 80.0, solid(220, 59, 59, 255));
    let g2_b = rect(40.0, 40.0, 80.0, 80.0, solid(59, 100, 220, 255));

    // ── [7] Group with blend mode ───────────────────────────────────────
    let g3 = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::Blend(BlendMode::Multiply),
        mask: None,
        transform: Some(AffineTransform::from_box_center(400.0, 0.0, 0.0, 0.0, 0.0)),
    });
    let g3_a = rect(0.0, 0.0, 100.0, 100.0, solid(255, 200, 40, 255));
    let g3_b = rect(30.0, 30.0, 100.0, 100.0, solid(59, 100, 220, 255));

    // ── [10] Nested groups ──────────────────────────────────────────────
    let g_outer = Node::Group(GroupNodeRec {
        active: true,
        opacity: 0.8,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(0.0, 160.0, 0.0, 0.0, 0.0)),
    });

    let g_inner = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
        mask: None,
        transform: Some(AffineTransform::from_box_center(20.0, 20.0, 0.0, 0.0, 0.0)),
    });

    let leaf1 = rect(0.0, 0.0, 60.0, 60.0, solid(59, 180, 75, 255));
    let leaf2 = rect(30.0, 30.0, 60.0, 60.0, solid(128, 60, 200, 255));

    // Sibling of g_inner inside g_outer
    let sibling = ellipse(150.0, 20.0, 80.0, 80.0, solid(220, 120, 60, 255));

    // ── [15] Rotated group (30°) with two children ─────────────────────
    let g_rot30 = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(
            300.0, 160.0, 0.0, 0.0, 30.0,
        )),
    });
    let g_rot30_a = rect(0.0, 0.0, 80.0, 50.0, solid(220, 59, 59, 255));
    let g_rot30_b = rect(30.0, 30.0, 60.0, 60.0, solid(59, 100, 220, 200));

    // ── [18] Rotated group (90°) with children ─────────────────────────
    let g_rot90 = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(
            500.0, 160.0, 0.0, 0.0, 90.0,
        )),
    });
    let g_rot90_a = rect(0.0, 0.0, 100.0, 40.0, solid(59, 180, 75, 255));
    let g_rot90_b = rect(20.0, 20.0, 60.0, 60.0, solid(255, 200, 40, 200));

    // ── [21] Skewed group (non-orthogonal transform) ───────────────────
    // Skew matrix: slight shear on the x-axis
    let g_skew = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_acebdf(
            1.0, 0.3, 0.0, // a=1, c=0.3 (x-shear), tx=0
            0.0, 1.0, 320.0, // b=0, d=1, ty=320
        )),
    });
    let g_skew_a = rect(0.0, 0.0, 80.0, 60.0, solid(128, 60, 200, 255));
    let g_skew_b = rect(40.0, 20.0, 60.0, 40.0, solid(220, 120, 60, 200));

    // ── [24] Nested rotated groups (outer 20° + inner 45°) ─────────────
    let g_nested_rot_outer = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(
            250.0, 320.0, 0.0, 0.0, 20.0,
        )),
    });
    let g_nested_rot_inner = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(10.0, 10.0, 0.0, 0.0, 45.0)),
    });
    let g_nested_leaf1 = rect(0.0, 0.0, 50.0, 50.0, solid(59, 180, 75, 255));
    let g_nested_leaf2 = rect(25.0, 25.0, 50.0, 50.0, solid(220, 59, 59, 200));
    // Sibling child of the outer group (not rotated by inner)
    let g_nested_sibling = rect(100.0, 0.0, 60.0, 40.0, solid(59, 100, 220, 255));

    // ── Tree ────────────────────────────────────────────────────────────
    let mut links = HashMap::new();
    links.insert(1u64, vec![2, 3]); // g1 → children
    links.insert(4u64, vec![5, 6]); // g2 → children
    links.insert(7u64, vec![8, 9]); // g3 → children
    links.insert(10u64, vec![11, 14]); // g_outer → g_inner + sibling
    links.insert(11u64, vec![12, 13]); // g_inner → leaves
    links.insert(15u64, vec![16, 17]); // g_rot30 → children
    links.insert(18u64, vec![19, 20]); // g_rot90 → children
    links.insert(21u64, vec![22, 23]); // g_skew → children
    links.insert(24u64, vec![25, 28]); // g_nested_rot_outer → inner + sibling
    links.insert(25u64, vec![26, 27]); // g_nested_rot_inner → leaves

    build_scene(
        "L0 Group",
        None,
        vec![
            (1, g1),
            (2, g1_a),
            (3, g1_b),
            (4, g2),
            (5, g2_a),
            (6, g2_b),
            (7, g3),
            (8, g3_a),
            (9, g3_b),
            (10, g_outer),
            (11, g_inner),
            (12, leaf1),
            (13, leaf2),
            (14, sibling),
            (15, g_rot30),
            (16, g_rot30_a),
            (17, g_rot30_b),
            (18, g_rot90),
            (19, g_rot90_a),
            (20, g_rot90_b),
            (21, g_skew),
            (22, g_skew_a),
            (23, g_skew_b),
            (24, g_nested_rot_outer),
            (25, g_nested_rot_inner),
            (26, g_nested_leaf1),
            (27, g_nested_leaf2),
            (28, g_nested_sibling),
        ],
        links,
        vec![1, 4, 7, 10, 15, 18, 21, 24],
    )
}
