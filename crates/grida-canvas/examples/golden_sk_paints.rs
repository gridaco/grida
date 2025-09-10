//! # Grida Canvas Skia - Golden Fills Example
//!
//! This example demonstrates efficient paint stacking using only Skia API (not CG module functions)
//! to draw multiple fills in the most efficient and accurate way.
//!
//! ## Goal
//! Our goal is to make LEFT and RIGHT columns visually identical, proving that our shader stacking
//! optimization produces the same results as the traditional approach.
//!
//! ## What it demonstrates:
//! - Only use Skia API to draw multiple fills (paint stacking)
//! - Skia native way to draw multiple paints in a single paint call (merge shader)
//! - Uses local DemoPaint enum instead of importing from CG module
//! - Minimal, unique demos of various fill combinations:
//!   - Single solid fill
//!   - Single linear gradient fill  
//!   - Solid fill + solid fill (with different alphas)
//!   - Solid fill + linear gradient fill (stacked)
//!   - Linear gradient + linear gradient fill (stacked)
//!   - Linear gradient + radial gradient fill (stacked)
//!   - Image + radial gradient fill (stacked) - uses checker.png from fixtures/images
//!   - ALL MIXED: solid + linear + radial + image (all with alpha) - comprehensive test
//!
//! ## Layout
//! Single PNG with 2-column layout:
//! - **LEFT = ACCURATE**: Non-stacked, loop-painted, most accurate way (slow)
//!   - Each paint drawn separately with individual `canvas.draw_rect()` calls
//!   - Uses Skia's native compositing for alpha blending
//!   - This is the ground truth reference that cannot be wrong
//!
//! - **RIGHT = OPTIMIZED**: Stacked, single paint call, fast
//!   - All paints combined into a single shader using `shaders::blend()`
//!   - Uses `BlendMode::SrcOver` for proper alpha compositing
//!   - Must match LEFT column to prove optimization correctness
//!
//! ## Benefits of shader stacking:
//! - Reduced draw calls (1 vs N calls)
//! - Better GPU utilization
//! - Improved performance for complex fill combinations
//! - Maintains visual accuracy through proper alpha blending

use math2::transform::AffineTransform;
use skia_safe::shaders;
use skia_safe::{
    self as sk, surfaces, BlendMode, Color, Color4f, Data, Font, Image, Matrix, Paint as SkPaint,
    Point, Rect, SamplingOptions, Shader, TileMode,
};

// Local demo paint types - no need to import from CG
#[derive(Clone, Copy)]
pub struct CGColor(pub u8, pub u8, pub u8, pub u8);

#[derive(Clone)]
pub struct GradientStop {
    pub offset: f32,
    pub color: CGColor,
}

#[derive(Clone)]
pub struct SolidPaint {
    pub color: CGColor,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl From<CGColor> for SolidPaint {
    fn from(color: CGColor) -> Self {
        SolidPaint {
            color,
            opacity: 1.0,
            blend_mode: BlendMode::SrcOver,
        }
    }
}

#[derive(Clone)]
pub struct LinearGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Clone)]
pub struct RadialGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Clone)]
pub struct ImagePaint {
    pub image: Image,
    pub opacity: f32,
}

#[derive(Clone)]
pub enum DemoPaint {
    Solid(SolidPaint),
    LinearGradient(LinearGradientPaint),
    RadialGradient(RadialGradientPaint),
    Image(ImagePaint),
}

thread_local! {
    static FONT: Font = Font::new(cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES), 8.0);
}

fn main() {
    let tile = 80.0;
    let padding = 20.0;
    let column_gap = 40.0;
    let row_gap = 20.0;
    let label_height = 20.0;
    let width = (padding * 2.0 + tile * 2.0 + column_gap) as i32;
    let height = (padding * 2.0 + tile * 8.0 + row_gap * 7.0 + label_height * 8.0) as i32;

    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut y = padding;

    // 1. single solid
    let fills = vec![DemoPaint::Solid(SolidPaint::from(CGColor(255, 0, 0, 255)))];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(canvas, padding, y + tile + 10.0, "1. Single Solid");
    y += tile + row_gap + label_height;

    // 2. single linear gradient
    let fills = vec![DemoPaint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::default(),
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
    })];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(
        canvas,
        padding,
        y + tile + 10.0,
        "2. Single Linear Gradient",
    );
    y += tile + row_gap + label_height;

    // 3. solid + solid
    let fills = vec![
        DemoPaint::Solid(SolidPaint::from(CGColor(255, 0, 0, 255))),
        DemoPaint::Solid(SolidPaint::from(CGColor(0, 0, 255, 255))),
    ];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(canvas, padding, y + tile + 10.0, "3. Solid + Solid (Alpha)");
    y += tile + row_gap + label_height;

    // 4. solid + linear gradient
    let fills = vec![
        DemoPaint::Solid(SolidPaint::from(CGColor(255, 255, 0, 255))),
        DemoPaint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::default(),
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
        }),
    ];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(
        canvas,
        padding,
        y + tile + 10.0,
        "4. Solid + Linear Gradient",
    );
    y += tile + row_gap + label_height;

    // 5. linear gradient + linear gradient
    let fills = vec![
        DemoPaint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::default(),
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
            opacity: 1.0,
        }),
        DemoPaint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::default(),
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
        }),
    ];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(
        canvas,
        padding,
        y + tile + 10.0,
        "5. Linear + Linear Gradient",
    );
    y += tile + row_gap + label_height;

    // 6. linear gradient + radial gradient
    let fills = vec![
        DemoPaint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::default(),
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: CGColor(255, 0, 0, 255),
                },
                GradientStop {
                    offset: 1.0,
                    color: CGColor(0, 255, 0, 255),
                },
            ],
            opacity: 1.0,
        }),
        DemoPaint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::default(),
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
        }),
    ];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(
        canvas,
        padding,
        y + tile + 10.0,
        "6. Linear + Radial Gradient",
    );
    y += tile + row_gap + label_height;

    // 7. image + radial gradient
    let image = load_fixture_image("checker.png", tile as i32, tile as i32);
    let fills = vec![
        DemoPaint::Image(ImagePaint {
            image: image.clone(),
            opacity: 1.0,
        }),
        DemoPaint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::default(),
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
        }),
    ];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(
        canvas,
        padding,
        y + tile + 10.0,
        "7. Image + Radial Gradient",
    );
    y += tile + row_gap + label_height;

    // 8. ALL MIXED: solid + linear + radial + image (all with alpha)
    let image = load_fixture_image("checker.png", tile as i32, tile as i32);
    let fills = vec![
        DemoPaint::Solid(SolidPaint::from(CGColor(255, 0, 0, 255))),
        DemoPaint::LinearGradient(LinearGradientPaint {
            transform: AffineTransform::default(),
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
        }),
        DemoPaint::RadialGradient(RadialGradientPaint {
            transform: AffineTransform::default(),
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
        }),
        DemoPaint::Image(ImagePaint {
            image,
            opacity: 0.8,
        }),
    ];
    draw_pair(canvas, padding, y, tile, &fills);
    draw_label(
        canvas,
        padding,
        y + tile + 10.0,
        "8. All Mixed (Solid + Linear + Radial + Image)",
    );

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

fn draw_pair(canvas: &sk::Canvas, x: f32, y: f32, size: f32, fills: &[DemoPaint]) {
    let rect_l = Rect::from_xywh(x, y, size, size);
    draw_accurate(canvas, rect_l, fills);
    let rect_r = Rect::from_xywh(x + size + 20.0, y, size, size);
    draw_stacked(canvas, rect_r, fills);
}

fn draw_accurate(canvas: &sk::Canvas, rect: Rect, fills: &[DemoPaint]) {
    for paint in fills {
        if let Some(p) = paint_to_sk_paint(paint, rect) {
            canvas.draw_rect(rect, &p);
        }
    }
}

fn draw_stacked(canvas: &sk::Canvas, rect: Rect, fills: &[DemoPaint]) {
    if let Some(shader) = stack_shaders(fills, rect) {
        let mut paint = SkPaint::default();
        paint.set_shader(shader);
        paint.set_anti_alias(true);
        canvas.draw_rect(rect, &paint);
    }
}

fn paint_to_sk_paint(p: &DemoPaint, rect: Rect) -> Option<SkPaint> {
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    match p {
        DemoPaint::Solid(s) => {
            paint.set_color4f(cgcolor_to_color4f(s.color, s.opacity), None);
            Some(paint)
        }
        DemoPaint::LinearGradient(g) => {
            let shader = linear_gradient_shader(g, rect)?;
            paint.set_shader(shader);
            Some(paint)
        }
        DemoPaint::RadialGradient(g) => {
            let shader = radial_gradient_shader(g, rect)?;
            paint.set_shader(shader);
            Some(paint)
        }
        DemoPaint::Image(img) => {
            // Create image shader with proper positioning and opacity
            let mut matrix = Matrix::new_identity();
            matrix.set_translate((rect.left(), rect.top()));
            let sampling = SamplingOptions::default();
            let image_shader = img.image.to_shader(
                Some((TileMode::Clamp, TileMode::Clamp)),
                sampling,
                Some(&matrix),
            )?;

            paint.set_shader(image_shader);
            // Apply opacity through paint alpha
            if img.opacity < 1.0 {
                paint.set_color4f(Color4f::new(1.0, 1.0, 1.0, img.opacity), None);
            }
            Some(paint)
        }
    }
}

fn stack_shaders(fills: &[DemoPaint], rect: Rect) -> Option<Shader> {
    let mut iter = fills.iter();
    let first = iter.next()?;
    let mut shader = shader_from_paint(first, rect)?;
    for p in iter {
        let next = shader_from_paint(p, rect)?;
        shader = shaders::blend(BlendMode::SrcOver, shader, next);
    }
    Some(shader)
}

fn shader_from_paint(p: &DemoPaint, rect: Rect) -> Option<Shader> {
    match p {
        DemoPaint::Solid(s) => {
            let color4f = cgcolor_to_color4f(s.color, s.opacity);
            let color = Color::from_argb(
                (color4f.a * 255.0) as u8,
                (color4f.r * 255.0) as u8,
                (color4f.g * 255.0) as u8,
                (color4f.b * 255.0) as u8,
            );
            Some(shaders::color(color))
        }
        DemoPaint::LinearGradient(g) => linear_gradient_shader(g, rect),
        DemoPaint::RadialGradient(g) => radial_gradient_shader(g, rect),
        DemoPaint::Image(img) => {
            // Create image shader with proper positioning
            let mut matrix = Matrix::new_identity();
            matrix.set_translate((rect.left(), rect.top()));
            let sampling = SamplingOptions::default();
            img.image
                .to_shader(
                    Some((TileMode::Clamp, TileMode::Clamp)),
                    sampling,
                    Some(&matrix),
                )
                .map(|shader| {
                    // Apply opacity using the same method as direct drawing
                    if img.opacity < 1.0 {
                        let opacity_color =
                            Color::from_argb((img.opacity * 255.0) as u8, 255, 255, 255);
                        shaders::blend(BlendMode::DstIn, shader, shaders::color(opacity_color))
                    } else {
                        shader
                    }
                })
        }
    }
}

fn linear_gradient_shader(p: &LinearGradientPaint, rect: Rect) -> Option<Shader> {
    let pts = (
        Point::new(rect.left(), rect.top()),
        Point::new(rect.right(), rect.bottom()),
    );
    let (colors, positions) = stops_to_arrays(&p.stops, p.opacity);
    Shader::linear_gradient(
        pts,
        colors.as_slice(),
        Some(positions.as_slice()),
        TileMode::Clamp,
        None,
        None,
    )
}

fn radial_gradient_shader(p: &RadialGradientPaint, rect: Rect) -> Option<Shader> {
    let center = Point::new(
        rect.left() + rect.width() / 2.0,
        rect.top() + rect.height() / 2.0,
    );
    let radius = rect.width().max(rect.height()) / 2.0;
    let (colors, positions) = stops_to_arrays(&p.stops, p.opacity);
    Shader::radial_gradient(
        center,
        radius,
        colors.as_slice(),
        Some(positions.as_slice()),
        TileMode::Clamp,
        None,
        None,
    )
}

fn stops_to_arrays(stops: &[GradientStop], opacity: f32) -> (Vec<Color4f>, Vec<f32>) {
    let mut colors = Vec::with_capacity(stops.len());
    let mut positions = Vec::with_capacity(stops.len());
    for s in stops {
        colors.push(cgcolor_to_color4f(s.color, opacity));
        positions.push(s.offset);
    }
    (colors, positions)
}

fn cgcolor_to_color4f(c: CGColor, opacity: f32) -> Color4f {
    Color4f::new(
        c.0 as f32 / 255.0,
        c.1 as f32 / 255.0,
        c.2 as f32 / 255.0,
        (c.3 as f32 / 255.0) * opacity,
    )
}

fn load_fixture_image(filename: &str, w: i32, h: i32) -> Image {
    // Load image from fixtures directory (project root)
    let fixture_path = format!(
        "{}/../../fixtures/images/{}",
        env!("CARGO_MANIFEST_DIR"),
        filename
    );
    let data = std::fs::read(&fixture_path).expect("Failed to read fixture image");
    let data = Data::new_copy(&data);
    let image = Image::from_encoded(data).expect("Failed to decode image");

    // Create a surface and draw the image scaled to the desired size
    let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
    let canvas = surface.canvas();
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    canvas.draw_image_rect(&image, None, Rect::from_wh(w as f32, h as f32), &paint);

    surface.image_snapshot()
}

fn draw_label(canvas: &sk::Canvas, x: f32, y: f32, text: &str) {
    FONT.with(|font| {
        let mut text_paint = SkPaint::default();
        text_paint.set_color(Color::BLACK);
        text_paint.set_anti_alias(true);

        let text_point = Point::new(x, y);
        canvas.draw_str(text, text_point, font, &text_paint);
    });
}
