use skia_safe::{Color, Font, FontMgr, Paint, PaintStyle, Point, Rect, Surface};

pub struct HitOverlay;

impl HitOverlay {
    pub fn draw(surface: &mut Surface, hit: Option<(&str, Rect)>) {
        if hit.is_none() {
            return;
        }
        let (id, rect) = hit.unwrap();
        let canvas = surface.canvas();

        // background for text
        let mut bg = Paint::default();
        bg.set_color(Color::from_argb(160, 0, 0, 0));
        bg.set_anti_alias(true);
        let text_rect = Rect::from_xywh(10.0, 80.0, 300.0, 40.0);
        canvas.draw_rect(text_rect, &bg);

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
        let font = Font::new(typeface, 20.0);
        canvas.draw_str(
            format!("hit: {}", id),
            Point::new(24.0, 104.0),
            &font,
            &paint,
        );

        // highlight rect on canvas
        let mut stroke = Paint::default();
        stroke.set_color(Color::from_argb(200, 255, 0, 0));
        stroke.set_style(PaintStyle::Stroke);
        stroke.set_stroke_width(2.0);
        stroke.set_anti_alias(true);
        canvas.draw_rect(rect, &stroke);
    }
}
