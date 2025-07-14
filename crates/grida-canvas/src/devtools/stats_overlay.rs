use crate::fonts::geistmono::sk_font_geistmono;
use crate::sys::clock::Ticker;
use skia_safe::{Color, Font, Paint, Point, Rect, Surface};

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

    static FONT: Font = sk_font_geistmono(16.0);
}

impl StatsOverlay {
    pub fn draw<T: Ticker>(surface: &mut Surface, stats: &str, clock: &T) {
        if stats.is_empty() {
            return;
        }
        let lines: Vec<&str> = stats.split('|').map(|s| s.trim()).collect();
        if lines.is_empty() {
            return;
        }

        // Format clock information
        let clock_info = format!(
            "clock: {:.1}s elapsed | {:.1}Hz | {:.1}ms delta",
            clock.elapsed().as_secs_f64(),
            clock.hz(),
            clock.delta().as_secs_f64() * 1000.0
        );

        // Add clock info as the first line
        let mut all_lines = vec![clock_info.as_str()];
        all_lines.extend_from_slice(&lines);

        let line_height = 20.0;
        let padding = 10.0;
        let width = 600.0;
        let height = padding * 2.0 + line_height * all_lines.len() as f32;
        let rect = Rect::from_xywh(10.0, 130.0, width, height);
        let canvas = surface.canvas();
        BG_PAINT.with(|bg| canvas.draw_rect(rect, bg));
        TEXT_PAINT.with(|paint| {
            FONT.with(|font| {
                for (i, line) in all_lines.iter().enumerate() {
                    let y = rect.top + padding + line_height * (i as f32 + 1.0);
                    canvas.draw_str(*line, Point::new(rect.left + 14.0, y), font, paint);
                }
            });
        });
    }
}
