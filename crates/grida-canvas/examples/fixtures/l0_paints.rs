use super::*;

pub fn build() -> Scene {
    let s = 150.0;
    let gap = 170.0;

    let solid_rect = rect(0.0, 0.0, s, s, solid(220, 59, 59, 255));
    let linear_rect = rect(gap, 0.0, s, s, linear_gradient());
    let radial_rect = rect(gap * 2.0, 0.0, s, s, radial_gradient());
    let sweep_rect = rect(gap * 3.0, 0.0, s, s, sweep_gradient());
    let image_rect = rect(gap * 4.0, 0.0, s, s, image_paint());

    flat_scene(
        "L0 Paints",
        vec![solid_rect, linear_rect, radial_rect, sweep_rect, image_rect],
    )
}
