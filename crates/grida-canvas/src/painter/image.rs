use super::image_filters;
use crate::{cg::types::*, sk};
use math2::transform::AffineTransform;
use skia_safe::{self, shaders, Color, SamplingOptions, Shader, TileMode};

/// Creates an image shader from an ImagePaint and Skia image.
///
/// This function handles the transformation matrix calculation, sampling options,
/// and applies image filters and opacity as needed.
///
/// # Arguments
/// * `img` - The image paint configuration
/// * `image` - The Skia image to create a shader from
/// * `size` - Container size for matrix calculations
///
/// # Returns
/// A Skia shader with applied transformations and effects, or `None` if creation fails
pub fn image_shader(
    img: &ImagePaint,
    image: &skia_safe::Image,
    size: (f32, f32),
) -> Option<Shader> {
    let matrix = sk::sk_matrix(image_paint_matrix(
        img,
        (image.width() as f32, image.height() as f32),
        size,
    ));
    let sampling = SamplingOptions::default();
    let mut shader = image.to_shader(
        // Use `Decal` tile mode so Skia doesn't extend edge pixels
        // when the image is scaled beyond its natural bounds. This
        // prevents the visual artifacts where the last row/column is
        // repeated to fill the remaining area.
        Some((TileMode::Decal, TileMode::Decal)),
        sampling,
        Some(&matrix),
    )?;

    // Apply image filters if any are specified
    if img.filters.has_filters() {
        if let Some(color_filter) = image_filters::create_image_filters_color_filter(&img.filters) {
            shader = shader.with_color_filter(&color_filter);
        }
    }

    // Apply paint-level opacity at the shader level for stacking
    if img.opacity < 1.0 {
        let opacity_color = Color::from_argb((img.opacity * 255.0) as u8, 255, 255, 255);
        let opacity_shader = shaders::color(opacity_color);
        let final_shader = shaders::blend(skia_safe::BlendMode::DstIn, shader, opacity_shader);
        Some(final_shader)
    } else {
        Some(shader)
    }
}

/// Calculates the transformation matrix for an image paint.
///
/// This function handles both box-fit transformations and custom transforms,
/// ensuring proper scaling and positioning within the container.
///
/// # Arguments
/// * `paint` - The image paint configuration
/// * `image_size` - The natural dimensions of the image (width, height)
/// * `container_size` - The target container dimensions (width, height)
///
/// # Returns
/// A 2x3 transformation matrix for shader application
pub fn image_paint_matrix(
    paint: &ImagePaint,
    image_size: (f32, f32),
    container_size: (f32, f32),
) -> [[f32; 3]; 2] {
    match paint.fit {
        ImagePaintFit::Fit(box_fit) => {
            box_fit
                .calculate_transform(image_size, container_size)
                .matrix
        }
        // For custom transforms, we handle the complete image-to-container mapping
        // directly without composing with BoxFit::Fill, which would create double transformation.
        ImagePaintFit::Transform(transform) => {
            calculate_raw_transform(&transform, image_size, container_size)
        }
    }
}

/// Calculates the raw transform matrix for a custom transform.
///
/// This function handles the complete image-to-container mapping for custom transforms.
/// It combines the image scaling (to match container) with the user-provided box-relative transform.
/// The identity transform behaves identically to `BoxFit::Fill`.
///
/// # Arguments
/// * `transform` - The box-relative affine transform
/// * `image_size` - The natural dimensions of the image (width, height)
/// * `container_size` - The dimensions of the target container (width, height)
///
/// # Returns
/// The 2x3 transformation matrix in shader space
pub fn calculate_raw_transform(
    transform: &AffineTransform,
    image_size: (f32, f32),
    container_size: (f32, f32),
) -> [[f32; 3]; 2] {
    let (image_width, image_height) = image_size;
    let (container_width, container_height) = container_size;

    // Calculate the scale factors to fit the image to container (equivalent to BoxFit::Fill)
    let scale_x = container_width / image_width;
    let scale_y = container_height / image_height;

    // Apply the user's box-relative transform directly to the container space
    // The user transform is already in box-relative coordinates [0,1] x [0,1]
    // We need to scale it to the actual container dimensions
    let matrix = transform.matrix;
    [
        [
            matrix[0][0] * scale_x,         // Scale X component by container/image ratio
            matrix[0][1] * scale_y,         // Scale Y component by container/image ratio
            matrix[0][2] * container_width, // Scale translation X to container width
        ],
        [
            matrix[1][0] * scale_x,          // Scale X component by container/image ratio
            matrix[1][1] * scale_y,          // Scale Y component by container/image ratio
            matrix[1][2] * container_height, // Scale translation Y to container height
        ],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use math2::transform::AffineTransform;

    #[test]
    fn test_calculate_raw_transform_identity() {
        let identity_transform = AffineTransform::identity();
        let image_size = (100.0, 50.0);
        let container_size = (200.0, 100.0);

        let matrix = calculate_raw_transform(&identity_transform, image_size, container_size);

        // Identity transform should behave like BoxFit::Fill
        // scale_x = 200/100 = 2.0, scale_y = 100/50 = 2.0
        assert_eq!(matrix[0], [2.0, 0.0, 0.0]);
        assert_eq!(matrix[1], [0.0, 2.0, 0.0]);
    }

    #[test]
    fn test_calculate_raw_transform_with_translation() {
        let transform = AffineTransform {
            matrix: [[1.0, 0.0, 0.5], [0.0, 1.0, 0.25]], // tx=0.5, ty=0.25 (container-relative)
        };
        let image_size = (100.0, 50.0);
        let container_size = (200.0, 100.0);

        let matrix = calculate_raw_transform(&transform, image_size, container_size);

        // Identity base transform (2x scale) + translation (0.5, 0.25) scaled to container
        // Final: scale_x=2.0, scale_y=2.0, tx=0.5*200=100, ty=0.25*100=25
        assert_eq!(matrix[0], [2.0, 0.0, 100.0]);
        assert_eq!(matrix[1], [0.0, 2.0, 25.0]);
    }

    #[test]
    fn test_calculate_raw_transform_with_scale() {
        let transform = AffineTransform {
            matrix: [[2.0, 0.0, 0.0], [0.0, 0.5, 0.0]], // 2x scale in x, 0.5x scale in y
        };
        let image_size = (100.0, 50.0);
        let container_size = (200.0, 100.0);

        let matrix = calculate_raw_transform(&transform, image_size, container_size);

        // Base transform (2x scale) composed with user transform (2x, 0.5x)
        // Final: scale_x = 2.0 * 2.0 = 4.0, scale_y = 2.0 * 0.5 = 1.0
        assert_eq!(matrix[0], [4.0, 0.0, 0.0]);
        assert_eq!(matrix[1], [0.0, 1.0, 0.0]);
    }
}
