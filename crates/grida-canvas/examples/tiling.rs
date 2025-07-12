use skia_safe::{surfaces, Canvas, Color, Image, Paint, Picture, PictureRecorder, Rect};
use std::path::Path;

struct TiledScene {
    picture: Picture,
    width: f32,
    height: f32,
}

impl TiledScene {
    fn new(width: f32, height: f32) -> Self {
        // Create a recorder to capture the scene
        let mut recorder = PictureRecorder::new();
        let bounds = Rect::new(0.0, 0.0, width, height);
        let canvas = recorder.begin_recording(bounds, None);

        // Draw 100 rectangles in a grid
        Self::draw_rectangles(canvas);

        // End recording and create the picture
        let picture = recorder.finish_recording_as_picture(None).unwrap();

        Self {
            picture,
            width,
            height,
        }
    }

    fn draw_rectangles(canvas: &Canvas) {
        println!("Drawing 100 rectangles");
        // Draw a grid of rectangles
        for i in 0..10 {
            for j in 0..10 {
                let mut paint = Paint::default();
                // Create a gradient of colors
                let r = (i * 25) as u8;
                let g = (j * 25) as u8;
                let b = ((i + j) * 12) as u8;
                paint.set_color(Color::from_argb(255, r, g, b));

                let x = i as f32 * 100.0;
                let y = j as f32 * 100.0;
                let rect = Rect::new(x, y, x + 80.0, y + 80.0);
                canvas.draw_rect(rect, &paint);
            }
        }
    }

    fn render_to_tiles(&self, tile_size: i32) -> Vec<Image> {
        let mut tiles = Vec::new();
        let cols = (self.width as i32 + tile_size - 1) / tile_size;
        let rows = (self.height as i32 + tile_size - 1) / tile_size;

        for row in 0..rows {
            for col in 0..cols {
                // Create a surface for this tile
                let mut surface = surfaces::raster_n32_premul((tile_size, tile_size))
                    .expect("Failed to create surface for tile");
                let canvas = surface.canvas();

                // Clear the tile
                canvas.clear(Color::from_argb(255, 255, 255, 255));

                // Calculate the offset for this tile
                let offset_x = -(col * tile_size) as f32;
                let offset_y = -(row * tile_size) as f32;

                // Apply the offset
                canvas.save();
                canvas.translate((offset_x, offset_y));

                // Draw the picture
                canvas.draw_picture(&self.picture, None, None);

                canvas.restore();

                // Convert the surface to an image
                let image = surface.image_snapshot();
                tiles.push(image);
            }
        }

        tiles
    }
}

fn save_tiles(tiles: &[Image], output_dir: &str) {
    let output_path = Path::new(output_dir);
    std::fs::create_dir_all(output_path).expect("Failed to create output directory");

    for (i, tile) in tiles.iter().enumerate() {
        let file_path = output_path.join(format!("tile_{:03}.png", i));
        if let Some(data) = tile.encode(None, skia_safe::EncodedImageFormat::PNG, None) {
            std::fs::write(file_path, data.as_bytes()).expect("Failed to write tile");
        }
    }
}

fn main() {
    // Create a scene with 1000x1000 dimensions
    let scene = TiledScene::new(1000.0, 1000.0);

    // Render the scene into 200x200 tiles
    let tiles = scene.render_to_tiles(200);

    // Save the tiles to the output directory
    save_tiles(&tiles, "tiles_output");

    println!("Generated {} tiles in tiles_output directory", tiles.len());
}
