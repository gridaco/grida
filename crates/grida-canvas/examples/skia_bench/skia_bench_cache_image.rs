//! This example demonstrates the performance benefits of image caching in Skia across different
//! device pixel ratios (DPR) and canvas sizes. It benchmarks the following scenarios:
//!
//! 1. Drawing Performance:
//!    - Compares cached vs uncached drawing performance
//!    - Measures performance across various device sizes and DPRs
//!    - Shows how caching affects rendering speed
//!
//! 2. DPR Handling:
//!    - Demonstrates proper handling of device pixel ratios
//!    - Creates surfaces at logical size and applies DPR scaling during drawing
//!    - Shows how caching works with high-DPI displays
//!
//! 3. Device Coverage:
//!    - Tests various device sizes from mobile to desktop
//!    - Includes different DPR values (1.0, 2.0, 3.0)
//!    - Covers common display resolutions and device types
//!
//! The benchmark draws a complex pattern of circles and measures:
//! - Average, minimum, and maximum drawing times
//! - Performance improvement ratio between cached and uncached drawing
//! - Impact of DPR scaling on performance
//!
//! This is particularly useful for understanding:
//! - When to use image caching
//! - How DPR affects rendering performance
//! - Performance characteristics across different device types

use skia_safe::{surfaces, *};
use std::time::{Duration, Instant};

struct CanvasSpec {
    name: String,
    logical: (i32, i32),
    dpr: f32,
    physical: (i32, i32),
}

fn get_canvas_specs() -> Vec<CanvasSpec> {
    vec![
        CanvasSpec {
            name: "iPhone SE".to_string(),
            logical: (375, 667),
            dpr: 2.0,
            physical: (750, 1334),
        },
        CanvasSpec {
            name: "iPhone 14 Pro".to_string(),
            logical: (430, 932),
            dpr: 3.0,
            physical: (1290, 2796),
        },
        CanvasSpec {
            name: "iPad Pro 11\"".to_string(),
            logical: (834, 1194),
            dpr: 2.0,
            physical: (1668, 2388),
        },
        CanvasSpec {
            name: "MacBook Air 13\"".to_string(),
            logical: (1440, 900),
            dpr: 2.0,
            physical: (2880, 1800),
        },
        CanvasSpec {
            name: "MacBook Pro 16\"".to_string(),
            logical: (1728, 1117),
            dpr: 2.0,
            physical: (3456, 2234),
        },
        CanvasSpec {
            name: "Studio Display".to_string(),
            logical: (2560, 1440),
            dpr: 2.0,
            physical: (5120, 2880),
        },
        CanvasSpec {
            name: "4K Monitor".to_string(),
            logical: (1920, 1080),
            dpr: 2.0,
            physical: (3840, 2160),
        },
        CanvasSpec {
            name: "5K Monitor".to_string(),
            logical: (2560, 1440),
            dpr: 2.0,
            physical: (5120, 2880),
        },
        CanvasSpec {
            name: "1080p Display".to_string(),
            logical: (1920, 1080),
            dpr: 1.0,
            physical: (1920, 1080),
        },
        CanvasSpec {
            name: "Small Canvas".to_string(),
            logical: (512, 512),
            dpr: 1.0,
            physical: (512, 512),
        },
    ]
}

fn draw_complex(canvas: &Canvas) {
    let width = canvas.image_info().width() as f32;
    let height = canvas.image_info().height() as f32;

    // Calculate grid size based on canvas dimensions
    let grid_size = (width * height).sqrt() / 20.0; // Adjust divisor to control density
    let cols = (width / grid_size).ceil() as i32;
    let rows = (height / grid_size).ceil() as i32;
    let circle_radius = grid_size * 0.4; // Circle size relative to grid cell

    // Create a gradient shader
    let colors = [
        Color::from_argb(0xFF, 0xFF, 0x00, 0x00), // Red
        Color::from_argb(0xFF, 0x00, 0xFF, 0x00), // Green
        Color::from_argb(0xFF, 0x00, 0x00, 0xFF), // Blue
    ];
    let positions = [0.0, 0.5, 1.0];
    let shader = Shader::linear_gradient(
        (Point::new(0.0, 0.0), Point::new(width, height)),
        &colors[..],
        Some(&positions[..]),
        TileMode::Clamp,
        None,
        None,
    )
    .unwrap();

    // Create multiple layers with different effects
    for layer in 0..3 {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_shader(shader.clone());

        // Apply different blend modes for each layer
        let blend_mode = match layer {
            0 => BlendMode::Multiply,
            1 => BlendMode::Screen,
            2 => BlendMode::Overlay,
            _ => unreachable!(),
        };
        paint.set_blend_mode(blend_mode);

        // Draw circles with blur effect
        for row in 0..rows {
            for col in 0..cols {
                let x = col as f32 * grid_size + grid_size / 2.0;
                let y = row as f32 * grid_size + grid_size / 2.0;

                // Apply different blur radius for each layer
                let blur_radius = match layer {
                    0 => grid_size * 0.1, // Scale blur with grid size
                    1 => grid_size * 0.15,
                    2 => grid_size * 0.2,
                    _ => unreachable!(),
                };

                // Create a temporary surface for the blur effect
                let temp_size = (circle_radius * 2.0) as i32;
                let mut temp_surface = surfaces::raster_n32_premul((temp_size, temp_size)).unwrap();
                let temp_canvas = temp_surface.canvas();

                // Draw the circle on the temporary surface
                temp_canvas.draw_circle(
                    (temp_size as f32 / 2.0, temp_size as f32 / 2.0),
                    circle_radius,
                    &paint,
                );

                // Apply blur to the temporary surface
                let image = temp_surface.image_snapshot();
                let mut blur_paint = Paint::default();
                blur_paint.set_image_filter(image_filters::blur(
                    (blur_radius, blur_radius),
                    None,
                    None,
                    None,
                ));

                // Draw the blurred circle
                canvas.draw_image(
                    image,
                    (x - circle_radius, y - circle_radius),
                    Some(&blur_paint),
                );
            }
        }
    }

    // Add a final overlay with a radial gradient
    let mut overlay_paint = Paint::default();
    let radial_colors = [
        Color::from_argb(0x40, 0xFF, 0xFF, 0xFF), // Semi-transparent white
        Color::from_argb(0x00, 0xFF, 0xFF, 0xFF), // Transparent
    ];
    let radial_positions = [0.0, 1.0];
    let radial_shader = Shader::radial_gradient(
        Point::new(width / 2.0, height / 2.0),
        width.min(height) / 2.0,
        &radial_colors[..],
        Some(&radial_positions[..]),
        TileMode::Clamp,
        None,
        None,
    )
    .unwrap();
    overlay_paint.set_shader(radial_shader);
    overlay_paint.set_blend_mode(BlendMode::SoftLight);
    canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &overlay_paint);
}

fn make_cached_image(surface: &mut Surface, dpr: f32) -> Image {
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Apply DPR scaling
    canvas.save();
    canvas.scale((dpr, dpr));
    draw_complex(canvas);
    canvas.restore();

    // Create a new surface with the same size for the cached image
    let mut cached_surface = surfaces::raster_n32_premul((surface.width(), surface.height()))
        .expect("Failed to create surface");
    let cached_canvas = cached_surface.canvas();
    cached_canvas.draw_image(surface.image_snapshot(), (0, 0), None);
    cached_surface.image_snapshot()
}

fn run_benchmark(use_cache: bool, surface: &mut Surface, cached: &Image, dpr: f32) -> Duration {
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let start = Instant::now();
    if use_cache {
        let paint = Paint::default();
        canvas.draw_image(cached, (0, 0), Some(&paint));
    } else {
        // Apply DPR scaling for uncached drawing
        canvas.save();
        canvas.scale((dpr, dpr));
        draw_complex(canvas);
        canvas.restore();
    }
    start.elapsed()
}

fn run_benchmark_for_size(spec: &CanvasSpec) {
    println!("\nRunning benchmark for {}:", spec.name);
    println!("Logical size: {}x{}", spec.logical.0, spec.logical.1);
    println!("Physical size: {}x{}", spec.physical.0, spec.physical.1);
    println!("DPR: {}", spec.dpr);

    // Create surface at logical size
    let mut surface = surfaces::raster_n32_premul(spec.logical).unwrap();
    let cached = make_cached_image(&mut surface, spec.dpr);

    const FRAMES: usize = 100;
    let mut cached_times = Vec::with_capacity(FRAMES);
    let mut uncached_times = Vec::with_capacity(FRAMES);

    // Warm up
    for _ in 0..10 {
        run_benchmark(true, &mut surface, &cached, spec.dpr);
        run_benchmark(false, &mut surface, &cached, spec.dpr);
    }

    // Collect measurements
    for _ in 0..FRAMES {
        cached_times.push(run_benchmark(true, &mut surface, &cached, spec.dpr));
        uncached_times.push(run_benchmark(false, &mut surface, &cached, spec.dpr));
    }

    // Calculate statistics
    let cached_avg: Duration = cached_times.iter().sum::<Duration>() / FRAMES as u32;
    let uncached_avg: Duration = uncached_times.iter().sum::<Duration>() / FRAMES as u32;

    let cached_min = cached_times.iter().min().unwrap();
    let cached_max = cached_times.iter().max().unwrap();
    let uncached_min = uncached_times.iter().min().unwrap();
    let uncached_max = uncached_times.iter().max().unwrap();

    println!("\nPerformance Results:");
    println!("-------------------");
    println!("Cached drawing:");
    println!("  Average: {:?}", cached_avg);
    println!("  Min: {:?}", cached_min);
    println!("  Max: {:?}", cached_max);
    println!("\nUncached drawing:");
    println!("  Average: {:?}", uncached_avg);
    println!("  Min: {:?}", uncached_min);
    println!("  Max: {:?}", uncached_max);
    println!("\nPerformance improvement:");
    println!(
        "  Speedup: {:.2}x",
        uncached_avg.as_secs_f64() / cached_avg.as_secs_f64()
    );
}

fn main() {
    let specs = get_canvas_specs();

    println!(
        "Starting benchmarks for {} different canvas sizes...",
        specs.len()
    );

    for spec in specs {
        run_benchmark_for_size(&spec);
    }
}
