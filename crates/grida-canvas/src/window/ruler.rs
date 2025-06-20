use crate::runtime::camera::Camera2D;
use math2::{rect::Rectangle, vector2};
use skia_safe::{Color, Font, FontMgr, Paint, PaintStyle, Path, Point, Surface};
use std::cell::RefCell;

pub struct Ruler;

struct Cache {
    rect: Rectangle,
    zoom: f32,
    path: Path,
    v_labels: Vec<(Point, String)>,
    h_labels: Vec<(Point, String)>,
}

thread_local! {
    static LINE_PAINT: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::from_argb(100, 200, 200, 200));
        p.set_style(PaintStyle::Stroke);
        p.set_stroke_width(1.0);
        p.set_anti_alias(true);
        p
    };

    static TEXT_PAINT: Paint = {
        let mut p = Paint::default();
        p.set_color(Color::from_argb(180, 220, 220, 220));
        p.set_anti_alias(true);
        p
    };

    static FONT: Font = {
        let font_mgr = FontMgr::new();
        let typeface = font_mgr
            .match_family_style("Arial", skia_safe::FontStyle::default())
            .or_else(|| font_mgr.match_family_style("", skia_safe::FontStyle::default()));
        match typeface {
            Some(tf) => Font::new(tf, 10.0),
            None => Font::default(),
        }
    };

    static CACHE: RefCell<Option<Cache>> = RefCell::new(None);
}

impl Ruler {
    pub fn draw(surface: &mut Surface, camera: &Camera2D) {
        const STEPS: [f32; 12] = [
            1.0, 2.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0,
        ];
        const MIN_PX_PER_TICK: f32 = 50.0;
        let zoom = camera.get_zoom();
        let step = STEPS
            .iter()
            .find(|s| **s * zoom >= MIN_PX_PER_TICK)
            .copied()
            .unwrap_or_else(|| STEPS[STEPS.len() - 1]);

        let world_rect = camera.rect();
        let view = camera.view_matrix();

        let canvas = surface.canvas();
        let width = camera.size.width;
        let height = camera.size.height;

        CACHE.with(|c| {
            let mut cache = c.borrow_mut();
            let needs_update = match &*cache {
                Some(cached) => {
                    cached.rect != world_rect || (cached.zoom - zoom).abs() > f32::EPSILON
                }
                None => true,
            };

            if needs_update {
                let mut path = Path::new();
                let mut v_labels = Vec::new();
                let mut h_labels = Vec::new();

                let mut t = (world_rect.x / step).floor() * step;
                while t <= world_rect.x + world_rect.width {
                    let p = vector2::transform([t, world_rect.y], &view);
                    let x = p[0];
                    path.move_to(Point::new(x, 0.0));
                    path.line_to(Point::new(x, height));
                    v_labels.push((Point::new(x + 2.0, 12.0), format!("{:.0}", t)));
                    t += step;
                }

                let mut t = (world_rect.y / step).floor() * step;
                while t <= world_rect.y + world_rect.height {
                    let p = vector2::transform([world_rect.x, t], &view);
                    let y = p[1];
                    path.move_to(Point::new(0.0, y));
                    path.line_to(Point::new(width, y));
                    h_labels.push((Point::new(2.0, y - 2.0), format!("{:.0}", t)));
                    t += step;
                }

                *cache = Some(Cache {
                    rect: world_rect,
                    zoom,
                    path,
                    v_labels,
                    h_labels,
                });
            }

            if let Some(cached) = &*cache {
                LINE_PAINT.with(|line_paint| {
                    canvas.draw_path(&cached.path, line_paint);
                });
                TEXT_PAINT.with(|text_paint| {
                    FONT.with(|font| {
                        for (pt, text) in cached.v_labels.iter() {
                            canvas.draw_str(text, *pt, font, text_paint);
                        }
                        for (pt, text) in cached.h_labels.iter() {
                            canvas.draw_str(text, *pt, font, text_paint);
                        }
                    });
                });
            }
        });
    }
}
