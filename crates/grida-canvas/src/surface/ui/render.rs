use crate::cache::scene::SceneCache;
use crate::devtools::surface_overlay::SurfaceOverlayConfig;
use crate::node::scene_graph::SceneGraph;
use crate::runtime::camera::Camera2D;
use crate::runtime::font_repository::FontRepository;
use crate::surface::state::SurfaceState;
use crate::surface::ui::hit_region::{HitRegion, HitRegions, OverlayAction};
use skia_safe::textlayout;
use skia_safe::{Canvas, Color, Font, Paint, PaintStyle, Point, RRect, Rect};

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

thread_local! {
    static FONT_SIZE_METER: Font = Font::new(
        crate::fonts::embedded::typeface(crate::fonts::embedded::geistmono::BYTES),
        SIZE_METER_FONT_SIZE,
    );

    static ACCENT_FILL: Paint = {
        let mut p = Paint::default();
        p.set_color(ACCENT_COLOR);
        p.set_style(PaintStyle::Fill);
        p.set_anti_alias(true);
        p
    };
    static WHITE_TEXT: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::WHITE);
        p.set_anti_alias(true);
        p
    };
}

/// Returns a scaled clone of a base font. The typeface is shared (ref-counted),
/// only the size field changes — much cheaper than parsing bytes.
fn scaled_font(base: &Font, dpr: f32) -> Font {
    let mut f = base.clone();
    f.set_size(base.size() * dpr);
    f
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
        fonts: &FontRepository,
    ) {
        hit_regions.clear();

        let dpr = config.dpr;

        if config.show_frame_titles {
            if let Some(graph) = graph {
                Self::draw_frame_titles(
                    canvas,
                    surface,
                    camera,
                    cache,
                    hit_regions,
                    graph,
                    dpr,
                    fonts,
                );
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

        FONT_SIZE_METER.with(|base_font| {
            let font = scaled_font(base_font, dpr);
            let pad_x = SIZE_METER_PAD_X * dpr;
            let pad_y = SIZE_METER_PAD_Y * dpr;
            let offset_y = SIZE_METER_OFFSET_Y * dpr;
            let radius = SIZE_METER_RADIUS * dpr;

            let (text_width, _) = font.measure_str(&text, None);
            let metrics = font.metrics();
            let text_height = -metrics.1.ascent + metrics.1.descent;

            let pill_w = text_width + pad_x * 2.0;
            let pill_h = text_height + pad_y * 2.0;
            let pill_x = bottom_center[0] - pill_w * 0.5;
            let pill_y = bottom_center[1] + offset_y - pill_h * 0.5;

            let pill_rect = Rect::from_xywh(pill_x, pill_y, pill_w, pill_h);
            let rrect = RRect::new_rect_xy(pill_rect, radius, radius);

            ACCENT_FILL.with(|bg| canvas.draw_rrect(rrect, bg));

            WHITE_TEXT.with(|tp| {
                let text_x = pill_x + pad_x;
                let text_y = pill_y + pad_y - metrics.1.ascent;
                canvas.draw_str(&text, Point::new(text_x, text_y), &font, tp);
            });
        });
    }

    /// Draw title labels above nodes and register hit regions for them.
    ///
    /// Uses the Paragraph API with `FontCollection` from the shared
    /// `FontRepository` so that CJK and other non-Latin scripts fall back
    /// to user-provided fallback fonts instead of rendering as tofu.
    fn draw_frame_titles(
        canvas: &Canvas,
        surface: &SurfaceState,
        camera: &Camera2D,
        cache: &SceneCache,
        hit_regions: &mut HitRegions,
        graph: &SceneGraph,
        dpr: f32,
        fonts: &FontRepository,
    ) {
        let title_height = TITLE_BAR_HEIGHT * dpr;
        let min_width = MIN_TITLE_WIDTH * dpr;
        let view = camera.view_matrix();
        let font_size = FRAME_TITLE_FONT_SIZE * dpr;

        // Build font families list: primary + user fallback fonts
        let fallbacks = fonts.user_fallback_families();
        let mut families: Vec<&str> = Vec::with_capacity(1 + fallbacks.len());
        families.push(crate::fonts::embedded::geist::FAMILY);
        for f in &fallbacks {
            families.push(f.as_str());
        }

        // Iterate root nodes directly — no HashSet needed.
        for &node_id in graph.roots() {
            let world_bounds = match cache.geometry.get_world_bounds(&node_id) {
                Some(b) => b,
                None => continue,
            };

            let screen_tl = math2::vector2::transform([world_bounds.x, world_bounds.y], &view);
            let screen_tr = math2::vector2::transform(
                [world_bounds.x + world_bounds.width, world_bounds.y],
                &view,
            );
            let screen_width = (screen_tr[0] - screen_tl[0]).abs();

            if screen_width < min_width {
                continue;
            }

            let label: &str = graph.get_name(&node_id).unwrap_or_else(|| {
                graph
                    .get_node(&node_id)
                    .map(|n| n.type_label())
                    .unwrap_or("?")
            });

            let is_selected = surface.selection.contains(&node_id);
            let is_hovered = surface.hover.hovered() == Some(&node_id);
            let color = if is_selected || is_hovered {
                ACCENT_COLOR
            } else {
                MUTED_COLOR
            };

            // Build a single-line paragraph with ellipsis truncation
            let mut paragraph_style = textlayout::ParagraphStyle::new();
            paragraph_style.set_max_lines(1);
            paragraph_style.set_ellipsis("\u{2026}");
            paragraph_style.set_apply_rounding_hack(false);

            let mut text_style = textlayout::TextStyle::new();
            text_style.set_font_size(font_size);
            text_style.set_font_families(&families);
            text_style.set_font_style(skia_safe::FontStyle::new(
                skia_safe::font_style::Weight::MEDIUM,
                skia_safe::font_style::Width::NORMAL,
                skia_safe::font_style::Slant::Upright,
            ));
            // Set explicit wght variation so variable fallback fonts
            // (e.g. Noto Sans KR) render at Medium (500) weight,
            // matching the primary Geist font.
            let wght_coord = skia_safe::font_arguments::variation_position::Coordinate {
                axis: skia_safe::FourByteTag::from(('w', 'g', 'h', 't')),
                value: 500.0,
            };
            let variation_position = skia_safe::font_arguments::VariationPosition {
                coordinates: &[wght_coord],
            };
            let font_args =
                skia_safe::FontArguments::new().set_variation_design_position(variation_position);
            text_style.set_font_arguments(&font_args);
            let mut fg_paint = Paint::default();
            fg_paint.set_color(color);
            fg_paint.set_anti_alias(true);
            text_style.set_foreground_paint(&fg_paint);
            paragraph_style.set_text_style(&text_style);

            let mut builder =
                textlayout::ParagraphBuilder::new(&paragraph_style, fonts.font_collection());
            builder.push_style(&text_style);
            builder.add_text(label);
            let mut paragraph = builder.build();
            paragraph.layout(screen_width);

            let text_width = paragraph.max_intrinsic_width().min(screen_width);
            let para_height = paragraph.height();

            let title_x = screen_tl[0];
            let title_y = screen_tl[1] - title_height;

            // Vertically center the paragraph within the title bar
            let text_y = title_y + (title_height - para_height) * 0.5;

            paragraph.paint(canvas, Point::new(title_x, text_y));

            let hit_rect = Rect::from_xywh(title_x, title_y, text_width, title_height);
            hit_regions.push(HitRegion {
                screen_rect: hit_rect,
                action: OverlayAction::SelectNode(node_id),
            });
        }
    }
}
