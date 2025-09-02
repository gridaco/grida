use cg::cg::types::*;
use cg::shape::*;
use skia_safe::surfaces;

// **Light**
// Adjust the angle and intensity of the light illuminating your glass frames to change where the highlight appears on the frame’s edge.
// **Refraction**
// Control the way light bends along the edge of your glass frame. The higher the refraction value, the more your glass frames will distort the elements around them.
// **Depth**
// Change how thick your glass material appears to provide a more pronounced 3D feel to the edge of the frame.
// **Dispersion**
// Increase dispersion to add a hint of chromatic aberration at the edge of your glass frames. This works best in combination with refraction.
// **Frost**
// Adjust the amount of background blur present on your glass frames to help glass elements stand out on busy backgrounds to provide better contrast.
#[allow(dead_code)]
struct LiquidGlassEffect {
    /// The intensity of specular highlights. Must be between 0 and 1. Higher values create brighter highlights.
    light_intensity: f32,
    /// The angle of the specular light in degrees. Controls the direction of highlights on the glass surface.
    light_angle: f32,
    /// The intensity of the refraction distortion. Must be between 0 and 1. Higher values create more distortion.
    refraction: f32,
    /// The depth of the refraction effect. Must be >= 1. Higher values create deeper glass appearance.
    depth: f32,
    /// The amount of chromatic aberration (color separation). Must be between 0 and 1. Higher values create more rainbow-like distortion at edges.
    dispersion: f32,
    /// The radius of frost on the glass effect.
    radius: f32,
}

static _BACKGROUND: &[u8] = include_bytes!("../../../fixtures/images/stripes.png");

// 1. background image
// 2. forground glass shape 300x100 rounded rect
// 3. glass effect on glass shape
fn main() {
    let _effect = LiquidGlassEffect {
        light_intensity: 0.5,
        light_angle: 45.0,
        refraction: 0.5,
        depth: 1.0,
        dispersion: 0.5,
        radius: 10.0,
    };

    let _shape: RRectShape = RRectShape {
        width: 300.0,
        height: 100.0,
        corner_radius: RectangularCornerRadius::circular(10.0),
    };

    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let _canvas = surface.canvas();
}
