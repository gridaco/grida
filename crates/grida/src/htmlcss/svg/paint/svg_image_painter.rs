//! `SvgImagePainter` — `<image>` element.
//!
//! Resolves the image source (data URI decoded inline, or via
//! [`crate::htmlcss::ImageProvider`] for external URLs), then emits
//! `Canvas::draw_image_rect_with_sampling_options` with the box
//! computed from `preserveAspectRatio` over the element's
//! `(x,y,width,height)` rect. SVG default sampling is linear
//! (Skia svg::Dom uses `kLinear` at `SkSVGImage.cpp:99`).
//!
//! Cite Blink:
//! - Defaults / 0×0 short-circuit: `core/svg/svg_image_element.cc:41-69`.
//! - Render call shape: `core/paint/svg_image_painter.cc:95-150`.
//!
//! Cite Skia svg::Dom: `modules/svg/src/SkSVGImage.cpp:34-99`.
//!
//! V1 limits: `href` must be either a `data:` URI we can decode here, or
//! a non-data URL the host has pre-loaded into the [`ImageProvider`].
//! Cross-origin / network fetch is out of scope (we are static).

use csscascade::dom::DemoNode;
use skia_safe::{Canvas, Image, Paint as SkPaint, Rect, SamplingOptions};

use super::super::dom::attrs::{
    compute_image_dst_rect, parse_length_px, parse_preserve_aspect_ratio, PreserveAspectRatio,
};
use super::super::dom::element::get_attr;
use super::super::dom::href::href_attr;
use super::scoped_svg_paint_state::PaintCtx;

/// Paint an `<image>` element. Silently no-ops when the resource is
/// unavailable — placeholder rendering would clash with the SVG
/// "render-what-you-can" stance and most fixtures rely on a valid
/// resolve.
pub fn paint(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let x = get_attr(node, "x").and_then(parse_length_px).unwrap_or(0.0);
    let y = get_attr(node, "y").and_then(parse_length_px).unwrap_or(0.0);
    // Width / height are *optional* per SVG 2 §5.4: an absent or
    // `auto` value means "use intrinsic". A zero or negative explicit
    // value renders nothing. Treat both `auto` and absence as None so
    // we can fall back to the intrinsic aspect ratio.
    fn parse_dim(node: &DemoNode, name: &str) -> Option<f32> {
        let raw = get_attr(node, name)?.trim();
        if raw.is_empty() || raw.eq_ignore_ascii_case("auto") {
            return None;
        }
        let v = parse_length_px(raw)?;
        Some(v)
    }
    let w_attr = parse_dim(node, "width");
    let h_attr = parse_dim(node, "height");
    if matches!(w_attr, Some(v) if v <= 0.0) || matches!(h_attr, Some(v) if v <= 0.0) {
        return;
    }
    let Some(href) = href_attr(node) else {
        return;
    };
    let Some(image) = resolve_image(href, ctx) else {
        return;
    };
    let img_w = image.width().max(1) as f32;
    let img_h = image.height().max(1) as f32;
    // CSS Images 3 §5 — replaced-element sizing with one or both
    // dimensions absent: derive the missing axis from the intrinsic
    // aspect ratio.
    let (w, h) = match (w_attr, h_attr) {
        (Some(w), Some(h)) => (w, h),
        (Some(w), None) => (w, w * (img_h / img_w)),
        (None, Some(h)) => (h * (img_w / img_h), h),
        (None, None) => (img_w, img_h),
    };
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let par: PreserveAspectRatio = get_attr(node, "preserveAspectRatio")
        .map(parse_preserve_aspect_ratio)
        .unwrap_or_default();
    let viewport = Rect::from_xywh(x, y, w, h);
    let dst = compute_image_dst_rect(image.width() as f32, image.height() as f32, viewport, par);
    // `Skia svg::Dom` uses bilinear by default for `<image>` raster
    // (`SkSVGImage.cpp:99`: `SamplingOptions(kLinear)`). Skia's bare
    // `SamplingOptions::default()` is `Nearest` — the wrong default,
    // visible as blocky pixels on JPEG/PNG fixtures. Force linear.
    let sampling = SamplingOptions::from(skia_safe::FilterMode::Linear);
    let paint = SkPaint::default();
    // SVG 2 §8.13: the `slice` keyword in `preserveAspectRatio` scales
    // the image to fully cover the viewport, with overflow clipped at
    // the viewport edges. `compute_image_dst_rect` returns the full
    // (scaled) image rect — without this clip, slice-mode `<image>`
    // bleeds past the box. `meet` always fits inside, `none` fills
    // exactly; only slice requires the clip.
    let needs_clip = dst.left < viewport.left
        || dst.top < viewport.top
        || dst.right > viewport.right
        || dst.bottom > viewport.bottom;
    let restore = if needs_clip {
        let r = canvas.save();
        canvas.clip_rect(viewport, skia_safe::ClipOp::Intersect, true);
        Some(r)
    } else {
        None
    };
    canvas.draw_image_rect_with_sampling_options(&image, None, dst, sampling, &paint);
    if let Some(r) = restore {
        canvas.restore_to_count(r);
    }
}

/// Resolve `href` into an `Image`, handling both inline `data:` URIs
/// and URLs that the host has pre-loaded via [`ImageProvider`]. We
/// decode `data:` URIs locally so callers using `render_to_picture`
/// (which has no provider) still see SVG-embedded images.
///
/// `data:image/svg+xml,...` is treated specially: we recursively
/// render the embedded SVG into a Picture and rasterize to a Skia
/// Image, so nested SVGs work without the host having to pre-decode
/// them. Mirrors what Skia svg::Dom does internally for
/// `<image href="data:image/svg+xml,...">` (`SkSVGImage.cpp:LoadImage`).
pub fn resolve_image(href: &str, ctx: &PaintCtx<'_>) -> Option<Image> {
    let trimmed = href.trim();
    if trimmed.starts_with("data:image/svg+xml")
        || trimmed.starts_with("DATA:image/svg+xml")
        || trimmed.starts_with("data:IMAGE/SVG+XML")
    {
        if let Some(bytes) = decode_data_uri(trimmed) {
            return rasterize_inline_svg(&bytes, ctx);
        }
    }
    if let Some(bytes) = decode_data_uri(trimmed) {
        return Image::from_encoded(skia_safe::Data::new_copy(&bytes));
    }
    ctx.images.get(href).cloned()
}

/// Render an embedded SVG document (from a `data:image/svg+xml,...`
/// URI) to an Image. Sniffs the SVG's `width`/`height`/`viewBox` for a
/// reasonable raster size; falls back to 512×512.
fn rasterize_inline_svg(bytes: &[u8], ctx: &PaintCtx<'_>) -> Option<Image> {
    let xml = std::str::from_utf8(bytes).ok()?;
    let (w, h) = sniff_svg_size(xml).unwrap_or((512, 512));
    let pic =
        crate::htmlcss::svg::render_to_picture_with_images(xml, w as f32, h as f32, ctx.images)
            .ok()?;
    let mut surface = skia_safe::surfaces::raster_n32_premul((w as i32, h as i32))?;
    {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::TRANSPARENT);
        canvas.draw_picture(&pic, None, None);
    }
    Some(surface.image_snapshot())
}

fn sniff_svg_size(xml: &str) -> Option<(u32, u32)> {
    let open = xml.find("<svg").map(|i| &xml[i..])?;
    let tag_end = open.find('>')?;
    let tag = &open[..tag_end];
    fn attr(tag: &str, name: &str) -> Option<u32> {
        let needle = format!("{}=", name);
        let start = tag.find(&needle)? + needle.len();
        let rest = &tag[start..];
        let (quote, rest) = rest.split_at(1);
        let q = quote.chars().next()?;
        if q != '"' && q != '\'' {
            return None;
        }
        let end = rest.find(q)?;
        let raw = &rest[..end];
        let numeric_end = raw
            .find(|c: char| !(c.is_ascii_digit() || c == '.'))
            .unwrap_or(raw.len());
        raw[..numeric_end]
            .parse::<f32>()
            .ok()
            .map(|v| v.max(1.0) as u32)
    }
    if let (Some(w), Some(h)) = (attr(tag, "width"), attr(tag, "height")) {
        return Some((w, h));
    }
    // Fall back to viewBox.
    let needle = "viewBox=";
    let start = tag.find(needle)? + needle.len();
    let rest = &tag[start..];
    let (quote, rest) = rest.split_at(1);
    let q = quote.chars().next()?;
    if q != '"' && q != '\'' {
        return None;
    }
    let end = rest.find(q)?;
    let parts: Vec<f32> = rest[..end]
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<f32>().ok())
        .collect();
    if parts.len() == 4 {
        Some((parts[2].max(1.0) as u32, parts[3].max(1.0) as u32))
    } else {
        None
    }
}

/// Decode a `data:[mediatype][;base64],<payload>` URI to raw bytes.
/// Returns `None` for non-data URIs or malformed payloads.
///
/// We don't pull in a base64 dep — the inline decoder below is ~30
/// lines, infallible for valid input, and short-circuits for the only
/// SVG-relevant subset (`base64` plus URL-encoded raw text). resvg's
/// `usvg/src/parser/image.rs:288-301` does similar but via the
/// `data_url` crate.
pub fn decode_data_uri(uri: &str) -> Option<Vec<u8>> {
    let body = uri
        .strip_prefix("data:")
        .or_else(|| uri.strip_prefix("DATA:"))?;
    let comma = body.find(',')?;
    let (header, payload) = (&body[..comma], &body[comma + 1..]);
    let is_base64 = header
        .split(';')
        .any(|p| p.trim().eq_ignore_ascii_case("base64"));
    if is_base64 {
        decode_base64(payload)
    } else {
        // Plain (URL-encoded) payload — quick percent-decode, suitable
        // for `data:image/svg+xml,<svg ...>` cases. Reftest fixtures
        // rarely use this form for raster images.
        Some(percent_decode(payload).into_bytes())
    }
}

fn percent_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_digit(bytes[i + 1]), hex_digit(bytes[i + 2])) {
                out.push((h * 16 + l) as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Tiny base64 decoder. Rejects malformed input with `None`.
fn decode_base64(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &b in s.as_bytes() {
        let v: u32 = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            // Whitespace inside a `data:` payload is technically
            // forbidden but very common — skip it rather than fail.
            b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => return None,
        };
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1u32 << bits) - 1;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_roundtrip() {
        // "Hello"
        assert_eq!(decode_base64("SGVsbG8="), Some(b"Hello".to_vec()));
        // "any carnal pleasure"
        assert_eq!(
            decode_base64("YW55IGNhcm5hbCBwbGVhc3VyZQ=="),
            Some(b"any carnal pleasure".to_vec())
        );
    }

    #[test]
    fn data_uri_base64() {
        let uri = "data:image/png;base64,SGVsbG8=";
        assert_eq!(decode_data_uri(uri), Some(b"Hello".to_vec()));
    }

    #[test]
    fn data_uri_plain() {
        let uri = "data:text/plain,hello%20world";
        assert_eq!(decode_data_uri(uri), Some(b"hello world".to_vec()));
    }

    #[test]
    fn rejects_non_data_uri() {
        assert_eq!(decode_data_uri("https://example.com/img.png"), None);
        assert_eq!(decode_data_uri("path/to/image.png"), None);
    }
}
