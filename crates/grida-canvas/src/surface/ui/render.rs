use crate::cache::scene::SceneCache;
use crate::cg::types::Paint as CGPaint;
use crate::devtools::surface_overlay::SurfaceOverlayConfig;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{Node, NodeId};
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
const MIN_TITLE_WIDTH: f32 = 40.0;

/// Padding inside the tray badge pill (logical px).
const BADGE_PAD_X: f32 = 8.0;
const BADGE_PAD_Y: f32 = 4.0;
/// Corner radius of the tray badge pill.
const BADGE_RADIUS: f32 = 4.0;
/// Extra gap (logical px) between the badge pill bottom and the tray content top.
const BADGE_GAP_Y: f32 = 6.0;
/// Fallback badge background color when the tray has no solid fill.
const BADGE_BG_FALLBACK: Color = Color::from_argb(30, 120, 120, 120);
/// Alpha multiplier applied to the badge background on hover to darken it.
const BADGE_HOVER_DARKEN: f32 = 0.9;
/// Darken factor for the adaptive badge stroke (slightly darker than the fill).
const BADGE_STROKE_DARKEN: f32 = 0.8;
/// Badge stroke width (logical px).
const BADGE_STROKE_WIDTH: f32 = 1.0;

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

/// Visual style variant for a node label.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LabelVariant {
    /// Plain text label (frame title style) — used for root containers.
    Plain,
    /// Badge with a background pill — used for Tray nodes.
    Badge,
}

/// A collected node label to render.
struct NodeLabel {
    node_id: NodeId,
    name: Option<String>,
    variant: LabelVariant,
    /// For Badge variant: the tray's own background color (first solid fill),
    /// used as the pill fill for good aesthetics.
    badge_bg: Option<Color>,
}

/// Extract the first active solid fill color from a `Paints` collection,
/// converted to a Skia `Color`.
fn first_solid_fill(paints: &crate::cg::types::Paints) -> Option<Color> {
    for p in paints.iter() {
        if let CGPaint::Solid(s) = p {
            if s.active {
                return Some(s.color.into());
            }
        }
    }
    None
}

/// Perceived brightness using BT.601 luma coefficients.
/// Returns `true` when the colour is light (→ use black text).
#[inline]
fn is_light_color(c: Color) -> bool {
    let luma = 0.299 * c.r() as f32 + 0.587 * c.g() as f32 + 0.114 * c.b() as f32;
    luma > 128.0
}

/// Darken a colour by multiplying each RGB channel by `factor` (0..1).
#[inline]
fn darken(c: Color, factor: f32) -> Color {
    Color::from_argb(
        c.a(),
        (c.r() as f32 * factor) as u8,
        (c.g() as f32 * factor) as u8,
        (c.b() as f32 * factor) as u8,
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

    /// Collect nodes that should display a title label.
    ///
    /// Labels are shown for:
    /// - Root nodes (containers and trays at the scene root)
    /// - "Root-like" containers: containers that are direct children of a Tray
    ///   (since Tray children are treated as root-level frames)
    fn collect_labeled_nodes(graph: &SceneGraph) -> Vec<NodeLabel> {
        let mut labels = Vec::new();

        for &root_id in graph.roots() {
            let Ok(node) = graph.get_node(&root_id) else {
                continue;
            };

            match node {
                Node::Tray(tray) => {
                    let bg = first_solid_fill(&tray.fills);

                    // Tray itself gets a badge label
                    labels.push(NodeLabel {
                        node_id: root_id,
                        name: graph.get_name(&root_id).map(str::to_owned),
                        variant: LabelVariant::Badge,
                        badge_bg: bg,
                    });

                    // Tray's direct children that are containers get plain labels
                    // (they are "root-like" — treated as top-level frames)
                    if let Some(children) = graph.get_children(&root_id) {
                        for &child_id in children {
                            if let Ok(child_node) = graph.get_node(&child_id) {
                                if matches!(child_node, Node::Container(_)) {
                                    labels.push(NodeLabel {
                                        node_id: child_id,
                                        name: graph.get_name(&child_id).map(str::to_owned),
                                        variant: LabelVariant::Plain,
                                        badge_bg: None,
                                    });
                                }
                            }
                        }
                    }
                }
                Node::Container(_) => {
                    // Root containers get plain labels (frame title bars)
                    labels.push(NodeLabel {
                        node_id: root_id,
                        name: graph.get_name(&root_id).map(str::to_owned),
                        variant: LabelVariant::Plain,
                        badge_bg: None,
                    });
                }
                _ => {
                    // Other root nodes (groups, shapes, etc.) — no label
                }
            }
        }

        labels
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

        // Screen-space viewport bounds for culling (with generous margin for
        // title bars that sit above / below the node).
        let vp_size = camera.get_size();
        let screen_w = vp_size.width * dpr;
        let screen_h = vp_size.height * dpr;
        let margin = title_height + BADGE_GAP_Y * dpr + 50.0 * dpr;
        let vp_top = -margin;
        let vp_bottom = screen_h + margin;
        let vp_left = -margin;
        let vp_right = screen_w + margin;

        // Build font families list: primary + user fallback fonts
        let fallbacks = fonts.user_fallback_families();
        let mut families: Vec<&str> = Vec::with_capacity(1 + fallbacks.len());
        families.push(crate::fonts::embedded::geist::FAMILY);
        for f in &fallbacks {
            families.push(f.as_str());
        }

        // Pre-scaled badge metrics (constant across labels)
        let badge_pad_x = BADGE_PAD_X * dpr;
        let badge_pad_y = BADGE_PAD_Y * dpr;
        let badge_radius = BADGE_RADIUS * dpr;
        let badge_gap_y = BADGE_GAP_Y * dpr;

        // ── Hoisted style objects (shared across all labels) ────────────
        let wght_coord = skia_safe::font_arguments::variation_position::Coordinate {
            axis: skia_safe::FourByteTag::from(('w', 'g', 'h', 't')),
            value: 500.0,
        };
        let variation_position = skia_safe::font_arguments::VariationPosition {
            coordinates: &[wght_coord],
        };
        let font_args =
            skia_safe::FontArguments::new().set_variation_design_position(variation_position);

        let font_style = skia_safe::FontStyle::new(
            skia_safe::font_style::Weight::MEDIUM,
            skia_safe::font_style::Width::NORMAL,
            skia_safe::font_style::Slant::Upright,
        );

        // Base paragraph style — shared across all labels (immutable fields).
        let mut base_para_style = textlayout::ParagraphStyle::new();
        base_para_style.set_max_lines(1);
        base_para_style.set_ellipsis("\u{2026}");
        base_para_style.set_apply_rounding_hack(false);

        // Pre-create text-colour paints (only 4 possible colours)
        let mut paint_black = Paint::default();
        paint_black.set_color(Color::BLACK);
        paint_black.set_anti_alias(true);

        let mut paint_white = Paint::default();
        paint_white.set_color(Color::WHITE);
        paint_white.set_anti_alias(true);

        let mut paint_muted = Paint::default();
        paint_muted.set_color(MUTED_COLOR);
        paint_muted.set_anti_alias(true);

        let mut paint_accent = Paint::default();
        paint_accent.set_color(ACCENT_COLOR);
        paint_accent.set_anti_alias(true);

        // Pre-create badge stroke paint (reuse, only change color per label)
        let mut stroke_paint = Paint::default();
        stroke_paint.set_style(PaintStyle::Stroke);
        stroke_paint.set_stroke_width(BADGE_STROKE_WIDTH * dpr);
        stroke_paint.set_anti_alias(true);

        // Pre-create badge fill paint (reuse, only change color per label)
        let mut fill_paint = Paint::default();
        fill_paint.set_style(PaintStyle::Fill);
        fill_paint.set_anti_alias(true);

        let font_collection = fonts.font_collection();

        let labeled_nodes = Self::collect_labeled_nodes(graph);

        for NodeLabel {
            node_id,
            name,
            variant,
            badge_bg,
        } in &labeled_nodes
        {
            let world_bounds = match cache.geometry.get_world_bounds(node_id) {
                Some(b) => b,
                None => continue,
            };

            // Transform node's top-left and top-right to screen space
            let screen_tl = math2::vector2::transform([world_bounds.x, world_bounds.y], &view);
            let screen_tr = math2::vector2::transform(
                [world_bounds.x + world_bounds.width, world_bounds.y],
                &view,
            );
            let screen_width = (screen_tr[0] - screen_tl[0]).abs();

            if screen_width < min_width {
                continue;
            }

            // ── Viewport culling ───────────────────────────────────────
            // The title bar sits above the node (Plain) or above with a gap
            // (Badge). If the title region is entirely outside the viewport,
            // skip the expensive paragraph creation.
            let label_top = screen_tl[1] - title_height - badge_gap_y;
            let label_bottom = screen_tl[1];
            let label_left = screen_tl[0];
            let label_right = screen_tl[0] + screen_width;

            if label_bottom < vp_top
                || label_top > vp_bottom
                || label_right < vp_left
                || label_left > vp_right
            {
                continue;
            }

            let label: &str = name.as_deref().unwrap_or_else(|| match variant {
                LabelVariant::Badge => "Tray",
                LabelVariant::Plain => "Container",
            });

            let is_selected = surface.selection.contains(node_id);
            let is_hovered = surface.hover.hovered() == Some(node_id);

            // ── Determine text colour paint ─────────────────────────────
            let fg_paint = match variant {
                LabelVariant::Badge => {
                    let bg = badge_bg.unwrap_or(BADGE_BG_FALLBACK);
                    if is_light_color(bg) {
                        &paint_black
                    } else {
                        &paint_white
                    }
                }
                LabelVariant::Plain => {
                    if is_selected || is_hovered {
                        &paint_accent
                    } else {
                        &paint_muted
                    }
                }
            };

            // Build text style with the chosen foreground paint
            let mut text_style = textlayout::TextStyle::new();
            text_style.set_font_size(font_size);
            text_style.set_font_families(&families);
            text_style.set_font_style(font_style);
            text_style.set_font_arguments(&font_args);
            text_style.set_foreground_paint(fg_paint);

            // Clone the base paragraph style and apply text style
            let mut paragraph_style = base_para_style.clone();
            paragraph_style.set_text_style(&text_style);

            // For Badge variant, limit paragraph width to leave room for padding
            let para_max_width = match variant {
                LabelVariant::Badge => (screen_width - badge_pad_x * 2.0).max(0.0),
                LabelVariant::Plain => screen_width,
            };

            let mut builder = textlayout::ParagraphBuilder::new(&paragraph_style, font_collection);
            builder.push_style(&text_style);
            builder.add_text(label);
            let mut paragraph = builder.build();
            paragraph.layout(para_max_width);

            let text_width = paragraph.max_intrinsic_width().min(para_max_width);
            let para_height = paragraph.height();

            let title_x = screen_tl[0];
            let title_y = screen_tl[1] - title_height;

            match variant {
                LabelVariant::Badge => {
                    // Draw a background pill behind the label, with extra gap below
                    let pill_w = text_width + badge_pad_x * 2.0;
                    let pill_h = para_height + badge_pad_y * 2.0;
                    let pill_x = title_x;
                    // Position pill so its bottom edge sits `badge_gap_y` above the tray top
                    let pill_y = screen_tl[1] - pill_h - badge_gap_y;

                    let pill_rect = Rect::from_xywh(pill_x, pill_y, pill_w, pill_h);
                    let rrect = RRect::new_rect_xy(pill_rect, badge_radius, badge_radius);

                    // Badge background: tray fill colour.
                    //  - hover  → darken the background
                    //  - select → no change (original)
                    let base_bg = badge_bg.unwrap_or(BADGE_BG_FALLBACK);
                    let bg_color = if is_hovered && !is_selected {
                        darken(base_bg, BADGE_HOVER_DARKEN)
                    } else {
                        base_bg
                    };

                    fill_paint.set_color(bg_color);
                    canvas.draw_rrect(rrect, &fill_paint);

                    // Adaptive stroke — slightly darker than the fill
                    stroke_paint.set_color(darken(base_bg, BADGE_STROKE_DARKEN));
                    canvas.draw_rrect(rrect, &stroke_paint);

                    // Draw text inside the pill
                    let text_x = pill_x + badge_pad_x;
                    let text_y = pill_y + badge_pad_y;
                    paragraph.paint(canvas, Point::new(text_x, text_y));

                    // Hit region covers the pill
                    hit_regions.push(HitRegion {
                        screen_rect: pill_rect,
                        action: OverlayAction::SelectNode(*node_id),
                    });
                }
                LabelVariant::Plain => {
                    // Plain text label (original frame title style)
                    let text_y = title_y + (title_height - para_height) * 0.5;
                    paragraph.paint(canvas, Point::new(title_x, text_y));

                    let hit_rect = Rect::from_xywh(title_x, title_y, text_width, title_height);
                    hit_regions.push(HitRegion {
                        screen_rect: hit_rect,
                        action: OverlayAction::SelectNode(*node_id),
                    });
                }
            }
        }
    }
}
