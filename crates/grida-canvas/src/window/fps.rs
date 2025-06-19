use skia_safe::{Color, Font, FontMgr, Paint, Point, Rect, Surface};

pub struct FpsMeter;

impl FpsMeter {
    pub fn draw(surface: &mut Surface, fps: f32) {
        let canvas = surface.canvas();
        let mut bg = Paint::default();
        bg.set_color(Color::from_argb(160, 0, 0, 0));
        bg.set_anti_alias(true);
        let rect = Rect::from_xywh(10.0, 10.0, 180.0, 60.0);
        canvas.draw_rect(rect, &bg);

        let mut paint = Paint::default();
        paint.set_color(Color::WHITE);
        paint.set_anti_alias(true);

        let font_mgr = FontMgr::new();
        let typeface = font_mgr
            .match_family_style("Arial", skia_safe::FontStyle::default())
            .unwrap_or_else(|| {
                font_mgr
                    .match_family_style("", skia_safe::FontStyle::default())
                    .unwrap()
            });
        let font = Font::new(typeface, 36.0);
        canvas.draw_str(
            format!("{:.0} fps", fps),
            Point::new(24.0, 50.0),
            &font,
            &paint,
        );
    }
}
