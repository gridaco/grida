//! ENG-2.1 · the display list — a pure, diffable projection of the
//! resolved tier into paint primitives. `build(doc, resolved) -> DrawList`
//! (step 5) reads the resolved columns and the document's kinds; it never
//! reads the document's mutable intent directly and it never touches
//! skia. The camera is NOT baked in — the executor ([`crate::paint`])
//! takes the view transform, so the same drawlist paints at any zoom and
//! the host stays free.
//!
//! The item vocabulary is exactly what the current spike painter draws,
//! so the engine path reproduces it pixel-for-pixel (the re-host gate).

use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeId, Payload, ShapeDesc};
use anchor_lab::resolve::Resolved;

/// A packed 0xAARRGGBB color — resolved from the node's fill (or the
/// per-kind default) at build time, so the executor does no color logic.
pub type Argb = u32;

/// One paint primitive, carrying the world transform copied verbatim from
/// `resolved.world_of(node)` (never recomputed — pixel identity depends
/// on it) and the geometry in the node's own local space.
#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub node: NodeId,
    pub world: Affine,
    pub kind: ItemKind,
}

/// The primitive set. A frame emits a `RectFill` then a `RectStroke`
/// (two items, fill under stroke — today's order). Derived kinds
/// (group/lens) and the root emit nothing (no ink); their children are
/// still visited.
#[derive(Debug, Clone, PartialEq)]
pub enum ItemKind {
    RectFill {
        w: f32,
        h: f32,
        argb: Argb,
    },
    RectStroke {
        w: f32,
        h: f32,
        argb: Argb,
        stroke_width: f32,
    },
    Oval {
        w: f32,
        h: f32,
        argb: Argb,
    },
    Line {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        width: f32,
        argb: Argb,
    },
    /// Baseline already baked to today's `0.85 * font_size` in local space.
    TextRun {
        text: String,
        font_size: f32,
        baseline_y: f32,
        argb: Argb,
    },
}

/// The whole scene as an ordered primitive stream, in paint order
/// (pre-order DFS, parent ink before children). Diffable by `==`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DrawList {
    pub items: Vec<Item>,
}

// Per-kind default fills — the exact fallbacks the spike painter uses,
// packed as 0xAARRGGBB (skia `Color::from_argb(255, r, g, b)`).
const FRAME_FILL: Argb = 0xFFFF_FFFF; // white
const FRAME_STROKE: Argb = 0xFFC9_CED4;
const SHAPE_FILL: Argb = 0xFF4A_90D9;
const TEXT_FILL: Argb = 0xFF00_0000; // black

/// A node's fill as packed ARGB, or the per-kind default. The color is a
/// stored number now (`model::Color`), so this is a plain read — no per-build
/// hex parse (the old `resolve_color`), no `String` chase.
#[inline]
fn fill_or(fill: Option<anchor_lab::model::Color>, fallback: Argb) -> Argb {
    fill.map(|c| c.argb()).unwrap_or(fallback)
}

/// Project the resolved tier into an ordered primitive stream — the pure
/// `resolve -> drawlist` stage. Traversal is exactly the spike painter's
/// (`paint_node`): a hidden subtree (`world_opt == None`) prunes; the root
/// and derived kinds (group/lens) emit no ink but their children are still
/// visited; a frame emits fill then stroke; geometry is local-space
/// (`Rect::from_wh` etc.), positioned by `world` — copied verbatim, never
/// recomputed. The camera is applied later by the executor.
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

    // Root is the backdrop; derived kinds have no ink. Both still recurse.
    if id != doc.root && !node.payload.box_is_derived() {
        let b = resolved.box_of(id);
        match &node.payload {
            Payload::Frame { .. } => {
                items.push(Item {
                    node: id,
                    world,
                    kind: ItemKind::RectFill {
                        w: b.w,
                        h: b.h,
                        argb: fill_or(node.fill, FRAME_FILL),
                    },
                });
                items.push(Item {
                    node: id,
                    world,
                    kind: ItemKind::RectStroke {
                        w: b.w,
                        h: b.h,
                        argb: FRAME_STROKE,
                        stroke_width: 1.0,
                    },
                });
            }
            Payload::Shape { desc } => {
                let argb = fill_or(node.fill, SHAPE_FILL);
                let kind = match desc {
                    ShapeDesc::Rect => ItemKind::RectFill {
                        w: b.w,
                        h: b.h,
                        argb,
                    },
                    ShapeDesc::Ellipse => ItemKind::Oval {
                        w: b.w,
                        h: b.h,
                        argb,
                    },
                    ShapeDesc::Line => ItemKind::Line {
                        x1: 0.0,
                        y1: 0.0,
                        x2: b.w,
                        y2: 0.0,
                        width: 2.0,
                        argb,
                    },
                };
                items.push(Item {
                    node: id,
                    world,
                    kind,
                });
            }
            Payload::Text { content, font_size } => {
                items.push(Item {
                    node: id,
                    world,
                    kind: ItemKind::TextRun {
                        text: content.clone(),
                        font_size: *font_size,
                        baseline_y: font_size * 0.85,
                        argb: fill_or(node.fill, TEXT_FILL),
                    },
                });
            }
            // Excluded by the box_is_derived guard above.
            Payload::Group | Payload::Lens { .. } => unreachable!(),
        }
    }

    for &c in &node.children {
        emit(doc, resolved, c, items);
    }
}
