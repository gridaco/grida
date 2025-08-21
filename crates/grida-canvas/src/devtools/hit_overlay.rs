use crate::cache::scene::SceneCache;
use crate::devtools::{stroke_overlay, text_overlay};
use crate::fonts::geistmono::sk_font_geistmono;
use crate::node::schema::NodeId;
use crate::painter::layer::Layer;
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::FontRepository;
use crate::sk;
use skia_safe::{Canvas, Color, Font, Paint, PaintStyle, Point, Rect};

thread_local! {
    static BG_PAINT: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::from_argb(160, 0, 0, 0));
        p.set_anti_alias(true);
        p
    };

    static TEXT_PAINT: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::WHITE);
        p.set_anti_alias(true);
        p
    };

    static FONT: Font = sk_font_geistmono(20.0);

    static STROKE: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::from_argb(200, 255, 0, 0));
        p.set_style(PaintStyle::Stroke);
        p.set_stroke_width(4.0);
        p.set_anti_alias(true);
        p
    };

    static FOCUS_STROKE: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::from_argb(200, 0, 0, 255));
        p.set_style(PaintStyle::Stroke);
        p.set_stroke_width(4.0);
        p.set_anti_alias(true);
        p
    };
}

pub struct HitOverlay;

impl HitOverlay {
    pub fn draw(
        canvas: &Canvas,
        hit: Option<&NodeId>,
        focus: Option<&NodeId>,
        camera: &Camera2D,
        cache: &SceneCache,
        fonts: &std::cell::RefCell<FontRepository>,
    ) {
        // Render hit if present
        if let Some(id) = hit {
            if let Some(layer) = cache.layers.layers.iter().find(|l| l.id() == id) {
                if let Some(bounds) = cache.geometry.get_render_bounds(id) {
                    let screen_rect = math2::rect::transform(bounds, &camera.view_matrix());
                    let rect = Rect::from_xywh(
                        screen_rect.x,
                        screen_rect.y,
                        screen_rect.width,
                        screen_rect.height,
                    );

                    let shape = layer.shape();
                    let transform = layer.transform();
                    let mut path = if let Some(entry) = cache.path.borrow().get(id) {
                        (*entry.path).clone()
                    } else {
                        match layer {
                            crate::painter::layer::PainterPictureLayer::Text(t) => {
                                if let Some(text_path) =
                                    text_overlay::TextOverlay::text_layer_baseline(cache, t)
                                {
                                    text_path
                                } else {
                                    // Skip rendering if text path is not available
                                    return;
                                }
                            }
                            _ => shape.to_path(),
                        }
                    };
                    path.transform(&sk::sk_matrix(transform.matrix));
                    path.transform(&sk::sk_matrix(camera.view_matrix().matrix));

                    // background for hit text
                    let hit_text_rect = Rect::from_xywh(10.0, 80.0, 300.0, 40.0);
                    BG_PAINT.with(|bg| {
                        canvas.draw_rect(hit_text_rect, bg);
                    });

                    TEXT_PAINT.with(|paint| {
                        FONT.with(|font| {
                            canvas.draw_str(
                                format!("hit: {}", id),
                                Point::new(24.0, 104.0),
                                font,
                                paint,
                            );
                        });
                    });

                    STROKE.with(|stroke| {
                        canvas.draw_rect(rect, stroke);
                    });

                    // Use the canvas we already have instead of borrowing surface again
                    stroke_overlay::StrokeOverlay::draw(
                        canvas,
                        std::slice::from_ref(id),
                        camera,
                        cache,
                        fonts,
                        None,
                    );
                }
            }
        }

        // Render focus if present (and different from hit)
        if let Some(focus_id) = focus {
            if hit.map_or(true, |hit_id| focus_id != hit_id) {
                if let Some(_focus_layer) = cache.layers.layers.iter().find(|l| l.id() == focus_id)
                {
                    if let Some(focus_bounds) = cache.geometry.get_render_bounds(focus_id) {
                        let focus_screen_rect =
                            math2::rect::transform(focus_bounds, &camera.view_matrix());
                        let focus_rect = Rect::from_xywh(
                            focus_screen_rect.x,
                            focus_screen_rect.y,
                            focus_screen_rect.width,
                            focus_screen_rect.height,
                        );

                        FOCUS_STROKE.with(|focus_stroke| {
                            canvas.draw_rect(focus_rect, focus_stroke);
                        });
                    }
                }
            }
        }
    }
}
