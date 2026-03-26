use cg::cg::prelude::*;
use cg::resources::ByteStore;
use cg::runtime::image_repository::ImageRepository;
use cg::text::attributed_paragraph::{build_attributed_paragraph, build_attributed_paragraph_with_images};
use cg::text::text_style::textstyle;
use skia_safe::textlayout::{
    FontCollection, ParagraphBuilder, ParagraphStyle, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint as SkPaint, Point};
use std::sync::{Arc, Mutex};

fn main() {
    let mut surface = surfaces::raster_n32_premul((1200, 2800)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // -- Font setup --
    let font_mgr = FontMgr::new();
    let geist_tf = font_mgr
        .new_from_data(cg::fonts::embedded::geist::BYTES, None)
        .unwrap();
    let geist_mono_tf = font_mgr
        .new_from_data(cg::fonts::embedded::geistmono::BYTES, None)
        .unwrap();

    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(geist_tf.clone(), Some("Geist"));
    provider.register_typeface(geist_mono_tf.clone(), Some("GeistMono"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    font_collection.set_default_font_manager(font_mgr.clone(), None);

    // -- Helpers --
    let base = TextStyleRec::from_font("Geist", 20.0);
    let layout_width = 1080.0;
    let start_x = 60.0;
    let mut y = 60.0;

    let mut title_paint = SkPaint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::BLACK);

    // Helper: draw a section title using plain Skia paragraph
    let draw_title = |canvas: &skia_safe::Canvas, y: &mut f32, title: &str| {
        let mut style = TextStyleRec::from_font("Geist", 14.0);
        style.font_weight = FontWeight(600);
        let mut ps = ParagraphStyle::new();
        ps.set_text_direction(TextDirection::LTR);
        ps.set_text_align(TextAlign::Left.into());

        let mut builder = ParagraphBuilder::new(&ps, &font_collection);
        let mut ts = textstyle(&style, &None);
        let mut p = SkPaint::default();
        p.set_anti_alias(true);
        p.set_color(Color::from_argb(255, 100, 100, 100));
        ts.set_foreground_paint(&p);
        builder.push_style(&ts);
        builder.add_text(title);
        let mut para = builder.build();
        para.layout(layout_width);
        para.paint(canvas, Point::new(start_x, *y));
        *y += para.height() + 6.0;
    };

    let draw_subtitle = |canvas: &skia_safe::Canvas, y: &mut f32, text: &str| {
        let style = TextStyleRec::from_font("Geist", 11.0);
        let mut ps = ParagraphStyle::new();
        ps.set_text_direction(TextDirection::LTR);
        ps.set_text_align(TextAlign::Left.into());

        let mut builder = ParagraphBuilder::new(&ps, &font_collection);
        let mut ts = textstyle(&style, &None);
        let mut p = SkPaint::default();
        p.set_anti_alias(true);
        p.set_color(Color::from_argb(255, 150, 150, 150));
        ts.set_foreground_paint(&p);
        builder.push_style(&ts);
        builder.add_text(text);
        let mut para = builder.build();
        para.layout(layout_width);
        para.paint(canvas, Point::new(start_x, *y));
        *y += para.height() + 8.0;
    };

    // -- Main title --
    {
        let mut style = TextStyleRec::from_font("Geist", 20.0);
        style.font_weight = FontWeight(700);
        let mut ps = ParagraphStyle::new();
        ps.set_text_direction(TextDirection::LTR);
        let mut builder = ParagraphBuilder::new(&ps, &font_collection);
        let mut ts = textstyle(&style, &None);
        ts.set_foreground_paint(&title_paint);
        builder.push_style(&ts);
        builder.add_text("Attributed Text Golden Test");
        let mut para = builder.build();
        para.layout(layout_width);
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 16.0;
    }

    // ===== Section 1: Mixed Font Weights =====
    draw_title(canvas, &mut y, "1. Mixed Font Weights");
    {
        let normal = TextStyleRec::from_font("Geist", 20.0);
        let mut bold = TextStyleRec::from_font("Geist", 20.0);
        bold.font_weight = FontWeight(700);
        let mut light = TextStyleRec::from_font("Geist", 20.0);
        light.font_weight = FontWeight(300);

        let attr = AttributedStringBuilder::new()
            .push("Light ", &light, Some(CGColor::BLACK))
            .push("Regular ", &normal, Some(CGColor::BLACK))
            .push("Bold ", &bold, Some(CGColor::BLACK))
            .push("text in one paragraph.", &normal, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 2: Mixed Font Sizes =====
    draw_title(canvas, &mut y, "2. Mixed Font Sizes");
    {
        let small = TextStyleRec::from_font("Geist", 12.0);
        let medium = TextStyleRec::from_font("Geist", 20.0);
        let large = TextStyleRec::from_font("Geist", 32.0);

        let attr = AttributedStringBuilder::new()
            .push("Small ", &small, Some(CGColor::BLACK))
            .push("Medium ", &medium, Some(CGColor::BLACK))
            .push("Large ", &large, Some(CGColor::BLACK))
            .push("back to small.", &small, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 3: Mixed Colors =====
    draw_title(canvas, &mut y, "3. Mixed Colors");
    {
        let words = [
            ("Red ", CGColor::RED),
            ("Green ", CGColor::GREEN),
            ("Blue ", CGColor::BLUE),
            ("Orange ", CGColor::from_rgba(255, 140, 0, 255)),
            ("Purple", CGColor::from_rgba(128, 0, 128, 255)),
        ];

        let mut builder = AttributedStringBuilder::new();
        for (word, color) in &words {
            builder = builder.push(word, &base, Some(*color));
        }
        let attr = builder.build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 4: Mixed Decorations =====
    draw_title(canvas, &mut y, "4. Mixed Decorations");
    {
        let plain = TextStyleRec::from_font("Geist", 20.0);
        let mut underline = TextStyleRec::from_font("Geist", 20.0);
        underline.text_decoration = Some(TextDecorationRec {
            text_decoration_line: TextDecorationLine::Underline,
            text_decoration_color: Some(CGColor::RED),
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thickness: None,
        });
        let mut strikethrough = TextStyleRec::from_font("Geist", 20.0);
        strikethrough.text_decoration = Some(TextDecorationRec {
            text_decoration_line: TextDecorationLine::LineThrough,
            text_decoration_color: Some(CGColor::from_rgba(100, 100, 100, 255)),
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thickness: None,
        });

        let attr = AttributedStringBuilder::new()
            .push("Plain text, then ", &plain, Some(CGColor::BLACK))
            .push("underlined", &underline, Some(CGColor::BLACK))
            .push(", then ", &plain, Some(CGColor::BLACK))
            .push("strikethrough", &strikethrough, Some(CGColor::BLACK))
            .push(", then plain again.", &plain, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 5: Mixed Italic =====
    draw_title(canvas, &mut y, "5. Mixed Italic");
    {
        let roman = TextStyleRec::from_font("Geist", 20.0);
        let mut italic = TextStyleRec::from_font("Geist", 20.0);
        italic.font_style_italic = true;

        let attr = AttributedStringBuilder::new()
            .push("This is roman text with ", &roman, Some(CGColor::BLACK))
            .push("italic emphasis", &italic, Some(CGColor::BLACK))
            .push(" inline.", &roman, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 6: Combined Attributes =====
    draw_title(canvas, &mut y, "6. Combined Attributes");
    draw_subtitle(
        canvas,
        &mut y,
        "Weight + size + color + decoration in one paragraph",
    );
    {
        let normal = TextStyleRec::from_font("Geist", 18.0);
        let mut bold_large_red = TextStyleRec::from_font("Geist", 28.0);
        bold_large_red.font_weight = FontWeight(700);

        let mut italic_underline_blue = TextStyleRec::from_font("Geist", 20.0);
        italic_underline_blue.font_style_italic = true;
        italic_underline_blue.text_decoration = Some(TextDecorationRec {
            text_decoration_line: TextDecorationLine::Underline,
            text_decoration_color: Some(CGColor::BLUE),
            text_decoration_style: Some(TextDecorationStyle::Dashed),
            text_decoration_skip_ink: None,
            text_decoration_thickness: Some(2.0),
        });

        let mut small_gray = TextStyleRec::from_font("Geist", 14.0);
        small_gray.font_weight = FontWeight(300);

        let attr = AttributedStringBuilder::new()
            .push("Normal, ", &normal, Some(CGColor::BLACK))
            .push("Bold Large Red", &bold_large_red, Some(CGColor::RED))
            .push(", ", &normal, Some(CGColor::BLACK))
            .push(
                "italic underlined blue",
                &italic_underline_blue,
                Some(CGColor::BLUE),
            )
            .push(", ", &normal, Some(CGColor::BLACK))
            .push(
                "small gray caption.",
                &small_gray,
                Some(CGColor::from_rgba(140, 140, 140, 255)),
            )
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 7: Multi-line Attributed Text =====
    draw_title(canvas, &mut y, "7. Multi-line Wrapping");
    draw_subtitle(
        canvas,
        &mut y,
        "Runs that span across line breaks (width = 500px)",
    );
    {
        let normal = TextStyleRec::from_font("Geist", 18.0);
        let mut bold = TextStyleRec::from_font("Geist", 18.0);
        bold.font_weight = FontWeight(700);

        let attr = AttributedStringBuilder::new()
            .push(
                "This is a longer paragraph that demonstrates how attributed text handles ",
                &normal,
                Some(CGColor::BLACK),
            )
            .push(
                "bold runs that wrap across line boundaries",
                &bold,
                Some(CGColor::from_rgba(0, 100, 200, 255)),
            )
            .push(
                " and then continues with normal weight text afterward. The layout engine should correctly handle style transitions at any point within the wrapped text.",
                &normal,
                Some(CGColor::BLACK),
            )
            .build();

        let para =
            build_attributed_paragraph(&attr, TextAlign::Left, None, None, &font_collection, 500.0);
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 8: Code Snippet (Syntax Highlighting) =====
    draw_title(canvas, &mut y, "8. Syntax Highlighting");
    draw_subtitle(
        canvas,
        &mut y,
        "Simulated code with keyword/string/comment colors",
    );
    {
        let mono = TextStyleRec::from_font("GeistMono", 16.0);
        let mut keyword = TextStyleRec::from_font("GeistMono", 16.0);
        keyword.font_weight = FontWeight(700);
        let mut comment = TextStyleRec::from_font("GeistMono", 16.0);
        comment.font_style_italic = true;

        let keyword_color = CGColor::from_rgba(198, 120, 221, 255); // purple
        let string_color = CGColor::from_rgba(152, 195, 121, 255); // green
        let comment_color = CGColor::from_rgba(128, 128, 128, 255); // gray
        let plain_color = CGColor::from_rgba(40, 44, 52, 255); // dark

        let attr = AttributedStringBuilder::new()
            .push("fn ", &keyword, Some(keyword_color))
            .push("main", &mono, Some(plain_color))
            .push("() {\n", &mono, Some(plain_color))
            .push("    let ", &keyword, Some(keyword_color))
            .push("message = ", &mono, Some(plain_color))
            .push("\"Hello, attributed world!\"", &mono, Some(string_color))
            .push(";\n", &mono, Some(plain_color))
            .push(
                "    // render with per-run styling\n",
                &comment,
                Some(comment_color),
            )
            .push("    println!", &keyword, Some(keyword_color))
            .push("(\"{}\", message);\n", &mono, Some(plain_color))
            .push("}", &mono, Some(plain_color))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 9: Letter Spacing Variation =====
    draw_title(canvas, &mut y, "9. Letter Spacing Variation");
    {
        let normal = TextStyleRec::from_font("Geist", 20.0);
        let mut tight = TextStyleRec::from_font("Geist", 20.0);
        tight.letter_spacing = TextLetterSpacing::Fixed(-1.0);
        let mut wide = TextStyleRec::from_font("Geist", 20.0);
        wide.letter_spacing = TextLetterSpacing::Fixed(4.0);

        let attr = AttributedStringBuilder::new()
            .push("Tight ", &tight, Some(CGColor::BLACK))
            .push("Normal ", &normal, Some(CGColor::BLACK))
            .push("W i d e", &wide, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 10: Monospace + Proportional Mix =====
    draw_title(canvas, &mut y, "10. Mixed Font Families");
    {
        let proportional = TextStyleRec::from_font("Geist", 18.0);
        let mut mono = TextStyleRec::from_font("GeistMono", 16.0);
        mono.font_weight = FontWeight(500);

        let attr = AttributedStringBuilder::new()
            .push("Inline ", &proportional, Some(CGColor::BLACK))
            .push("code()", &mono, Some(CGColor::from_rgba(200, 50, 50, 255)))
            .push(
                " mixed with proportional text and ",
                &proportional,
                Some(CGColor::BLACK),
            )
            .push(
                "another_fn()",
                &mono,
                Some(CGColor::from_rgba(200, 50, 50, 255)),
            )
            .push(" reference.", &proportional, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 11: Unordered List (Bullet List) =====
    draw_title(canvas, &mut y, "11. Unordered List (Faux Bullet)");
    {
        let body = TextStyleRec::from_font("Geist", 16.0);
        let mut bold = TextStyleRec::from_font("Geist", 16.0);
        bold.font_weight = FontWeight(600);
        let bullet_color = CGColor::from_rgba(80, 80, 80, 255);
        let text_color = CGColor::from_rgba(30, 30, 30, 255);

        let items: &[(&str, &[(&str, &TextStyleRec, CGColor)])] = &[
            ("First item with ", &[
                ("bold emphasis", &bold, text_color),
                (" in the middle", &body, text_color),
            ]),
            ("Second item is plain text", &[]),
            ("Third item demonstrates ", &[
                ("colored", &body, CGColor::from_rgba(0, 120, 200, 255)),
                (" inline spans", &body, text_color),
            ]),
            ("Fourth item wraps to multiple lines when the text is long enough to exceed the available layout width for this demonstration", &[]),
        ];

        for (prefix, extra_runs) in items {
            let mut builder = AttributedStringBuilder::new()
                .push("  \u{2022}  ", &body, Some(bullet_color))
                .push(prefix, &body, Some(text_color));
            for (text, style, color) in *extra_runs {
                builder = builder.push(text, style, Some(*color));
            }
            let attr = builder.build();

            let para = build_attributed_paragraph(
                &attr,
                TextAlign::Left,
                None,
                None,
                &font_collection,
                600.0,
            );
            para.paint(canvas, Point::new(start_x, y));
            y += para.height() + 4.0;
        }
        y += 12.0;
    }

    // ===== Section 12: Ordered List =====
    draw_title(canvas, &mut y, "12. Ordered List (Faux Numbering)");
    {
        let body = TextStyleRec::from_font("Geist", 16.0);
        let mut bold = TextStyleRec::from_font("Geist", 16.0);
        bold.font_weight = FontWeight(600);
        let mut mono = TextStyleRec::from_font("GeistMono", 14.0);
        mono.font_weight = FontWeight(500);
        let num_color = CGColor::from_rgba(100, 100, 100, 255);
        let text_color = CGColor::from_rgba(30, 30, 30, 255);

        let items: &[&[(&str, &TextStyleRec, CGColor)]] = &[
            &[
                ("  1.  ", &body, num_color),
                ("Clone the repository with ", &body, text_color),
                ("git clone", &mono, CGColor::from_rgba(200, 50, 50, 255)),
            ],
            &[
                ("  2.  ", &body, num_color),
                ("Install dependencies using ", &body, text_color),
                ("pnpm install", &mono, CGColor::from_rgba(200, 50, 50, 255)),
            ],
            &[
                ("  3.  ", &body, num_color),
                ("Run the ", &body, text_color),
                ("development server", &bold, text_color),
                (" and verify the output", &body, text_color),
            ],
            &[
                ("  4.  ", &body, num_color),
                ("Submit a pull request for review", &body, text_color),
            ],
        ];

        for runs in items {
            let mut builder = AttributedStringBuilder::new();
            for (text, style, color) in *runs {
                builder = builder.push(text, style, Some(*color));
            }
            let attr = builder.build();

            let para = build_attributed_paragraph(
                &attr,
                TextAlign::Left,
                None,
                None,
                &font_collection,
                600.0,
            );
            para.paint(canvas, Point::new(start_x, y));
            y += para.height() + 4.0;
        }
        y += 12.0;
    }

    // ===== Section 13: Nested List =====
    draw_title(canvas, &mut y, "13. Nested List");
    {
        let body = TextStyleRec::from_font("Geist", 16.0);
        let mut bold = TextStyleRec::from_font("Geist", 16.0);
        bold.font_weight = FontWeight(600);
        let bullet_color = CGColor::from_rgba(80, 80, 80, 255);
        let text_color = CGColor::from_rgba(30, 30, 30, 255);
        let sub_color = CGColor::from_rgba(120, 120, 120, 255);

        // Level 0: bullet
        // Level 1: dash indent
        // Level 2: circle indent
        let lines: &[(&str, &str, &[(&str, &TextStyleRec, CGColor)])] = &[
            ("  \u{2022}  ", "Project setup", &[]),
            (
                "      \u{2013}  ",
                "Install ",
                &[("Rust toolchain", &bold, text_color)],
            ),
            (
                "      \u{2013}  ",
                "Install ",
                &[("Node.js 22+", &bold, text_color)],
            ),
            ("  \u{2022}  ", "Development", &[]),
            ("      \u{2013}  ", "Run tests", &[]),
            ("          \u{25E6}  ", "Unit tests", &[]),
            ("          \u{25E6}  ", "Integration tests", &[]),
            ("      \u{2013}  ", "Build artifacts", &[]),
            ("  \u{2022}  ", "Deployment", &[]),
        ];

        for (prefix, main_text, extra_runs) in lines {
            let depth_color = if prefix.starts_with("          ") {
                sub_color
            } else if prefix.starts_with("      ") {
                CGColor::from_rgba(100, 100, 100, 255)
            } else {
                bullet_color
            };

            let mut builder = AttributedStringBuilder::new()
                .push(prefix, &body, Some(depth_color))
                .push(main_text, &body, Some(text_color));
            for (text, style, color) in *extra_runs {
                builder = builder.push(text, style, Some(*color));
            }
            let attr = builder.build();

            let para = build_attributed_paragraph(
                &attr,
                TextAlign::Left,
                None,
                None,
                &font_collection,
                600.0,
            );
            para.paint(canvas, Point::new(start_x, y));
            y += para.height() + 2.0;
        }
        y += 12.0;
    }

    // ===== Section 14: Gradient Fill =====
    draw_title(canvas, &mut y, "14. Gradient Fill (per-run Paint)");
    draw_subtitle(
        canvas,
        &mut y,
        "Linear gradient fills on individual text runs via push_painted()",
    );
    {
        let style = TextStyleRec::from_font("Geist", 28.0);
        let mut bold = TextStyleRec::from_font("Geist", 28.0);
        bold.font_weight = FontWeight(700);

        // Rainbow gradient: red → orange → yellow → green → blue → purple
        let rainbow_gradient = Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
            CGColor::from_rgba(255, 0, 0, 255),
            CGColor::from_rgba(255, 165, 0, 255),
            CGColor::from_rgba(255, 255, 0, 255),
            CGColor::from_rgba(0, 200, 0, 255),
            CGColor::from_rgba(0, 100, 255, 255),
            CGColor::from_rgba(128, 0, 255, 255),
        ]));

        // Blue-to-cyan gradient
        let cool_gradient = Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
            CGColor::from_rgba(0, 80, 200, 255),
            CGColor::from_rgba(0, 200, 220, 255),
        ]));

        // Warm gradient
        let warm_gradient = Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
            CGColor::from_rgba(255, 60, 0, 255),
            CGColor::from_rgba(255, 180, 0, 255),
        ]));

        let attr = AttributedStringBuilder::new()
            .push_painted("Rainbow ", &bold, Some(vec![rainbow_gradient]), None, None, None)
            .push("mixed with ", &style, Some(CGColor::BLACK))
            .push_painted("cool ", &bold, Some(vec![cool_gradient]), None, None, None)
            .push("and ", &style, Some(CGColor::BLACK))
            .push_painted("warm", &bold, Some(vec![warm_gradient]), None, None, None)
            .push(" gradients.", &style, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 15: Stroked Text =====
    draw_title(canvas, &mut y, "15. Stroked Text (per-run TextStroke)");
    draw_subtitle(canvas, &mut y, "Fill + stroke on individual text runs");
    {
        let mut style = TextStyleRec::from_font("Geist", 36.0);
        style.font_weight = FontWeight(700);

        let attr = AttributedStringBuilder::new()
            .push_painted(
                "RED ",
                &style,
                Some(vec![Paint::from(CGColor::RED)]),
                Some(Paints::new(vec![Paint::from(CGColor::from_rgba(120, 0, 0, 255))])),
                Some(2.0),
                None,
            )
            .push_painted(
                "BLUE ",
                &style,
                Some(vec![Paint::from(CGColor::BLUE)]),
                Some(Paints::new(vec![Paint::from(CGColor::from_rgba(0, 0, 120, 255))])),
                Some(2.0),
                None,
            )
            .push_painted(
                "OUTLINE",
                &style,
                Some(vec![Paint::from(CGColor::from_rgba(240, 240, 240, 255))]),
                Some(Paints::new(vec![Paint::from(CGColor::from_rgba(40, 40, 40, 255))])),
                Some(1.5),
                None,
            )
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 16: Gradient Stroke =====
    draw_title(canvas, &mut y, "16. Gradient Stroke");
    draw_subtitle(canvas, &mut y, "Gradient paint on stroke with solid fill");
    {
        let mut style = TextStyleRec::from_font("Geist", 40.0);
        style.font_weight = FontWeight(900);

        let gradient_stroke_paint = Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
            CGColor::from_rgba(255, 0, 100, 255),
            CGColor::from_rgba(100, 0, 255, 255),
        ]));

        let attr = AttributedStringBuilder::new()
            .push_painted(
                "GRADIENT STROKE",
                &style,
                Some(vec![Paint::from(CGColor::WHITE)]),
                Some(Paints::new(vec![gradient_stroke_paint])),
                Some(3.0),
                None,
            )
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 17: Mixed fills + strokes in one paragraph =====
    draw_title(canvas, &mut y, "17. Mixed Fill + Stroke in One Paragraph");
    draw_subtitle(
        canvas,
        &mut y,
        "Some runs stroked, some not, demonstrating selective per-run strokes",
    );
    {
        let normal = TextStyleRec::from_font("Geist", 24.0);
        let mut bold = TextStyleRec::from_font("Geist", 24.0);
        bold.font_weight = FontWeight(700);

        let attr = AttributedStringBuilder::new()
            .push("Plain text, then ", &normal, Some(CGColor::BLACK))
            .push_painted(
                "stroked bold",
                &bold,
                Some(vec![Paint::from(CGColor::from_rgba(255, 200, 220, 255))]),
                Some(Paints::new(vec![Paint::from(CGColor::from_rgba(200, 0, 100, 255))])),
                Some(1.5),
                None,
            )
            .push(", then plain again.", &normal, Some(CGColor::BLACK))
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 18: Multi-Fill Stacking =====
    draw_title(canvas, &mut y, "18. Multi-Fill Stacking");
    draw_subtitle(
        canvas,
        &mut y,
        "Two fills composited on a single run (solid base + semi-transparent gradient overlay)",
    );
    {
        let mut style = TextStyleRec::from_font("Geist", 32.0);
        style.font_weight = FontWeight(800);

        // Base solid fill + gradient overlay
        let base_solid = Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(30, 30, 30, 255)));
        let overlay_gradient = Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
            CGColor::from_rgba(255, 0, 80, 160),  // semi-transparent red
            CGColor::from_rgba(0, 120, 255, 160),  // semi-transparent blue
        ]));

        // Two solid fills stacked
        let solid_a = Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(255, 200, 0, 255)));
        let solid_b = Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(0, 100, 255, 128)));

        let attr = AttributedStringBuilder::new()
            .push_painted(
                "GRADIENT OVER SOLID ",
                &style,
                Some(vec![base_solid, overlay_gradient]),
                None,
                None,
                None,
            )
            .push_painted(
                "TWO SOLIDS",
                &style,
                Some(vec![solid_a, solid_b]),
                None,
                None,
                None,
            )
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 19: True Hollow (Stroke-Only, No Fill) =====
    draw_title(canvas, &mut y, "19. True Hollow (Stroke Only)");
    draw_subtitle(
        canvas,
        &mut y,
        "Transparent fill with visible stroke — pure outlined glyphs",
    );
    {
        let mut style = TextStyleRec::from_font("Geist", 48.0);
        style.font_weight = FontWeight(900);

        let attr = AttributedStringBuilder::new()
            .push_painted(
                "HOLLOW ",
                &style,
                Some(vec![Paint::from(CGColor::TRANSPARENT)]),
                Some(Paints::new(vec![Paint::from(CGColor::from_rgba(40, 40, 40, 255))])),
                Some(1.5),
                None,
            )
            .push_painted(
                "GRADIENT",
                &style,
                Some(vec![Paint::from(CGColor::TRANSPARENT)]),
                Some(Paints::new(vec![Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
                    CGColor::from_rgba(200, 0, 80, 255),
                    CGColor::from_rgba(80, 0, 200, 255),
                ]))])),
                Some(2.5),
                None,
            )
            .build();

        let para = build_attributed_paragraph(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // ===== Section 20: Image Fill =====
    draw_title(canvas, &mut y, "20. Image Fill");
    draw_subtitle(
        canvas,
        &mut y,
        "Image paint on text runs via ImageRepository",
    );
    {
        // Generate a checkerboard PNG in memory
        let checker_size = 64;
        let cell = 8;
        let mut checker_surface =
            surfaces::raster_n32_premul((checker_size, checker_size)).unwrap();
        {
            let c = checker_surface.canvas();
            c.clear(Color::WHITE);
            let mut dark_paint = SkPaint::default();
            dark_paint.set_color(Color::from_argb(255, 60, 60, 200));
            dark_paint.set_anti_alias(false);
            for row in 0..(checker_size / cell) {
                for col in 0..(checker_size / cell) {
                    if (row + col) % 2 == 0 {
                        c.draw_rect(
                            skia_safe::Rect::from_xywh(
                                (col * cell) as f32,
                                (row * cell) as f32,
                                cell as f32,
                                cell as f32,
                            ),
                            &dark_paint,
                        );
                    }
                }
            }
        }
        let checker_img = checker_surface.image_snapshot();
        let checker_png = checker_img
            .encode(None, skia_safe::EncodedImageFormat::PNG, None)
            .unwrap();

        // Set up ImageRepository with the checkerboard
        let store = Arc::new(Mutex::new(ByteStore::new()));
        let checker_hash: u64 = 0xC4EC;
        store
            .lock()
            .unwrap()
            .insert(checker_hash, checker_png.as_bytes().to_vec());
        let mut images = ImageRepository::new(store);
        images.insert("checker".to_string(), checker_hash);

        let mut style = TextStyleRec::from_font("Geist", 48.0);
        style.font_weight = FontWeight(900);

        let image_fill = Paint::Image(ImagePaint {
            active: true,
            image: ResourceRef::RID("checker".to_string()),
            quarter_turns: 0,
            alignement: Alignment::CENTER,
            fit: ImagePaintFit::Tile(ImageTile {
                scale: 1.0,
                repeat: ImageRepeat::Repeat,
            }),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            filters: ImageFilters::default(),
        });

        let attr = AttributedStringBuilder::new()
            .push_painted(
                "IMAGE FILL",
                &style,
                Some(vec![image_fill]),
                None,
                None,
                None,
            )
            .build();

        let para = build_attributed_paragraph_with_images(
            &attr,
            TextAlign::Left,
            None,
            None,
            &font_collection,
            layout_width,
            &[],
            Some(&images),
        );
        para.paint(canvas, Point::new(start_x, y));
        y += para.height() + 20.0;
    }

    // -- Save --
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/type_attributed.png"),
        data.as_bytes(),
    )
    .unwrap();
    println!("Generated goldens/type_attributed.png ({y:.0}px used of 2800px)");
}
