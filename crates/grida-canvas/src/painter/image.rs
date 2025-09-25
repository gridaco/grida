use super::image_filters;
use crate::{cg::types::*, sk};
use math2::transform::AffineTransform;
use skia_safe::{self, shaders, Color, SamplingOptions, Shader, TileMode};

fn tile_modes_for_repeat(repeat: ImageRepeat) -> (TileMode, TileMode) {
    match repeat {
        ImageRepeat::NoRepeat => (TileMode::Decal, TileMode::Decal),
        ImageRepeat::RepeatX => (TileMode::Repeat, TileMode::Decal),
        ImageRepeat::RepeatY => (TileMode::Decal, TileMode::Repeat),
        ImageRepeat::Repeat => (TileMode::Repeat, TileMode::Repeat),
    }
}

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
    let tile_modes = tile_modes_for_repeat(img.repeat);
    let mut shader = image.to_shader(Some(tile_modes), sampling, Some(&matrix))?;

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
    let scale = sanitize_scale(paint.scale);
    let quarter_turns = paint.quarter_turns % 4;
    let oriented_image_size = oriented_image_size(quarter_turns, image_size);

    let matrix = match &paint.fit {
        ImagePaintFit::Fit(box_fit) => {
            let matrix = box_fit
                .calculate_transform(oriented_image_size, container_size)
                .matrix;
            apply_scale_for_fit(matrix, scale, oriented_image_size, container_size)
        }
        // For custom transforms, we handle the complete image-to-container mapping
        // directly without composing with BoxFit::Fill, which would create double transformation.
        ImagePaintFit::Transform(transform) => {
            let mut matrix =
                calculate_raw_transform(transform, oriented_image_size, container_size);
            if (scale - 1.0).abs() > f32::EPSILON {
                apply_scale_about_origin(&mut matrix, scale);
            }
            matrix
        }
    };

    let rotation = quarter_turn_matrix(quarter_turns, image_size);
    multiply_affine(matrix, rotation)
}

fn sanitize_scale(scale: f32) -> f32 {
    if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    }
}

fn apply_scale_about_origin(matrix: &mut [[f32; 3]; 2], scale: f32) {
    matrix[0][0] *= scale;
    matrix[0][1] *= scale;
    matrix[1][0] *= scale;
    matrix[1][1] *= scale;
}

fn apply_scale_for_fit(
    mut matrix: [[f32; 3]; 2],
    scale: f32,
    image_size: (f32, f32),
    container_size: (f32, f32),
) -> [[f32; 3]; 2] {
    if (scale - 1.0).abs() <= f32::EPSILON {
        return matrix;
    }

    apply_scale_about_origin(&mut matrix, scale);

    let scaled_width = image_size.0 * matrix[0][0];
    let scaled_height = image_size.1 * matrix[1][1];

    if container_size.0.is_finite() {
        matrix[0][2] = (container_size.0 - scaled_width) / 2.0;
    }

    if container_size.1.is_finite() {
        matrix[1][2] = (container_size.1 - scaled_height) / 2.0;
    }

    matrix
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

fn oriented_image_size(quarter_turns: u8, image_size: (f32, f32)) -> (f32, f32) {
    if quarter_turns % 2 == 1 {
        (image_size.1, image_size.0)
    } else {
        image_size
    }
}

fn quarter_turn_matrix(quarter_turns: u8, image_size: (f32, f32)) -> [[f32; 3]; 2] {
    let (width, height) = image_size;
    match quarter_turns % 4 {
        0 => [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        1 => [[0.0, -1.0, height], [1.0, 0.0, 0.0]],
        2 => [[-1.0, 0.0, width], [0.0, -1.0, height]],
        3 => [[0.0, 1.0, 0.0], [-1.0, 0.0, width]],
        _ => unreachable!("quarter turns already normalized"),
    }
}

fn multiply_affine(a: [[f32; 3]; 2], b: [[f32; 3]; 2]) -> [[f32; 3]; 2] {
    [
        [
            a[0][0] * b[0][0] + a[0][1] * b[1][0],
            a[0][0] * b[0][1] + a[0][1] * b[1][1],
            a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2],
        ],
        [
            a[1][0] * b[0][0] + a[1][1] * b[1][0],
            a[1][0] * b[0][1] + a[1][1] * b[1][1],
            a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2],
        ],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use math2::box_fit::BoxFit;
    use math2::transform::AffineTransform;

    fn base_paint(fit: ImagePaintFit, quarter_turns: u8) -> ImagePaint {
        ImagePaint {
            active: true,
            image: ResourceRef::RID(String::new()),
            quarter_turns,
            fit,
            repeat: ImageRepeat::NoRepeat,
            scale: 1.0,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            filters: ImageFilters::default(),
        }
    }

    fn assert_row_eq(actual: [f32; 3], expected: [f32; 3]) {
        for (idx, (a, e)) in actual.iter().zip(expected.iter()).enumerate() {
            assert!(
                (a - e).abs() < 1e-5,
                "row component {} expected {:?} got {:?}",
                idx,
                expected,
                actual
            );
        }
    }

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

    #[test]
    fn test_image_paint_matrix_scale_fit_centers() {
        let mut paint = base_paint(ImagePaintFit::Fit(BoxFit::Contain), 0);
        paint.scale = 2.0;

        let matrix = image_paint_matrix(&paint, (100.0, 100.0), (200.0, 200.0));

        assert!((matrix[0][0] - 4.0).abs() < 1e-6);
        assert!((matrix[1][1] - 4.0).abs() < 1e-6);
        let expected_translation = (200.0 - 100.0 * 4.0) / 2.0;
        assert!((matrix[0][2] - expected_translation).abs() < 1e-6);
        assert!((matrix[1][2] - expected_translation).abs() < 1e-6);
    }

    #[test]
    fn test_image_paint_matrix_scale_transform_origin() {
        let mut paint = base_paint(ImagePaintFit::Transform(AffineTransform::identity()), 0);
        paint.scale = 0.5;

        let matrix = image_paint_matrix(&paint, (100.0, 100.0), (200.0, 200.0));

        assert!((matrix[0][0] - 1.0).abs() < 1e-6);
        assert!((matrix[1][1] - 1.0).abs() < 1e-6);
        assert!((matrix[0][2]).abs() < 1e-6);
        assert!((matrix[1][2]).abs() < 1e-6);
    }

    #[test]
    fn image_paint_matrix_applies_quarter_turn_clockwise() {
        let paint = base_paint(ImagePaintFit::Fit(BoxFit::Contain), 1);
        let matrix = image_paint_matrix(&paint, (100.0, 50.0), (100.0, 100.0));
        assert_row_eq(matrix[0], [0.0, -1.0, 75.0]);
        assert_row_eq(matrix[1], [1.0, 0.0, 0.0]);
    }

    #[test]
    fn image_paint_matrix_applies_quarter_turn_counter_clockwise() {
        let paint = base_paint(ImagePaintFit::Fit(BoxFit::Contain), 3);
        let matrix = image_paint_matrix(&paint, (120.0, 60.0), (180.0, 180.0));
        assert_row_eq(matrix[0], [0.0, 1.5, 45.0]);
        assert_row_eq(matrix[1], [-1.5, 0.0, 180.0]);
    }
}
