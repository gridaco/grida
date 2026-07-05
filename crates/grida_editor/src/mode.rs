//! Edit mode — the exclusive nested-editing slot and its dispatch
//! (`docs/wg/canvas/edit-mode.md`, `MODE-*`).
//!
//! One slot: at most one nested editing context is active. The slot
//! and the enter-idiom dispatch live library-side so the `MODE-*`
//! contracts are headless; the shell holds an [`EditMode`] field and
//! translates window events.
//!
//! The flatten row is live: [`flatten_to_vector`] turns a
//! path-reducible primitive into its rendered-outline Vector twin
//! (one recorded, undoable entry), and the enter idiom proceeds into
//! the vector mode — entering is a commitment (`vector-edit.md`).
//!
//! **Deferred members, named (no fakes):** the paint sessions
//! (gradient, image) are dispatch rows here — the resolution *order*
//! is contract-bound (MODE-2) — but their shell handling is a named
//! no-op until they are implemented. The width facet (MODE-4) is
//! deferred with them. Text remains an engine-owned session: the
//! slot tracks it for exclusivity; the shell owns the live session
//! and its reconcile.

use crate::document::{self, Fragment, Id, Mutation};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::vector::mode::VectorMode;

use grida::node::schema::{Node, NodeTrait};

/// The slot: at most one active mode (`MODE-1`).
#[derive(Default)]
pub enum EditMode {
    #[default]
    None,
    /// Mirror of the engine-owned text session (exclusivity only; the
    /// shell owns the live session).
    Text { id: Id },
    /// The vector content mode (boxed: the machine dwarfs the enum).
    Vector(Box<VectorMode>),
}

impl EditMode {
    /// Whether any mode is active.
    pub fn is_active(&self) -> bool {
        !matches!(self, EditMode::None)
    }

    /// The active mode's subject node (`MODE-6` pinning).
    pub fn subject(&self) -> Option<&Id> {
        match self {
            EditMode::None => None,
            EditMode::Text { id } => Some(id),
            EditMode::Vector(mode) => Some(mode.node()),
        }
    }

    /// Install `next`, running the previous mode's **full exit** first
    /// (`MODE-1`: cleanup included, nothing abandoned; no observable
    /// state holds two modes). Returns the exited vector mode's
    /// outcome, when there was one. A `Text` occupant only clears here
    /// — its live session is engine-owned and the shell reconciles it
    /// before calling.
    pub fn replace(
        &mut self,
        editor: &mut Editor,
        next: EditMode,
    ) -> Option<crate::vector::mode::ExitOutcome> {
        let prev = std::mem::replace(self, EditMode::None);
        let out = match prev {
            EditMode::Vector(mode) => Some(mode.exit(editor)),
            EditMode::Text { .. } | EditMode::None => None,
        };
        *self = next;
        out
    }
}

/// What the enter idiom resolves to for a node — the MODE-2 dispatch
/// table as data. Rows exist for the deferred members so the
/// resolution order is testable; `Text`, `Vector`, and
/// `FlattenThenVector` have live handling.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnterDispatch {
    /// Text content mode (engine session).
    Text(Id),
    /// Image paint session — user intent: "edit the image". Deferred;
    /// the row exists because its *priority over the vector row* is
    /// the contract (MODE-2).
    ImagePaintSession(Id),
    /// Vector content mode.
    Vector(Id),
    /// Path-reducible primitive: flatten ([`flatten_to_vector`]),
    /// then vector mode — entry is a commitment.
    FlattenThenVector(Id),
    /// Not enterable — Enter falls through to select-children
    /// (`traversal.md` TRAV-1).
    NotEnterable,
}

/// Resolve the enter idiom for `id` per the MODE-2 dispatch table, in
/// order: text → image-fill → vector → path-reducible primitive →
/// not enterable.
pub fn dispatch_enter(editor: &Editor, id: &Id) -> EnterDispatch {
    let Some(node) = editor.document().node_record(id) else {
        return EnterDispatch::NotEnterable;
    };
    if matches!(node, Node::TextSpan(_)) {
        return EnterDispatch::Text(id.clone());
    }
    // The image-fill row outranks the vector row: double-clicking an
    // image-filled shape means "edit the image", not its geometry.
    if document::node_has_image_fill(node) && is_geometry_kind(node) {
        return EnterDispatch::ImagePaintSession(id.clone());
    }
    if matches!(node, Node::Vector(_)) {
        return EnterDispatch::Vector(id.clone());
    }
    if is_path_reducible(node) {
        return EnterDispatch::FlattenThenVector(id.clone());
    }
    EnterDispatch::NotEnterable
}

/// Kinds whose image fill routes Enter to the image paint session:
/// the paintable geometry kinds of the dispatch table (shapes and
/// vectors — not containers, whose fill is a surface, not content).
fn is_geometry_kind(node: &Node) -> bool {
    matches!(
        node,
        Node::Rectangle(_)
            | Node::Ellipse(_)
            | Node::Polygon(_)
            | Node::RegularPolygon(_)
            | Node::RegularStarPolygon(_)
            | Node::Vector(_)
            | Node::Path(_)
    )
}

/// Path-reducible primitives: flatten on entry (`vector-edit.md` —
/// entering is a commitment).
fn is_path_reducible(node: &Node) -> bool {
    matches!(
        node,
        Node::Rectangle(_)
            | Node::Ellipse(_)
            | Node::Polygon(_)
            | Node::RegularPolygon(_)
            | Node::RegularStarPolygon(_)
            | Node::Line(_)
    )
}

/// Flatten a path-reducible primitive to a Vector node **in place**
/// (the dispatch table's flatten row; `vector-edit.md` — entering the
/// mode is a commitment). The engine's own shape builder produces the
/// outline, so the network is exactly what was rendered; identity
/// (id, name, tree position), transform, paints, and stroke style
/// survive. One recorded entry — undo restores the primitive.
pub fn flatten_to_vector(editor: &mut Editor, id: &Id) -> bool {
    let Some(fragment) = editor.document().capture(id) else {
        return false;
    };
    let Some(node) = flattened_node(&fragment.node) else {
        return false;
    };
    let Some(parent) = editor.document().node_parent(id) else {
        return false;
    };
    let Some(index) = editor
        .children(parent.as_ref())
        .iter()
        .position(|c| c == id)
    else {
        return false;
    };
    editor
        .dispatch(
            vec![
                Mutation::Remove { id: id.clone() },
                Mutation::Insert {
                    parent,
                    index,
                    fragment: Box::new(Fragment {
                        id: id.clone(),
                        name: fragment.name,
                        node,
                        children: Vec::new(),
                    }),
                },
            ],
            Origin::Local,
            Recording::Record {
                label: Some("flatten".to_string()),
            },
        )
        .is_ok()
}

/// Flatten a multi-node selection: combine each
/// [selection partition](../../../docs/wg/canvas/ux-surface/selection-partition.md)'s
/// flattenable members into one baked vector, **per partition**
/// (`FLAT-1`). Destructive — the originals are removed; non-flattenable
/// members are left in place (`FLAT-2`). One recorded entry restores the
/// originals on undo (`FLAT-3`). Returns `false` when nothing flattens.
///
/// Flattenable here = the path-reducible primitives (via the shape
/// builder), **vector** nodes (their own network is used directly, as
/// the web's `self_flattenNode` does), and **text** — which is
/// delegated to `outline`, the same glyph-outline conversion
/// [`create_outlines`] uses (so "flatten everything" on mixed type +
/// shapes bakes the text into the union too). A text member whose
/// `outline` yields nothing is left unflattened (`FLAT-2` — no font
/// backend, never approximated); headless callers pass `|_| None` and
/// text is skipped. Boolean is still deferred (path-boolean eval).
///
/// Everything combines in the shared **parent** frame (a partition's
/// members share a parent), so the result is a sibling of the originals
/// and world position is preserved for any parent transform. `mint`
/// yields the new vector's stable id. This is the multi-select command;
/// [`flatten_to_vector`] is the single-node, mode-entry twin.
pub fn flatten_selection(
    editor: &mut Editor,
    selection: &[Id],
    mut mint: impl FnMut() -> Id,
    outline: impl Fn(&Id) -> Option<grida::vectornetwork::VectorNetwork>,
) -> bool {
    let mut muts: Vec<Mutation> = Vec::new();

    for (parent, members) in editor.document().partition_selection(selection) {
        // The members whose geometry can be baked; the rest stay put
        // (`FLAT-2`). Each carries its own network + transform.
        let baked: Vec<(Id, grida::node::schema::VectorNodeRec)> = members
            .iter()
            .filter_map(|m| {
                let node = editor.document().capture(m)?.node;
                Some((m.clone(), member_flatten_form(&node, m, &outline)?))
            })
            .collect();
        if baked.is_empty() {
            continue;
        }

        // Bake each member's own transform into its network and combine,
        // all in the shared parent frame.
        let mut combined = grida::vectornetwork::VectorNetwork::default();
        let mut base = None;
        for (_, v) in &baked {
            let mut net = v.network.clone();
            crate::vector::ops::apply_affine(&mut net, &v.transform);
            crate::vector::ops::append(&mut combined, &net);
            // The first flattenable member donates the style (`FLAT-1`).
            if base.is_none() {
                base = Some(v.clone());
            }
        }
        let Some(mut vnode) = base else {
            continue;
        };

        // Normalize: the node sits at the combined vertex-bbox origin (in
        // the parent frame), the network re-anchored to the node's local
        // origin — world position preserved (`FLAT-3`).
        let (ox, oy) = vertex_bbox_origin(&combined);
        crate::vector::ops::translate(&mut combined, (-ox, -oy));
        vnode.network = combined;
        vnode.transform = math2::transform::AffineTransform::new(ox, oy, 0.0);

        // Insert at the partition's frontmost flattenable slot, then
        // remove the originals.
        let siblings = editor.children(parent.as_ref());
        let index = baked
            .iter()
            .filter_map(|(m, _)| siblings.iter().position(|s| s == m))
            .min()
            .unwrap_or(siblings.len());
        muts.push(Mutation::Insert {
            parent: parent.clone(),
            index,
            fragment: Box::new(Fragment {
                id: mint(),
                name: None,
                node: Node::Vector(vnode),
                children: Vec::new(),
            }),
        });
        for (m, _) in &baked {
            muts.push(Mutation::Remove { id: m.clone() });
        }
    }

    if muts.is_empty() {
        return false;
    }
    editor
        .dispatch(
            muts,
            Origin::Local,
            Recording::Record {
                label: Some("flatten".to_string()),
            },
        )
        .is_ok()
}

/// The member's baked vector form for the flatten command: a vector node
/// keeps its own network directly (as the web's `self_flattenNode` does);
/// a path-reducible primitive is converted by the shape builder
/// ([`flattened_node`]). `None` for members outside the command's
/// flattenable set.
///
/// Text (`tspan`) and boolean are in the web's `FLATTENABLE_NODE_TYPES`
/// but their non-wasm conversion returns `null` there too — text needs a
/// glyph-outline backend, boolean needs its evaluated path baked
/// (path-boolean ops). Both are deferred here, named not omitted
/// (`FLAT-2`; boolean-bake is `FLAT-4`).
fn member_as_vector(node: &Node) -> Option<grida::node::schema::VectorNodeRec> {
    match node {
        Node::Vector(v) => Some(v.clone()),
        _ => match flattened_node(node)? {
            Node::Vector(v) => Some(v),
            _ => None,
        },
    }
}

/// Whether a node's kind can be baked by the flatten command — a
/// path-reducible primitive or a vector node (the coarse type gate,
/// mirroring the web's `supportsFlatten`). Text is *also* flattenable
/// but only via the `outline` backend, so it is not in this coarse gate.
fn is_flatten_member(node: &Node) -> bool {
    matches!(node, Node::Vector(_)) || is_path_reducible(node)
}

/// A flatten member's baked vector form: geometry kinds via
/// [`member_as_vector`]; a **text** node via `outline` (the shared
/// glyph-outline conversion) wrapped by [`text_outline_node`]. `None`
/// for a non-flattenable member, or a text member with no outline
/// (`outline` returned `None`/empty — no font backend, `FLAT-2`).
fn member_flatten_form(
    node: &Node,
    id: &Id,
    outline: &impl Fn(&Id) -> Option<grida::vectornetwork::VectorNetwork>,
) -> Option<grida::node::schema::VectorNodeRec> {
    if matches!(node, Node::TextSpan(_)) {
        let network = outline(id)?;
        if network.vertices.is_empty() {
            return None;
        }
        return match text_outline_node(node, network)? {
            Node::Vector(v) => Some(v),
            _ => None,
        };
    }
    member_as_vector(node)
}

/// Whether flattening `selection` would bake at least one member — the
/// enablement gate for the multi-select flatten command (`CTX-2`:
/// enabled iff the command has an effect). Unlike [`flattenable`] (the
/// single-node, primitive-only mode-entry twin), this spans the whole
/// selection and includes vector nodes.
pub fn can_flatten(doc: &crate::document::WorkingCopy, selection: &[Id]) -> bool {
    selection
        .iter()
        .filter_map(|id| doc.node_record(id))
        .any(is_flatten_member)
}

/// Whether the selection has a text node to outline — the enablement
/// gate for the Create Outlines command (`CTX-2`).
pub fn can_create_outlines(doc: &crate::document::WorkingCopy, selection: &[Id]) -> bool {
    selection
        .iter()
        .any(|id| matches!(doc.node_record(id), Some(Node::TextSpan(_))))
}

/// Create Outlines — convert each selected **text** node into a vector
/// of its laid-out glyph outlines, **in place** (`OUTL-1`): same id,
/// name, tree position, and transform; the paragraph fills carry.
/// Per-node, never unioned (`OUTL-4`); non-text members are left
/// unchanged. One recorded entry restores the text on undo (`OUTL-5`).
///
/// `outline` yields a text node's glyph-outline network — the shell
/// backs it with the renderer's fonts (`Renderer::outline_text_node`);
/// headless callers stub it. A node whose outline is `None` or empty is
/// left unchanged (`OUTL-3` — font/backend unavailable, never
/// approximated). Returns `false` when nothing converts.
pub fn create_outlines(
    editor: &mut Editor,
    selection: &[Id],
    outline: impl Fn(&Id) -> Option<grida::vectornetwork::VectorNetwork>,
) -> bool {
    let mut muts: Vec<Mutation> = Vec::new();
    for id in selection {
        let Some(frag) = editor.document().capture(id) else {
            continue;
        };
        if !matches!(frag.node, Node::TextSpan(_)) {
            continue; // text-only (`OUTL-1`)
        }
        let Some(network) = outline(id) else {
            continue; // no backend / no fonts (`OUTL-3`)
        };
        if network.vertices.is_empty() {
            continue;
        }
        let Some(node) = text_outline_node(&frag.node, network) else {
            continue;
        };
        let Some(parent) = editor.document().node_parent(id) else {
            continue;
        };
        let Some(index) = editor
            .children(parent.as_ref())
            .iter()
            .position(|c| c == id)
        else {
            continue;
        };
        // Replace in place at the same id (`OUTL-1`), like
        // `flatten_to_vector`.
        muts.push(Mutation::Remove { id: id.clone() });
        muts.push(Mutation::Insert {
            parent,
            index,
            fragment: Box::new(Fragment {
                id: id.clone(),
                name: frag.name,
                node,
                children: Vec::new(),
            }),
        });
    }
    if muts.is_empty() {
        return false;
    }
    editor
        .dispatch(
            muts,
            Origin::Local,
            Recording::Record {
                label: Some("create outlines".to_string()),
            },
        )
        .is_ok()
}

/// Build the vector twin of a text node from its outlined `network`:
/// the text's identity-carrying props (transform, fills, strokes,
/// opacity, blend) survive; the geometry is the glyph outlines. `None`
/// for a non-text node.
fn text_outline_node(node: &Node, network: grida::vectornetwork::VectorNetwork) -> Option<Node> {
    use grida::cg::prelude::*;
    let Node::TextSpan(t) = node else {
        return None;
    };
    Some(Node::Vector(grida::node::schema::VectorNodeRec {
        active: t.active,
        opacity: t.opacity,
        blend_mode: t.blend_mode,
        mask: None,
        effects: grida::node::schema::LayerEffects::default(),
        transform: t.transform,
        network,
        corner_radius: 0.0,
        fills: t.fills.clone(),
        strokes: t.strokes.clone(),
        stroke_width: t.stroke_width,
        stroke_width_profile: None,
        stroke_align: t.stroke_align,
        stroke_cap: StrokeCap::default(),
        stroke_join: StrokeJoin::default(),
        stroke_miter_limit: StrokeMiterLimit::default(),
        stroke_dash_array: None,
        marker_start_shape: StrokeMarkerPreset::default(),
        marker_end_shape: StrokeMarkerPreset::default(),
        layout_child: t.layout_child.clone(),
    }))
}

/// The min corner of a network's vertex bounds — where a flattened node
/// re-anchors its local origin. `(0, 0)` for an empty network.
fn vertex_bbox_origin(net: &grida::vectornetwork::VectorNetwork) -> (f32, f32) {
    net.vertices
        .iter()
        .fold(None, |acc: Option<(f32, f32)>, &(x, y)| {
            Some(match acc {
                None => (x, y),
                Some((mx, my)) => (mx.min(x), my.min(y)),
            })
        })
        .unwrap_or((0.0, 0.0))
}

/// Non-mutating capability twin of [`flatten_to_vector`] — the
/// context menu's enablement predicate (`CTX-2`: an enabled item's
/// command succeeds; these are the same gates, asked without
/// dispatching).
pub fn flattenable(doc: &crate::document::WorkingCopy, id: &Id) -> bool {
    doc.capture(id)
        .as_ref()
        .is_some_and(|fragment| flattened_node(&fragment.node).is_some())
        && doc.node_parent(id).is_some()
}

/// The primitive's Vector twin: the engine-rendered outline as a
/// network, style preserved. `None` for kinds outside the
/// path-reducible set.
fn flattened_node(node: &Node) -> Option<Node> {
    use grida::cg::prelude::*;

    if !is_path_reducible(node) {
        return None;
    }
    // The shape builder reads these kinds' own schema dimensions; the
    // bounds parameter matters only for auto-sized kinds (Container).
    let (w, h) = document::node_size(node).unwrap_or((0.0, 0.0));
    let bounds = math2::Rectangle {
        x: 0.0,
        y: 0.0,
        width: w,
        height: h,
    };
    let path = grida::painter::geometry::build_shape(node, &bounds).to_path();
    // The path converter emits the implicit close-point as its own
    // vertex; normalization merges it onto the subpath start (the
    // same normalizer the mode's exit runs).
    let network =
        crate::vector::ops::optimize(&grida::vectornetwork::VectorNetwork::from(&path), 0.0);

    // Style survives; the outline (corner radius, arc parameters,
    // point counts) is baked into the network.
    struct Style {
        effects: grida::node::schema::LayerEffects,
        mask: Option<LayerMaskType>,
        fills: Paints,
        strokes: Paints,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_cap: StrokeCap,
        stroke_join: StrokeJoin,
        stroke_miter_limit: StrokeMiterLimit,
        stroke_dash_array: Option<StrokeDashArray>,
        marker_start_shape: StrokeMarkerPreset,
        marker_end_shape: StrokeMarkerPreset,
    }
    let from_stroke_style =
        |effects: &grida::node::schema::LayerEffects,
         mask: &Option<LayerMaskType>,
         fills: &Paints,
         strokes: &Paints,
         width: f32,
         style: &grida::node::schema::StrokeStyle| Style {
            effects: effects.clone(),
            mask: *mask,
            fills: fills.clone(),
            strokes: strokes.clone(),
            stroke_width: width,
            stroke_align: style.stroke_align,
            stroke_cap: style.stroke_cap,
            stroke_join: style.stroke_join,
            stroke_miter_limit: style.stroke_miter_limit,
            stroke_dash_array: style.stroke_dash_array.clone(),
            marker_start_shape: StrokeMarkerPreset::default(),
            marker_end_shape: StrokeMarkerPreset::default(),
        };
    let style = match node {
        Node::Rectangle(n) => {
            // Per-side widths flatten to a uniform width (the top
            // side); the network model has one stroke width.
            let width = match &n.stroke_width {
                StrokeWidth::None => 0.0,
                StrokeWidth::Uniform(w) => *w,
                StrokeWidth::Rectangular(r) => r.stroke_top_width,
            };
            from_stroke_style(
                &n.effects,
                &n.mask,
                &n.fills,
                &n.strokes,
                width,
                &n.stroke_style,
            )
        }
        Node::Ellipse(n) => from_stroke_style(
            &n.effects,
            &n.mask,
            &n.fills,
            &n.strokes,
            n.stroke_width.value_or_zero(),
            &n.stroke_style,
        ),
        Node::Polygon(n) => from_stroke_style(
            &n.effects,
            &n.mask,
            &n.fills,
            &n.strokes,
            n.stroke_width.value_or_zero(),
            &n.stroke_style,
        ),
        Node::RegularPolygon(n) => from_stroke_style(
            &n.effects,
            &n.mask,
            &n.fills,
            &n.strokes,
            n.stroke_width.value_or_zero(),
            &n.stroke_style,
        ),
        Node::RegularStarPolygon(n) => from_stroke_style(
            &n.effects,
            &n.mask,
            &n.fills,
            &n.strokes,
            n.stroke_width.value_or_zero(),
            &n.stroke_style,
        ),
        Node::Line(n) => Style {
            effects: n.effects.clone(),
            mask: n.mask,
            fills: Paints::default(),
            strokes: n.strokes.clone(),
            stroke_width: n.stroke_width,
            stroke_align: n._data_stroke_align,
            stroke_cap: n.stroke_cap,
            stroke_join: StrokeJoin::default(),
            stroke_miter_limit: n.stroke_miter_limit,
            stroke_dash_array: n.stroke_dash_array.clone(),
            marker_start_shape: n.marker_start_shape,
            marker_end_shape: n.marker_end_shape,
        },
        _ => return None,
    };

    Some(Node::Vector(grida::node::schema::VectorNodeRec {
        active: node.active(),
        opacity: node.opacity(),
        blend_mode: node.blend_mode(),
        mask: style.mask,
        effects: style.effects,
        transform: node_transform(node)?,
        network,
        corner_radius: 0.0,
        fills: style.fills,
        strokes: style.strokes,
        stroke_width: style.stroke_width,
        stroke_width_profile: None,
        stroke_align: style.stroke_align,
        stroke_cap: style.stroke_cap,
        stroke_join: style.stroke_join,
        stroke_miter_limit: style.stroke_miter_limit,
        stroke_dash_array: style.stroke_dash_array,
        marker_start_shape: style.marker_start_shape,
        marker_end_shape: style.marker_end_shape,
        layout_child: None,
    }))
}

fn node_transform(node: &Node) -> Option<math2::transform::AffineTransform> {
    let (x, y) = document::node_position(node)?;
    let rotation = document::node_rotation(node).unwrap_or(0.0);
    Some(math2::transform::AffineTransform::new(x, y, rotation))
}
