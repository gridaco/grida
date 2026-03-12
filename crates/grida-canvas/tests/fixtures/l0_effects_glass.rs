use super::*;
use cg::cg::fe::*;

pub fn build() -> Scene {
    // Note: rect(x, y, w, h, ..) uses from_box_center which, at 0° rotation,
    // places the rect's top-left at (x, y).

    let glass_size = 300.0;
    let padding = 40.0;
    let total = glass_size + padding * 2.0; // 380

    // ── Background ─────────────────────────────────────────────────────
    // White base + black stripes → alternating black/white pattern.
    // Top-left at (0, 0), spans [0 .. total] in both axes.
    let bg = rect(0.0, 0.0, total, total, solid(255, 255, 255, 255));

    let stripe_w = 10.0;
    let n_stripes = (total / stripe_w).ceil() as i32;
    let mut nodes: Vec<Node> = vec![bg];
    for i in 0..n_stripes {
        if i % 2 != 0 {
            continue; // white gap covered by bg
        }
        let x = i as f32 * stripe_w; // top-left x within [0 .. total]
        nodes.push(rect(x, 0.0, stripe_w, total, solid(0, 0, 0, 255)));
    }

    // ── Glass panel ────────────────────────────────────────────────────
    // Inset by `padding` on every side → top-left at (padding, padding),
    // centered within the stripe background.
    // Parameters match the golden reference (golden_liquid_glass.rs).
    let glass_rect = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(
            padding, padding, glass_size, glass_size, 0.0,
        ),
        size: Size { width: glass_size, height: glass_size },
        corner_radius: RectangularCornerRadius::circular(60.0),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects {
            glass: Some(FeLiquidGlass {
                active: true,
                light_intensity: 0.7,
                light_angle: 45.0,
                refraction: 1.0,
                depth: 100.0,
                blur_radius: 0.0,
                dispersion: 1.0,
            }),
            ..LayerEffects::default()
        },
        layout_child: None,
    });

    nodes.push(glass_rect);

    flat_scene("L0 Effects Glass", nodes)
}
