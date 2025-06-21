use skia_safe::{Color, Font, FontMgr, Paint, PaintStyle, Point, Rect, Surface};

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
        p.set_stroke_width(2.0);
        p.set_anti_alias(true);
        p
    };
}

pub struct HitOverlay;

impl HitOverlay {
    pub fn draw(surface: &mut Surface, hit: Option<(&str, Rect)>) {
        let Some((id, rect)) = hit else {
            return;
        };
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
    }
}
