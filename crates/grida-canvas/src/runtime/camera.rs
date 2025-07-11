use crate::node::schema::Size;
use math2::{quantize, rect, rect::Rectangle, transform::AffineTransform, vector2};

/// A 2D camera that defines how world-space content is projected onto the screen.
///
/// The camera is defined by a transform and a logical viewport size. The transform represents
/// the camera's position, rotation, and zoom **in world space**, where the translation component
/// specifies the world-space point that should appear at the **center of the viewport**.
///
/// This model is commonly used in design tools and 2D canvas systems where zooming and panning
/// behavior is centered on the screen.
///
/// # Fields
/// - `transform`: The camera's transform in world space. Its translation corresponds to the
///    world coordinate that appears at the center of the screen.
/// - `size`: The logical size of the viewport in pixels (not affected by zoom).
///
/// This shifts the camera's center to the screen center and transforms the scene accordingly.
#[derive(Debug, Clone)]
pub struct Camera2D {
    /// The current transform.
    transform: AffineTransform,
    /// The previous transform.
    prev_transform: AffineTransform,
    /// The previous quantized camera transform.
    prev_quantized_camera_transform: Option<AffineTransform>,
    /// The logical size of the viewport in pixels (not affected by zoom)
    size: Size,
    /// Minimum allowed zoom value
    pub min_zoom: f32,
    /// Maximum allowed zoom value
    pub max_zoom: f32,

    /// The last time the camera was changed.
    pub t: std::time::Instant,
}

impl Camera2D {
    const POSITION_STEP_PX: f32 = 5.0;
    const ZOOM_STEP: f32 = 0.01;
    /// Default maximum zoom level
    pub const DEFAULT_MAX_ZOOM: f32 = 256.0;
    /// Default minimum zoom level
    pub const DEFAULT_MIN_ZOOM: f32 = 0.02;

    /// Create with identity transform + no zoom (1:1).
    /// Create with identity transform + no zoom (1:1) using default zoom limits.
    pub fn new(viewport_size: Size) -> Self {
        Self::new_with_zoom_constraints(
            viewport_size,
            Self::DEFAULT_MIN_ZOOM,
            Self::DEFAULT_MAX_ZOOM,
        )
    }

    pub fn new_from_bounds(bounds: Rectangle) -> Self {
        let dx = bounds.width / 2.0;
        let dy = bounds.height / 2.0;
        let transform = AffineTransform::new(bounds.x + dx, bounds.y + dy, 0.0);

        Camera2D {
            transform,
            size: Size {
                width: bounds.width,
                height: bounds.height,
            },
            min_zoom: f32::MIN,
            max_zoom: f32::MAX,
            t: std::time::Instant::now(),
            prev_transform: transform,
            prev_quantized_camera_transform: None,
        }
    }

    /// Create a camera specifying custom zoom limits.
    pub fn new_with_zoom_constraints(viewport_size: Size, min_zoom: f32, max_zoom: f32) -> Self {
        let transform = AffineTransform::identity();
        let mut c = Self {
            transform,
            prev_transform: transform,
            size: viewport_size,
            min_zoom,
            max_zoom,
            prev_quantized_camera_transform: None,
            t: std::time::Instant::now(),
        };
        c.set_zoom(1.0);
        c
    }

    fn before_change(&mut self) {
        self.prev_transform = self.transform.clone();
    }

    /// Sync the camera cache whenever the camera is changed.
    /// Returns true if the camera was changed.
    fn after_change(&mut self) -> bool {
        let quantized = self.quantized_transform();
        let changed = match self.prev_quantized_camera_transform {
            Some(prev) => prev != quantized,
            None => true,
        };
        if changed {
            self.prev_quantized_camera_transform = Some(quantized);

            self.t = std::time::Instant::now();
        }
        changed
    }

    /// Pan camera by (tx, ty) in world units.
    pub fn translate(&mut self, tx: f32, ty: f32) -> bool {
        self.before_change();
        self.transform.translate(tx, ty);
        self.after_change()
    }

    /// Jump camera center to (x, y) in world units.
    pub fn set_center(&mut self, x: f32, y: f32) -> bool {
        self.before_change();
        self.transform.set_translation(x, y);
        self.after_change()
    }

    fn _set_zoom(&mut self, zoom: f32) {
        let zoom = zoom.clamp(self.min_zoom, self.max_zoom);
        let tx = self.transform.x();
        let ty = self.transform.y();
        let (s, c) = self.transform.rotation().sin_cos();
        let scale = 1.0 / zoom;
        self.transform.matrix = [[c * scale, -s * scale, tx], [s * scale, c * scale, ty]];
    }

    /// Set zoom factor (1 = 100%). Preserves rotation & translation.
    pub fn set_zoom(&mut self, zoom: f32) -> bool {
        self.before_change();
        self._set_zoom(zoom);
        self.after_change()
    }

    /// Sets the zoom while keeping the given screen-space point fixed.
    pub fn set_zoom_at(&mut self, zoom: f32, screen_point: vector2::Vector2) -> bool {
        self.before_change();
        let before = self.screen_to_canvas_point(screen_point);
        self._set_zoom(zoom);
        let after = self.screen_to_canvas_point(screen_point);
        self.transform
            .translate(before[0] - after[0], before[1] - after[1]);
        self.after_change()
    }

    /// Get current zoom (1/scale).
    pub fn get_zoom(&self) -> f32 {
        1.0 / self.transform.get_scale_x()
    }

    /// Returns the camera transform quantized to the nearest visible pixel.
    pub fn quantized_transform(&self) -> AffineTransform {
        let zoom = self.get_zoom();
        let quant_zoom = quantize(zoom, Self::ZOOM_STEP);

        // translate world-space camera position into screen space using
        // the quantized zoom factor. This ensures snapping occurs in
        // pixel space regardless of the zoom level or rotation.
        let angle = self.transform.rotation();
        let (sin, cos) = angle.sin_cos();

        let tx = self.transform.x();
        let ty = self.transform.y();

        let screen_tx = self.size.width * 0.5 - quant_zoom * (cos * tx + sin * ty);
        let screen_ty = self.size.height * 0.5 + quant_zoom * (sin * tx - cos * ty);

        let quant_tx = quantize(screen_tx, Self::POSITION_STEP_PX);
        let quant_ty = quantize(screen_ty, Self::POSITION_STEP_PX);

        AffineTransform {
            matrix: [
                [cos * quant_zoom, -sin * quant_zoom, quant_tx],
                [sin * quant_zoom, cos * quant_zoom, quant_ty],
            ],
        }
    }

    /// View matrix = center-screen translation × inverse(world→camera).
    pub fn view_matrix(&self) -> AffineTransform {
        let inv = self
            .transform
            .clone()
            .inverse()
            .unwrap_or_else(AffineTransform::identity);
        let mut t = AffineTransform::identity();
        t.translate(self.size.width * 0.5, self.size.height * 0.5);
        t.compose(&inv)
    }

    pub fn get_size(&self) -> &Size {
        &self.size
    }

    pub fn set_size(&mut self, size: Size) {
        self.size = size;
        self.after_change();
    }

    /// World‐space rect currently visible.
    pub fn rect(&self) -> Rectangle {
        let vp = Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        };
        let inv = self
            .view_matrix()
            .inverse()
            .unwrap_or_else(AffineTransform::identity);
        rect::transform(vp, &inv)
    }

    /// Converts a screen-space point to canvas coordinates using the inverse view matrix.
    pub fn screen_to_canvas_point(&self, screen: vector2::Vector2) -> vector2::Vector2 {
        let inv = self
            .view_matrix()
            .inverse()
            .unwrap_or_else(AffineTransform::identity);
        vector2::transform(screen, &inv)
    }

    /// Get the current transform.
    pub fn get_transform(&self) -> &AffineTransform {
        &self.transform
    }

    /// Get the previous transform.
    pub fn get_prev_transform(&self) -> &AffineTransform {
        &self.prev_transform
    }

    /// Check if the transform has changed since the last update.
    pub fn has_transform_changed(&self) -> bool {
        self.transform != self.prev_transform
    }

    pub fn has_zoom_changed(&self) -> bool {
        self.get_zoom() != 1.0 / self.prev_transform.get_scale_x()
    }

    /// Set the transform directly. This will update the previous transform.
    pub fn set_transform(&mut self, transform: AffineTransform) -> bool {
        self.before_change();
        self.transform = transform;
        self.after_change()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::schema::Size;

    #[test]
    fn test_prev_transform_functionality() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        // Initially, prev_transform should be the same as current transform
        assert_eq!(camera.get_transform(), camera.get_prev_transform());
        assert!(!camera.has_transform_changed());

        // After translation, prev_transform should hold the old value
        let original_transform = camera.get_transform().clone();
        camera.translate(10.0, 20.0);

        assert_eq!(camera.get_prev_transform(), &original_transform);
        assert_ne!(camera.get_transform(), camera.get_prev_transform());
        assert!(camera.has_transform_changed());

        // After another change, prev_transform should be updated
        let second_transform = camera.get_transform().clone();
        camera.set_zoom(2.0);

        assert_eq!(camera.get_prev_transform(), &second_transform);
        assert_ne!(camera.get_transform(), camera.get_prev_transform());
        assert!(camera.has_transform_changed());
    }

    #[test]
    fn test_set_transform_updates_prev_transform() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        let original_transform = camera.get_transform().clone();
        let new_transform = AffineTransform::new(50.0, 50.0, 0.0);

        camera.set_transform(new_transform.clone());

        assert_eq!(camera.get_prev_transform(), &original_transform);
        assert_eq!(camera.get_transform(), &new_transform);
        assert!(camera.has_transform_changed());
    }
}
