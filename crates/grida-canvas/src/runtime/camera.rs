use crate::node::schema::Size;
use math2::{quantize, rect::Rectangle, transform::AffineTransform, vector2};

/// Classifies what changed between two consecutive camera states.
///
/// This classification enables downstream rendering stages to take the cheapest
/// path for each frame. In particular, `PanOnly` unlocks a class of
/// optimizations that are impossible when scale is also changing: cached rasters
/// remain pixel-perfect, tile grids stay stable, and LOD/mipmap recomputation
/// can be skipped entirely.
///
/// Computed once per frame via [`Camera2D::change_kind`] and threaded through
/// the rendering pipeline so every stage can branch on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CameraChangeKind {
    /// No camera change occurred between frames.
    None,
    /// Only translation changed; zoom (scale) remained constant.
    /// This is the most common interaction (hand-tool drag, scroll-wheel pan).
    PanOnly,
    /// Zoom increased (viewport shrinks into existing content).
    /// Cached content is a spatial superset — only pixel density changed.
    /// The cheapest zoom path: no new content discovery needed.
    ZoomIn,
    /// Zoom decreased (viewport expands, new content appears at edges).
    /// Some newly visible nodes may lack cache entries entirely.
    ZoomOut,
    /// Both translation and zoom changed (e.g. pinch gesture, scroll-wheel
    /// zoom at cursor which adjusts translation to keep the focal point fixed).
    /// The boolean indicates zoom direction: `true` = zoom-in, `false` = zoom-out.
    PanAndZoom(bool),
}

impl CameraChangeKind {
    /// Returns `true` when zoom (scale) changed between frames.
    #[inline]
    pub fn zoom_changed(self) -> bool {
        matches!(self, Self::ZoomIn | Self::ZoomOut | Self::PanAndZoom(_))
    }

    /// Returns `true` when translation changed between frames.
    #[inline]
    pub fn pan_changed(self) -> bool {
        matches!(self, Self::PanOnly | Self::PanAndZoom(_))
    }

    /// Returns `true` when any camera property changed.
    #[inline]
    pub fn any_changed(self) -> bool {
        !matches!(self, Self::None)
    }

    /// Short human-readable label for debug overlays and stats strings.
    #[inline]
    pub fn label(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::PanOnly => "pan",
            Self::ZoomIn => "zoom-in",
            Self::ZoomOut => "zoom-out",
            Self::PanAndZoom(true) => "pan+zoom-in",
            Self::PanAndZoom(false) => "pan+zoom-out",
        }
    }
}

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

    /// The last time the camera was changed (host-time, milliseconds).
    /// Uses `f64` instead of `std::time::Instant` to work correctly on
    /// WASM where inter-frame scheduling must use host-provided time.
    pub t: f64,

    // ── Cached derived values ──────────────────────────────────────
    // Avoids recomputing sqrt, inverse, atan2, sin_cos on every call.
    // Invalidated automatically whenever the transform changes.
    /// Cached zoom value (= 1 / scale_x). Updated on every zoom mutation.
    /// Eliminates the `sqrt(a² + b²)` in `get_scale_x()` on every access.
    cached_zoom: f32,

    /// Cached view matrix. Invalidated on any transform or size change.
    /// Eliminates repeated `inverse()` + `compose()` per frame.
    cached_view_matrix: Option<AffineTransform>,

    /// Cached inverse of the view matrix (= world_from_screen transform).
    /// Computed alongside `cached_view_matrix`.
    cached_view_matrix_inv: Option<AffineTransform>,
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
            t: 0.0,
            prev_transform: transform,
            prev_quantized_camera_transform: None,
            cached_zoom: 1.0,
            cached_view_matrix: None,
            cached_view_matrix_inv: None,
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
            t: 0.0,
            cached_zoom: 1.0,
            cached_view_matrix: None,
            cached_view_matrix_inv: None,
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
        // Invalidate cached derived values.
        self.cached_view_matrix = None;
        self.cached_view_matrix_inv = None;

        let quantized = self.quantized_transform();
        let changed = match self.prev_quantized_camera_transform {
            Some(prev) => prev != quantized,
            None => true,
        };
        if changed {
            self.prev_quantized_camera_transform = Some(quantized);
            // Note: `t` is no longer set here. The application should call
            // `camera.set_time(clock.now())` after mutating the camera, so
            // that inter-frame scheduling uses host-provided time (required
            // for correct WASM behavior).
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
        // Extract sin/cos directly from the matrix elements rather than going
        // through atan2 → sin_cos. The current matrix is [[c*s, -s*s, tx], [s*s, c*s, ty]]
        // where s = old_scale. We normalize by old_scale to recover (cos, sin).
        let old_scale = 1.0 / self.cached_zoom;
        let (sin, cos) = if old_scale > f32::EPSILON {
            let inv_scale = 1.0 / old_scale;
            (
                self.transform.matrix[1][0] * inv_scale,
                self.transform.matrix[0][0] * inv_scale,
            )
        } else {
            // Fallback: degenerate scale, use atan2
            self.transform.rotation().sin_cos()
        };
        let scale = 1.0 / zoom;
        self.transform.matrix = [
            [cos * scale, -sin * scale, tx],
            [sin * scale, cos * scale, ty],
        ];
        self.cached_zoom = zoom;
        // Invalidate cached inverse so callers (e.g. set_zoom_at →
        // screen_to_canvas_point) compute a fresh projection from the
        // updated transform rather than using a stale cached value.
        self.cached_view_matrix_inv = None;
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
    ///
    /// Returns the cached zoom value, avoiding the `sqrt(a² + b²)` that
    /// `get_scale_x()` would require on every call.
    #[inline]
    pub fn get_zoom(&self) -> f32 {
        self.cached_zoom
    }

    /// Returns the camera transform quantized to the nearest visible pixel.
    pub fn quantized_transform(&self) -> AffineTransform {
        let zoom = self.cached_zoom;
        let quant_zoom = quantize(zoom, Self::ZOOM_STEP);

        // Extract cos/sin directly from the matrix rather than going through
        // atan2 → sin_cos. The matrix stores [[cos*scale, -sin*scale, ...], [sin*scale, cos*scale, ...]]
        // where scale = 1/zoom.
        let scale = 1.0 / zoom;
        let (sin, cos) = if scale > f32::EPSILON {
            let inv_scale = 1.0 / scale;
            (
                self.transform.matrix[1][0] * inv_scale,
                self.transform.matrix[0][0] * inv_scale,
            )
        } else {
            (0.0, 1.0)
        };

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
    ///
    /// Result is cached and reused until the next camera mutation.
    #[inline]
    pub fn view_matrix(&self) -> AffineTransform {
        if let Some(cached) = self.cached_view_matrix {
            return cached;
        }
        self.compute_view_matrix()
    }

    /// Compute the view matrix without consulting the cache.
    fn compute_view_matrix(&self) -> AffineTransform {
        // For a camera transform [[a,c,tx],[b,d,ty]], the inverse is:
        //   det = a*d - b*c
        //   [[d/det, -c/det, -(d*tx - c*ty)/det],
        //    [-b/det, a/det, (b*tx - a*ty)/det]]
        // Then compose with translate(w/2, h/2).
        //
        // We inline the inverse + compose to avoid intermediate allocations
        // and reduce FLOPs.
        let [[a, c, tx], [b, d, ty]] = self.transform.matrix;
        let det = a * d - b * c;
        if det.abs() < f32::EPSILON {
            return AffineTransform::identity();
        }
        let inv_det = 1.0 / det;
        let ai = d * inv_det;
        let bi = -b * inv_det;
        let ci = -c * inv_det;
        let di = a * inv_det;
        let txi = -(ai * tx + ci * ty);
        let tyi = -(bi * tx + di * ty);

        let hw = self.size.width * 0.5;
        let hh = self.size.height * 0.5;

        // compose: translate(hw, hh) × inverse
        // Result translation = hw + txi, hh + tyi
        // (translate only affects tx/ty columns)
        AffineTransform {
            matrix: [[ai, ci, hw + txi], [bi, di, hh + tyi]],
        }
    }

    /// Set the host-time timestamp (ms) for this camera change.
    /// Should be called by the application after mutating the camera.
    pub fn set_time(&mut self, now: f64) {
        self.t = now;
    }

    pub fn get_size(&self) -> &Size {
        &self.size
    }

    pub fn set_size(&mut self, size: Size) {
        self.size = size;
        self.after_change();
    }

    /// Populate the view-matrix cache so subsequent calls to `view_matrix()`,
    /// `rect()`, and `screen_to_canvas_point()` within this frame are free.
    ///
    /// Call once at the start of each frame (before `draw()` / `frame()`).
    pub fn warm_cache(&mut self) {
        if self.cached_view_matrix.is_none() {
            let vm = self.compute_view_matrix();
            self.cached_view_matrix = Some(vm);
            self.cached_view_matrix_inv = vm.inverse();
        }
    }

    /// World‐space rect currently visible.
    ///
    /// Computes the visible rectangle directly from the camera transform,
    /// avoiding the double matrix inversion that the old implementation
    /// performed (`view_matrix()` → `inverse()` → transform 4 corners).
    ///
    /// The inverse of `view_matrix()` is simply
    /// `camera_transform × translate(-w/2, -h/2)`, which we compute inline.
    pub fn rect(&self) -> Rectangle {
        // inverse(view_matrix) = transform × translate(-hw, -hh)
        // For point (sx, sy) in screen space:
        //   wx = a*(sx - hw) + c*(sy - hh) + tx
        //   wy = b*(sx - hw) + d*(sy - hh) + ty
        let [[a, c, tx], [b, d, ty]] = self.transform.matrix;
        let hw = self.size.width * 0.5;
        let hh = self.size.height * 0.5;

        // Transform viewport corners (0,0), (w,0), (0,h), (w,h)
        let cx0 = 0.0 - hw; // = -hw
        let cy0 = 0.0 - hh; // = -hh
        let cx1 = self.size.width - hw; // = hw
        let cy1 = self.size.height - hh; // = hh

        // Top-left: (cx0, cy0)
        let x0 = a * cx0 + c * cy0 + tx;
        let y0 = b * cx0 + d * cy0 + ty;
        // Top-right: (cx1, cy0)
        let x1 = a * cx1 + c * cy0 + tx;
        let y1 = b * cx1 + d * cy0 + ty;
        // Bottom-left: (cx0, cy1)
        let x2 = a * cx0 + c * cy1 + tx;
        let y2 = b * cx0 + d * cy1 + ty;
        // Bottom-right: (cx1, cy1)
        let x3 = a * cx1 + c * cy1 + tx;
        let y3 = b * cx1 + d * cy1 + ty;

        let min_x = x0.min(x1).min(x2).min(x3);
        let min_y = y0.min(y1).min(y2).min(y3);
        let max_x = x0.max(x1).max(x2).max(x3);
        let max_y = y0.max(y1).max(y2).max(y3);

        Rectangle {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        }
    }

    /// Converts a screen-space point to canvas coordinates using the inverse view matrix.
    ///
    /// Uses the cached inverse when available, otherwise computes inline from
    /// the camera transform (avoiding a full `view_matrix()` + `inverse()` pair).
    pub fn screen_to_canvas_point(&self, screen: vector2::Vector2) -> vector2::Vector2 {
        if let Some(ref inv) = self.cached_view_matrix_inv {
            return vector2::transform(screen, inv);
        }
        // Inline: inverse(view_matrix) applied to a single point.
        // inverse(view_matrix) = transform × translate(-hw, -hh)
        let [[a, c, tx], [b, d, ty]] = self.transform.matrix;
        let hw = self.size.width * 0.5;
        let hh = self.size.height * 0.5;
        let sx = screen[0] - hw;
        let sy = screen[1] - hh;
        [a * sx + c * sy + tx, b * sx + d * sy + ty]
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
        // Compare scale components of prev and current transforms directly.
        // translate() only modifies [0][2] and [1][2], so the scale entries
        // ([0][0], [0][1], [1][0], [1][1]) are bitwise identical after a
        // pan-only change.
        //
        // Previous implementation compared prev matrix scale against
        // cached_zoom, which diverged after repeated _set_zoom calls due
        // to floating-point drift in the sin/cos extraction (cos²+sin² ≠ 1).
        let prev_a = self.prev_transform.matrix[0][0];
        let prev_b = self.prev_transform.matrix[1][0];
        let cur_a = self.transform.matrix[0][0];
        let cur_b = self.transform.matrix[1][0];
        prev_a != cur_a || prev_b != cur_b
    }

    /// Returns `true` when translation changed between the current and previous
    /// transform (i.e. the camera panned).
    pub fn has_pan_changed(&self) -> bool {
        let (cx, cy) = (self.transform.x(), self.transform.y());
        let (px, py) = (self.prev_transform.x(), self.prev_transform.y());
        cx != px || cy != py
    }

    /// Consume the pending camera change, resetting `prev_transform` to match
    /// the current `transform`. After this call, [`change_kind`](Self::change_kind)
    /// will return [`CameraChangeKind::None`] until the next mutation.
    ///
    /// This must be called once per frame **after** the change has been
    /// processed (plan built, compositor invalidated, etc.) so that subsequent
    /// frames don't see stale deltas.
    pub fn consume_change(&mut self) {
        self.prev_transform = self.transform.clone();
    }

    /// Classify the camera change that occurred between `prev_transform` and
    /// the current `transform`.
    ///
    /// This is the primary mechanism for enabling pan-only optimizations
    /// throughout the rendering pipeline. Call once per frame, then thread the
    /// result through `frame()`, `flush()`, and `draw()`.
    pub fn change_kind(&self) -> CameraChangeKind {
        let zoom_changed = self.has_zoom_changed();
        let pan_changed = self.has_pan_changed();

        match (pan_changed, zoom_changed) {
            (false, false) => CameraChangeKind::None,
            (true, false) => CameraChangeKind::PanOnly,
            (false, true) | (true, true) => {
                let current_zoom = self.get_zoom();
                let prev_zoom = 1.0 / self.prev_transform.get_scale_x();
                let zooming_in = current_zoom > prev_zoom;
                if pan_changed {
                    CameraChangeKind::PanAndZoom(zooming_in)
                } else if zooming_in {
                    CameraChangeKind::ZoomIn
                } else {
                    CameraChangeKind::ZoomOut
                }
            }
        }
    }

    /// Returns the world-space pan delta between the current and previous
    /// camera position. Useful for computing exposed strips during blit-scroll
    /// and for overlay fast-path translation.
    pub fn pan_delta(&self) -> (f32, f32) {
        (
            self.transform.x() - self.prev_transform.x(),
            self.transform.y() - self.prev_transform.y(),
        )
    }

    /// Set the transform directly. This will update the previous transform.
    pub fn set_transform(&mut self, transform: AffineTransform) -> bool {
        self.before_change();
        self.transform = transform;
        // Recompute cached zoom from the new transform's scale.
        self.cached_zoom = 1.0 / self.transform.get_scale_x();
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

    #[test]
    fn test_change_kind_none() {
        let camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });
        // No change has occurred.
        assert_eq!(camera.change_kind(), CameraChangeKind::None);
    }

    #[test]
    fn test_change_kind_pan_only() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });
        camera.translate(10.0, 20.0);
        assert_eq!(camera.change_kind(), CameraChangeKind::PanOnly);
        assert!(camera.change_kind().pan_changed());
        assert!(!camera.change_kind().zoom_changed());
    }

    #[test]
    fn test_change_kind_zoom_in() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });
        camera.set_zoom(2.0);
        // set_zoom preserves translation; zoom increased → ZoomIn.
        assert_eq!(camera.change_kind(), CameraChangeKind::ZoomIn);
        assert!(!camera.change_kind().pan_changed());
        assert!(camera.change_kind().zoom_changed());
    }

    #[test]
    fn test_change_kind_zoom_out() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });
        camera.set_zoom(0.5);
        // set_zoom preserves translation; zoom decreased → ZoomOut.
        assert_eq!(camera.change_kind(), CameraChangeKind::ZoomOut);
        assert!(!camera.change_kind().pan_changed());
        assert!(camera.change_kind().zoom_changed());
    }

    #[test]
    fn test_change_kind_pan_and_zoom() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });
        // set_zoom_at with an off-center anchor changes both zoom and
        // translation to keep the anchor point fixed on screen.
        // Using [75, 75] ensures the translation compensation is non-zero.
        camera.set_zoom_at(2.0, [75.0, 75.0]);
        assert_eq!(camera.change_kind(), CameraChangeKind::PanAndZoom(true));
        assert!(camera.change_kind().pan_changed());
        assert!(camera.change_kind().zoom_changed());
    }

    #[test]
    fn test_pan_delta() {
        let mut camera = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });
        camera.translate(5.0, -3.0);
        let (dx, dy) = camera.pan_delta();
        assert!((dx - 5.0).abs() < f32::EPSILON);
        assert!((dy - (-3.0)).abs() < f32::EPSILON);
    }

    // ---------------------------------------------------------------
    // Sequences that simulate real gesture interactions.
    // Each step mirrors what the app does: mutate camera → change_kind
    // → consume_change (the queue+flush cycle).
    // ---------------------------------------------------------------

    /// Helper: simulate one queue+flush cycle on the legacy path.
    /// Returns the CameraChangeKind that `queue()` would see.
    fn sim_queue(camera: &mut Camera2D) -> CameraChangeKind {
        let kind = camera.change_kind();
        camera.consume_change();
        kind
    }

    #[test]
    fn sequence_pan_zoom_in_pan() {
        // pan → zoom-in → pan  (user reports: correct, shows "pan")
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.translate(5.0, 0.0);
        assert_eq!(sim_queue(&mut c), CameraChangeKind::PanOnly);

        c.set_zoom(2.0);
        assert!(sim_queue(&mut c).zoom_changed());

        c.translate(5.0, 0.0);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "after zoom-in then pan, should be PanOnly"
        );
    }

    #[test]
    fn sequence_zoom_in_zoom_out_pan() {
        // zoom-in → zoom-out → pan  (user reports: stuck at pan+zoom)
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom(2.0);
        let k = sim_queue(&mut c);
        assert!(k.zoom_changed(), "zoom-in: {:?}", k);

        c.set_zoom(0.5);
        let k = sim_queue(&mut c);
        assert!(k.zoom_changed(), "zoom-out: {:?}", k);

        c.translate(5.0, 0.0);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "after zoom-in + zoom-out + pan, should be PanOnly"
        );
    }

    #[test]
    fn sequence_set_zoom_at_center_then_pan() {
        // set_zoom_at at viewport center → no translation shift → ZoomIn
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom_at(2.0, [50.0, 50.0]);
        let k = sim_queue(&mut c);
        assert_eq!(
            k,
            CameraChangeKind::ZoomIn,
            "zoom at center should be ZoomIn (no pan compensation)"
        );

        c.translate(5.0, 0.0);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "after zoom-at-center + pan, should be PanOnly"
        );
    }

    #[test]
    fn sequence_set_zoom_at_off_center_then_pan() {
        // set_zoom_at off-center → translation shifts → PanAndZoom
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom_at(2.0, [75.0, 75.0]);
        let k = sim_queue(&mut c);
        assert!(
            matches!(k, CameraChangeKind::PanAndZoom(_)),
            "zoom at off-center should be PanAndZoom, got: {:?}",
            k
        );

        c.translate(5.0, 0.0);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "after off-center pinch + pan, should be PanOnly"
        );
    }

    #[test]
    fn sequence_set_zoom_at_in_out_then_pan() {
        // Pinch zoom in → pinch zoom out → pan
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom_at(2.0, [50.0, 50.0]);
        let _ = sim_queue(&mut c);

        c.set_zoom_at(0.5, [50.0, 50.0]);
        let _ = sim_queue(&mut c);

        c.translate(5.0, 0.0);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "after pinch-in + pinch-out + pan, should be PanOnly"
        );
    }

    #[test]
    fn sequence_zoom_out_is_not_pan_and_zoom() {
        // Pure set_zoom (no focal point) should be ZoomOut, not PanAndZoom
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom(0.5);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::ZoomOut,
            "set_zoom(0.5) should be ZoomOut, not PanAndZoom"
        );
    }

    #[test]
    fn sequence_set_zoom_at_out_is_pan_and_zoom() {
        // set_zoom_at always adjusts translation to keep focal point fixed,
        // so it inherently produces PanAndZoom. This is correct behavior.
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom_at(0.5, [75.0, 75.0]);
        assert!(
            matches!(sim_queue(&mut c), CameraChangeKind::PanAndZoom(_)),
            "set_zoom_at always changes both zoom and translation"
        );
    }

    #[test]
    fn sequence_consume_then_no_change() {
        // After consume, change_kind should return None
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.translate(5.0, 0.0);
        assert_eq!(sim_queue(&mut c), CameraChangeKind::PanOnly);

        // No mutation — should be None
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::None,
            "after consume with no mutation, should be None"
        );
    }

    #[test]
    fn sequence_multiple_translates_before_queue() {
        // Multiple translates before a single queue — should still be PanOnly
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.translate(5.0, 0.0);
        c.translate(3.0, 0.0);
        c.translate(-2.0, 0.0);
        // Each translate calls before_change, so only the last delta is visible
        assert_eq!(sim_queue(&mut c), CameraChangeKind::PanOnly);
    }

    #[test]
    fn sequence_zoom_then_translate_before_queue() {
        // Zoom then translate in same "frame" (before queue) — translate's
        // before_change overwrites the zoom baseline, so only pan is visible
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        c.set_zoom(2.0);
        c.translate(5.0, 0.0);
        // translate's before_change saved post-zoom state; only pan delta visible
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "zoom + translate before queue: translate's before_change hides the zoom"
        );
    }

    #[test]
    fn sequence_interleaved_zoom_pan_with_queue() {
        // Interleaved zoom and pan WITH queue between each — simulates
        // macOS sending PinchGesture + MouseWheel events, each triggering queue()
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        // Pinch event → zoom (at center → no translation change)
        c.set_zoom_at(1.5, [50.0, 50.0]);
        let k1 = sim_queue(&mut c);
        assert_eq!(k1, CameraChangeKind::ZoomIn);

        // Scroll event → pan (after consumed zoom)
        c.translate(5.0, 0.0);
        let k2 = sim_queue(&mut c);
        assert_eq!(
            k2,
            CameraChangeKind::PanOnly,
            "translate after consumed zoom should be PanOnly"
        );
    }

    #[test]
    fn sequence_rapid_zoom_at_oscillation_then_pan() {
        // Simulate rapid pinch in/out (oscillating zoom) then pure pan
        let mut c = Camera2D::new(Size {
            width: 100.0,
            height: 100.0,
        });

        for i in 0..20 {
            let z = if i % 2 == 0 { 1.5 } else { 0.8 };
            c.set_zoom_at(z, [50.0, 50.0]);
            let _ = sim_queue(&mut c);
        }

        // Now pure pan
        c.translate(10.0, 0.0);
        assert_eq!(
            sim_queue(&mut c),
            CameraChangeKind::PanOnly,
            "after rapid zoom oscillation, pan should be PanOnly"
        );
    }
}
