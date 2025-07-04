use skia_safe::{Color, Font, FontMgr, Paint, Point, Rect, Surface};

pub struct StatsOverlay;

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
            Some(tf) => Font::new(tf, 16.0),
            None => Font::default(),
        }
    };
}

impl StatsOverlay {
    pub fn draw(surface: &mut Surface, stats: &str) {
        if stats.is_empty() {
            return;
        }
        let lines: Vec<&str> = stats.split('|').map(|s| s.trim()).collect();
        if lines.is_empty() {
            return;
        }
        let line_height = 20.0;
        let padding = 10.0;
        let width = 600.0;
        let height = padding * 2.0 + line_height * lines.len() as f32;
        let rect = Rect::from_xywh(10.0, 130.0, width, height);
        let canvas = surface.canvas();
        BG_PAINT.with(|bg| canvas.draw_rect(rect, bg));
        TEXT_PAINT.with(|paint| {
            FONT.with(|font| {
                for (i, line) in lines.iter().enumerate() {
                    let y = rect.top + padding + line_height * (i as f32 + 1.0);
                    canvas.draw_str(*line, Point::new(rect.left + 14.0, y), font, paint);
                }
            });
        });
    }
}
