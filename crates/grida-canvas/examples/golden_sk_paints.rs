//! # Grida Canvas Skia - Stacked Paints Example
//!
//! This example demonstrates how the shared CG paint definitions and the painter
//! conversion helpers can be used to efficiently render complex paint combinations
//! using shader stacking.
//!
//! ## Goal
//! Our goal is to showcase the shader stacking capabilities provided by
//! `cg::painter::cvt::sk_paint_stack`, which combines multiple paints into a single
//! optimized shader for improved performance.
//!
//! ## What it demonstrates:
//! - Uses the core `Paint` types from `cg::types`
//! - Converts paints to Skia using `cg::painter::cvt::sk_paint_stack`
//! - Comprehensive demos of various fill combinations:
//!   - Single solid fill
//!   - Single linear gradient fill
//!   - Solid fill + solid fill (with different alphas)
//!   - Solid fill + linear gradient fill (stacked)
//!   - Linear gradient + linear gradient fill (stacked)
//!   - Linear gradient + radial gradient fill (stacked)
//!   - Image + radial gradient fill (stacked)
//!   - ALL MIXED: solid + linear + radial + image (all with alpha) - comprehensive test
//!
//! ## Layout
//! Single PNG with 9 examples in a 3-column grid layout:
//! - Each example demonstrates a different paint combination
//! - All paints use opacity values less than 1.0 to test alpha blending
//! - Images are properly loaded and rendered with opacity
//!
//! ## Benefits of shader stacking:
//! - Single draw call per paint combination
//! - Better GPU utilization
//! - Improved performance for complex fill combinations
//! - Maintains visual accuracy through proper alpha blending
//! - Efficient handling of opacity and blend modes

use cg::resources::ByteStore;
use cg::{
    cg::types::{
        BlendMode, CGColor, GradientStop, ImageFilters, ImagePaint, ImagePaintFit, ImageRepeat,
        LinearGradientPaint, Paint, Paints, RadialGradientPaint, ResourceRef, SolidPaint,
    },
    painter::paint,
    runtime::image_repository::ImageRepository,
};
use math2::{box_fit::BoxFit, transform::AffineTransform};
use skia_safe::{surfaces, Color, Point, Rect};
use std::{
    hash::Hash,
    sync::{Arc, Mutex},
};

thread_local! {
    static FONT: skia_safe::Font = skia_safe::Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        8.0,
    );
}

fn main() {
    let tile = 200.0;
    let padding = 20.0;
    let row_gap = 20.0;
    let column_gap = 20.0;
    let label_height = 20.0;
    let columns = 3;
    let rows = 3; // 9 examples in 3 columns = 3 rows (3 + 3 + 3)
    let width = (padding * 2.0 + tile * columns as f32 + column_gap * (columns - 1) as f32) as i32;
    let height = (padding * 2.0
        + tile * rows as f32
        + row_gap * (rows - 1) as f32
        + label_height * rows as f32) as i32;

    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let (image_repository, checker_image_ref) = load_checker_image();

    // Define all examples
    let examples = vec![
        // 1. single solid
        (
            Paints::new([Paint::from(CGColor(255, 0, 0, 200))]), // opacity 0.78
            "1. Single Solid",
        ),
        // 2. single linear gradient
        (
            Paints::new([Paint::LinearGradient(LinearGradientPaint {
                transform: AffineTransform::identity(),
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(255, 0, 0, 255),
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(0, 0, 255, 255),
                    },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
                active: true,
            })]),
            "2. Single Linear Gradient",
        ),
        // 3. solid + solid with multiply blend
        (
            Paints::new([
                Paint::Solid(SolidPaint {
                    color: CGColor(255, 0, 0, 100), // opacity 0.39
                    blend_mode: BlendMode::Normal,
                    active: true,
                }),
                Paint::Solid(SolidPaint {
                    color: CGColor(0, 0, 255, 100), // opacity 0.39
                    blend_mode: BlendMode::Multiply,
                    active: true,
                }),
            ]),
            "3. Solid + Solid (Multiply)",
        ),
        // 4. solid + linear gradient with screen blend
        (
            Paints::new([
                Paint::Solid(SolidPaint {
                    color: CGColor(255, 255, 0, 180), // opacity 0.71
                    blend_mode: BlendMode::Normal,
                    active: true,
                }),
                Paint::LinearGradient(LinearGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(255, 0, 255, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(0, 255, 255, 255),
                        },
                    ],
                    opacity: 0.6,
                    blend_mode: BlendMode::Screen,
                    active: true,
                }),
            ]),
            "4. Solid + Linear (Screen)",
        ),
        // 5. linear + linear gradient with overlay blend
        (
            Paints::new([
                Paint::LinearGradient(LinearGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(255, 0, 0, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(255, 255, 0, 255),
                        },
                    ],
                    opacity: 0.7,
                    blend_mode: BlendMode::Normal,
                    active: true,
                }),
                Paint::LinearGradient(LinearGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(0, 255, 0, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(0, 0, 255, 255),
                        },
                    ],
                    opacity: 0.5,
                    blend_mode: BlendMode::Overlay,
                    active: true,
                }),
            ]),
            "5. Linear + Linear (Overlay)",
        ),
        // 6. linear + radial gradient with soft light blend
        (
            Paints::new([
                Paint::LinearGradient(LinearGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(255, 165, 0, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(0, 255, 0, 255),
                        },
                    ],
                    opacity: 0.7,
                    blend_mode: BlendMode::Normal,
                    active: true,
                }),
                Paint::RadialGradient(RadialGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(255, 255, 255, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(0, 0, 0, 0),
                        },
                    ],
                    opacity: 0.5,
                    blend_mode: BlendMode::SoftLight,
                    active: true,
                }),
            ]),
            "6. Linear + Radial (SoftLight)",
        ),
        // 7. image + solid with multiply blend
        (
            Paints::new([
                Paint::Image(ImagePaint {
                    image: checker_image_ref.clone(),
                    quarter_turns: 0,
                    fit: ImagePaintFit::Fit(BoxFit::Fill),
                    repeat: ImageRepeat::NoRepeat,
                    scale: 1.0,
                    opacity: 0.6,
                    blend_mode: BlendMode::Normal,
                    active: true,
                    filters: ImageFilters::default(),
                }),
                Paint::Solid(SolidPaint {
                    color: CGColor(0, 0, 0, 200),
                    blend_mode: BlendMode::Multiply,
                    active: true,
                }),
            ]),
            "7. Image + Solid (Multiply)",
        ),
        // 8. image + radial gradient with hard light blend
        (
            Paints::new([
                Paint::Image(ImagePaint {
                    image: checker_image_ref.clone(),
                    quarter_turns: 0,
                    fit: ImagePaintFit::Fit(BoxFit::Fill),
                    repeat: ImageRepeat::NoRepeat,
                    scale: 1.0,
                    opacity: 0.5,
                    blend_mode: BlendMode::Normal,
                    active: true,
                    filters: ImageFilters::default(),
                }),
                Paint::RadialGradient(RadialGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(255, 255, 255, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(0, 0, 0, 0),
                        },
                    ],
                    opacity: 0.5,
                    blend_mode: BlendMode::HardLight,
                    active: true,
                }),
            ]),
            "8. Image + Radial (HardLight)",
        ),
        // 9. all mixed: solid + linear + radial + image with various blend modes
        (
            Paints::new([
                Paint::Solid(SolidPaint {
                    color: CGColor(255, 0, 0, 200), // opacity 0.78
                    blend_mode: BlendMode::Normal,
                    active: true,
                }),
                Paint::LinearGradient(LinearGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(0, 255, 0, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(0, 0, 255, 255),
                        },
                    ],
                    opacity: 0.6,
                    blend_mode: BlendMode::Multiply,
                    active: true,
                }),
                Paint::RadialGradient(RadialGradientPaint {
                    transform: AffineTransform::identity(),
                    stops: vec![
                        GradientStop {
                            offset: 0.0,
                            color: CGColor(255, 255, 255, 255),
                        },
                        GradientStop {
                            offset: 1.0,
                            color: CGColor(255, 255, 0, 0),
                        },
                    ],
                    opacity: 0.5,
                    blend_mode: BlendMode::Screen,
                    active: true,
                }),
                Paint::Image(ImagePaint {
                    image: checker_image_ref,
                    quarter_turns: 0,
                    fit: ImagePaintFit::Fit(BoxFit::Fill),
                    repeat: ImageRepeat::NoRepeat,
                    scale: 1.0,
                    opacity: 0.5,
                    blend_mode: BlendMode::Overlay,
                    active: true,
                    filters: ImageFilters::default(),
                }),
            ]),
            "9. All Mixed (Various Blends)",
        ),
    ];

    // Draw examples in grid layout
    for (i, (fills, label)) in examples.iter().enumerate() {
        let col = i % columns;
        let row = i / columns;

        let x = padding + col as f32 * (tile + column_gap);
        let y = padding + row as f32 * (tile + row_gap + label_height);

        draw_stacked(canvas, x, y, tile, fills, &image_repository);
        draw_label(canvas, x, y + tile + 10.0, label);
    }

    // save png
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/sk_paints.png"),
        data.as_bytes(),
    )
    .unwrap();
}

fn draw_stacked(
    canvas: &skia_safe::Canvas,
    x: f32,
    y: f32,
    size: f32,
    fills: &Paints,
    images: &ImageRepository,
) {
    // Use canvas transform and save/restore like production code
    canvas.save();
    canvas.translate((x, y));

    // Create rectangle at origin (0, 0) with the tile size
    let rect = Rect::from_xywh(0.0, 0.0, size, size);
    let size_tuple = (size, size);

    // Create a path from the rectangle to match production code behavior
    let mut path = skia_safe::Path::new();
    path.add_rect(rect, None);

    // Paint order semantics:
    // - `fills` is bottom → top. We pass as-is to the stacker, which composes
    //   each subsequent paint on top of the accumulated background.
    if let Some(paint) = paint::sk_paint_stack(fills, size_tuple, images) {
        canvas.draw_path(&path, &paint);
    }

    canvas.restore();
}

fn draw_label(canvas: &skia_safe::Canvas, x: f32, y: f32, text: &str) {
    FONT.with(|font| {
        let mut text_paint = skia_safe::Paint::default();
        text_paint.set_color(Color::BLACK);

        let text_point = Point::new(x, y);
        canvas.draw_str(text, text_point, font, &text_paint);
    });
}

fn load_checker_image() -> (ImageRepository, ResourceRef) {
    let path = format!(
        "{}/../../fixtures/images/checker.png",
        env!("CARGO_MANIFEST_DIR")
    );
    let bytes = std::fs::read(&path).expect("Failed to read fixture image");
    let hash = hash_bytes(&bytes);

    let store = Arc::new(Mutex::new(ByteStore::new()));
    store.lock().unwrap().insert(hash, bytes);

    let mut repository = ImageRepository::new(store);
    let image_src = "res://fixtures/checker.png".to_string();
    repository
        .insert(image_src.clone(), hash)
        .expect("Failed to insert image into repository");

    (repository, ResourceRef::RID(image_src))
}

fn hash_bytes(bytes: &[u8]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::Hasher;

    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}
