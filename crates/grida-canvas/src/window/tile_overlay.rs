use crate::cache::tile::TileRectKey;
use crate::runtime::camera::Camera2D;
use math2::rect;
use skia_safe::{Color, Paint, PaintStyle, Rect, Surface};
use std::collections::HashMap;
use std::rc::Rc;

pub struct TileOverlay;

impl TileOverlay {
    pub fn draw(
        surface: &mut Surface,
        camera: &Camera2D,
        tiles: &HashMap<TileRectKey, Rc<skia_safe::Image>>,
    ) {
        if tiles.is_empty() {
            return;
        }
        let canvas = surface.canvas();
        let stroke_width = 1.0;
        let mut paint = Paint::default();
        paint.set_style(PaintStyle::Stroke);
        paint.set_color(Color::from_argb(0xFF, 0x00, 0xFF, 0x00));
        paint.set_anti_alias(true);
        paint.set_stroke_width(stroke_width);

        for key in tiles.keys() {
            let rect = key.to_rect();
            let screen_rect = rect::transform(rect, &camera.view_matrix());
            let half = stroke_width * 0.5;
            let r = Rect::from_xywh(
                screen_rect.x + half,
                screen_rect.y + half,
                screen_rect.width - stroke_width,
                screen_rect.height - stroke_width,
            );
            canvas.draw_rect(r, &paint);
        }
    }
}
