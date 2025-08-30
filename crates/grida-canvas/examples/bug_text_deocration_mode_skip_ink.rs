use skia_safe::{
    surfaces,
    textlayout::{
        Decoration, FontCollection, ParagraphBuilder, ParagraphStyle, TextAlign, TextDecoration,
        TextDecorationMode, TextDirection,
    },
    Color, FontMgr, Paint, Point,
};

fn main() {
    let mut surface = surfaces::raster_n32_premul((400, 300)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let font_mgr = FontMgr::new();
    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut font_collection = FontCollection::new();
    font_collection.set_default_font_manager(font_mgr.clone(), None);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Section 1: Gaps mode
    let mut ts1 = skia_safe::textlayout::TextStyle::new();
    ts1.set_font_size(32.0);
    ts1.set_foreground_paint(&paint);
    ts1.set_decoration(&Decoration {
        ty: TextDecoration::UNDERLINE,
        mode: TextDecorationMode::Gaps,
        color: Color::RED,
        style: skia_safe::textlayout::TextDecorationStyle::Solid,
        thickness_multiplier: 2.0,
    });

    let mut builder1 = ParagraphBuilder::new(&paragraph_style, &font_collection);
    builder1.push_style(&ts1);
    builder1.add_text("Ag"); // 'g' has descender
    let mut paragraph1 = builder1.build();
    paragraph1.layout(200.0);
    paragraph1.paint(canvas, Point::new(50.0, 50.0));

    let mut builder2 = ParagraphBuilder::new(&paragraph_style, &font_collection);
    builder2.push_style(&ts1);
    builder2.add_text("AG"); // No descenders
    let mut paragraph2 = builder2.build();
    paragraph2.layout(200.0);
    paragraph2.paint(canvas, Point::new(50.0, 100.0));

    // Section 2: Through mode
    let mut ts2 = skia_safe::textlayout::TextStyle::new();
    ts2.set_font_size(32.0);
    ts2.set_foreground_paint(&paint);
    ts2.set_decoration(&Decoration {
        ty: TextDecoration::UNDERLINE,
        mode: TextDecorationMode::Through,
        color: Color::BLUE,
        style: skia_safe::textlayout::TextDecorationStyle::Solid,
        thickness_multiplier: 2.0,
    });

    let mut builder3 = ParagraphBuilder::new(&paragraph_style, &font_collection);
    builder3.push_style(&ts2);
    builder3.add_text("Ag"); // 'g' has descender
    let mut paragraph3 = builder3.build();
    paragraph3.layout(200.0);
    paragraph3.paint(canvas, Point::new(50.0, 150.0));

    let mut builder4 = ParagraphBuilder::new(&paragraph_style, &font_collection);
    builder4.push_style(&ts2);
    builder4.add_text("AG"); // No descenders
    let mut paragraph4 = builder4.build();
    paragraph4.layout(200.0);
    paragraph4.paint(canvas, Point::new(50.0, 200.0));

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        "goldens/bug_text_decoration_mode_skip_ink.png",
        data.as_bytes(),
    )
    .unwrap();
    println!("Generated bug_text_decoration_mode_skip_ink.png");
}
