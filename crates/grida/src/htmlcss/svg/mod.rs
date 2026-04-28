//! `htmlcss::svg` — Skia-backed SVG renderer.
//!
//! Plugs into [`crate::htmlcss`] for both standalone `.svg` documents and
//! inline `<svg>` in HTML. Static-only. V1 is a direct `DemoDom` →
//! resource table → paint-walk renderer with focused helper modules for
//! geometry, viewports, effects, and resources. The long-term target is
//! still the Chromium-shaped parse/style/layout/paint pipeline described
//! in `README.md` and `docs/wg/feat-2d/htmlcss-svg.md`.
//!
//! Not to be confused with:
//! - [`crate::import::svg`] — SVG → Grida canvas IR (uses usvg).
//! - [`crate::formats::svg`] — string-level SVG tooling (uses usvg).
//!
//! This module is a *renderer*; those are *converters*.
//!
//! # Status (checkpoint 1)
//!
//! The renderer supports much more than the original checkpoint now, but
//! style is still a temporary SVG CSS subset rather than the shared Stylo
//! cascade. Keep new behavior behind narrow helper modules until the
//! persistent render tree exists.

pub mod context;
pub mod dom;
pub mod error;
pub mod geometry;
pub mod layout;
pub mod paint;
pub mod resources;
pub mod style;

pub use context::{
    CssLoader, FontResolver, NoCss, PreloadedCss, PreloadedFonts, RenderContext, SystemFonts,
};
pub use error::SvgError;

/// Render an SVG document into an existing Skia canvas at `viewport`.
///
/// Used by [`crate::htmlcss::paint::paint_inline_svg`] for inline
/// `<svg>` and by tests. Mirrors Blink: the viewport rect is the
/// `LayoutSvgRoot`'s box from the host htmlcss layout pass. The
/// `images` provider resolves non-data `<image>`/`feImage` `href`s;
/// pass `&crate::htmlcss::NoImages` when none are available.
pub fn render_into(
    canvas: &skia_safe::Canvas,
    svg_xml: &[u8],
    viewport: skia_safe::Rect,
    images: &dyn crate::htmlcss::ImageProvider,
) -> Result<(), SvgError> {
    render_into_with_context(
        canvas,
        svg_xml,
        viewport,
        RenderContext::with_images(images),
    )
}

/// Same as [`render_into`] but with an explicit host resource context.
pub fn render_into_with_context(
    canvas: &skia_safe::Canvas,
    svg_xml: &[u8],
    viewport: skia_safe::Rect,
    context: RenderContext<'_>,
) -> Result<(), SvgError> {
    let (dom, root_id) = dom::parser::parse_dom(svg_xml)?;
    paint::svg_root_painter::paint_root_node(canvas, &dom, root_id, viewport, context)
}

/// Render a standalone SVG document to a fresh Skia Picture sized
/// `(width, height)` in canvas pixels.
///
/// External `<image>` `href`s are not resolved (the standalone path has
/// no host-provided image cache); inline `data:` URIs decode normally.
/// Use [`render_to_picture_with_images`] when external images need to
/// resolve.
pub fn render_to_picture(
    svg_xml: &str,
    width: f32,
    height: f32,
) -> Result<skia_safe::Picture, SvgError> {
    render_to_picture_with_context(svg_xml, width, height, RenderContext::default())
}

/// Same as [`render_to_picture`] but with an explicit image provider
/// for resolving non-data `<image>`/`feImage` `href`s.
pub fn render_to_picture_with_images(
    svg_xml: &str,
    width: f32,
    height: f32,
    images: &dyn crate::htmlcss::ImageProvider,
) -> Result<skia_safe::Picture, SvgError> {
    render_to_picture_with_context(svg_xml, width, height, RenderContext::with_images(images))
}

/// Same as [`render_to_picture`] but with an explicit host resource
/// context for images, external stylesheets, and font lookup.
pub fn render_to_picture_with_context(
    svg_xml: &str,
    width: f32,
    height: f32,
    context: RenderContext<'_>,
) -> Result<skia_safe::Picture, SvgError> {
    use skia_safe::{PictureRecorder, Rect};

    let bounds = Rect::from_xywh(0.0, 0.0, width.max(1.0), height.max(1.0));
    let mut recorder = PictureRecorder::new();
    let canvas = recorder.begin_recording(bounds, false);
    render_into_with_context(canvas, svg_xml.as_bytes(), bounds, context)?;
    recorder
        .finish_recording_as_picture(Some(&bounds))
        .ok_or_else(|| SvgError::Structure("failed to finish picture recording".to_string()))
}
