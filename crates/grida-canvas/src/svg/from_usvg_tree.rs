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

    // #![cfg(target_os = "emscripten")]
    options.fontdb_mut().load_system_fonts();

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

fn convert_text(text: &usvg::Text, parent_world: &CGTransform2D) -> Result<IRSVGTextNode, String> {
    let abs: CGTransform2D = text.abs_transform().into();
    let relative = extract_relative_transform(parent_world, &abs);
    let bounds: CGRect = text.bounding_box().into();

    let mut combined_text = String::new();
    for chunk in text.chunks() {
        combined_text.push_str(chunk.text());
    }

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

    let mut spans = Vec::new();
    for chunk in text.chunks() {
        let offset_x = chunk.x().unwrap_or(0.0);
        let offset_y = chunk.y().unwrap_or(0.0);
        let chunk_text = chunk.text();
        for span in chunk.spans() {
            if !span.is_visible() {
                continue;
            }
            let start = span.start();
            let end = span.end().min(chunk_text.len());
            if start >= end {
                continue;
            }
            let span_slice = &chunk_text[start..end];
            if span_slice.trim().is_empty() {
                continue;
            }
            let mut span_affine: AffineTransform = relative.into();
            if offset_x != 0.0 || offset_y != 0.0 {
                span_affine.translate(offset_x, offset_y);
            }

            let span_fill = span.fill().map(SVGFillAttributes::from);
            let span_stroke = span.stroke().map(SVGStrokeAttributes::from);

            spans.push(IRSVGTextSpanNode {
                transform: CGTransform2D::from(span_affine),
                text: span_slice.to_string(),
                fill: span_fill,
                stroke: span_stroke,
                font_size: Some(span.font_size().get()),
                anchor: chunk.anchor().into(),
            });
        }
    }

    Ok(IRSVGTextNode {
        transform: relative,
        text_content: combined_text,
        fill,
        stroke,
        spans,
        bounds,
    })
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

fn normalize_skia_path(mut path: SkPath, bounds: &CGRect) -> (f32, f32, String) {
    if bounds.x != 0.0 || bounds.y != 0.0 {
        path.offset((-bounds.x, -bounds.y));
        let data = path.to_svg();
        return (bounds.x, bounds.y, data);
    }
    let data = path.to_svg();
    (0.0, 0.0, data)
}
