use crate::schema::Size;
use grida_cmath::transform::AffineTransform;

/// A camera that defines the view transformation for rendering.
/// The camera's transform is inverse-applied to create the view matrix.
#[derive(Debug, Clone)]
pub struct Camera {
    /// The camera's transform in world space
    pub transform: AffineTransform,

    /// The viewport size in pixels
    pub viewport_size: Size,

    /// The zoom level (1.0 = 100%)
    pub zoom: f32,
}

impl Camera {
    pub fn new(viewport_size: Size) -> Self {
        Self {
            transform: AffineTransform::identity(),
            viewport_size,
            zoom: 1.0,
        }
    }

    /// Creates a view matrix by inverse-applying the camera's transform
    pub fn view_matrix(&self) -> AffineTransform {
        let mut view = self.transform;
        view.inverse();
        view
    }

    /// Sets the camera's position
    pub fn set_position(&mut self, x: f32, y: f32) {
        self.transform.set_translation(x, y);
    }

    /// Sets the camera's rotation in radians
    pub fn set_rotation(&mut self, angle: f32) {
        self.transform.set_rotation(angle);
    }

    /// Sets the camera's zoom level
    pub fn set_zoom(&mut self, zoom: f32) {
        self.zoom = zoom;
    }
}
