use crate::cg::prelude::*;
use crate::fonts::embedded::geist;
use crate::sk_tiny::tsk_path_to_sk_path;
use math2::transform::AffineTransform;
use serde::{Deserialize, Serialize};
use skia_safe::Path as SkPath;
use usvg;

pub fn into_tree(svg_source: &str) -> Result<usvg::Tree, usvg::Error> {
    let mut options = usvg::Options::default();
    options.font_family = geist::FAMILY.to_string(); // our builtin font
    options.font_size = 16.0; // font-size default is 'medium' (16px) - based on browser spec

    // Register embedded font so usvg can layout <text> (it silently drops
    // text nodes when no font is available).
    options.fontdb_mut().load_font_data(geist::BYTES.to_vec());

    // Load system fonts first — on Linux, `load_system_fonts()` parses
    // fontconfig and *overwrites* the generic-family mappings with names
    // like "DejaVu Sans" that may not be installed. By loading system fonts
    // before setting the generic families, our embedded Geist font always
    // serves as the final fallback.
    #[cfg(not(target_os = "emscripten"))]
    options.fontdb_mut().load_system_fonts();

    // Map every generic CSS family to our embedded font *after*
    // load_system_fonts so fontconfig cannot overwrite these mappings.
    let fontdb = options.fontdb_mut();
    fontdb.set_serif_family(geist::FAMILY);
    fontdb.set_sans_serif_family(geist::FAMILY);
    fontdb.set_cursive_family(geist::FAMILY);
    fontdb.set_fantasy_family(geist::FAMILY);
    fontdb.set_monospace_family(geist::FAMILY);

    usvg::Tree::from_str(svg_source, &options)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGPackedScene {
    pub svg: IRSVGInitialContainerNode,
}

impl SVGPackedScene {
    pub fn new(svg: IRSVGInitialContainerNode) -> Self {
        Self { svg }
    }

    pub fn new_from_tree(tree: &usvg::Tree) -> Result<Self, String> {
        let svg = build_svg_ir_scene(tree)?;
        Ok(Self { svg })
    }

    pub fn new_from_svg_str(svg_source: &str) -> Result<Self, String> {
        let tree = into_tree(svg_source).map_err(|err| err.to_string())?;
        let svg = build_svg_ir_scene(&tree)?;
        Ok(Self { svg })
    }
}

fn build_svg_ir_scene(tree: &usvg::Tree) -> Result<IRSVGInitialContainerNode, String> {
    let size = tree.size();
    let mut children = Vec::new();
    let root_world = CGTransform2D::identity();

    for child in tree.root().children() {
        if let Some(ir_child) = convert_node(child, &root_world)? {
            children.push(ir_child);
        }
    }

    Ok(IRSVGInitialContainerNode {
        width: size.width(),
        height: size.height(),
        children,
    })
}

fn convert_node(
    node: &usvg::Node,
    parent_world: &CGTransform2D,
) -> Result<Option<IRSVGChildNode>, String> {
    match node {
        usvg::Node::Group(group) => {
            let ir_group = convert_group(group, parent_world)?;
            Ok(Some(IRSVGChildNode::Group(ir_group)))
        }
        usvg::Node::Path(path) => {
            let ir_path = convert_path(path, parent_world)?;
            Ok(Some(IRSVGChildNode::Path(ir_path)))
        }
        usvg::Node::Text(text) => {
            let ir_text = convert_text(text, parent_world)?;
            Ok(Some(IRSVGChildNode::Text(ir_text)))
        }
        // TODO:
        usvg::Node::Image(_) => Ok(None),
    }
}

fn convert_group(
    group: &usvg::Group,
    parent_world: &CGTransform2D,
) -> Result<IRSVGGroupNode, String> {
    let abs: CGTransform2D = group.abs_transform().into();
    let relative = extract_relative_transform(parent_world, &abs);

    let mut children = Vec::new();
    for child in group.children() {
        if let Some(ir_child) = convert_node(child, &abs)? {
            children.push(ir_child);
        }
    }

    Ok(IRSVGGroupNode {
        transform: relative,
        opacity: group.opacity().get(),
        blend_mode: group.blend_mode().into(),
        children,
    })
}

fn convert_path(path: &usvg::Path, parent_world: &CGTransform2D) -> Result<IRSVGPathNode, String> {
    let abs: CGTransform2D = path.abs_transform().into();
    let relative = extract_relative_transform(parent_world, &abs);

    let tiny_path = path.data();
    let sk_path = tsk_path_to_sk_path(tiny_path);

    let bounds: CGRect = path.bounding_box().into();
    let (offset_x, offset_y, data) = normalize_skia_path(sk_path, &bounds);

    let mut relative_affine: AffineTransform = relative.into();
    if offset_x != 0.0 || offset_y != 0.0 {
        relative_affine.translate(offset_x, offset_y);
    }
    let transform = CGTransform2D::from(relative_affine);

    let fill = path.fill().map(SVGFillAttributes::from);
    let stroke = path.stroke().map(SVGStrokeAttributes::from);

    Ok(IRSVGPathNode {
        transform,
        fill,
        stroke,
        d: data,
        bounds,
    })
}

/// Convert a usvg `Text` into our IR representation.
///
/// Model: `<text>` → Group, each **chunk** → child node.
/// See `docs/wg/feat-svg/text-import.md` for rationale.
///
/// A chunk is created by usvg at every absolute `x`/`y` reposition.
/// When a chunk has multiple spans with different styles, we produce
/// per-span `IRSVGTextStyledRun` entries so the pack step can create
/// an `AttributedTextNode`.
fn convert_text(text: &usvg::Text, parent_world: &CGTransform2D) -> Result<IRSVGTextNode, String> {
    let abs: CGTransform2D = text.abs_transform().into();
    let relative = extract_relative_transform(parent_world, &abs);
    let bounds: CGRect = text.bounding_box().into();

    let mut combined_text = String::new();
    for chunk in text.chunks() {
        combined_text.push_str(chunk.text());
    }

    // Global fill/stroke: first visible span across all chunks.
    let fill = text.chunks().iter().find_map(|chunk| {
        chunk
            .spans()
            .iter()
            .find(|span| span.is_visible())
            .and_then(|span| span.fill())
            .map(SVGFillAttributes::from)
    });
    let stroke = text.chunks().iter().find_map(|chunk| {
        chunk
            .spans()
            .iter()
            .find(|span| span.is_visible())
            .and_then(|span| span.stroke())
            .map(SVGStrokeAttributes::from)
    });

    // One IR span per chunk (not per usvg span).
    //
    // Resolve chunk positions by replicating usvg's layout logic:
    //   x = chunk.x.unwrap_or(last_x)
    //   y = chunk.y.unwrap_or(last_y)
    // Then accumulate dx/dy offsets per-codepoint from text.dx()/text.dy().
    let dx_list = text.dx();
    let dy_list = text.dy();
    let mut last_x: f32 = 0.0;
    let mut last_y: f32 = 0.0;
    let mut char_offset: usize = 0;

    let mut chunks = Vec::new();
    for chunk in text.chunks() {
        let chunk_text = chunk.text();

        // Resolve absolute position, falling back to last cursor position.
        let mut x = chunk.x().unwrap_or(last_x);
        let mut y = chunk.y().unwrap_or(last_y);

        // Apply dx/dy for the first codepoint of this chunk (the relative
        // offset that usvg stores on text.dx()/text.dy(), not on the chunk).
        if let Some(&dx) = dx_list.get(char_offset) {
            x += dx;
        }
        if let Some(&dy) = dy_list.get(char_offset) {
            y += dy;
        }

        // Advance char_offset past this chunk's codepoints.
        let chunk_chars = chunk_text.chars().count();
        char_offset += chunk_chars;

        // Update cursor for next chunk.
        last_x = x;
        last_y = y;

        if chunk_text.is_empty() {
            continue;
        }

        let mut chunk_affine: AffineTransform = relative.into();
        if x != 0.0 || y != 0.0 {
            chunk_affine.translate(x, y);
        }
        let chunk_transform = CGTransform2D::from(chunk_affine);

        let visible_spans: Vec<_> = chunk.spans().iter().filter(|s| s.is_visible()).collect();
        let has_style_variation = visible_spans.len() > 1;

        if has_style_variation {
            // Multiple visible spans → attributed text chunk.
            // Use untrimmed text so byte offsets stay valid.
            let runs: Vec<IRSVGTextStyledRun> = visible_spans
                .iter()
                .filter_map(|span| {
                    let start = span.start();
                    let end = span.end();
                    if start >= end || end > chunk_text.len() {
                        return None;
                    }
                    Some(IRSVGTextStyledRun {
                        start,
                        end,
                        fill: span.fill().map(SVGFillAttributes::from),
                        stroke: span.stroke().map(SVGStrokeAttributes::from),
                        font_size: span.font_size().get(),
                        font_weight: span.font().weight(),
                        font_style: match span.font().style() {
                            usvg::FontStyle::Normal => SVGFontStyle::Normal,
                            usvg::FontStyle::Italic => SVGFontStyle::Italic,
                            usvg::FontStyle::Oblique => SVGFontStyle::Oblique,
                        },
                        font_family: resolve_font_family(span.font()),
                        letter_spacing: span.letter_spacing(),
                        word_spacing: span.word_spacing(),
                    })
                })
                .collect();

            chunks.push(IRSVGTextChunk::Attributed(IRSVGAttributedTextChunk {
                transform: chunk_transform,
                text: chunk_text.to_string(),
                anchor: chunk.anchor().into(),
                runs,
            }));
        } else {
            // Single style → uniform text span.
            let first_visible = visible_spans.first();
            let chunk_fill = first_visible
                .and_then(|s| s.fill())
                .map(SVGFillAttributes::from);
            let chunk_stroke = first_visible
                .and_then(|s| s.stroke())
                .map(SVGStrokeAttributes::from);
            let font_size = first_visible.map(|s| s.font_size().get());

            chunks.push(IRSVGTextChunk::Uniform(IRSVGTextSpanNode {
                transform: chunk_transform,
                text: chunk_text.to_string(),
                fill: chunk_fill,
                stroke: chunk_stroke,
                font_size,
                anchor: chunk.anchor().into(),
            }));
        }
    }

    Ok(IRSVGTextNode {
        transform: relative,
        text_content: combined_text,
        fill,
        stroke,
        chunks,
        bounds,
    })
}

/// Resolve a usvg Font to a concrete family name.
///
/// Prefers named families; falls back to the embedded default font.
fn resolve_font_family(font: &usvg::Font) -> String {
    font.families()
        .iter()
        .find_map(|f| match f {
            usvg::FontFamily::Named(name) => Some(name.clone()),
            _ => None,
        })
        .unwrap_or_else(|| crate::fonts::embedded::geist::FAMILY.to_string())
}

fn extract_relative_transform(
    parent_world: &CGTransform2D,
    child_world: &CGTransform2D,
) -> CGTransform2D {
    let parent_affine: AffineTransform = (*parent_world).into();
    let child_affine: AffineTransform = (*child_world).into();
    let relative_affine = if let Some(parent_inv) = parent_affine.inverse() {
        parent_inv.compose(&child_affine)
    } else {
        child_affine
    };
    CGTransform2D::from(relative_affine)
}

fn normalize_skia_path(path: SkPath, bounds: &CGRect) -> (f32, f32, String) {
    if bounds.x != 0.0 || bounds.y != 0.0 {
        let path = path.make_offset((-bounds.x, -bounds.y));
        let data = path.to_svg();
        return (bounds.x, bounds.y, data);
    }
    let data = path.to_svg();
    (0.0, 0.0, data)
}
