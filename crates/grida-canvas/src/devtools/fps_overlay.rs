use skia_safe::{Canvas, Color, Font, Paint, Point, Rect};

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

    static FONT: Font = Font::new(crate::fonts::embedded::typeface(crate::fonts::embedded::geistmono::BYTES), 36.0);
}

impl FpsMeter {
    pub fn draw(canvas: &Canvas, fps: f32) {
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
