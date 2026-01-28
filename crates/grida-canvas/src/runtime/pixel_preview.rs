use super::config::PixelPreviewStrategy;
use crate::node::schema::Size;
use math2::transform::AffineTransform;

/// Simple float rect used by pixel preview math.
///
/// This is intentionally independent of Skia types so we can keep the pixel preview
/// planning code purely “math + parameters”.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RectF {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Input parameters required to plan the Pixel Preview render.
///
/// This struct is intentionally minimal: only the values needed to derive
/// offscreen sizing + transforms are included.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PixelPreviewInputs {
    /// Viewport size in screen pixels.
    pub viewport: Size,
    /// Current camera zoom (screen px per world unit at zoom=1 is 1:1).
    pub zoom: f32,
    /// Pixel Preview scale (0 = disabled, otherwise {1,2,...}).
    pub pixel_preview_scale: u8,
    /// Pixel Preview strategy (Accurate vs Stable).
    pub strategy: PixelPreviewStrategy,
    /// Camera center in world coordinates.
    pub camera_center: (f32, f32),
    /// Camera rotation in radians.
    pub camera_rotation: f32,
}

/// Derived plan for rendering Pixel Preview.
///
/// This includes:
/// - offscreen surface size (integer)
/// - offscreen canvas translation (overscan padding)
/// - world→offscreen view matrix used to rasterize the scene
/// - source rect (float) to sample when presenting to the screen
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PixelPreviewPlan {
    /// Whether Pixel Preview should be active for this frame.
    pub enabled: bool,
    /// Offscreen surface size in pixels (including overscan padding).
    pub surface_px: (i32, i32),
    /// Overscan padding applied around the source region (in offscreen pixels).
    pub overscan_pad_px: i32,
    /// Translation to apply to the offscreen canvas before concatenating `view_matrix`.
    pub offscreen_canvas_translate: (f32, f32),
    /// World → offscreen view matrix for drawing the scene.
    pub view_matrix: AffineTransform,
    /// Source rect in offscreen pixel space to present to the screen.
    pub src_rect: RectF,
}

const ROTATION_EPS: f32 = 1.0e-6;

fn view_matrix_from_camera_transform(camera_transform: AffineTransform, viewport: Size) -> AffineTransform {
    // Matches Camera2D::view_matrix():
    // view = translate(vp/2) ∘ inverse(camera_transform)
    let inv = camera_transform
        .inverse()
        .unwrap_or_else(AffineTransform::identity);
    let mut t = AffineTransform::identity();
    t.translate(viewport.width * 0.5, viewport.height * 0.5);
    t.compose(&inv)
}

/// Computes a deterministic Pixel Preview plan.
///
/// Key invariants:
/// - Presentation scale is exactly `zoom / pixel_preview_scale` via a *continuous* source rect size.
/// - Stable strategy anchors sampling phase to world origin (0,0) when rotation is ~0.
/// - Overscan padding ensures we can shift the presented source rect without leaving uncovered edges.
pub fn compute_pixel_preview_plan(inputs: PixelPreviewInputs) -> PixelPreviewPlan {
    let PixelPreviewInputs {
        viewport,
        zoom,
        pixel_preview_scale,
        strategy,
        camera_center: (cx, cy),
        camera_rotation: angle,
    } = inputs;

    let enabled = pixel_preview_scale != 0 && zoom > pixel_preview_scale as f32 + f32::EPSILON;
    if !enabled {
        return PixelPreviewPlan {
            enabled: false,
            surface_px: (0, 0),
            overscan_pad_px: 0,
            offscreen_canvas_translate: (0.0, 0.0),
            view_matrix: AffineTransform::identity(),
            src_rect: RectF {
                x: 0.0,
                y: 0.0,
                w: 0.0,
                h: 0.0,
            },
        };
    }

    let scale_f = pixel_preview_scale as f32;

    // Continuous ideal source size in offscreen pixels.
    // This keeps pixel size stable with zoom:
    //   present scale = viewport.width / src_w_f = zoom / scale
    let src_w_f = (viewport.width * scale_f / zoom).max(1.0);
    let src_h_f = (viewport.height * scale_f / zoom).max(1.0);

    // Integer buffer size for raster surface.
    let buf_w = src_w_f.ceil() as i32;
    let buf_h = src_h_f.ceil() as i32;

    let no_rotation = angle.abs() < ROTATION_EPS;
    // Overscan padding to avoid uncovered edges when we shift the source rect by a subpixel phase
    // correction in Stable mode.
    //
    // TODO(pixel-preview): AA can still change if high-frequency geometry is clipped by the
    // offscreen buffer boundary (coverage/edge conditions differ near the crop edge). If this is
    // user-visible, increase padding (e.g. 2–4px), or compute a padding budget based on active
    // effects (blur/shadow/image filters). The goal is to keep the presented source rect away from
    // the buffer edge so AA neighborhoods remain stable.
    let overscan_pad_px = if matches!(strategy, PixelPreviewStrategy::Stable) && no_rotation {
        1
    } else {
        0
    };

    let surface_px = (buf_w + overscan_pad_px * 2, buf_h + overscan_pad_px * 2);
    let offscreen_canvas_translate = (overscan_pad_px as f32, overscan_pad_px as f32);

    // Preview camera transform in world space at `pixel_preview_scale` zoom.
    // Camera2D stores zoom in the transform scale as `1 / zoom`.
    let inv_zoom = 1.0 / scale_f;
    let (sin, cos) = angle.sin_cos();
    let preview_camera_transform = AffineTransform {
        matrix: [[cos * inv_zoom, -sin * inv_zoom, cx], [sin * inv_zoom, cos * inv_zoom, cy]],
    };

    let mut view_matrix = view_matrix_from_camera_transform(
        preview_camera_transform,
        Size {
            width: src_w_f,
            height: src_h_f,
        },
    );

    // Stable strategy: anchor sampling phase to world origin (0,0) in offscreen pixel space.
    // Rotation support is intentionally excluded for v1.
    let mut stable_phase_dx = 0.0f32;
    let mut stable_phase_dy = 0.0f32;
    if matches!(strategy, PixelPreviewStrategy::Stable) && no_rotation {
        let ox = view_matrix.matrix[0][2];
        let oy = view_matrix.matrix[1][2];
        let ox_q = ox.floor();
        let oy_q = oy.floor();
        stable_phase_dx = ox_q - ox;
        stable_phase_dy = oy_q - oy;
        view_matrix.matrix[0][2] = ox + stable_phase_dx;
        view_matrix.matrix[1][2] = oy + stable_phase_dy;
    }

    let pad_f = overscan_pad_px as f32;
    let (sx, sy) = if matches!(strategy, PixelPreviewStrategy::Stable) && overscan_pad_px != 0 {
        (pad_f + stable_phase_dx, pad_f + stable_phase_dy)
    } else {
        (pad_f, pad_f)
    };

    PixelPreviewPlan {
        enabled: true,
        surface_px,
        overscan_pad_px,
        offscreen_canvas_translate,
        view_matrix,
        src_rect: RectF {
            x: sx,
            y: sy,
            w: src_w_f,
            h: src_h_f,
        },
    }
}

