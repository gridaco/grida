use crate::transform::AffineTransform;

/// Supported fit modes.
///
/// `Contain`, `Cover`, `Fill`, and `None` match the behavior of
/// [`object-fit`](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit)
/// in CSS.
///
/// - `None` may have unexpected results depending on the environment.
///
/// @see https://api.flutter.dev/flutter/painting/BoxFit.html  
/// @see https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoxFit {
    Contain,
    Cover,
    /// Scale the content to fill the container without preserving aspect ratio.
    Fill,
    None,
}

impl BoxFit {
    /// Calculates the transform needed to fit content of size `content_size` into a container of size `container_size`
    /// according to the specified fit mode.
    pub fn calculate_transform(
        &self,
        content_size: (f32, f32),
        container_size: (f32, f32),
    ) -> AffineTransform {
        let (content_width, content_height) = content_size;
        let (container_width, container_height) = container_size;

        // Determine scale factors
        let (scale_x, scale_y) = match self {
            BoxFit::None => (1.0, 1.0),
            BoxFit::Contain => {
                let scale =
                    (container_width / content_width).min(container_height / content_height);
                (scale, scale)
            }
            BoxFit::Cover => {
                let scale =
                    (container_width / content_width).max(container_height / content_height);
                (scale, scale)
            }
            BoxFit::Fill => (
                container_width / content_width,
                container_height / content_height,
            ),
        };

        // Compute scaled dimensions
        let scaled_width = content_width * scale_x;
        let scaled_height = content_height * scale_y;

        // Center content in container
        let tx = (container_width - scaled_width) / 2.0;
        let ty = (container_height - scaled_height) / 2.0;

        AffineTransform {
            matrix: [[scale_x, 0.0, tx], [0.0, scale_y, ty]],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_box_fit_none() {
        let t = BoxFit::None.calculate_transform((100.0, 100.0), (200.0, 200.0));
        assert_eq!(t.matrix[0][2], 50.0);
        assert_eq!(t.matrix[1][2], 50.0);
        assert_eq!(t.matrix[0][0], 1.0);
        assert_eq!(t.matrix[1][1], 1.0);
    }

    #[test]
    fn test_box_fit_contain() {
        let t = BoxFit::Contain.calculate_transform((100.0, 100.0), (200.0, 200.0));
        // Scaled to 200x200, so centered at (0,0)
        assert_eq!(t.matrix[0][2], 0.0);
        assert_eq!(t.matrix[1][2], 0.0);
        assert_eq!(t.matrix[0][0], 2.0);
        assert_eq!(t.matrix[1][1], 2.0);
    }

    #[test]
    fn test_box_fit_cover() {
        let t = BoxFit::Cover.calculate_transform((100.0, 100.0), (200.0, 200.0));
        // Scaled to 200x200, so no translation
        assert_eq!(t.matrix[0][2], 0.0);
        assert_eq!(t.matrix[1][2], 0.0);
        assert_eq!(t.matrix[0][0], 2.0);
        assert_eq!(t.matrix[1][1], 2.0);
    }

    #[test]
    fn test_box_fit_contain_aspect_ratio() {
        let t = BoxFit::Contain.calculate_transform((100.0, 200.0), (200.0, 200.0));
        assert_eq!(t.matrix[0][2], 50.0);
        assert_eq!(t.matrix[1][2], 0.0);
        assert_eq!(t.matrix[0][0], 1.0);
        assert_eq!(t.matrix[1][1], 1.0);
    }

    #[test]
    fn test_box_fit_cover_aspect_ratio() {
        let t = BoxFit::Cover.calculate_transform((100.0, 200.0), (200.0, 200.0));
        assert_eq!(t.matrix[0][2], 0.0);
        assert_eq!(t.matrix[1][2], -100.0);
        assert_eq!(t.matrix[0][0], 2.0);
        assert_eq!(t.matrix[1][1], 2.0);
    }

    #[test]
    fn test_box_fit_fill() {
        let t = BoxFit::Fill.calculate_transform((100.0, 50.0), (200.0, 200.0));
        assert_eq!(t.matrix[0][0], 2.0);
        assert_eq!(t.matrix[1][1], 4.0);
        assert_eq!(t.matrix[0][2], 0.0);
        assert_eq!(t.matrix[1][2], 0.0);
    }
}
