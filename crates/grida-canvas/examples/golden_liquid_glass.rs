/*! Liquid Glass Effect Example
 *
 * Demonstrates the liquid glass effect with refraction, chromatic aberration,
 * and Fresnel reflections using the SaveLayer backdrop approach.
 *
 * This example uses the modern backdrop-based implementation that works
 * seamlessly with both GPU and CPU backends without manual snapshots.
 */

use cg::cg::types::FeLiquidGlass;
use cg::painter::effects;
use skia_safe::{canvas::SaveLayerRec, surfaces, Data, EncodedImageFormat, Image, Paint, Rect};

const BACKGROUND_IMAGE: &[u8] = include_bytes!("../../../fixtures/images/stripes.png");

fn main() {
    let canvas_size = (800, 800);
    let corner_radius = 70.0;

    // Use default effect parameters
    // Note: depth is now normalized 0-1, where 1.0 = min(width, height)
    let effect = FeLiquidGlass {
        light_intensity: 0.9,
        light_angle: 45.0,
        refraction: 1.5,
        depth: 0.14, // 0.14 * 140 (min dimension) ≈ 20px
        dispersion: 0.02,
        blur_radius: 2.0,
    };

    // Create surface for final composition
    let mut surface = surfaces::raster_n32_premul(canvas_size).expect("surface");
    let canvas = surface.canvas();

    // Load and draw background image
    let background_image =
        Image::from_encoded(Data::new_copy(BACKGROUND_IMAGE)).expect("decode background image");
    canvas.draw_image_rect(
        &background_image,
        None,
        Rect::from_xywh(0.0, 0.0, canvas_size.0 as f32, canvas_size.1 as f32),
        &Paint::default(),
    );

    // Glass parameters
    let glass_width = 300.0;
    let glass_height = 140.0;
    let glass_x = (canvas_size.0 as f32 - glass_width) / 2.0;
    let glass_y = (canvas_size.1 as f32 - glass_height) / 2.0;
    let corner_radii = [corner_radius, corner_radius, corner_radius, corner_radius];

    // Create glass ImageFilter using backdrop approach
    let glass_filter = effects::create_liquid_glass_image_filter(
        glass_width,
        glass_height,
        corner_radii,
        0.0, // No rotation
        (canvas_size.0 as f32, canvas_size.1 as f32),
        &effect,
    );

    // Apply glass using SaveLayer with backdrop
    canvas.save();
    canvas.translate((glass_x, glass_y));

    // Clip to glass bounds (rectangle with rounded corners)
    let glass_rect = Rect::from_xywh(0.0, 0.0, glass_width, glass_height);
    let rrect =
        skia_safe::RRect::new_rect_radii(glass_rect, &[(corner_radius, corner_radius).into(); 4]);
    canvas.clip_rrect(rrect, None, true);

    // SaveLayer with backdrop - Skia captures and processes background automatically
    let layer_rec = SaveLayerRec::default().backdrop(&glass_filter);
    canvas.save_layer(&layer_rec);

    canvas.restore();
    canvas.restore();

    // Save to PNG
    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/liquid_glass.png"),
        data.as_bytes(),
    )
    .expect("write png");
}
