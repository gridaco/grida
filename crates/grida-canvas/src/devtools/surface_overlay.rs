use crate::cache::scene::SceneCache;
use crate::devtools::text_overlay;
use crate::painter::layer::{Layer, PainterPictureLayer};
use crate::runtime::camera::Camera2D;
use crate::sk;
use crate::surface::gesture::SurfaceGesture;
use crate::surface::state::SurfaceState;
use skia_safe::{Canvas, Color, Paint, PaintStyle, PathEffect};

/// Selection overlay color (blue).
const SELECTION_COLOR: Color = Color::from_argb(255, 0, 120, 255);
/// Hover overlay color (lighter blue, semi-transparent).
const HOVER_COLOR: Color = Color::from_argb(160, 0, 120, 255);
/// Marquee fill color.
const MARQUEE_FILL_COLOR: Color = Color::from_argb(30, 0, 120, 255);
/// Marquee stroke color.
const MARQUEE_STROKE_COLOR: Color = Color::from_argb(200, 0, 120, 255);

/// Configuration for how the surface overlay renders.
#[derive(Debug, Clone)]
pub struct SurfaceOverlayConfig {
    /// When true, text nodes use baseline-line paths instead of bounding shape.
    /// This matches the editor's behavior where text selection shows
    /// horizontal lines under each text line rather than an outline.
    pub text_baseline_highlight: bool,
}

impl Default for SurfaceOverlayConfig {
    fn default() -> Self {
        Self {
            text_baseline_highlight: true,
        }
    }
}

pub struct SurfaceOverlay;

impl SurfaceOverlay {
    pub fn draw(
        canvas: &Canvas,
        surface: &SurfaceState,
        camera: &Camera2D,
        cache: &SceneCache,
        config: &SurfaceOverlayConfig,
    ) {
        // Draw hover highlight
        if let Some(hovered_id) = surface.hover.hovered() {
            // Don't draw hover on selected nodes (selection overlay takes precedence)
            if !surface.selection.contains(hovered_id) {
                Self::draw_node_outline(
                    canvas, hovered_id, camera, cache, HOVER_COLOR, 1.5, config,
                );
            }
        }

        // Draw selection outlines
        for id in surface.selection.iter() {
            Self::draw_node_outline(canvas, id, camera, cache, SELECTION_COLOR, 4.0, config);
        }

        // Draw marquee rectangle
        if let SurfaceGesture::MarqueeSelect {
            anchor_canvas,
            current_canvas,
        } = &surface.gesture
        {
            Self::draw_marquee(canvas, camera, *anchor_canvas, *current_canvas);
        }
    }

    fn draw_node_outline(
        canvas: &Canvas,
        id: &crate::node::schema::NodeId,
        camera: &Camera2D,
        cache: &SceneCache,
        color: Color,
        stroke_width: f32,
        config: &SurfaceOverlayConfig,
    ) {
        let layer_entry = match cache.layers.layers.iter().find(|e| e.id == *id) {
            Some(e) => e,
            None => return,
        };

        if cache.geometry.get_world_bounds(id).is_none() {
            return;
        }

        let transform = layer_entry.layer.transform();

        let mut path = if let Some(path_entry) = cache.path.borrow().get(id) {
            (*path_entry.path).clone()
        } else if config.text_baseline_highlight {
            // Use text-specific baseline path for text layers
            match &layer_entry.layer {
                PainterPictureLayer::Text(text_layer) => {
                    match text_overlay::TextOverlay::text_layer_baseline(cache, text_layer) {
                        Some(text_path) => text_path,
                        None => return,
                    }
                }
                _ => layer_entry.layer.shape().to_path(),
            }
        } else {
            layer_entry.layer.shape().to_path()
        };

        // Transform path: local → world → screen (same pattern as StrokeOverlay)
        path = path.make_transform(&sk::sk_matrix(transform.matrix));
        path = path.make_transform(&sk::sk_matrix(camera.view_matrix().matrix));

        let mut paint = Paint::default();
        paint.set_color(color);
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(stroke_width);
        paint.set_anti_alias(true);

        canvas.draw_path(&path, &paint);
    }

    fn draw_marquee(
        canvas: &Canvas,
        camera: &Camera2D,
        anchor: math2::vector2::Vector2,
        current: math2::vector2::Vector2,
    ) {
        let x = anchor[0].min(current[0]);
        let y = anchor[1].min(current[1]);
        let w = (anchor[0] - current[0]).abs();
        let h = (anchor[1] - current[1]).abs();

        if w < 1.0 && h < 1.0 {
            return;
        }

        // Transform marquee corners from canvas space to screen space
        let view = sk::sk_matrix(camera.view_matrix().matrix);
        let p1 = view.map_point((x, y));
        let p2 = view.map_point((x + w, y + h));
        let screen_rect = skia_safe::Rect::from_ltrb(
            p1.x.min(p2.x),
            p1.y.min(p2.y),
            p1.x.max(p2.x),
            p1.y.max(p2.y),
        );

        // Fill
        let mut fill = Paint::default();
        fill.set_color(MARQUEE_FILL_COLOR);
        fill.set_style(PaintStyle::Fill);
        canvas.draw_rect(screen_rect, &fill);

        // Dashed stroke
        let mut stroke = Paint::default();
        stroke.set_color(MARQUEE_STROKE_COLOR);
        stroke.set_style(PaintStyle::Stroke);
        stroke.set_stroke_width(1.0);
        stroke.set_anti_alias(true);
        if let Some(effect) = PathEffect::dash(&[4.0, 4.0], 0.0) {
            stroke.set_path_effect(effect);
        }
        canvas.draw_rect(screen_rect, &stroke);
    }
}
