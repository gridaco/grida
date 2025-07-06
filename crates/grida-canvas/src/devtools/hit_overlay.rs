use crate::cache::scene::SceneCache;
use crate::node::schema::NodeId;
use crate::painter::{
    cvt,
    layer::{Layer, PainterPictureTextLayer},
};
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::FontRepository;
use skia_safe::{textlayout, Color, Font, FontMgr, Paint, PaintStyle, Path, Point, Rect, Surface};

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

    static FONT: Font = {
        let font_mgr = FontMgr::new();
        let typeface = font_mgr
            .match_family_style("Arial", skia_safe::FontStyle::default())
            .or_else(|| font_mgr.match_family_style("", skia_safe::FontStyle::default()));
        match typeface {
            Some(tf) => Font::new(tf, 20.0),
            None => Font::default(),
        }
    };

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
}

pub struct HitOverlay;

impl HitOverlay {
    pub fn draw(
        surface: &mut Surface,
        hit: Option<&NodeId>,
        camera: &Camera2D,
        cache: &SceneCache,
        fonts: &std::cell::RefCell<FontRepository>,
    ) {
        let id = match hit {
            Some(id) => id,
            None => return,
        };

        let layer = match cache.layers.layers.iter().find(|l| l.id() == id) {
            Some(l) => l,
            None => return,
        };

        let bounds = match cache.geometry.get_render_bounds(id) {
            Some(b) => b,
            None => return,
        };

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

        let canvas = surface.canvas();

        // background for text
        let text_rect = Rect::from_xywh(10.0, 80.0, 300.0, 40.0);
        BG_PAINT.with(|bg| {
            canvas.draw_rect(text_rect, bg);
        });

        TEXT_PAINT.with(|paint| {
            FONT.with(|font| {
                canvas.draw_str(format!("hit: {}", id), Point::new(24.0, 104.0), font, paint);
            });
        });

        STROKE.with(|stroke| {
            canvas.draw_rect(rect, stroke);
        });

        PATH_STROKE.with(|stroke| {
            canvas.draw_path(&path, stroke);
        });
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
            .unwrap_or(crate::node::schema::Paint::Solid(
                crate::node::schema::SolidPaint {
                    color: crate::node::schema::Color(0, 0, 0, 255),
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
