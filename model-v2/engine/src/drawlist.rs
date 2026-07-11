//! ENG-2.1 · the display list — a pure, diffable projection of the
//! resolved tier into paint primitives. `build(doc, resolved) -> DrawList`
//! (step 5) reads the resolved columns and the document's authored paint
//! intent; it never touches
//! skia. The camera is NOT baked in — the executor ([`crate::paint`])
//! takes the view transform, so the same drawlist paints at any zoom and
//! the host stays free.

use anchor_lab::math::Affine;
use anchor_lab::measure::layout_text_payload;
use anchor_lab::model::{
    CornerSmoothing, Document, NodeId, Paints, Payload, RectangularCornerRadius, ShapeDesc, Stroke,
    TextStyleRec,
};
use anchor_lab::resolve::Resolved;
use std::sync::Arc;

/// One paint primitive, carrying the world transform copied verbatim from
/// `resolved.world_of(node)` (never recomputed — pixel identity depends
/// on it) and the geometry in the node's own local space.
#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub node: NodeId,
    pub world: Affine,
    pub kind: ItemKind,
}

/// One materialized styled fragment. Its x-position is the deterministic
/// model advance, while its paints are the effective run override or node
/// fallback. Every paint still evaluates in the full resolved text box.
#[derive(Debug, Clone, PartialEq)]
pub struct TextFragment {
    pub text: String,
    pub x: f32,
    pub advance: f32,
    pub style: TextStyleRec,
    pub paints: Paints,
}

/// One materialized visual text line. The model's deterministic measurement
/// owns line and run topology; the drawlist carries that exact topology into
/// paint so wrapping and explicit empty lines cannot be reinterpreted by the
/// backend.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLine {
    pub text: String,
    pub fragments: Vec<TextFragment>,
    pub baseline_y: f32,
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
    TextFill {
        lines: Arc<[TextLine]>,
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
    TextStroke {
        lines: Arc<[TextLine]>,
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

fn materialize_text_lines(
    payload: &Payload,
    node_fills: &Paints,
    resolved_width: f32,
) -> Arc<[TextLine]> {
    let text = payload
        .as_text()
        .expect("text materialization requires text");
    layout_text_payload(text, Some(resolved_width))
        .into_iter()
        .map(|line| TextLine {
            text: line.text,
            fragments: line
                .fragments
                .into_iter()
                .map(|fragment| {
                    let authored_paints = fragment
                        .run_index
                        .and_then(|index| text.runs.and_then(|runs| runs.get(index)))
                        .and_then(|run| run.fills.as_ref())
                        .unwrap_or(node_fills);
                    TextFragment {
                        text: fragment.text,
                        x: fragment.x,
                        advance: fragment.advance,
                        style: fragment.style,
                        paints: visible_paints(authored_paints),
                    }
                })
                .collect(),
            baseline_y: line.baseline_y,
        })
        .collect::<Vec<_>>()
        .into()
}

/// Project the resolved tier into an ordered primitive stream — the pure
/// `resolve -> drawlist` stage. Traversal is exactly the spike painter's
/// (`paint_node`): a hidden subtree (`world_opt == None`) prunes; the root and
/// derived kinds (group/lens) emit no ink but their children are still visited.
/// Node opacity scopes fill, descendants, and strokes. A frame's clip scopes
/// descendants only. Geometry is local-space, positioned by `world` — copied
/// verbatim, never recomputed. The camera is applied later by the executor.
pub fn build(doc: &Document, resolved: &Resolved) -> DrawList {
    let mut items = Vec::new();
    emit(doc, resolved, doc.root, &mut items);
    DrawList { items }
}

fn emit(doc: &Document, resolved: &Resolved, id: NodeId, items: &mut Vec<Item>) {
    let Some(world) = resolved.world_opt(id) else {
        return; // hidden subtree — pruned, children not visited
    };
    let node = doc.get(id);
    let b = resolved.box_of(id);
    let text_lines = node
        .payload
        .as_text()
        .map(|_| materialize_text_lines(&node.payload, &node.fills, b.w));

    let opacity_scope = node.header.opacity != 1.0;
    if opacity_scope {
        push(
            items,
            id,
            world,
            ItemKind::BeginOpacity {
                opacity: node.header.opacity,
            },
        );
    }

    // Root is the backdrop; derived kinds have no ink. Both still recurse and
    // may establish an opacity scope around their descendants.
    if id != doc.root && !node.payload.box_is_derived() {
        match &node.payload {
            Payload::Frame { .. } => {
                let paints = visible_paints(&node.fills);
                if !paints.is_empty() {
                    push(
                        items,
                        id,
                        world,
                        ItemKind::RectFill {
                            w: b.w,
                            h: b.h,
                            corner_radius: node.corner_radius,
                            corner_smoothing: node.corner_smoothing,
                            paints,
                        },
                    );
                }
            }
            Payload::Shape { desc } => {
                let paints = visible_paints(&node.fills);
                if !paints.is_empty() {
                    let kind = match desc {
                        ShapeDesc::Rect => Some(ItemKind::RectFill {
                            w: b.w,
                            h: b.h,
                            corner_radius: node.corner_radius,
                            corner_smoothing: node.corner_smoothing,
                            paints,
                        }),
                        ShapeDesc::Ellipse => Some(ItemKind::OvalFill {
                            w: b.w,
                            h: b.h,
                            paints,
                        }),
                        // Lines have no fill channel and no implicit ink.
                        ShapeDesc::Line => None,
                    };
                    if let Some(kind) = kind {
                        push(items, id, world, kind);
                    }
                }
            }
            Payload::Text { .. } | Payload::AttributedText { .. } => {
                let lines = text_lines.as_ref().expect("text fill has line topology");
                if lines
                    .iter()
                    .flat_map(|line| &line.fragments)
                    .any(|fragment| !fragment.paints.is_empty())
                {
                    push(
                        items,
                        id,
                        world,
                        ItemKind::TextFill {
                            lines: lines.clone(),
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

    let clip_scope = matches!(
        node.payload,
        Payload::Frame {
            clips_content: true,
            ..
        }
    );
    if clip_scope {
        push(
            items,
            id,
            world,
            ItemKind::BeginClipRect {
                w: b.w,
                h: b.h,
                corner_radius: node.corner_radius,
                corner_smoothing: node.corner_smoothing,
            },
        );
    }

    for &c in &node.children {
        emit(doc, resolved, c, items);
    }

    if clip_scope {
        push(items, id, world, ItemKind::EndClip);
    }

    if id != doc.root && !node.payload.box_is_derived() {
        for stroke in node
            .strokes
            .iter()
            .filter_map(|stroke| visible_stroke(stroke, &node.payload, node.corner_smoothing))
        {
            let kind = match &node.payload {
                Payload::Frame { .. }
                | Payload::Shape {
                    desc: ShapeDesc::Rect,
                } => ItemKind::RectStroke {
                    w: b.w,
                    h: b.h,
                    corner_radius: node.corner_radius,
                    corner_smoothing: node.corner_smoothing,
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
                Payload::Text { .. } | Payload::AttributedText { .. } => ItemKind::TextStroke {
                    lines: text_lines
                        .as_ref()
                        .expect("visible text stroke has line topology")
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
