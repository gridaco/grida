use crate::node::schema::Size;
use crate::rect::{self, Rect};
use math2::{quantize, transform::AffineTransform};

/// A camera that defines the view transformation for rendering.
/// The camera's transform is inverse-applied to create the view matrix.
#[derive(Debug, Clone)]
pub struct Camera2D {
    /// The camera's transform in world space
    pub transform: AffineTransform,

    /// The viewport size
    pub size: Size,
}

impl Camera2D {
    /// Quantization step for camera position in physical pixels.
    const POSITION_STEP_PX: f32 = 5.0;
    /// Quantization step for zoom factor.
    const ZOOM_STEP: f32 = 0.01;
    pub fn new(viewport_size: Size) -> Self {
        let mut camera = Self {
            transform: AffineTransform::identity(),
            size: viewport_size,
        };
        camera.set_zoom(1.0);
        camera
    }

    /// Creates a view matrix by inverse-applying the camera's transform
    pub fn view_matrix(&self) -> AffineTransform {
        self.transform
            .inverse()
            .unwrap_or_else(AffineTransform::identity)
    }

    /// Sets the camera's position
    pub fn set_position(&mut self, x: f32, y: f32) {
        self.transform.set_translation(x, y);
    }

    /// Sets the camera's rotation in radians
    pub fn set_rotation(&mut self, angle: f32) {
        let zoom = self.get_zoom();
        let tx = self.transform.x();
        let ty = self.transform.y();
        let (sin, cos) = angle.sin_cos();
        self.transform.matrix[0][0] = cos * zoom;
        self.transform.matrix[0][1] = -sin * zoom;
        self.transform.matrix[1][0] = sin * zoom;
        self.transform.matrix[1][1] = cos * zoom;
        self.transform.matrix[0][2] = tx;
        self.transform.matrix[1][2] = ty;
    }

    /// Sets the camera's zoom level
    pub fn set_zoom(&mut self, zoom: f32) {
        let angle = self.transform.rotation();
        let tx = self.transform.x();
        let ty = self.transform.y();
        let (sin, cos) = angle.sin_cos();
        self.transform.matrix[0][0] = cos * zoom;
        self.transform.matrix[0][1] = -sin * zoom;
        self.transform.matrix[1][0] = sin * zoom;
        self.transform.matrix[1][1] = cos * zoom;
        self.transform.matrix[0][2] = tx;
        self.transform.matrix[1][2] = ty;
    }

    pub fn get_zoom(&self) -> f32 {
        let a = self.transform.matrix[0][0];
        let b = self.transform.matrix[1][0];
        (a.powi(2) + b.powi(2)).sqrt()
    }

    /// Returns the camera transform quantized to the nearest visible pixel.
    pub fn quantized_transform(&self) -> AffineTransform {
        let zoom = self.get_zoom();
        let pos_step = Self::POSITION_STEP_PX * zoom;
        let tx = quantize(self.transform.x(), pos_step);
        let ty = quantize(self.transform.y(), pos_step);

        let quant_zoom = quantize(zoom, Self::ZOOM_STEP);
        let angle = self.transform.rotation();
        let (sin, cos) = angle.sin_cos();

        AffineTransform {
            matrix: [
                [cos * quant_zoom, -sin * quant_zoom, tx],
                [sin * quant_zoom, cos * quant_zoom, ty],
            ],
        }
    }

    /// Returns the visible area in world space
    pub fn rect(&self) -> Rect {
        // Start with viewport in screen space
        let viewport = Rect {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        };

        // Apply inverse zoom encoded in transform

        // Apply inverse transform to get world space rect
        if let Some(inv) = self.transform.inverse() {
            rect::transform(viewport, &inv)
        } else {
            viewport
        }
    }
}
