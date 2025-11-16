// svg => grida importer
// Known limitations (kept in sync with ongoing SVG work):
// - Element coverage: only <svg>, <g>, <path>, <text> (basic) are reconstructed today.
// - Paint servers: gradients and patterns are parsed but mapped to flat paints; per-stop opacity, spread, and patterns are not preserved.
// - Masks, clip-paths, filters, and blend modes on groups are not wired.
// - Text/image nodes are currently dropped during IR conversion.
// - Layout: every node is imported as absolutely positioned; flex/grid alignment is currently out of scope.
// - usvg normalizes many shapes to paths; model mismatches should be revisited if more shape fidelity is required.
//   Reference: https://github.com/linebender/resvg/issues/974

use crate::cg::prelude::*;
use crate::cg::svg::{
    IRSVGChildNode, IRSVGGroupNode, IRSVGPathNode, IRSVGTextNode, SVGFillAttributes,
    SVGStrokeAttributes,
};
use crate::node::factory::NodeFactory;
use crate::node::scene_graph::{Parent, SceneGraph};
use crate::node::schema::*;
use crate::svg::from_usvg_tree::SVGPackedScene;
use math2::transform::AffineTransform;

pub fn from_svg_str(svg: &str) -> Result<SceneGraph, String> {
    let packed = SVGPackedScene::new_from_svg_str(svg)?;
    SceneBuilder::new().build(packed)
}

struct SceneBuilder {
    factory: NodeFactory,
    graph: SceneGraph,
}

impl SceneBuilder {
    fn new() -> Self {
        Self {
            factory: NodeFactory::new(),
            graph: SceneGraph::new(),
        }
    }

    fn build(mut self, scene: SVGPackedScene) -> Result<SceneGraph, String> {
        let mut root = self.factory.create_container_node();
        root.fills = Paints::default();
        root.strokes = Paints::default();
        root.layout_dimensions.width = Some(scene.svg.width);
        root.layout_dimensions.height = Some(scene.svg.height);
        let root_id = self.graph.append_child(Node::Container(root), Parent::Root);

        for child in &scene.svg.children {
            self.append_child(child, Parent::NodeId(root_id.clone()))?;
        }

        Ok(self.graph)
    }

    fn append_child(&mut self, child: &IRSVGChildNode, parent: Parent) -> Result<(), String> {
        match child {
            IRSVGChildNode::Group(group) => self.append_group(group, parent)?,
            IRSVGChildNode::Path(path) => self.append_path(path, parent)?,
            IRSVGChildNode::Text(text) => self.append_text(text, parent)?,
            IRSVGChildNode::Image(_) => {
                // Unsupported nodes are skipped during this migration step.
            }
        }

        Ok(())
    }

    fn append_group(&mut self, group: &IRSVGGroupNode, parent: Parent) -> Result<(), String> {
        let mut node = self.factory.create_group_node();
        node.opacity = group.opacity;
        node.blend_mode = LayerBlendMode::from(group.blend_mode);
        node.transform = Some(group.transform.into());

        let group_id = self.graph.append_child(Node::Group(node), parent);
        let parent = Parent::NodeId(group_id.clone());

        for child in &group.children {
            self.append_child(child, parent.clone())?;
        }

        Ok(())
    }

    fn append_path(&mut self, path: &IRSVGPathNode, parent: Parent) -> Result<(), String> {
        let mut node = self.factory.create_path_node();
        node.transform = path.transform.into();
        node.data = path.d.clone();
        node.layout_child = Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Absolute,
        });
        node.stroke_style.stroke_align = StrokeAlign::Center;

        let gradient_bounds = Some((path.bounds.width, path.bounds.height));

        if let Some(fill) = &path.fill {
            node.fills = Paints::new([fill.into_paint_with_opacity(gradient_bounds)]);
        } else {
            node.fills = Paints::default();
        }

        if let Some(stroke) = &path.stroke {
            node.strokes = Paints::new([stroke.into_paint_with_opacity(gradient_bounds)]);
            node.stroke_style.stroke_cap = stroke.stroke_linecap;
            node.stroke_style.stroke_join = stroke.stroke_linejoin;
            node.stroke_style.stroke_miter_limit = stroke.stroke_miterlimit;
            node.stroke_style.stroke_dash_array = stroke.stroke_dasharray.clone();
            node.stroke_width = SingularStrokeWidth(Some(stroke.stroke_width));
        } else {
            node.strokes = Paints::default();
            node.stroke_width = SingularStrokeWidth(None);
        }
        // SVG does not expose stroke-align; spec defaults to center.
        node.stroke_style.stroke_align = StrokeAlign::Center;

        self.graph.append_child(Node::Path(node), parent);
        Ok(())
    }

    fn append_text(&mut self, text: &IRSVGTextNode, parent: Parent) -> Result<(), String> {
        if text.spans.is_empty() {
            self.append_text_span_node(
                text.transform.into(),
                text.text_content.as_str(),
                text.fill.as_ref(),
                text.stroke.as_ref(),
                None,
                &text.bounds,
                SVGTextAnchor::Start,
                parent,
            )
        } else {
            for span in &text.spans {
                self.append_text_span_node(
                    span.transform.into(),
                    span.text.as_str(),
                    span.fill.as_ref().or(text.fill.as_ref()),
                    span.stroke.as_ref().or(text.stroke.as_ref()),
                    span.font_size,
                    &text.bounds,
                    span.anchor,
                    parent.clone(),
                )?;
            }
            Ok(())
        }
    }

    fn append_text_span_node(
        &mut self,
        transform: AffineTransform,
        text: &str,
        fill: Option<&SVGFillAttributes>,
        stroke: Option<&SVGStrokeAttributes>,
        font_size: Option<f32>,
        bounds: &IRSVGBounds,
        anchor: SVGTextAnchor,
        parent: Parent,
    ) -> Result<(), String> {
        if text.trim().is_empty() {
            return Ok(());
        }

        let mut node = self.factory.create_text_span_node();
        let mut adjusted_transform = transform;
        let mut anchor_shift = 0.0;
        match anchor {
            SVGTextAnchor::Start => {}
            SVGTextAnchor::Middle => anchor_shift = bounds.width * 0.5,
            SVGTextAnchor::End => anchor_shift = bounds.width,
        }
        adjusted_transform.translate(-anchor_shift, 0.0);
        if let Some(size) = font_size {
            // FIXME(svg text): baseline -> top-left conversion needs proper font metrics.
            adjusted_transform.translate(0.0, -size);
        }
        node.transform = adjusted_transform;
        node.text = text.to_string();
        if let Some(size) = font_size {
            node.text_style.font_size = size;
        }
        node.layout_child = Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Absolute,
        });

        if let Some(fill) = fill {
            node.fills = Paints::new([fill.into_paint_with_opacity(None)]);
        } else {
            node.fills = Paints::default();
        }

        if let Some(stroke) = stroke {
            node.strokes = Paints::new([stroke.into_paint_with_opacity(None)]);
            node.stroke_width = stroke.stroke_width;
        } else {
            node.strokes = Paints::default();
            node.stroke_width = 0.0;
        }

        self.graph.append_child(Node::TextSpan(node), parent);
        Ok(())
    }
}
