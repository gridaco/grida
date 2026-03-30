use crate::cache::scene::SceneCache;
use crate::devtools::text_overlay;
use crate::painter::layer::{Layer, PainterPictureLayer};
use crate::runtime::camera::Camera2D;
use crate::runtime::font_repository::FontRepository;
use crate::sk;
use crate::surface::gesture::SurfaceGesture;
use crate::surface::state::SurfaceState;
use skia_safe::{Canvas, Color, Matrix, Paint, PaintStyle, PathEffect};

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
    /// Device pixel ratio (e.g. 2.0 on Retina). Scales all screen-space UI
    /// elements (fonts, paddings, offsets) so they appear at the correct
    /// logical size regardless of display density.
    pub dpr: f32,
    /// When true, text nodes show baseline underlines on hover/selection.
    /// On hover: baseline only. On selection: bounding rect + baseline.
    pub text_baseline_decoration: bool,
    /// Show size dimension label below selection.
    pub show_size_meter: bool,
    /// Show type labels above root frames and selected nodes.
    pub show_frame_titles: bool,
}

impl Default for SurfaceOverlayConfig {
    fn default() -> Self {
        Self {
            dpr: 1.0,
            text_baseline_decoration: false,
            show_size_meter: false,
            show_frame_titles: false,
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
        fonts: &FontRepository,
    ) {
        let use_text_baseline = config.text_baseline_decoration;
        let view_sk = sk::sk_matrix(camera.view_matrix().matrix);

        // Draw hover highlight
        if let Some(hovered_id) = surface.hover.hovered() {
            // Don't draw hover on selected nodes (selection overlay takes precedence)
            if !surface.selection.contains(hovered_id) {
                // Hover: text nodes show baseline only (no bounding rect)
                Self::draw_node_outline(
                    canvas,
                    hovered_id,
                    &view_sk,
                    cache,
                    HOVER_COLOR,
                    1.5,
                    use_text_baseline,
                    fonts,
                );
            }
        }

        // Draw selection outlines
        let sel_count = surface.selection.len();
        if sel_count >= 1 {
            for id in surface.selection.iter() {
                // Selection: always draw bounding rect
                Self::draw_node_outline(
                    canvas,
                    id,
                    &view_sk,
                    cache,
                    SELECTION_COLOR,
                    1.5,
                    false,
                    fonts,
                );
                // Selection: additionally draw text baseline decoration
                if use_text_baseline {
                    Self::draw_text_baseline(canvas, id, &view_sk, cache, SELECTION_COLOR, fonts);
                }
            }
            if sel_count > 1 {
                Self::draw_group_bounding_rect(canvas, surface, &view_sk, cache);
            }
        }

        // Draw marquee rectangle
        if let SurfaceGesture::MarqueeSelect {
            anchor_canvas,
            current_canvas,
        } = &surface.gesture
        {
            Self::draw_marquee(canvas, &view_sk, *anchor_canvas, *current_canvas);
        }
    }

    /// Draw an outline for a single node.
    ///
    /// When `use_text_baseline` is true and the node is a text layer,
    /// the baseline underline path is drawn instead of the bounding shape.
    fn draw_node_outline(
        canvas: &Canvas,
        id: &crate::node::schema::NodeId,
        view_sk: &Matrix,
        cache: &SceneCache,
        color: Color,
        stroke_width: f32,
        use_text_baseline: bool,
        fonts: &FontRepository,
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
        } else if use_text_baseline {
            match &layer_entry.layer {
                PainterPictureLayer::Text(text_layer) => {
                    match text_overlay::TextOverlay::text_layer_baseline(cache, text_layer, fonts) {
                        Some(text_path) => text_path,
                        None => return,
                    }
                }
                _ => layer_entry.layer.shape().to_path(),
            }
        } else {
            layer_entry.layer.shape().to_path()
        };

        path = path.make_transform(&sk::sk_matrix(transform.matrix));
        path = path.make_transform(view_sk);

        let mut paint = Paint::default();
        paint.set_color(color);
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(stroke_width);
        paint.set_anti_alias(true);

        canvas.draw_path(&path, &paint);
    }

    /// Draw text baseline decoration for a node (no-op if not a text layer).
    fn draw_text_baseline(
        canvas: &Canvas,
        id: &crate::node::schema::NodeId,
        view_sk: &Matrix,
        cache: &SceneCache,
        color: Color,
        fonts: &FontRepository,
    ) {
        let layer_entry = match cache.layers.layers.iter().find(|e| e.id == *id) {
            Some(e) => e,
            None => return,
        };

        let text_layer = match &layer_entry.layer {
            PainterPictureLayer::Text(t) => t,
            _ => return,
        };

        let baseline_path =
            match text_overlay::TextOverlay::text_layer_baseline(cache, text_layer, fonts) {
                Some(p) => p,
                None => return,
            };

        let transform = layer_entry.layer.transform();
        let mut path = baseline_path;
        path = path.make_transform(&sk::sk_matrix(transform.matrix));
        path = path.make_transform(view_sk);

        let mut paint = Paint::default();
        paint.set_color(color);
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(1.0);
        paint.set_anti_alias(true);

        canvas.draw_path(&path, &paint);
    }

    /// Draw a union bounding rect around all selected nodes.
    fn draw_group_bounding_rect(
        canvas: &Canvas,
        surface: &SurfaceState,
        view_sk: &Matrix,
        cache: &SceneCache,
    ) {
        let rects: Vec<math2::rect::Rectangle> = surface
            .selection
            .iter()
            .filter_map(|id| cache.geometry.get_world_bounds(id))
            .collect();

        if rects.is_empty() {
            return;
        }

        let union = math2::rect::union(&rects);
        let p1 = view_sk.map_point((union.x, union.y));
        let p2 = view_sk.map_point((union.x + union.width, union.y + union.height));
        let screen_rect = skia_safe::Rect::from_ltrb(
            p1.x.min(p2.x),
            p1.y.min(p2.y),
            p1.x.max(p2.x),
            p1.y.max(p2.y),
        );

        let mut paint = Paint::default();
        paint.set_color(SELECTION_COLOR);
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(1.5);
        paint.set_anti_alias(true);

        canvas.draw_rect(screen_rect, &paint);
    }

    fn draw_marquee(
        canvas: &Canvas,
        view_sk: &Matrix,
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

        let p1 = view_sk.map_point((x, y));
        let p2 = view_sk.map_point((x + w, y + h));
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
