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

    fn test_fonts() -> FontRepository {
        FontRepository::new(Arc::new(Mutex::new(ByteStore::new())))
    }

    #[test]
    fn test_render_empty() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render("", 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_heading() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render("<h1>Hello</h1>", 400.0, 300.0, &fonts).unwrap();
        assert!(pic.cull_rect().width() > 0.0);
    }

    #[test]
    fn test_render_with_style_block() {
        let _guard = crate::stylo_test::lock();
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
        let _guard = crate::stylo_test::lock();
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
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:flex;gap:10px"><div>A</div><div>B</div></div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    /// Verify grid properties are collected and layout produces columns.
    #[test]
    fn test_grid_layout_columns() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();

        let html = r#"<div style="display:grid;grid-template-columns:100px 100px 100px">
            <div>A</div><div>B</div><div>C</div>
        </div>"#;

        // Check collection — walk down html>body>div to find the grid container
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        fn find_grid(el: &style::StyledElement) -> Option<&style::StyledElement> {
            if el.display == types::Display::Grid {
                return Some(el);
            }
            for child in &el.children {
                if let style::StyledNode::Element(child_el) = child {
                    if let Some(found) = find_grid(child_el) {
                        return Some(found);
                    }
                }
            }
            None
        }
        let grid_el = find_grid(&root).expect("Should find a grid container in the tree");
        assert!(
            !grid_el.grid_template_columns.is_empty(),
            "grid-template-columns should be collected",
        );

        // Check layout produces side-by-side boxes
        let layout_root = layout::compute_layout(&root, 400.0, &fonts);
        fn find_grid_layout<'a>(
            lb: &'a layout::LayoutBox<'a>,
        ) -> Option<&'a layout::LayoutBox<'a>> {
            if lb.style.display == types::Display::Grid {
                return Some(lb);
            }
            for child in &lb.children {
                if let layout::LayoutNode::Box(child_box) = child {
                    if let Some(found) = find_grid_layout(child_box) {
                        return Some(found);
                    }
                }
            }
            None
        }
        let grid_layout = find_grid_layout(&layout_root).expect("Should find grid in layout");

        // A, B, C should be in 3 columns at x=0, x=100, x=200
        let xs: Vec<f32> = grid_layout
            .children
            .iter()
            .filter_map(|c| match c {
                layout::LayoutNode::Box(b) => Some(b.x),
                _ => None,
            })
            .collect();
        assert_eq!(xs.len(), 3, "Expected 3 box children, got {}", xs.len());
        assert!(
            xs[1] > xs[0],
            "Column 2 should be right of column 1 (x[1]={} > x[0]={})",
            xs[1],
            xs[0]
        );
        assert!(
            xs[2] > xs[1],
            "Column 3 should be right of column 2 (x[2]={} > x[1]={})",
            xs[2],
            xs[1]
        );
    }

    #[test]
    fn test_render_grid_basic() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:grid;grid-template-columns:100px 100px 100px;gap:8px">
                <div>A</div><div>B</div><div>C</div>
            </div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_grid_fr() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:grid;grid-template-columns:1fr 2fr 1fr">
                <div>1fr</div><div>2fr</div><div>1fr</div>
            </div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_grid_repeat() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">
                <div>1</div><div>2</div><div>3</div><div>4</div>
            </div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_grid_span() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
                <div style="grid-column:span 2">wide</div>
                <div>1x1</div>
                <div>1x1</div>
            </div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_grid_auto_flow_dense() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-auto-flow:dense;gap:4px">
                <div style="grid-column:span 2">wide</div>
                <div>a</div>
                <div>b</div>
                <div style="grid-column:span 2">wide</div>
            </div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_box_shadow_outer() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="width:100px;height:80px;box-shadow:4px 4px 8px rgba(0,0,0,0.5)">shadow</div>"#,
            300.0,
            200.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_box_shadow_inset() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="width:100px;height:80px;box-shadow:inset 0 2px 8px rgba(0,0,0,0.6)">inset</div>"#,
            300.0,
            200.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_box_shadow_combined() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = render(
            r#"<div style="width:100px;height:80px;box-shadow:0 4px 12px rgba(0,0,0,0.4),inset 0 1px 4px rgba(0,0,0,0.1)">both</div>"#,
            300.0,
            200.0,
            &fonts,
        );
        assert!(pic.is_ok());
    }

    /// Verify box-shadow properties are collected from Stylo.
    #[test]
    fn test_box_shadow_collection() {
        let _guard = crate::stylo_test::lock();

        let html = r#"<div style="box-shadow:4px 6px 8px 2px rgba(0,0,0,0.5)">shadow</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();

        fn find_shadow_el(el: &style::StyledElement) -> Option<&style::StyledElement> {
            if !el.box_shadow.is_empty() {
                return Some(el);
            }
            for child in &el.children {
                if let style::StyledNode::Element(child_el) = child {
                    if let Some(found) = find_shadow_el(child_el) {
                        return Some(found);
                    }
                }
            }
            None
        }
        let el = find_shadow_el(&root).expect("Should find element with box-shadow");
        assert_eq!(el.box_shadow.len(), 1);
        let s = &el.box_shadow[0];
        assert!((s.offset_x - 4.0).abs() < 0.01);
        assert!((s.offset_y - 6.0).abs() < 0.01);
        assert!((s.blur - 8.0).abs() < 0.01);
        assert!((s.spread - 2.0).abs() < 0.01);
        assert!(!s.inset);
    }

    #[test]
    fn test_render_opacity() {
        let _guard = crate::stylo_test::lock();
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
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let h = measure_content_height("<p>Hello</p>", 400.0, &fonts).unwrap();
        assert!(h > 0.0, "Content height should be positive, got {h}");
    }

    #[test]
    fn test_head_hidden() {
        let _guard = crate::stylo_test::lock();
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
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = markdown_to_styled_html("# Hello World");
        let pic = render(&html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Markdown heading should render");
        assert!(pic.unwrap().cull_rect().height() > 0.0);
    }

    #[test]
    fn test_markdown_mixed_content() {
        let _guard = crate::stylo_test::lock();
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
        assert!(
            h > 50.0,
            "Mixed content should have substantial height, got {h}"
        );
    }

    #[test]
    fn test_markdown_table() {
        let _guard = crate::stylo_test::lock();
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
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = markdown_to_styled_html("");
        let pic = render(&html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Empty markdown should render");
    }

    // ── Transform collection tests ──

    /// Verify translate(px, px) is collected as TransformOp::Translate.
    #[test]
    fn test_transform_translate_collection() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="transform:translate(20px, 10px)">T</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 1);
        match &el.transform[0] {
            types::TransformOp::Translate(tx, ty) => {
                assert_eq!(*tx, types::LengthPercentage::Px(20.0));
                assert_eq!(*ty, types::LengthPercentage::Px(10.0));
            }
            other => panic!("Expected Translate, got {:?}", other),
        }
    }

    /// Verify rotate is collected with radians.
    #[test]
    fn test_transform_rotate_collection() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="transform:rotate(90deg)">R</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 1);
        match &el.transform[0] {
            types::TransformOp::Rotate(rad) => {
                assert!(
                    (rad - std::f32::consts::FRAC_PI_2).abs() < 0.01,
                    "Expected ~PI/2, got {}",
                    rad
                );
            }
            other => panic!("Expected Rotate, got {:?}", other),
        }
    }

    /// Verify scale is collected.
    #[test]
    fn test_transform_scale_collection() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="transform:scale(2, 0.5)">S</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 1);
        assert_eq!(el.transform[0], types::TransformOp::Scale(2.0, 0.5));
    }

    /// Verify skewX is collected.
    #[test]
    fn test_transform_skew_collection() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="transform:skewX(45deg)">K</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 1);
        match &el.transform[0] {
            types::TransformOp::Skew(ax, ay) => {
                assert!((ax - std::f32::consts::FRAC_PI_4).abs() < 0.01);
                assert!(ay.abs() < 0.01);
            }
            other => panic!("Expected Skew, got {:?}", other),
        }
    }

    /// Verify combined transform preserves all ops in order.
    #[test]
    fn test_transform_combined_collection() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div style="transform:translate(10px, 10px) rotate(30deg) scale(0.8)">C</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 3, "Should have 3 ops");
        assert!(matches!(el.transform[0], types::TransformOp::Translate(..)));
        assert!(matches!(el.transform[1], types::TransformOp::Rotate(..)));
        assert!(matches!(el.transform[2], types::TransformOp::Scale(..)));
    }

    /// Verify CSS matrix() is collected as TransformOp::Matrix.
    #[test]
    fn test_transform_matrix_collection() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="transform:matrix(0.866, 0.5, -0.5, 0.866, 10, 20)">M</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 1);
        match &el.transform[0] {
            types::TransformOp::Matrix(m) => {
                assert!((m[0] - 0.866).abs() < 0.01);
                assert!((m[1] - 0.5).abs() < 0.01);
                assert!((m[2] + 0.5).abs() < 0.01);
                assert!((m[3] - 0.866).abs() < 0.01);
                assert!((m[4] - 10.0).abs() < 0.01);
                assert!((m[5] - 20.0).abs() < 0.01);
            }
            other => panic!("Expected Matrix, got {:?}", other),
        }
    }

    /// Verify no transform yields empty vec.
    #[test]
    fn test_transform_none() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:50px">no transform</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        fn check_empty(el: &style::StyledElement) {
            assert!(
                el.transform.is_empty(),
                "tag={} should have no transform",
                el.tag
            );
            for child in &el.children {
                if let style::StyledNode::Element(c) = child {
                    check_empty(c);
                }
            }
        }
        check_empty(&root);
    }

    // ── Percentage / px regression tests ──

    /// translateX(50%) must preserve the percentage, not collapse to 0.
    #[test]
    fn test_transform_translate_percent() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:200px;height:100px;transform:translateX(50%)">T</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("translateX(50%) should produce a transform");
        assert_eq!(el.transform.len(), 1);
        match &el.transform[0] {
            types::TransformOp::Translate(tx, ty) => {
                assert_eq!(
                    *tx,
                    types::LengthPercentage::Percent(0.5),
                    "tx should be 50%"
                );
                assert_eq!(*ty, types::LengthPercentage::Px(0.0), "ty should be 0px");
            }
            other => panic!("Expected Translate, got {:?}", other),
        }
    }

    /// translate(10px, 50%) must preserve mixed px/% operands.
    #[test]
    fn test_transform_translate_mixed() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div style="width:200px;height:100px;transform:translate(10px, 50%)">T</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find element with transform");
        assert_eq!(el.transform.len(), 1);
        match &el.transform[0] {
            types::TransformOp::Translate(tx, ty) => {
                assert_eq!(*tx, types::LengthPercentage::Px(10.0));
                assert_eq!(*ty, types::LengthPercentage::Percent(0.5));
            }
            other => panic!("Expected Translate, got {:?}", other),
        }
    }

    /// transform-origin with absolute px values must be preserved.
    #[test]
    fn test_transform_origin_px() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:200px;height:100px;transform:rotate(45deg);transform-origin:10px 20px">T</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find transformed element");
        assert_eq!(el.transform_origin.x, types::LengthPercentage::Px(10.0));
        assert_eq!(el.transform_origin.y, types::LengthPercentage::Px(20.0));
    }

    /// transform-origin: left top → 0% 0%.
    #[test]
    fn test_transform_origin_keywords() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="transform:rotate(10deg);transform-origin:left top">T</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_with_transform(&root).expect("Should find transformed element");
        assert_eq!(el.transform_origin.x, types::LengthPercentage::Percent(0.0));
        assert_eq!(el.transform_origin.y, types::LengthPercentage::Percent(0.0));
    }

    // ── Render tests ──

    #[test]
    fn test_render_transform_2d_fixture() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = include_str!("../../../../fixtures/test-html/L0/transform-2d.html");
        let pic = render(html, 800.0, 600.0, &fonts);
        assert!(pic.is_ok(), "transform-2d.html should render without error");
    }

    #[test]
    fn test_render_transform_with_origin() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = r#"<div style="width:100px;height:100px;background:#000;transform:rotate(45deg);transform-origin:0% 0%">origin</div>"#;
        let pic = render(html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_transform_origin_fixture() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = include_str!("../../../../fixtures/test-html/L0/transform-origin.html");
        let pic = render(html, 800.0, 600.0, &fonts);
        assert!(
            pic.is_ok(),
            "transform-origin.html should render without error"
        );
    }

    #[test]
    fn test_render_transform_nested_fixture() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = include_str!("../../../../fixtures/test-html/L0/transform-nested.html");
        let pic = render(html, 800.0, 600.0, &fonts);
        assert!(
            pic.is_ok(),
            "transform-nested.html should render without error"
        );
    }

    /// translateX(50%) on a 200px box must render (not silently ignored).
    #[test]
    fn test_render_transform_translate_percent() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = r#"<div style="width:200px;height:50px;background:#000;transform:translateX(50%)">T</div>"#;
        let pic = render(html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    /// transform-origin: 10px 20px must render correctly.
    #[test]
    fn test_render_transform_origin_px() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = r#"<div style="width:100px;height:100px;background:#000;transform:rotate(45deg);transform-origin:10px 20px">T</div>"#;
        let pic = render(html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    /// Helper: find first element with a non-empty transform list.
    fn find_with_transform(el: &style::StyledElement) -> Option<&style::StyledElement> {
        if !el.transform.is_empty() {
            return Some(el);
        }
        for child in &el.children {
            if let style::StyledNode::Element(c) = child {
                if let Some(found) = find_with_transform(c) {
                    return Some(found);
                }
            }
        }
        None
    }
}
