use skia_safe::{
    color_filters, gradient_shader, image_filters, paint, pdf, Color, Data, Document, Font,
    FontMgr, FontStyle, Image, Matrix, Paint, PaintStyle, PathBuilder, PathEffect, Point, Rect,
    SamplingOptions, Size, TextBlob, TileMode,
};
use std::ffi::CString;
use std::fs::File;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_W: f32 = 1920.0;
const PAGE_H: f32 = 1080.0;

/// Helper: create a `Paint` with the given ARGB colour (fill).
fn fill(r: u8, g: u8, b: u8) -> Paint {
    let mut p = Paint::default();
    p.set_color(Color::from_rgb(r, g, b));
    p.set_anti_alias(true);
    p
}

/// Helper: create a `Paint` with the given ARGB colour and alpha (fill).
fn fill_a(r: u8, g: u8, b: u8, a: u8) -> Paint {
    let mut p = Paint::default();
    p.set_color(Color::from_argb(a, r, g, b));
    p.set_anti_alias(true);
    p
}

/// Helper: create a stroke `Paint`.
fn stroke(r: u8, g: u8, b: u8, width: f32) -> Paint {
    let mut p = Paint::default();
    p.set_color(Color::from_rgb(r, g, b));
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Stroke);
    p.set_stroke_width(width);
    p
}

/// Demonstrates **all practical Skia PDF patterns** across 10 themed pages.
///
/// Each page focuses on one topic so the file doubles as a living reference
/// for future PDF‑export work.  Open `goldens/skpdf.pdf` to inspect.
///
/// ## Page index
///
///  1. **Title & metadata** — document info, text drawing, font sizes/colours
///  2. **Shapes** — rect, rrect, circle, ellipse, arc, polygon, star, path
///  3. **Typography** — weights, sizes, styles, monospace, TextBlob
///  4. **Gradients & fills** — linear, radial, sweep, image‑shader fill
///  5. **Transforms & clipping** — translate, rotate, scale, skew, clip
///  6. **Strokes & effects** — dash, caps/joins, blur, drop‑shadow
///  7. **Images** — embedded raster image decode + draw
///  8. **Links & annotations** — URL hotspot, named dest, internal link
///  9. **Accessibility / tagged PDF** — structure tree, node IDs
/// 10. **Compositing** — save_layer, opacity, blend modes
fn main() {
    let mut file = File::create(concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/skpdf.pdf"))
        .expect("failed to create pdf");

    // --- Fonts ----------------------------------------------------------------
    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .new_from_data(cg::fonts::embedded::geist::BYTES, None)
        .expect("failed to load embedded Geist font");
    let typeface_mono = font_mgr
        .new_from_data(cg::fonts::embedded::geistmono::BYTES, None)
        .expect("failed to load embedded Geist Mono font");

    let font_title = Font::from_typeface(&typeface, 64.0);
    let font_heading = Font::from_typeface(&typeface, 48.0);
    let font_body = Font::from_typeface(&typeface, 28.0);
    let font_small = Font::from_typeface(&typeface, 20.0);
    let font_caption = Font::from_typeface(&typeface, 16.0);
    let font_mono = Font::from_typeface(&typeface_mono, 22.0);
    let font_mono_sm = Font::from_typeface(&typeface_mono, 16.0);

    let page_size = Size::new(PAGE_W, PAGE_H);

    // =========================================================================
    // Attribute owners / names for tagged‑PDF page (must outlive document).
    // =========================================================================
    let layout_owner = CString::new("Layout").unwrap();
    let bbox_name = CString::new("BBox").unwrap();

    // --- Structure element tree (for page 9) ---------------------------------
    let mut struct_root = pdf::StructureElementNode::new("Document");
    struct_root.set_node_id(1);

    let mut struct_h1 = pdf::StructureElementNode::new("H1");
    struct_h1.set_node_id(2);
    struct_h1.set_alt("Page title");
    struct_h1.set_lang("en");

    let mut struct_p = pdf::StructureElementNode::new("P");
    struct_p.set_node_id(3);
    struct_p.set_alt("Body paragraph");
    struct_p.attributes_mut().append_float_array(
        &layout_owner,
        &bbox_name,
        &[160.0, 300.0, 1600.0, 200.0],
    );

    let mut struct_fig = pdf::StructureElementNode::new("Figure");
    struct_fig.set_node_id(4);
    struct_fig.set_alt("Decorative blue rectangle");

    struct_root.append_child(struct_h1);
    struct_root.append_child(struct_p);
    struct_root.append_child(struct_fig);

    // --- PDF document metadata -----------------------------------------------
    let metadata = pdf::Metadata {
        title: "Grida Skia PDF — Comprehensive Pattern Reference".into(),
        author: "grida-canvas golden_skpdf".into(),
        subject: "Demonstrates every practical Skia PDF pattern".into(),
        keywords: "skia, pdf, text, image, gradient, link, annotation, tagged, accessibility"
            .into(),
        creator: "grida-canvas golden_skpdf example".into(),
        creation: Some(pdf::DateTime {
            time_zone_minutes: 0,
            year: 2026,
            month: 4,
            day_of_week: 0,
            day: 12,
            hour: 0,
            minute: 0,
            second: 0,
        }),
        structure_element_tree_root: Some(struct_root),
        outline: pdf::Outline::StructureElementHeaders,
        ..Default::default()
    };
    let doc = pdf::new_document(&mut file, Some(&metadata));

    // =========================================================================
    // Page 1 — Title & metadata
    // =========================================================================
    let doc = page_1_title(
        doc,
        page_size,
        &font_title,
        &font_heading,
        &font_body,
        &font_small,
    );

    // =========================================================================
    // Page 2 — Shapes
    // =========================================================================
    let doc = page_2_shapes(doc, page_size, &font_heading, &font_caption);

    // =========================================================================
    // Page 3 — Typography
    // =========================================================================
    let doc = page_3_typography(
        doc,
        page_size,
        &font_heading,
        &font_body,
        &font_small,
        &font_caption,
        &font_mono,
        &font_mono_sm,
        &typeface,
    );

    // =========================================================================
    // Page 4 — Gradients & fills
    // =========================================================================
    let doc = page_4_gradients(doc, page_size, &font_heading, &font_caption);

    // =========================================================================
    // Page 5 — Transforms & clipping
    // =========================================================================
    let doc = page_5_transforms(doc, page_size, &font_heading, &font_caption);

    // =========================================================================
    // Page 6 — Strokes & effects
    // =========================================================================
    let doc = page_6_strokes_effects(doc, page_size, &font_heading, &font_caption);

    // =========================================================================
    // Page 7 — Images
    // =========================================================================
    let doc = page_7_images(doc, page_size, &font_heading, &font_caption);

    // =========================================================================
    // Page 8 — Links & annotations
    // =========================================================================
    let doc = page_8_links(doc, page_size, &font_heading, &font_body, &font_caption);

    // =========================================================================
    // Page 9 — Tagged PDF / accessibility
    // =========================================================================
    let doc = page_9_tagged(doc, page_size, &font_heading, &font_body, &font_caption);

    // =========================================================================
    // Page 10 — Compositing
    // =========================================================================
    let doc = page_10_compositing(doc, page_size, &font_heading, &font_caption);

    // =========================================================================
    // Close — flush all pages to the writer.
    // =========================================================================
    doc.close();

    println!("Wrote 10-page PDF to goldens/skpdf.pdf");
}

// =============================================================================
// Page 1 — Title & metadata
// =============================================================================
fn page_1_title<'a>(
    doc: Document<'a>,
    size: Size,
    font_title: &Font,
    _font_heading: &Font,
    font_body: &Font,
    font_small: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    // Accent bar at top
    canvas.draw_rect(Rect::from_xywh(0.0, 0.0, PAGE_W, 8.0), &fill(30, 64, 175));

    // Title
    let white = fill(255, 255, 255);
    let dark = fill(23, 23, 23);
    let muted = fill(115, 115, 115);

    // Hero background
    canvas.draw_rect(
        Rect::from_xywh(120.0, 120.0, PAGE_W - 240.0, 360.0),
        &fill(30, 64, 175),
    );
    canvas.draw_str(
        "Grida Skia PDF Reference",
        Point::new(200.0, 300.0),
        font_title,
        &white,
    );
    canvas.draw_str(
        "Comprehensive pattern catalogue — 10 pages",
        Point::new(200.0, 370.0),
        font_body,
        &fill_a(255, 255, 255, 200),
    );

    // Metadata summary
    let mut y = 560.0;
    let labels = [
        "Title:    Grida Skia PDF — Comprehensive Pattern Reference",
        "Author:   grida-canvas golden_skpdf",
        "Subject:  Demonstrates every practical Skia PDF pattern",
        "Keywords: skia, pdf, text, image, gradient, link, annotation",
    ];
    for label in &labels {
        canvas.draw_str(label, Point::new(200.0, y), font_small, &muted);
        y += 36.0;
    }

    // Font size samples
    y = 760.0;
    canvas.draw_str("Font sizes:", Point::new(200.0, y), font_body, &dark);
    y += 50.0;
    for (sz, label) in [
        (64.0, "64pt Title"),
        (48.0, "48pt Heading"),
        (28.0, "28pt Body"),
        (20.0, "20pt Small"),
        (16.0, "16pt Caption"),
    ] {
        let f = Font::from_typeface(font_title.typeface(), sz);
        canvas.draw_str(label, Point::new(200.0, y), &f, &dark);
        y += sz + 12.0;
    }

    page.end_page()
}

// =============================================================================
// Page 2 — Shapes
// =============================================================================
fn page_2_shapes<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    canvas.draw_str("2 — Shapes", Point::new(80.0, 80.0), font_heading, &dark);

    // --- Row 1: basic shapes -------------------------------------------------
    let y0 = 160.0;

    // Rectangle
    canvas.draw_rect(Rect::from_xywh(80.0, y0, 200.0, 140.0), &fill(59, 130, 246));
    canvas.draw_str(
        "Rectangle",
        Point::new(80.0, y0 + 170.0),
        font_caption,
        &dark,
    );

    // Rounded rectangle
    let rrect = skia_safe::RRect::new_rect_xy(Rect::from_xywh(340.0, y0, 200.0, 140.0), 24.0, 24.0);
    canvas.draw_rrect(rrect, &fill(16, 185, 129));
    canvas.draw_str(
        "Rounded Rect",
        Point::new(340.0, y0 + 170.0),
        font_caption,
        &dark,
    );

    // Circle
    canvas.draw_circle(Point::new(700.0, y0 + 70.0), 70.0, &fill(239, 68, 68));
    canvas.draw_str("Circle", Point::new(630.0, y0 + 170.0), font_caption, &dark);

    // Ellipse (oval)
    canvas.draw_oval(
        Rect::from_xywh(820.0, y0, 220.0, 140.0),
        &fill(168, 85, 247),
    );
    canvas.draw_str(
        "Ellipse",
        Point::new(820.0, y0 + 170.0),
        font_caption,
        &dark,
    );

    // Arc (partial ellipse)
    {
        let arc_paint = fill(245, 158, 11);
        let mut pb = PathBuilder::new();
        pb.add_arc(Rect::from_xywh(1100.0, y0, 160.0, 140.0), -30.0, 240.0);
        let path = pb.snapshot();
        canvas.draw_path(&path, &arc_paint);
        let arc_stroke = stroke(245, 158, 11, 4.0);
        canvas.draw_path(&path, &arc_stroke);
        canvas.draw_str("Arc", Point::new(1100.0, y0 + 170.0), font_caption, &dark);
    }

    // Sector (pie wedge)
    {
        let mut pb = PathBuilder::new();
        let oval = Rect::from_xywh(1340.0, y0, 160.0, 140.0);
        pb.move_to(Point::new(1420.0, y0 + 70.0));
        pb.arc_to(oval, 0.0, 135.0, false);
        pb.close();
        let path = pb.snapshot();
        canvas.draw_path(&path, &fill(20, 184, 166));
        canvas.draw_str(
            "Sector",
            Point::new(1340.0, y0 + 170.0),
            font_caption,
            &dark,
        );
    }

    // --- Row 2: polygons, star, path -----------------------------------------
    let y1 = 440.0;

    // Triangle
    {
        let mut path = PathBuilder::new();
        path.move_to(Point::new(180.0, y1));
        path.line_to(Point::new(280.0, y1 + 160.0));
        path.line_to(Point::new(80.0, y1 + 160.0));
        path.close();
        let path = path.snapshot();
        canvas.draw_path(&path, &fill(234, 88, 12));
        canvas.draw_str(
            "Triangle",
            Point::new(80.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // Pentagon
    {
        let cx = 440.0;
        let cy = y1 + 80.0;
        let r = 80.0;
        let mut path = PathBuilder::new();
        for i in 0..5 {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 5.0 - std::f32::consts::FRAC_PI_2;
            let pt = Point::new(cx + r * angle.cos(), cy + r * angle.sin());
            if i == 0 {
                path.move_to(pt);
            } else {
                path.line_to(pt);
            }
        }
        path.close();
        let path = path.snapshot();
        canvas.draw_path(&path, &fill(99, 102, 241));
        canvas.draw_str(
            "Pentagon",
            Point::new(360.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // Hexagon
    {
        let cx = 700.0;
        let cy = y1 + 80.0;
        let r = 80.0;
        let mut path = PathBuilder::new();
        for i in 0..6 {
            let angle = std::f32::consts::PI * 2.0 * (i as f32) / 6.0 - std::f32::consts::FRAC_PI_2;
            let pt = Point::new(cx + r * angle.cos(), cy + r * angle.sin());
            if i == 0 {
                path.move_to(pt);
            } else {
                path.line_to(pt);
            }
        }
        path.close();
        let path = path.snapshot();
        canvas.draw_path(&path, &fill(236, 72, 153));
        canvas.draw_str(
            "Hexagon",
            Point::new(620.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // 5-pointed star
    {
        let cx = 960.0;
        let cy = y1 + 80.0;
        let outer = 80.0;
        let inner = 35.0;
        let mut path = PathBuilder::new();
        for i in 0..10 {
            let r = if i % 2 == 0 { outer } else { inner };
            let angle =
                std::f32::consts::PI * 2.0 * (i as f32) / 10.0 - std::f32::consts::FRAC_PI_2;
            let pt = Point::new(cx + r * angle.cos(), cy + r * angle.sin());
            if i == 0 {
                path.move_to(pt);
            } else {
                path.line_to(pt);
            }
        }
        path.close();
        let path = path.snapshot();
        canvas.draw_path(&path, &fill(234, 179, 8));
        canvas.draw_str("Star", Point::new(920.0, y1 + 190.0), font_caption, &dark);
    }

    // Bézier heart path
    {
        let mut path = PathBuilder::new();
        let ox = 1160.0;
        let oy = y1 + 30.0;
        path.move_to(Point::new(ox + 60.0, oy + 130.0));
        path.cubic_to(
            Point::new(ox, oy + 80.0),
            Point::new(ox, oy),
            Point::new(ox + 60.0, oy + 20.0),
        );
        path.cubic_to(
            Point::new(ox + 120.0, oy),
            Point::new(ox + 120.0, oy + 80.0),
            Point::new(ox + 60.0, oy + 130.0),
        );
        path.close();
        let path = path.snapshot();
        canvas.draw_path(&path, &fill(239, 68, 68));
        canvas.draw_str(
            "Bézier path",
            Point::new(1140.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // Lines (horizontal, vertical, diagonal)
    {
        let lx = 1400.0;
        let s = stroke(23, 23, 23, 3.0);
        canvas.draw_line(Point::new(lx, y1), Point::new(lx + 160.0, y1), &s);
        canvas.draw_line(Point::new(lx, y1 + 20.0), Point::new(lx, y1 + 160.0), &s);
        canvas.draw_line(
            Point::new(lx + 20.0, y1 + 20.0),
            Point::new(lx + 160.0, y1 + 160.0),
            &s,
        );
        canvas.draw_str("Lines", Point::new(1400.0, y1 + 190.0), font_caption, &dark);
    }

    // --- Row 3: combined shapes with strokes ---------------------------------
    let y2 = 720.0;

    // Fill + stroke
    {
        let rect = Rect::from_xywh(80.0, y2, 200.0, 120.0);
        canvas.draw_rect(rect, &fill(219, 39, 119));
        canvas.draw_rect(rect, &stroke(0, 0, 0, 3.0));
        canvas.draw_str(
            "Fill + Stroke",
            Point::new(80.0, y2 + 150.0),
            font_caption,
            &dark,
        );
    }

    // Stroke only
    {
        let rect = Rect::from_xywh(340.0, y2, 200.0, 120.0);
        canvas.draw_rect(rect, &stroke(59, 130, 246, 4.0));
        canvas.draw_str(
            "Stroke only",
            Point::new(340.0, y2 + 150.0),
            font_caption,
            &dark,
        );
    }

    // RRect with per-corner radii
    {
        let rrect = skia_safe::RRect::new_rect_radii(
            Rect::from_xywh(600.0, y2, 200.0, 120.0),
            &[
                Point::new(0.0, 0.0),
                Point::new(40.0, 40.0),
                Point::new(0.0, 0.0),
                Point::new(40.0, 40.0),
            ],
        );
        canvas.draw_rrect(rrect, &fill(16, 185, 129));
        canvas.draw_rrect(rrect, &stroke(0, 0, 0, 2.0));
        canvas.draw_str(
            "Per-corner radii",
            Point::new(600.0, y2 + 150.0),
            font_caption,
            &dark,
        );
    }

    page.end_page()
}

// =============================================================================
// Page 3 — Typography
// =============================================================================
#[allow(clippy::too_many_arguments)]
fn page_3_typography<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_body: &Font,
    font_small: &Font,
    _font_caption: &Font,
    font_mono: &Font,
    font_mono_sm: &Font,
    typeface: &skia_safe::Typeface,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    let muted = fill(115, 115, 115);

    canvas.draw_str(
        "3 — Typography",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    // --- Font weight spectrum ------------------------------------------------
    let mut y = 160.0;
    canvas.draw_str(
        "Font weight spectrum:",
        Point::new(80.0, y),
        font_body,
        &dark,
    );
    y += 48.0;

    let font_mgr = FontMgr::new();
    for (weight, label) in [
        (100, "Thin 100"),
        (300, "Light 300"),
        (400, "Regular 400"),
        (500, "Medium 500"),
        (700, "Bold 700"),
        (900, "Black 900"),
    ] {
        let style = FontStyle::new(
            skia_safe::font_style::Weight::from(weight),
            skia_safe::font_style::Width::NORMAL,
            skia_safe::font_style::Slant::Upright,
        );
        if let Some(tf) = font_mgr.match_family_style(typeface.family_name(), style) {
            let f = Font::from_typeface(&tf, 32.0);
            canvas.draw_str(label, Point::new(100.0, y), &f, &dark);
        } else {
            let f = Font::from_typeface(typeface, 32.0);
            canvas.draw_str(
                format!("{} (fallback)", label),
                Point::new(100.0, y),
                &f,
                &muted,
            );
        }
        y += 44.0;
    }

    // --- Monospace font ------------------------------------------------------
    y += 20.0;
    canvas.draw_str(
        "Monospace (Geist Mono):",
        Point::new(80.0, y),
        font_body,
        &dark,
    );
    y += 44.0;
    canvas.draw_str(
        "fn main() { println!(\"Hello, PDF!\"); }",
        Point::new(100.0, y),
        font_mono,
        &fill(30, 64, 175),
    );
    y += 36.0;
    canvas.draw_str(
        "const PAGE: f32 = 1920.0;  // points",
        Point::new(100.0, y),
        font_mono_sm,
        &muted,
    );

    // --- Text colours --------------------------------------------------------
    y += 64.0;
    canvas.draw_str("Coloured text:", Point::new(80.0, y), font_body, &dark);
    y += 44.0;
    let colours: [(u8, u8, u8, &str); 5] = [
        (239, 68, 68, "Red"),
        (234, 179, 8, "Amber"),
        (34, 197, 94, "Green"),
        (59, 130, 246, "Blue"),
        (168, 85, 247, "Purple"),
    ];
    let mut x = 100.0;
    for (r, g, b, label) in &colours {
        canvas.draw_str(label, Point::new(x, y), font_body, &fill(*r, *g, *b));
        x += 180.0;
    }

    // --- TextBlob (pre-shaped glyph run) ------------------------------------
    y += 80.0;
    canvas.draw_str(
        "TextBlob (pre-shaped):",
        Point::new(80.0, y),
        font_body,
        &dark,
    );
    y += 44.0;
    if let Some(blob) = TextBlob::from_str("Shaped by Skia's TextBlob API", font_body) {
        canvas.draw_text_blob(&blob, Point::new(100.0, y), &fill(99, 102, 241));
    }

    // --- Text with background highlight -------------------------------------
    y += 64.0;
    canvas.draw_str("Highlighted text:", Point::new(80.0, y), font_body, &dark);
    y += 40.0;
    let highlight_text = "This text has a background highlight";
    let (text_width, _) = font_body.measure_str(highlight_text, None);
    canvas.draw_rect(
        Rect::from_xywh(96.0, y - 26.0, text_width + 8.0, 36.0),
        &fill(254, 249, 195),
    );
    canvas.draw_str(highlight_text, Point::new(100.0, y), font_body, &dark);

    // --- Multi-line paragraph ------------------------------------------------
    y += 72.0;
    canvas.draw_str(
        "Multi-line paragraph:",
        Point::new(80.0, y),
        font_body,
        &dark,
    );
    y += 40.0;
    let lines = [
        "Skia's PDF backend converts Canvas draw calls into PDF operators.",
        "Fonts are automatically subset and embedded. Vector shapes remain",
        "resolution-independent. This makes the output crisp at any zoom.",
    ];
    for line in &lines {
        canvas.draw_str(line, Point::new(100.0, y), font_small, &muted);
        y += 30.0;
    }

    page.end_page()
}

// =============================================================================
// Page 4 — Gradients & fills
// =============================================================================
fn page_4_gradients<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    canvas.draw_str(
        "4 — Gradients & Fills",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    let y0 = 160.0;

    // --- Linear gradient (horizontal) ----------------------------------------
    {
        let colors = [
            Color::from_rgb(239, 68, 68),
            Color::from_rgb(234, 179, 8),
            Color::from_rgb(34, 197, 94),
        ];
        let positions = [0.0f32, 0.5, 1.0];
        let rect = Rect::from_xywh(80.0, y0, 360.0, 180.0);
        let shader = gradient_shader::linear(
            (Point::new(80.0, 0.0), Point::new(440.0, 0.0)),
            &colors[..],
            Some(positions.as_slice()),
            TileMode::Clamp,
            None,
            None,
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_rect(rect, &p);
        canvas.draw_str(
            "Linear gradient (H)",
            Point::new(80.0, y0 + 210.0),
            font_caption,
            &dark,
        );
    }

    // --- Linear gradient (diagonal / rotated) --------------------------------
    {
        let colors = [
            Color::from_rgb(99, 102, 241),
            Color::from_rgb(236, 72, 153),
            Color::from_rgb(245, 158, 11),
        ];
        let rect = Rect::from_xywh(500.0, y0, 360.0, 180.0);
        let shader = gradient_shader::linear(
            (Point::new(500.0, y0), Point::new(860.0, y0 + 180.0)),
            &colors[..],
            None,
            TileMode::Clamp,
            None,
            None,
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_rect(rect, &p);
        canvas.draw_str(
            "Linear gradient (diagonal)",
            Point::new(500.0, y0 + 210.0),
            font_caption,
            &dark,
        );
    }

    // --- Radial gradient -----------------------------------------------------
    {
        let colors = [
            Color::from_rgb(255, 255, 255),
            Color::from_rgb(59, 130, 246),
            Color::from_rgb(30, 64, 175),
        ];
        let center = Point::new(1040.0, y0 + 90.0);
        let shader = gradient_shader::radial(
            center,
            120.0,
            &colors[..],
            None,
            TileMode::Clamp,
            None,
            None,
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_circle(center, 90.0, &p);
        canvas.draw_str(
            "Radial gradient",
            Point::new(950.0, y0 + 210.0),
            font_caption,
            &dark,
        );
    }

    // --- Sweep (conic) gradient ----------------------------------------------
    {
        let colors = [
            Color::from_rgb(239, 68, 68),
            Color::from_rgb(234, 179, 8),
            Color::from_rgb(34, 197, 94),
            Color::from_rgb(59, 130, 246),
            Color::from_rgb(168, 85, 247),
            Color::from_rgb(239, 68, 68),
        ];
        let center = Point::new(1360.0, y0 + 90.0);
        let shader =
            gradient_shader::sweep(center, &colors[..], None, TileMode::Clamp, None, None, None);
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_circle(center, 90.0, &p);
        canvas.draw_str(
            "Sweep gradient",
            Point::new(1270.0, y0 + 210.0),
            font_caption,
            &dark,
        );
    }

    // --- Two-point conical gradient ------------------------------------------
    let y1 = y0 + 280.0;
    {
        let colors = [Color::from_rgb(236, 72, 153), Color::from_rgb(99, 102, 241)];
        let shader = gradient_shader::two_point_conical(
            Point::new(180.0, y1 + 60.0),
            10.0,
            Point::new(300.0, y1 + 90.0),
            120.0,
            &colors[..],
            None,
            TileMode::Clamp,
            None,
            None,
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_oval(Rect::from_xywh(80.0, y1, 360.0, 180.0), &p);
        canvas.draw_str(
            "Two-point conical",
            Point::new(80.0, y1 + 210.0),
            font_caption,
            &dark,
        );
    }

    // --- Gradient stroke (not just fill) -------------------------------------
    {
        let colors = [Color::from_rgb(239, 68, 68), Color::from_rgb(59, 130, 246)];
        let shader = gradient_shader::linear(
            (Point::new(500.0, 0.0), Point::new(860.0, 0.0)),
            &colors[..],
            None,
            TileMode::Clamp,
            None,
            None,
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        p.set_style(PaintStyle::Stroke);
        p.set_stroke_width(8.0);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        let rrect =
            skia_safe::RRect::new_rect_xy(Rect::from_xywh(500.0, y1, 360.0, 180.0), 20.0, 20.0);
        canvas.draw_rrect(rrect, &p);
        canvas.draw_str(
            "Gradient stroke",
            Point::new(500.0, y1 + 210.0),
            font_caption,
            &dark,
        );
    }

    // --- Solid colour palette ------------------------------------------------
    let y2 = y1 + 280.0;
    canvas.draw_str("Colour palette:", Point::new(80.0, y2), font_caption, &dark);
    let palette: [(u8, u8, u8, &str); 8] = [
        (239, 68, 68, "Red"),
        (245, 158, 11, "Amber"),
        (234, 179, 8, "Yellow"),
        (34, 197, 94, "Green"),
        (20, 184, 166, "Teal"),
        (59, 130, 246, "Blue"),
        (99, 102, 241, "Indigo"),
        (168, 85, 247, "Violet"),
    ];
    let mut x = 80.0;
    for (r, g, b, label) in &palette {
        canvas.draw_rect(
            Rect::from_xywh(x, y2 + 30.0, 140.0, 80.0),
            &fill(*r, *g, *b),
        );
        canvas.draw_str(label, Point::new(x, y2 + 130.0), font_caption, &dark);
        x += 160.0;
    }

    page.end_page()
}

// =============================================================================
// Page 5 — Transforms & clipping
// =============================================================================
fn page_5_transforms<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    canvas.draw_str(
        "5 — Transforms & Clipping",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    let base_rect = Rect::from_xywh(-60.0, -40.0, 120.0, 80.0);
    let y0 = 260.0;

    // --- Translate -----------------------------------------------------------
    {
        canvas.save();
        canvas.translate(Point::new(200.0, y0));
        canvas.draw_rect(base_rect, &fill(59, 130, 246));
        canvas.restore();
        canvas.draw_str(
            "Translate",
            Point::new(140.0, y0 + 80.0),
            font_caption,
            &dark,
        );
    }

    // --- Rotate --------------------------------------------------------------
    {
        canvas.save();
        canvas.translate(Point::new(460.0, y0));
        canvas.rotate(25.0, None);
        canvas.draw_rect(base_rect, &fill(239, 68, 68));
        canvas.restore();
        canvas.draw_str(
            "Rotate 25°",
            Point::new(400.0, y0 + 80.0),
            font_caption,
            &dark,
        );
    }

    // --- Scale ---------------------------------------------------------------
    {
        canvas.save();
        canvas.translate(Point::new(720.0, y0));
        canvas.scale((1.5, 0.7));
        canvas.draw_rect(base_rect, &fill(34, 197, 94));
        canvas.restore();
        canvas.draw_str(
            "Scale (1.5, 0.7)",
            Point::new(660.0, y0 + 80.0),
            font_caption,
            &dark,
        );
    }

    // --- Skew ----------------------------------------------------------------
    {
        canvas.save();
        canvas.translate(Point::new(980.0, y0));
        canvas.skew((0.3, 0.0));
        canvas.draw_rect(base_rect, &fill(168, 85, 247));
        canvas.restore();
        canvas.draw_str("Skew X", Point::new(920.0, y0 + 80.0), font_caption, &dark);
    }

    // --- Arbitrary matrix (combined rotate + scale) --------------------------
    {
        let mut m = Matrix::new_identity();
        m.pre_translate(Point::new(1260.0, y0));
        m.pre_rotate(15.0, None);
        m.pre_scale((1.2, 0.8), None);
        canvas.save();
        canvas.concat(&m);
        canvas.draw_rect(base_rect, &fill(245, 158, 11));
        canvas.restore();
        canvas.draw_str(
            "Matrix (rot+scale)",
            Point::new(1180.0, y0 + 80.0),
            font_caption,
            &dark,
        );
    }

    // --- Nested transforms (cumulative) --------------------------------------
    {
        canvas.save();
        canvas.translate(Point::new(1540.0, y0 - 40.0));
        for i in 0..5 {
            canvas.save();
            canvas.rotate(i as f32 * 15.0, None);
            let alpha = 255 - (i * 40) as u8;
            canvas.draw_rect(base_rect, &fill_a(99, 102, 241, alpha));
            canvas.restore();
        }
        canvas.restore();
        canvas.draw_str(
            "Nested rotations",
            Point::new(1480.0, y0 + 80.0),
            font_caption,
            &dark,
        );
    }

    // --- Clipping section ----------------------------------------------------
    let y1 = y0 + 200.0;
    canvas.draw_str(
        "Clipping:",
        Point::new(80.0, y1 - 40.0),
        font_caption,
        &dark,
    );

    // Clip rect
    {
        canvas.save();
        canvas.clip_rect(
            Rect::from_xywh(80.0, y1, 200.0, 160.0),
            None, // ClipOp::Intersect (default)
            true, // anti-alias
        );
        // Draw a circle that overflows the clip rect
        canvas.draw_circle(Point::new(180.0, y1 + 80.0), 120.0, &fill(59, 130, 246));
        canvas.restore();
        canvas.draw_rect(
            Rect::from_xywh(80.0, y1, 200.0, 160.0),
            &stroke(0, 0, 0, 1.0),
        );
        canvas.draw_str(
            "clip_rect",
            Point::new(80.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // Clip rounded rect
    {
        let rrect =
            skia_safe::RRect::new_rect_xy(Rect::from_xywh(340.0, y1, 200.0, 160.0), 30.0, 30.0);
        canvas.save();
        canvas.clip_rrect(rrect, None, true);
        canvas.draw_circle(Point::new(440.0, y1 + 80.0), 120.0, &fill(239, 68, 68));
        canvas.restore();
        canvas.draw_rrect(rrect, &stroke(0, 0, 0, 1.0));
        canvas.draw_str(
            "clip_rrect",
            Point::new(340.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // Clip path (star shape)
    {
        let cx = 700.0;
        let cy = y1 + 80.0;
        let mut star = PathBuilder::new();
        for i in 0..10 {
            let r = if i % 2 == 0 { 100.0 } else { 45.0 };
            let angle =
                std::f32::consts::PI * 2.0 * (i as f32) / 10.0 - std::f32::consts::FRAC_PI_2;
            let pt = Point::new(cx + r * angle.cos(), cy + r * angle.sin());
            if i == 0 {
                star.move_to(pt);
            } else {
                star.line_to(pt);
            }
        }
        star.close();
        let star = star.snapshot();

        canvas.save();
        canvas.clip_path(&star, None, true);
        // Draw gradient rect clipped to star
        let colors = [Color::from_rgb(99, 102, 241), Color::from_rgb(236, 72, 153)];
        let shader = gradient_shader::linear(
            (Point::new(600.0, y1), Point::new(800.0, y1 + 160.0)),
            &colors[..],
            None,
            TileMode::Clamp,
            None,
            None,
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_rect(Rect::from_xywh(600.0, y1, 200.0, 160.0), &p);
        canvas.restore();
        canvas.draw_path(&star, &stroke(0, 0, 0, 1.0));
        canvas.draw_str(
            "clip_path (star)",
            Point::new(620.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    // Clip difference (punch a hole)
    {
        canvas.save();
        // Start with the full rect
        canvas.clip_rect(Rect::from_xywh(940.0, y1, 200.0, 160.0), None, true);
        // Punch a circular hole via ClipOp::Difference
        canvas.clip_rect(
            Rect::from_xywh(1000.0, y1 + 40.0, 80.0, 80.0),
            Some(skia_safe::ClipOp::Difference),
            true,
        );
        canvas.draw_rect(Rect::from_xywh(940.0, y1, 200.0, 160.0), &fill(34, 197, 94));
        canvas.restore();
        canvas.draw_rect(
            Rect::from_xywh(940.0, y1, 200.0, 160.0),
            &stroke(0, 0, 0, 1.0),
        );
        canvas.draw_str(
            "ClipOp::Difference",
            Point::new(940.0, y1 + 190.0),
            font_caption,
            &dark,
        );
    }

    page.end_page()
}

// =============================================================================
// Page 6 — Strokes & effects
// =============================================================================
fn page_6_strokes_effects<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    canvas.draw_str(
        "6 — Strokes & Effects",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    // --- Stroke widths -------------------------------------------------------
    let y0 = 160.0;
    canvas.draw_str("Stroke widths:", Point::new(80.0, y0), font_caption, &dark);
    let mut y = y0 + 30.0;
    for width in [1.0, 2.0, 4.0, 8.0, 16.0] {
        let s = stroke(59, 130, 246, width);
        canvas.draw_line(Point::new(80.0, y), Point::new(500.0, y), &s);
        canvas.draw_str(
            format!("{}px", width),
            Point::new(520.0, y + 6.0),
            font_caption,
            &dark,
        );
        y += width.max(16.0) + 16.0;
    }

    // --- Dash patterns -------------------------------------------------------
    let dash_x = 700.0;
    canvas.draw_str(
        "Dash patterns:",
        Point::new(dash_x, y0),
        font_caption,
        &dark,
    );
    y = y0 + 30.0;
    let patterns: [(&[f32], &str); 4] = [
        (&[10.0, 5.0], "[10, 5]"),
        (&[20.0, 10.0, 5.0, 10.0], "[20, 10, 5, 10]"),
        (&[4.0, 4.0], "[4, 4] (dotted)"),
        (&[30.0, 10.0], "[30, 10]"),
    ];
    for (pattern, label) in &patterns {
        let mut s = stroke(239, 68, 68, 3.0);
        if let Some(effect) = PathEffect::dash(pattern, 0.0) {
            s.set_path_effect(effect);
        }
        canvas.draw_line(Point::new(dash_x, y), Point::new(dash_x + 400.0, y), &s);
        canvas.draw_str(
            label,
            Point::new(dash_x + 420.0, y + 6.0),
            font_caption,
            &dark,
        );
        y += 32.0;
    }

    // --- Stroke caps ---------------------------------------------------------
    let y1 = 380.0;
    canvas.draw_str("Stroke caps:", Point::new(80.0, y1), font_caption, &dark);
    let caps: [(paint::Cap, &str); 3] = [
        (paint::Cap::Butt, "Butt"),
        (paint::Cap::Round, "Round"),
        (paint::Cap::Square, "Square"),
    ];
    let mut x = 80.0;
    for (cap, label) in &caps {
        let mut s = stroke(34, 197, 94, 16.0);
        s.set_stroke_cap(*cap);
        canvas.draw_line(
            Point::new(x + 20.0, y1 + 40.0),
            Point::new(x + 120.0, y1 + 40.0),
            &s,
        );
        canvas.draw_str(label, Point::new(x, y1 + 80.0), font_caption, &dark);
        x += 200.0;
    }

    // --- Stroke joins --------------------------------------------------------
    canvas.draw_str("Stroke joins:", Point::new(700.0, y1), font_caption, &dark);
    let joins: [(paint::Join, &str); 3] = [
        (paint::Join::Miter, "Miter"),
        (paint::Join::Round, "Round"),
        (paint::Join::Bevel, "Bevel"),
    ];
    x = 700.0;
    for (join, label) in &joins {
        let mut s = stroke(168, 85, 247, 10.0);
        s.set_stroke_join(*join);
        let mut pb = PathBuilder::new();
        pb.move_to(Point::new(x, y1 + 70.0));
        pb.line_to(Point::new(x + 60.0, y1 + 30.0));
        pb.line_to(Point::new(x + 120.0, y1 + 70.0));
        let path = pb.snapshot();
        canvas.draw_path(&path, &s);
        canvas.draw_str(label, Point::new(x, y1 + 100.0), font_caption, &dark);
        x += 200.0;
    }

    // --- Drop shadow (via image filter) --------------------------------------
    let y2 = 540.0;
    canvas.draw_str("Effects:", Point::new(80.0, y2), font_caption, &dark);
    {
        let rect = Rect::from_xywh(80.0, y2 + 40.0, 200.0, 120.0);
        // Shadow
        let mut shadow_paint = fill(59, 130, 246);
        let shadow_filter = image_filters::drop_shadow_only(
            (8.0, 8.0),
            (6.0, 6.0),
            Color::from_argb(120, 0, 0, 0),
            None,
            None,
            None,
        );
        if let Some(f) = shadow_filter {
            shadow_paint.set_image_filter(f);
        }
        canvas.draw_rect(rect, &shadow_paint);
        // Foreground
        canvas.draw_rect(rect, &fill(59, 130, 246));
        canvas.draw_str(
            "Drop shadow",
            Point::new(80.0, y2 + 190.0),
            font_caption,
            &dark,
        );
    }

    // --- Blur ----------------------------------------------------------------
    {
        let rect = Rect::from_xywh(360.0, y2 + 40.0, 200.0, 120.0);
        let mut p = fill(239, 68, 68);
        let blur = image_filters::blur((4.0, 4.0), None, None, None);
        if let Some(f) = blur {
            p.set_image_filter(f);
        }
        canvas.draw_rect(rect, &p);
        canvas.draw_str(
            "Blur (σ=4)",
            Point::new(360.0, y2 + 190.0),
            font_caption,
            &dark,
        );
    }

    // --- Inner shadow (via save_layer + clip + shadow) -----------------------
    {
        let rect = Rect::from_xywh(640.0, y2 + 40.0, 200.0, 120.0);
        canvas.draw_rect(rect, &fill(245, 245, 245));
        // Use save_layer with an inset shadow illusion
        canvas.save();
        canvas.clip_rect(rect, None, true);
        let mut inner_shadow = Paint::default();
        inner_shadow.set_color(Color::from_argb(60, 0, 0, 0));
        inner_shadow.set_anti_alias(true);
        let inset_blur = image_filters::blur((6.0, 6.0), None, None, None);
        if let Some(f) = inset_blur {
            inner_shadow.set_image_filter(f);
        }
        // Draw slightly-offset shapes that peek in from the edges
        canvas.draw_rect(
            Rect::from_xywh(640.0, y2 + 40.0, 200.0, 20.0),
            &inner_shadow,
        );
        canvas.draw_rect(
            Rect::from_xywh(640.0, y2 + 40.0, 20.0, 120.0),
            &inner_shadow,
        );
        canvas.restore();
        canvas.draw_rect(rect, &stroke(0, 0, 0, 1.0));
        canvas.draw_str(
            "Inner shadow (sim)",
            Point::new(640.0, y2 + 190.0),
            font_caption,
            &dark,
        );
    }

    // --- Colour matrix filter ------------------------------------------------
    {
        let rect = Rect::from_xywh(920.0, y2 + 40.0, 200.0, 120.0);
        // Draw normal, then draw with desaturation filter
        canvas.draw_rect(rect, &fill(34, 197, 94));
        // Grayscale colour matrix
        #[rustfmt::skip]
        let grayscale: [f32; 20] = [
            0.2126, 0.7152, 0.0722, 0.0, 0.0,
            0.2126, 0.7152, 0.0722, 0.0, 0.0,
            0.2126, 0.7152, 0.0722, 0.0, 0.0,
            0.0,    0.0,    0.0,    1.0, 0.0,
        ];
        let cf = color_filters::matrix_row_major(&grayscale, None);
        let desaturated_rect = Rect::from_xywh(1020.0, y2 + 40.0, 100.0, 120.0);
        let mut desat_paint = Paint::default();
        desat_paint.set_anti_alias(true);
        desat_paint.set_color(Color::from_rgb(34, 197, 94));
        desat_paint.set_color_filter(cf);
        canvas.draw_rect(desaturated_rect, &desat_paint);
        canvas.draw_str(
            "Colour matrix (desat)",
            Point::new(920.0, y2 + 190.0),
            font_caption,
            &dark,
        );
    }

    page.end_page()
}

// =============================================================================
// Page 7 — Images
// =============================================================================
fn page_7_images<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    let muted = fill(115, 115, 115);
    canvas.draw_str("7 — Images", Point::new(80.0, 80.0), font_heading, &dark);

    // Generate a synthetic image in-memory (checkerboard).
    // This avoids depending on external files while demonstrating the full
    // Image::from_encoded → draw_image → draw_image_rect pipeline.
    let checker_size = 256;
    let tile = 16;
    let mut pixels = vec![0u8; checker_size * checker_size * 4];
    for row in 0..checker_size {
        for col in 0..checker_size {
            let is_light = ((row / tile) + (col / tile)) % 2 == 0;
            let v: u8 = if is_light { 230 } else { 180 };
            let idx = (row * checker_size + col) * 4;
            pixels[idx] = v;
            pixels[idx + 1] = v;
            pixels[idx + 2] = v;
            pixels[idx + 3] = 255;
        }
    }

    let image_info = skia_safe::ImageInfo::new_n32_premul(
        skia_safe::ISize::new(checker_size as i32, checker_size as i32),
        None,
    );
    let row_bytes = checker_size * 4;
    #[allow(deprecated)]
    let image = Image::from_raster_data(&image_info, Data::new_copy(&pixels), row_bytes);

    let y0 = 160.0;

    // --- draw_image (1:1) ----------------------------------------------------
    if let Some(ref img) = image {
        canvas.draw_image(img, Point::new(80.0, y0), None);
        canvas.draw_str(
            "draw_image (1:1, 256×256)",
            Point::new(80.0, y0 + 276.0),
            font_caption,
            &dark,
        );
    }

    // --- draw_image_rect (scaled) --------------------------------------------
    if let Some(ref img) = image {
        let dst = Rect::from_xywh(400.0, y0, 400.0, 250.0);
        canvas.draw_image_rect(img, None, dst, &fill(0, 0, 0));
        canvas.draw_rect(dst, &stroke(0, 0, 0, 1.0));
        canvas.draw_str(
            "draw_image_rect (scaled to 400×250)",
            Point::new(400.0, y0 + 276.0),
            font_caption,
            &dark,
        );
    }

    // --- Image with clip (circular crop) -------------------------------------
    if let Some(ref img) = image {
        let cx = 980.0;
        let cy = y0 + 128.0;
        let r = 100.0;
        canvas.save();
        let mut circle_pb = PathBuilder::new();
        circle_pb.add_circle(Point::new(cx, cy), r, None);
        let circle = circle_pb.snapshot();
        canvas.clip_path(&circle, None, true);
        canvas.draw_image(img, Point::new(cx - 128.0, y0), None);
        canvas.restore();
        canvas.draw_circle(Point::new(cx, cy), r, &stroke(0, 0, 0, 2.0));
        canvas.draw_str(
            "Circular clip crop",
            Point::new(880.0, y0 + 276.0),
            font_caption,
            &dark,
        );
    }

    // --- Image as shader (tiled fill) ----------------------------------------
    if let Some(ref img) = image {
        let tile_rect = Rect::from_xywh(1180.0, y0, 400.0, 250.0);
        let sampling = SamplingOptions::default();
        let shader = img.to_shader(
            Some((TileMode::Repeat, TileMode::Repeat)),
            sampling,
            Some(&Matrix::scale((0.25, 0.25))),
        );
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(s) = shader {
            p.set_shader(s);
        }
        canvas.draw_rect(tile_rect, &p);
        canvas.draw_rect(tile_rect, &stroke(0, 0, 0, 1.0));
        canvas.draw_str(
            "Image shader (tiled, 0.25×)",
            Point::new(1180.0, y0 + 276.0),
            font_caption,
            &dark,
        );
    }

    // --- Image with colour filter -------------------------------------------
    let y1 = y0 + 340.0;
    if let Some(ref img) = image {
        // Sepia tone
        #[rustfmt::skip]
        let sepia: [f32; 20] = [
            0.393, 0.769, 0.189, 0.0, 0.0,
            0.349, 0.686, 0.168, 0.0, 0.0,
            0.272, 0.534, 0.131, 0.0, 0.0,
            0.0,   0.0,   0.0,   1.0, 0.0,
        ];
        let mut p = Paint::default();
        p.set_anti_alias(true);
        let cf = color_filters::matrix_row_major(&sepia, None);
        p.set_color_filter(cf);
        canvas.draw_image(img, Point::new(80.0, y1), Some(&p));
        canvas.draw_str(
            "Sepia colour filter",
            Point::new(80.0, y1 + 276.0),
            font_caption,
            &dark,
        );
    }

    // --- Image with blur filter ----------------------------------------------
    if let Some(ref img) = image {
        let mut p = Paint::default();
        p.set_anti_alias(true);
        if let Some(f) = image_filters::blur((4.0, 4.0), None, None, None) {
            p.set_image_filter(f);
        }
        canvas.draw_image(img, Point::new(400.0, y1), Some(&p));
        canvas.draw_str(
            "Blur filter (σ=4)",
            Point::new(400.0, y1 + 276.0),
            font_caption,
            &dark,
        );
    }

    // Note about real-world usage
    canvas.draw_str(
        "Note: In production, use Image::from_encoded(Data::new_copy(png_bytes)) to load real PNG/JPEG/WebP images.",
        Point::new(80.0, y1 + 340.0),
        font_caption,
        &muted,
    );

    page.end_page()
}

// =============================================================================
// Page 8 — Links & annotations
// =============================================================================
fn page_8_links<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_body: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    let muted = fill(115, 115, 115);
    canvas.draw_str(
        "8 — Links & Annotations",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    // -------------------------------------------------------------------------
    // URL hyperlink (external link)
    // -------------------------------------------------------------------------
    let y0 = 180.0;
    canvas.draw_str(
        "annotate_rect_with_url — clickable URL link:",
        Point::new(80.0, y0),
        font_body,
        &dark,
    );

    let link_rect = Rect::from_xywh(80.0, y0 + 20.0, 600.0, 60.0);
    // Draw a visible button-like region
    canvas.draw_rect(link_rect, &fill(59, 130, 246));
    canvas.draw_str(
        "Click here → https://grida.co",
        Point::new(100.0, y0 + 60.0),
        font_body,
        &fill(255, 255, 255),
    );
    // Attach the URL annotation — this makes the rect clickable in PDF viewers
    let url_data = Data::new_copy(b"https://grida.co");
    canvas.annotate_rect_with_url(link_rect, &url_data);

    // Second link
    let link2_rect = Rect::from_xywh(80.0, y0 + 100.0, 600.0, 60.0);
    canvas.draw_rect(link2_rect, &fill_a(59, 130, 246, 40));
    canvas.draw_rect(link2_rect, &stroke(59, 130, 246, 2.0));
    canvas.draw_str(
        "GitHub → https://github.com/gridaco/grida",
        Point::new(100.0, y0 + 140.0),
        font_body,
        &fill(59, 130, 246),
    );
    let url2_data = Data::new_copy(b"https://github.com/gridaco/grida");
    canvas.annotate_rect_with_url(link2_rect, &url2_data);

    // -------------------------------------------------------------------------
    // Named destination (anchor point on this page)
    // -------------------------------------------------------------------------
    let y1 = y0 + 220.0;
    canvas.draw_str(
        "annotate_named_destination — bookmark anchor:",
        Point::new(80.0, y1),
        font_body,
        &dark,
    );
    let dest_name = Data::new_copy(b"section-links");
    canvas.annotate_named_destination(Point::new(80.0, y1 + 30.0), &dest_name);

    // Visual marker for the anchor
    let marker_rect = Rect::from_xywh(80.0, y1 + 30.0, 400.0, 40.0);
    canvas.draw_rect(marker_rect, &fill(254, 249, 195));
    canvas.draw_str(
        "⚓ Named dest: \"section-links\"",
        Point::new(90.0, y1 + 60.0),
        font_caption,
        &dark,
    );

    // -------------------------------------------------------------------------
    // Internal link (cross-reference to named destination)
    // -------------------------------------------------------------------------
    let y2 = y1 + 120.0;
    canvas.draw_str(
        "annotate_link_to_destination — internal cross-ref:",
        Point::new(80.0, y2),
        font_body,
        &dark,
    );

    let internal_rect = Rect::from_xywh(80.0, y2 + 20.0, 500.0, 60.0);
    canvas.draw_rect(internal_rect, &fill_a(168, 85, 247, 30));
    canvas.draw_rect(internal_rect, &stroke(168, 85, 247, 2.0));
    canvas.draw_str(
        "Jump to → \"section-links\" anchor above",
        Point::new(100.0, y2 + 60.0),
        font_body,
        &fill(168, 85, 247),
    );
    let dest_ref = Data::new_copy(b"section-links");
    canvas.annotate_link_to_destination(internal_rect, &dest_ref);

    // -------------------------------------------------------------------------
    // Invisible hotspot (no visual, just clickable)
    // -------------------------------------------------------------------------
    let y3 = y2 + 140.0;
    canvas.draw_str(
        "Invisible hotspot — no visible UI, just a clickable region:",
        Point::new(80.0, y3),
        font_body,
        &dark,
    );

    let hotspot_rect = Rect::from_xywh(80.0, y3 + 20.0, 400.0, 80.0);
    // Only draw a dashed outline for documentation purposes
    let mut dashed_stroke = stroke(200, 200, 200, 1.0);
    if let Some(effect) = PathEffect::dash(&[6.0, 4.0], 0.0) {
        dashed_stroke.set_path_effect(effect);
    }
    canvas.draw_rect(hotspot_rect, &dashed_stroke);
    canvas.draw_str(
        "(hotspot area — click to open grida.co/docs)",
        Point::new(90.0, y3 + 68.0),
        font_caption,
        &muted,
    );
    let hotspot_url = Data::new_copy(b"https://grida.co/docs");
    canvas.annotate_rect_with_url(hotspot_rect, &hotspot_url);

    // -------------------------------------------------------------------------
    // Multiple links in a row (link list)
    // -------------------------------------------------------------------------
    let y4 = y3 + 160.0;
    canvas.draw_str("Link list:", Point::new(80.0, y4), font_body, &dark);
    let links: [(&str, &[u8]); 3] = [
        ("Docs", b"https://grida.co/docs"),
        ("Blog", b"https://grida.co/blog"),
        ("API", b"https://grida.co/docs/api"),
    ];
    let mut lx = 80.0;
    for (label, url) in &links {
        let (w, _) = font_body.measure_str(label, None);
        let rect = Rect::from_xywh(lx, y4 + 20.0, w + 24.0, 44.0);
        let rrect = skia_safe::RRect::new_rect_xy(rect, 8.0, 8.0);
        canvas.draw_rrect(rrect, &fill(59, 130, 246));
        canvas.draw_str(
            label,
            Point::new(lx + 12.0, y4 + 52.0),
            font_body,
            &fill(255, 255, 255),
        );
        let url_data = Data::new_copy(url);
        canvas.annotate_rect_with_url(rect, &url_data);
        lx += w + 44.0;
    }

    // -------------------------------------------------------------------------
    // Notes
    // -------------------------------------------------------------------------
    let yn = y4 + 120.0;
    canvas.draw_str(
        "Key pattern: annotate_rect_with_url() attaches a clickable URL to any rectangular region.",
        Point::new(80.0, yn),
        font_caption,
        &muted,
    );
    canvas.draw_str(
        "The annotation is invisible — draw your own button/text visuals before attaching it.",
        Point::new(80.0, yn + 24.0),
        font_caption,
        &muted,
    );
    canvas.draw_str(
        "Use annotate_named_destination() + annotate_link_to_destination() for in-document navigation.",
        Point::new(80.0, yn + 48.0),
        font_caption,
        &muted,
    );

    page.end_page()
}

// =============================================================================
// Page 9 — Tagged PDF / accessibility
// =============================================================================
fn page_9_tagged<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_body: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    let muted = fill(115, 115, 115);

    // Associate drawing commands with the structure tree (defined in main()).
    // Node IDs match those set on StructureElementNode instances.

    // H1 (node_id = 2)
    pdf::set_node_id(canvas, 2);
    canvas.draw_str(
        "9 — Tagged PDF / Accessibility",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    // P (node_id = 3)
    pdf::set_node_id(canvas, 3);
    let y0 = 160.0;
    let paragraph = [
        "This page demonstrates Skia's tagged-PDF support. Each drawing command",
        "is associated with a structure element node via pdf::set_node_id().",
        "The structure tree was defined in main() before creating the document.",
        "",
        "Tagged PDFs enable:",
        "  • Screen readers to parse document structure (headings, paragraphs, figures)",
        "  • Reflow / accessibility tools to extract semantic content",
        "  • PDF/A-2b conformance for archival documents",
        "  • Automatic bookmark / outline generation from headings",
    ];
    let mut y = y0;
    for line in &paragraph {
        canvas.draw_str(line, Point::new(80.0, y), font_body, &dark);
        y += 36.0;
    }

    // Figure (node_id = 4) — a decorative rectangle
    pdf::set_node_id(canvas, 4);
    y += 30.0;
    let fig_rect = Rect::from_xywh(80.0, y, 600.0, 200.0);
    canvas.draw_rect(fig_rect, &fill(59, 130, 246));
    canvas.draw_str(
        "This rectangle is tagged as a <Figure> element",
        Point::new(100.0, y + 110.0),
        font_body,
        &fill(255, 255, 255),
    );

    // Reset node ID
    pdf::set_node_id(canvas, 0);

    // --- Explanation of the API pattern --------------------------------------
    y += 260.0;
    canvas.draw_str("Pattern summary:", Point::new(80.0, y), font_body, &dark);
    y += 40.0;
    let code_lines = [
        "// 1. Build a StructureElementNode tree:",
        "let mut root = pdf::StructureElementNode::new(\"Document\");",
        "let mut h1 = pdf::StructureElementNode::new(\"H1\");",
        "h1.set_node_id(2);",
        "h1.set_alt(\"Page title\");",
        "root.append_child(h1);",
        "",
        "// 2. Pass the tree via metadata:",
        "let metadata = pdf::Metadata {",
        "    structure_element_tree_root: Some(root),",
        "    outline: pdf::Outline::StructureElementHeaders,",
        "    ..Default::default()",
        "};",
        "",
        "// 3. Associate drawing commands with nodes:",
        "pdf::set_node_id(canvas, 2);  // subsequent draws → H1",
        "canvas.draw_str(\"Title\", ...);",
        "pdf::set_node_id(canvas, 0);  // reset",
    ];
    for line in &code_lines {
        canvas.draw_str(line, Point::new(100.0, y), font_caption, &muted);
        y += 22.0;
    }

    // Node ID constants
    y += 20.0;
    canvas.draw_str(
        "Reserved node_id constants:",
        Point::new(80.0, y),
        font_body,
        &dark,
    );
    y += 36.0;
    let node_id_info = [
        "0  → NOTHING (no association)",
        "-1 → OTHER_ARTIFACT",
        "-2 → PAGINATION_ARTIFACT",
        "-3 → PAGINATION_HEADER_ARTIFACT",
        "-4 → PAGINATION_FOOTER_ARTIFACT",
        "-5 → PAGINATION_WATERMARK_ARTIFACT",
        "-6 → LAYOUT_ARTIFACT",
        "-7 → PAGE_ARTIFACT",
        "-8 → BACKGROUND_ARTIFACT",
    ];
    for line in &node_id_info {
        canvas.draw_str(line, Point::new(100.0, y), font_caption, &muted);
        y += 22.0;
    }

    page.end_page()
}

// =============================================================================
// Page 10 — Compositing (save_layer, opacity, blend modes)
// =============================================================================
fn page_10_compositing<'a>(
    doc: Document<'a>,
    size: Size,
    font_heading: &Font,
    font_caption: &Font,
) -> Document<'a> {
    let mut page = doc.begin_page(size, None);
    let canvas = page.canvas();
    canvas.clear(Color::WHITE);

    let dark = fill(23, 23, 23);
    canvas.draw_str(
        "10 — Compositing",
        Point::new(80.0, 80.0),
        font_heading,
        &dark,
    );

    // --- save_layer_alpha (opacity) ------------------------------------------
    let y0 = 160.0;
    canvas.draw_str(
        "save_layer_alpha — opacity:",
        Point::new(80.0, y0),
        font_caption,
        &dark,
    );
    let opacities = [255u8, 200, 150, 100, 50];
    let mut x = 80.0;
    for &alpha in &opacities {
        let bounds = Rect::from_xywh(x, y0 + 30.0, 120.0, 120.0);
        canvas.save_layer_alpha(Some(bounds), alpha as u32);
        canvas.draw_rect(bounds, &fill(59, 130, 246));
        canvas.draw_str(
            format!("{}%", (alpha as f32 / 255.0 * 100.0) as u32),
            Point::new(x + 30.0, y0 + 100.0),
            font_caption,
            &fill(255, 255, 255),
        );
        canvas.restore();
        x += 140.0;
    }

    // --- save_layer with blur filter (frosted glass) -------------------------
    let y1 = y0 + 200.0;
    canvas.draw_str(
        "save_layer with blur filter:",
        Point::new(80.0, y1),
        font_caption,
        &dark,
    );
    {
        // Background content
        canvas.draw_rect(
            Rect::from_xywh(80.0, y1 + 30.0, 400.0, 160.0),
            &fill(239, 68, 68),
        );
        canvas.draw_circle(Point::new(280.0, y1 + 110.0), 60.0, &fill(255, 255, 255));

        // Frosted overlay via save_layer + blur
        let overlay = Rect::from_xywh(180.0, y1 + 50.0, 200.0, 120.0);
        let mut layer_paint = Paint::default();
        if let Some(f) = image_filters::blur((8.0, 8.0), None, None, None) {
            layer_paint.set_image_filter(f);
        }
        let rec = skia_safe::canvas::SaveLayerRec::default()
            .bounds(&overlay)
            .paint(&layer_paint);
        canvas.save_layer(&rec);
        canvas.draw_rect(overlay, &fill_a(255, 255, 255, 180));
        canvas.restore();

        canvas.draw_rect(overlay, &stroke(255, 255, 255, 2.0));
        canvas.draw_str(
            "Frosted glass",
            Point::new(200.0, y1 + 120.0),
            font_caption,
            &dark,
        );
    }

    // --- Blend modes ---------------------------------------------------------
    let y2 = y1 + 240.0;
    canvas.draw_str("Blend modes:", Point::new(80.0, y2), font_caption, &dark);

    let modes: [(skia_safe::BlendMode, &str); 6] = [
        (skia_safe::BlendMode::Multiply, "Multiply"),
        (skia_safe::BlendMode::Screen, "Screen"),
        (skia_safe::BlendMode::Overlay, "Overlay"),
        (skia_safe::BlendMode::Darken, "Darken"),
        (skia_safe::BlendMode::Lighten, "Lighten"),
        (skia_safe::BlendMode::Difference, "Difference"),
    ];

    x = 80.0;
    for (mode, label) in &modes {
        let _base = Rect::from_xywh(x, y2 + 30.0, 100.0, 100.0);

        // Draw base (red circle)
        canvas.draw_circle(Point::new(x + 40.0, y2 + 70.0), 40.0, &fill(239, 68, 68));

        // Draw blended layer (blue circle, overlapping)
        let mut blend_paint = fill(59, 130, 246);
        blend_paint.set_blend_mode(*mode);
        canvas.draw_circle(Point::new(x + 65.0, y2 + 90.0), 40.0, &blend_paint);

        canvas.draw_str(label, Point::new(x, y2 + 150.0), font_caption, &dark);
        x += 160.0;
    }

    // --- save_layer with blend mode (group compositing) ----------------------
    let y3 = y2 + 220.0;
    canvas.draw_str(
        "Group compositing via save_layer + blend:",
        Point::new(80.0, y3),
        font_caption,
        &dark,
    );
    {
        // Background
        canvas.draw_rect(
            Rect::from_xywh(80.0, y3 + 30.0, 500.0, 140.0),
            &fill(245, 245, 245),
        );

        // Vertical colour bars as background
        for (i, color) in [(239u8, 68, 68), (34, 197, 94), (59, 130, 246)]
            .iter()
            .enumerate()
        {
            canvas.draw_rect(
                Rect::from_xywh(80.0 + i as f32 * 170.0, y3 + 30.0, 160.0, 140.0),
                &fill(color.0, color.1, color.2),
            );
        }

        // save_layer with Multiply blend for composited shapes
        let bounds = Rect::from_xywh(80.0, y3 + 30.0, 500.0, 140.0);
        let mut layer_paint = Paint::default();
        layer_paint.set_blend_mode(skia_safe::BlendMode::Multiply);
        let rec = skia_safe::canvas::SaveLayerRec::default()
            .bounds(&bounds)
            .paint(&layer_paint);
        canvas.save_layer(&rec);
        canvas.draw_circle(Point::new(280.0, y3 + 100.0), 60.0, &fill(255, 255, 255));
        canvas.restore();

        canvas.draw_str(
            "White circle multiplied onto colour bars",
            Point::new(80.0, y3 + 190.0),
            font_caption,
            &dark,
        );
    }

    page.end_page()
}
