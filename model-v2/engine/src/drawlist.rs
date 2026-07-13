//! ENG-2.1 · the display list — a pure, diffable projection of resolved
//! geometry and authored paint intent. The engine frame boundary supplies the
//! exact fonts accompanying shaped text. [`build_glyphless_unchecked`] exists only for
//! deterministic lab and structural probes whose resolver deliberately emits
//! no glyphs. Neither path performs I/O or raster work. The camera is not baked
//! in, so one drawlist paints at any zoom.

use anchor_lab::math::Affine;
use anchor_lab::model::{
    CornerSmoothing, Document, NodeId, Paints, Payload, RectangularCornerRadius, ShapeDesc, Stroke,
};
use anchor_lab::path::ResolvedPathArtifact;
use anchor_lab::properties::ValueView;
use anchor_lab::resolve::Resolved;
use anchor_lab::text_layout::TextLayout;
use std::sync::Arc;

use crate::text_layout::TextFontRegistry;

/// One paint primitive, carrying the world transform copied verbatim from
/// `resolved.world_of(node)` (never recomputed — pixel identity depends
/// on it) and the geometry in the node's own local space.
#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub node: NodeId,
    pub world: Affine,
    pub kind: ItemKind,
}

/// Paint ownership for one resolved text layout.
///
/// Shaping ignores paint values, but attributed run boundaries remain indexed
/// in the resolved glyph runs. An outer `None` denotes uniform text, while an
/// attributed entry of `None` inherits node paints and `Some([])` means
/// explicit no ink. Keeping those states distinct lets invalid attributed run
/// ownership fail closed instead of being mistaken for uniform-text fallback.
#[derive(Debug, Clone, PartialEq)]
pub struct TextPaints {
    pub node: Paints,
    pub runs: Option<Vec<Option<Paints>>>,
}

impl TextPaints {
    /// Resolve paints only when glyph ownership matches the authored topology.
    pub fn for_source_run(&self, source_run: Option<usize>) -> Option<&Paints> {
        match (&self.runs, source_run) {
            (None, None) => Some(&self.node),
            (Some(runs), Some(index)) => runs
                .get(index)
                .map(|paints| paints.as_ref().unwrap_or(&self.node)),
            _ => None,
        }
    }

    fn has_visible_ink(&self) -> bool {
        match &self.runs {
            None => !self.node.is_empty(),
            Some(runs) => runs
                .iter()
                .any(|paints| !paints.as_ref().unwrap_or(&self.node).is_empty()),
        }
    }
}

/// The display-list vocabulary. Scope commands are explicit so subtree opacity
/// is composited as a group and a container's content clip can end before its
/// own strokes are painted. Geometry and paint coordinates stay in node-local
/// space; the executor applies `world` and the host view.
#[derive(Debug, Clone, PartialEq)]
pub enum ItemKind {
    BeginOpacity {
        opacity: f32,
    },
    EndOpacity,
    BeginClipRect {
        w: f32,
        h: f32,
        corner_radius: RectangularCornerRadius,
        corner_smoothing: CornerSmoothing,
    },
    EndClip,
    RectFill {
        w: f32,
        h: f32,
        corner_radius: RectangularCornerRadius,
        corner_smoothing: CornerSmoothing,
        paints: Paints,
    },
    OvalFill {
        w: f32,
        h: f32,
        paints: Paints,
    },
    PathFill {
        w: f32,
        h: f32,
        path: Arc<ResolvedPathArtifact>,
        paints: Paints,
    },
    TextFill {
        layout: Arc<TextLayout>,
        paints: TextPaints,
        paint_w: f32,
        paint_h: f32,
    },
    RectStroke {
        w: f32,
        h: f32,
        corner_radius: RectangularCornerRadius,
        corner_smoothing: CornerSmoothing,
        stroke: Stroke,
    },
    OvalStroke {
        w: f32,
        h: f32,
        stroke: Stroke,
    },
    LineStroke {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        paint_w: f32,
        paint_h: f32,
        stroke: Stroke,
    },
    PathStroke {
        w: f32,
        h: f32,
        path: Arc<ResolvedPathArtifact>,
        stroke: Stroke,
    },
    TextStroke {
        layout: Arc<TextLayout>,
        paint_w: f32,
        paint_h: f32,
        stroke: Stroke,
    },
}

/// The whole scene as an ordered primitive stream, in paint order
/// (node fill, clipped children, then authored strokes). Diffable by `==`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DrawList {
    pub items: Vec<Item>,
    /// Exact fonts referenced by glyph-bearing text items. Kept opaque outside
    /// the engine: display-list consumers replay keys only through this list.
    text_fonts: Option<Arc<TextFontRegistry>>,
}

impl DrawList {
    pub(crate) fn text_fonts(&self) -> &TextFontRegistry {
        self.text_fonts
            .as_deref()
            .expect("glyph-bearing drawlist has no text font registry")
    }

    pub(crate) fn same_text_fonts(&self, other: &Self) -> bool {
        self.text_fonts == other.text_fonts
    }
}

/// Materialize only paints that can contribute pixels. The authored stack is
/// already bottom-to-top; filtering preserves that relative order.
fn visible_paints(paints: &Paints) -> Paints {
    Paints::new(paints.iter().filter(|paint| paint.visible()).cloned())
}

fn visible_stroke(
    stroke: &Stroke,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
) -> Option<Stroke> {
    if !stroke.renderable_for(payload, corner_smoothing) {
        return None;
    }
    let paints = visible_paints(&stroke.paints);
    if paints.is_empty() {
        return None;
    }
    let mut stroke = stroke.clone();
    stroke.paints = paints;
    Some(stroke)
}

fn push(items: &mut Vec<Item>, node: NodeId, world: Affine, kind: ItemKind) {
    items.push(Item { node, world, kind });
}

fn materialize_text_paints(payload: &Payload, node_fills: &Paints) -> TextPaints {
    let text = payload
        .as_text()
        .expect("text paint materialization requires text");
    let runs = text.runs.map(|runs| {
        runs.iter()
            .map(|run| run.fills.as_ref().map(visible_paints))
            .collect()
    });
    TextPaints {
        node: visible_paints(node_fills),
        runs,
    }
}

/// Project a glyphless lab-resolved tier into an ordered primitive stream.
///
/// Real rendering must enter through [`crate::frame::resolve_and_build`] or
/// [`crate::frame::render`]. Traversal is exactly the spike painter's
/// (`paint_node`): a hidden subtree (`world_opt == None`) prunes; the root and
/// derived kinds (group/lens) emit no ink but their children are still visited.
/// Node opacity scopes fill, descendants, and strokes. A frame's clip scopes
/// descendants only. Geometry is local-space, positioned by `world` — copied
/// verbatim, never recomputed. The camera is applied later by the executor.
pub fn build_glyphless_unchecked(doc: &Document, resolved: &Resolved) -> DrawList {
    build_inner(doc, resolved, None)
}

/// Project the exact authored-plus-effective-value view that produced
/// `resolved`. This is the value-aware structural probe counterpart to
/// [`crate::frame::resolve_and_build_view`].
pub fn build_glyphless_view_unchecked(view: &ValueView<'_>, resolved: &Resolved) -> DrawList {
    build_inner(view, resolved, None)
}

/// Project a resolved tier produced by the engine text oracle, retaining the
/// exact registry that minted every [`anchor_lab::text_layout::TextFontKey`].
pub(crate) fn build_with_text_fonts(
    doc: &Document,
    resolved: &Resolved,
    text_fonts: Arc<TextFontRegistry>,
) -> DrawList {
    build_inner(doc, resolved, Some(text_fonts))
}

/// Effective-value counterpart to [`build_with_text_fonts`]. Both paths use
/// one monomorphized projection below; the authored path reads the document
/// directly instead of paying a dynamic registry lookup at every paint item.
pub(crate) fn build_with_text_fonts_view(
    view: &ValueView<'_>,
    resolved: &Resolved,
    text_fonts: Arc<TextFontRegistry>,
) -> DrawList {
    build_inner(view, resolved, Some(text_fonts))
}

/// The drawlist's complete authored/effective read surface. Keeping this
/// private makes the optimization non-semantic: there is one projection
/// algorithm and no second public paint contract.
trait DrawValues {
    fn document(&self) -> &Document;
    fn opacity(&self, id: NodeId) -> f32;
    fn clips_content(&self, id: NodeId) -> bool;
    fn corner_radius(&self, id: NodeId) -> RectangularCornerRadius;
    fn corner_smoothing(&self, id: NodeId) -> CornerSmoothing;
    fn fills(&self, id: NodeId) -> &Paints;
    fn strokes(&self, id: NodeId) -> &[Stroke];
}

impl DrawValues for Document {
    #[inline]
    fn document(&self) -> &Document {
        self
    }

    #[inline]
    fn opacity(&self, id: NodeId) -> f32 {
        self.get(id).header.opacity
    }

    #[inline]
    fn clips_content(&self, id: NodeId) -> bool {
        match self.get(id).payload {
            Payload::Frame { clips_content, .. } => clips_content,
            _ => unreachable!("drawlist requests clips-content only for frames"),
        }
    }

    #[inline]
    fn corner_radius(&self, id: NodeId) -> RectangularCornerRadius {
        self.get(id).corner_radius
    }

    #[inline]
    fn corner_smoothing(&self, id: NodeId) -> CornerSmoothing {
        self.get(id).corner_smoothing
    }

    #[inline]
    fn fills(&self, id: NodeId) -> &Paints {
        &self.get(id).fills
    }

    #[inline]
    fn strokes(&self, id: NodeId) -> &[Stroke] {
        &self.get(id).strokes
    }
}

impl DrawValues for ValueView<'_> {
    #[inline]
    fn document(&self) -> &Document {
        ValueView::document(self)
    }

    #[inline]
    fn opacity(&self, id: NodeId) -> f32 {
        ValueView::opacity(self, id)
    }

    #[inline]
    fn clips_content(&self, id: NodeId) -> bool {
        ValueView::clips_content(self, id)
    }

    #[inline]
    fn corner_radius(&self, id: NodeId) -> RectangularCornerRadius {
        ValueView::corner_radius(self, id)
    }

    #[inline]
    fn corner_smoothing(&self, id: NodeId) -> CornerSmoothing {
        ValueView::corner_smoothing(self, id)
    }

    #[inline]
    fn fills(&self, id: NodeId) -> &Paints {
        ValueView::fills(self, id)
    }

    #[inline]
    fn strokes(&self, id: NodeId) -> &[Stroke] {
        ValueView::strokes(self, id)
    }
}

fn build_inner<V: DrawValues + ?Sized>(
    values: &V,
    resolved: &Resolved,
    text_fonts: Option<Arc<TextFontRegistry>>,
) -> DrawList {
    let doc = values.document();
    let mut items = Vec::new();
    emit(values, resolved, doc.root, &mut items);
    let has_glyphs = items.iter().any(|item| match &item.kind {
        ItemKind::TextFill { layout, .. } | ItemKind::TextStroke { layout, .. } => {
            !layout.glyph_runs.is_empty()
        }
        _ => false,
    });
    assert!(
        !has_glyphs || text_fonts.is_some(),
        "glyph-bearing resolved text requires its exact font registry"
    );
    DrawList {
        items,
        text_fonts: if has_glyphs { text_fonts } else { None },
    }
}

fn emit<V: DrawValues + ?Sized>(
    values: &V,
    resolved: &Resolved,
    id: NodeId,
    items: &mut Vec<Item>,
) {
    let Some(world) = resolved.world_opt(id) else {
        return; // hidden subtree — pruned, children not visited
    };
    let doc = values.document();
    let node = doc.get(id);
    let b = resolved.box_of(id);
    let text_layout = node
        .payload
        .as_text()
        .map(|_| Arc::clone(resolved.text_layout_of(id)));
    let text_paints = node
        .payload
        .as_text()
        .map(|_| materialize_text_paints(&node.payload, values.fills(id)));

    let opacity = values.opacity(id);
    let opacity_scope = opacity != 1.0;
    if opacity_scope {
        push(items, id, world, ItemKind::BeginOpacity { opacity });
    }

    // Root is the backdrop; derived kinds have no ink. Both still recurse and
    // may establish an opacity scope around their descendants.
    if id != doc.root && !node.payload.box_is_derived() {
        match &node.payload {
            Payload::Frame { .. } => {
                let paints = visible_paints(values.fills(id));
                if !paints.is_empty() {
                    let corner_radius = values.corner_radius(id);
                    let corner_smoothing = values.corner_smoothing(id);
                    push(
                        items,
                        id,
                        world,
                        ItemKind::RectFill {
                            w: b.w,
                            h: b.h,
                            corner_radius,
                            corner_smoothing,
                            paints,
                        },
                    );
                }
            }
            // Lines have no fill channel, and `Fills` is intentionally
            // inapplicable to them in the closed registry. Do not perform a
            // speculative fill read before selecting the shape variant.
            Payload::Shape {
                desc: ShapeDesc::Line,
            } => {}
            Payload::Shape { desc } => {
                let paints = visible_paints(values.fills(id));
                if !paints.is_empty() {
                    let kind = match desc {
                        ShapeDesc::Rect => Some(ItemKind::RectFill {
                            w: b.w,
                            h: b.h,
                            corner_radius: values.corner_radius(id),
                            corner_smoothing: values.corner_smoothing(id),
                            paints,
                        }),
                        ShapeDesc::Ellipse => Some(ItemKind::OvalFill {
                            w: b.w,
                            h: b.h,
                            paints,
                        }),
                        ShapeDesc::Path(_) => {
                            resolved
                                .resolved_path_opt(id)
                                .map(|path| ItemKind::PathFill {
                                    w: b.w,
                                    h: b.h,
                                    path: Arc::clone(path),
                                    paints,
                                })
                        }
                        ShapeDesc::Line => unreachable!("line matched before fill lookup"),
                    };
                    if let Some(kind) = kind {
                        push(items, id, world, kind);
                    }
                }
            }
            Payload::Text { .. } | Payload::AttributedText { .. } => {
                let paints = text_paints
                    .as_ref()
                    .expect("text fill has a paint fallback table");
                if paints.has_visible_ink() {
                    push(
                        items,
                        id,
                        world,
                        ItemKind::TextFill {
                            layout: text_layout
                                .as_ref()
                                .expect("text fill has resolved layout")
                                .clone(),
                            paints: paints.clone(),
                            paint_w: b.w,
                            paint_h: b.h,
                        },
                    );
                }
            }
            // Excluded by the box_is_derived guard above.
            Payload::Group | Payload::Lens { .. } => unreachable!(),
        }
    }

    let clip_scope = matches!(node.payload, Payload::Frame { .. }) && values.clips_content(id);
    if clip_scope {
        let corner_radius = values.corner_radius(id);
        let corner_smoothing = values.corner_smoothing(id);
        push(
            items,
            id,
            world,
            ItemKind::BeginClipRect {
                w: b.w,
                h: b.h,
                corner_radius,
                corner_smoothing,
            },
        );
    }

    for &c in &node.children {
        emit(values, resolved, c, items);
    }

    if clip_scope {
        push(items, id, world, ItemKind::EndClip);
    }

    if id != doc.root && !node.payload.box_is_derived() {
        let corner_smoothing = match &node.payload {
            Payload::Frame { .. }
            | Payload::Shape {
                desc: ShapeDesc::Rect,
            } => values.corner_smoothing(id),
            _ => CornerSmoothing::default(),
        };
        for stroke in values
            .strokes(id)
            .iter()
            .filter_map(|stroke| visible_stroke(stroke, &node.payload, corner_smoothing))
        {
            if matches!(
                &node.payload,
                Payload::Shape {
                    desc: ShapeDesc::Path(_)
                }
            ) && resolved.resolved_path_opt(id).is_none()
            {
                continue;
            }
            let kind = match &node.payload {
                Payload::Frame { .. }
                | Payload::Shape {
                    desc: ShapeDesc::Rect,
                } => ItemKind::RectStroke {
                    w: b.w,
                    h: b.h,
                    corner_radius: values.corner_radius(id),
                    corner_smoothing,
                    stroke,
                },
                Payload::Shape {
                    desc: ShapeDesc::Ellipse,
                } => ItemKind::OvalStroke {
                    w: b.w,
                    h: b.h,
                    stroke,
                },
                Payload::Shape {
                    desc: ShapeDesc::Line,
                } => ItemKind::LineStroke {
                    x1: 0.0,
                    y1: 0.0,
                    x2: b.w,
                    y2: 0.0,
                    paint_w: b.w,
                    paint_h: b.h,
                    stroke,
                },
                Payload::Shape {
                    desc: ShapeDesc::Path(_),
                } => ItemKind::PathStroke {
                    w: b.w,
                    h: b.h,
                    path: Arc::clone(resolved.resolved_path_of(id)),
                    stroke,
                },
                Payload::Text { .. } | Payload::AttributedText { .. } => ItemKind::TextStroke {
                    layout: text_layout
                        .as_ref()
                        .expect("visible text stroke has resolved layout")
                        .clone(),
                    paint_w: b.w,
                    paint_h: b.h,
                    stroke,
                },
                Payload::Group | Payload::Lens { .. } => unreachable!(),
            };
            push(items, id, world, kind);
        }
    }

    if opacity_scope {
        push(items, id, world, ItemKind::EndOpacity);
    }
}

#[cfg(test)]
mod text_paint_tests {
    use super::TextPaints;
    use anchor_lab::model::{Color, Paints};

    #[test]
    fn uniform_text_uses_node_paints_only_for_uniform_ownership() {
        let node = Paints::solid(Color::BLACK);
        let paints = TextPaints {
            node: node.clone(),
            runs: None,
        };

        assert_eq!(paints.for_source_run(None), Some(&node));
        assert_eq!(paints.for_source_run(Some(0)), None);
    }

    #[test]
    fn attributed_text_fails_closed_without_valid_run_ownership() {
        let node = Paints::solid(Color::BLACK);
        let override_paints = Paints::solid("#FF0000".into());
        let paints = TextPaints {
            node: node.clone(),
            runs: Some(vec![
                None,
                Some(override_paints.clone()),
                Some(Paints::default()),
            ]),
        };

        assert_eq!(paints.for_source_run(Some(0)), Some(&node));
        assert_eq!(paints.for_source_run(Some(1)), Some(&override_paints));
        assert!(paints
            .for_source_run(Some(2))
            .expect("valid explicit-empty run")
            .is_empty());
        assert_eq!(paints.for_source_run(None), None);
        assert_eq!(paints.for_source_run(Some(3)), None);
    }
}
