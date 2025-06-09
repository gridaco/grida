use crate::rect::Rect;
use crate::schema::Size;
use grida_cmath::transform::AffineTransform;

/// A camera that defines the view transformation for rendering.
/// The camera's transform is inverse-applied to create the view matrix.
#[derive(Debug, Clone)]
pub struct Camera2D {
    /// The camera's transform in world space
    pub transform: AffineTransform,

    /// The viewport size
    pub size: Size,

    /// The zoom level (1.0 = 100%)
    pub zoom: f32,
}

impl Camera2D {
    pub fn new(viewport_size: Size) -> Self {
        Self {
            transform: AffineTransform::identity(),
            size: viewport_size,
            zoom: 1.0,
        }
    }

    /// Creates a view matrix by inverse-applying the camera's transform
    pub fn view_matrix(&self) -> AffineTransform {
        let view = self.transform;
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

    /// Returns the visible area in world space
    pub fn rect(&self) -> Rect {
        // Start with viewport in screen space
        let mut viewport = Rect::new(0.0, 0.0, self.size.width, self.size.height);

        // Apply inverse zoom
        viewport = Rect::new(
            viewport.min_x / self.zoom,
            viewport.min_y / self.zoom,
            viewport.max_x / self.zoom,
            viewport.max_y / self.zoom,
        );

        // Apply inverse transform to get world space rect
        if let Some(inv) = self.transform.inverse() {
            let [[a, c, tx], [b, d, ty]] = inv.matrix;
            let transform_point = |x: f32, y: f32| -> (f32, f32) {
                let nx = a * x + c * y + tx;
                let ny = b * x + d * y + ty;
                (nx, ny)
            };

            let (x0, y0) = transform_point(viewport.min_x, viewport.min_y);
            let (x1, y1) = transform_point(viewport.max_x, viewport.min_y);
            let (x2, y2) = transform_point(viewport.min_x, viewport.max_y);
            let (x3, y3) = transform_point(viewport.max_x, viewport.max_y);

            Rect {
                min_x: x0.min(x1.min(x2.min(x3))),
                min_y: y0.min(y1.min(y2.min(y3))),
                max_x: x0.max(x1.max(x2.max(x3))),
                max_y: y0.max(y1.max(y2.max(y3))),
            }
        } else {
            viewport
        }
    }
}
