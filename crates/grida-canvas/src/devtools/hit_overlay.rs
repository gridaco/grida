use crate::cache::scene::SceneCache;
use crate::fonts::geistmono::sk_font_geistmono;
use crate::node::schema::NodeId;
use crate::painter::{
    cvt,
    layer::{Layer, PainterPictureTextLayer},
};
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::FontRepository;
use skia_safe::{textlayout, Color, Font, Paint, PaintStyle, Path, Point, Rect, Surface};

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

    static PATH_STROKE: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::from_argb(200, 0, 255, 0));
        p.set_style(PaintStyle::Stroke);
        p.set_stroke_width(3.0);
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
        surface: &mut Surface,
        hit: Option<&NodeId>,
        focus: Option<&NodeId>,
        camera: &Camera2D,
        cache: &SceneCache,
        fonts: &std::cell::RefCell<FontRepository>,
    ) {
        let canvas = surface.canvas();

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

                    let base = match layer {
                        crate::painter::layer::PainterPictureLayer::Shape(s) => &s.base,
                        crate::painter::layer::PainterPictureLayer::Text(t) => &t.base,
                    };
                    let mut path = if let Some(entry) = cache.path.borrow().get(id) {
                        (*entry.path).clone()
                    } else {
                        match layer {
                            crate::painter::layer::PainterPictureLayer::Text(t) => {
                                Self::text_layer_path(&fonts.borrow(), t)
                            }
                            _ => base.shape.to_path(),
                        }
                    };
                    path.transform(&cvt::sk_matrix(base.transform.matrix));
                    path.transform(&cvt::sk_matrix(camera.view_matrix().matrix));

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

                    PATH_STROKE.with(|stroke| {
                        canvas.draw_path(&path, stroke);
                    });
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

    fn text_layer_path(fonts: &FontRepository, layer: &PainterPictureTextLayer) -> Path {
        let size = crate::node::schema::Size {
            width: layer.base.shape.rect.width(),
            height: layer.base.shape.rect.height(),
        };
        let fill = layer
            .base
            .fills
            .first()
            .cloned()
            .unwrap_or(crate::cg::types::Paint::Solid(
                crate::cg::types::SolidPaint {
                    color: crate::cg::CGColor(0, 0, 0, 255),
                    opacity: 1.0,
                },
            ));
        let fill_paint = cvt::sk_paint(&fill, 1.0, (size.width, size.height));

        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(layer.text_align.clone().into());

        let mut builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());

        let mut ts = crate::painter::make_textstyle(&layer.text_style);
        ts.set_foreground_paint(&fill_paint);
        builder.push_style(&ts);
        let transformed_text = crate::text::text_transform::transform_text(
            &layer.text,
            layer.text_style.text_transform,
        );
        builder.add_text(&transformed_text);
        let mut paragraph = builder.build();
        builder.pop();
        paragraph.layout(size.width);

        let mut path = Path::new();
        let lines = paragraph.line_number();
        for i in 0..lines {
            let (_, line_path) = paragraph.get_path_at(i);
            path.add_path(&line_path, (0.0, 0.0), None);
        }
        path
    }
}
