// svg => grida importer
// Known limitations (kept in sync with ongoing SVG work):
// - Element coverage: only <svg>, <g>, <path>, <image>, <text> are reconstructed today.
// - Paint servers: gradients and patterns are parsed but mapped to flat paints; per-stop opacity, spread, and patterns are not preserved.
// - Masks, clip-paths, filters, and blend modes on groups are not wired.
// - Text handling collapses chunks into one span; tspans, decorations, text-on-path, and advanced typography are ignored.
// - Image resources rely on external resolution; embedded data URIs are passed through as opaque references.
// - Layout: every node is imported as absolutely positioned; flex/grid alignment is currently out of scope.
// - usvg normalizes many shapes to paths; model mismatches should be revisited if more shape fidelity is required.
//   Reference: https://github.com/linebender/resvg/issues/974

use super::*;
use crate::cg::prelude::*;
use crate::node::factory::NodeFactory;
use crate::node::scene_graph::*;
use crate::node::schema::*;
use crate::vectornetwork::*;
use math2::box_fit::BoxFit;
use skia_safe::Path as SkPath;
use usvg;
use usvg::tiny_skia_path::{Path as TinyPath, PathSegment};

pub fn from_svg_str(svg: &str) -> Result<SceneGraph, String> {
    let mut options = usvg::Options::default();
    options.fontdb_mut().load_system_fonts();
    let tree = usvg::Tree::from_str(svg, &options).map_err(|err| err.to_string())?;

    let handler = SVGTreeHandler::new_from_tree(tree);
    Ok(handler.into_scene_graph())
}

struct SVGTreeHandler {
    tree: usvg::Tree,
    graph: SceneGraph,
    factory: NodeFactory,
}

impl SVGTreeHandler {
    pub(crate) fn new_from_tree(tree: usvg::Tree) -> Self {
        Self {
            tree,
            graph: SceneGraph::new(),
            factory: NodeFactory::new(),
        }
    }

    pub(crate) fn into_scene_graph(mut self) -> SceneGraph {
        let root_group = self.tree.root().clone();
        let size = self.tree.size();
        self.cvt_group(
            &root_group,
            Parent::Root,
            Some((size.width(), size.height())),
        );
        self.graph
    }

    fn cvt_group(
        &mut self,
        svg_group: &usvg::Group,
        parent: Parent,
        explicit_size: Option<(f32, f32)>,
    ) -> NodeId {
        let mut container = self.factory.create_container_node();
        container.fills = Paints::default();
        container.strokes = Paints::default();

        if let Some((width, height)) = explicit_size {
            container.layout_dimensions.width = Some(width);
            container.layout_dimensions.height = Some(height);
        } else {
            let bounds = svg_group.abs_bounding_box();
            container.layout_dimensions.width = Some(bounds.width());
            container.layout_dimensions.height = Some(bounds.height());
        }

        container.layout_child = Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Absolute,
        });

        // TODO: map further group-level attributes (name, opacity, blends, masks, etc.).
        let container_id = self.graph.append_child(Node::Container(container), parent);

        for child in svg_group.children() {
            self.cvt_node(child, Parent::NodeId(container_id.clone()));
        }

        container_id
    }

    fn cvt_node(&mut self, node: &usvg::Node, parent: Parent) {
        match node {
            usvg::Node::Group(group) => {
                self.cvt_group(group, parent, None);
            }
            usvg::Node::Path(path) => {
                self.cvt_path(path, parent);
            }
            usvg::Node::Image(image) => {
                self.cvt_image(image, parent);
            }
            usvg::Node::Text(text) => {
                self.cvt_text(text, parent);
            }
        }
    }

    fn cvt_path(&mut self, path: &usvg::Path, parent: Parent) {
        let vector_geom = vector_network_from_usvg_path(path);
        let network = vector_geom.network;
        let fill_paints = convert_fill_paints(path.fill());
        let stroke_props = convert_stroke(path.stroke());
        let fill_opacity = path.fill().map(|fill| fill.opacity().get()).unwrap_or(1.0);

        let mut transform = map_transform(path.abs_transform());

        if vector_geom.offset.0 != 0.0 || vector_geom.offset.1 != 0.0 {
            transform.translate(vector_geom.offset.0, vector_geom.offset.1);
        }

        let vector = VectorNodeRec {
            active: path.is_visible(),
            opacity: fill_opacity,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform,
            network,
            corner_radius: 0.0,
            fills: fill_paints,
            strokes: Paints::new([stroke_props.paint.clone()]),
            stroke_width: stroke_props.stroke_width,
            stroke_width_profile: None,
            stroke_align: StrokeAlign::Center,
            stroke_cap: stroke_props.stroke_linecap,
            stroke_join: stroke_props.stroke_linejoin,
            stroke_miter_limit: stroke_props.stroke_miterlimit,
            stroke_dash_array: stroke_props.stroke_dasharray,
            layout_child: Some(LayoutChildStyle {
                layout_grow: 0.0,
                layout_positioning: LayoutPositioning::Absolute,
            }),
        };

        self.graph.append_child(Node::Vector(vector), parent);
    }

    fn cvt_image(&mut self, image: &usvg::Image, parent: Parent) {
        let bounds = image.abs_bounding_box();
        let size = Size {
            width: bounds.width(),
            height: bounds.height(),
        };

        let resource_ref = build_image_resource_ref(image);
        let image_paint = ImagePaint {
            active: image.is_visible(),
            image: resource_ref.clone(),
            quarter_turns: 0,
            alignement: Alignment::CENTER,
            fit: ImagePaintFit::Fit(BoxFit::Contain),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            filters: ImageFilters::default(),
        };

        let mut node = self.factory.create_image_node();
        node.active = image.is_visible();
        node.transform = map_transform(image.abs_transform());
        node.size = size;
        node.corner_radius = RectangularCornerRadius::default();
        node.corner_smoothing = CornerSmoothing::default();
        node.fill = image_paint;
        node.strokes = Paints::default();
        node.stroke_style = StrokeStyle::default();
        node.stroke_width = StrokeWidth::default();
        node.image = resource_ref;
        node.layout_child = Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Absolute,
        });

        self.graph.append_child(Node::Image(node), parent);
    }

    fn cvt_text(&mut self, text: &usvg::Text, parent: Parent) {
        let bounds = text.abs_bounding_box();
        let chunks = text.chunks();
        if chunks.is_empty() {
            self.append_placeholder_node(
                parent,
                format!("text:{} (no chunks)", text.id()),
                Some((bounds.width(), bounds.height())),
                text.abs_transform(),
            );
            return;
        }

        let primary_chunk = &chunks[0];
        let primary_span = primary_chunk
            .spans()
            .iter()
            .find(|span| span.is_visible())
            .or_else(|| primary_chunk.spans().first());

        // Combine the absolute transform with the chunk-local offsets.
        let mut transform = map_transform(text.abs_transform());
        if let Some(x) = primary_chunk.x() {
            transform.translate(x, 0.0);
        }
        if let Some(y) = primary_chunk.y() {
            transform.translate(0.0, y);
        }

        let mut text_content = String::new();
        for chunk in chunks {
            text_content.push_str(chunk.text());
        }

        if text_content.trim().is_empty() {
            self.append_placeholder_node(
                parent,
                format!("text:{} (empty)", text.id()),
                Some((bounds.width(), bounds.height())),
                text.abs_transform(),
            );
            return;
        }

        let (fills, fill_opacity) = convert_text_fills(primary_span);
        let (strokes, stroke_width) = convert_text_strokes(primary_span);
        let text_style = primary_span
            .map(text_style_from_usvg_span)
            .unwrap_or_else(default_text_style);

        let node = TextSpanNodeRec {
            active: primary_span.map(|span| span.is_visible()).unwrap_or(true),
            transform,
            width: normalize_dimension(bounds.width()),
            layout_child: Some(LayoutChildStyle {
                layout_grow: 0.0,
                layout_positioning: LayoutPositioning::Absolute,
            }),
            height: normalize_dimension(bounds.height()),
            text: text_content,
            text_style,
            text_align: map_text_anchor(primary_chunk.anchor()),
            text_align_vertical: TextAlignVertical::Top,
            max_lines: None,
            ellipsis: None,
            fills,
            strokes,
            stroke_width,
            stroke_align: StrokeAlign::Center,
            opacity: fill_opacity,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
        };

        // TODO(svg-text): Support multi-chunk styling, decorations, tspans, text-on-path, paint-order,
        // stroke attributes, and advanced typography attributes.
        self.graph.append_child(Node::TextSpan(node), parent);
    }

    fn append_placeholder_node(
        &mut self,
        parent: Parent,
        label: String,
        bounds: Option<(f32, f32)>,
        transform: usvg::Transform,
    ) -> NodeId {
        let size = bounds.map_or(
            Size {
                width: 0.0,
                height: 0.0,
            },
            |(w, h)| Size {
                width: w,
                height: h,
            },
        );

        let node = Node::Error(ErrorNodeRec {
            active: true,
            transform: map_transform(transform),
            size,
            error: format!("svg::{label} not yet mapped"),
            opacity: 1.0,
        });

        self.graph.append_child(node, parent)
    }
}

fn convert_fill_paints(fill: Option<&usvg::Fill>) -> Paints {
    match fill {
        Some(fill) => {
            let paint = Paint::from(fill.paint().clone());
            Paints::new([paint])
        }
        None => Paints::default(),
    }
}

fn convert_stroke(stroke: Option<&usvg::Stroke>) -> SVGStrokeAttributes {
    if let Some(stroke) = stroke {
        SVGStrokeAttributes::from(stroke.clone())
    } else {
        SVGStrokeAttributes::default()
    }
}

struct ExtractedVectorNetwork {
    network: VectorNetwork,
    offset: (f32, f32),
}

fn vector_network_from_usvg_path(path: &usvg::Path) -> ExtractedVectorNetwork {
    let tiny_path = path.data();
    let sk_path = tiny_path_to_skia_path(tiny_path);
    let mut network = VectorNetwork::from(&sk_path);

    let bounds = network.bounds();
    let mut offset = (0.0_f32, 0.0_f32);
    if bounds.x.is_finite() && bounds.y.is_finite() && (bounds.x != 0.0 || bounds.y != 0.0) {
        offset = (bounds.x, bounds.y);
        for vertex in &mut network.vertices {
            vertex.0 -= bounds.x;
            vertex.1 -= bounds.y;
        }
    }

    ExtractedVectorNetwork { network, offset }
}

fn tiny_path_to_skia_path(path: &TinyPath) -> SkPath {
    let mut sk_path = SkPath::new();
    for segment in path.segments() {
        match segment {
            PathSegment::MoveTo(p) => {
                sk_path.move_to((p.x, p.y));
            }
            PathSegment::LineTo(p) => {
                sk_path.line_to((p.x, p.y));
            }
            PathSegment::QuadTo(p0, p1) => {
                sk_path.quad_to((p0.x, p0.y), (p1.x, p1.y));
            }
            PathSegment::CubicTo(p0, p1, p2) => {
                sk_path.cubic_to((p0.x, p0.y), (p1.x, p1.y), (p2.x, p2.y));
            }
            PathSegment::Close => {
                sk_path.close();
            }
        }
    }
    sk_path
}

fn build_image_resource_ref(image: &usvg::Image) -> ResourceRef {
    if !image.id().is_empty() {
        ResourceRef::RID(format!("usvg:image/{}", image.id()))
    } else {
        ResourceRef::RID(format!("usvg:image/{:p}", image))
    }
}

fn convert_text_fills(span: Option<&usvg::TextSpan>) -> (Paints, f32) {
    if let Some(span) = span {
        if let Some(fill) = span.fill() {
            let paint = Paint::from(fill.paint().clone());
            return (Paints::new([paint]), fill.opacity().get());
        }
    }

    (Paints::default(), 1.0)
}

fn convert_text_strokes(span: Option<&usvg::TextSpan>) -> (Paints, f32) {
    if let Some(span) = span {
        if let Some(stroke) = span.stroke() {
            let attributes = SVGStrokeAttributes::from(stroke.clone());
            return (
                Paints::new([attributes.paint.clone()]),
                attributes.stroke_width,
            );
        }
    }

    (Paints::default(), 0.0)
}

fn normalize_dimension(value: f32) -> Option<f32> {
    if value.is_finite() && value > 0.0 {
        Some(value)
    } else {
        None
    }
}

fn map_text_anchor(anchor: usvg::TextAnchor) -> TextAlign {
    match anchor {
        usvg::TextAnchor::Start => TextAlign::Left,
        usvg::TextAnchor::Middle => TextAlign::Center,
        usvg::TextAnchor::End => TextAlign::Right,
    }
}

fn text_style_from_usvg_span(span: &usvg::TextSpan) -> TextStyleRec {
    let font = span.font();
    let family = font
        .families()
        .first()
        .map(|family| family.to_string())
        .unwrap_or_default();
    let mut style = TextStyleRec::from_font(family.as_str(), span.font_size().get());
    style.font_family = family;
    let weight = font.weight().clamp(1, 1000) as u32;
    style.font_weight = FontWeight::new(weight);
    style.font_style_italic = matches!(
        font.style(),
        usvg::FontStyle::Italic | usvg::FontStyle::Oblique
    );
    style.font_kerning = span.apply_kerning();
    style.letter_spacing = TextLetterSpacing::Fixed(span.letter_spacing());
    style.word_spacing = TextWordSpacing::Fixed(span.word_spacing());
    // TODO(svg-text): baseline shift, small caps, text-length, text-decoration, font-variation.
    style
}

fn default_text_style() -> TextStyleRec {
    TextStyleRec::from_font("sans-serif", 16.0)
}
