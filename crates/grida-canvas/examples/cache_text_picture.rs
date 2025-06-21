use skia_safe::textlayout::{
    FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle, TextStyle,
};
use skia_safe::{Color, Picture, PictureRecorder, Point, Rect, Surface};
use std::time::{Duration, Instant};

fn make_paragraph(fc: &FontCollection, text: &str, width: f32, font_size: f32) -> Paragraph {
    let mut ps = ParagraphStyle::new();
    ps.set_text_align(skia_safe::textlayout::TextAlign::Left);
    let mut builder = ParagraphBuilder::new(&ps, fc);
    let mut ts = TextStyle::new();
    ts.set_font_size(font_size);
    builder.push_style(&ts);
    builder.add_text(text);
    let mut paragraph = builder.build();
    paragraph.layout(width);
    paragraph
}

fn make_picture(fc: &FontCollection, texts: &[(&str, f32)], width: f32, height: f32) -> Picture {
    let mut recorder = PictureRecorder::new();
    let canvas = recorder.begin_recording(Rect::from_xywh(0.0, 0.0, width, height), None);

    let mut y_offset = 0.0;
    for (text, font_size) in texts {
        let para = make_paragraph(fc, text, width, *font_size);
        para.paint(canvas, Point::new(0.0, y_offset));
        y_offset += para.height() + 20.0; // Add some spacing between paragraphs
    }

    recorder.finish_recording_as_picture(None).unwrap()
}

fn run(
    use_cache: bool,
    surface: &mut Surface,
    fc: &FontCollection,
    pic: &Picture,
    texts: &[(&str, f32)],
) -> Duration {
    let width = surface.width() as f32;
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    let start = Instant::now();

    if use_cache {
        canvas.draw_picture(pic, None, None);
    } else {
        let mut y_offset = 0.0;
        for (text, font_size) in texts {
            let para = make_paragraph(fc, text, width, *font_size);
            para.paint(canvas, Point::new(0.0, y_offset));
            y_offset += para.height() + 20.0;
        }
    }

    start.elapsed()
}

fn main() {
    let fc = FontCollection::new();

    // Create a more complex text content with multiple paragraphs
    let text1 = "The quick brown fox jumps over the lazy dog. ".repeat(20);
    let text2 = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(15);
    let text3 = "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(10);
    let text4 = "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ".repeat(8);

    let texts: Vec<(&str, f32)> = vec![
        (text1.as_str(), 16.0),
        (text2.as_str(), 20.0),
        (text3.as_str(), 24.0),
        (text4.as_str(), 18.0),
    ];

    let width = 1200;
    let height = 2000;
    let mut surface = Surface::new_raster_n32_premul((width, height)).unwrap();
    let pic = make_picture(&fc, &texts, width as f32, height as f32);

    const FRAMES: usize = 500; // Increased number of frames for better statistics
    let mut cached_times = Vec::with_capacity(FRAMES);
    let mut uncached_times = Vec::with_capacity(FRAMES);

    // Warmup phase
    for _ in 0..20 {
        // Increased warmup iterations
        run(true, &mut surface, &fc, &pic, &texts);
        run(false, &mut surface, &fc, &pic, &texts);
    }

    // Benchmark phase
    for _ in 0..FRAMES {
        cached_times.push(run(true, &mut surface, &fc, &pic, &texts));
        uncached_times.push(run(false, &mut surface, &fc, &pic, &texts));
    }

    // Calculate statistics
    let avg_cached: Duration = cached_times.iter().sum::<Duration>() / FRAMES as u32;
    let avg_uncached: Duration = uncached_times.iter().sum::<Duration>() / FRAMES as u32;

    // Calculate standard deviation
    let cached_std: f64 = cached_times
        .iter()
        .map(|&d| (d.as_nanos() as f64 - avg_cached.as_nanos() as f64).powi(2))
        .sum::<f64>()
        .sqrt()
        / (FRAMES as f64).sqrt();

    let uncached_std: f64 = uncached_times
        .iter()
        .map(|&d| (d.as_nanos() as f64 - avg_uncached.as_nanos() as f64).powi(2))
        .sum::<f64>()
        .sqrt()
        / (FRAMES as f64).sqrt();

    println!("Benchmark Results:");
    println!("Cached avg: {:?} (±{:.2}ns)", avg_cached, cached_std);
    println!("Uncached avg: {:?} (±{:.2}ns)", avg_uncached, uncached_std);
    println!(
        "Speedup: {:.2}x",
        avg_uncached.as_secs_f64() / avg_cached.as_secs_f64()
    );
}
