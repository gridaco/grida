use crate::cache::scene::SceneCache;
use crate::devtools::surface_overlay::SurfaceOverlayConfig;
use crate::node::scene_graph::SceneGraph;
use crate::runtime::camera::Camera2D;
use crate::surface::state::SurfaceState;
use crate::surface::ui::hit_region::{HitRegion, HitRegions, OverlayAction};
use skia_safe::{Canvas, Color, Font, Paint, PaintStyle, Point, RRect, Rect};
use std::collections::HashSet;

/// Selection overlay color (blue) — shared with SurfaceOverlay.
const ACCENT_COLOR: Color = Color::from_argb(255, 0, 120, 255);
/// Muted label color for non-selected frame titles.
const MUTED_COLOR: Color = Color::from_argb(140, 120, 120, 120);

// All constants are in logical pixels (CSS px). Multiplied by `dpr` at draw time.

/// Font size for the size meter label (matches React's fontSize: 10).
const SIZE_METER_FONT_SIZE: f32 = 10.0;
/// Font size for frame title labels (matches React's text-xs = 12px).
const FRAME_TITLE_FONT_SIZE: f32 = 12.0;

/// Vertical offset (logical px) below the selection bounding box for the size meter.
const SIZE_METER_OFFSET_Y: f32 = 16.0;
/// Horizontal + vertical padding inside the size meter pill.
const SIZE_METER_PAD_X: f32 = 4.0;
const SIZE_METER_PAD_Y: f32 = 2.0;
/// Corner radius of the size meter pill.
const SIZE_METER_RADIUS: f32 = 4.0;

/// Height of the frame title bar (logical px)
const TITLE_BAR_HEIGHT: f32 = 24.0;
/// Minimum screen-space node width (logical px) to show a title bar.
const MIN_TITLE_WIDTH: f32 = 20.0;

fn make_font(size: f32) -> Font {
    Font::new(
        crate::fonts::embedded::typeface(crate::fonts::embedded::geistmono::BYTES),
        size,
    )
}

pub struct SurfaceUI;

impl SurfaceUI {
    /// Draw surface UI elements (size meter, frame titles) and register hit regions.
    ///
    /// Call this after `SurfaceOverlay::draw()` so UI elements render on top.
    pub fn draw(
        canvas: &Canvas,
        surface: &SurfaceState,
        camera: &Camera2D,
        cache: &SceneCache,
        config: &SurfaceOverlayConfig,
        hit_regions: &mut HitRegions,
        graph: Option<&SceneGraph>,
    ) {
        hit_regions.clear();

        let dpr = config.dpr;

        if config.show_frame_titles {
            if let Some(graph) = graph {
                Self::draw_frame_titles(canvas, surface, camera, cache, hit_regions, graph, dpr);
            }
        }

        if config.show_size_meter && !surface.selection.is_empty() {
            Self::draw_size_meter(canvas, surface, camera, cache, dpr);
        }
    }

    /// Draw a dimension label pill below the selection bounding box.
    fn draw_size_meter(
        canvas: &Canvas,
        surface: &SurfaceState,
        camera: &Camera2D,
        cache: &SceneCache,
        dpr: f32,
    ) {
        // Compute union of all selected nodes' world bounds
        let rects: Vec<math2::rect::Rectangle> = surface
            .selection
            .iter()
            .filter_map(|id| cache.geometry.get_world_bounds(id))
            .collect();

        if rects.is_empty() {
            return;
        }

        let world_rect = math2::rect::union(&rects);

        // World-space dimensions (what the user cares about)
        let w = world_rect.width;
        let h = world_rect.height;
        let text = format!("{:.0} x {:.0}", w, h);

        // Transform bottom-center of world rect to screen space
        let view = camera.view_matrix();
        let bottom_center = math2::vector2::transform(
            [
                world_rect.x + world_rect.width * 0.5,
                world_rect.y + world_rect.height,
            ],
            &view,
        );

        let font = make_font(SIZE_METER_FONT_SIZE * dpr);
        let pad_x = SIZE_METER_PAD_X * dpr;
        let pad_y = SIZE_METER_PAD_Y * dpr;
        let offset_y = SIZE_METER_OFFSET_Y * dpr;
        let radius = SIZE_METER_RADIUS * dpr;

        let (text_width, _) = font.measure_str(&text, None);
        let metrics = font.metrics();
        let text_height = -metrics.1.ascent + metrics.1.descent;

        let pill_w = text_width + pad_x * 2.0;
        let pill_h = text_height + pad_y * 2.0;
        // Web uses translate(-50%, -50%): pill center sits at (centerX, bottomY + offset)
        let pill_x = bottom_center[0] - pill_w * 0.5;
        let pill_y = bottom_center[1] + offset_y - pill_h * 0.5;

        let pill_rect = Rect::from_xywh(pill_x, pill_y, pill_w, pill_h);
        let rrect = RRect::new_rect_xy(pill_rect, radius, radius);

        // Background pill
        let mut bg = Paint::default();
        bg.set_color(ACCENT_COLOR);
        bg.set_style(PaintStyle::Fill);
        bg.set_anti_alias(true);
        canvas.draw_rrect(rrect, &bg);

        // Text
        let mut text_paint = Paint::default();
        text_paint.set_color(Color::WHITE);
        text_paint.set_anti_alias(true);
        let text_x = pill_x + pad_x;
        let text_y = pill_y + pad_y - metrics.1.ascent;
        canvas.draw_str(&text, Point::new(text_x, text_y), &font, &text_paint);
    }

    /// Draw title labels above nodes and register hit regions for them.
    fn draw_frame_titles(
        canvas: &Canvas,
        surface: &SurfaceState,
        camera: &Camera2D,
        cache: &SceneCache,
        hit_regions: &mut HitRegions,
        graph: &SceneGraph,
        dpr: f32,
    ) {
        // Title bars are shown only for root-level children (matching surface.tsx).
        let mut title_nodes = HashSet::new();
        for root_id in graph.roots() {
            title_nodes.insert(*root_id);
        }

        let view = camera.view_matrix();
        let font = make_font(FRAME_TITLE_FONT_SIZE * dpr);
        let title_height = TITLE_BAR_HEIGHT * dpr;
        let min_width = MIN_TITLE_WIDTH * dpr;

        for &node_id in &title_nodes {
            let world_bounds = match cache.geometry.get_world_bounds(&node_id) {
                Some(b) => b,
                None => continue,
            };

            // Transform top-left and top-right to screen space
            let screen_tl =
                math2::vector2::transform([world_bounds.x, world_bounds.y], &view);
            let screen_tr = math2::vector2::transform(
                [world_bounds.x + world_bounds.width, world_bounds.y],
                &view,
            );
            let screen_width = (screen_tr[0] - screen_tl[0]).abs();

            if screen_width < min_width {
                continue;
            }

            // Get node display name, falling back to type label
            let label: &str = graph.get_name(&node_id).unwrap_or_else(|| {
                graph
                    .get_node(&node_id)
                    .map(|n| n.type_label())
                    .unwrap_or("?")
            });

            let is_selected = surface.selection.contains(&node_id);
            let color = if is_selected { ACCENT_COLOR } else { MUTED_COLOR };

            let display_text = truncate_with_ellipsis(&font, label, screen_width);
            let (text_width, _) = font.measure_str(&display_text, None);

            let title_x = screen_tl[0];
            let title_y = screen_tl[1] - title_height;

            // Draw text
            let mut paint = Paint::default();
            paint.set_color(color);
            paint.set_anti_alias(true);

            let metrics = font.metrics();
            // Skia ascent is negative. To center text in the title bar:
            // baseline = box_center - (ascent + descent) / 2
            let text_baseline_y =
                title_y + (title_height - metrics.1.ascent - metrics.1.descent) * 0.5;

            canvas.draw_str(
                &display_text,
                Point::new(title_x, text_baseline_y),
                &font,
                &paint,
            );

            // Hit region fits the text, not the full node width
            let hit_rect = Rect::from_xywh(title_x, title_y, text_width, title_height);
            hit_regions.push(HitRegion {
                screen_rect: hit_rect,
                action: OverlayAction::SelectNode(node_id),
            });
        }
    }
}

/// Truncate text with ellipsis if it exceeds max_width.
fn truncate_with_ellipsis(font: &Font, text: &str, max_width: f32) -> String {
    if max_width <= 0.0 {
        return String::new();
    }

    let (full_width, _) = font.measure_str(text, None);
    if full_width <= max_width {
        return text.to_string();
    }

    let ellipsis = "\u{2026}"; // …
    let (ellipsis_width, _) = font.measure_str(ellipsis, None);
    let target = max_width - ellipsis_width;
    if target <= 0.0 {
        return ellipsis.to_string();
    }

    // Trim from the end until it fits
    for end in (1..=text.len()).rev() {
        if !text.is_char_boundary(end) {
            continue;
        }
        let (w, _) = font.measure_str(&text[..end], None);
        if w <= target {
            return format!("{}{}", &text[..end], ellipsis);
        }
    }

    ellipsis.to_string()
}
