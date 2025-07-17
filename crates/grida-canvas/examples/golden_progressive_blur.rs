use cg::cg::types::FeProgressiveBlur;
use skia_safe::{
    self as sk, image_filters, surfaces, BlendMode, Color, Data, Paint, Point, Rect, Shader,
    TileMode, ImageInfo, ColorType, AlphaType, ColorSpace, Image, Pixmap,
};

static BLUR_EFFECT: FeProgressiveBlur = FeProgressiveBlur {
    x1: 0.0,
    y1: 0.0,
    x2: 400.0,
    y2: 400.0,
    radius: 0.0,
    radius2: 200.0,
};

/// Calculate the blur radius for a given position based on the progressive blur parameters
fn map_radius(position: (f32, f32), size: (f32, f32), pb: &FeProgressiveBlur) -> f32 {
    let (x, y) = position;
    let (width, height) = size;
    
    // Calculate the direction vector of the blur line
    let dx = pb.x2 - pb.x1;
    let dy = pb.y2 - pb.y1;
    let length = (dx * dx + dy * dy).sqrt();
    
    if length == 0.0 {
        return pb.radius;
    }
    
    // Normalize the direction vector
    let norm_dx = dx / length;
    let norm_dy = dy / length;
    
    // Project the point onto the blur line
    let point_dx = x - pb.x1;
    let point_dy = y - pb.y1;
    let projection = point_dx * norm_dx + point_dy * norm_dy;
    
    // Clamp projection to the line segment
    let t = (projection / length).clamp(0.0, 1.0);
    
    // Interpolate between start and end radius
    let radius = pb.radius + t * (pb.radius2 - pb.radius);
    radius.max(0.0)
}

/// Calculate Gaussian weights for a given radius and kernel size
fn calculate_gaussian_weights(radius: f32, kernel_size: usize) -> Vec<f32> {
    let mut weights = vec![0.0; kernel_size];
    let mut sum = 0.0;
    
    let sigma = radius.max(0.1); // Avoid division by zero
    
    for i in 0..kernel_size {
        let x = i as f32 - (kernel_size - 1) as f32 / 2.0;
        let weight = (-x * x / (2.0 * sigma * sigma)).exp();
        weights[i] = weight;
        sum += weight;
    }
    
    // Normalize weights
    if sum > 0.0 {
        for weight in &mut weights {
            *weight /= sum;
        }
    }
    
    weights
}

/// Apply horizontal blur with variable radius
fn blur_horizontal(
    source: &sk::Image,
    pb: &FeProgressiveBlur,
    kernel_size: usize,
) -> Option<sk::Image> {
    let width = source.width() as usize;
    let height = source.height() as usize;
    
    // Get pixel data from source image
    let mut pixmap = Pixmap::new(width as u32, height as u32)?;
    source.read_pixels(&pixmap.as_image_info(), pixmap.writable_addr(), pixmap.row_bytes(), (0, 0))?;
    let source_pixels = pixmap.addr();
    
    // Create output pixel buffer
    let mut output_pixels = vec![0u8; width * height * 4];
    
    for y in 0..height {
        for x in 0..width {
            let radius = map_radius((x as f32, y as f32), (width as f32, height as f32), pb);
            
            if radius <= 0.5 {
                // No blur, copy pixel directly
                let src_idx = (y * width + x) * 4;
                let dst_idx = (y * width + x) * 4;
                for c in 0..4 {
                    output_pixels[dst_idx + c] = unsafe { *source_pixels.add(src_idx + c) };
                }
                continue;
            }
            
            let weights = calculate_gaussian_weights(radius, kernel_size);
            let half_kernel = (kernel_size - 1) / 2;
            
            let mut result = [0.0f32; 4]; // RGBA
            
            for i in 0..kernel_size {
                let offset = i as i32 - half_kernel as i32;
                let sample_x = (x as i32 + offset).clamp(0, width as i32 - 1) as usize;
                
                let src_idx = (y * width + sample_x) * 4;
                let weight = weights[i];
                
                for c in 0..4 {
                    let pixel_value = unsafe { *source_pixels.add(src_idx + c) } as f32;
                    result[c] += pixel_value * weight;
                }
            }
            
            let dst_idx = (y * width + x) * 4;
            for c in 0..4 {
                output_pixels[dst_idx + c] = result[c].round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    
    // Create new image from processed pixels
    let image_info = ImageInfo::new(
        (width as i32, height as i32),
        ColorType::RGBA8888,
        AlphaType::Premul,
        ColorSpace::new_srgb(),
    );
    
    sk::Image::from_raster_data(&image_info, sk::Data::new_copy(&output_pixels), width * 4)
}

/// Apply vertical blur with variable radius
fn blur_vertical(
    source: &sk::Image,
    pb: &FeProgressiveBlur,
    kernel_size: usize,
) -> Option<sk::Image> {
    let width = source.width() as usize;
    let height = source.height() as usize;
    
    // Get pixel data from source image
    let mut pixmap = Pixmap::new(width as u32, height as u32)?;
    source.read_pixels(&pixmap.as_image_info(), pixmap.writable_addr(), pixmap.row_bytes(), (0, 0))?;
    let source_pixels = pixmap.addr();
    
    // Create output pixel buffer
    let mut output_pixels = vec![0u8; width * height * 4];
    
    for y in 0..height {
        for x in 0..width {
            let radius = map_radius((x as f32, y as f32), (width as f32, height as f32), pb);
            
            if radius <= 0.5 {
                // No blur, copy pixel directly
                let src_idx = (y * width + x) * 4;
                let dst_idx = (y * width + x) * 4;
                for c in 0..4 {
                    output_pixels[dst_idx + c] = unsafe { *source_pixels.add(src_idx + c) };
                }
                continue;
            }
            
            let weights = calculate_gaussian_weights(radius, kernel_size);
            let half_kernel = (kernel_size - 1) / 2;
            
            let mut result = [0.0f32; 4]; // RGBA
            
            for i in 0..kernel_size {
                let offset = i as i32 - half_kernel as i32;
                let sample_y = (y as i32 + offset).clamp(0, height as i32 - 1) as usize;
                
                let src_idx = (sample_y * width + x) * 4;
                let weight = weights[i];
                
                for c in 0..4 {
                    let pixel_value = unsafe { *source_pixels.add(src_idx + c) } as f32;
                    result[c] += pixel_value * weight;
                }
            }
            
            let dst_idx = (y * width + x) * 4;
            for c in 0..4 {
                output_pixels[dst_idx + c] = result[c].round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    
    // Create new image from processed pixels
    let image_info = ImageInfo::new(
        (width as i32, height as i32),
        ColorType::RGBA8888,
        AlphaType::Premul,
        ColorSpace::new_srgb(),
    );
    
    sk::Image::from_raster_data(&image_info, sk::Data::new_copy(&output_pixels), width * 4)
}

/// Apply accurate progressive blur to an image
fn apply_progressive_blur(source: &sk::Image, pb: &FeProgressiveBlur) -> Option<sk::Image> {
    const KERNEL_SIZE: usize = 65; // Must be odd number, similar to shader's 64
    
    // Apply horizontal blur first
    let horizontal_blurred = blur_horizontal(source, pb, KERNEL_SIZE)?;
    
    // Then apply vertical blur
    blur_vertical(&horizontal_blurred, pb, KERNEL_SIZE)
}

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();

    // Clear the surface with white background
    canvas.clear(Color::WHITE);

    // Load the image from file
    let image_path = "../fixtures/images/checker.png";
    let image_data = std::fs::read(image_path).expect("Failed to read image file");
    let image =
        sk::Image::from_encoded(Data::new_copy(&image_data)).expect("Failed to decode image");

    // Draw the original image
    canvas.draw_image(&image, (0, 0), None);

    // Apply progressive blur
    if let Some(blurred_image) = apply_progressive_blur(&image, &BLUR_EFFECT) {
        canvas.draw_image(&blurred_image, (0, 0), None);
    }

    // Save the result to a file
    let image_snapshot = surface.image_snapshot();
    let data = image_snapshot
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("Failed to encode image");
    std::fs::write("goldens/progressive_blur.png", data.as_bytes())
        .expect("Failed to write output file");
}
