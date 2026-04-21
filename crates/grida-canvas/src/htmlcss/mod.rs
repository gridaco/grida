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

// ─── Image provider trait ───────────────────────────────────────────

/// Host-provided image resolver for the htmlcss rendering pipeline.
///
/// Inspired by Chromium's `ImageResourceContent` + `ImageResourceObserver`
/// pattern. The htmlcss module asks for an image by URL; the host decides
/// how and when to provide it. The trait is intentionally minimal —
/// no lifecycle management, no caching, no fetching. Those are host concerns.
///
/// # Use Cases
///
/// - **CLI (pre-resolved):** Host loads all images before calling `render()`.
///   A `HashMap<String, Image>` wrapper implements this trivially.
/// - **WASM (async drain):** Host renders with missing images → inspects
///   placeholder output → fetches missing URLs → re-renders.
/// - **Native app:** Any `ResourceFetcher` implementation the host provides.
pub trait ImageProvider {
    /// Resolve a URL to a decoded Skia image.
    ///
    /// Returns `None` if the image is not (yet) available. Implementations
    /// may record the miss for later fetching (drain-missing pattern).
    fn get(&self, url: &str) -> Option<&skia_safe::Image>;

    /// Get intrinsic dimensions without requiring the full decoded image.
    ///
    /// Used during layout for replaced elements when decode may be deferred.
    /// Default implementation delegates to `get()` and reads dimensions.
    fn get_size(&self, url: &str) -> Option<(u32, u32)> {
        self.get(url)
            .map(|img| (img.width() as u32, img.height() as u32))
    }
}

/// Null image provider — always returns `None`.
///
/// Zero-cost default for image-free rendering. Use when the HTML content
/// contains no images, or when images are intentionally not provided.
pub struct NoImages;

impl ImageProvider for NoImages {
    fn get(&self, _url: &str) -> Option<&skia_safe::Image> {
        None
    }
}

/// Pre-loaded image provider backed by a `HashMap`.
///
/// The "pre-resolved" flow: load all images before calling `render()`.
/// Suitable for CLI tools, export pipelines, and test harnesses.
///
/// # Usage
///
/// ```ignore
/// let mut images = PreloadedImages::new();
/// images.insert("https://example.com/photo.jpg", decoded_skia_image);
/// let picture = htmlcss::render(html, width, height, &fonts, &images)?;
/// ```
pub struct PreloadedImages {
    images: std::collections::HashMap<String, skia_safe::Image>,
}

impl PreloadedImages {
    pub fn new() -> Self {
        Self {
            images: std::collections::HashMap::new(),
        }
    }

    /// Insert a decoded Skia image keyed by its URL.
    pub fn insert(&mut self, url: impl Into<String>, image: skia_safe::Image) {
        self.images.insert(url.into(), image);
    }

    /// Number of loaded images.
    pub fn len(&self) -> usize {
        self.images.len()
    }

    /// Whether no images are loaded.
    pub fn is_empty(&self) -> bool {
        self.images.is_empty()
    }

    /// Decode image bytes (PNG, JPEG, WebP, GIF) into a Skia `Image` and insert.
    ///
    /// Returns `Some((width, height))` on success, `None` if decode fails.
    pub fn insert_bytes(&mut self, url: impl Into<String>, bytes: &[u8]) -> Option<(u32, u32)> {
        let data = skia_safe::Data::new_copy(bytes);
        let image = skia_safe::Image::from_encoded(data)?;
        let w = image.width() as u32;
        let h = image.height() as u32;
        self.images.insert(url.into(), image);
        Some((w, h))
    }
}

impl Default for PreloadedImages {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageProvider for PreloadedImages {
    fn get(&self, url: &str) -> Option<&skia_safe::Image> {
        self.images.get(url)
    }
}

/// Render HTML+CSS to a Skia Picture.
///
/// Images referenced by `<img src>` or `background-image: url()` are
/// resolved via the `images` provider at layout and paint time. Missing
/// images render as placeholders — the pipeline never blocks on loads.
pub fn render(
    html: &str,
    width: f32,
    _height: f32,
    fonts: &FontRepository,
    images: &dyn ImageProvider,
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

    let layout_root = layout::compute_layout(&root, width, fonts, images);
    let content_height = layout_root.height;

    Ok(paint::paint_to_picture(
        &layout_root,
        width,
        content_height,
        fonts,
        images,
    ))
}

/// Measure the content height of HTML at the given width.
///
/// Runs style resolution and Taffy layout but does not create a Skia Picture.
pub fn measure_content_height(
    html: &str,
    width: f32,
    fonts: &FontRepository,
    images: &dyn ImageProvider,
) -> Result<f32, String> {
    let root = collect::collect_styled_tree(html)?;
    let Some(root) = root else {
        return Ok(0.0);
    };
    Ok(layout::compute_content_height(&root, width, fonts, images))
}

/// Collect all image URLs referenced in HTML content.
///
/// Runs the Stylo cascade to resolve CSS `background-image: url()` values,
/// then walks the styled tree to extract all image URLs from:
/// - `<img src="...">` elements
/// - `background-image: url("...")` CSS properties
///
/// Use this to pre-load images before calling [`render()`] (CLI / pre-resolved flow).
///
/// # Example
///
/// ```ignore
/// let urls = htmlcss::collect_image_urls(html)?;
/// let images = load_all(urls).await; // your loader
/// let picture = htmlcss::render(html, width, height, &fonts, &images)?;
/// ```
pub fn collect_image_urls(html: &str) -> Result<Vec<String>, String> {
    let root = collect::collect_styled_tree(html)?;
    let Some(root) = root else {
        return Ok(Vec::new());
    };
    let mut urls = Vec::new();
    collect_urls_from_element(&root, &mut urls);
    urls.sort();
    urls.dedup();
    Ok(urls)
}

fn collect_urls_from_element(el: &style::StyledElement, urls: &mut Vec<String>) {
    // Replaced content (<img src>)
    if let Some(ref replaced) = el.replaced {
        if !replaced.src.is_empty() {
            urls.push(replaced.src.clone());
        }
    }

    // Background image URLs
    for layer in &el.background {
        if let style::BackgroundLayer::Image(img) = layer {
            if let style::StyleImage::Url(url) = &img.source {
                if !url.is_empty() {
                    urls.push(url.clone());
                }
            }
        }
    }

    // Border image source URL
    if let Some(ref bi) = el.border_image {
        if let style::StyleImage::Url(url) = &bi.source {
            if !url.is_empty() {
                urls.push(url.clone());
            }
        }
    }

    // Recurse into children
    for child in &el.children {
        if let style::StyledNode::Element(child_el) = child {
            collect_urls_from_element(child_el, urls);
        }
    }
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

    /// Test helper: render with no image provider.
    fn test_render(
        html: &str,
        width: f32,
        height: f32,
        fonts: &FontRepository,
    ) -> Result<skia_safe::Picture, String> {
        render(html, width, height, fonts, &NoImages)
    }

    /// Test helper: measure with no image provider.
    fn test_measure(html: &str, width: f32, fonts: &FontRepository) -> Result<f32, String> {
        measure_content_height(html, width, fonts, &NoImages)
    }

    #[test]
    fn test_render_empty() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render("", 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_heading() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render("<h1>Hello</h1>", 400.0, 300.0, &fonts).unwrap();
        assert!(pic.cull_rect().width() > 0.0);
    }

    #[test]
    fn test_render_with_style_block() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let layout_root = layout::compute_layout(&root, 400.0, &fonts, &NoImages);
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let pic = test_render(
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
        let h = test_measure("<p>Hello</p>", 400.0, &fonts).unwrap();
        assert!(h > 0.0, "Content height should be positive, got {h}");
    }

    #[test]
    fn test_head_hidden() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
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
        let pic = test_render(&html, 400.0, 300.0, &fonts);
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
        let pic = test_render(&html, 600.0, 300.0, &fonts);
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
        let pic = test_render(&html, 600.0, 300.0, &fonts);
        assert!(pic.is_ok(), "Markdown table should render");
    }

    #[test]
    fn test_markdown_empty() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = markdown_to_styled_html("");
        let pic = test_render(&html, 400.0, 300.0, &fonts);
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

    /// Verify `top`/`right`/`bottom`/`left` are extracted from Stylo.
    /// Regression test for a stub that previously returned `auto` for all sides.
    #[test]
    fn test_inset_extraction_px() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div style="position:absolute;top:100px;left:50px;right:10px;bottom:20px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        fn find_positioned<'a>(el: &'a style::StyledElement) -> Option<&'a style::StyledElement> {
            if el.inset.top != types::CssLength::Auto || el.inset.left != types::CssLength::Auto {
                return Some(el);
            }
            for child in &el.children {
                if let style::StyledNode::Element(c) = child {
                    if let Some(f) = find_positioned(c) {
                        return Some(f);
                    }
                }
            }
            None
        }
        let el = find_positioned(&root).expect("positioned element should exist");
        assert_eq!(el.inset.top, types::CssLength::Px(100.0));
        assert_eq!(el.inset.left, types::CssLength::Px(50.0));
        assert_eq!(el.inset.right, types::CssLength::Px(10.0));
        assert_eq!(el.inset.bottom, types::CssLength::Px(20.0));
    }

    /// Percentage insets survive the computed-values path.
    #[test]
    fn test_inset_extraction_percent() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="position:absolute;top:25%;left:50%">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        fn find_positioned<'a>(el: &'a style::StyledElement) -> Option<&'a style::StyledElement> {
            if el.inset.top != types::CssLength::Auto || el.inset.left != types::CssLength::Auto {
                return Some(el);
            }
            for child in &el.children {
                if let style::StyledNode::Element(c) = child {
                    if let Some(f) = find_positioned(c) {
                        return Some(f);
                    }
                }
            }
            None
        }
        let el = find_positioned(&root).expect("positioned element should exist");
        assert_eq!(el.inset.top, types::CssLength::Percent(0.25));
        assert_eq!(el.inset.left, types::CssLength::Percent(0.5));
    }

    // ── Background geometry extraction ───────────────────────────────

    #[test]
    fn test_bg_size_default() {
        let _guard = crate::stylo_test::lock();
        let img = find_bg_image(
            &collect::collect_styled_tree(
                r#"<div style="background:linear-gradient(red,blue)">x</div>"#,
            )
            .unwrap()
            .unwrap(),
        )
        .expect("bg image")
        .clone();
        assert_eq!(img.size, style::BackgroundSize::Auto);
        assert_eq!(img.position, style::BackgroundPosition::default());
        assert_eq!(img.repeat.x, style::BackgroundRepeatKeyword::Repeat);
        assert_eq!(img.clip, style::BackgroundBox::BorderBox);
        assert_eq!(img.origin, style::BackgroundBox::PaddingBox);
    }

    #[test]
    fn test_bg_size_cover_contain() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div style="background:linear-gradient(red,blue);background-size:cover">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(img.size, style::BackgroundSize::Cover);

        let html =
            r#"<div style="background:linear-gradient(red,blue);background-size:contain">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(img.size, style::BackgroundSize::Contain);
    }

    #[test]
    fn test_bg_size_explicit() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="background:linear-gradient(red,blue);background-size:80px 40px">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(
            img.size,
            style::BackgroundSize::Explicit {
                width: types::CssLength::Px(80.0),
                height: types::CssLength::Px(40.0),
            }
        );

        let html =
            r#"<div style="background:linear-gradient(red,blue);background-size:50% auto">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(
            img.size,
            style::BackgroundSize::Explicit {
                width: types::CssLength::Percent(0.5),
                height: types::CssLength::Auto,
            }
        );
    }

    #[test]
    fn test_bg_position() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="background:linear-gradient(red,blue);background-position:center">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(img.position.x, types::CssLength::Percent(0.5));
        assert_eq!(img.position.y, types::CssLength::Percent(0.5));

        let html = r#"<div style="background:linear-gradient(red,blue);background-position:20px 30px">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(img.position.x, types::CssLength::Px(20.0));
        assert_eq!(img.position.y, types::CssLength::Px(30.0));

        let html = r#"<div style="background:linear-gradient(red,blue);background-position:100% 0">x</div>"#;
        let img = find_bg_image(&collect::collect_styled_tree(html).unwrap().unwrap())
            .unwrap()
            .clone();
        assert_eq!(img.position.x, types::CssLength::Percent(1.0));
        assert_eq!(img.position.y, types::CssLength::Px(0.0));
    }

    #[test]
    fn test_bg_repeat() {
        let _guard = crate::stylo_test::lock();
        use self::style::BackgroundRepeatKeyword::*;

        let cases: &[(&str, _, _)] = &[
            ("repeat", Repeat, Repeat),
            ("no-repeat", NoRepeat, NoRepeat),
            ("repeat-x", Repeat, NoRepeat),
            ("repeat-y", NoRepeat, Repeat),
            ("space", Space, Space),
            ("round", Round, Round),
            ("repeat no-repeat", Repeat, NoRepeat),
        ];
        for (css, ex_x, ex_y) in cases {
            let html = format!(
                r#"<div style="background:linear-gradient(red,blue);background-repeat:{css}">x</div>"#
            );
            let img = find_bg_image(&collect::collect_styled_tree(&html).unwrap().unwrap())
                .unwrap()
                .clone();
            assert_eq!(img.repeat.x, *ex_x, "case: {css} x");
            assert_eq!(img.repeat.y, *ex_y, "case: {css} y");
        }
    }

    #[test]
    fn test_bg_clip_origin() {
        let _guard = crate::stylo_test::lock();
        use self::style::BackgroundBox::*;

        let cases: &[(&str, _, _)] = &[
            (
                "background-clip:padding-box;background-origin:content-box",
                PaddingBox,
                ContentBox,
            ),
            (
                "background-clip:content-box;background-origin:border-box",
                ContentBox,
                BorderBox,
            ),
            (
                "background-clip:border-box;background-origin:padding-box",
                BorderBox,
                PaddingBox,
            ),
        ];
        for (css, ex_clip, ex_origin) in cases {
            let html =
                format!(r#"<div style="background:linear-gradient(red,blue);{css}">x</div>"#);
            let img = find_bg_image(&collect::collect_styled_tree(&html).unwrap().unwrap())
                .unwrap()
                .clone();
            assert_eq!(img.clip, *ex_clip, "case: {css}");
            assert_eq!(img.origin, *ex_origin, "case: {css}");
        }
    }

    #[test]
    fn test_bg_per_layer_cycling() {
        let _guard = crate::stylo_test::lock();
        // Two gradient layers; single repeat/clip/origin values must cycle.
        let html = r#"<div style="
            background-image:linear-gradient(red,red),linear-gradient(blue,blue);
            background-size:20px 20px,40px 40px;
            background-repeat:no-repeat;
            background-clip:padding-box;
        ">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        fn find_el<'a>(el: &'a style::StyledElement) -> Option<&'a style::StyledElement> {
            if !el.background.is_empty() && el.tag == "div" {
                return Some(el);
            }
            for child in &el.children {
                if let style::StyledNode::Element(c) = child {
                    if let Some(f) = find_el(c) {
                        return Some(f);
                    }
                }
            }
            None
        }
        let el = find_el(&root).unwrap();
        let imgs: Vec<&style::BackgroundImage> = el
            .background
            .iter()
            .filter_map(|l| match l {
                style::BackgroundLayer::Image(i) => Some(i),
                _ => None,
            })
            .collect();
        assert_eq!(imgs.len(), 2, "should have 2 image layers");
        assert_eq!(
            imgs[0].size,
            style::BackgroundSize::Explicit {
                width: types::CssLength::Px(20.0),
                height: types::CssLength::Px(20.0),
            }
        );
        assert_eq!(
            imgs[1].size,
            style::BackgroundSize::Explicit {
                width: types::CssLength::Px(40.0),
                height: types::CssLength::Px(40.0),
            }
        );
        assert_eq!(imgs[0].repeat.x, style::BackgroundRepeatKeyword::NoRepeat);
        assert_eq!(imgs[1].repeat.x, style::BackgroundRepeatKeyword::NoRepeat);
        assert_eq!(imgs[0].clip, style::BackgroundBox::PaddingBox);
        assert_eq!(imgs[1].clip, style::BackgroundBox::PaddingBox);
    }

    // ── Text decoration + text-shadow extraction ─────────────────────

    fn find_el_with<'a, F: Fn(&style::StyledElement) -> bool>(
        el: &'a style::StyledElement,
        pred: &F,
    ) -> Option<&'a style::StyledElement> {
        if pred(el) {
            return Some(el);
        }
        for child in &el.children {
            if let style::StyledNode::Element(c) = child {
                if let Some(f) = find_el_with(c, pred) {
                    return Some(f);
                }
            }
        }
        None
    }

    #[test]
    fn test_text_decoration_color_absolute() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p style="text-decoration:underline #ff0000">deco</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").expect("p element");
        assert!(el.font.decoration_underline);
        let c = el.font.decoration_color.expect("color resolved");
        assert_eq!((c.r, c.g, c.b), (255, 0, 0));
    }

    #[test]
    fn test_text_decoration_color_currentcolor() {
        let _guard = crate::stylo_test::lock();
        // No explicit decoration-color → initial value is `currentcolor` which
        // Stylo does not resolve to absolute; extraction should yield None.
        let html = r#"<p style="text-decoration:underline">deco</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").expect("p element");
        assert!(el.font.decoration_underline);
        assert!(el.font.decoration_color.is_none(), "currentcolor → None");
    }

    #[test]
    fn test_text_decoration_style_variants() {
        let _guard = crate::stylo_test::lock();
        use crate::cg::prelude::TextDecorationStyle as TDS;
        let cases: &[(&str, TDS)] = &[
            ("solid", TDS::Solid),
            ("double", TDS::Double),
            ("dotted", TDS::Dotted),
            ("dashed", TDS::Dashed),
            ("wavy", TDS::Wavy),
        ];
        for (css, expected) in cases {
            let html = format!(r#"<p style="text-decoration:underline {css}">x</p>"#);
            let root = collect::collect_styled_tree(&html).unwrap().unwrap();
            let el = find_el_with(&root, &|e| e.tag == "p").expect("p");
            assert_eq!(el.font.decoration_style, *expected, "case: {css}");
        }
    }

    #[test]
    fn test_text_shadow_single() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p style="text-shadow: 4px 6px 8px #ff0000">x</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").expect("p");
        assert_eq!(el.font.text_shadow.len(), 1);
        let s = el.font.text_shadow[0];
        assert_eq!(s.offset_x, 4.0);
        assert_eq!(s.offset_y, 6.0);
        assert_eq!(s.blur, 8.0);
        assert_eq!((s.color.r, s.color.g, s.color.b), (255, 0, 0));
    }

    #[test]
    fn test_text_shadow_stacked() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p style="text-shadow: 1px 2px 0 red, 3px 4px 5px blue">x</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").expect("p");
        assert_eq!(el.font.text_shadow.len(), 2);
        assert_eq!(el.font.text_shadow[0].offset_x, 1.0);
        assert_eq!(el.font.text_shadow[0].offset_y, 2.0);
        assert_eq!(el.font.text_shadow[0].blur, 0.0);
        assert_eq!(
            (
                el.font.text_shadow[0].color.r,
                el.font.text_shadow[0].color.g,
                el.font.text_shadow[0].color.b
            ),
            (255, 0, 0)
        );
        assert_eq!(el.font.text_shadow[1].offset_x, 3.0);
        assert_eq!(el.font.text_shadow[1].offset_y, 4.0);
        assert_eq!(el.font.text_shadow[1].blur, 5.0);
        assert_eq!(
            (
                el.font.text_shadow[1].color.r,
                el.font.text_shadow[1].color.g,
                el.font.text_shadow[1].color.b
            ),
            (0, 0, 255)
        );
    }

    #[test]
    fn test_text_shadow_empty_by_default() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p>x</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").expect("p");
        assert!(el.font.text_shadow.is_empty());
    }

    // ── Individual transform properties ──────────────────────────────

    #[test]
    fn test_transform_translate_longhand() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="translate:40px 20px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.transform.len(), 1);
        match el.transform[0] {
            types::TransformOp::Translate(tx, ty) => {
                assert_eq!(tx, types::LengthPercentage::Px(40.0));
                assert_eq!(ty, types::LengthPercentage::Px(20.0));
            }
            ref other => panic!("expected Translate, got {other:?}"),
        }
    }

    #[test]
    fn test_transform_rotate_longhand() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="rotate:90deg">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.transform.len(), 1);
        match el.transform[0] {
            types::TransformOp::Rotate(rad) => {
                assert!((rad - std::f32::consts::FRAC_PI_2).abs() < 1e-4);
            }
            ref other => panic!("expected Rotate, got {other:?}"),
        }
    }

    #[test]
    fn test_transform_scale_longhand() {
        let _guard = crate::stylo_test::lock();
        // Uniform scale.
        let html = r#"<div style="scale:1.5">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.transform.len(), 1);
        match el.transform[0] {
            types::TransformOp::Scale(sx, sy) => {
                assert_eq!(sx, 1.5);
                assert_eq!(sy, 1.5);
            }
            ref other => panic!("expected Scale, got {other:?}"),
        }

        // Non-uniform.
        let html = r#"<div style="scale:2 0.5">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        match el.transform[0] {
            types::TransformOp::Scale(sx, sy) => {
                assert_eq!(sx, 2.0);
                assert_eq!(sy, 0.5);
            }
            ref other => panic!("expected Scale, got {other:?}"),
        }
    }

    #[test]
    fn test_transform_individual_order() {
        let _guard = crate::stylo_test::lock();
        // Per spec, ordering is translate → rotate → scale → transform.
        let html = r#"<div style="
            translate:10px 0;
            rotate:45deg;
            scale:2;
            transform:skew(10deg)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.transform.len(), 4);
        assert!(matches!(
            el.transform[0],
            types::TransformOp::Translate(_, _)
        ));
        assert!(matches!(el.transform[1], types::TransformOp::Rotate(_)));
        assert!(matches!(el.transform[2], types::TransformOp::Scale(_, _)));
        assert!(matches!(el.transform[3], types::TransformOp::Skew(_, _)));
    }

    #[test]
    fn test_transform_individual_none_defaults() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div>x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert!(el.transform.is_empty(), "no transform props → empty");
    }

    // ── z-index ──────────────────────────────────────────────────────

    #[test]
    fn test_z_index_auto() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div>x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert!(el.z_index.is_none(), "auto → None");
    }

    #[test]
    fn test_z_index_integer() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="position:absolute;z-index:42">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.z_index, Some(42));

        let html = r#"<div style="position:absolute;z-index:-5">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.z_index, Some(-5));
    }

    /// Probe: two absolutely-positioned siblings overlap. Source order paints
    /// red last, but blue has higher z-index, so blue wins at the overlap.
    #[test]
    fn test_z_index_paint_order_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="position:relative;width:300px;height:300px;background:#ffffff">
  <div style="position:absolute;top:40px;left:40px;width:120px;height:120px;background:#0000ff;z-index:2"></div>
  <div style="position:absolute;top:100px;left:100px;width:120px;height:120px;background:#ff0000;z-index:1"></div>
</div>"#;
        let px = rasterize_rgba(html, 300, 300);
        let red_only = pixel_at(&px, 200, 200, 300);
        assert_eq!(
            [red_only[0], red_only[1], red_only[2]],
            [255, 0, 0],
            "red-only area"
        );
        let blue_only = pixel_at(&px, 50, 50, 300);
        assert_eq!(
            [blue_only[0], blue_only[1], blue_only[2]],
            [0, 0, 255],
            "blue-only area"
        );
        let overlap = pixel_at(&px, 150, 150, 300);
        assert_eq!(
            [overlap[0], overlap[1], overlap[2]],
            [0, 0, 255],
            "overlap wins by z-index, not source order"
        );
    }

    // ── currentcolor in gradient stops ───────────────────────────────

    /// `currentcolor` in a gradient stop resolves to the element's
    /// computed `color`, not transparent.
    #[test]
    fn test_gradient_stop_currentcolor_resolves() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="color:#ff0000;background:linear-gradient(90deg,currentcolor,#ffffff)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let img = find_bg_image(&root).expect("bg image").clone();
        match img.source {
            style::StyleImage::LinearGradient(g) => {
                assert_eq!(g.stops.len(), 2);
                assert_eq!(
                    (g.stops[0].color.r, g.stops[0].color.g, g.stops[0].color.b),
                    (255, 0, 0),
                    "currentcolor should resolve to element's red"
                );
                // White end stop.
                assert_eq!(
                    (g.stops[1].color.r, g.stops[1].color.g, g.stops[1].color.b),
                    (255, 255, 255)
                );
            }
            other => panic!("expected LinearGradient, got {other:?}"),
        }
    }

    /// Inherited `color` propagates — child with no explicit color inherits
    /// parent's color, and `currentcolor` in its gradient resolves to that.
    #[test]
    fn test_gradient_stop_currentcolor_inherited() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="color:#0000ff"><div style="background:radial-gradient(circle,currentcolor,#ffffff)">x</div></div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let img = find_bg_image(&root).expect("bg image").clone();
        match img.source {
            style::StyleImage::RadialGradient(g) => {
                assert_eq!(
                    (g.stops[0].color.r, g.stops[0].color.g, g.stops[0].color.b),
                    (0, 0, 255),
                    "inherited color should drive currentcolor"
                );
            }
            other => panic!("expected RadialGradient, got {other:?}"),
        }
    }

    /// `currentcolor` works in conic gradients too.
    #[test]
    fn test_gradient_stop_currentcolor_conic() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="color:#00aa00;background:conic-gradient(currentcolor,#ffffff,currentcolor)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let img = find_bg_image(&root).expect("bg image").clone();
        match img.source {
            style::StyleImage::ConicGradient(g) => {
                assert_eq!(
                    (g.stops[0].color.r, g.stops[0].color.g, g.stops[0].color.b),
                    (0, 170, 0),
                    "first stop is currentcolor"
                );
                assert_eq!(
                    (g.stops[2].color.r, g.stops[2].color.g, g.stops[2].color.b),
                    (0, 170, 0),
                    "last stop is currentcolor"
                );
            }
            other => panic!("expected ConicGradient, got {other:?}"),
        }
    }

    // ── Border style variants (double/groove/ridge/inset/outset) ─────

    /// Probe: `double` border paints two parallel bands with a gap between.
    /// Top band (outer) is colored, middle (gap) is transparent/bg, inner
    /// band is colored again.
    #[test]
    fn test_border_double_probe() {
        let _guard = crate::stylo_test::lock();
        // 9px double border — 3px outer, 3px gap, 3px inner.
        let html = r#"<div style="width:40px;height:40px;background:#ffffff;border:9px double #ff0000;box-sizing:border-box"></div>"#;
        let px = rasterize_rgba(html, 40, 40);
        // Center of outer stroke (y=1) should be red.
        let outer = pixel_at(&px, 20, 1, 40);
        assert_eq!(
            [outer[0], outer[1], outer[2]],
            [255, 0, 0],
            "outer band red"
        );
        // Center of gap (y=4) should be background white.
        let gap = pixel_at(&px, 20, 4, 40);
        assert_eq!([gap[0], gap[1], gap[2]], [255, 255, 255], "gap white");
        // Center of inner stroke (y=7) should be red.
        let inner = pixel_at(&px, 20, 7, 40);
        assert_eq!(
            [inner[0], inner[1], inner[2]],
            [255, 0, 0],
            "inner band red"
        );
    }

    /// Probe: `outline: 9px double` — two concentric stroked rings with a
    /// 3px gap. Scan the top strip to find: gap (white) → outer (red) →
    /// background (white) → inner (red) → box (white). We check the
    /// outer, gap, and inner bands.
    #[test]
    fn test_outline_double_probe() {
        let _guard = crate::stylo_test::lock();
        // Box is 40×40, placed at margin:12 so outline (9px) has room.
        // Outline lives OUTSIDE the element; at (12-9, …) the outer band
        // starts. Outline thirds are 3px each: outer=[-9,-6], gap=[-6,-3],
        // inner=[-3,0] from the box edge.
        let html = r#"<div style="width:40px;height:40px;margin:12px;background:#ffffff;outline:9px double #ff0000"></div>"#;
        let px = rasterize_rgba(html, 80, 80);
        // Box top edge is at y=12. Sample at column x=32 (in the box's horizontal range).
        // Outer band y ∈ [3, 6]: red. Sample at y=4.
        let outer = pixel_at(&px, 32, 4, 80);
        assert_eq!(
            [outer[0], outer[1], outer[2]],
            [255, 0, 0],
            "outer ring red"
        );
        // Gap y ∈ [6, 9]: white. Sample y=7.
        let gap = pixel_at(&px, 32, 7, 80);
        assert_eq!([gap[0], gap[1], gap[2]], [255, 255, 255], "gap white");
        // Inner band y ∈ [9, 12]: red. Sample y=10.
        let inner = pixel_at(&px, 32, 10, 80);
        assert_eq!(
            [inner[0], inner[1], inner[2]],
            [255, 0, 0],
            "inner ring red"
        );
    }

    /// Probe: `inset` on a gray color — top side darker, bottom side
    /// lighter than the base color.
    #[test]
    fn test_border_inset_top_darker_bottom_lighter() {
        let _guard = crate::stylo_test::lock();
        // 10px inset border, #808080 base.
        let html = r#"<div style="width:60px;height:60px;background:#ffffff;border:10px inset #808080;box-sizing:border-box"></div>"#;
        let px = rasterize_rgba(html, 60, 60);
        let top = pixel_at(&px, 30, 3, 60);
        let bottom = pixel_at(&px, 30, 56, 60);
        // Top should be darker: 0x80/2 = 0x40.
        assert!(top[0] < 100, "top darker than 128, got {}", top[0]);
        // Bottom should be lighter: (0x80 + 0xff)/2 ≈ 0xbf.
        assert!(
            bottom[0] > 150,
            "bottom lighter than 128, got {}",
            bottom[0]
        );
    }

    /// `outset` is the inverse of `inset` — top/left lighter, bottom/right
    /// darker.
    #[test]
    fn test_border_outset_top_lighter_bottom_darker() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:60px;height:60px;background:#ffffff;border:10px outset #808080;box-sizing:border-box"></div>"#;
        let px = rasterize_rgba(html, 60, 60);
        let top = pixel_at(&px, 30, 3, 60);
        let bottom = pixel_at(&px, 30, 56, 60);
        assert!(top[0] > 150, "top lighter than 128, got {}", top[0]);
        assert!(bottom[0] < 100, "bottom darker than 128, got {}", bottom[0]);
    }

    // ── CSS logical properties (LTR horizontal-tb) ───────────────────
    //
    // In the default writing mode, Stylo's cascade resolves logical
    // longhands onto the physical slots we already extract — no code on
    // our side has to translate anything. These tests pin that behavior
    // so a future Stylo upgrade or a local refactor doesn't silently
    // drop the mapping.

    #[test]
    fn test_logical_inline_block_size() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="inline-size:140px;block-size:80px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.width, types::CssLength::Px(140.0));
        assert_eq!(el.height, types::CssLength::Px(80.0));
    }

    #[test]
    fn test_logical_min_max_size() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="min-inline-size:100px;max-block-size:60px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.min_width, types::CssLength::Px(100.0));
        assert_eq!(el.max_height, types::CssLength::Px(60.0));
    }

    #[test]
    fn test_logical_inset() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="position:absolute;inset-block-start:20px;inset-inline-start:40px;inset-block-end:10px;inset-inline-end:5px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.inset.top, types::CssLength::Px(20.0));
        assert_eq!(el.inset.left, types::CssLength::Px(40.0));
        assert_eq!(el.inset.bottom, types::CssLength::Px(10.0));
        assert_eq!(el.inset.right, types::CssLength::Px(5.0));
    }

    #[test]
    fn test_logical_padding() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="padding-inline-start:20px;padding-block-start:10px;padding-inline-end:4px;padding-block-end:6px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.padding.left, 20.0);
        assert_eq!(el.padding.top, 10.0);
        assert_eq!(el.padding.right, 4.0);
        assert_eq!(el.padding.bottom, 6.0);
    }

    #[test]
    fn test_logical_border() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="border-inline-start:6px solid #ff0000;border-block-end:4px solid #0000ff">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.border.left.width, 6.0);
        assert_eq!(
            (
                el.border.left.color.r,
                el.border.left.color.g,
                el.border.left.color.b
            ),
            (255, 0, 0)
        );
        assert_eq!(el.border.bottom.width, 4.0);
        assert_eq!(
            (
                el.border.bottom.color.r,
                el.border.bottom.color.g,
                el.border.bottom.color.b
            ),
            (0, 0, 255)
        );
    }

    // ── text-indent ──────────────────────────────────────────────────

    #[test]
    fn test_text_indent_px_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p style="text-indent:40px">x</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").unwrap();
        assert_eq!(el.font.text_indent, types::CssLength::Px(40.0));
    }

    #[test]
    fn test_text_indent_percent_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p style="text-indent:25%">x</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").unwrap();
        assert_eq!(el.font.text_indent, types::CssLength::Percent(0.25));
    }

    /// Inherited through the cascade — child inherits parent's text-indent.
    #[test]
    fn test_text_indent_inherited() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="text-indent:30px"><p>x</p></div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "p").unwrap();
        assert_eq!(el.font.text_indent, types::CssLength::Px(30.0));
    }

    /// The InlineGroup constructed during `flush_inline_group` carries
    /// the containing block's text-indent so the paragraph builder has
    /// access to it at paint/measure time.
    #[test]
    fn test_text_indent_propagates_to_inline_group() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<p style="text-indent:40px">hello</p>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        fn find_inline_group<'a>(el: &'a style::StyledElement) -> Option<&'a style::InlineGroup> {
            for c in &el.children {
                match c {
                    style::StyledNode::InlineGroup(g) => return Some(g),
                    style::StyledNode::Element(child) => {
                        if let Some(g) = find_inline_group(child) {
                            return Some(g);
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        let group = find_inline_group(&root).expect("inline group");
        assert_eq!(group.text_indent, types::CssLength::Px(40.0));
    }

    // ── Grid alignment (justify-items / justify-self / align-content) ──

    #[test]
    fn test_justify_items_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="display:grid;justify-items:center">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.justify_items, types::AlignItems::Center);
    }

    #[test]
    fn test_justify_self_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="display:grid"><div style="justify-self:end">x</div></div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        // Find inner div (the one with justify-self).
        fn find_inner<'a>(el: &'a style::StyledElement) -> Option<&'a style::StyledElement> {
            for c in &el.children {
                if let style::StyledNode::Element(child) = c {
                    if child.tag == "div" {
                        return Some(child);
                    }
                }
            }
            None
        }
        let outer = find_el_with(&root, &|e| e.tag == "div").unwrap();
        let inner = find_inner(outer).expect("inner div");
        assert_eq!(inner.justify_self, Some(types::AlignItems::End));
    }

    #[test]
    fn test_align_content_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="display:grid;align-content:space-between">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.align_content, types::JustifyContent::SpaceBetween);
    }

    /// Probe: `justify-items: center; align-items: center` on a grid
    /// centers the 20×20 red item within its 60×60 cell. The cell spans
    /// (0,0)-(60,60); item center should be at (30,30). Probe the cell
    /// corners (should be white) and item center (red).
    #[test]
    fn test_grid_justify_items_center_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="display:grid;grid-template:60px / 60px;justify-items:center;align-items:center;width:60px;height:60px;background:#ffffff">
  <div style="width:20px;height:20px;background:#ff0000"></div>
</div>"#;
        let px = rasterize_rgba(html, 60, 60);
        // Cell corner — item should NOT be here.
        let corner = pixel_at(&px, 5, 5, 60);
        assert_eq!(
            [corner[0], corner[1], corner[2]],
            [255, 255, 255],
            "corner empty"
        );
        // Item center (cell center).
        let center = pixel_at(&px, 30, 30, 60);
        assert_eq!(
            [center[0], center[1], center[2]],
            [255, 0, 0],
            "item centered"
        );
    }

    // ── overflow-clip-margin ─────────────────────────────────────────

    #[test]
    fn test_overflow_clip_margin_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="overflow:clip;overflow-clip-margin:12px">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.overflow_clip_margin, 12.0);
    }

    #[test]
    fn test_overflow_clip_margin_default_zero() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="overflow:clip">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.overflow_clip_margin, 0.0);
    }

    /// Probe: `overflow: clip; overflow-clip-margin: 10px` on a 40×40
    /// parent with a 60×40 red child painted at 0,0 — the margin expands
    /// the clip rect 10px outward, so a pixel 5px past the parent's right
    /// edge (but within the expanded clip) renders red. A pixel 15px past
    /// falls outside even the expanded clip → background white.
    #[test]
    fn test_overflow_clip_margin_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="margin:20px;width:40px;height:40px;overflow:clip;overflow-clip-margin:10px;background:#ffffff">
  <div style="width:60px;height:40px;background:#ff0000"></div>
</div>"#;
        let px = rasterize_rgba(html, 100, 100);
        // Parent at (20,20)-(60,60); margin expands clip to (10,10)-(70,70).
        // Child extends from (20,20) to (80,60). Sample at (65, 30) which
        // is inside the 10px margin zone: should be red.
        let in_margin = pixel_at(&px, 65, 30, 100);
        assert_eq!(
            [in_margin[0], in_margin[1], in_margin[2]],
            [255, 0, 0],
            "inside clip-margin zone → red"
        );
        // Sample at (75, 30) — past the expanded clip → background white.
        let outside = pixel_at(&px, 75, 30, 100);
        assert_eq!(
            [outside[0], outside[1], outside[2]],
            [255, 255, 255],
            "past clip-margin → white"
        );
    }

    /// `overflow: hidden` must ignore `overflow-clip-margin` per CSS spec.
    #[test]
    fn test_overflow_hidden_ignores_clip_margin() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="margin:20px;width:40px;height:40px;overflow:hidden;overflow-clip-margin:10px;background:#ffffff">
  <div style="width:60px;height:40px;background:#ff0000"></div>
</div>"#;
        let px = rasterize_rgba(html, 100, 100);
        // Sample 5px past the parent's right edge — for hidden, margin is
        // ignored so this pixel is outside the clip → white.
        let past = pixel_at(&px, 65, 30, 100);
        assert_eq!(
            [past[0], past[1], past[2]],
            [255, 255, 255],
            "hidden clips exactly at box edge"
        );
    }

    // ── clip-path ────────────────────────────────────────────────────

    #[test]
    fn test_clip_path_none_default() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div>x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert!(matches!(el.clip_path, style::ClipPath::None));
    }

    #[test]
    fn test_clip_path_inset_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="clip-path:inset(10px 20px 30px 40px round 6px)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        match el.clip_path {
            style::ClipPath::Inset {
                top,
                right,
                bottom,
                left,
                ref radius,
            } => {
                assert_eq!(top, types::CssLength::Px(10.0));
                assert_eq!(right, types::CssLength::Px(20.0));
                assert_eq!(bottom, types::CssLength::Px(30.0));
                assert_eq!(left, types::CssLength::Px(40.0));
                assert_eq!(radius.tl_x, 6.0);
            }
            ref other => panic!("expected Inset, got {other:?}"),
        }
    }

    #[test]
    fn test_clip_path_circle_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="clip-path:circle(40px at 50% 50%)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        match el.clip_path {
            style::ClipPath::Circle { cx, cy, radius } => {
                assert_eq!(cx, types::CssLength::Percent(0.5));
                assert_eq!(cy, types::CssLength::Percent(0.5));
                assert_eq!(
                    radius,
                    style::ShapeRadius::Length(types::CssLength::Px(40.0))
                );
            }
            ref other => panic!("expected Circle, got {other:?}"),
        }
    }

    #[test]
    fn test_clip_path_polygon_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        match el.clip_path {
            style::ClipPath::Polygon {
                ref points,
                even_odd,
            } => {
                assert_eq!(points.len(), 4);
                assert!(!even_odd);
                assert_eq!(points[0].0, types::CssLength::Percent(0.5));
                assert_eq!(points[0].1, types::CssLength::Px(0.0));
            }
            ref other => panic!("expected Polygon, got {other:?}"),
        }
    }

    /// Probe: `inset(20px)` on a 100×100 red box clips the outer ring
    /// away — pixels at (5,5) are background-white, pixels at (50,50)
    /// are still red.
    #[test]
    fn test_clip_path_inset_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:100px;height:100px;background:#ff0000;clip-path:inset(20px)"></div>"#;
        let px = rasterize_rgba(html, 100, 100);
        let outer = pixel_at(&px, 5, 5, 100);
        assert_eq!(
            [outer[0], outer[1], outer[2]],
            [255, 255, 255],
            "clipped ring → white"
        );
        let inner = pixel_at(&px, 50, 50, 100);
        assert_eq!(
            [inner[0], inner[1], inner[2]],
            [255, 0, 0],
            "inset region red"
        );
    }

    /// Probe: `circle(40px at center)` on a 100×100 red box — corners
    /// are clipped (distance √50² ≈ 70 from center > 40), center is
    /// still red.
    #[test]
    fn test_clip_path_circle_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:100px;height:100px;background:#ff0000;clip-path:circle(40px at center)"></div>"#;
        let px = rasterize_rgba(html, 100, 100);
        let corner = pixel_at(&px, 5, 5, 100);
        assert_eq!(
            [corner[0], corner[1], corner[2]],
            [255, 255, 255],
            "corner clipped"
        );
        let center = pixel_at(&px, 50, 50, 100);
        assert_eq!(
            [center[0], center[1], center[2]],
            [255, 0, 0],
            "center visible"
        );
    }

    // ── CSS `filter` ─────────────────────────────────────────────────

    #[test]
    fn test_filter_extract_single() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="filter:blur(4px)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.filter.len(), 1);
        match el.filter[0] {
            style::FilterFunction::Blur(px) => assert_eq!(px, 4.0),
            ref other => panic!("expected Blur, got {other:?}"),
        }
    }

    #[test]
    fn test_filter_extract_chain() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="filter:grayscale(1) brightness(1.2) contrast(1.4)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.filter.len(), 3);
        assert!(matches!(el.filter[0], style::FilterFunction::Grayscale(_)));
        assert!(matches!(el.filter[1], style::FilterFunction::Brightness(_)));
        assert!(matches!(el.filter[2], style::FilterFunction::Contrast(_)));
    }

    #[test]
    fn test_filter_extract_all_functions() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="filter:blur(2px) brightness(1.1) contrast(1.2) grayscale(0.3) hue-rotate(90deg) invert(0.5) opacity(0.8) saturate(1.5) sepia(0.4)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.filter.len(), 9);
    }

    /// Probe: `grayscale(1)` on pure red should equalize RGB channels.
    #[test]
    fn test_filter_grayscale_probe() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div style="width:40px;height:40px;background:#ff0000;filter:grayscale(1)"></div>"#;
        let px = rasterize_rgba(html, 40, 40);
        let p = pixel_at(&px, 20, 20, 40);
        assert!(p[0] < 100, "red crushed, got {}", p[0]);
        assert!(p[1] > 20, "green raised, got {}", p[1]);
        assert!(
            (p[0] as i32 - p[1] as i32).abs() < 10,
            "r≈g in grayscale, got r={} g={}",
            p[0],
            p[1]
        );
    }

    /// Probe: `invert(1)` flips #000000 → #ffffff.
    #[test]
    fn test_filter_invert_probe() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div style="width:40px;height:40px;background:#000000;filter:invert(1)"></div>"#;
        let px = rasterize_rgba(html, 40, 40);
        let p = pixel_at(&px, 20, 20, 40);
        assert_eq!([p[0], p[1], p[2]], [255, 255, 255], "black → white");
    }

    #[test]
    fn test_filter_drop_shadow_extract() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="filter:drop-shadow(4px 6px 2px #ff0000)">x</div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let el = find_el_with(&root, &|e| e.tag == "div").unwrap();
        assert_eq!(el.filter.len(), 1);
        match el.filter[0] {
            style::FilterFunction::DropShadow {
                offset_x,
                offset_y,
                blur,
                color,
            } => {
                assert_eq!(offset_x, 4.0);
                assert_eq!(offset_y, 6.0);
                assert_eq!(blur, 2.0);
                assert_eq!((color.r, color.g, color.b), (255, 0, 0));
            }
            ref other => panic!("expected DropShadow, got {other:?}"),
        }
    }

    /// Probe: a sharp red drop-shadow on a solid black box produces red
    /// pixels in the shadow region (down-and-right of the box).
    #[test]
    fn test_filter_drop_shadow_probe() {
        let _guard = crate::stylo_test::lock();
        // Body padding 20px places the box at (20,20)-(60,60); shadow
        // offset 10,10 places the shadow at (30,30)-(70,70). Probe the
        // strip that's shadow-only (past the box's right edge).
        let html = r#"<div style="width:40px;height:40px;margin:20px;background:#000000;filter:drop-shadow(10px 10px 0 #ff0000)"></div>"#;
        let px = rasterize_rgba(html, 80, 80);
        let shadow = pixel_at(&px, 65, 65, 80);
        assert_eq!(
            [shadow[0], shadow[1], shadow[2]],
            [255, 0, 0],
            "shadow region red"
        );
        let box_px = pixel_at(&px, 30, 30, 80);
        assert_eq!(
            [box_px[0], box_px[1], box_px[2]],
            [0, 0, 0],
            "source still renders"
        );
    }

    /// Probe: `hue-rotate(180deg)` on pure red yields a cyan-ish tone.
    /// The standard W3C filter matrix preserves luma (~Y=54 for red),
    /// so the rotated color is roughly (0, 109, 109) — green≈blue, both
    /// clearly present but not peak-white.
    #[test]
    fn test_filter_hue_rotate_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:40px;height:40px;background:#ff0000;filter:hue-rotate(180deg)"></div>"#;
        let px = rasterize_rgba(html, 40, 40);
        let p = pixel_at(&px, 20, 20, 40);
        assert!(p[0] < 30, "red crushed, got {}", p[0]);
        assert!(p[1] > 80 && p[2] > 80, "g+b raised, got {p:?}");
        assert!(
            (p[1] as i32 - p[2] as i32).abs() < 10,
            "g≈b for cyan, got g={} b={}",
            p[1],
            p[2]
        );
    }

    // ── object-position on <img> ─────────────────────────────────────

    fn find_replaced(el: &style::StyledElement) -> Option<&style::ReplacedContent> {
        if let Some(ref r) = el.replaced {
            return Some(r);
        }
        for c in &el.children {
            if let style::StyledNode::Element(child) = c {
                if let Some(r) = find_replaced(child) {
                    return Some(r);
                }
            }
        }
        None
    }

    #[test]
    fn test_object_position_default_center() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<img src="x.png" style="width:100px;height:100px">"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let r = find_replaced(&root).expect("replaced");
        assert_eq!(r.object_position.x, types::CssLength::Percent(0.5));
        assert_eq!(r.object_position.y, types::CssLength::Percent(0.5));
    }

    #[test]
    fn test_object_position_keywords() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<img src="x.png" style="width:100px;height:100px;object-position:left top">"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let r = find_replaced(&root).expect("replaced");
        assert_eq!(r.object_position.x, types::CssLength::Percent(0.0));
        assert_eq!(r.object_position.y, types::CssLength::Percent(0.0));

        let html2 =
            r#"<img src="x.png" style="width:100px;height:100px;object-position:right bottom">"#;
        let root = collect::collect_styled_tree(html2).unwrap().unwrap();
        let r = find_replaced(&root).expect("replaced");
        assert_eq!(r.object_position.x, types::CssLength::Percent(1.0));
        assert_eq!(r.object_position.y, types::CssLength::Percent(1.0));
    }

    #[test]
    fn test_object_position_px_and_percent() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<img src="x.png" style="width:100px;height:100px;object-position:20px 50%">"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        let r = find_replaced(&root).expect("replaced");
        assert_eq!(r.object_position.x, types::CssLength::Px(20.0));
        assert_eq!(r.object_position.y, types::CssLength::Percent(0.5));
    }

    // ── Gradient stop px positions ──────────────────────────────────

    #[test]
    fn test_gradient_stop_px_extraction() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="background:linear-gradient(90deg,red 0px,blue 20px)">x</div>"#;
        let g = expect_linear(html);
        assert_eq!(g.stops.len(), 2);
        assert!(g.stops[0].offset_is_px);
        assert_eq!(g.stops[0].offset, 0.0);
        assert!(g.stops[1].offset_is_px);
        assert_eq!(g.stops[1].offset, 20.0);
    }

    #[test]
    fn test_gradient_stop_percent_extraction() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="background:linear-gradient(90deg,red 0%,blue 50%)">x</div>"#;
        let g = expect_linear(html);
        assert!(!g.stops[0].offset_is_px);
        assert_eq!(g.stops[0].offset, 0.0);
        assert!(!g.stops[1].offset_is_px);
        assert_eq!(g.stops[1].offset, 0.5);
    }

    /// Probe: `repeating-linear-gradient` with 20px red / 20px white stops
    /// on a 100px-wide box paints a 40px cycle — so every 40px the pattern
    /// repeats. Before this fix, px stops collapsed to 0..100% and the
    /// cycle was the entire box (no tiling).
    #[test]
    fn test_gradient_repeating_px_stops_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:100px;height:20px;background:repeating-linear-gradient(90deg,#ff0000 0 20px,#ffffff 20px 40px)"></div>"#;
        let px = rasterize_rgba(html, 100, 20);
        let at = |x: i32| {
            let p = pixel_at(&px, x, 10, 100);
            [p[0], p[1], p[2]]
        };
        assert_eq!(at(10), [255, 0, 0], "0–20 red");
        assert_eq!(at(30), [255, 255, 255], "20–40 white");
        assert_eq!(at(50), [255, 0, 0], "40–60 red");
        assert_eq!(at(70), [255, 255, 255], "60–80 white");
        assert_eq!(at(90), [255, 0, 0], "80–100 red");
    }

    /// A gradient with a mix of px and percent stops still paints correctly.
    #[test]
    fn test_gradient_mixed_px_percent_probe() {
        let _guard = crate::stylo_test::lock();
        // 100px wide. Red up to 25px (25% line length), white from 50%.
        let html = r#"<div style="width:100px;height:20px;background:linear-gradient(90deg,#ff0000 25px,#ffffff 50%)"></div>"#;
        let px = rasterize_rgba(html, 100, 20);
        let left = pixel_at(&px, 10, 10, 100);
        assert_eq!(
            [left[0], left[1], left[2]],
            [255, 0, 0],
            "pre-first-stop red"
        );
        let right = pixel_at(&px, 75, 10, 100);
        assert_eq!(
            [right[0], right[1], right[2]],
            [255, 255, 255],
            "post-last-stop white"
        );
    }

    // ── Gradient color interpolation ─────────────────────────────────
    //
    // The explicit `in <colorspace>` syntax is gated in Stylo behind the
    // `layout.css.gradient-color-interpolation-method.enabled` pref which
    // defaults to false in our workspace. The default-path
    // (`best_interpolation_between`) still picks sRGB or Oklab based on the
    // stop color types, and that's what we cover here.

    #[test]
    fn test_gradient_interpolation_legacy_is_srgb() {
        let _guard = crate::stylo_test::lock();
        // All stops use legacy rgb/hex notation → sRGB default.
        let html = r#"<div style="background:linear-gradient(red,blue)">x</div>"#;
        let g = expect_linear(html);
        assert_eq!(g.interpolation.color_space, style::GradientColorSpace::Srgb);
        assert_eq!(
            g.interpolation.hue_method,
            style::GradientHueMethod::Shorter
        );
    }

    #[test]
    fn test_gradient_interpolation_oklab_color_is_oklab() {
        let _guard = crate::stylo_test::lock();
        // One modern color function → Oklab default.
        let html = r#"<div style="background:linear-gradient(oklab(0.5 0 0),blue)">x</div>"#;
        let g = expect_linear(html);
        assert_eq!(
            g.interpolation.color_space,
            style::GradientColorSpace::Oklab
        );
    }

    #[test]
    fn test_gradient_interpolation_oklch_both_is_oklab() {
        let _guard = crate::stylo_test::lock();
        // Two modern (oklch) stops → Oklab default.
        let html = r#"<div style="background:linear-gradient(oklch(70% 0.2 20),oklch(70% 0.2 260))">x</div>"#;
        let g = expect_linear(html);
        assert_eq!(
            g.interpolation.color_space,
            style::GradientColorSpace::Oklab
        );
    }

    #[test]
    fn test_gradient_interpolation_radial_inherits_auto() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="background:radial-gradient(circle,oklab(0.5 0 0),red)">x</div>"#;
        let g = expect_radial(html);
        assert_eq!(
            g.interpolation.color_space,
            style::GradientColorSpace::Oklab
        );
    }

    /// Probe: the midpoint of legacy (sRGB) vs Oklab-auto gradient between
    /// equivalent colors renders differently — confirms Skia honors the
    /// extracted interpolation space.
    #[test]
    fn test_gradient_interpolation_oklab_probe_differs_from_srgb() {
        let _guard = crate::stylo_test::lock();
        let srgb_html = r#"<div style="width:100px;height:20px;background:linear-gradient(90deg,#ffff00,#0000ff)"></div>"#;
        // Use oklab() stops so the auto-detected space is Oklab.
        let oklab_html = r#"<div style="width:100px;height:20px;background:linear-gradient(90deg,oklab(0.97 -0.07 0.2),oklab(0.45 -0.03 -0.3))"></div>"#;
        let srgb_px = rasterize_rgba(srgb_html, 100, 20);
        let oklab_px = rasterize_rgba(oklab_html, 100, 20);
        let srgb_mid = pixel_at(&srgb_px, 50, 10, 100);
        let oklab_mid = pixel_at(&oklab_px, 50, 10, 100);
        let diff = ((srgb_mid[0] as i32 - oklab_mid[0] as i32).abs()
            + (srgb_mid[1] as i32 - oklab_mid[1] as i32).abs()
            + (srgb_mid[2] as i32 - oklab_mid[2] as i32).abs()) as u32;
        assert!(
            diff > 30,
            "sRGB vs Oklab midpoints should diverge; got srgb={srgb_mid:?} oklab={oklab_mid:?}"
        );
    }

    /// Pixel probe: a linear gradient with `currentcolor` start and white end
    /// on a `color: red` element paints red at the left edge, white at right.
    #[test]
    fn test_gradient_currentcolor_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="width:100px;height:100px;color:#ff0000;background:linear-gradient(90deg,currentcolor 0 50%,#ffffff 50% 100%)"></div>"#;
        let px = rasterize_rgba(html, 100, 100);
        let left = pixel_at(&px, 10, 50, 100);
        assert_eq!([left[0], left[1], left[2]], [255, 0, 0], "left edge red");
        let right = pixel_at(&px, 90, 50, 100);
        assert_eq!(
            [right[0], right[1], right[2]],
            [255, 255, 255],
            "right edge white"
        );
    }

    /// Without z-index, source order wins (red later = on top).
    #[test]
    fn test_z_index_source_order_default() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="position:relative;width:300px;height:300px;background:#ffffff">
  <div style="position:absolute;top:40px;left:40px;width:120px;height:120px;background:#0000ff"></div>
  <div style="position:absolute;top:100px;left:100px;width:120px;height:120px;background:#ff0000"></div>
</div>"#;
        let px = rasterize_rgba(html, 300, 300);
        let overlap = pixel_at(&px, 150, 150, 300);
        assert_eq!(
            [overlap[0], overlap[1], overlap[2]],
            [255, 0, 0],
            "source order wins when no z-index"
        );
    }

    // ── Gradient extraction ──────────────────────────────────────────

    fn find_bg_image(el: &style::StyledElement) -> Option<&style::BackgroundImage> {
        for layer in &el.background {
            if let style::BackgroundLayer::Image(img) = layer {
                return Some(img);
            }
        }
        for child in &el.children {
            if let style::StyledNode::Element(c) = child {
                if let Some(img) = find_bg_image(c) {
                    return Some(img);
                }
            }
        }
        None
    }

    fn find_bg_source(el: &style::StyledElement) -> Option<&style::StyleImage> {
        find_bg_image(el).map(|i| &i.source)
    }

    fn expect_radial(html: &str) -> style::RadialGradient {
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        match find_bg_source(&root).expect("no background image") {
            style::StyleImage::RadialGradient(g) => g.clone(),
            other => panic!("expected RadialGradient, got {:?}", other),
        }
    }

    fn expect_conic(html: &str) -> style::ConicGradient {
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        match find_bg_source(&root).expect("no background image") {
            style::StyleImage::ConicGradient(g) => g.clone(),
            other => panic!("expected ConicGradient, got {:?}", other),
        }
    }

    fn expect_linear(html: &str) -> style::LinearGradient {
        let root = collect::collect_styled_tree(html).unwrap().unwrap();
        match find_bg_source(&root).expect("no background image") {
            style::StyleImage::LinearGradient(g) => g.clone(),
            other => panic!("expected LinearGradient, got {:?}", other),
        }
    }

    #[test]
    fn test_radial_shape() {
        let _guard = crate::stylo_test::lock();
        assert_eq!(
            expect_radial(r#"<div style="background:radial-gradient(circle,red,blue)">x</div>"#)
                .shape,
            style::RadialShape::Circle
        );
        assert_eq!(
            expect_radial(r#"<div style="background:radial-gradient(ellipse,red,blue)">x</div>"#)
                .shape,
            style::RadialShape::Ellipse
        );
        // Default (no shape keyword) → ellipse
        assert_eq!(
            expect_radial(r#"<div style="background:radial-gradient(red,blue)">x</div>"#).shape,
            style::RadialShape::Ellipse
        );
    }

    #[test]
    fn test_radial_size_extent() {
        let _guard = crate::stylo_test::lock();
        assert_eq!(
            expect_radial(
                r#"<div style="background:radial-gradient(circle closest-side,red,blue)">x</div>"#
            )
            .size,
            style::RadialSize::ClosestSide
        );
        assert_eq!(
            expect_radial(
                r#"<div style="background:radial-gradient(circle farthest-corner,red,blue)">x</div>"#
            )
            .size,
            style::RadialSize::FarthestCorner
        );
        // Default → farthest-corner
        assert_eq!(
            expect_radial(r#"<div style="background:radial-gradient(red,blue)">x</div>"#).size,
            style::RadialSize::FarthestCorner
        );
    }

    #[test]
    fn test_radial_size_explicit() {
        let _guard = crate::stylo_test::lock();
        assert_eq!(
            expect_radial(
                r#"<div style="background:radial-gradient(circle 40px,red,blue)">x</div>"#
            )
            .size,
            style::RadialSize::Explicit {
                x: types::CssLength::Px(40.0),
                y: types::CssLength::Px(40.0),
            }
        );
        assert_eq!(
            expect_radial(
                r#"<div style="background:radial-gradient(ellipse 80px 30px,red,blue)">x</div>"#
            )
            .size,
            style::RadialSize::Explicit {
                x: types::CssLength::Px(80.0),
                y: types::CssLength::Px(30.0),
            }
        );
    }

    #[test]
    fn test_radial_position() {
        let _guard = crate::stylo_test::lock();
        let g = expect_radial(
            r#"<div style="background:radial-gradient(circle at 25% 75%,red,blue)">x</div>"#,
        );
        assert_eq!(g.center.x, types::CssLength::Percent(0.25));
        assert_eq!(g.center.y, types::CssLength::Percent(0.75));

        let g = expect_radial(
            r#"<div style="background:radial-gradient(circle at 30px 30px,red,blue)">x</div>"#,
        );
        assert_eq!(g.center.x, types::CssLength::Px(30.0));
        assert_eq!(g.center.y, types::CssLength::Px(30.0));

        // Default → center (50% 50%)
        let g = expect_radial(r#"<div style="background:radial-gradient(red,blue)">x</div>"#);
        assert_eq!(g.center.x, types::CssLength::Percent(0.5));
        assert_eq!(g.center.y, types::CssLength::Percent(0.5));
    }

    #[test]
    fn test_conic_from_angle() {
        let _guard = crate::stylo_test::lock();
        let g =
            expect_conic(r#"<div style="background:conic-gradient(from 45deg,red,blue)">x</div>"#);
        assert!((g.from_angle_deg - 45.0).abs() < 0.01);

        // Default → 0deg
        let g = expect_conic(r#"<div style="background:conic-gradient(red,blue)">x</div>"#);
        assert!(g.from_angle_deg.abs() < 0.01);
    }

    #[test]
    fn test_conic_position() {
        let _guard = crate::stylo_test::lock();
        let g =
            expect_conic(r#"<div style="background:conic-gradient(at 25% 75%,red,blue)">x</div>"#);
        assert_eq!(g.center.x, types::CssLength::Percent(0.25));
        assert_eq!(g.center.y, types::CssLength::Percent(0.75));

        // Default → center
        let g = expect_conic(r#"<div style="background:conic-gradient(red,blue)">x</div>"#);
        assert_eq!(g.center.x, types::CssLength::Percent(0.5));
        assert_eq!(g.center.y, types::CssLength::Percent(0.5));
    }

    #[test]
    fn test_gradient_repeating() {
        let _guard = crate::stylo_test::lock();
        assert!(
            expect_linear(
                r#"<div style="background:repeating-linear-gradient(red 0,red 10px,blue 10px,blue 20px)">x</div>"#
            )
            .repeating
        );
        assert!(
            expect_radial(
                r#"<div style="background:repeating-radial-gradient(red 0,red 10px,blue 10px,blue 20px)">x</div>"#
            )
            .repeating
        );
        assert!(
            expect_conic(
                r#"<div style="background:repeating-conic-gradient(red 0 30deg,blue 30deg 60deg)">x</div>"#
            )
            .repeating
        );

        // Non-repeating counterparts
        assert!(
            !expect_linear(r#"<div style="background:linear-gradient(red,blue)">x</div>"#)
                .repeating
        );
        assert!(
            !expect_radial(r#"<div style="background:radial-gradient(red,blue)">x</div>"#)
                .repeating
        );
        assert!(
            !expect_conic(r#"<div style="background:conic-gradient(red,blue)">x</div>"#).repeating
        );
    }

    /// Rasterize a picture and return RGBA pixels (reading back through the
    /// image's own `ImageInfo`, so byte order matches the platform).
    fn rasterize_rgba(html: &str, w: i32, h: i32) -> Vec<[u8; 4]> {
        let fonts = test_fonts();
        let pic = test_render(html, w as f32, h as f32, &fonts).expect("render");
        let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("surface");
        surface.canvas().clear(skia_safe::Color::WHITE);
        surface.canvas().draw_picture(&pic, None, None);
        let img = surface.image_snapshot();
        // Force RGBA8888 readback regardless of platform N32 order.
        let info = skia_safe::ImageInfo::new(
            (w, h),
            skia_safe::ColorType::RGBA8888,
            skia_safe::AlphaType::Premul,
            None,
        );
        let row_bytes = info.min_row_bytes();
        let mut raw = vec![0u8; row_bytes * h as usize];
        img.read_pixels(
            &info,
            &mut raw,
            row_bytes,
            skia_safe::IPoint::new(0, 0),
            skia_safe::image::CachingHint::Allow,
        );
        let mut rgba = Vec::with_capacity((w * h) as usize);
        for i in 0..(w * h) as usize {
            let off = i * 4;
            rgba.push([raw[off], raw[off + 1], raw[off + 2], raw[off + 3]]);
        }
        rgba
    }

    fn pixel_at(pixels: &[[u8; 4]], x: i32, y: i32, w: i32) -> [u8; 4] {
        pixels[(y * w + x) as usize]
    }

    /// Probe test for the conic default-path 90° rotation fix.
    ///
    /// CSS conic 0° is at 12 o'clock; Skia's sweep gradient defaults to 3 o'clock.
    /// Without the paint-time offset, the default-path `conic-gradient(...)` is
    /// rotated 90° CCW. This test pins the quadrant-to-color mapping.
    #[test]
    fn test_conic_default_quadrants() {
        let _guard = crate::stylo_test::lock();
        // 100×100 box, sharp quadrant transitions, no text/fonts.
        let html = r#"
<div style="width:100px;height:100px;background:conic-gradient(
  #ff0000 0deg 90deg,
  #00ff00 90deg 180deg,
  #0000ff 180deg 270deg,
  #ffff00 270deg 360deg
)"></div>"#;
        // Render into a surface matching the div — body's default margin is 0
        // for our fixtures. Render into 100×100 directly.
        let px = rasterize_rgba(html, 100, 100);

        // Interior quadrant centers — far enough from boundaries to avoid AA.
        let tr = pixel_at(&px, 75, 25, 100); // top-right: CSS 45°  → red
        let br = pixel_at(&px, 75, 75, 100); // bottom-right: CSS 135° → green
        let bl = pixel_at(&px, 25, 75, 100); // bottom-left: CSS 225° → blue
        let tl = pixel_at(&px, 25, 25, 100); // top-left: CSS 315° → yellow

        assert_eq!(
            [tr[0], tr[1], tr[2]],
            [255, 0, 0],
            "top-right should be red"
        );
        assert_eq!(
            [br[0], br[1], br[2]],
            [0, 255, 0],
            "bottom-right should be green"
        );
        assert_eq!(
            [bl[0], bl[1], bl[2]],
            [0, 0, 255],
            "bottom-left should be blue"
        );
        assert_eq!(
            [tl[0], tl[1], tl[2]],
            [255, 255, 0],
            "top-left should be yellow"
        );
    }

    /// Probe: `background-size: 50px 50px; no-repeat; position: 0 0` paints a
    /// tile only in the top-left quadrant of a 100×100 box. The rest of the
    /// box shows the surface clear color (white).
    #[test]
    fn test_bg_size_no_repeat_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="width:100px;height:100px;background:
  linear-gradient(to right, #ff0000 0 100%);
  background-size:50px 50px;
  background-repeat:no-repeat;
  background-position:0 0;"></div>"#;
        let px = rasterize_rgba(html, 100, 100);

        // Inside tile: red.
        let inside = pixel_at(&px, 25, 25, 100);
        assert_eq!(
            [inside[0], inside[1], inside[2]],
            [255, 0, 0],
            "inside tile"
        );
        // Outside tile: white (surface clear).
        let outside = pixel_at(&px, 75, 75, 100);
        assert_eq!(
            [outside[0], outside[1], outside[2]],
            [255, 255, 255],
            "outside tile"
        );
    }

    /// Probe: `background-position: 100% 100%` with `no-repeat` tile at
    /// 50×50 in a 100×100 box pins the tile to the bottom-right quadrant.
    #[test]
    fn test_bg_position_bottom_right_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="width:100px;height:100px;background:
  linear-gradient(to right, #0000ff 0 100%);
  background-size:50px 50px;
  background-repeat:no-repeat;
  background-position:100% 100%;"></div>"#;
        let px = rasterize_rgba(html, 100, 100);
        let br = pixel_at(&px, 75, 75, 100);
        assert_eq!([br[0], br[1], br[2]], [0, 0, 255], "bottom-right tile");
        let tl = pixel_at(&px, 25, 25, 100);
        assert_eq!([tl[0], tl[1], tl[2]], [255, 255, 255], "top-left empty");
    }

    /// Probe: `repeat-x` tiles the 50×25 image horizontally but not vertically.
    #[test]
    fn test_bg_repeat_x_probe() {
        let _guard = crate::stylo_test::lock();
        let html = r#"
<div style="width:100px;height:100px;background:
  linear-gradient(to right, #00aa00 0 100%);
  background-size:50px 25px;
  background-repeat:repeat-x;
  background-position:0 0;"></div>"#;
        let px = rasterize_rgba(html, 100, 100);
        // Top band tiles across.
        let left = pixel_at(&px, 10, 10, 100);
        let right = pixel_at(&px, 80, 10, 100);
        assert_eq!([left[0], left[1], left[2]], [0, 170, 0], "top-left tile");
        assert_eq!(
            [right[0], right[1], right[2]],
            [0, 170, 0],
            "top-right tile"
        );
        // Below first row → no repeat-y.
        let below = pixel_at(&px, 50, 60, 100);
        assert_eq!(
            [below[0], below[1], below[2]],
            [255, 255, 255],
            "second row empty"
        );
    }

    /// Probe: `background-clip: padding-box` with an 8px solid border clips
    /// the gradient to the padding area. A pixel inside the padding area
    /// shows the gradient; a pixel inside the border strip shows the border
    /// color (gradient is clipped away).
    #[test]
    fn test_bg_clip_padding_box_probe() {
        let _guard = crate::stylo_test::lock();
        // Total box is 100×100 (84 padding area + 8px border each side).
        let html = r#"
<div style="width:84px;height:84px;border:8px solid #888888;background:
  linear-gradient(to right, #ff0000 0 100%);
  background-clip:padding-box;
  background-origin:padding-box;"></div>"#;
        let px = rasterize_rgba(html, 100, 100);

        // Deep inside the padding area → red (gradient visible).
        let inside = pixel_at(&px, 50, 50, 100);
        assert_eq!(
            [inside[0], inside[1], inside[2]],
            [255, 0, 0],
            "inside padding-box"
        );
        // Inside the left border strip → border color (no gradient).
        let border = pixel_at(&px, 3, 50, 100);
        assert_eq!(
            [border[0], border[1], border[2]],
            [0x88, 0x88, 0x88],
            "border strip shows border color, not gradient"
        );
    }

    /// Smoke probe: a sharp (no-blur) red text-shadow must produce red pixels
    /// somewhere in the rendered output. Only meaningful when the test font
    /// repository resolves a font with renderable glyphs; if not (CI without
    /// system fonts), the test is a no-op since no text is painted.
    #[test]
    fn test_text_shadow_red_pixels_present() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div style="margin:0;padding:0;font-size:40px;color:#000000;text-shadow:12px 0 0 #ff0000">HELLO</div>"#;
        let px = rasterize_rgba(html, 400, 200);
        // Skip if no glyphs painted (empty font repo → no black text pixels).
        let black_count = px
            .iter()
            .filter(|p| p[0] < 40 && p[1] < 40 && p[2] < 40)
            .count();
        if black_count < 10 {
            return;
        }
        let red_count = px
            .iter()
            .filter(|p| p[0] > 200 && p[1] < 40 && p[2] < 40)
            .count();
        assert!(
            red_count > 20,
            "expected many red shadow pixels, got {red_count} (black={black_count})"
        );
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
        let pic = test_render(html, 800.0, 600.0, &fonts);
        assert!(pic.is_ok(), "transform-2d.html should render without error");
    }

    #[test]
    fn test_render_transform_with_origin() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = r#"<div style="width:100px;height:100px;background:#000;transform:rotate(45deg);transform-origin:0% 0%">origin</div>"#;
        let pic = test_render(html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    #[test]
    fn test_render_transform_origin_fixture() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = include_str!("../../../../fixtures/test-html/L0/transform-origin.html");
        let pic = test_render(html, 800.0, 600.0, &fonts);
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
        let pic = test_render(html, 800.0, 600.0, &fonts);
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
        let pic = test_render(html, 400.0, 300.0, &fonts);
        assert!(pic.is_ok());
    }

    /// transform-origin: 10px 20px must render correctly.
    #[test]
    fn test_render_transform_origin_px() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = r#"<div style="width:100px;height:100px;background:#000;transform:rotate(45deg);transform-origin:10px 20px">T</div>"#;
        let pic = test_render(html, 400.0, 300.0, &fonts);
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

    // ── Widget (form control) tests ──

    #[test]
    fn test_widget_button() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        // <input type="submit"> is a PushButton rendered as void element
        // with injected label text. <button> element relies on Stylo UA styles
        // which may not produce layout in servo mode — test with <input> instead.
        let pic = test_render(
            r#"<input type="submit" value="Click" />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Submit button should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "Submit button should have height, got {h}");
    }

    #[test]
    fn test_widget_input_text() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<input type="text" placeholder="Name" />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Text input should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "Text input should have height, got {h}");
    }

    #[test]
    fn test_widget_input_password() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<input type="password" value="secret" />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Password input should render");
    }

    #[test]
    fn test_widget_checkbox() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<input type="checkbox" /><input type="checkbox" checked />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Checkbox should render");
    }

    #[test]
    fn test_widget_radio() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<input type="radio" /><input type="radio" checked />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Radio should render");
    }

    #[test]
    fn test_widget_select() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<select><option>Apple</option><option selected>Banana</option></select>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Select should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "Select should have height, got {h}");
    }

    #[test]
    fn test_widget_textarea() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<textarea placeholder="Message..."></textarea>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Textarea should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "Textarea should have height, got {h}");
    }

    #[test]
    fn test_widget_input_range() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<input type="range" min="0" max="100" value="50" />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Range slider should render");
    }

    #[test]
    fn test_widget_input_color() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r##"<input type="color" value="#ff0000" />"##,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Color input should render");
    }

    #[test]
    fn test_widget_input_hidden() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<input type="hidden" value="secret" />"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Hidden input should render (empty)");
    }

    #[test]
    fn test_widget_fieldset() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<fieldset><legend>Info</legend><input type="text" /></fieldset>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "Fieldset should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "Fieldset should have height, got {h}");
    }

    #[test]
    fn test_widget_form_mixed() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let html = r#"
            <form>
                <label>Name: <input type="text" value="Alice" /></label>
                <br />
                <label><input type="checkbox" checked /> Agree</label>
                <br />
                <select><option selected>Option 1</option></select>
                <br />
                <textarea rows="3">Some text</textarea>
                <br />
                <button>Submit</button>
            </form>
        "#;
        let pic = test_render(html, 600.0, 400.0, &fonts);
        assert!(pic.is_ok(), "Mixed form should render");
        let h = pic.unwrap().cull_rect().height();
        assert!(
            h > 50.0,
            "Mixed form should have substantial height, got {h}"
        );
    }

    // ── Image element tests ──

    /// Verify <img> is collected as StyledNode::Replaced.
    #[test]
    fn test_img_collection() {
        let _guard = crate::stylo_test::lock();
        let html =
            r#"<div><img src="test://photo.jpg" width="200" height="150" alt="A photo" /></div>"#;
        let root = collect::collect_styled_tree(html).unwrap().unwrap();

        fn find_replaced(el: &style::StyledElement) -> Option<&style::ReplacedContent> {
            if let Some(ref r) = el.replaced {
                return Some(r);
            }
            for child in &el.children {
                if let style::StyledNode::Element(e) = child {
                    if let Some(found) = find_replaced(e) {
                        return Some(found);
                    }
                }
            }
            None
        }

        let replaced =
            find_replaced(&root).expect("Should find element with replaced content for <img>");
        assert_eq!(replaced.src, "test://photo.jpg");
        assert_eq!(replaced.alt.as_deref(), Some("A photo"));
        assert_eq!(replaced.attr_width, Some(200));
        assert_eq!(replaced.attr_height, Some(150));
    }

    /// Verify <img> renders with placeholder (no crash) when no images provided.
    #[test]
    fn test_img_render_placeholder() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<div><img src="test://missing.png" width="100" height="80" /></div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(pic.is_ok(), "<img> with NoImages should render placeholder");
        let h = pic.unwrap().cull_rect().height();
        assert!(h > 0.0, "Should have positive height, got {h}");
    }

    /// Verify collect_image_urls extracts correct URLs.
    #[test]
    fn test_collect_image_urls() {
        let _guard = crate::stylo_test::lock();
        let html = r#"<div>
            <img src="photo.jpg" width="100" height="80" />
            <div style="background-image:url('bg.png')"></div>
        </div>"#;
        let urls = collect_image_urls(html).unwrap();
        println!("collected URLs: {:?}", urls);
        assert!(
            urls.contains(&"photo.jpg".to_string()),
            "Should find img src, got {:?}",
            urls
        );
        // Note: background-image url() goes through Stylo ComputedUrl resolution.
        // With no base URL, Stylo may resolve "bg.png" to an absolute URL.
        // The img src is from raw HTML attributes and is preserved as-is.
    }

    /// Verify images render when PreloadedImages has the data.
    #[test]
    fn test_img_render_with_provider() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();

        let png_bytes = include_bytes!("../../../../fixtures/images/checker.png");
        let mut images = PreloadedImages::new();
        images.insert_bytes("photo.jpg".to_string(), png_bytes);

        let html = r#"<div><img src="photo.jpg" width="50" height="50" /></div>"#;
        let pic = render(html, 400.0, 300.0, &fonts, &images);
        assert!(pic.is_ok(), "Should render with image provider");
    }

    /// Verify background-image: url() doesn't crash with NoImages.
    #[test]
    fn test_background_image_url_placeholder() {
        let _guard = crate::stylo_test::lock();
        let fonts = test_fonts();
        let pic = test_render(
            r#"<div style="width:200px;height:100px;background-image:url('test://bg.png')">content</div>"#,
            400.0,
            300.0,
            &fonts,
        );
        assert!(
            pic.is_ok(),
            "background-image url with NoImages should render"
        );
    }
}
