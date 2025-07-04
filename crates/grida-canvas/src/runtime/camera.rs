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
    pub transform: AffineTransform,
    pub size: Size,
    /// Minimum allowed zoom value
    pub min_zoom: f32,
    /// Maximum allowed zoom value
    pub max_zoom: f32,
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
        Self::with_zoom_limits(
            viewport_size,
            Self::DEFAULT_MIN_ZOOM,
            Self::DEFAULT_MAX_ZOOM,
        )
    }

    /// Create a camera specifying custom zoom limits.
    pub fn with_zoom_limits(viewport_size: Size, min_zoom: f32, max_zoom: f32) -> Self {
        let mut c = Self {
            transform: AffineTransform::identity(),
            size: viewport_size,
            min_zoom,
            max_zoom,
        };
        c.set_zoom(1.0);
        c
    }

    /// Pan camera by (tx, ty) in world units.
    pub fn translate(&mut self, tx: f32, ty: f32) {
        self.transform.translate(tx, ty);
    }

    /// Jump camera center to (x, y) in world units.
    pub fn set_position(&mut self, x: f32, y: f32) {
        self.transform.set_translation(x, y);
    }

    /// Set zoom factor (1 = 100%). Preserves rotation & translation.
    pub fn set_zoom(&mut self, zoom: f32) {
        let zoom = zoom.clamp(self.min_zoom, self.max_zoom);
        let tx = self.transform.x();
        let ty = self.transform.y();
        let (s, c) = self.transform.rotation().sin_cos();
        let scale = 1.0 / zoom;
        self.transform.matrix = [[c * scale, -s * scale, tx], [s * scale, c * scale, ty]];
    }

    /// Sets the zoom while keeping the given screen-space point fixed.
    pub fn set_zoom_at(&mut self, zoom: f32, screen_point: vector2::Vector2) {
        let before = self.screen_to_canvas_point(screen_point);
        self.set_zoom(zoom);
        let after = self.screen_to_canvas_point(screen_point);
        self.translate(before[0] - after[0], before[1] - after[1]);
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
}
