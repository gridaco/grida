//! The four-phase resolver (models/a.md §6):
//!
//! `resolve(document, viewport) → Resolved` — a pure function.
//!
//! - Phase M — measure (text natural size; frame hug; derived unions)
//! - Phase L — layout (taffy flex over AABB contributions; bindings elsewhere)
//! - Phase T — transforms (`from_box_center` for boxed; origin pivot for derived)
//! - Phase B — bounds (oriented corners → world AABBs)
//!
//! The E1 experiment flag [`RotationInFlow`] selects how a rotated in-flow
//! child participates in flex: by its oriented AABB (the spec's §5 tilt) or
//! not at all (CSS post-layout semantics). Everything else is identical
//! between the two modes.

use crate::math::{rotated_aabb_size, Affine, RectF};
use crate::measure::measure_text;
use crate::model::*;
use taffy::prelude::{auto, length, AvailableSpace, TaffyTree};
use taffy::style::{
    AlignItems, AlignSelf, Display, FlexDirection, FlexWrap, JustifyContent, Style,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RotationInFlow {
    /// Rotated child contributes |w·cosθ|+|h·sinθ|; box center is placed
    /// at the slot center; siblings make room. The E1 arm — kept
    /// implemented and tested as the documented alternative (R-3 anchor
    /// column), NOT the default since DEC-0's second lock.
    AabbParticipates,
    /// THE DEFAULT (DEC-0, owner framing): CSS `transform` semantics —
    /// sizing never reads rotation/flips (flex contributions, hug,
    /// derived unions are CSS-pure per dec0-visual-only.md); rotation is
    /// paint-only; the read tier (world AABBs, pick) stays oriented.
    #[default]
    VisualOnly,
}

#[derive(Debug, Clone, Copy)]
pub struct ResolveOptions {
    pub viewport: (f32, f32),
    pub rotation_in_flow: RotationInFlow,
}

impl Default for ResolveOptions {
    fn default() -> Self {
        ResolveOptions {
            viewport: (1000.0, 1000.0),
            rotation_in_flow: RotationInFlow::default(),
        }
    }
}

/// §8 applicability-matrix outcomes, reported — never silent (H12 at the
/// resolver: the document stays valid; the report says what a field did).
#[derive(Debug, Clone, PartialEq)]
pub enum Report {
    IgnoredByRule {
        node: NodeId,
        field: &'static str,
        rule: &'static str,
    },
    ErrorByRule {
        node: NodeId,
        field: &'static str,
        rule: &'static str,
    },
    Clamped {
        node: NodeId,
        field: &'static str,
        from: f32,
        to: f32,
    },
}

/// The resolved tier is **SOA**: index-aligned columns over the node
/// arena (`NodeId` = index), written once per resolve, read every frame
/// by paint/HUD/pick — the hot half of the hot/cold split (cold intent
/// stays AoS in the arena). `None` = not resolved (hidden subtree).
#[derive(Debug, Default, Clone)]
pub struct Resolved {
    /// Unrotated box in parent space (derived kinds: the placed union box).
    pub(crate) box_in_parent: Vec<Option<RectF>>,
    /// parent space ← node space.
    pub(crate) local: Vec<Option<Affine>>,
    pub(crate) world: Vec<Option<Affine>>,
    pub(crate) world_aabb: Vec<Option<RectF>>,
    pub reports: Vec<Report>,
}

impl Resolved {
    fn with_capacity(cap: usize) -> Resolved {
        Resolved {
            box_in_parent: vec![None; cap],
            local: vec![None; cap],
            world: vec![None; cap],
            world_aabb: vec![None; cap],
            reports: Vec::new(),
        }
    }
    pub fn box_of(&self, id: NodeId) -> RectF {
        self.box_in_parent[id as usize].expect("unresolved node")
    }
    pub fn local_of(&self, id: NodeId) -> Affine {
        self.local[id as usize].expect("unresolved node")
    }
    pub fn world_of(&self, id: NodeId) -> Affine {
        self.world[id as usize].expect("unresolved node")
    }
    pub fn world_opt(&self, id: NodeId) -> Option<Affine> {
        self.world.get(id as usize).copied().flatten()
    }
    /// Non-panicking column reads. Any consumer that walks all slots
    /// (some absent — hidden subtrees, tombstones) uses these, never the
    /// `*_of` forms that assert resolution. The damage differ
    /// (`engine::damage`) is the first caller.
    pub fn box_opt(&self, id: NodeId) -> Option<RectF> {
        self.box_in_parent.get(id as usize).copied().flatten()
    }
    pub fn local_opt(&self, id: NodeId) -> Option<Affine> {
        self.local.get(id as usize).copied().flatten()
    }
    pub fn aabb_opt(&self, id: NodeId) -> Option<RectF> {
        self.world_aabb.get(id as usize).copied().flatten()
    }
    /// Number of slots in the resolved columns (matches the document's
    /// arena capacity) — the upper bound for a full-column walk. Distinct
    /// from [`Self::resolved_count`], which counts only the `Some` entries.
    pub fn slot_count(&self) -> usize {
        self.world.len()
    }
    /// Number of nodes that resolved (hidden subtrees are absent).
    pub fn resolved_count(&self) -> usize {
        self.world.iter().filter(|w| w.is_some()).count()
    }
    pub fn aabb_of(&self, id: NodeId) -> RectF {
        self.world_aabb[id as usize].expect("unresolved node")
    }
    /// The always-readable resolved scalars (a.md §6 reads).
    pub fn xywh(&self, id: NodeId) -> (f32, f32, f32, f32) {
        let b = self.box_of(id);
        (b.x, b.y, b.w, b.h)
    }
}

struct Ctx<'a> {
    doc: &'a Document,
    opts: ResolveOptions,
    out: Resolved,
    /// Derived-box kinds: union rect of children in node-local space,
    /// cached once children are committed (children commit exactly once).
    /// `NodeId`-indexed column, not a map: `NodeId` is a dense arena index, and
    /// the browser rule is to index dense ids directly and never hash them
    /// (cc's property trees are `Vec`-indexed; a `HashMap<dense-id>` is the
    /// anti-pattern). Sized to the arena, like the `Resolved` columns.
    union_cache: Vec<Option<RectF>>,
    /// Lens nodes: the folded post-resolution ops transform (same dense-index
    /// column discipline).
    ops_cache: Vec<Option<Affine>>,
}

pub fn resolve(doc: &Document, opts: &ResolveOptions) -> Resolved {
    let mut cx = Ctx {
        doc,
        opts: *opts,
        out: Resolved::with_capacity(doc.capacity()),
        union_cache: vec![None; doc.capacity()],
        ops_cache: vec![None; doc.capacity()],
    };
    let vp = RectF {
        x: 0.0,
        y: 0.0,
        w: opts.viewport.0,
        h: opts.viewport.1,
    };
    // The root is an ordinary frame resolved against the viewport pseudo-box
    // (the InitialContainer special regime, regularized — X-SELF-5 break).
    let root_box = place_by_bindings(doc.root, (vp.w, vp.h), &mut cx);
    commit(doc.root, root_box, &mut cx);

    // Phase T (world composition) + Phase B (bounds), after the tree of
    // boxes and locals is complete.
    compose_world(doc.root, Affine::IDENTITY, &mut cx);
    compute_world_aabb(doc.root, &mut cx);
    cx.out
}

// ---------------------------------------------------------------------------
// Phase M/L helpers
// ---------------------------------------------------------------------------

/// Resolved extent of a node (its unrotated box size), independent of
/// position. `parent_extent` is needed only by Span bindings.
fn extent_of(id: NodeId, parent_extent: Option<(f32, f32)>, cx: &mut Ctx) -> (f32, f32) {
    let node = cx.doc.get(id);

    if node.payload.box_is_derived() {
        // width/height intents are ignored-by-rule on derived kinds (§8).
        if !matches!(node.header.width, SizeIntent::Auto)
            || !matches!(node.header.height, SizeIntent::Auto)
        {
            cx.out.reports.push(Report::IgnoredByRule {
                node: id,
                field: "width/height",
                rule: "box derived from children",
            });
        }
        let u = union_of_derived(id, cx);
        return (u.w, u.h);
    }

    // Span owns the axis extent (§2.1); SizeIntent on a spanned axis is
    // ignored-by-rule.
    let span_w = span_extent(id, node.header.x, parent_extent.map(|e| e.0), "x", cx);
    let span_h = span_extent(id, node.header.y, parent_extent.map(|e| e.1), "y", cx);

    let mut w = span_w;
    let mut h = span_h;
    let text_auto_height = h.is_none()
        && matches!(node.header.height, SizeIntent::Auto)
        && matches!(&node.payload, Payload::Text { .. });

    if w.is_none() {
        w = intent_extent_x(id, cx);
    }
    if h.is_none() && !text_auto_height {
        // A span-resolved width IS a wrap constraint (census finding: the
        // canonical Span{0,0} fill must re-wrap like Fixed/stretched widths).
        h = intent_extent_y(id, span_w, cx);
    }

    // aspect_ratio resolves an under-specified axis only (G-5).
    if let Some((ar_w, ar_h)) = node.header.aspect_ratio {
        if ar_w > 0.0 && ar_h > 0.0 {
            match (w, h) {
                (Some(wv), None) => h = Some(wv * ar_h / ar_w),
                (None, Some(hv)) => w = Some(hv * ar_w / ar_h),
                _ => {}
            }
        }
    }

    let width_before_clamp = w;
    let mut wv = w.unwrap_or_else(|| {
        cx.out.reports.push(Report::ErrorByRule {
            node: id,
            field: "width",
            rule: "Auto size on a kind with no natural size",
        });
        0.0
    });
    // Width constraints precede auto-height text measurement: changing the
    // final wrapping width must change the measured line count in the same
    // resolution pass.
    wv = clamp_axis(
        id,
        "width",
        wv,
        node.header.min_width,
        node.header.max_width,
        cx,
    );
    if text_auto_height {
        let node = cx.doc.get(id);
        let Payload::Text { content, font_size } = &node.payload else {
            unreachable!("text_auto_height is set only for text")
        };
        let wrap_width = if span_w.is_some()
            || matches!(node.header.width, SizeIntent::Fixed(_))
            || width_before_clamp.is_some_and(|before| wv < before)
        {
            Some(wv)
        } else {
            // Auto width with no narrowing constraint keeps its no-soft-wrap
            // contract; passing the computed natural width back through a
            // floating-point floor can otherwise invent a wrap.
            None
        };
        h = Some(measure_text(content, *font_size, wrap_width).1);
    }

    let mut hv = h.unwrap_or_else(|| {
        cx.out.reports.push(Report::ErrorByRule {
            node: id,
            field: "height",
            rule: "Auto size on a kind with no natural size",
        });
        0.0
    });

    // Height clamps apply after any width-driven text re-measure. Min beats
    // max on both axes (G-4 declared rule).
    hv = clamp_axis(
        id,
        "height",
        hv,
        node.header.min_height,
        node.header.max_height,
        cx,
    );
    (wv, hv)
}

fn clamp_axis(
    id: NodeId,
    field: &'static str,
    v: f32,
    min: Option<f32>,
    max: Option<f32>,
    cx: &mut Ctx,
) -> f32 {
    let mut out = v;
    if let Some(mx) = max {
        out = out.min(mx);
    }
    if let Some(mn) = min {
        out = out.max(mn);
    }
    if out != v {
        cx.out.reports.push(Report::Clamped {
            node: id,
            field,
            from: v,
            to: out,
        });
    }
    out
}

fn span_extent(
    id: NodeId,
    binding: AxisBinding,
    parent: Option<f32>,
    field: &'static str,
    cx: &mut Ctx,
) -> Option<f32> {
    match binding {
        AxisBinding::Span { start, end } => match parent {
            Some(e) => {
                let raw = e - start - end;
                if raw < 0.0 {
                    // G-E2 declared rule: clamp-to-zero, reported.
                    cx.out.reports.push(Report::Clamped {
                        node: id,
                        field,
                        from: raw,
                        to: 0.0,
                    });
                }
                Some(raw.max(0.0))
            }
            None => {
                cx.out.reports.push(Report::ErrorByRule {
                    node: id,
                    field,
                    rule: "Span binding without a resolvable parent extent",
                });
                Some(0.0)
            }
        },
        _ => None,
    }
}

/// Natural width per kind, None when the kind has no natural width.
fn intent_extent_x(id: NodeId, cx: &mut Ctx) -> Option<f32> {
    let node = cx.doc.get(id);
    match node.header.width {
        SizeIntent::Fixed(v) => Some(v),
        SizeIntent::Auto => match &node.payload {
            Payload::Text { content, font_size } => Some(measure_text(content, *font_size, None).0),
            Payload::Frame { .. } => Some(hug_size(id, cx).0),
            _ => None,
        },
    }
}

/// Natural height per kind; text height depends on the resolved width
/// (Fixed width or a Span-resolved width ⇒ wrap constraint; Auto ⇒
/// unconstrained single line). The census found the Span arm missing —
/// Span{0,0} is the canonical free-context fill and must re-wrap.
fn intent_extent_y(id: NodeId, span_w: Option<f32>, cx: &mut Ctx) -> Option<f32> {
    let node = cx.doc.get(id);
    match node.header.height {
        SizeIntent::Fixed(v) => Some(v),
        SizeIntent::Auto => match &node.payload {
            Payload::Text { content, font_size } => {
                let constraint = span_w.or(match node.header.width {
                    SizeIntent::Fixed(w) => Some(w),
                    SizeIntent::Auto => None,
                });
                Some(measure_text(content, *font_size, constraint).1)
            }
            Payload::Frame { .. } => Some(hug_size(id, cx).1),
            _ => None,
        },
    }
}

/// Hug (frame + Auto): the frame's natural content size (L-E1: padding box).
fn hug_size(id: NodeId, cx: &mut Ctx) -> (f32, f32) {
    let node = cx.doc.get(id);
    let layout = match &node.payload {
        Payload::Frame { layout, .. } => *layout,
        _ => unreachable!("hug_size on non-frame"),
    };
    match layout.mode {
        LayoutMode::Flex => {
            let definite_w = match node.header.width {
                SizeIntent::Fixed(v) => Some(v),
                SizeIntent::Auto => None,
            };
            let definite_h = match node.header.height {
                SizeIntent::Fixed(v) => Some(v),
                SizeIntent::Auto => None,
            };
            let out = flex_layout(id, layout, (definite_w, definite_h), cx);
            out.container
        }
        LayoutMode::None => {
            // Hug of a free frame: children must be Start-pinned; End/Center/
            // Span pins are underdetermined under an Auto parent (declared:
            // error-by-rule, contribute at their offset-as-start).
            let children: Vec<NodeId> = node.children.clone();
            let pad = layout.padding;
            let mut max_x: f32 = 0.0;
            let mut max_y: f32 = 0.0;
            for child_id in children {
                if !cx.doc.get(child_id).header.active {
                    continue;
                }
                let (cw, ch) = extent_of(child_id, None, cx);
                let is_derived = cx.doc.get(child_id).payload.box_is_derived();
                let u = if is_derived {
                    cx.union_cache[child_id as usize].unwrap_or(RectF::EMPTY)
                } else {
                    RectF {
                        x: 0.0,
                        y: 0.0,
                        w: cw,
                        h: ch,
                    }
                };
                let child = cx.doc.get(child_id);
                let ox = start_offset_or_report(child_id, child.header.x, "x", cx);
                let oy = start_offset_or_report(child_id, child.header.y, "y", cx);
                let aabb = if cx.opts.rotation_in_flow == RotationInFlow::VisualOnly {
                    // V-3 (dec0-visual-only.md): CSS-pure hug — measurement
                    // ignores rotation/flips; the child contributes its
                    // untransformed box at its pins.
                    RectF {
                        x: ox + u.x,
                        y: oy + u.y,
                        w: u.w,
                        h: u.h,
                    }
                } else {
                    // AabbParticipates: the true local AABB under the
                    // child's own pivot (census fix: derived kinds pivot at
                    // the origin, not the box center), composition mirroring
                    // commit exactly (flip included).
                    let theta = child.header.rotation;
                    let (cfx, cfy) = (child.header.flip_x, child.header.flip_y);
                    let local = if is_derived {
                        Affine::translate(ox, oy)
                            .then(&Affine::rotate_deg(theta))
                            .then(&Affine::flip(cfx, cfy))
                    } else {
                        Affine::from_box_center_flip(ox, oy, cw, ch, theta, cfx, cfy)
                    };
                    u.transformed_aabb(&local)
                };
                max_x = max_x.max(aabb.x + aabb.w);
                max_y = max_y.max(aabb.y + aabb.h);
            }
            (max_x + pad.left + pad.right, max_y + pad.top + pad.bottom)
        }
    }
}

fn start_offset_or_report(
    id: NodeId,
    binding: AxisBinding,
    field: &'static str,
    cx: &mut Ctx,
) -> f32 {
    match binding {
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        } => offset,
        AxisBinding::Pin { offset, .. } => {
            cx.out.reports.push(Report::ErrorByRule {
                node: id,
                field,
                rule: "End/Center pin underdetermined (no parent extent); treated as Start",
            });
            offset
        }
        AxisBinding::Span { start, .. } => {
            cx.out.reports.push(Report::ErrorByRule {
                node: id,
                field,
                rule: "Span underdetermined (no parent extent); treated as Start",
            });
            start
        }
    }
}

/// Bindings table (§2.1) — position within a definite parent box.
///
/// Derived-box kinds (§8: x/y "places the **space**"): bindings place the
/// node's local origin, never the union box — the union must not feed back
/// into placement, or editing child A would move sibling B in world space
/// (D-2, the P6 instability). Reads report the box (origin + union offset);
/// writes re-target (ops::set_x works in deltas).
fn place_by_bindings(id: NodeId, parent_extent: (f32, f32), cx: &mut Ctx) -> RectF {
    let (w, h) = extent_of(id, Some(parent_extent), cx);
    let node = cx.doc.get(id);
    if node.payload.box_is_derived() {
        let u = cx.union_cache[id as usize].unwrap_or(RectF::EMPTY);
        let ox = match node.header.x {
            AxisBinding::Pin {
                anchor: AnchorEdge::Start,
                offset,
            } => offset,
            AxisBinding::Pin {
                anchor: AnchorEdge::End,
                offset,
            } => parent_extent.0 - offset,
            AxisBinding::Pin {
                anchor: AnchorEdge::Center,
                offset,
            } => parent_extent.0 / 2.0 + offset,
            AxisBinding::Span { start, .. } => {
                cx.out.reports.push(Report::ErrorByRule {
                    node: id,
                    field: "x",
                    rule: "Span on a derived-box kind; treated as Start",
                });
                start
            }
        };
        let oy = match node.header.y {
            AxisBinding::Pin {
                anchor: AnchorEdge::Start,
                offset,
            } => offset,
            AxisBinding::Pin {
                anchor: AnchorEdge::End,
                offset,
            } => parent_extent.1 - offset,
            AxisBinding::Pin {
                anchor: AnchorEdge::Center,
                offset,
            } => parent_extent.1 / 2.0 + offset,
            AxisBinding::Span { start, .. } => {
                cx.out.reports.push(Report::ErrorByRule {
                    node: id,
                    field: "y",
                    rule: "Span on a derived-box kind; treated as Start",
                });
                start
            }
        };
        // The *box* (read tier) = origin + union offset.
        return RectF {
            x: ox + u.x,
            y: oy + u.y,
            w,
            h,
        };
    }
    let x = match node.header.x {
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        } => offset,
        AxisBinding::Pin {
            anchor: AnchorEdge::End,
            offset,
        } => parent_extent.0 - offset - w,
        AxisBinding::Pin {
            anchor: AnchorEdge::Center,
            offset,
        } => (parent_extent.0 - w) / 2.0 + offset,
        AxisBinding::Span { start, .. } => start,
    };
    let y = match node.header.y {
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        } => offset,
        AxisBinding::Pin {
            anchor: AnchorEdge::End,
            offset,
        } => parent_extent.1 - offset - h,
        AxisBinding::Pin {
            anchor: AnchorEdge::Center,
            offset,
        } => (parent_extent.1 - h) / 2.0 + offset,
        AxisBinding::Span { start, .. } => start,
    };
    RectF { x, y, w, h }
}

// ---------------------------------------------------------------------------
// Derived boxes (group / lens)
// ---------------------------------------------------------------------------

/// Resolve a derived-box node's children in node-local space (committing
/// them), returning the union rect. Cached — children commit exactly once.
fn union_of_derived(id: NodeId, cx: &mut Ctx) -> RectF {
    if let Some(u) = cx.union_cache[id as usize] {
        return u;
    }
    let children: Vec<NodeId> = cx.doc.get(id).children.clone();
    let mut union: Option<RectF> = None;
    for child_id in children {
        if !cx.doc.get(child_id).header.active {
            continue;
        }
        // Children of derived-box parents resolve against no extent:
        // Start pins only (declared; others reported by start_offset_or_report).
        let (cw, ch) = extent_of(child_id, None, cx);
        // Derived children: pins place the ORIGIN; the box = origin + own
        // union offset (census fix: nested unions must not swallow it).
        let derived_off = if cx.doc.get(child_id).payload.box_is_derived() {
            let u = cx.union_cache[child_id as usize].unwrap_or(RectF::EMPTY);
            (u.x, u.y)
        } else {
            (0.0, 0.0)
        };
        let child = cx.doc.get(child_id);
        let ox = start_offset_or_report(child_id, child.header.x, "x", cx) + derived_off.0;
        let oy = start_offset_or_report(child_id, child.header.y, "y", cx) + derived_off.1;
        let child_box = RectF {
            x: ox,
            y: oy,
            w: cw,
            h: ch,
        };
        commit(child_id, child_box, cx);
        let aabb = if cx.opts.rotation_in_flow == RotationInFlow::VisualOnly {
            // V-4 (dec0-visual-only.md): the derived box is SIZING-tier —
            // union of members' untransformed boxes at their pins. An
            // oriented union would smuggle the envelope back into layout
            // one nesting level deep. Ink bounds remain `world_aabb`.
            child_box
        } else {
            // AabbParticipates (D-1): union of oriented corners — each
            // child's local AABB under its own local transform.
            let local = cx.out.local[child_id as usize].unwrap();
            RectF {
                x: 0.0,
                y: 0.0,
                w: cw,
                h: ch,
            }
            .transformed_aabb(&local)
        };
        union = Some(match union {
            None => aabb,
            Some(u) => u.union(&aabb),
        });
    }
    // D-E1 declared: empty/hidden-only derived box = zero rect at origin.
    let u = union.unwrap_or(RectF::EMPTY);
    cx.union_cache[id as usize] = Some(u);
    u
}

fn fold_lens_ops(ops: &[LensOp], u: RectF) -> Affine {
    let (ucx, ucy) = u.center();
    let about_center = |m: Affine| {
        Affine::translate(ucx, ucy)
            .then(&m)
            .then(&Affine::translate(-ucx, -ucy))
    };
    let mut acc = Affine::IDENTITY;
    for op in ops {
        let m = match op {
            LensOp::Translate { x, y } => Affine::translate(*x, *y),
            LensOp::Rotate { deg } => about_center(Affine::rotate_deg(*deg)),
            LensOp::Scale { x, y } => about_center(Affine::scale(*x, *y)),
            LensOp::Skew { x_deg, y_deg } => about_center(Affine::skew_deg(*x_deg, *y_deg)),
            LensOp::Matrix { m } => Affine {
                a: m[0],
                b: m[1],
                c: m[2],
                d: m[3],
                e: m[4],
                f: m[5],
            },
        };
        acc = acc.then(&m);
    }
    acc
}

// ---------------------------------------------------------------------------
// Commit: box known → store local transform, lay out subtree
// ---------------------------------------------------------------------------

/// `box_rect` is the node's unrotated box in parent space (derived kinds:
/// where the union box lands).
fn commit(id: NodeId, box_rect: RectF, cx: &mut Ctx) {
    let node = cx.doc.get(id);
    let theta = node.header.rotation;
    let (fx, fy) = (node.header.flip_x, node.header.flip_y);

    let local = if node.payload.box_is_derived() {
        // Pivot = the node's own local origin (§5); the origin is recovered
        // from the box by subtracting the union offset. Children live in
        // origin space, so no further correction term exists — which is
        // exactly why child edits never move siblings (D-2).
        // Flip shares the pivot (B1) and composes innermost: T·R·F.
        let u = cx.union_cache[id as usize].unwrap_or(RectF::EMPTY);
        let t = Affine::translate(box_rect.x - u.x, box_rect.y - u.y)
            .then(&Affine::rotate_deg(theta))
            .then(&Affine::flip(fx, fy));
        if let Payload::Lens { ops } = &node.payload {
            let folded = fold_lens_ops(ops, u);
            cx.ops_cache[id as usize] = Some(folded);
        }
        t
    } else {
        // Boxed/measured kinds: center pivot (§5) — the one pivot where the
        // box and its rotated AABB stay concentric. Flip is center-applied
        // too, so it never changes the AABB: layout-invisible by construction.
        Affine::from_box_center_flip(
            box_rect.x, box_rect.y, box_rect.w, box_rect.h, theta, fx, fy,
        )
    };

    cx.out.box_in_parent[id as usize] = Some(box_rect);
    cx.out.local[id as usize] = Some(local);

    // Child ownership is orthogonal to box source. Frames can lay children
    // out; boxed shapes establish a free-positioned local coordinate space;
    // group/lens children were already committed while deriving their union.
    // Text is the only implemented leaf kind.
    enum ChildProgram {
        Frame(LayoutBehavior),
        Free,
        Derived,
        Leaf,
    }
    let child_program = match &cx.doc.get(id).payload {
        Payload::Frame { layout, .. } => ChildProgram::Frame(*layout),
        Payload::Shape { .. } => ChildProgram::Free,
        Payload::Group | Payload::Lens { .. } => ChildProgram::Derived,
        Payload::Text { .. } => ChildProgram::Leaf,
    };
    match child_program {
        ChildProgram::Frame(layout) => {
            layout_frame_children(id, layout, (box_rect.w, box_rect.h), cx)
        }
        ChildProgram::Free => {
            layout_free_children(id, (box_rect.w, box_rect.h), EdgeInsets::default(), cx)
        }
        ChildProgram::Derived => {}
        ChildProgram::Leaf => {
            if !cx.doc.get(id).children.is_empty() {
                cx.out.reports.push(Report::ErrorByRule {
                    node: id,
                    field: "children",
                    rule: "text is a leaf payload",
                });
            }
        }
    }
}

fn layout_frame_children(id: NodeId, layout: LayoutBehavior, extent: (f32, f32), cx: &mut Ctx) {
    match layout.mode {
        LayoutMode::None => layout_free_children(id, extent, layout.padding, cx),
        LayoutMode::Flex => {
            let children: Vec<NodeId> = cx.doc.get(id).children.clone();
            let out = flex_layout(id, layout, (Some(extent.0), Some(extent.1)), cx);
            for (child_id, slot, basis) in out.slots {
                let child = cx.doc.get(child_id);
                let theta = child.header.rotation;
                let rotated = theta.rem_euclid(360.0) != 0.0;
                let is_derived = child.payload.box_is_derived();
                let b = if is_derived {
                    // Derived kinds keep their union dims; under AABB mode
                    // the *post-rotation* union center lands on the slot
                    // center (pivot is the origin, so the center swings).
                    let u = cx.union_cache[child_id as usize].unwrap_or(RectF::EMPTY);
                    if cx.opts.rotation_in_flow == RotationInFlow::AabbParticipates {
                        let (scx, scy) = slot.center();
                        // Post-transform union center (R·F — same composition
                        // as commit) lands on the slot center.
                        let d = Affine::rotate_deg(theta)
                            .then(&Affine::flip(child.header.flip_x, child.header.flip_y))
                            .apply((u.x + u.w / 2.0, u.y + u.h / 2.0));
                        RectF {
                            x: scx - d.0 + u.x,
                            y: scy - d.1 + u.y,
                            w: u.w,
                            h: u.h,
                        }
                    } else {
                        RectF {
                            x: slot.x,
                            y: slot.y,
                            w: u.w,
                            h: u.h,
                        }
                    }
                } else if rotated && cx.opts.rotation_in_flow == RotationInFlow::AabbParticipates {
                    // Box center := slot center; box keeps its basis dims.
                    let (bw, bh) = basis;
                    let (cx_, cy_) = slot.center();
                    RectF {
                        x: cx_ - bw / 2.0,
                        y: cy_ - bh / 2.0,
                        w: bw,
                        h: bh,
                    }
                } else {
                    // Unrotated (or VisualOnly): the slot is the box.
                    slot
                };
                commit(child_id, b, cx);
            }
            // Absolute children: excluded from flow, resolve against the
            // parent box (L-4).
            for child_id in children {
                let child = cx.doc.get(child_id);
                if !child.header.active || child.header.flow != Flow::Absolute {
                    continue;
                }
                let b = place_by_bindings(child_id, extent, cx);
                commit(child_id, b, cx);
            }
        }
    }
}

/// Resolve children against a local content box without a layout algorithm.
/// Free frames inset that box by padding; shapes pass zero padding, so their
/// children remain in the shape's direct local coordinates. A shape's children
/// may paint outside it, but never change its declared box or parent layout
/// contribution — the box remains the only negotiation surface (MODEL law 3).
fn layout_free_children(id: NodeId, extent: (f32, f32), padding: EdgeInsets, cx: &mut Ctx) {
    let content_extent = (
        (extent.0 - padding.left - padding.right).max(0.0),
        (extent.1 - padding.top - padding.bottom).max(0.0),
    );
    let children: Vec<NodeId> = cx.doc.get(id).children.clone();
    for child_id in children {
        if !cx.doc.get(child_id).header.active {
            continue;
        }
        report_flow_fields_inert(child_id, cx);
        let mut b = place_by_bindings(child_id, content_extent, cx);
        b.x += padding.left;
        b.y += padding.top;
        commit(child_id, b, cx);
    }
}

/// §8: x/y and grow/self_align are inert outside their contexts — report
/// non-default values so tests can assert the matrix is enforced.
fn report_flow_fields_inert(id: NodeId, cx: &mut Ctx) {
    let h = &cx.doc.get(id).header;
    if h.grow != 0.0 {
        cx.out.reports.push(Report::IgnoredByRule {
            node: id,
            field: "grow",
            rule: "no layout parent",
        });
    }
    if h.self_align != SelfAlign::Auto {
        cx.out.reports.push(Report::IgnoredByRule {
            node: id,
            field: "self_align",
            rule: "no layout parent",
        });
    }
}

// ---------------------------------------------------------------------------
// Flex via taffy (per-container run)
// ---------------------------------------------------------------------------

struct TextCtx {
    content: String,
    font_size: f32,
}

struct FlexOut {
    container: (f32, f32),
    /// (child, slot rect in container space, basis dims)
    slots: Vec<(NodeId, RectF, (f32, f32))>,
}

fn flex_layout(
    id: NodeId,
    layout: LayoutBehavior,
    definite: (Option<f32>, Option<f32>),
    cx: &mut Ctx,
) -> FlexOut {
    let children: Vec<NodeId> = cx.doc.get(id).children.clone();

    let mut tree: TaffyTree<TextCtx> = TaffyTree::new();
    // L-7 (declared POL): resolution is unquantized; pixel snapping is a
    // paint concern. Taffy rounds by default — turned off deliberately.
    tree.disable_rounding();

    // L-3 (declared INV): hug uses basis sizes — grow distributes only
    // *definite* free space. Taffy 0.9 deviates: in its intrinsic pass a
    // growable item's contribution is floored by the container's own
    // padding (`.max(main_content_box_inset)`, flexbox.rs), inflating hug
    // sizes vs both the spec and Chromium. Enforce the spec by stripping
    // grow when the main axis is indefinite; the definite re-run applies
    // the real grow factors. (E-finding: oracle deviation in the layout dep.)
    let main_is_definite = match layout.direction {
        Direction::Row => definite.0.is_some(),
        Direction::Column => definite.1.is_some(),
    };
    let mut entries: Vec<(NodeId, taffy::NodeId, (f32, f32))> = Vec::new();

    for child_id in &children {
        let child = cx.doc.get(*child_id);
        if !child.header.active || child.header.flow == Flow::Absolute {
            continue;
        }
        // §8: x/y are ignored-by-rule under flow (layout owns them).
        if child.header.x != AxisBinding::default() || child.header.y != AxisBinding::default() {
            cx.out.reports.push(Report::IgnoredByRule {
                node: *child_id,
                field: "x/y",
                rule: "in-flow under flex: layout owns position",
            });
        }
        let theta = child.header.rotation;
        let rotated = theta.rem_euclid(360.0) != 0.0;
        let contribute_aabb =
            rotated && cx.opts.rotation_in_flow == RotationInFlow::AabbParticipates;

        let mut style = Style {
            // leaf display: taffy default (flex); Block distorts intrinsic sizing
            flex_shrink: 0.0, // X-SELF-8: canvas items don't shrink implicitly
            flex_grow: if main_is_definite {
                child.header.grow
            } else {
                0.0
            },
            align_self: match child.header.self_align {
                SelfAlign::Auto => None,
                SelfAlign::Start => Some(AlignSelf::Start),
                SelfAlign::Center => Some(AlignSelf::Center),
                SelfAlign::End => Some(AlignSelf::End),
                SelfAlign::Stretch => Some(AlignSelf::Stretch),
            },
            ..Style::default()
        };
        if let Some(v) = child.header.min_width {
            style.min_size.width = length(v);
        }
        if let Some(v) = child.header.max_width {
            style.max_size.width = length(v);
        }
        if let Some(v) = child.header.min_height {
            style.min_size.height = length(v);
        }
        if let Some(v) = child.header.max_height {
            style.max_size.height = length(v);
        }

        let is_text = matches!(child.payload, Payload::Text { .. });
        let basis: (f32, f32);
        let taffy_child = if contribute_aabb {
            // Fixed AABB contribution computed from resolved size only (§5).
            let b = extent_of(*child_id, None, cx);
            basis = b;
            let (aw, ah) = rotated_aabb_size(b.0, b.1, theta);
            style.size.width = length(aw);
            style.size.height = length(ah);
            tree.new_leaf(style).unwrap()
        } else if is_text {
            // Measured kind: taffy drives re-measure at layout-imposed
            // extents (L-5) through the measure closure.
            let (content, font_size) = match &child.payload {
                Payload::Text { content, font_size } => (content.clone(), *font_size),
                _ => unreachable!(),
            };
            match child.header.width {
                SizeIntent::Fixed(v) => style.size.width = length(v),
                SizeIntent::Auto => style.size.width = auto(),
            }
            match child.header.height {
                SizeIntent::Fixed(v) => style.size.height = length(v),
                SizeIntent::Auto => style.size.height = auto(),
            }
            // Per-child stretch is an explicit cross-axis fill override, even
            // when text authored a fixed cross size. Container-level stretch
            // still applies only to the Auto values left above.
            if child.header.self_align == SelfAlign::Stretch {
                match layout.direction {
                    Direction::Row => style.size.height = auto(),
                    Direction::Column => style.size.width = auto(),
                }
            }
            basis = (0.0, 0.0); // unused for θ=0 slots
            tree.new_leaf_with_context(style, TextCtx { content, font_size })
                .unwrap()
        } else {
            let b = extent_of(*child_id, None, cx);
            basis = b;
            style.size.width = length(b.0);
            style.size.height = length(b.1);
            // An explicit per-child stretch overrides even a fixed cross size.
            // Container-level stretch applies only when the authored cross
            // size remains Auto; retaining the resolved basis as Definite here
            // would erase that authored intent before Taffy sees it.
            let authored_cross_is_auto = match layout.direction {
                Direction::Row => matches!(child.header.height, SizeIntent::Auto),
                Direction::Column => matches!(child.header.width, SizeIntent::Auto),
            };
            // A line's vertical extent is geometry, not a flex-owned box
            // axis. Even explicit self-stretch cannot turn its locked zero
            // height into a non-degenerate paint box in a row container.
            let line_height_is_locked = layout.direction == Direction::Row
                && matches!(
                    &child.payload,
                    Payload::Shape {
                        desc: ShapeDesc::Line
                    }
                );
            let stretches_cross = !line_height_is_locked
                && (child.header.self_align == SelfAlign::Stretch
                    || (!child.payload.box_is_derived()
                        && child.header.self_align == SelfAlign::Auto
                        && layout.cross_align == CrossAlign::Stretch
                        && authored_cross_is_auto));
            if stretches_cross {
                match layout.direction {
                    Direction::Row => style.size.height = auto(),
                    Direction::Column => style.size.width = auto(),
                }
            }
            tree.new_leaf(style).unwrap()
        };
        entries.push((*child_id, taffy_child, basis));
    }

    let container_style = Style {
        display: Display::Flex,
        flex_direction: match layout.direction {
            Direction::Row => FlexDirection::Row,
            Direction::Column => FlexDirection::Column,
        },
        flex_wrap: if layout.wrap {
            FlexWrap::Wrap
        } else {
            FlexWrap::NoWrap
        },
        justify_content: Some(match layout.main_align {
            MainAlign::Start => JustifyContent::Start,
            MainAlign::Center => JustifyContent::Center,
            MainAlign::End => JustifyContent::End,
            MainAlign::SpaceBetween => JustifyContent::SpaceBetween,
            MainAlign::SpaceAround => JustifyContent::SpaceAround,
            MainAlign::SpaceEvenly => JustifyContent::SpaceEvenly,
        }),
        align_items: Some(match layout.cross_align {
            CrossAlign::Start => AlignItems::Start,
            CrossAlign::Center => AlignItems::Center,
            CrossAlign::End => AlignItems::End,
            CrossAlign::Stretch => AlignItems::Stretch,
        }),
        gap: taffy::geometry::Size {
            width: length(match layout.direction {
                Direction::Row => layout.gap_main,
                Direction::Column => layout.gap_cross,
            }),
            height: length(match layout.direction {
                Direction::Row => layout.gap_cross,
                Direction::Column => layout.gap_main,
            }),
        },
        padding: taffy::geometry::Rect {
            left: length(layout.padding.left),
            right: length(layout.padding.right),
            top: length(layout.padding.top),
            bottom: length(layout.padding.bottom),
        },
        size: taffy::geometry::Size {
            width: match definite.0 {
                Some(v) => length(v),
                None => auto(),
            },
            height: match definite.1 {
                Some(v) => length(v),
                None => auto(),
            },
        },
        ..Style::default()
    };

    let kids: Vec<taffy::NodeId> = entries.iter().map(|(_, t, _)| *t).collect();
    let container = tree.new_with_children(container_style, &kids).unwrap();

    let avail = taffy::geometry::Size {
        width: match definite.0 {
            Some(v) => AvailableSpace::Definite(v),
            None => AvailableSpace::MaxContent,
        },
        height: match definite.1 {
            Some(v) => AvailableSpace::Definite(v),
            None => AvailableSpace::MaxContent,
        },
    };

    tree.compute_layout_with_measure(
        container,
        avail,
        |known, avail_space, _node, ctx, _style| {
            if std::env::var("ANCHOR_DBG").is_ok() {
                eprintln!(
                    "measure ctx={} known={:?} avail={:?}",
                    ctx.is_some(),
                    known,
                    avail_space
                );
            }
            match ctx {
                Some(t) => {
                    let constraint = known.width.or(match avail_space.width {
                        AvailableSpace::Definite(w) => Some(w),
                        _ => None,
                    });
                    let (w, h) = measure_text(&t.content, t.font_size, constraint);
                    taffy::geometry::Size {
                        width: known.width.unwrap_or(w),
                        height: known.height.unwrap_or(h),
                    }
                }
                None => taffy::geometry::Size {
                    width: known.width.unwrap_or(0.0),
                    height: known.height.unwrap_or(0.0),
                },
            }
        },
    )
    .unwrap();

    let csize = tree.layout(container).unwrap().size;
    let mut slots = Vec::new();
    for (child_id, taffy_id, basis) in entries {
        let l = tree.layout(taffy_id).unwrap();
        slots.push((
            child_id,
            RectF {
                x: l.location.x,
                y: l.location.y,
                w: l.size.width,
                h: l.size.height,
            },
            basis,
        ));
    }
    FlexOut {
        container: (csize.width, csize.height),
        slots,
    }
}

// ---------------------------------------------------------------------------
// Phase T + B
// ---------------------------------------------------------------------------

fn compose_world(id: NodeId, parent_world: Affine, cx: &mut Ctx) {
    let local = cx.out.local[id as usize].unwrap();
    let world = parent_world.then(&local);
    cx.out.world[id as usize] = Some(world);
    // Children of a lens compose through the folded ops:
    // world = parent ∘ local ∘ eval(ops)  (a.md §6 Phase T).
    let child_basis = match cx.ops_cache[id as usize] {
        Some(ops) => world.then(&ops),
        None => world,
    };
    let children: Vec<NodeId> = cx.doc.get(id).children.clone();
    for c in children {
        if cx.out.local[c as usize].is_some() {
            compose_world(c, child_basis, cx);
        }
    }
}

/// Maximum outward coverage contributed by authored strokes in node-local
/// coordinates. Layout remains based on the source box; only visual bounds
/// read this expansion. Open line strokes are centered by definition, so their
/// cap/join details are conservatively covered by half the width on every side.
fn effective_stroke_outset(node: &Node) -> f32 {
    let is_line = matches!(
        &node.payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        }
    );
    node.strokes
        .iter()
        .filter(|stroke| stroke.visible())
        .map(|stroke| {
            if is_line {
                stroke.width / 2.0
            } else {
                let base = match stroke.align {
                    StrokeAlign::Inside => 0.0,
                    StrokeAlign::Center => stroke.width / 2.0,
                    StrokeAlign::Outside => stroke.width,
                };
                if matches!(node.payload, Payload::Text { .. }) && stroke.join == StrokeJoin::Miter
                {
                    base * stroke.miter_limit
                } else {
                    base
                }
            }
        })
        .fold(0.0, f32::max)
}

fn intersect_aabbs(a: RectF, b: RectF) -> Option<RectF> {
    let x0 = a.x.max(b.x);
    let y0 = a.y.max(b.y);
    let x1 = (a.x + a.w).min(b.x + b.w);
    let y1 = (a.y + a.h).min(b.y + b.h);
    if x1 < x0 || y1 < y0 {
        None
    } else {
        Some(RectF {
            x: x0,
            y: y0,
            w: x1 - x0,
            h: y1 - y0,
        })
    }
}

fn compute_world_aabb(id: NodeId, cx: &mut Ctx) -> Option<RectF> {
    let node = cx.doc.get(id);
    cx.out.world[id as usize]?; // hidden subtree
    let world = cx.out.world[id as usize].unwrap();
    let own_box = cx.out.box_in_parent[id as usize].unwrap();
    let stroke_outset = effective_stroke_outset(node);
    let local_rect = RectF {
        x: -stroke_outset,
        y: -stroke_outset,
        w: own_box.w + stroke_outset * 2.0,
        h: own_box.h + stroke_outset * 2.0,
    };

    let mut aabb = match node.payload {
        // Derived kinds: bounds come from children only (D-1).
        Payload::Group | Payload::Lens { .. } => None,
        _ => Some(local_rect.transformed_aabb(&world)),
    };
    // The painter clips descendants in the container's transformed local
    // rectangle, but not the container's own fill or strokes. Intersect child
    // contributions with that clip's world AABB so ancestor bounds remain a
    // conservative over-approximation of pixels that can actually survive.
    // A rotated clip remains conservative here; exact polygon clipping is a
    // pick/narrowphase responsibility.
    let child_clip = matches!(
        &node.payload,
        Payload::Frame {
            clips_content: true,
            ..
        }
    )
    .then(|| {
        RectF {
            x: 0.0,
            y: 0.0,
            w: own_box.w,
            h: own_box.h,
        }
        .transformed_aabb(&world)
    });
    let children: Vec<NodeId> = node.children.clone();
    for c in children {
        let child_aabb = compute_world_aabb(c, cx).and_then(|bounds| {
            child_clip.map_or(Some(bounds), |clip| intersect_aabbs(bounds, clip))
        });
        if let Some(child_aabb) = child_aabb {
            aabb = Some(match aabb {
                None => child_aabb,
                Some(a) => a.union(&child_aabb),
            });
        }
    }
    let result = aabb.unwrap_or(RectF::EMPTY);
    cx.out.world_aabb[id as usize] = Some(result);
    Some(result)
}
