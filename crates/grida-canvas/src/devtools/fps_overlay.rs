use skia_safe::{Color, Font, FontMgr, Paint, Point, Rect, Surface};

pub struct FpsMeter;

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
            Some(tf) => Font::new(tf, 36.0),
            None => Font::default(),
        }
    };
}

impl FpsMeter {
    pub fn draw(surface: &mut Surface, fps: f32) {
        let canvas = surface.canvas();
        let rect = Rect::from_xywh(10.0, 10.0, 180.0, 60.0);
        BG_PAINT.with(|bg| {
            canvas.draw_rect(rect, bg);
        });

        TEXT_PAINT.with(|paint| {
            FONT.with(|font| {
                canvas.draw_str(
                    format!("{:.0} fps", fps),
                    Point::new(24.0, 50.0),
                    font,
                    paint,
                );
            });
        });
    }
}
