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
use crate::model::*;
use crate::path::{materialize, ResolvedPathArtifact};
use crate::properties::ValueView;
use crate::text_layout::{TextLayout, TextLayoutOracle, STUB_TEXT_LAYOUT_ORACLE};
use std::sync::Arc;
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

/// Effective descendant-clip geometry captured by resolution for the spatial
/// read tier. Paint and query therefore consume the same clip decision without
/// querying authored state or an independently pairable [`ValueView`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct ResolvedContentClip {
    pub(crate) corner_radius: RectangularCornerRadius,
    pub(crate) corner_smoothing: CornerSmoothing,
}

const NO_QUERY_CLIP: u32 = u32::MAX;
const NO_QUERY_NODE: u32 = u32::MAX;

/// Compact immutable traversal state needed by the narrowphase. Child order,
/// transparent-select behavior, and effective clipping are frame outputs, not
/// late reads from a possibly newer or differently evaluated document.
///
/// Children and clips live in frame-owned flat pools. Keeping only offsets in
/// this per-slot column avoids one heap-owning `Vec` and one full corner record
/// for every node while preserving a self-contained query snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ResolvedQueryNode {
    children_start: u32,
    children_len: u32,
    content_clip: u32,
    pub(crate) box_is_derived: bool,
}

const UNRESOLVED_QUERY_NODE: ResolvedQueryNode = ResolvedQueryNode {
    children_start: NO_QUERY_NODE,
    children_len: 0,
    content_clip: NO_QUERY_CLIP,
    box_is_derived: false,
};

pub(crate) struct ResolvedQueryNodeView<'a> {
    pub(crate) children: &'a [NodeId],
    pub(crate) box_is_derived: bool,
    pub(crate) content_clip: Option<ResolvedContentClip>,
}

/// The resolved tier is **SOA**: index-aligned columns over the node
/// arena (`NodeId` = index), written once per resolve, read every frame
/// by paint/HUD/pick — the hot half of the hot/cold split (cold intent
/// stays AoS in the arena). `None` = not resolved (hidden subtree).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Resolved {
    /// Unrotated box in parent space (derived kinds: the placed union box).
    pub(crate) box_in_parent: Vec<Option<RectF>>,
    /// parent space ← node space.
    pub(crate) local: Vec<Option<Affine>>,
    pub(crate) world: Vec<Option<Affine>>,
    pub(crate) world_aabb: Vec<Option<RectF>>,
    /// Final-width text layout. `None` for non-text and unresolved nodes.
    pub(crate) text_layouts: Vec<Option<Arc<TextLayout>>>,
    /// Box-mapped path commands and bounds, quantized once for every internal
    /// consumer while retaining the validated unit-reference source.
    pub(crate) resolved_paths: Vec<Option<Arc<ResolvedPathArtifact>>>,
    /// Root and per-node traversal facts for the spatial narrowphase. These
    /// snapshot the exact structure and effective clip state used by this
    /// resolution, so query never pairs the hot columns with another view.
    pub(crate) query_root: Option<NodeId>,
    pub(crate) query_nodes: Vec<ResolvedQueryNode>,
    pub(crate) query_children: Vec<NodeId>,
    pub(crate) query_clips: Vec<ResolvedContentClip>,
    pub reports: Vec<Report>,
}

impl Resolved {
    fn with_capacity(cap: usize) -> Resolved {
        Resolved {
            box_in_parent: vec![None; cap],
            local: vec![None; cap],
            world: vec![None; cap],
            world_aabb: vec![None; cap],
            text_layouts: vec![None; cap],
            resolved_paths: vec![None; cap],
            query_root: None,
            query_nodes: vec![UNRESOLVED_QUERY_NODE; cap],
            query_children: Vec::with_capacity(cap.saturating_sub(1)),
            query_clips: Vec::new(),
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
    pub fn text_layout_of(&self, id: NodeId) -> &Arc<TextLayout> {
        self.text_layouts[id as usize]
            .as_ref()
            .expect("node has no resolved text layout")
    }
    pub fn text_layout_opt(&self, id: NodeId) -> Option<&Arc<TextLayout>> {
        self.text_layouts.get(id as usize)?.as_ref()
    }
    pub fn resolved_path_of(&self, id: NodeId) -> &Arc<ResolvedPathArtifact> {
        self.resolved_paths[id as usize]
            .as_ref()
            .expect("node has no resolved path artifact")
    }
    pub fn resolved_path_opt(&self, id: NodeId) -> Option<&Arc<ResolvedPathArtifact>> {
        self.resolved_paths.get(id as usize)?.as_ref()
    }
    pub(crate) fn query_root(&self) -> Option<NodeId> {
        self.query_root
    }
    pub(crate) fn query_node_opt(&self, id: NodeId) -> Option<ResolvedQueryNodeView<'_>> {
        let node = self.query_nodes.get(id as usize)?;
        if node.children_start == NO_QUERY_NODE {
            return None;
        }
        let start = node.children_start as usize;
        let end = start + node.children_len as usize;
        let content_clip = (node.content_clip != NO_QUERY_CLIP)
            .then(|| self.query_clips[node.content_clip as usize]);
        Some(ResolvedQueryNodeView {
            children: &self.query_children[start..end],
            box_is_derived: node.box_is_derived,
            content_clip,
        })
    }
    /// Bit-exact equality of the resolved spatial traversal/clip snapshot.
    /// Kept as a closed comparison so downstream determinism oracles do not
    /// need access to the private narrowphase representation.
    pub fn query_snapshot_bits_eq(&self, other: &Resolved) -> bool {
        fn scalar(a: f32, b: f32) -> bool {
            a.to_bits() == b.to_bits()
        }
        fn clip(a: ResolvedContentClip, b: ResolvedContentClip) -> bool {
            let a_radii = [
                a.corner_radius.tl.rx,
                a.corner_radius.tl.ry,
                a.corner_radius.tr.rx,
                a.corner_radius.tr.ry,
                a.corner_radius.br.rx,
                a.corner_radius.br.ry,
                a.corner_radius.bl.rx,
                a.corner_radius.bl.ry,
                a.corner_smoothing.value(),
            ];
            let b_radii = [
                b.corner_radius.tl.rx,
                b.corner_radius.tl.ry,
                b.corner_radius.tr.rx,
                b.corner_radius.tr.ry,
                b.corner_radius.br.rx,
                b.corner_radius.br.ry,
                b.corner_radius.bl.rx,
                b.corner_radius.bl.ry,
                b.corner_smoothing.value(),
            ];
            a_radii.into_iter().zip(b_radii).all(|(a, b)| scalar(a, b))
        }
        self.query_root == other.query_root
            && self.query_nodes.len() == other.query_nodes.len()
            && self.query_children == other.query_children
            && self.query_clips.len() == other.query_clips.len()
            && self
                .query_clips
                .iter()
                .copied()
                .zip(other.query_clips.iter().copied())
                .all(|(a, b)| clip(a, b))
            && self
                .query_nodes
                .iter()
                .zip(&other.query_nodes)
                .all(|(a, b)| a == b)
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
    view: &'a ValueView<'a>,
    text_layout: &'a dyn TextLayoutOracle,
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
    resolve_view(&ValueView::base(doc), opts)
}

/// Resolve with an explicit text-layout authority.
pub fn resolve_with_text_layout(
    doc: &Document,
    opts: &ResolveOptions,
    text_layout: &dyn TextLayoutOracle,
) -> Resolved {
    resolve_view_with_text_layout(&ValueView::base(doc), opts, text_layout)
}

/// Resolve one validated authored-plus-property view.
pub fn resolve_view(view: &ValueView<'_>, opts: &ResolveOptions) -> Resolved {
    resolve_view_with_text_layout(view, opts, &STUB_TEXT_LAYOUT_ORACLE)
}

/// Resolve one validated value view with an explicit text-layout authority.
pub fn resolve_view_with_text_layout(
    view: &ValueView<'_>,
    opts: &ResolveOptions,
    text_layout: &dyn TextLayoutOracle,
) -> Resolved {
    let doc = view.document();
    if !view.active(doc.root) {
        return Resolved::with_capacity(doc.capacity());
    }
    let mut cx = Ctx {
        view,
        text_layout,
        opts: *opts,
        out: Resolved::with_capacity(doc.capacity()),
        union_cache: vec![None; doc.capacity()],
        ops_cache: vec![None; doc.capacity()],
    };
    cx.out.query_root = Some(doc.root);
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

    // Store one final artifact per text node using the width that survived
    // layout, stretch, and clamps. No later stage may independently reflow it.
    for index in 0..doc.capacity() {
        let id = index as NodeId;
        let Some(node) = doc.get_opt(id) else {
            continue;
        };
        let Some(text) = node.payload.as_text() else {
            continue;
        };
        let Some(box_in_parent) = cx.out.box_opt(id) else {
            continue;
        };
        let layout = cx
            .text_layout
            .layout(text, Some(box_in_parent.w))
            .with_assigned_box(RectF {
                x: 0.0,
                y: 0.0,
                w: box_in_parent.w,
                h: box_in_parent.h,
            });
        if layout.unresolved_glyphs > 0 {
            cx.out.reports.push(Report::ErrorByRule {
                node: id,
                field: "text",
                rule: "text layout contains unresolved glyphs",
            });
        }
        cx.out.text_layouts[index] = Some(layout);
    }

    // Path syntax was analyzed once at the model boundary. Resolution maps
    // every coordinate through the final box exactly once; paint, bounds, and
    // damage then consume that same rounded command stream.
    for index in 0..doc.capacity() {
        let id = index as NodeId;
        let Some(node) = doc.get_opt(id) else {
            continue;
        };
        let Payload::Shape {
            desc: ShapeDesc::Path(artifact),
        } = &node.payload
        else {
            continue;
        };
        if let Some(box_in_parent) = cx.out.box_opt(id) {
            match materialize(Arc::clone(artifact), box_in_parent.w, box_in_parent.h) {
                Ok(path) => cx.out.resolved_paths[index] = Some(path),
                Err(_) => cx.out.reports.push(Report::ErrorByRule {
                    node: id,
                    field: "path",
                    rule: "resolved path coordinates exceed finite f32 geometry",
                }),
            }
        }
    }

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
    let node = cx.view.document().get(id);

    if node.payload.box_is_derived() {
        // width/height intents are ignored-by-rule on derived kinds (§8).
        if !matches!(cx.view.authored_width(id), SizeIntent::Auto)
            || !matches!(cx.view.authored_height(id), SizeIntent::Auto)
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
    let span_w = span_extent(id, cx.view.x(id), parent_extent.map(|e| e.0), "x", cx);
    let span_h = span_extent(id, cx.view.y(id), parent_extent.map(|e| e.1), "y", cx);

    let is_line = matches!(
        node.payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        }
    );
    let mut w = span_w;
    let mut h = if is_line { Some(0.0) } else { span_h };
    let text_auto_height = node.payload.as_text().is_some()
        && h.is_none()
        && matches!(cx.view.height_unchecked(id), SizeIntent::Auto);

    if w.is_none() {
        w = intent_extent_x(id, cx);
    }
    if h.is_none() && !text_auto_height {
        h = intent_extent_y(id, cx);
    }

    // aspect_ratio resolves an under-specified axis only (G-5).
    let aspect_ratio = matches!(
        node.payload,
        Payload::Shape {
            desc: ShapeDesc::Rect | ShapeDesc::Ellipse | ShapeDesc::Path(_)
        }
    )
    .then(|| cx.view.aspect_ratio_unchecked(id))
    .flatten();
    if let Some((ar_w, ar_h)) = aspect_ratio {
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
        cx.view.min_width_unchecked(id),
        cx.view.max_width_unchecked(id),
        cx,
    );
    if text_auto_height {
        let node = cx.view.document().get(id);
        let Some(text) = node.payload.as_text() else {
            unreachable!("text_auto_height is set only for text")
        };
        let wrap_width = if span_w.is_some()
            || matches!(cx.view.width_unchecked(id), SizeIntent::Fixed(_))
            || width_before_clamp.is_some_and(|before| wv < before)
        {
            Some(wv)
        } else {
            // Auto width with no narrowing constraint keeps its no-soft-wrap
            // contract; passing the computed natural width back through a
            // floating-point floor can otherwise invent a wrap.
            None
        };
        h = Some(cx.text_layout.layout(text, wrap_width).height);
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
    if !is_line {
        hv = clamp_axis(
            id,
            "height",
            hv,
            cx.view.min_height_unchecked(id),
            cx.view.max_height_unchecked(id),
            cx,
        );
    }
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
    let node = cx.view.document().get(id);
    match cx.view.width_unchecked(id) {
        SizeIntent::Fixed(v) => Some(v),
        SizeIntent::Auto => match &node.payload {
            payload if payload.as_text().is_some() => Some(
                cx.text_layout
                    .layout(payload.as_text().expect("matched text"), None)
                    .width,
            ),
            Payload::Frame { .. } => Some(hug_size(id, cx).0),
            _ => None,
        },
    }
}

/// Natural height per kind. Auto-height text is deliberately absent here: it
/// remeasures after final width constraints in [`extent_of`].
fn intent_extent_y(id: NodeId, cx: &mut Ctx) -> Option<f32> {
    let node = cx.view.document().get(id);
    match cx.view.height_unchecked(id) {
        SizeIntent::Fixed(v) => Some(v),
        SizeIntent::Auto => match &node.payload {
            Payload::Frame { .. } => Some(hug_size(id, cx).1),
            _ => None,
        },
    }
}

/// Hug (frame + Auto): the frame's natural content size (L-E1: padding box).
fn hug_size(id: NodeId, cx: &mut Ctx) -> (f32, f32) {
    let node = cx.view.document().get(id);
    let layout = cx.view.layout(id);
    match layout.mode {
        LayoutMode::Flex => {
            let definite_w = match cx.view.width_unchecked(id) {
                SizeIntent::Fixed(v) => Some(v),
                SizeIntent::Auto => None,
            };
            let definite_h = match cx.view.height_unchecked(id) {
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
                if !cx.view.active(child_id) {
                    continue;
                }
                let (cw, ch) = extent_of(child_id, None, cx);
                let is_derived = cx.view.document().get(child_id).payload.box_is_derived();
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
                let ox = start_offset_or_report(child_id, cx.view.x(child_id), "x", cx);
                let oy = start_offset_or_report(child_id, cx.view.y(child_id), "y", cx);
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
                    let theta = cx.view.rotation(child_id);
                    let (cfx, cfy) = (cx.view.flip_x(child_id), cx.view.flip_y(child_id));
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
    let node = cx.view.document().get(id);
    if node.payload.box_is_derived() {
        let u = cx.union_cache[id as usize].unwrap_or(RectF::EMPTY);
        let ox = match cx.view.x(id) {
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
        let oy = match cx.view.y(id) {
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
    let x = match cx.view.x(id) {
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
    let y = match cx.view.y(id) {
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
    let children: Vec<NodeId> = cx.view.document().get(id).children.clone();
    let mut union: Option<RectF> = None;
    for child_id in children {
        if !cx.view.active(child_id) {
            continue;
        }
        // Children of derived-box parents resolve against no extent:
        // Start pins only (declared; others reported by start_offset_or_report).
        let (cw, ch) = extent_of(child_id, None, cx);
        // Derived children: pins place the ORIGIN; the box = origin + own
        // union offset (census fix: nested unions must not swallow it).
        let derived_off = if cx.view.document().get(child_id).payload.box_is_derived() {
            let u = cx.union_cache[child_id as usize].unwrap_or(RectF::EMPTY);
            (u.x, u.y)
        } else {
            (0.0, 0.0)
        };
        let ox = start_offset_or_report(child_id, cx.view.x(child_id), "x", cx) + derived_off.0;
        let oy = start_offset_or_report(child_id, cx.view.y(child_id), "y", cx) + derived_off.1;
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
    let node = cx.view.document().get(id);
    let theta = cx.view.rotation(id);
    let (fx, fy) = (cx.view.flip_x(id), cx.view.flip_y(id));

    let content_clip = if matches!(node.payload, Payload::Frame { .. }) && cx.view.clips_content(id)
    {
        Some(ResolvedContentClip {
            corner_radius: cx.view.corner_radius(id),
            corner_smoothing: cx.view.corner_smoothing_unchecked(id),
        })
    } else {
        None
    };
    let children_start = u32::try_from(cx.out.query_children.len())
        .expect("resolved query child pool exceeds the NodeId address space");
    assert_ne!(
        children_start, NO_QUERY_NODE,
        "resolved query child pool exhausted"
    );
    let children_len = u32::try_from(node.children.len())
        .expect("one resolved node has more children than NodeId can address");
    cx.out.query_children.extend_from_slice(&node.children);
    let content_clip = match content_clip {
        Some(clip) => {
            let index = u32::try_from(cx.out.query_clips.len())
                .expect("resolved query clip pool exceeds the NodeId address space");
            assert_ne!(index, NO_QUERY_CLIP, "resolved query clip pool exhausted");
            cx.out.query_clips.push(clip);
            index
        }
        None => NO_QUERY_CLIP,
    };
    cx.out.query_nodes[id as usize] = ResolvedQueryNode {
        children_start,
        children_len,
        box_is_derived: node.payload.box_is_derived(),
        content_clip,
    };

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
    let child_program = match &cx.view.document().get(id).payload {
        Payload::Frame { .. } => ChildProgram::Frame(cx.view.layout(id)),
        Payload::Shape { .. } => ChildProgram::Free,
        Payload::Group | Payload::Lens { .. } => ChildProgram::Derived,
        Payload::Text { .. } | Payload::AttributedText { .. } => ChildProgram::Leaf,
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
            if !cx.view.document().get(id).children.is_empty() {
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
            let children: Vec<NodeId> = cx.view.document().get(id).children.clone();
            let out = flex_layout(id, layout, (Some(extent.0), Some(extent.1)), cx);
            for (child_id, slot, basis) in out.slots {
                let child = cx.view.document().get(child_id);
                let theta = cx.view.rotation(child_id);
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
                            .then(&Affine::flip(
                                cx.view.flip_x(child_id),
                                cx.view.flip_y(child_id),
                            ))
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
                if !cx.view.active(child_id) || cx.view.flow(child_id) != Flow::Absolute {
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
    let children: Vec<NodeId> = cx.view.document().get(id).children.clone();
    for child_id in children {
        if !cx.view.active(child_id) {
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
    if cx.view.grow(id) != 0.0 {
        cx.out.reports.push(Report::IgnoredByRule {
            node: id,
            field: "grow",
            rule: "no layout parent",
        });
    }
    if cx.view.self_align(id) != SelfAlign::Auto {
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

struct TextCtx(Payload);

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
    let children: Vec<NodeId> = cx.view.document().get(id).children.clone();

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
        let child = cx.view.document().get(*child_id);
        if !cx.view.active(*child_id) || cx.view.flow(*child_id) == Flow::Absolute {
            continue;
        }
        // §8: x/y are ignored-by-rule under flow (layout owns them).
        if cx.view.x(*child_id) != AxisBinding::default()
            || cx.view.y(*child_id) != AxisBinding::default()
        {
            cx.out.reports.push(Report::IgnoredByRule {
                node: *child_id,
                field: "x/y",
                rule: "in-flow under flex: layout owns position",
            });
        }
        let theta = cx.view.rotation(*child_id);
        let rotated = theta.rem_euclid(360.0) != 0.0;
        let contribute_aabb =
            rotated && cx.opts.rotation_in_flow == RotationInFlow::AabbParticipates;

        let mut style = Style {
            // leaf display: taffy default (flex); Block distorts intrinsic sizing
            flex_shrink: 0.0, // X-SELF-8: canvas items don't shrink implicitly
            flex_grow: if main_is_definite {
                cx.view.grow(*child_id)
            } else {
                0.0
            },
            align_self: match cx.view.self_align(*child_id) {
                SelfAlign::Auto => None,
                SelfAlign::Start => Some(AlignSelf::Start),
                SelfAlign::Center => Some(AlignSelf::Center),
                SelfAlign::End => Some(AlignSelf::End),
                SelfAlign::Stretch => Some(AlignSelf::Stretch),
            },
            ..Style::default()
        };
        let box_is_derived = child.payload.box_is_derived();
        let is_line = matches!(
            child.payload,
            Payload::Shape {
                desc: ShapeDesc::Line
            }
        );
        if !box_is_derived {
            if let Some(v) = cx.view.min_width_unchecked(*child_id) {
                style.min_size.width = length(v);
            }
            if let Some(v) = cx.view.max_width_unchecked(*child_id) {
                style.max_size.width = length(v);
            }
            // Line height is geometry-locked to zero, so height constraints
            // are not registered properties for that kind.
            if !is_line {
                if let Some(v) = cx.view.min_height_unchecked(*child_id) {
                    style.min_size.height = length(v);
                }
                if let Some(v) = cx.view.max_height_unchecked(*child_id) {
                    style.max_size.height = length(v);
                }
            }
        }

        let is_text = child.payload.as_text().is_some();
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
            let text_payload = child.payload.clone();
            match cx.view.width_unchecked(*child_id) {
                SizeIntent::Fixed(v) => style.size.width = length(v),
                SizeIntent::Auto => style.size.width = auto(),
            }
            match cx.view.height_unchecked(*child_id) {
                SizeIntent::Fixed(v) => style.size.height = length(v),
                SizeIntent::Auto => style.size.height = auto(),
            }
            // Per-child stretch is an explicit cross-axis fill override, even
            // when text authored a fixed cross size. Container-level stretch
            // still applies only to the Auto values left above.
            if cx.view.self_align(*child_id) == SelfAlign::Stretch {
                match layout.direction {
                    Direction::Row => style.size.height = auto(),
                    Direction::Column => style.size.width = auto(),
                }
            }
            basis = (0.0, 0.0); // unused for θ=0 slots
            tree.new_leaf_with_context(style, TextCtx(text_payload))
                .unwrap()
        } else {
            let b = extent_of(*child_id, None, cx);
            basis = b;
            style.size.width = length(b.0);
            style.size.height = length(b.1);
            // An explicit per-child stretch overrides even a fixed cross size.
            // Container-level stretch applies only when the effective cross
            // size remains Auto; retaining the resolved basis as Definite here
            // would erase that effective intent before Taffy sees it.
            // A line's vertical extent is geometry, not a flex-owned box
            // axis. Even explicit self-stretch cannot turn its locked zero
            // height into a non-degenerate paint box in a row container.
            let line_height_is_locked = layout.direction == Direction::Row && is_line;
            let cross_is_auto = !box_is_derived
                && match layout.direction {
                    Direction::Row if line_height_is_locked => false,
                    Direction::Row => {
                        matches!(cx.view.height_unchecked(*child_id), SizeIntent::Auto)
                    }
                    Direction::Column => {
                        matches!(cx.view.width_unchecked(*child_id), SizeIntent::Auto)
                    }
                };
            let stretches_cross = !line_height_is_locked
                && (cx.view.self_align(*child_id) == SelfAlign::Stretch
                    || (!box_is_derived
                        && cx.view.self_align(*child_id) == SelfAlign::Auto
                        && layout.cross_align == CrossAlign::Stretch
                        && cross_is_auto));
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
                    let text_layout = cx.text_layout.layout(
                        t.0.as_text().expect("text measure context carries text"),
                        constraint,
                    );
                    taffy::geometry::Size {
                        width: known.width.unwrap_or(text_layout.width),
                        height: known.height.unwrap_or(text_layout.height),
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
    let children: Vec<NodeId> = cx.view.document().get(id).children.clone();
    for c in children {
        if cx.out.local[c as usize].is_some() {
            compose_world(c, child_basis, cx);
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct StrokeOutsets {
    top: f32,
    right: f32,
    bottom: f32,
    left: f32,
}

impl StrokeOutsets {
    fn include(&mut self, other: StrokeOutsets) {
        self.top = self.top.max(other.top);
        self.right = self.right.max(other.right);
        self.bottom = self.bottom.max(other.bottom);
        self.left = self.left.max(other.left);
    }
}

/// Maximum outward coverage contributed by authored strokes in node-local
/// coordinates. Layout remains based on the source box; only visual bounds
/// read this expansion. Repeated stroke geometries overlap independently, so
/// each edge takes their maximum outward reach rather than summing widths.
fn effective_stroke_outsets(id: NodeId, node: &Node, view: &ValueView<'_>) -> StrokeOutsets {
    if matches!(node.payload, Payload::Group | Payload::Lens { .. }) {
        return StrokeOutsets::default();
    }
    let is_line = matches!(
        &node.payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        }
    );
    let is_path = matches!(
        &node.payload,
        Payload::Shape {
            desc: ShapeDesc::Path(_)
        }
    );
    let mut outsets = StrokeOutsets::default();
    let corner_smoothing = if matches!(
        node.payload,
        Payload::Frame { .. }
            | Payload::Shape {
                desc: ShapeDesc::Rect
            }
    ) {
        view.corner_smoothing_unchecked(id)
    } else {
        CornerSmoothing::default()
    };
    for stroke in view
        .strokes_unchecked(id)
        .iter()
        .filter(|stroke| stroke.renderable_for(&node.payload, corner_smoothing))
    {
        let widths = stroke.width.rectangular();
        let mut factor = if is_line {
            0.5
        } else {
            match stroke.align {
                StrokeAlign::Inside => 0.0,
                StrokeAlign::Center => 0.5,
                StrokeAlign::Outside => 1.0,
            }
        };
        if (node.payload.as_text().is_some() || is_path) && stroke.join == StrokeJoin::Miter {
            factor *= stroke.miter_limit;
        }
        outsets.include(StrokeOutsets {
            top: widths.stroke_top_width * factor,
            right: widths.stroke_right_width * factor,
            bottom: widths.stroke_bottom_width * factor,
            left: widths.stroke_left_width * factor,
        });
    }
    outsets
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
    let node = cx.view.document().get(id);
    cx.out.world[id as usize]?; // hidden subtree
    let world = cx.out.world[id as usize].unwrap();
    let own_box = cx.out.box_in_parent[id as usize].unwrap();
    let stroke_outsets = effective_stroke_outsets(id, node, cx.view);
    // Text owns glyph ink, not its assigned layout box. The layout box still
    // drives placement and paint-coordinate normalization, while visual
    // bounds begin at the oracle's base ink and expand by the same authored
    // stroke coverage as every other outline. No base ink means there is no
    // glyph outline for a stroke to cover (not even for an empty terminal
    // line), so it remains a zero-area local bound.
    let base_local_rect = if node.payload.as_text().is_some() {
        cx.out
            .text_layout_opt(id)
            .expect("resolved text has a final text-layout artifact")
            .ink_bounds
    } else if matches!(
        &node.payload,
        Payload::Shape {
            desc: ShapeDesc::Path(_)
        }
    ) {
        cx.out.resolved_path_opt(id).map(|path| path.local_bounds)
    } else {
        Some(RectF {
            x: 0.0,
            y: 0.0,
            w: own_box.w,
            h: own_box.h,
        })
    };
    let local_rect = base_local_rect.map(|base| RectF {
        x: base.x - stroke_outsets.left,
        y: base.y - stroke_outsets.top,
        w: base.w + stroke_outsets.left + stroke_outsets.right,
        h: base.h + stroke_outsets.top + stroke_outsets.bottom,
    });

    let mut aabb = match &node.payload {
        // Derived kinds: bounds come from children only (D-1).
        Payload::Group | Payload::Lens { .. } => None,
        Payload::Shape {
            desc: ShapeDesc::Path(_),
        } if local_rect.is_none() => None,
        _ => Some(local_rect.unwrap_or(RectF::EMPTY).transformed_aabb(&world)),
    };
    // The painter clips descendants in the container's transformed local
    // rectangle, but not the container's own fill or strokes. Intersect child
    // contributions with that clip's world AABB so ancestor bounds remain a
    // conservative over-approximation of pixels that can actually survive.
    // A rotated clip remains conservative here; exact polygon clipping is a
    // pick/narrowphase responsibility.
    let child_clip = (matches!(&node.payload, Payload::Frame { .. }) && cx.view.clips_content(id))
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
