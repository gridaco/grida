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
    IRSVGAttributedTextChunk, IRSVGChildNode, IRSVGGroupNode, IRSVGPathNode, IRSVGTextChunk,
    IRSVGTextNode, SVGFillAttributes, SVGFontStyle, SVGStrokeAttributes,
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
        root.layout_dimensions.layout_target_width = Some(scene.svg.width);
        root.layout_dimensions.layout_target_height = Some(scene.svg.height);
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

        let gradient_bounds = Some((
            path.bounds.x,
            path.bounds.y,
            path.bounds.width,
            path.bounds.height,
        ));

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

    /// Append a `<text>` element as a Group containing one TextSpan per chunk.
    ///
    /// See `docs/wg/feat-svg/text-import.md` for the model.
    fn append_text(&mut self, text: &IRSVGTextNode, parent: Parent) -> Result<(), String> {
        if text.chunks.is_empty() {
            return self.append_text_span_node(
                text.transform.into(),
                text.text_content.as_str(),
                text.fill.as_ref(),
                text.stroke.as_ref(),
                None,
                SVGTextAnchor::Start,
                parent,
            );
        }

        // Single uniform chunk → no group wrapper needed.
        if text.chunks.len() == 1 {
            if let IRSVGTextChunk::Uniform(ref span) = text.chunks[0] {
                return self.append_text_span_node(
                    span.transform.into(),
                    span.text.as_str(),
                    span.fill.as_ref().or(text.fill.as_ref()),
                    span.stroke.as_ref().or(text.stroke.as_ref()),
                    span.font_size,
                    span.anchor,
                    parent,
                );
            }
        }

        // Multiple chunks (or single attributed) → Group wrapper.
        let mut group = self.factory.create_group_node();
        group.transform = Some(text.transform.into());
        let group_id = self.graph.append_child(Node::Group(group), parent);
        let group_parent = Parent::NodeId(group_id);

        for chunk in &text.chunks {
            let (chunk_transform, _anchor) = match chunk {
                IRSVGTextChunk::Uniform(s) => (s.transform, s.anchor),
                IRSVGTextChunk::Attributed(a) => (a.transform, a.anchor),
            };
            let text_affine: AffineTransform = text.transform.into();
            let chunk_affine: AffineTransform = chunk_transform.into();
            let local = if let Some(inv) = text_affine.inverse() {
                inv.compose(&chunk_affine)
            } else {
                chunk_affine
            };

            match chunk {
                IRSVGTextChunk::Uniform(span) => {
                    self.append_text_span_node(
                        local,
                        span.text.as_str(),
                        span.fill.as_ref().or(text.fill.as_ref()),
                        span.stroke.as_ref().or(text.stroke.as_ref()),
                        span.font_size,
                        span.anchor,
                        group_parent.clone(),
                    )?;
                }
                IRSVGTextChunk::Attributed(attr_chunk) => {
                    self.append_attributed_text_node(
                        local,
                        attr_chunk,
                        text.fill.as_ref(),
                        text.stroke.as_ref(),
                        group_parent.clone(),
                    )?;
                }
            }
        }
        Ok(())
    }

    fn append_text_span_node(
        &mut self,
        transform: AffineTransform,
        text: &str,
        fill: Option<&SVGFillAttributes>,
        stroke: Option<&SVGStrokeAttributes>,
        font_size: Option<f32>,
        anchor: SVGTextAnchor,
        parent: Parent,
    ) -> Result<(), String> {
        if text.trim().is_empty() {
            return Ok(());
        }

        let mut node = self.factory.create_text_span_node();
        let mut adjusted_transform = transform;
        // NOTE: text-anchor shift is intentionally skipped here. We don't
        // have per-span width from usvg, and using the whole <text> bounds
        // would shift every chunk by the wrong amount. The chunk's x/y
        // from usvg already accounts for the anchor via resolved positions.
        let _ = anchor;
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

    fn append_attributed_text_node(
        &mut self,
        transform: AffineTransform,
        chunk: &IRSVGAttributedTextChunk,
        fallback_fill: Option<&SVGFillAttributes>,
        fallback_stroke: Option<&SVGStrokeAttributes>,
        parent: Parent,
    ) -> Result<(), String> {
        let text = chunk.text.as_str();
        if text.trim().is_empty() {
            return Ok(());
        }

        // Use the first run's font size for baseline adjustment.
        let first_font_size = chunk.runs.first().map(|r| r.font_size).unwrap_or(16.0);
        let mut adjusted_transform = transform;
        // FIXME(svg text): baseline -> top-left conversion needs proper font metrics.
        adjusted_transform.translate(0.0, -first_font_size);

        let default_style = TextStyleRec::from_font(
            chunk
                .runs
                .first()
                .map(|r| r.font_family.as_str())
                .unwrap_or("Geist"),
            first_font_size,
        );

        let runs: Vec<StyledTextRun> = chunk
            .runs
            .iter()
            .map(|run| {
                let mut style = TextStyleRec::from_font(&run.font_family, run.font_size);
                style.font_weight = FontWeight(run.font_weight as u32);
                style.font_style_italic =
                    matches!(run.font_style, SVGFontStyle::Italic | SVGFontStyle::Oblique);
                if run.letter_spacing != 0.0 {
                    style.letter_spacing = TextLetterSpacing::Fixed(run.letter_spacing);
                }
                if run.word_spacing != 0.0 {
                    style.word_spacing = TextWordSpacing::Fixed(run.word_spacing);
                }

                let fills = run
                    .fill
                    .as_ref()
                    .or(fallback_fill)
                    .map(|f| vec![f.into_paint_with_opacity(None)]);

                let stroke_ref = run.stroke.as_ref().or(fallback_stroke);
                let strokes =
                    stroke_ref.map(|s| Paints::new(vec![s.into_paint_with_opacity(None)]));
                let stroke_width = stroke_ref.map(|s| s.stroke_width);

                StyledTextRun {
                    start: run.start as u32,
                    end: run.end as u32,
                    style,
                    fills,
                    strokes,
                    stroke_width,
                    stroke_align: None,
                }
            })
            .collect();

        let mut attributed_string = AttributedString::from_runs(text.to_string(), runs);
        attributed_string.merge_adjacent_runs();

        let node = AttributedTextNodeRec {
            active: true,
            transform: adjusted_transform,
            width: None,
            height: None,
            layout_child: Some(LayoutChildStyle {
                layout_grow: 0.0,
                layout_positioning: LayoutPositioning::Absolute,
            }),
            attributed_string,
            default_style,
            text_align: TextAlign::Left,
            text_align_vertical: TextAlignVertical::Top,
            max_lines: None,
            ellipsis: None,
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Center,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            effects: LayerEffects::default(),
        };

        self.graph.append_child(Node::AttributedText(node), parent);
        Ok(())
    }
}
