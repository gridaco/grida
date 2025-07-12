use skia_safe::canvas::SrcRectConstraint;
use skia_safe::{surfaces, Color, Image, Paint, Rect};
use std::path::Path;
use std::time::{Duration, Instant};

struct ImageBenchmark {
    scaled_versions: Vec<(f32, Image)>, // (scale_factor, image)
}

impl ImageBenchmark {
    fn new(image_path: &str) -> Self {
        // Load the original image
        let data = std::fs::read(image_path).expect("Failed to read image file");
        let original =
            Image::from_encoded(skia_safe::Data::new_copy(&data)).expect("Failed to decode image");

        // Create scaled versions
        let mut scaled_versions = Vec::new();
        let scales = [1.0, 0.5, 0.25, 0.125]; // Added 0.125 scale

        for scale in scales {
            let width = (original.width() as f32 * scale) as i32;
            let height = (original.height() as f32 * scale) as i32;

            // Create a surface for the scaled image
            let mut surface =
                surfaces::raster_n32_premul((width, height)).expect("Failed to create surface");
            let canvas = surface.canvas();

            // Clear the surface
            canvas.clear(Color::WHITE);

            // Draw the original image scaled down
            let mut paint = Paint::default();
            paint.set_anti_alias(true);

            let src_rect = Rect::new(0.0, 0.0, original.width() as f32, original.height() as f32);
            let dst_rect = Rect::new(0.0, 0.0, width as f32, height as f32);
            canvas.draw_image_rect(
                &original,
                Some((&src_rect, SrcRectConstraint::Fast)),
                dst_rect,
                &paint,
            );

            // Get the scaled image
            let scaled_image = surface.image_snapshot();
            scaled_versions.push((scale, scaled_image));
        }

        Self { scaled_versions }
    }

    fn benchmark_rendering(
        &self,
        iterations: usize,
        images_per_iteration: usize,
    ) -> Vec<(f32, Duration, Duration)> {
        let mut results = Vec::new();

        // Create a surface for rendering
        let mut surface =
            surfaces::raster_n32_premul((800, 600)).expect("Failed to create surface");
        let canvas = surface.canvas();

        // Calculate grid layout
        let grid_size = (images_per_iteration as f32).sqrt().ceil() as i32;
        let image_width = 800.0 / grid_size as f32;
        let image_height = 600.0 / grid_size as f32;

        // Benchmark each scaled version
        for (scale, image) in &self.scaled_versions {
            let mut total_time_fast = Duration::new(0, 0);
            let mut total_time_strict = Duration::new(0, 0);

            for _ in 0..iterations {
                // Test with Fast constraint
                canvas.clear(Color::WHITE);
                let start = Instant::now();
                for i in 0..images_per_iteration {
                    let row = (i as i32) / grid_size;
                    let col = (i as i32) % grid_size;

                    let x = col as f32 * image_width;
                    let y = row as f32 * image_height;

                    let mut paint = Paint::default();
                    paint.set_anti_alias(true);

                    let src_rect = Rect::new(0.0, 0.0, image.width() as f32, image.height() as f32);
                    let dst_rect = Rect::new(x, y, x + image_width, y + image_height);
                    canvas.draw_image_rect(
                        image,
                        Some((&src_rect, SrcRectConstraint::Fast)),
                        dst_rect,
                        &paint,
                    );
                }
                total_time_fast += start.elapsed();

                // Test with Strict constraint
                canvas.clear(Color::WHITE);
                let start = Instant::now();
                for i in 0..images_per_iteration {
                    let row = (i as i32) / grid_size;
                    let col = (i as i32) % grid_size;

                    let x = col as f32 * image_width;
                    let y = row as f32 * image_height;

                    let mut paint = Paint::default();
                    paint.set_anti_alias(true);

                    let src_rect = Rect::new(0.0, 0.0, image.width() as f32, image.height() as f32);
                    let dst_rect = Rect::new(x, y, x + image_width, y + image_height);
                    canvas.draw_image_rect(
                        image,
                        Some((&src_rect, SrcRectConstraint::Strict)),
                        dst_rect,
                        &paint,
                    );
                }
                total_time_strict += start.elapsed();
            }

            let avg_time_fast = total_time_fast / iterations as u32;
            let avg_time_strict = total_time_strict / iterations as u32;
            results.push((*scale, avg_time_fast, avg_time_strict));
        }

        results
    }
}

fn main() {
    // Check if image exists
    let image_path = "../fixtures/images/4k.jpg";
    if !Path::new(image_path).exists() {
        println!(
            "Error: {} not found. Please place a 4K image named '4k.jpg' in the fixtures directory.",
            image_path
        );
        return;
    }

    println!("Loading and preparing images...");
    let benchmark = ImageBenchmark::new(image_path);

    let iterations = 1000;
    let images_per_iteration = 16; // Render 16 images per iteration in a 4x4 grid

    println!(
        "\nRunning benchmark ({} iterations, {} images per iteration)...",
        iterations, images_per_iteration
    );
    let results = benchmark.benchmark_rendering(iterations, images_per_iteration);

    println!("\nResults:");
    println!(
        "Scale | Fast Quality (ms) | Strict Quality (ms) | Fast/Image (ms) | Strict/Image (ms)"
    );
    println!("------|-----------------|-------------------|----------------|------------------");
    for (scale, fast_time, strict_time) in results {
        let fast_ms = fast_time.as_secs_f64() * 1000.0;
        let strict_ms = strict_time.as_secs_f64() * 1000.0;
        let fast_per_image = fast_ms / images_per_iteration as f64;
        let strict_per_image = strict_ms / images_per_iteration as f64;
        println!(
            "{:.3}x | {:.2} | {:.2} | {:.2} | {:.2}",
            scale, fast_ms, strict_ms, fast_per_image, strict_per_image
        );
    }
}
