//! Markdown → Skia Picture renderer.
//!
//! Walks pulldown-cmark events and draws directly to a Skia canvas using
//! Skia's `textlayout::Paragraph` API for text blocks and basic Skia
//! drawing primitives for decorations (horizontal rules, code block
//! backgrounds, blockquote borders, etc.).
//!
//! The result is captured as a `skia_safe::Picture` that can be cached
//! and replayed at paint time.

use crate::runtime::font_repository::FontRepository;
use pulldown_cmark::{Alignment, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use skia_safe::{font_style, textlayout, Color, Paint as SkPaint, PictureRecorder, Rect};

/// GitHub-flavored markdown theme colors (light theme).
struct MdTheme {
    fg: Color,
    link: Color,
    code_bg: Color,
    code_fg: Color,
    border: Color,
    blockquote_border: Color,
    heading_fg: Color,
}

impl Default for MdTheme {
    fn default() -> Self {
        Self {
            fg: Color::from_rgb(31, 35, 40),
            link: Color::from_rgb(9, 105, 218),
            code_bg: Color::from_rgb(246, 248, 250),
            code_fg: Color::from_rgb(31, 35, 40),
            border: Color::from_rgb(216, 222, 228),
            blockquote_border: Color::from_rgb(208, 215, 222),
            heading_fg: Color::from_rgb(31, 35, 40),
        }
    }
}

struct HeadingStyle {
    font_size: f32,
    weight: font_style::Weight,
    bottom_border: bool,
    margin_top: f32,
    margin_bottom: f32,
}

fn heading_style(level: HeadingLevel) -> HeadingStyle {
    match level {
        HeadingLevel::H1 => HeadingStyle {
            font_size: 32.0,
            weight: font_style::Weight::SEMI_BOLD,
            bottom_border: true,
            margin_top: 24.0,
            margin_bottom: 16.0,
        },
        HeadingLevel::H2 => HeadingStyle {
            font_size: 24.0,
            weight: font_style::Weight::SEMI_BOLD,
            bottom_border: true,
            margin_top: 24.0,
            margin_bottom: 16.0,
        },
        HeadingLevel::H3 => HeadingStyle {
            font_size: 20.0,
            weight: font_style::Weight::SEMI_BOLD,
            bottom_border: false,
            margin_top: 24.0,
            margin_bottom: 16.0,
        },
        HeadingLevel::H4 => HeadingStyle {
            font_size: 16.0,
            weight: font_style::Weight::SEMI_BOLD,
            bottom_border: false,
            margin_top: 24.0,
            margin_bottom: 16.0,
        },
        HeadingLevel::H5 => HeadingStyle {
            font_size: 14.0,
            weight: font_style::Weight::SEMI_BOLD,
            bottom_border: false,
            margin_top: 24.0,
            margin_bottom: 16.0,
        },
        HeadingLevel::H6 => HeadingStyle {
            font_size: 13.5,
            weight: font_style::Weight::SEMI_BOLD,
            bottom_border: false,
            margin_top: 24.0,
            margin_bottom: 16.0,
        },
    }
}

/// Inline formatting state tracked while walking cmark events.
#[derive(Clone, Default)]
struct InlineState {
    bold: bool,
    italic: bool,
    strikethrough: bool,
    code: bool,
    link: bool,
}

/// Build a Skia `TextStyle` from the current inline state and base font size.
fn text_style_from_state(
    state: &InlineState,
    theme: &MdTheme,
    base_font_size: f32,
    font_families: &[&str],
) -> textlayout::TextStyle {
    let mut ts = textlayout::TextStyle::new();
    ts.set_font_size(base_font_size);

    let weight = if state.bold {
        font_style::Weight::BOLD
    } else {
        font_style::Weight::NORMAL
    };
    let slant = if state.italic {
        font_style::Slant::Italic
    } else {
        font_style::Slant::Upright
    };
    ts.set_font_style(skia_safe::FontStyle::new(
        weight,
        font_style::Width::NORMAL,
        slant,
    ));

    if state.code {
        ts.set_font_families(&["SF Mono", "Menlo", "Consolas", "monospace"]);
        let mut fg_paint = SkPaint::default();
        fg_paint.set_color(theme.code_fg);
        ts.set_foreground_paint(&fg_paint);
        ts.set_font_size(base_font_size * 0.85);
    } else {
        ts.set_font_families(font_families);
        let color = if state.link { theme.link } else { theme.fg };
        let mut fg_paint = SkPaint::default();
        fg_paint.set_color(color);
        ts.set_foreground_paint(&fg_paint);
    }

    let mut decoration = textlayout::TextDecoration::NO_DECORATION;
    if state.strikethrough {
        decoration |= textlayout::TextDecoration::LINE_THROUGH;
    }
    if state.link {
        decoration |= textlayout::TextDecoration::UNDERLINE;
    }
    if decoration != textlayout::TextDecoration::NO_DECORATION {
        ts.set_decoration_style(textlayout::TextDecorationStyle::Solid);
        ts.set_decoration_type(decoration);
    }

    ts
}

/// Render a GFM table collected during the event walk.
///
/// Returns the new `y` cursor position after the table.
fn draw_table(
    canvas: &skia_safe::Canvas,
    font_collection: &textlayout::FontCollection,
    theme: &MdTheme,
    font_families: &[&str],
    body_font_size: f32,
    line_height: f32,
    alignments: &[Alignment],
    rows: &[Vec<String>],
    x_base: f32,
    y_start: f32,
    content_width: f32,
) -> f32 {
    if rows.is_empty() {
        return y_start;
    }

    let cell_pad: f32 = 8.0;
    let num_cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if num_cols == 0 {
        return y_start;
    }

    // Equal-width columns that fill the available width.
    let col_width = content_width / num_cols as f32;

    // ── Measure pass: build paragraphs and compute row heights ──
    let mut built_rows: Vec<Vec<textlayout::Paragraph>> = Vec::with_capacity(rows.len());
    let mut row_heights: Vec<f32> = Vec::with_capacity(rows.len());

    for (ri, row) in rows.iter().enumerate() {
        let is_header = ri == 0;
        let mut paras: Vec<textlayout::Paragraph> = Vec::with_capacity(num_cols);
        let mut max_h: f32 = 0.0;

        for ci in 0..num_cols {
            let cell_text = row.get(ci).map(|s| s.as_str()).unwrap_or("");

            let align = alignments.get(ci).copied().unwrap_or(Alignment::None);
            let sk_align = match align {
                Alignment::Left | Alignment::None => textlayout::TextAlign::Left,
                Alignment::Center => textlayout::TextAlign::Center,
                Alignment::Right => textlayout::TextAlign::Right,
            };

            let mut ps = textlayout::ParagraphStyle::new();
            ps.set_text_align(sk_align);
            let mut builder = textlayout::ParagraphBuilder::new(&ps, font_collection);

            let mut ts = textlayout::TextStyle::new();
            ts.set_font_size(body_font_size);
            ts.set_font_families(&font_families.iter().copied().collect::<Vec<_>>());
            let weight = if is_header {
                font_style::Weight::SEMI_BOLD
            } else {
                font_style::Weight::NORMAL
            };
            ts.set_font_style(skia_safe::FontStyle::new(
                weight,
                font_style::Width::NORMAL,
                font_style::Slant::Upright,
            ));
            let mut fg = SkPaint::default();
            fg.set_color(theme.fg);
            ts.set_foreground_paint(&fg);
            ts.set_height_override(true);
            ts.set_height(line_height);

            builder.push_style(&ts);
            builder.add_text(cell_text);
            let mut para = builder.build();
            para.layout(col_width - cell_pad * 2.0);
            max_h = max_h.max(para.height());
            paras.push(para);
        }

        row_heights.push(max_h + cell_pad * 2.0);
        built_rows.push(paras);
    }

    // ── Draw pass ──
    let mut y = y_start;

    // Header background
    if !built_rows.is_empty() {
        let mut bg = SkPaint::default();
        bg.set_color(theme.code_bg);
        bg.set_style(skia_safe::PaintStyle::Fill);
        canvas.draw_rect(
            Rect::from_xywh(x_base, y, content_width, row_heights[0]),
            &bg,
        );
    }

    // Horizontal border paint
    let mut border = SkPaint::default();
    border.set_color(theme.border);
    border.set_stroke_width(1.0);
    border.set_style(skia_safe::PaintStyle::Stroke);

    // Top border
    canvas.draw_line((x_base, y), (x_base + content_width, y), &border);

    for (ri, paras) in built_rows.iter().enumerate() {
        let rh = row_heights[ri];

        // Draw cell text
        for (ci, para) in paras.iter().enumerate() {
            let cx = x_base + ci as f32 * col_width + cell_pad;
            let cy = y + cell_pad;
            para.paint(canvas, (cx, cy));
        }

        y += rh;

        // Horizontal border after each row
        canvas.draw_line((x_base, y), (x_base + content_width, y), &border);
    }

    // Vertical column borders
    let table_top = y_start;
    let table_bottom = y;
    for ci in 0..=num_cols {
        let vx = x_base + ci as f32 * col_width;
        canvas.draw_line((vx, table_top), (vx, table_bottom), &border);
    }

    y
}

/// Renders GFM markdown to a Skia `Picture`.
///
/// The picture records all draw commands at the given `width`; the actual
/// content height is determined by the text layout. The caller can query
/// `picture.cull_rect()` to get the used bounds.
pub fn render_markdown_picture(
    markdown: &str,
    width: f32,
    fonts: &FontRepository,
) -> skia_safe::Picture {
    let theme = MdTheme::default();
    let font_collection = fonts.font_collection();
    let body_font_size: f32 = 16.0;
    let line_height: f32 = 1.5;
    let padding: f32 = 16.0;
    let content_width = (width - padding * 2.0).max(0.0);
    let font_families: Vec<&str> = vec!["Geist", "system-ui", "sans-serif"];

    let options = Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_MATH;
    let parser = Parser::new_ext(markdown, options);

    let mut recorder = PictureRecorder::new();
    let bounds = Rect::from_wh(width, 100_000.0);
    let canvas = recorder.begin_recording(bounds, false);

    let mut y: f32 = padding;
    let x_base: f32 = padding;

    let mut inline = InlineState::default();
    let mut para_builder: Option<textlayout::ParagraphBuilder> = None;
    let mut current_heading: Option<HeadingLevel> = None;
    let mut in_code_block = false;
    let mut code_block_text = String::new();
    let mut in_blockquote = false;
    let mut list_depth: u32 = 0;
    let mut ordered_list_index: Option<u64> = None;
    // Stack of parent list index for nested lists.
    let mut list_stack: Vec<Option<u64>> = Vec::new();

    // Image state — collect alt text between Start(Image) and End(Image)
    let mut in_image = false;
    let mut image_alt_text = String::new();

    // Table state
    let mut table_alignments: Vec<Alignment> = Vec::new();
    let mut table_rows: Vec<Vec<String>> = Vec::new();
    let mut table_current_row: Vec<String> = Vec::new();
    let mut table_cell_text = String::new();
    let mut in_table = false;

    let events: Vec<Event> = parser.collect();

    for event in &events {
        match event {
            // ----- Block-level start tags -----
            Event::Start(Tag::Heading { level, .. }) => {
                current_heading = Some(*level);
                let hs = heading_style(*level);
                y += hs.margin_top;
                let ps = textlayout::ParagraphStyle::new();
                para_builder = Some(textlayout::ParagraphBuilder::new(&ps, font_collection));
            }
            Event::Start(Tag::Paragraph) => {
                let ps = textlayout::ParagraphStyle::new();
                para_builder = Some(textlayout::ParagraphBuilder::new(&ps, font_collection));
            }
            Event::Start(Tag::CodeBlock(_)) => {
                in_code_block = true;
                code_block_text.clear();
            }
            Event::Start(Tag::BlockQuote(_)) => {
                in_blockquote = true;
                let ps = textlayout::ParagraphStyle::new();
                para_builder = Some(textlayout::ParagraphBuilder::new(&ps, font_collection));
            }
            Event::Start(Tag::List(first_item)) => {
                list_depth += 1;
                list_stack.push(ordered_list_index);
                ordered_list_index = *first_item;
            }
            Event::Start(Tag::Item) => {
                let ps = textlayout::ParagraphStyle::new();
                para_builder = Some(textlayout::ParagraphBuilder::new(&ps, font_collection));

                if let Some(builder) = &mut para_builder {
                    let prefix = if let Some(idx) = ordered_list_index {
                        let s = format!("{}. ", idx);
                        ordered_list_index = Some(idx + 1);
                        s
                    } else {
                        "\u{2022} ".to_string()
                    };
                    let ts = text_style_from_state(&inline, &theme, body_font_size, &font_families);
                    builder.push_style(&ts);
                    builder.add_text(&prefix);
                }
            }
            Event::Start(Tag::Table(alignments)) => {
                in_table = true;
                table_alignments = alignments.clone();
                table_rows.clear();
            }
            Event::Start(Tag::TableHead) => {}
            Event::Start(Tag::TableRow) => {
                table_current_row.clear();
            }
            Event::Start(Tag::TableCell) => {
                table_cell_text.clear();
            }

            // ----- Inline start tags -----
            Event::Start(Tag::Strong) => inline.bold = true,
            Event::Start(Tag::Emphasis) => inline.italic = true,
            Event::Start(Tag::Strikethrough) => inline.strikethrough = true,
            Event::Start(Tag::Link { .. }) => inline.link = true,
            Event::Start(Tag::Image { .. }) => {
                in_image = true;
                image_alt_text.clear();
            }

            // ----- Text content -----
            Event::Text(text) => {
                if in_image {
                    image_alt_text.push_str(text);
                } else if in_table {
                    table_cell_text.push_str(text);
                } else if in_code_block {
                    code_block_text.push_str(text);
                } else if let Some(builder) = &mut para_builder {
                    let ts = if let Some(level) = current_heading {
                        let hs = heading_style(level);
                        let mut ts = textlayout::TextStyle::new();
                        ts.set_font_size(hs.font_size);
                        ts.set_font_style(skia_safe::FontStyle::new(
                            hs.weight,
                            font_style::Width::NORMAL,
                            font_style::Slant::Upright,
                        ));
                        ts.set_font_families(&font_families.iter().copied().collect::<Vec<_>>());
                        let mut fg_paint = SkPaint::default();
                        fg_paint.set_color(theme.heading_fg);
                        ts.set_foreground_paint(&fg_paint);
                        ts.set_height_override(true);
                        ts.set_height(line_height);
                        ts
                    } else {
                        let mut ts =
                            text_style_from_state(&inline, &theme, body_font_size, &font_families);
                        ts.set_height_override(true);
                        ts.set_height(line_height);
                        ts
                    };

                    builder.push_style(&ts);
                    builder.add_text(text);
                    builder.pop();
                }
            }
            Event::Code(code) => {
                if in_table {
                    table_cell_text.push_str(code);
                } else if let Some(builder) = &mut para_builder {
                    let mut code_state = inline.clone();
                    code_state.code = true;
                    let ts =
                        text_style_from_state(&code_state, &theme, body_font_size, &font_families);
                    builder.push_style(&ts);
                    builder.add_text(code);
                    builder.pop();
                }
            }
            Event::SoftBreak => {
                if let Some(builder) = &mut para_builder {
                    builder.add_text(" ");
                }
            }
            Event::HardBreak => {
                if let Some(builder) = &mut para_builder {
                    builder.add_text("\n");
                }
            }
            Event::InlineMath(math) => {
                if let Some(builder) = &mut para_builder {
                    let mut ts = textlayout::TextStyle::new();
                    ts.set_font_size(body_font_size);
                    ts.set_font_families(&["SF Mono", "Menlo", "Consolas", "monospace"]);
                    ts.set_font_style(skia_safe::FontStyle::new(
                        font_style::Weight::NORMAL,
                        font_style::Width::NORMAL,
                        font_style::Slant::Italic,
                    ));
                    let mut fg = SkPaint::default();
                    fg.set_color(theme.fg);
                    ts.set_foreground_paint(&fg);
                    builder.push_style(&ts);
                    builder.add_text(math);
                    builder.pop();
                }
            }
            Event::DisplayMath(math) => {
                // Render as a centered monospace block
                let mut ps = textlayout::ParagraphStyle::new();
                ps.set_text_align(textlayout::TextAlign::Center);
                let mut builder = textlayout::ParagraphBuilder::new(&ps, font_collection);
                let mut ts = textlayout::TextStyle::new();
                ts.set_font_size(body_font_size);
                ts.set_font_families(&["SF Mono", "Menlo", "Consolas", "monospace"]);
                ts.set_font_style(skia_safe::FontStyle::new(
                    font_style::Weight::NORMAL,
                    font_style::Width::NORMAL,
                    font_style::Slant::Italic,
                ));
                let mut fg = SkPaint::default();
                fg.set_color(theme.fg);
                ts.set_foreground_paint(&fg);
                ts.set_height_override(true);
                ts.set_height(line_height);
                builder.push_style(&ts);
                builder.add_text(math);
                let mut paragraph = builder.build();
                paragraph.layout(content_width);
                y += 8.0;
                paragraph.paint(canvas, (x_base, y));
                y += paragraph.height() + 8.0;
            }

            // ----- Inline end tags -----
            Event::End(TagEnd::Strong) => inline.bold = false,
            Event::End(TagEnd::Emphasis) => inline.italic = false,
            Event::End(TagEnd::Strikethrough) => inline.strikethrough = false,
            Event::End(TagEnd::Link) => inline.link = false,
            Event::End(TagEnd::Image) => {
                in_image = false;
                // Draw a placeholder rect with alt text
                let placeholder_h: f32 = 80.0;
                let mut bg = SkPaint::default();
                bg.set_color(theme.code_bg);
                bg.set_style(skia_safe::PaintStyle::Fill);
                let rect = Rect::from_xywh(x_base, y, content_width, placeholder_h);
                canvas.draw_round_rect(rect, 4.0, 4.0, &bg);

                let mut border_paint = SkPaint::default();
                border_paint.set_color(theme.border);
                border_paint.set_stroke_width(1.0);
                border_paint.set_style(skia_safe::PaintStyle::Stroke);
                canvas.draw_round_rect(rect, 4.0, 4.0, &border_paint);

                // Alt text centered in the placeholder
                let label = if image_alt_text.is_empty() {
                    "\u{1f5bc} Image".to_string()
                } else {
                    format!("\u{1f5bc} {}", image_alt_text)
                };
                let mut ps = textlayout::ParagraphStyle::new();
                ps.set_text_align(textlayout::TextAlign::Center);
                let mut builder = textlayout::ParagraphBuilder::new(&ps, font_collection);
                let mut ts = textlayout::TextStyle::new();
                ts.set_font_size(body_font_size * 0.85);
                ts.set_font_families(&font_families.iter().copied().collect::<Vec<_>>());
                let mut fg = SkPaint::default();
                fg.set_color(theme.blockquote_border);
                ts.set_foreground_paint(&fg);
                builder.push_style(&ts);
                builder.add_text(&label);
                let mut para = builder.build();
                para.layout(content_width);
                let text_y = y + (placeholder_h - para.height()) / 2.0;
                para.paint(canvas, (x_base, text_y));

                y += placeholder_h + 16.0;
            }

            // ----- Block-level end tags -----
            Event::End(TagEnd::Heading(_)) => {
                if let Some(mut builder) = para_builder.take() {
                    let mut paragraph = builder.build();
                    paragraph.layout(content_width);
                    paragraph.paint(canvas, (x_base, y));
                    y += paragraph.height();

                    if let Some(level) = current_heading {
                        let hs = heading_style(level);
                        if hs.bottom_border {
                            y += 4.0;
                            let mut border_paint = SkPaint::default();
                            border_paint.set_color(theme.border);
                            border_paint.set_stroke_width(1.0);
                            border_paint.set_style(skia_safe::PaintStyle::Stroke);
                            canvas.draw_line(
                                (x_base, y),
                                (x_base + content_width, y),
                                &border_paint,
                            );
                            y += 1.0;
                        }
                        y += hs.margin_bottom;
                    }
                }
                current_heading = None;
            }
            Event::End(TagEnd::Paragraph) => {
                if let Some(mut builder) = para_builder.take() {
                    let mut paragraph = builder.build();
                    let indent = if in_blockquote { 16.0 } else { 0.0 };
                    let avail_width = content_width - indent;
                    let x = x_base + indent;

                    paragraph.layout(avail_width);
                    let h = paragraph.height();

                    if in_blockquote {
                        let mut bq_paint = SkPaint::default();
                        bq_paint.set_color(theme.blockquote_border);
                        bq_paint.set_stroke_width(4.0);
                        bq_paint.set_style(skia_safe::PaintStyle::Stroke);
                        canvas.draw_line((x_base + 2.0, y), (x_base + 2.0, y + h), &bq_paint);
                    }

                    paragraph.paint(canvas, (x, y));
                    y += h + 16.0;
                }
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code_block = false;
                let code_padding = 16.0;
                let ps = textlayout::ParagraphStyle::new();
                let mut builder = textlayout::ParagraphBuilder::new(&ps, font_collection);
                let mut ts = textlayout::TextStyle::new();
                ts.set_font_size(body_font_size * 0.85);
                ts.set_font_families(&["SF Mono", "Menlo", "Consolas", "monospace"]);
                let mut fg_paint = SkPaint::default();
                fg_paint.set_color(theme.code_fg);
                ts.set_foreground_paint(&fg_paint);
                ts.set_height_override(true);
                ts.set_height(1.45);
                builder.push_style(&ts);
                builder.add_text(&code_block_text);
                let mut paragraph = builder.build();
                paragraph.layout(content_width - code_padding * 2.0);
                let h = paragraph.height();

                // Background rect
                let mut bg_paint = SkPaint::default();
                bg_paint.set_color(theme.code_bg);
                bg_paint.set_style(skia_safe::PaintStyle::Fill);
                let code_rect = Rect::from_xywh(x_base, y, content_width, h + code_padding * 2.0);
                canvas.draw_round_rect(code_rect, 6.0, 6.0, &bg_paint);

                // Border
                let mut border_paint = SkPaint::default();
                border_paint.set_color(theme.border);
                border_paint.set_stroke_width(1.0);
                border_paint.set_style(skia_safe::PaintStyle::Stroke);
                canvas.draw_round_rect(code_rect, 6.0, 6.0, &border_paint);

                paragraph.paint(canvas, (x_base + code_padding, y + code_padding));
                y += h + code_padding * 2.0 + 16.0;

                code_block_text.clear();
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                in_blockquote = false;
            }
            Event::End(TagEnd::List(_)) => {
                list_depth = list_depth.saturating_sub(1);
                ordered_list_index = list_stack.pop().unwrap_or(None);
                if list_depth == 0 {
                    y += 8.0;
                }
            }
            Event::End(TagEnd::Item) => {
                if let Some(mut builder) = para_builder.take() {
                    let mut paragraph = builder.build();
                    let indent = list_depth as f32 * 24.0;
                    paragraph.layout(content_width - indent);
                    paragraph.paint(canvas, (x_base + indent, y));
                    y += paragraph.height() + 4.0;
                }
            }
            Event::End(TagEnd::TableCell) => {
                table_current_row.push(std::mem::take(&mut table_cell_text));
            }
            Event::End(TagEnd::TableRow) => {
                table_rows.push(std::mem::take(&mut table_current_row));
            }
            Event::End(TagEnd::TableHead) => {}
            Event::End(TagEnd::Table) => {
                in_table = false;
                // ── Render the collected table ──
                y = draw_table(
                    canvas,
                    font_collection,
                    &theme,
                    &font_families,
                    body_font_size,
                    line_height,
                    &table_alignments,
                    &table_rows,
                    x_base,
                    y,
                    content_width,
                );
                y += 16.0; // margin after table
                table_rows.clear();
            }

            // ----- Standalone events -----
            Event::Rule => {
                y += 8.0;
                let mut rule_paint = SkPaint::default();
                rule_paint.set_color(theme.border);
                rule_paint.set_stroke_width(2.0);
                rule_paint.set_style(skia_safe::PaintStyle::Stroke);
                canvas.draw_line((x_base, y), (x_base + content_width, y), &rule_paint);
                y += 10.0;
            }
            Event::TaskListMarker(checked) => {
                if let Some(builder) = &mut para_builder {
                    let prefix = if *checked { "\u{2611} " } else { "\u{2610} " };
                    let ts = text_style_from_state(&inline, &theme, body_font_size, &font_families);
                    builder.push_style(&ts);
                    builder.add_text(prefix);
                    builder.pop();
                }
            }

            _ => {}
        }
    }

    recorder
        .finish_recording_as_picture(Some(&Rect::from_xywh(0.0, 0.0, width, y + padding)))
        .expect("Failed to finish recording markdown picture")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resources::ByteStore;
    use crate::runtime::font_repository::FontRepository;
    use std::sync::{Arc, Mutex};

    fn test_fonts() -> FontRepository {
        FontRepository::new(Arc::new(Mutex::new(ByteStore::new())))
    }

    #[test]
    fn test_render_empty_markdown() {
        let fonts = test_fonts();
        let picture = render_markdown_picture("", 400.0, &fonts);
        // Empty markdown still produces a valid picture (just padding)
        let bounds = picture.cull_rect();
        assert!(bounds.height() >= 0.0);
    }

    #[test]
    fn test_render_heading() {
        let fonts = test_fonts();
        let picture = render_markdown_picture("# Hello World", 400.0, &fonts);
        let bounds = picture.cull_rect();
        assert!(bounds.height() > 0.0);
    }

    #[test]
    fn test_render_mixed_content() {
        let fonts = test_fonts();
        let md = r#"# Title

Some **bold** and *italic* text.

- Item 1
- Item 2

```
code block
```

> blockquote

---

1. First
2. Second
"#;
        let picture = render_markdown_picture(md, 600.0, &fonts);
        let bounds = picture.cull_rect();
        assert!(
            bounds.height() > 100.0,
            "Mixed content should have substantial height"
        );
    }

    #[test]
    fn test_render_table() {
        let fonts = test_fonts();
        let md = r#"
| Name  | Age | City     |
|-------|-----|----------|
| Alice | 30  | New York |
| Bob   | 25  | London   |
| Carol | 28  | Tokyo    |
"#;
        let picture = render_markdown_picture(md, 600.0, &fonts);
        let bounds = picture.cull_rect();
        assert!(
            bounds.height() > 50.0,
            "Table should have substantial height, got {}",
            bounds.height()
        );
    }

    #[test]
    fn test_render_table_with_alignment() {
        let fonts = test_fonts();
        let md = r#"
| Left   | Center | Right |
|:-------|:------:|------:|
| text   | text   | text  |
"#;
        let picture = render_markdown_picture(md, 500.0, &fonts);
        let bounds = picture.cull_rect();
        assert!(bounds.height() > 0.0);
    }

    #[test]
    fn test_math_events_parsed() {
        // Verify pulldown-cmark emits math events with our parser options.
        use pulldown_cmark::{Event, Options, Parser};
        let options = Options::ENABLE_MATH
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TABLES
            | Options::ENABLE_TASKLISTS;

        let inline_md = "Energy is $E = mc^2$ in physics.\n";
        let inline_events: Vec<Event> = Parser::new_ext(inline_md, options).collect();
        assert!(
            inline_events
                .iter()
                .any(|e| matches!(e, Event::InlineMath(_))),
            "Should emit InlineMath: {inline_events:?}"
        );

        let display_md = "$$x^2 + y^2 = z^2$$\n";
        let display_events: Vec<Event> = Parser::new_ext(display_md, options).collect();
        assert!(
            display_events
                .iter()
                .any(|e| matches!(e, Event::DisplayMath(_))),
            "Should emit DisplayMath: {display_events:?}"
        );
    }

    #[test]
    fn test_render_math_in_context() {
        // Math mixed with structural elements that produce draw ops even
        // without fonts (headings have border lines, code blocks have rects).
        let fonts = test_fonts();
        let md = r#"# Math

Inline: $E = mc^2$

$$\int_0^1 x\,dx$$

---
"#;
        let picture = render_markdown_picture(md, 400.0, &fonts);
        let h = picture.cull_rect().height();
        assert!(h > 50.0, "Math in context should render, got height {h}");
    }

    #[test]
    fn test_render_image_placeholder() {
        // Image placeholder draws rects (background + border), so it produces
        // draw ops even without fonts.
        let fonts = test_fonts();
        let md = "![Alt text for image](https://example.com/image.png)\n";
        let picture = render_markdown_picture(md, 400.0, &fonts);
        let h = picture.cull_rect().height();
        assert!(h > 80.0, "Image placeholder should have height, got {h}");
    }
}
