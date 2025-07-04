use crate::cache::tile::{TileAtZoom, TileRectKey};
use crate::runtime::camera::Camera2D;
use math2::rect;
use skia_safe::{Color, Paint, PaintStyle, Rect, Surface};
use std::collections::HashMap;

pub struct TileOverlay;

impl TileOverlay {
    pub fn draw(
        surface: &mut Surface,
        camera: &Camera2D,
        tiles: &HashMap<TileRectKey, TileAtZoom>,
    ) {
        if tiles.is_empty() {
            return;
        }
        let canvas = surface.canvas();
        let stroke_width = 1.0;
        let mut cell_paint = Paint::default();
        cell_paint.set_style(PaintStyle::Stroke);
        cell_paint.set_color(Color::from_argb(0xFF, 0x00, 0xFF, 0x00));
        cell_paint.set_anti_alias(true);
        cell_paint.set_stroke_width(stroke_width);

        let mut rect_paint = Paint::default();
        rect_paint.set_style(PaintStyle::Stroke);
        rect_paint.set_color(Color::from_argb(0xFF, 0xFF, 0x00, 0x00));
        rect_paint.set_anti_alias(true);
        rect_paint.set_stroke_width(stroke_width);

        for (key, tile) in tiles {
            let rect = key.to_rect();
            let screen_rect = rect::transform(rect, &camera.view_matrix());
            let half = stroke_width * 0.5;
            let r = Rect::from_xywh(
                screen_rect.x + half,
                screen_rect.y + half,
                screen_rect.width - stroke_width,
                screen_rect.height - stroke_width,
            );
            canvas.draw_rect(r, &cell_paint);

            let rect = tile.rect;
            let screen_rect = rect::transform(rect, &camera.view_matrix());
            let r = Rect::from_xywh(
                screen_rect.x + half,
                screen_rect.y + half,
                screen_rect.width - stroke_width,
                screen_rect.height - stroke_width,
            );
            canvas.draw_rect(r, &rect_paint);
        }
    }
}
