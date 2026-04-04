//! HTML+CSS → Skia Picture rendering engine.
//!
//! Three-phase pipeline:
//! 1. **Collect** (`collect.rs`) — Stylo DOM → `StyledElement` tree (plain Rust, no Skia)
//! 2. **Layout** (`layout.rs`) — `StyledElement` → Taffy → `LayoutBox` tree (positioned)
//! 3. **Paint** (`paint.rs`) — `LayoutBox` → Skia Picture
//!
//! # Thread Safety
//!
//! Uses Stylo's process-global DOM slot. Calls must be serialized externally.

mod collect;
mod faux_table;
mod github_markdown;
mod layout;
mod paint;
pub mod style;
pub mod types;

use crate::runtime::font_repository::FontRepository;
use github_markdown::GITHUB_MARKDOWN_CSS;

/// Render HTML+CSS to a Skia Picture.
pub fn render(
    html: &str,
    width: f32,
    _height: f32,
    fonts: &FontRepository,
) -> Result<skia_safe::Picture, String> {
    let root = collect::collect_styled_tree(html)?;
    let Some(root) = root else {
        // Empty document — return a minimal picture
        let mut recorder = skia_safe::PictureRecorder::new();
        let bounds = skia_safe::Rect::from_wh(width, 1.0);
        recorder.begin_recording(bounds, false);
        return Ok(recorder
            .finish_recording_as_picture(Some(&bounds))
            .expect("empty picture"));
    };

    let layout_root = layout::compute_layout(&root, width, fonts);
    let content_height = layout_root.height;

    Ok(paint::paint_to_picture(
        &layout_root,
        width,
        content_height,
        fonts,
    ))
}

/// Measure the content height of HTML at the given width.
///
/// Runs style resolution and Taffy layout but does not create a Skia Picture.
pub fn measure_content_height(
    html: &str,
    width: f32,
    fonts: &FontRepository,
) -> Result<f32, String> {
    let root = collect::collect_styled_tree(html)?;
    let Some(root) = root else {
        return Ok(0.0);
    };
    Ok(layout::compute_content_height(&root, width, fonts))
}

/// Convert GFM markdown to a self-contained HTML document with GitHub-flavored CSS.
///
/// The output is a complete `<html>` document with an embedded `<style>` block
/// that can be passed directly to [`render()`].
pub fn markdown_to_styled_html(markdown: &str) -> String {
    let html_body = crate::io::io_markdown::markdown_to_html(markdown);
    format!(
        "<html><head><style>{}</style></head><body class=\"markdown-body\">{}</body></html>",
        GITHUB_MARKDOWN_CSS, html_body
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resources::ByteStore;
    use std::sync::{Arc, Mutex};

    /// Stylo uses a process-global DOM slot that is not thread-safe.
    /// All htmlcss tests must be serialized to avoid concurrent access.
    /// We also share this with the `html` module's tests via crate-level visibility.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn test_fonts() -> FontRepository {
        FontRepository::new(Arc::new(Mutex::new(ByteStore::new())))
    }

    #[test]
    fn test_render_empty() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render("", 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_heading() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render("<h1>Hello</h1>", 400.0, 300.0, &fonts).unwrap();
        assert!(pic.cull_rect().width() > 0.0);
    }

    #[test]
    fn test_render_with_style_block() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render(
            "<style>h1 { color: blue }</style><h1>Blue</h1>",
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_table() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render(
            "<table><tr><td>A</td><td>B</td></tr></table>",
            600.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_flex() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:flex;gap:10px"><div>A</div><div>B</div></div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_opacity() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="opacity:0.5"><p>Semi-transparent</p></div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    /// Diagnostic: verify how Skia counts placeholder offsets for get_rects_for_range.
    #[test]
    fn test_placeholder_byte_offset() {
        use skia_safe::textlayout::*;

        let mut fc = FontCollection::new();
        fc.set_default_font_manager(skia_safe::FontMgr::new(), None);

        let ps = ParagraphStyle::new();
        let mut builder = ParagraphBuilder::new(&ps, &fc);
        let mut ts = TextStyle::new();
        ts.set_font_size(16.0);
        ts.set_color(skia_safe::Color::BLACK);

        // Build: "abc" + placeholder(20px, 0.01 height) + "def"
        builder.push_style(&ts);
        builder.add_text("abc");
        builder.pop();
        builder.add_placeholder(&PlaceholderStyle::new(
            20.0,
            0.01,
            PlaceholderAlignment::Baseline,
            TextBaseline::Alphabetic,
            0.0,
        ));
        builder.push_style(&ts);
        builder.add_text("def");
        builder.pop();

        let mut para = builder.build();
        para.layout(500.0);

        // Verify: "def" starts at offset 4 (abc=3 + placeholder=1)
        let rects_def =
            para.get_rects_for_range(4..7, RectHeightStyle::Tight, RectWidthStyle::Tight);
        assert!(!rects_def.is_empty(), "Should find rects for 'def' at 4..7");
        let def_left = rects_def[0].rect.left;
        assert!(
            def_left > 25.0,
            "def should be after abc+placeholder, got left={def_left}"
        );

        // Verify: placeholder occupies 1 offset position
        // offset 3 = the placeholder itself (zero-height rect)
        let rects_placeholder =
            para.get_rects_for_range(3..4, RectHeightStyle::Tight, RectWidthStyle::Tight);
        assert!(
            !rects_placeholder.is_empty(),
            "Placeholder should have a rect at offset 3..4"
        );
        let ph_height = rects_placeholder[0].rect.height();
        assert!(
            ph_height < 1.0,
            "Placeholder rect should have near-zero height, got {ph_height}"
        );
    }

    #[test]
    fn test_measure_height() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let h = measure_content_height("<p>Hello</p>", 400.0, &fonts).unwrap();
        assert!(h > 0.0, "Content height should be positive, got {h}");
    }

    #[test]
    fn test_head_hidden() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let pic = render(
            r#"<html><head><style>p{color:red}</style></head><body><p>V</p></body></html>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "With head should have height, got {h}");
    }

    // ── Markdown → htmlcss pipeline roundtrip tests ──

    #[test]
    fn test_markdown_heading() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let html = markdown_to_styled_html("# Hello World");
        let pic = render(&html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Markdown heading should render");
        assert!(pic.unwrap().cull_rect().height() > 0.0);
    }

    #[test]
    fn test_markdown_mixed_content() {
        let _guard = TEST_LOCK.lock().unwrap();
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
        let html = markdown_to_styled_html(md);
        let pic = render(&html, 600.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Mixed markdown content should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 50.0, "Mixed content should have substantial height, got {h}");
    }

    #[test]
    fn test_markdown_table() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let md = r#"
| Name  | Age | City     |
|-------|-----|----------|
| Alice | 30  | New York |
| Bob   | 25  | London   |
"#;
        let html = markdown_to_styled_html(md);
        let pic = render(&html, 600.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Markdown table should render");
    }

    #[test]
    fn test_markdown_empty() {
        let _guard = TEST_LOCK.lock().unwrap();
        let fonts = test_fonts();
        let html = markdown_to_styled_html("");
        let pic = render(&html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Empty markdown should render");
    }
}
